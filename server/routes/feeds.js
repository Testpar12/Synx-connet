import express from 'express';
import Joi from 'joi';
import validate from '../middleware/validate.js';
import Feed from '../models/Feed.js';
import Job from '../models/Job.js';
import FtpConnection from '../models/FtpConnection.js';
import feedQueue from '../workers/feed-queue.js';
import FtpService from '../services/ftp/ftp-service.js';
import csvParser from '../services/csv/csv-parser.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Validation schemas
 */
const createFeedSchema = Joi.object({
  name: Joi.string().required().trim().min(1).max(100),
  ftpConnection: Joi.string().required(),
  file: Joi.object({
    path: Joi.string().required(),
    encoding: Joi.string().default('utf8'),
    delimiter: Joi.string().valid(',', ';', '\t', '|').default(','),
    hasHeader: Joi.boolean().default(true),
  }).required(),
  matching: Joi.object({
    column: Joi.string().required(),
    type: Joi.string().valid('sku', 'handle').required(),
  }).required(),
  mappings: Joi.array().items(
    Joi.object({
      csvColumn: Joi.string().required(),
      shopifyField: Joi.string().required(),
      fieldType: Joi.string().valid('product', 'variant', 'metafield').required(),
      metafieldNamespace: Joi.string().when('fieldType', {
        is: 'metafield',
        then: Joi.required(),
      }),
      metafieldKey: Joi.string().when('fieldType', {
        is: 'metafield',
        then: Joi.required(),
      }),
      metafieldType: Joi.string().when('fieldType', {
        is: 'metafield',
        then: Joi.required(),
      }),
      transform: Joi.object({
        trim: Joi.boolean().default(true),
        lowercase: Joi.boolean().default(false),
        uppercase: Joi.boolean().default(false),
        defaultValue: Joi.string().allow(''),
        ignoreEmpty: Joi.boolean().default(false),
      }).optional(),
    })
  ).required(),
  filters: Joi.array().items(
    Joi.object({
      column: Joi.string().required(),
      operator: Joi.string()
        .valid('equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than')
        .required(),
      value: Joi.string().required(),
      action: Joi.string().valid('include', 'exclude').default('include'),
    })
  ).optional(),
  valueMappings: Joi.array().items(
    Joi.object({
      sourceField: Joi.string().required(),
      sourceCsvColumn: Joi.string().required(),
      sourceValue: Joi.string().required(),
      targetField: Joi.string().required(),
      targetValue: Joi.string().allow(''),
      targetMetafieldNamespace: Joi.string().optional(),
      targetMetafieldKey: Joi.string().optional(),
      targetMetafieldType: Joi.string().optional().default('single_line_text_field'),
    })
  ).optional(),
  schedule: Joi.object({
    enabled: Joi.boolean().default(false),
    frequency: Joi.string()
      .valid('hourly', 'every_6_hours', 'daily', 'weekly', 'custom')
      .default('daily'),
    time: Joi.string().pattern(/^\d{2}:\d{2}$/).default('00:00'),
    timezone: Joi.string().default('UTC'),
    customCron: Joi.string().when('frequency', {
      is: 'custom',
      then: Joi.required(),
    }),
  }).optional(),
  options: Joi.object({
    skipUnchangedFile: Joi.boolean().default(true),
    createMissingMetafields: Joi.boolean().default(true),
    updateExisting: Joi.boolean().default(true),
    createNew: Joi.boolean().default(true),
    batchSize: Joi.number().integer().min(1).max(250).default(100),
  }).optional(),
});

/**
 * GET /api/feeds
 * List all feeds for current shop
 */
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = {
      shop: req.shop._id,
      isActive: true,
    };

    if (status) {
      query.status = status;
    }

    const feeds = await Feed.find(query)
      .populate('ftpConnection', 'name host protocol')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Feed.countDocuments(query);

    res.json({
      feeds,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    logger.error('Error fetching feeds:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch feeds',
    });
  }
});

/**
 * GET /api/feeds/:id
 * Get single feed
 */
router.get('/:id', async (req, res) => {
  try {
    const feed = await Feed.findOne({
      _id: req.params.id,
      shop: req.shop._id,
      isActive: true,
    }).populate('ftpConnection');

    if (!feed) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Feed not found',
      });
    }

    res.json({ feed });
  } catch (error) {
    logger.error('Error fetching feed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch feed',
    });
  }
});

