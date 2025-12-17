import mongoose from 'mongoose';

/**
 * FTP Connection Schema - Stores FTP/SFTP connection details
 */
const ftpConnectionSchema = new mongoose.Schema(
  {
    // Shop reference
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true,
    },

    // Connection name
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Connection type
    protocol: {
      type: String,
      enum: ['ftp', 'ftps', 'sftp'],
      required: true,
      default: 'sftp',
    },

    // Host configuration
    host: {
      type: String,
      required: true,
      trim: true,
    },

    port: {
      type: Number,
      required: true,
      default: 22,
    },

    // Authentication (encrypted)
    username: {
      type: String,
      required: true,
    },

    password: {
      type: String,
      // Encrypted, optional if using SSH key
    },

    privateKey: {
      type: String,
      // Encrypted SSH private key for SFTP
    },

    passphrase: {
      type: String,
      // Encrypted passphrase for private key
    },

    // Root folder path
    rootPath: {
      type: String,
      default: '/',
      trim: true,
    },

    // Connection status
    status: {
      type: String,
      enum: ['active', 'inactive', 'error'],
      default: 'inactive',
    },

    // Last test result
    lastTestAt: {
      type: Date,
    },

    lastTestStatus: {
      type: String,
      enum: ['success', 'failed'],
    },

    lastTestError: {
      type: String,
    },

    // Connection options
    options: {
      passive: {
        type: Boolean,
        default: true,
      },
      secureOptions: {
        type: mongoose.Schema.Types.Mixed,
      },
      timeout: {
        type: Number,
        default: 30000, // 30 seconds
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
ftpConnectionSchema.index({ shop: 1, isActive: 1 });
ftpConnectionSchema.index({ status: 1 });

// Methods
ftpConnectionSchema.methods.updateTestResult = function (success, error = null) {
  this.lastTestAt = new Date();
  this.lastTestStatus = success ? 'success' : 'failed';
  this.lastTestError = error;
  this.status = success ? 'active' : 'error';
  return this.save();
};

export default mongoose.model('FtpConnection', ftpConnectionSchema);
