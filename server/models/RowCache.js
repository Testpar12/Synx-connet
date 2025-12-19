import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * Row Cache Schema - Stores hashes of successfully synced rows
 * Used to skip unchanged rows during subsequent syncs
 */
const rowCacheSchema = new mongoose.Schema(
    {
        // Feed reference
        feed: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Feed',
            required: true,
            index: true,
        },

        // Row identifier (SKU or Handle value)
        identifier: {
            type: String,
            required: true,
            index: true,
        },

        // Identifier type
        identifierType: {
            type: String,
            enum: ['sku', 'handle'],
            required: true,
        },

        // Hash of the row data (used for comparison)
        rowHash: {
            type: String,
            required: true,
        },

        // Last synced Shopify product ID
        shopifyProductId: {
            type: String,
        },

        // Last successful sync timestamp
        lastSyncedAt: {
            type: Date,
            default: Date.now,
        },

        // Number of times this row has been synced
        syncCount: {
            type: Number,
            default: 1,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index for efficient lookups
rowCacheSchema.index({ feed: 1, identifier: 1 }, { unique: true });

/**
 * Generate hash from row data
 * @param {Object} rowData - CSV row data
 * @returns {string} MD5 hash of the row
 */
rowCacheSchema.statics.generateHash = function (rowData) {
    // Sort keys to ensure consistent hashing
    const sortedData = Object.keys(rowData)
        .sort()
        .reduce((acc, key) => {
            acc[key] = rowData[key];
            return acc;
        }, {});

    const dataString = JSON.stringify(sortedData);
    return crypto.createHash('md5').update(dataString).digest('hex');
};

/**
 * Check if row has changed
 * @param {ObjectId} feedId - Feed ID
 * @param {string} identifier - Row identifier (SKU or handle value)
 * @param {string} currentHash - Hash of current row data
 * @returns {Object} { exists: boolean, changed: boolean, cache: document }
 */
rowCacheSchema.statics.checkRow = async function (feedId, identifier, currentHash) {
    const cache = await this.findOne({ feed: feedId, identifier });

    if (!cache) {
        // Row was never synced
        return { exists: false, changed: true, cache: null };
    }

    if (cache.rowHash === currentHash) {
        // Row unchanged
        return { exists: true, changed: false, cache };
    }

    // Row has changed
    return { exists: true, changed: true, cache };
};

/**
 * Update or create row cache entry
 * @param {ObjectId} feedId - Feed ID
 * @param {string} identifier - Row identifier
 * @param {string} identifierType - 'sku' or 'handle'
 * @param {string} rowHash - Hash of row data
 * @param {string} shopifyProductId - Shopify product ID
 */
rowCacheSchema.statics.upsertRow = async function (feedId, identifier, identifierType, rowHash, shopifyProductId) {
    return this.findOneAndUpdate(
        { feed: feedId, identifier },
        {
            $set: {
                identifierType,
                rowHash,
                shopifyProductId,
                lastSyncedAt: new Date(),
            },
            $inc: { syncCount: 1 },
        },
        { upsert: true, new: true }
    );
};

/**
 * Clear all cache entries for a feed
 * @param {ObjectId} feedId - Feed ID
 */
rowCacheSchema.statics.clearFeedCache = async function (feedId) {
    return this.deleteMany({ feed: feedId });
};

/**
 * Get cache statistics for a feed
 * @param {ObjectId} feedId - Feed ID
 */
rowCacheSchema.statics.getFeedStats = async function (feedId) {
    const stats = await this.aggregate([
        { $match: { feed: new mongoose.Types.ObjectId(feedId) } },
        {
            $group: {
                _id: null,
                totalRows: { $sum: 1 },
                totalSyncs: { $sum: '$syncCount' },
                lastSync: { $max: '$lastSyncedAt' },
            },
        },
    ]);

    return stats[0] || { totalRows: 0, totalSyncs: 0, lastSync: null };
};

export default mongoose.model('RowCache', rowCacheSchema);
