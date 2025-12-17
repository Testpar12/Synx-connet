import Shop from '../models/Shop.js';
import logger from '../utils/logger.js';

/**
 * Shopify authentication middleware
 * Validates session and loads shop data
 */
const shopifyAuth = async (req, res, next) => {
  try {
    // Development mode bypass
    if (process.env.NODE_ENV === 'development') {
      const devShopDomain = 'develops-test-store.myshopify.com';

      // Extract shop from query or use dev shop
      const shopDomain =
        req.query.shop ||
        req.headers['x-shopify-shop-domain'] ||
        req.session?.shop ||
        devShopDomain;

      // Find or create dev shop
      let shop = await Shop.findOne({ domain: shopDomain });

      if (!shop) {
        // Create dev shop if it doesn't exist
        shop = await Shop.create({
          domain: shopDomain,
          name: 'Development Shop',
          email: 'dev@example.com',
          accessToken: 'dev_access_token_for_local_testing',
          scopes: ['write_products', 'read_products'],
          plan: 'development',
          currency: 'USD',
          timezone: 'America/New_York',
          isActive: true,
          installedAt: new Date(),
          subscription: {
            status: 'active',
            plan: 'free',
            trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          },
        });
        logger.info(`Created development shop: ${shopDomain}`);
      }

      // Attach shop to request
      req.shop = shop;
      req.shopDomain = shopDomain;

      return next();
    }

    // Production mode - normal authentication flow
    // Extract shop from query or headers
    const shopDomain =
      req.query.shop ||
      req.headers['x-shopify-shop-domain'] ||
      req.session?.shop;

    if (!shopDomain) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Shop domain not provided',
      });
    }

    // Find shop in database
    const shop = await Shop.findOne({ domain: shopDomain, isActive: true });

    if (!shop) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Shop not found or inactive',
      });
    }

    // Check if access token exists
    if (!shop.accessToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Shop not authenticated',
      });
    }

    // Attach shop to request
    req.shop = shop;
    req.shopDomain = shopDomain;

    next();
  } catch (error) {
    logger.error('Shopify auth middleware error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
};

export default shopifyAuth;
