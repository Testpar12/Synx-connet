import express from 'express';
import Job from '../models/Job.js';
import JobRow from '../models/JobRow.js';
import feedQueue from '../workers/feed-queue.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/jobs
 * List all jobs for current shop
 */
router.get('/', async (req, res) => {
  try {
    const { feedId, status, type, page = 1, limit = 20 } = req.query;

    const query = {
      shop: req.shop._id,
    };

    if (feedId) query.feed = feedId;
    if (status) query.status = status;
    if (type) query.type = type;

    const jobs = await Job.find(query)
      .populate('feed', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Job.countDocuments(query);

    res.json({
      jobs,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    logger.error('Error fetching jobs:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch jobs',
    });
  }
});

/**
 * GET /api/jobs/:id
 * Get single job details
 */
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      shop: req.shop._id,
    }).populate('feed');

    if (!job) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Job not found',
      });
    }

    res.json({ job });
  } catch (error) {
    logger.error('Error fetching job:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch job',
    });
  }
});

/**
 * GET /api/jobs/:id/rows
 * Get job row-level logs
 */
router.get('/:id/rows', async (req, res) => {
  try {
    const { operation, status, page = 1, limit = 50 } = req.query;

    // Verify job belongs to this shop
    const job = await Job.findOne({
      _id: req.params.id,
      shop: req.shop._id,
    });

    if (!job) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Job not found',
      });
    }

    const query = { job: job._id };
    if (operation) query.operation = operation;
    if (status) query.status = status;

    const rows = await JobRow.find(query)
      .sort({ rowNumber: 1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await JobRow.countDocuments(query);

    res.json({
      rows,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    logger.error('Error fetching job rows:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch job rows',
    });
  }
});

/**
 * GET /api/jobs/:id/stats
 * Get job statistics summary
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      shop: req.shop._id,
    });

    if (!job) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Job not found',
      });
    }

    // Aggregate row statistics
    const stats = await JobRow.aggregate([
      { $match: { job: job._id } },
      {
        $group: {
          _id: null,
          totalRows: { $sum: 1 },
          created: {
            $sum: { $cond: [{ $eq: ['$operation', 'create'] }, 1, 0] },
          },
          updated: {
            $sum: { $cond: [{ $eq: ['$operation', 'update'] }, 1, 0] },
          },
          skipped: {
            $sum: { $cond: [{ $eq: ['$operation', 'skip'] }, 1, 0] },
          },
          errors: {
            $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] },
          },
          warnings: {
            $sum: { $cond: [{ $eq: ['$status', 'warning'] }, 1, 0] },
          },
          avgProcessingTime: { $avg: '$processingTime' },
        },
      },
    ]);

    res.json({
      job: {
        id: job._id,
        status: job.status,
        results: job.results,
        duration: job.duration,
      },
      rowStats: stats[0] || {},
    });
  } catch (error) {
    logger.error('Error fetching job stats:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch job stats',
    });
  }
});

/**
 * POST /api/jobs/:id/cancel
 * Cancel a running job
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      shop: req.shop._id,
    });

    if (!job) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Job not found',
      });
    }

    if (!['pending', 'processing'].includes(job.status)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Job cannot be cancelled in current status',
      });
    }

    job.status = 'cancelled';
    job.completedAt = new Date();
    job.duration = job.completedAt - job.startedAt;
    await job.save();

    // Cancel the Bull queue job if exists
    if (job.queueJobId) {
      try {
        await feedQueue.removeJob(job.queueJobId);
      } catch (err) {
        logger.warn(`Failed to remove job from queue: ${job.queueJobId}`, err);
      }
    }

    logger.info(`Job cancelled: ${job._id}`);
    res.json({ success: true, job });
  } catch (error) {
    logger.error('Error cancelling job:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to cancel job',
    });
  }
});

/**
 * DELETE /api/jobs/:id
 * Delete job and its rows
 */
router.delete('/:id', async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      shop: req.shop._id,
    });

    if (!job) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Job not found',
      });
    }

    // Delete job rows
    await JobRow.deleteMany({ job: job._id });

    // Delete job
    await job.deleteOne();

    logger.info(`Job deleted: ${job._id}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting job:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete job',
    });
  }
});

export default router;
