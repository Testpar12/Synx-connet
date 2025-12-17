import Bull from 'bull';
import redisClient from '../config/redis.js';
import { config } from '../config/app.js';
import logger from '../utils/logger.js';

/**
 * Feed Processing Queue
 * Manages feed sync jobs using Bull
 */
class FeedQueue {
  constructor() {
    this.queue = new Bull('feed-processing', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        db: config.redis.db,
      },
      defaultJobOptions: {
        attempts: config.queue.maxRetries,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500, // Keep last 500 failed jobs
      },
    });

    this.setupEventListeners();
  }

  /**
   * Add job to queue
   * @param {Object} data - Job data
   * @returns {Promise<Object>} Bull job
   */
  async addJob(data) {
    const job = await this.queue.add(data, {
      priority: data.type === 'manual' ? 1 : 5, // Manual jobs have higher priority
    });

    logger.info(`Job added to queue: ${job.id}`, {
      feedId: data.feedId,
      type: data.type,
    });

    return job;
  }

  /**
   * Get job by ID
   * @param {string} jobId - Job ID
   * @returns {Promise<Object|null>}
   */
  async getJob(jobId) {
    return this.queue.getJob(jobId);
  }

  /**
   * Remove job from queue
   * @param {string} jobId - Job ID
   */
  async removeJob(jobId) {
    const job = await this.queue.getJob(jobId);
    if (job) {
      // If job is processing, we might want to discard it?
      // remove() removes it from the queue. If it's active, it's removed but the worker process might be running.
      // Bull doesn't strictly kill the process, but we can remove the job record.
      await job.remove();
      return true;
    }
    return false;
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Clean old jobs
   * @param {number} gracePeriod - Grace period in ms (default 7 days)
   */
  async cleanOldJobs(gracePeriod = 7 * 24 * 60 * 60 * 1000) {
    await this.queue.clean(gracePeriod, 'completed');
    await this.queue.clean(gracePeriod, 'failed');
    logger.info('Old jobs cleaned from queue');
  }

  /**
   * Pause queue
   */
  async pause() {
    await this.queue.pause();
    logger.info('Queue paused');
  }

  /**
   * Resume queue
   */
  async resume() {
    await this.queue.resume();
    logger.info('Queue resumed');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    this.queue.on('error', (error) => {
      logger.error('Queue error:', error);
    });

    this.queue.on('waiting', (jobId) => {
      logger.debug(`Job waiting: ${jobId}`);
    });

    this.queue.on('active', (job) => {
      logger.info(`Job started: ${job.id}`, {
        feedId: job.data.feedId,
        type: job.data.type,
      });
    });

    this.queue.on('completed', (job, result) => {
      logger.info(`Job completed: ${job.id}`, {
        feedId: job.data.feedId,
        results: result,
      });
    });

    this.queue.on('failed', (job, error) => {
      logger.error(`Job failed: ${job.id}`, {
        feedId: job.data.feedId,
        error: error.message,
      });
    });

    this.queue.on('stalled', (job) => {
      logger.warn(`Job stalled: ${job.id}`, {
        feedId: job.data.feedId,
      });
    });
  }

  /**
   * Get queue instance
   */
  getQueue() {
    return this.queue;
  }

  /**
   * Close queue
   */
  async close() {
    await this.queue.close();
    logger.info('Queue closed');
  }
}

export default new FeedQueue();
