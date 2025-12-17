import express from 'express';
import Shop from '../models/Shop.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/shops/current
 * Get current shop information
 */
router.get('/current', async (req, res) => {
  try {
    const shop = await Shop.findById(req.shop._id).select('-accessToken');

    if (!shop) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Shop not found',
      });
    }

    res.json({ shop });
  } catch (error) {
    logger.error('Error fetching shop:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch shop',
    });
  }
});

/**
 * PATCH /api/shops/current/settings
 * Update shop settings
 */
router.patch('/current/settings', async (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Settings object required',
      });
    }

    const shop = await Shop.findById(req.shop._id);

    if (!shop) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Shop not found',
      });
    }

    // Update settings
    shop.settings = {
      ...shop.settings,
      ...settings,
    };

    await shop.save();

    logger.info(`Shop settings updated: ${shop._id}`);
    res.json({ shop: shop.toObject({ virtuals: false }) });
  } catch (error) {
    logger.error('Error updating shop settings:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update settings',
    });
  }
});

/**
 * GET /api/shops/current/stats
 * Get shop statistics
 */
router.get('/current/stats', async (req, res) => {
  try {
    const Feed = (await import('../models/Feed.js')).default;
    const Job = (await import('../models/Job.js')).default;

    const [
      totalFeeds,
      activeFeeds,
      totalJobs,
      successfulJobs,
      failedJobs,
      lastJob,
    ] = await Promise.all([
      Feed.countDocuments({ shop: req.shop._id, isActive: true }),
      Feed.countDocuments({ shop: req.shop._id, status: 'active', isActive: true }),
      Job.countDocuments({ shop: req.shop._id }),
      Job.countDocuments({ shop: req.shop._id, status: 'completed' }),
      Job.countDocuments({ shop: req.shop._id, status: 'failed' }),
      Job.findOne({ shop: req.shop._id })
        .sort({ createdAt: -1 })
        .select('status createdAt results'),
    ]);

    res.json({
      stats: {
        feeds: {
          total: totalFeeds,
          active: activeFeeds,
        },
        jobs: {
          total: totalJobs,
          successful: successfulJobs,
          failed: failedJobs,
          successRate:
            totalJobs > 0
              ? Math.round((successfulJobs / totalJobs) * 100)
              : 0,
        },
        lastJob: lastJob || null,
        subscription: req.shop.subscription,
      },
    });
  } catch (error) {
    logger.error('Error fetching shop stats:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch stats',
    });
  }
});

export default router;
