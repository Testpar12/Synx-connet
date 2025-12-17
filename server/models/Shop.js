import mongoose from 'mongoose';

/**
 * Shop Schema - Stores Shopify store information
 */
const shopSchema = new mongoose.Schema(
  {
    // Shopify domain (unique identifier)
    domain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // Shop name
    name: {
      type: String,
      required: true,
    },

    // Shop email
    email: {
      type: String,
    },

    // Access token (encrypted)
    accessToken: {
      type: String,
      required: true,
    },

    // Shopify API scopes
    scopes: {
      type: [String],
      default: [],
    },

    // Shop plan
    plan: {
      type: String,
    },

    // Currency
    currency: {
      type: String,
    },

    // Timezone
    timezone: {
      type: String,
    },

    // App installation status
    isActive: {
      type: Boolean,
      default: true,
    },

    // App installation date
    installedAt: {
      type: Date,
      default: Date.now,
    },

    // Last sync timestamp
    lastSyncAt: {
      type: Date,
    },

    // Subscription status (for billing)
    subscription: {
      status: {
        type: String,
        enum: ['active', 'trial', 'cancelled', 'expired'],
        default: 'trial',
      },
      plan: {
        type: String,
        enum: ['free', 'basic', 'pro', 'enterprise'],
        default: 'free',
      },
      trialEndsAt: {
        type: Date,
      },
    },

    // App settings
    settings: {
      autoSync: {
        type: Boolean,
        default: true,
      },
      notifications: {
        email: {
          type: Boolean,
          default: true,
        },
        failureAlerts: {
          type: Boolean,
          default: true,
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
shopSchema.index({ domain: 1 });
shopSchema.index({ isActive: 1 });
shopSchema.index({ 'subscription.status': 1 });

// Virtual for checking trial status
shopSchema.virtual('isTrialActive').get(function () {
  if (this.subscription.status !== 'trial') return false;
  return new Date() < this.subscription.trialEndsAt;
});

// Methods
shopSchema.methods.updateLastSync = function () {
  this.lastSyncAt = new Date();
  return this.save();
};

export default mongoose.model('Shop', shopSchema);
