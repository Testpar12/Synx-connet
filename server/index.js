import App from './app.js';
import logger from './utils/logger.js';

/**
 * Server entry point
 */
const app = new App();

app.start().catch((error) => {
  logger.error('Failed to start server:', error);
});
