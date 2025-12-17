import express from 'express';
import shopify from '../config/shopify.js';
import Shop from '../models/Shop.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * OAuth - Begin installation
 * Redirects merchant to Shopify OAuth consent screen
 */
router.get('/install', async (req, res) => {
  try {
    const { shop } = req.query;

    if (!shop) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Shop parameter is required',
      });
    }

    // Validate shop domain format
    const shopDomain = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!shopDomain.endsWith('.myshopify.com')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid shop domain',
      });
    }

    // Generate OAuth authorization URL
    const authRoute = await shopify.auth.begin({
      shop: shopDomain,
      callbackPath: '/api/auth/callback',
      isOnline: false, // Offline access token
      rawRequest: req,
      rawResponse: res,
    });

    logger.info(`OAuth initiated for shop: ${shopDomain}`);
  } catch (error) {
    logger.error('OAuth initiation error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to initiate OAuth',
    });
  }
});

/**
 * OAuth - Callback
 * Handles OAuth callback and stores access token
 */
router.get('/callback', async (req, res) => {
  try {
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const { session } = callback;

    if (!session) {
      throw new Error('No session returned from OAuth callback');
    }

    logger.info(`Received OAuth callback for shop: ${session.shop}`);

    // Get shop info from Shopify
    const client = new shopify.clients.Rest({ session });
    const shopInfo = await client.get({ path: 'shop' });

    logger.info(`Fetched shop info from Shopify for: ${session.shop}`);

    // Save or update shop in database
    try {
      const shop = await Shop.findOneAndUpdate(
        { domain: session.shop },
        {
          domain: session.shop,
          name: shopInfo.body.shop.name,
          email: shopInfo.body.shop.email,
          accessToken: session.accessToken,
          scopes: session.scope.split(','),
          plan: shopInfo.body.shop.plan_name,
          currency: shopInfo.body.shop.currency,
          timezone: shopInfo.body.shop.timezone,
          isActive: true,
          installedAt: new Date(),
          subscription: {
            status: 'trial',
            plan: 'free',
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );
      logger.info(`✅ Successfully saved shop to DB: ${session.shop}, ID: ${shop._id}`);
    } catch (dbError) {
      logger.error(`❌ CRITICAL DB ERROR saving shop: ${dbError.message}`, dbError);
      throw dbError;
    }

    logger.info(`Shop authenticated successfully: ${session.shop}`);

    // Redirect to app home
    const redirectUrl = `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

/**
 * Verify session
 * Checks if current session is valid
 */
router.get('/verify', async (req, res) => {
  try {
    const { shop } = req.query;

    if (!shop) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Shop parameter is required',
      });
    }

    const shopRecord = await Shop.findOne({ domain: shop, isActive: true });

    if (!shopRecord || !shopRecord.accessToken) {
      return res.status(401).json({
        authenticated: false,
        message: 'Shop not authenticated',
      });
    }

    res.json({
      authenticated: true,
      shop: {
        domain: shopRecord.domain,
        name: shopRecord.name,
        plan: shopRecord.subscription.plan,
      },
    });
  } catch (error) {
    logger.error('Session verification error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify session',
    });
  }
});

/**
 * Uninstall webhook
 * Handles app uninstallation
 */
router.post('/uninstall', async (req, res) => {
  try {
    const { shop } = req.body;

    if (!shop) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Shop parameter is required',
      });
    }

    await Shop.findOneAndUpdate(
      { domain: shop },
      {
        isActive: false,
        subscription: {
          status: 'cancelled',
        },
      }
    );

    logger.info(`Shop uninstalled: ${shop}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Uninstall webhook error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process uninstall',
    });
  }
});

/**
 * Get public config
 * Returns public configuration for frontend
 */
router.get('/config', (req, res) => {
  res.json({
    apiKey: process.env.SHOPIFY_API_KEY,
  });
});

export default router;