/**
 * POST /api/feeds
 * Create new feed
 */
router.post('/', validate(createFeedSchema), async (req, res) => {
  try {
    // Verify FTP connection belongs to this shop
    const ftpConnection = await FtpConnection.findOne({
      _id: req.body.ftpConnection,
      shop: req.shop._id,
      isActive: true,
    });

    if (!ftpConnection) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid FTP connection',
      });
    }

    const feed = new Feed({
      ...req.body,
      shop: req.shop._id,
      status: 'draft',
    });

    // Calculate next run if schedule enabled
    if (feed.schedule?.enabled) {
      feed.calculateNextRun();
      feed.status = 'active';
    }

    await feed.save();

    logger.info(`Feed created: ${feed._id}`);
    res.status(201).json({ feed });
  } catch (error) {
    logger.error('Error creating feed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create feed',
    });
  }
});

/**
 * PUT /api/feeds/:id
 * Update feed
 */
router.put('/:id', validate(createFeedSchema), async (req, res) => {
  try {
    const feed = await Feed.findOne({
      _id: req.params.id,
      shop: req.shop._id,
      isActive: true,
    });

    if (!feed) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Feed not found',
      });
    }

    // Update fields
    Object.assign(feed, req.body);

    // Recalculate next run if schedule changed
    if (feed.schedule?.enabled) {
      feed.calculateNextRun();
      // Auto-activate feed if schedule is enabled
      if (feed.status === 'draft' || feed.status === 'paused') {
        feed.status = 'active';
      }
    } else {
      feed.nextRunAt = null;
      // If manually disabled, set to paused (unless it was draft)
      if (feed.status === 'active') {
        feed.status = 'paused';
      }
    }

    await feed.save();

    logger.info(`Feed updated: ${feed._id}`);
    res.json({ feed });
  } catch (error) {
    logger.error('Error updating feed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update feed',
    });
  }
});

/**
 * DELETE /api/feeds/:id
 * Delete feed (soft delete)
 */
