import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { config, validateConfig } from './config/app.js';
import database from './config/database.js';
import redisClient from './config/redis.js';
import logger from './utils/logger.js';
import shopifyAuth from './middleware/shopify-auth.js';

// Import routes
import authRoutes from './routes/auth.js';
import feedRoutes from './routes/feeds.js';
import ftpRoutes from './routes/ftp-connections.js';
import jobRoutes from './routes/jobs.js';
import shopRoutes from './routes/shops.js';
import shopifyFieldsRoutes from './routes/shopify-fields.js';

/**
 * Main Express Application
 */
class App {
  constructor() {
    this.app = express();
    this.port = config.port;
  }

  /**
   * Initialize application
   */
  async initialize() {
    try {
      // Validate configuration
      validateConfig();

      // Connect to databases
      await database.connect();
      redisClient.connect();

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup error handling
      this.setupErrorHandling();

      logger.info('Application initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      throw error;
    }
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Security headers
    this.app.use(
      helmet({
        contentSecurityPolicy: false,
        frameguard: false,
      })
    );

    // CORS
    this.app.use(
      cors({
        origin: config.shopify.appUrl,
        credentials: true,
      })
    );

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    if (config.env === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(
        morgan('combined', {
          stream: {
            write: (message) => logger.info(message.trim()),
          },
        })
      );
    }

    // Serve static files from client build
    if (config.env === 'production') {
      this.app.use(express.static('client/dist'));
    }
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: database.isConnected(),
        redis: redisClient.getClient().status === 'ready',
      });
    });

    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/feeds', shopifyAuth, feedRoutes);
    this.app.use('/api/ftp-connections', shopifyAuth, ftpRoutes);
    this.app.use('/api/jobs', shopifyAuth, jobRoutes);
    this.app.use('/api/shops', shopifyAuth, shopRoutes);
    this.app.use('/api/shopify-fields', shopifyAuth, shopifyFieldsRoutes);

    // Serve React app for all other routes (in production)
    if (config.env === 'production') {
      this.app.get('*', (req, res) => {
        res.sendFile('index.html', { root: 'client/dist' });
      });
    }
  }

  /**
   * Setup error handling middleware
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.url}`,
      });
    });

    // Global error handler
    this.app.use((err, req, res, next) => {
      logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
      });

      const statusCode = err.statusCode || 500;
      const message =
        config.env === 'production' ? 'Internal Server Error' : err.message;

      res.status(statusCode).json({
        error: message,
        ...(config.env === 'development' && { stack: err.stack }),
      });
    });
  }

  /**
   * Start the server
   */
  async start() {
    await this.initialize();

    this.server = this.app.listen(this.port, () => {
      logger.info(`Server running on port ${this.port} in ${config.env} mode`);
      logger.info(`App URL: ${config.shopify.appUrl}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Shutting down gracefully...');

    if (this.server) {
      this.server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await database.disconnect();
          await redisClient.disconnect();
          logger.info('Database connections closed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    }

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forcing shutdown...');
      process.exit(1);
    }, 10000);
  }
}

export default App;
