import express from 'express';
import Joi from 'joi';
import validate from '../middleware/validate.js';
import FtpConnection from '../models/FtpConnection.js';
import FtpService from '../services/ftp/ftp-service.js';
import encryption from '../utils/encryption.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Validation schemas
 */
const createConnectionSchema = Joi.object({
  name: Joi.string().required().trim().min(1).max(100),
  protocol: Joi.string().valid('ftp', 'ftps', 'sftp').required(),
  host: Joi.string().required().trim(),
  port: Joi.number().integer().min(1).max(65535).required(),
  username: Joi.string().required().trim(),
  password: Joi.string().allow('').optional(),
  privateKey: Joi.string().allow('').optional(),
  passphrase: Joi.string().allow('').optional(),
  rootPath: Joi.string().default('/').trim(),
  options: Joi.object({
    passive: Joi.boolean().default(true),
    timeout: Joi.number().integer().min(1000).default(30000),
  }).optional(),
});

const updateConnectionSchema = createConnectionSchema.keys({
  name: Joi.string().optional(),
  protocol: Joi.string().optional(),
  host: Joi.string().optional(),
  port: Joi.number().optional(),
  username: Joi.string().optional(),
});

/**
 * GET /api/ftp-connections
 * List all FTP connections for current shop
 */
router.get('/', async (req, res) => {
  try {
    const connections = await FtpConnection.find({
      shop: req.shop._id,
      isActive: true,
    }).select('-password -privateKey -passphrase');

    res.json({
      connections,
      total: connections.length,
    });
  } catch (error) {
    logger.error('Error fetching FTP connections:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch connections',
    });
  }
});

/**
 * GET /api/ftp-connections/:id
 * Get single FTP connection
 */
router.get('/:id', async (req, res) => {
  try {
    const connection = await FtpConnection.findOne({
      _id: req.params.id,
      shop: req.shop._id,
      isActive: true,
    }).select('-password -privateKey -passphrase');

    if (!connection) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'FTP connection not found',
      });
    }

    res.json({ connection });
  } catch (error) {
    logger.error('Error fetching FTP connection:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch connection',
    });
  }
});

/**
 * POST /api/ftp-connections
 * Create new FTP connection
 */
router.post('/', validate(createConnectionSchema), async (req, res) => {
  try {
    const connectionData = {
      ...req.body,
      shop: req.shop._id,
    };

    // Encrypt sensitive fields
    if (connectionData.password) {
      connectionData.password = encryption.encrypt(connectionData.password);
    }
    if (connectionData.privateKey) {
      connectionData.privateKey = encryption.encrypt(connectionData.privateKey);
    }
    if (connectionData.passphrase) {
      connectionData.passphrase = encryption.encrypt(connectionData.passphrase);
    }

    const connection = new FtpConnection(connectionData);
    await connection.save();

    logger.info(`FTP connection created: ${connection._id}`);

    // Return without sensitive data
    const safeConnection = connection.toObject();
    delete safeConnection.password;
    delete safeConnection.privateKey;
    delete safeConnection.passphrase;

    res.status(201).json({ connection: safeConnection });
  } catch (error) {
    logger.error('Error creating FTP connection:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create connection',
    });
  }
});

/**
 * PUT /api/ftp-connections/:id
 * Update FTP connection
 */
router.put('/:id', validate(updateConnectionSchema), async (req, res) => {
  try {
    const connection = await FtpConnection.findOne({
      _id: req.params.id,
      shop: req.shop._id,
      isActive: true,
    });

    if (!connection) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'FTP connection not found',
      });
    }

    // Update fields
    Object.keys(req.body).forEach((key) => {
      if (key === 'password' || key === 'privateKey' || key === 'passphrase') {
        if (req.body[key]) {
          connection[key] = encryption.encrypt(req.body[key]);
        }
      } else {
        connection[key] = req.body[key];
      }
    });

    await connection.save();

    logger.info(`FTP connection updated: ${connection._id}`);

    // Return without sensitive data
    const safeConnection = connection.toObject();
    delete safeConnection.password;
    delete safeConnection.privateKey;
    delete safeConnection.passphrase;

    res.json({ connection: safeConnection });
  } catch (error) {
    logger.error('Error updating FTP connection:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update connection',
    });
  }
});

/**
 * DELETE /api/ftp-connections/:id
 * Delete FTP connection (soft delete)
 */
router.delete('/:id', async (req, res) => {
  try {
    const connection = await FtpConnection.findOne({
      _id: req.params.id,
      shop: req.shop._id,
      isActive: true,
    });

    if (!connection) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'FTP connection not found',
      });
    }

    connection.isActive = false;
    await connection.save();

    logger.info(`FTP connection deleted: ${connection._id}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting FTP connection:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete connection',
    });
  }
});

/**
 * POST /api/ftp-connections/:id/test
 * Test FTP connection
 */
router.post('/:id/test', async (req, res) => {
  try {
    const connection = await FtpConnection.findOne({
      _id: req.params.id,
      shop: req.shop._id,
      isActive: true,
    });

    if (!connection) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'FTP connection not found',
      });
    }

    const ftpService = new FtpService();
    const result = await ftpService.testConnection(connection);

    // Update connection status
    await connection.updateTestResult(result.success, result.error);

    res.json(result);
  } catch (error) {
    logger.error('Error testing FTP connection:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to test connection',
    });
  }
});

/**
 * GET /api/ftp-connections/:id/files
 * List files in FTP directory
 */
router.get('/:id/files', async (req, res) => {
  try {
    const { path = '/' } = req.query;

    const connection = await FtpConnection.findOne({
      _id: req.params.id,
      shop: req.shop._id,
      isActive: true,
    });

    if (!connection) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'FTP connection not found',
      });
    }

    const ftpService = new FtpService();
    const files = await ftpService.listFiles(connection, path);

    res.json({ files });
  } catch (error) {
    logger.error('Error listing FTP files:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list files',
    });
  }
});

export default router;
