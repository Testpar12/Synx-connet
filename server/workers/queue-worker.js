import database from '../config/database.js';
import redisClient from '../config/redis.js';
import feedQueue from './feed-queue.js';
import { config } from '../config/app.js';
import logger from '../utils/logger.js';

// Services
import FtpService from '../services/ftp/ftp-service.js';
import csvParser from '../services/csv/csv-parser.js';
import mappingEngine from '../services/mapping/mapping-engine.js';
import diffEngine from '../services/diff/diff-engine.js';
import shopifySync from '../services/sync/shopify-sync.js';

// Models
import Feed from '../models/Feed.js';
import FtpConnection from '../models/FtpConnection.js';
import Shop from '../models/Shop.js';
import Job from '../models/Job.js';
import JobRow from '../models/JobRow.js';

/**
 * Feed Processing Worker
 * Processes feed sync jobs from the queue
 */
class FeedProcessor {
  /**
   * Process feed job
   * @param {Object} job - Bull job
   */
  async process(job) {
    const { feedId, shopId, type, isPreview, previewRowLimit } = job.data;

    logger.info(`Processing feed job: ${job.id}`, {
      feedId,
      shopId,
      type,
      isPreview,
    });

    let jobRecord = null;
    let ftpService = null;
    let localFilePath = null;

    try {
      // Load feed and shop
      const [feed, shop] = await Promise.all([
        Feed.findById(feedId).populate('ftpConnection'),
        Shop.findById(shopId),
      ]);

      if (!feed) {
        throw new Error(`Feed not found: ${feedId}`);
      }

      if (!shop) {
        throw new Error(`Shop not found: ${shopId}`);
      }

      // Create job record
      jobRecord = new Job({
        feed: feed._id,
        shop: shop._id,
        type,
        isPreview,
        status: 'pending',
        queueJobId: job.id,
        triggeredBy: type === 'manual' ? 'user' : 'scheduler',
      });
      await jobRecord.save();
      await jobRecord.markStarted();

      // Download CSV file
      ftpService = new FtpService();
      const { localPath, checksum, size } = await ftpService.downloadFile(
        feed.ftpConnection,
        feed.file.path
      );
      localFilePath = localPath;

      // Check if file unchanged (if option enabled)
      if (
        feed.options.skipUnchangedFile &&
        feed.lastSync?.fileChecksum === checksum
      ) {
        await jobRecord.markCompleted({
          totalRows: 0,
          processed: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
        });

        logger.info('File unchanged, skipping sync');
        return {
          status: 'skipped',
          reason: 'File unchanged',
        };
      }

      // Update job file info
      jobRecord.file = {
        path: feed.file.path,
        checksum,
        size,
      };
      await jobRecord.save();

      // Parse CSV
      const parseLimit = isPreview ? previewRowLimit || 10 : undefined;
      const parsedData = parseLimit
        ? await csvParser.parseFileWithLimit(localPath, parseLimit, {
          delimiter: feed.file.delimiter,
          encoding: feed.file.encoding,
          hasHeader: feed.file.hasHeader,
        })
        : await csvParser.parseFile(localPath, {
          delimiter: feed.file.delimiter,
          encoding: feed.file.encoding,
          hasHeader: feed.file.hasHeader,
        });

      // Validate CSV structure
      const validation = csvParser.validate(parsedData, [
        feed.matching.column,
      ]);

      if (!validation.valid) {
        throw new Error(`CSV validation failed: ${validation.errors.join(', ')}`);
      }

      // Validate mappings
      const mappingValidation = mappingEngine.validateMappings(
        feed.mappings,
        parsedData.headers
      );

      if (!mappingValidation.valid) {
        throw new Error(
          `Mapping validation failed: ${mappingValidation.errors.join(', ')}`
        );
      }

      // Update job progress
      jobRecord.file.rowCount = parsedData.rows.length;
      jobRecord.progress.total = parsedData.rows.length;
      await jobRecord.save();

      // Process rows
      const results = await this.processRows(
        parsedData.rows,
        feed,
        shop,
        jobRecord,
        isPreview
      );

      // Update job completion
      await jobRecord.markCompleted(results);

      // Update feed last sync (if not preview)
      if (!isPreview) {
        await feed.updateLastSync({
          startedAt: jobRecord.startedAt,
          completedAt: jobRecord.completedAt,
          status: 'success',
          rowsProcessed: results.processed,
          created: results.created,
          updated: results.updated,
          skipped: results.skipped,
          failed: results.failed,
          fileChecksum: checksum,
        });

        // Calculate next run
        if (feed.schedule.enabled) {
          feed.calculateNextRun();
          await feed.save();
        }
      }

      // Cleanup temp file
      if (localFilePath) {
        await ftpService.deleteLocalFile(localFilePath);
      }

      logger.info(`Feed processing completed: ${job.id}`, results);

      return {
        status: 'success',
        results,
      };
    } catch (error) {
      logger.error(`Feed processing failed: ${job.id}`, error);

      if (jobRecord) {
        await jobRecord.markFailed(error);
      }

      // Cleanup temp file
      if (localFilePath && ftpService) {
        await ftpService.deleteLocalFile(localFilePath);
      }

      throw error;
    }
  }