router.delete('/:id', async (req, res) => {
  try {
    const feed = await Feed.findOne({
      _id: req.params.id,
      shop: req.shop._id,
      isActive: true,
    });

    if (!feed) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Feed not found',
      });
    }

    feed.isActive = false;
    feed.status = 'draft';
    feed.schedule.enabled = false;
    await feed.save();

    logger.info(`Feed deleted: ${feed._id}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting feed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete feed',
    });
  }
});

/**
 * POST /api/feeds/:id/process
 * Start manual feed process
 */
router.post('/:id/process', async (req, res) => {
  try {
    const feed = await Feed.findOne({
      _id: req.params.id,
      shop: req.shop._id,
      isActive: true,
    });

    if (!feed) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Feed not found',
      });
    }

    // Check for existing running job to prevent duplicates
    const existingJob = await Job.findOne({
      feed: feed._id,
      status: { $in: ['pending', 'processing'] },
    });

    if (existingJob) {
      return res.status(409).json({
        error: 'Conflict',
        message: `A job is already ${existingJob.status} for this feed. Please wait for it to complete.`,
        existingJobId: existingJob._id,
      });
    }

    // Add job to queue
    const job = await feedQueue.addJob({
      feedId: feed._id.toString(),
      shopId: req.shop._id.toString(),
      type: 'manual',
      isPreview: false,
    });

    logger.info(`Feed process job queued: ${job.id}`);

    res.json({
      success: true,
      jobId: job.id,
      message: 'Feed processing started',
    });
  } catch (error) {
    logger.error('Error processing feed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to start feed processing',
    });
  }
});

/**
 * POST /api/feeds/:id/preview
 * Preview feed sync (first 10 rows, no Shopify updates)
 */
router.post('/:id/preview', async (req, res) => {
  try {
    const feed = await Feed.findOne({
      _id: req.params.id,
      shop: req.shop._id,
      isActive: true,
    });

    if (!feed) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Feed not found',
      });
    }

    // Add preview job to queue
    const job = await feedQueue.addJob({
      feedId: feed._id.toString(),
      shopId: req.shop._id.toString(),
      type: 'preview',
      isPreview: true,
      previewRowLimit: 10,
    });

    logger.info(`Feed preview job queued: ${job.id}`);

    res.json({
      success: true,
      jobId: job.id,
      message: 'Preview started',
    });
  } catch (error) {
    logger.error('Error previewing feed:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to start preview',
    });
  }
});

/**
 * PATCH /api/feeds/:id/status
 * Update feed status (activate/pause)
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!['active', 'paused'].includes(status)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid status. Must be active or paused',
      });
    }

    const feed = await Feed.findOne({
      _id: req.params.id,
      shop: req.shop._id,
      isActive: true,
    });

    if (!feed) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Feed not found',
      });
    }

    feed.status = status;
    await feed.save();

    logger.info(`Feed status updated: ${feed._id} -> ${status}`);
    res.json({ feed });
  } catch (error) {
    logger.error('Error updating feed status:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update feed status',
    });
  }
});

/**
 * POST /api/feeds/preview-csv-headers
 * Preview CSV headers from FTP file (for field mapping wizard)
 */
router.post('/preview-csv-headers', async (req, res) => {
  try {
    const { ftpConnectionId, filePath, delimiter = ',' } = req.body;

    if (!ftpConnectionId || !filePath) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'ftpConnectionId and filePath are required',
      });
    }

    // Find FTP connection
    const ftpConnection = await FtpConnection.findOne({
      _id: ftpConnectionId,
      shop: req.shop._id,
      isActive: true,
    });

    if (!ftpConnection) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'FTP connection not found',
      });
    }

    // Create FTP service instance
    const ftpService = new FtpService();

    // Download CSV file from FTP
    const { localPath } = await ftpService.downloadFile(ftpConnection, filePath);

    try {
      // Parse rows to get headers and sample data
      // Increased to 500 rows to capture more unique values for value mapping in Step 3
      const { headers, rows } = await csvParser.parseFileWithLimit(localPath, 50000, {
        delimiter,
        hasHeader: true,
      });

      // Clean up temp file
      await ftpService.deleteLocalFile(localPath);

      logger.info(`CSV preview parsed: ${rows.length} rows for value mapping`);

      res.json({
        success: true,
        headers,
        sampleRows: rows,
        rowCount: rows.length,
      });
    } catch (parseError) {
      // Clean up temp file on error
      await ftpService.deleteLocalFile(localPath);
      throw parseError;
    }
  } catch (error) {
    logger.error('Error previewing CSV headers:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to preview CSV headers',
    });
  }
});

/**
 * POST /api/feeds/preview-csv-values
 * Preview unique values from a CSV column (for value mapping)
 */
router.post('/preview-csv-values', async (req, res) => {
  try {
    const { ftpConnectionId, filePath, columnName, delimiter = ',' } = req.body;

    if (!ftpConnectionId || !filePath || !columnName) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'ftpConnectionId, filePath, and columnName are required',
      });
    }

    // Find FTP connection
    const ftpConnection = await FtpConnection.findOne({
      _id: ftpConnectionId,
      shop: req.shop._id,
      isActive: true,
    });

    if (!ftpConnection) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'FTP connection not found',
      });
    }

    // Create FTP service instance
    const ftpService = new FtpService();

    // Download CSV file from FTP
    const { localPath } = await ftpService.downloadFile(ftpConnection, filePath);

    try {
      // Parse with a higher limit to capture enough samples, but verify uniqueness
      // We'll read up to 1000 rows to find unique values
      const { rows } = await csvParser.parseFileWithLimit(localPath, 1000, {
        delimiter,
        hasHeader: true,
      });

      // Extract unique values
      const uniqueValues = new Set();
      rows.forEach(row => {
        if (row[columnName]) {
          uniqueValues.add(String(row[columnName]).trim());
        }
      });

      // Clean up temp file
      await ftpService.deleteLocalFile(localPath);

      res.json({
        success: true,
        values: Array.from(uniqueValues).slice(0, 100), // Limit to top 100 unique values
        totalFound: uniqueValues.size,
      });
    } catch (parseError) {
      // Clean up temp file on error
      await ftpService.deleteLocalFile(localPath);
      throw parseError;
    }
  } catch (error) {
    logger.error('Error previewing CSV values:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to preview CSV values',
    });
  }
});

export default router;
