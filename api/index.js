/**
 * Vercel Serverless Function Handler
 * This wraps the Express app to work with Vercel's serverless functions
 */
import App from '../server/app.js';

let appInstance = null;
let appExpress = null;
let isInitializing = false;
let initPromise = null;

/**
 * Initialize the app (lazy initialization with singleton pattern)
 */
async function getApp() {
  // If already initialized, return it
  if (appExpress) {
    return appExpress;
  }

  // If currently initializing, wait for that promise
  if (isInitializing && initPromise) {
    await initPromise;
    return appExpress;
  }

  // Start initialization
  isInitializing = true;
  initPromise = (async () => {
    try {
      appInstance = new App();
      await appInstance.initialize();
      appExpress = appInstance.app;
      isInitializing = false;
    } catch (error) {
      isInitializing = false;
      console.error('Failed to initialize app:', error);
      throw error;
    }
  })();

  await initPromise;
  return appExpress;
}

/**
 * Vercel serverless function handler
 * Express apps work directly with Vercel's req/res objects
 */
export default async function handler(req, res) {
  try {
    // Get the Express app instance
    const app = await getApp();
    
    // Express app handles the request directly
    app(req, res);
  } catch (error) {
    console.error('Handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  }
}

