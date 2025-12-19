import mongoose from 'mongoose';

/**
 * Feed Schema - Represents a single CSV feed configuration
 */
const feedSchema = new mongoose.Schema(
  {
    // Shop reference
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true,
    },

    // Feed name
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // FTP connection reference
    ftpConnection: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FtpConnection',
      required: true,
    },

    // CSV file configuration
    file: {
      path: {
        type: String,
        required: true,
        trim: true,
      },
      encoding: {
        type: String,
        default: 'utf8',
      },
      delimiter: {
        type: String,
        default: ',',
        enum: [',', ';', '\t', '|'],
      },
      hasHeader: {
        type: Boolean,
        default: true,
      },
    },

    // Matching configuration
    matching: {
      column: {
        type: String,
        required: true,
        trim: true,
      },
      type: {
        type: String,
        enum: ['sku', 'handle'],
        required: true,
        default: 'sku',
      },
    },

    // Field mappings
    mappings: [
      {
        csvColumn: {
          type: String,
          required: true,
        },
        shopifyField: {
          type: String,
          required: true,
        },
        fieldType: {
          type: String,
          enum: ['product', 'variant', 'metafield'],
          required: true,
          default: 'product',
        },
        // For metafields
        metafieldNamespace: String,
        metafieldKey: String,
        metafieldType: {
          type: String,
        },
        // Value Mappings
        valueMap: {
          type: Map,
          of: String,
          default: {},
        },
        // Transformation options
        transform: {
          trim: { type: Boolean, default: true },
          lowercase: { type: Boolean, default: false },
          uppercase: { type: Boolean, default: false },
          defaultValue: String,
          ignoreEmpty: { type: Boolean, default: false },
        },
      },
    ],

    // Filters
    filters: [
      {
        column: {
          type: String,
          required: true,
        },
        operator: {
          type: String,
          enum: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than'],
          required: true,
        },
        value: {
          type: String,
          required: true,
        },
        action: {
          type: String,
          enum: ['include', 'exclude'],
          required: true,
          default: 'include',
        },
      },
    ],

    // Conditional Value Mappings (Step 3)
    // Maps specific CSV values to target metafields
    valueMappings: [
      {
        sourceField: String,           // The Shopify field being checked (e.g., "metafield:custom.color")
        sourceCsvColumn: String,       // The CSV column name
        sourceValue: String,           // The CSV value to match
        targetField: String,           // The target metafield key (e.g., "metafield:custom.color_index")
        targetValue: String,           // The value to write to the target metafield
        // Full target metafield info (for direct writing without lookup)
        targetMetafieldNamespace: String,
        targetMetafieldKey: String,
        targetMetafieldType: { type: String, default: 'single_line_text_field' },
      },
    ],

    // Scheduling
    schedule: {
      enabled: {
        type: Boolean,
        default: false,
      },
      frequency: {
        type: String,
        enum: ['hourly', 'every_6_hours', 'daily', 'weekly', 'custom'],
        default: 'daily',
      },
      time: {
        type: String, // Format: HH:mm
        default: '00:00',
      },
      timezone: {
        type: String,
        default: 'UTC',
      },
      customCron: {
        type: String, // Cron expression for custom frequency
      },
    },

    // Advanced options
    options: {
      skipUnchangedFile: {
        type: Boolean,
        default: true,
      },
      skipUnchangedRows: {
        type: Boolean,
        default: false, // Off by default, user can enable
      },
      createMissingMetafields: {
        type: Boolean,
        default: true,
      },
      updateExisting: {
        type: Boolean,
        default: true,
      },
      createNew: {
        type: Boolean,
        default: true,
      },
      batchSize: {
        type: Number,
        default: 100,
      },
    },

    // Status tracking
    status: {
      type: String,
      enum: ['active', 'paused', 'error', 'draft'],
      default: 'draft',
    },

    // Last sync information
    lastSync: {
      startedAt: Date,
      completedAt: Date,
      status: {
        type: String,
        enum: ['success', 'partial', 'failed'],
      },
      rowsProcessed: Number,
      created: Number,
      updated: Number,
      skipped: Number,
      failed: Number,
      fileChecksum: String,
    },

    // Next scheduled run
    nextRunAt: {
      type: Date,
    },

    // Statistics
    stats: {
      totalRuns: {
        type: Number,
        default: 0,
      },
      successfulRuns: {
        type: Number,
        default: 0,
      },
      failedRuns: {
        type: Number,
        default: 0,
      },
      totalProductsCreated: {
        type: Number,
        default: 0,
      },
      totalProductsUpdated: {
        type: Number,
        default: 0,
      },
    },

    // Active status
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
feedSchema.index({ shop: 1, isActive: 1 });
feedSchema.index({ status: 1 });
feedSchema.index({ nextRunAt: 1 });
feedSchema.index({ 'schedule.enabled': 1 });

// Methods
feedSchema.methods.updateLastSync = function (syncData) {
  this.lastSync = {
    ...this.lastSync,
    ...syncData,
  };

  if (syncData.status === 'success') {
    this.stats.successfulRuns += 1;
  } else if (syncData.status === 'failed') {
    this.stats.failedRuns += 1;
  }

  this.stats.totalRuns += 1;
  this.stats.totalProductsCreated += syncData.created || 0;
  this.stats.totalProductsUpdated += syncData.updated || 0;

  return this.save();
};

feedSchema.methods.calculateNextRun = function () {
  if (!this.schedule.enabled) {
    this.nextRunAt = null;
    return;
  }

  const now = new Date();
  let nextRun = new Date();

  // Helper to adjust for timezone offset
  const adjustForTimezone = (date, timezone) => {
    if (!timezone || timezone === 'UTC') return date;
    try {
      // Get the offset between server time (UTC) and target timezone
      // We use current date to get an approximate offset (ignoring DST future changes for UI simplicity)
      const targetTimeStr = new Date().toLocaleString('en-US', { timeZone: timezone });
      const targetDate = new Date(targetTimeStr);
      const serverDate = new Date();

      // Calculate offset in milliseconds
      // If target is ahead (e.g. +5:30), diff is positive.
      // To schedule "00:00 Target Time" on a UTC server, we need "00:00 - Offset".
      const offset = targetDate - serverDate;

      return new Date(date.getTime() - offset);
    } catch (e) {
      return date;
    }
  };

  switch (this.schedule.frequency) {
    case 'hourly':
      nextRun.setHours(now.getHours() + 1);
      break;
    case 'every_6_hours':
      nextRun.setHours(now.getHours() + 6);
      break;
    case 'daily':
      const [hours, minutes] = this.schedule.time.split(':');
      // Set time in UTC first
      nextRun.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // Adjust back to UTC from Target Timezone
      nextRun = adjustForTimezone(nextRun, this.schedule.timezone);

      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      break;
    case 'weekly':
      nextRun.setDate(now.getDate() + 7);
      break;
    // Custom cron handled by scheduler
  }

  this.nextRunAt = nextRun;
};

export default mongoose.model('Feed', feedSchema);
