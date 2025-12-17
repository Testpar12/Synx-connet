import Redis from 'ioredis';
import { config } from './app.js';
import logger from '../utils/logger.js';

/**
 * Redis Connection Manager
 */
class RedisClient {
  constructor() {
    this.client = null;
  }

  /**
   * Connect to Redis
   */
  connect() {
    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        db: config.redis.db,
        retryStrategy(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      });

      this.client.on('connect', () => {
        logger.info('Redis connected successfully');
      });

      this.client.on('error', (err) => {
        logger.error('Redis connection error:', err);
      });

      this.client.on('reconnecting', () => {
        logger.warn('Redis reconnecting...');
      });

      return this.client;
    } catch (error) {
      logger.error('Redis connection failed:', error);
      throw error;
    }
  }

  /**
   * Get Redis client instance
   */
  getClient() {
    if (!this.client) {
      this.connect();
    }
    return this.client;
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      logger.info('Redis disconnected');
    }
  }
}

export default new RedisClient();
