import mongoose from 'mongoose';

/**
 * Job Schema - Tracks individual sync job executions
 */
const jobSchema = new mongoose.Schema(
  {
    // Feed reference
    feed: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Feed',
      required: true,
      index: true,
    },

    // Shop reference
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true,
    },

    // Job type
    type: {
      type: String,
      enum: ['manual', 'scheduled', 'preview'],
      required: true,
      default: 'manual',
    },

    // Job status
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },

    // Execution timing
    startedAt: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },

    duration: {
      type: Number, // Duration in milliseconds
    },

    // File information
    file: {
      path: String,
      checksum: String,
      size: Number,
      rowCount: Number,
    },

    // Processing results
    results: {
      totalRows: {
        type: Number,
        default: 0,
      },
      processed: {
        type: Number,
        default: 0,
      },
      created: {
        type: Number,
        default: 0,
      },
      updated: {
        type: Number,
        default: 0,
      },
      skipped: {
        type: Number,
        default: 0,
      },
      failed: {
        type: Number,
        default: 0,
      },
    },

    // Error information
    error: {
      message: String,
      code: String,
      stack: String,
      timestamp: Date,
    },

    // Progress tracking
    progress: {
      current: {
        type: Number,
        default: 0,
      },
      total: {
        type: Number,
        default: 0,
      },
      percentage: {
        type: Number,
        default: 0,
      },
    },

    // Bull queue job ID
    queueJobId: {
      type: String,
      index: true,
    },

    // Preview mode (doesn't modify Shopify)
    isPreview: {
      type: Boolean,
      default: false,
    },

    // Triggered by
    triggeredBy: {
      type: String,
      enum: ['user', 'scheduler', 'system'],
      default: 'user',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
jobSchema.index({ feed: 1, createdAt: -1 });
jobSchema.index({ shop: 1, status: 1 });
jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ queueJobId: 1 });

// Virtual for success rate
jobSchema.virtual('successRate').get(function () {
  if (this.results.processed === 0) return 0;
  return ((this.results.created + this.results.updated) / this.results.processed) * 100;
});

// Methods
jobSchema.methods.updateProgress = function (current, total) {
  this.progress.current = current;
  this.progress.total = total;
  this.progress.percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  return this.save();
};

jobSchema.methods.markStarted = function () {
  this.status = 'processing';
  this.startedAt = new Date();
  return this.save();
};

jobSchema.methods.markCompleted = function (results) {
  this.status = 'completed';
  this.completedAt = new Date();
  this.duration = this.completedAt - this.startedAt;
  this.results = { ...this.results, ...results };
  return this.save();
};

jobSchema.methods.markFailed = function (error) {
  this.status = 'failed';
  this.completedAt = new Date();
  this.duration = this.completedAt - this.startedAt;
  this.error = {
    message: error.message,
    code: error.code,
    stack: error.stack,
    timestamp: new Date(),
  };
  return this.save();
};

export default mongoose.model('Job', jobSchema);
