import cron from 'node-cron';
import database from '../config/database.js';
import redisClient from '../config/redis.js';
import feedQueue from './feed-queue.js';
import Feed from '../models/Feed.js';
import logger from '../utils/logger.js';

/**
 * Feed Scheduler
 * Manages scheduled feed syncs using cron
 */
class FeedScheduler {
  constructor() {
    this.tasks = new Map();
    this.checkInterval = null;
  }

  /**
   * Start scheduler
   */
  async start() {
    logger.info('Starting feed scheduler...');

    // Check for due feeds every minute
    this.checkInterval = setInterval(
      () => this.checkDueFeeds(),
      60 * 1000
    );

    // Initial check
    await this.checkDueFeeds();

    logger.info('Feed scheduler started');
  }

  /**
   * Check for feeds that are due to run
   */
  async checkDueFeeds() {
    try {
      const now = new Date();

      // Find all active feeds with scheduling enabled that are due
      const dueFeeds = await Feed.find({
        isActive: true,
        status: 'active',
        'schedule.enabled': true,
        $or: [
          { nextRunAt: { $lte: now } },
          { nextRunAt: null },
        ],
      }).populate('shop');

      logger.debug(`Found ${dueFeeds.length} due feeds`);

      for (const feed of dueFeeds) {
        await this.triggerFeed(feed);
      }
    } catch (error) {
      logger.error('Error checking due feeds:', error);
    }
  }

  /**
   * Trigger scheduled feed sync
   */
  async triggerFeed(feed) {
    try {
      logger.info(`Triggering scheduled feed: ${feed._id}`, {
        name: feed.name,
        frequency: feed.schedule.frequency,
      });

      // Add job to queue
      await feedQueue.addJob({
        feedId: feed._id.toString(),
        shopId: feed.shop._id.toString(),
        type: 'scheduled',
        isPreview: false,
      });

      // Calculate and update next run time
      feed.calculateNextRun();
      await feed.save();

      logger.info(`Next run scheduled for ${feed.name}: ${feed.nextRunAt}`);
    } catch (error) {
      logger.error(`Error triggering feed ${feed._id}:`, error);
    }
  }

  /**
   * Stop scheduler
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all cron tasks
    this.tasks.forEach((task) => task.stop());
    this.tasks.clear();

    logger.info('Feed scheduler stopped');
  }

  /**
   * Reschedule specific feed (if using cron-based approach)
   */
  async rescheduleFeed(feedId) {
    try {
      const feed = await Feed.findById(feedId);

      if (!feed || !feed.schedule.enabled) {
        // Remove existing task if present
        if (this.tasks.has(feedId)) {
          this.tasks.get(feedId).stop();
          this.tasks.delete(feedId);
        }
        return;
      }

      // Stop existing task if any
      if (this.tasks.has(feedId)) {
        this.tasks.get(feedId).stop();
      }

      // Create new cron task for custom cron expressions
      if (feed.schedule.frequency === 'custom' && feed.schedule.customCron) {
        const task = cron.schedule(
          feed.schedule.customCron,
          async () => {
            await this.triggerFeed(feed);
          },
          {
            timezone: feed.schedule.timezone || 'UTC',
          }
        );

        this.tasks.set(feedId, task);
        logger.info(`Custom cron scheduled for feed: ${feedId}`);
      }
    } catch (error) {
      logger.error(`Error rescheduling feed ${feedId}:`, error);
    }
  }
}

/**
 * Initialize scheduler
 */
async function initScheduler() {
  try {
    logger.info('Initializing feed scheduler...');

    // Connect to database and Redis
    await database.connect();
    redisClient.connect();

    const scheduler = new FeedScheduler();
    await scheduler.start();

    logger.info('Feed scheduler initialized successfully');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Scheduler shutting down...');
      scheduler.stop();
      await database.disconnect();
      await redisClient.disconnect();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('Scheduler shutting down...');
      scheduler.stop();
      await database.disconnect();
      await redisClient.disconnect();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Scheduler initialization failed:', error);
    process.exit(1);
  }
}

// Start scheduler if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initScheduler();
}

export default FeedScheduler;
