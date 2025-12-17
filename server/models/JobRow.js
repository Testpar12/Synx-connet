import mongoose from 'mongoose';

/**
 * Job Row Schema - Detailed logs for each CSV row processed
 */
const jobRowSchema = new mongoose.Schema(
  {
    // Job reference
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true,
    },

    // Row information
    rowNumber: {
      type: Number,
      required: true,
    },

    // CSV row data (sample)
    rowData: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Matching identifier from CSV
    identifier: {
      value: String, // SKU or Handle value
      type: {
        type: String,
        enum: ['sku', 'handle'],
      },
    },

    // Operation performed
    operation: {
      type: String,
      enum: ['create', 'update', 'skip', 'error'],
      required: true,
      index: true,
    },

    // Shopify product ID (if created/updated)
    shopifyProductId: {
      type: String,
    },

    shopifyProductHandle: {
      type: String,
    },

    // Changes detected (for updates)
    changes: [
      {
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
        fieldType: {
          type: String,
          enum: ['product', 'metafield'],
        },
      },
    ],

    // Status
    status: {
      type: String,
      enum: ['success', 'warning', 'error'],
      default: 'success',
      index: true,
    },

    // Error details (if failed)
    error: {
      message: String,
      code: String,
      field: String,
      details: mongoose.Schema.Types.Mixed,
    },

    // Processing time for this row
    processingTime: {
      type: Number, // Milliseconds
    },

    // Warnings
    warnings: [
      {
        message: String,
        field: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
jobRowSchema.index({ job: 1, rowNumber: 1 });
jobRowSchema.index({ job: 1, operation: 1 });
jobRowSchema.index({ job: 1, status: 1 });
jobRowSchema.index({ shopifyProductId: 1 });

// Compound index for efficient queries
jobRowSchema.index({ job: 1, status: 1, operation: 1 });

export default mongoose.model('JobRow', jobRowSchema);
