import express from 'express';
import shopifyFieldsService from '../services/shopify/shopify-fields.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/shopify-fields/product-fields
 * Get all Shopify product fields and metafield definitions
 */
router.get('/product-fields', async (req, res) => {
    try {
        const fields = await shopifyFieldsService.getAllFields(
            req.shop.domain,
            req.shop.accessToken
        );

        res.json({
            success: true,
            fields: fields.allFields,
            grouped: {
                product: fields.productFields,
                variant: fields.variantFields,
                metafields: fields.metafields,
            },
        });
    } catch (error) {
        logger.error('Error fetching Shopify product fields:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch product fields',
        });
    }
});

/**
 * GET /api/shopify-fields/metafield-definitions
 * Get only metafield definitions
 */
router.get('/metafield-definitions', async (req, res) => {
    try {
        const metafields = await shopifyFieldsService.getMetafieldDefinitions(
            req.shop.domain,
            req.shop.accessToken
        );

        res.json({
            success: true,
            metafields,
        });
    } catch (error) {
        logger.error('Error fetching metafield definitions:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch metafield definitions',
        });
    }
});

export default router;
