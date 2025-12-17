import dotenv from 'dotenv';

dotenv.config();

/**
 * Application Configuration
 */
export const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || 'localhost',

  // Shopify
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SHOPIFY_SCOPES?.split(',') || [
      'write_products',
      'read_products',
    ],
    appUrl: process.env.SHOPIFY_APP_URL,
    apiVersion: process.env.SHOPIFY_API_VERSION || '2024-10',
    rateLimitDelay: parseInt(process.env.SHOPIFY_API_RATE_LIMIT, 10) || 2,
    burstLimit: parseInt(process.env.SHOPIFY_API_BURST_LIMIT, 10) || 40,
  },

  // MongoDB
  mongodb: {
    uri:
      process.env.MONGODB_URI || 'mongodb://localhost:27017/synx-connect',
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB, 10) || 0,
  },

  // Security
  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },
  sessionSecret: process.env.SESSION_SECRET,

  // Queue
  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY, 10) || 5,
    maxRetries: parseInt(process.env.MAX_JOB_RETRIES, 10) || 3,
  },

  // CSV Processing
  csv: {
    maxSizeMB: parseInt(process.env.MAX_CSV_SIZE_MB, 10) || 100,
    tempDir: process.env.TEMP_UPLOAD_DIR || './temp',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

/**
 * Validate required configuration
 */
export function validateConfig() {
  const required = [
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET',
    'SHOPIFY_APP_URL',
    'ENCRYPTION_KEY',
    'SESSION_SECRET',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  if (!config.encryption.key || config.encryption.key.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
}
