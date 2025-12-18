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
  }

  /**
   * Start scheduler
   */
  async start() {
    logger.info('Starting feed scheduler...');

    // Load and schedule all active feeds
    await this.scheduleAllFeeds();

    // Check for feed updates every minute (active vs inactive, schedule changes)
    this.refreshInterval = setInterval(
      () => this.scheduleAllFeeds(),
      60 * 1000 * 5 // Refresh every 5 minutes to catch unscheduled changes
    );

    logger.info('Feed scheduler started');
  }

  /**
   * Schedule all active feeds
   */
  async scheduleAllFeeds() {
    try {
      const feeds = await Feed.find({
        isActive: true,
        status: 'active',
        'schedule.enabled': true,
      });

      logger.debug(`Found ${feeds.length} active scheduled feeds`);

      const currentFeedIds = new Set(feeds.map(f => f._id.toString()));

      // Remove tasks for feeds that are no longer active/scheduled
      for (const [feedId, task] of this.tasks) {
        if (!currentFeedIds.has(feedId)) {
          task.stop();
          this.tasks.delete(feedId);
          logger.info(`Stopped scheduler for feed: ${feedId}`);
        }
      }

      // Schedule or update tasks
      for (const feed of feeds) {
        await this.rescheduleFeed(feed._id, feed);
      }
    } catch (error) {
      logger.error('Error scheduling feeds:', error);
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

      // Calculate and update next run time (for UI display only)
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
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Clear all cron tasks
    this.tasks.forEach((task) => task.stop());
    this.tasks.clear();

    logger.info('Feed scheduler stopped');
  }

  /**
   * Reschedule specific feed
   */
  async rescheduleFeed(feedId, feedData = null) {
    try {
      const feed = feedData || await Feed.findById(feedId);

      if (!feed || !feed.schedule.enabled) {
        if (this.tasks.has(feedId.toString())) {
          this.tasks.get(feedId.toString()).stop();
          this.tasks.delete(feedId.toString());
        }
        return;
      }

      // Generate cron expression based on frequency
      let cronExpression = null;
      let timezone = feed.schedule.timezone || 'UTC';

      switch (feed.schedule.frequency) {
        case 'hourly':
          cronExpression = '0 * * * *'; // Top of every hour
          break;
        case 'every_6_hours':
          cronExpression = '0 */6 * * *';
          break;
        case 'daily':
          if (feed.schedule.time) {
            const [hours, minutes] = feed.schedule.time.split(':');
            cronExpression = `${parseInt(minutes)} ${parseInt(hours)} * * *`;
          } else {
            cronExpression = '0 0 * * *'; // Default midnight
          }
          break;
        case 'weekly':
          cronExpression = '0 0 * * 0'; // Sunday midnight
          if (feed.schedule.time) {
            const [hours, minutes] = feed.schedule.time.split(':');
            cronExpression = `${parseInt(minutes)} ${parseInt(hours)} * * 0`;
          }
          break;
        case 'custom':
          cronExpression = feed.schedule.customCron;
          break;
      }

      if (!cronExpression) return;

      // Check if task exists and if cron expression changed would be complex, 
      // easiest is to always recreate reliable tasks.
      // But we don't want to stop/start unnecessarily if nothing changed.
      // For now, simpler is robust: recreate.

      if (this.tasks.has(feedId.toString())) {
        this.tasks.get(feedId.toString()).stop();
      }

      // Create new cron task
      const task = cron.schedule(
        cronExpression,
        async () => {
          await this.triggerFeed(feed);
        },
        {
          timezone: timezone,
        }
      );

      this.tasks.set(feedId.toString(), task);
      logger.debug(`Scheduled feed ${feedId} with cron: ${cronExpression} (${timezone})`);

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
