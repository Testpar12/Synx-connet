import cron from 'node-cron';
import database from '../config/database.js';
import redisClient from '../config/redis.js';
import feedQueue from './feed-queue.js';
import Feed from '../models/Feed.js';
import Job from '../models/Job.js';
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

    // Cleanup any stale jobs from previous runs
    await this.cleanupStaleJobs();

    // Load and schedule all active feeds
    await this.scheduleAllFeeds();

    // Check for feed updates every minute (active vs inactive, schedule changes)
    this.refreshInterval = setInterval(
      () => this.scheduleAllFeeds(),
      60 * 1000 // Refresh every 1 minute to catch unscheduled changes
    );

    logger.info('Feed scheduler started');
  }

  /**
   * Cleanup stale jobs that are stuck in "processing" status
   * This can happen if the worker crashes or the server restarts
   * Jobs with progress will be marked as "interrupted" and auto-resumed
   */
  async cleanupStaleJobs() {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

      // Find jobs that have been stuck in "processing" for more than 1 hour
      const staleJobs = await Job.find({
        status: 'processing',
        updatedAt: { $lt: oneHourAgo },
      }).populate('feed');

      if (staleJobs.length > 0) {
        logger.warn(`Found ${staleJobs.length} stale jobs stuck in processing status`);

        for (const job of staleJobs) {
          // If job has made progress, mark as interrupted for resume
          if (job.progress.current > 0) {
            job.status = 'interrupted';
            job.lastProcessedRow = job.progress.current;
            job.error = {
              message: `Job interrupted at row ${job.progress.current}. Will be resumed.`,
              code: 'JOB_INTERRUPTED',
              timestamp: new Date(),
            };
            await job.save();
            logger.info(`Marked job ${job._id} as interrupted at row ${job.progress.current}. Queuing for resume...`);

            // Auto-queue for resume if the feed is still active
            if (job.feed && job.feed.isActive) {
              await feedQueue.addJob({
                feedId: job.feed._id.toString(),
                shopId: job.shop.toString(),
                type: job.type,
                isPreview: job.isPreview,
                resumeJobId: job._id.toString(), // Link to the interrupted job
              });
              logger.info(`Queued resume job for interrupted job ${job._id}`);
            }
          } else {
            // No progress made, mark as failed
            job.status = 'failed';
            job.completedAt = new Date();
            job.error = {
              message: 'Job stalled with no progress and was marked as failed during cleanup',
              code: 'STALE_JOB_CLEANUP',
              timestamp: new Date(),
            };
            await job.save();
            logger.info(`Marked stale job ${job._id} as failed (no progress)`);
          }
        }
      } else {
        logger.info('No stale jobs found during cleanup');
      }
    } catch (error) {
      logger.error('Error cleaning up stale jobs:', error);
    }
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

      // ============================================
      // DUPLICATE JOB PREVENTION
      // Check if there's already a pending or processing job for this feed
      // ============================================
      const existingJob = await Job.findOne({
        feed: feed._id,
        status: { $in: ['pending', 'processing'] },
      });

      if (existingJob) {
        logger.warn(`Skipping scheduled job for feed ${feed._id} - existing job ${existingJob._id} is still ${existingJob.status}`);
        return;
      }

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