  /**
   * Process CSV rows
   */
  async processRows(rows, feed, shop, jobRecord, isPreview) {
    const results = {
      totalRows: rows.length,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };

    const batchSize = feed.options.batchSize || 100;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;

      try {
        // Apply filters
        if (!mappingEngine.applyFilters(row, feed.filters)) {
          results.skipped++;
          await this.logRow(jobRecord, rowNumber, row, 'skip', {
            reason: 'Filtered out',
          });
          continue;
        }

        // Transform row to product data
        const productData = mappingEngine.transformRow(
          row,
          feed.mappings,
          feed.matching
        );

        if (!productData.identifier.value) {
          results.failed++;
          await this.logRow(jobRecord, rowNumber, row, 'error', {
            error: 'Missing identifier value',
          });
          continue;
        }

        if (isPreview) {
          // Preview mode - simulate sync
          const existingProduct = await shopifySync.findProduct(
            shop,
            productData.identifier
          );

          if (existingProduct) {
            const changes = diffEngine.compareProduct(
              existingProduct,
              productData,
              feed.mappings
            );

            if (changes.length > 0) {
              results.updated++;
              await this.logRow(jobRecord, rowNumber, row, 'update', {
                changes,
                productId: existingProduct.id,
              });
            } else {
              results.skipped++;
              await this.logRow(jobRecord, rowNumber, row, 'skip', {
                reason: 'No changes detected',
                productId: existingProduct.id,
              });
            }
          } else {
            results.created++;
            await this.logRow(jobRecord, rowNumber, row, 'create', {
              previewData: productData,
            });
          }
        } else {
          // Real sync
          const syncResult = await shopifySync.syncProduct(
            shop,
            productData,
            productData.identifier,
            {
              updateExisting: feed.options.updateExisting,
              createNew: feed.options.createNew,
            }
          );

          if (syncResult.operation === 'create') {
            results.created++;
          } else if (syncResult.operation === 'update') {
            results.updated++;
          } else if (syncResult.operation === 'skip') {
            results.skipped++;
          }

          await this.logRow(jobRecord, rowNumber, row, syncResult.operation, {
            productId: syncResult.product?.id,
            changes: syncResult.changes,
          });

          // Rate limiting
          await shopifySync.rateLimit();
        }

        // Check for cancellation every row to be responsive
        const currentJob = await Job.findById(jobRecord._id);
        if (!currentJob || currentJob.status === 'cancelled') {
          logger.info(`Job ${jobRecord._id} was cancelled by user. Stopping worker.`);
          return {
            status: 'cancelled',
            results: { ...results, status: 'cancelled' }
          };
        }

        results.processed++;

        // Update progress frequently (every 5 rows or every row if total is small)
        // With 1397 rows, every 5 rows is fine, but to solve the "0 progress" issue we can do every row
        // for the first few, then back off. But for simplicity and responsiveness, let's do every row.
        // It adds DB overhead but ensures "Cancelled" state is caught.
        // Actually, we already queried the DB for cancellation above. We can update progress too.
        await jobRecord.updateProgress(rowNumber, rows.length);
      } catch (error) {
        results.failed++;
        logger.error(`Error processing row ${rowNumber}:`, error);

        await this.logRow(jobRecord, rowNumber, row, 'error', {
          error: error.message,
        });
      }
    }

    // Final progress update
    await jobRecord.updateProgress(rows.length, rows.length);

    return results;
  }

  /**
   * Log individual row processing
   */
  async logRow(jobRecord, rowNumber, rowData, operation, details = {}) {
    const jobRow = new JobRow({
      job: jobRecord._id,
      rowNumber,
      rowData: rowData,
      operation,
      status: operation === 'error' ? 'error' : 'success',
      identifier: details.identifier || {
        value: rowData[Object.keys(rowData)[0]],
      },
      shopifyProductId: details.productId,
      changes: details.changes || [],
      error: details.error
        ? {
          message: details.error,
        }
        : undefined,
    });

    await jobRow.save();
  }
}

/**
 * Initialize worker
 */
async function initWorker() {
  try {
    logger.info('Starting feed worker...');

    // Connect to database and Redis
    await database.connect();
    redisClient.connect();

    const processor = new FeedProcessor();

    // Process jobs
    const queue = feedQueue.getQueue();
    queue.process(config.queue.concurrency, async (job) => {
      return processor.process(job);
    });

    logger.info('Feed worker started successfully');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Worker shutting down...');
      await queue.close();
      await database.disconnect();
      await redisClient.disconnect();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Worker initialization failed:', error);
    process.exit(1);
  }
}

// Start worker if run directly
// Start worker
initWorker();

export default FeedProcessor;
