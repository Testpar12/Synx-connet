import shopify from '../../config/shopify.js';
import logger from '../../utils/logger.js';

/**
 * Shopify Fields Service
 * Fetches product fields and metafield definitions from Shopify
 */
class ShopifyFieldsService {
    /**
     * Get all standard Shopify product fields
     * @returns {Array} List of product fields
     */
    getStandardProductFields() {
        return [
            // Product-level fields
            { key: 'title', label: 'Title', type: 'product', dataType: 'string' },
            { key: 'body_html', label: 'Description (HTML)', type: 'product', dataType: 'string' },
            { key: 'vendor', label: 'Vendor', type: 'product', dataType: 'string' },
            { key: 'product_type', label: 'Product Type', type: 'product', dataType: 'string' },
            { key: 'tags', label: 'Tags', type: 'product', dataType: 'string' },
            { key: 'status', label: 'Status', type: 'product', dataType: 'string' },
            { key: 'handle', label: 'Handle (URL)', type: 'product', dataType: 'string' },
            { key: 'template_suffix', label: 'Template Suffix', type: 'product', dataType: 'string' },
            { key: 'published_scope', label: 'Published Scope', type: 'product', dataType: 'string' },
        ];
    }

    /**
     * Get all standard Shopify variant fields
     * @returns {Array} List of variant fields
     */
    getStandardVariantFields() {
        return [
            { key: 'sku', label: 'SKU', type: 'variant', dataType: 'string' },
            { key: 'price', label: 'Price', type: 'variant', dataType: 'number' },
            { key: 'compare_at_price', label: 'Compare at Price', type: 'variant', dataType: 'number' },
            { key: 'cost', label: 'Cost per Item', type: 'variant', dataType: 'number' },
            { key: 'barcode', label: 'Barcode', type: 'variant', dataType: 'string' },
            { key: 'weight', label: 'Weight', type: 'variant', dataType: 'number' },
            { key: 'weight_unit', label: 'Weight Unit', type: 'variant', dataType: 'string' },
            { key: 'inventory_quantity', label: 'Inventory Quantity', type: 'variant', dataType: 'integer' },
            { key: 'inventory_policy', label: 'Inventory Policy', type: 'variant', dataType: 'string' },
            { key: 'inventory_management', label: 'Inventory Management', type: 'variant', dataType: 'string' },
            { key: 'fulfillment_service', label: 'Fulfillment Service', type: 'variant', dataType: 'string' },
            { key: 'requires_shipping', label: 'Requires Shipping', type: 'variant', dataType: 'boolean' },
            { key: 'taxable', label: 'Taxable', type: 'variant', dataType: 'boolean' },
            { key: 'option1', label: 'Option 1', type: 'variant', dataType: 'string' },
            { key: 'option2', label: 'Option 2', type: 'variant', dataType: 'string' },
            { key: 'option3', label: 'Option 3', type: 'variant', dataType: 'string' },
        ];
    }

    /**
     * Fetch metafield definitions from Shopify
     * @param {string} shopDomain - Shop domain
     * @param {string} accessToken - Shopify access token
     * @returns {Promise<Array>} List of metafield definitions
     */
    async getMetafieldDefinitions(shopDomain, accessToken) {
        try {
            const client = new shopify.clients.Graphql({
                session: {
                    shop: shopDomain,
                    accessToken: accessToken,
                },
            });

            const query = `
        query getMetafieldDefinitions($ownerType: MetafieldOwnerType!) {
          metafieldDefinitions(first: 100, ownerType: $ownerType) {
            edges {
              node {
                id
                name
                namespace
                key
                type {
                  name
                }
                description
              }
            }
          }
        }
      `;

            // Fetch product metafield definitions
            const productResponse = await client.request(query, {
                variables: { ownerType: 'PRODUCT' },
            });

            // Fetch variant metafield definitions
            const variantResponse = await client.request(query, {
                variables: { ownerType: 'PRODUCTVARIANT' },
            });

            const productMetafields = (productResponse?.data?.metafieldDefinitions?.edges || []).map(
                (edge) => ({
                    key: `metafield:${edge.node.namespace}.${edge.node.key}`,
                    label: edge.node.name || `${edge.node.namespace}.${edge.node.key}`,
                    type: 'metafield',
                    metafieldNamespace: edge.node.namespace,
                    metafieldKey: edge.node.key,
                    metafieldType: edge.node.type.name,
                    ownerType: 'PRODUCT',
                    description: edge.node.description,
                })
            );

            const variantMetafields = (variantResponse?.data?.metafieldDefinitions?.edges || []).map(
                (edge) => ({
                    key: `variant_metafield:${edge.node.namespace}.${edge.node.key}`,
                    label: `[Variant] ${edge.node.name || `${edge.node.namespace}.${edge.node.key}`}`,
                    type: 'variant_metafield',
                    metafieldNamespace: edge.node.namespace,
                    metafieldKey: edge.node.key,
                    metafieldType: edge.node.type.name,
                    ownerType: 'PRODUCTVARIANT',
                    description: edge.node.description,
                })
            );

            return [...productMetafields, ...variantMetafields];
        } catch (error) {
            logger.error('Error fetching metafield definitions:', error);
            // Return empty array on error, don't fail the whole request
            return [];
        }
    }

    /**
     * Get all available fields (standard + metafields)
     * @param {string} shopDomain - Shop domain
     * @param {string} accessToken - Shopify access token
     * @returns {Promise<Object>} Object with productFields, variantFields, and metafields
     */
    async getAllFields(shopDomain, accessToken) {
        const productFields = this.getStandardProductFields();
        const variantFields = this.getStandardVariantFields();
        const metafields = await this.getMetafieldDefinitions(shopDomain, accessToken);

        return {
            productFields,
            variantFields,
            metafields,
            allFields: [...productFields, ...variantFields, ...metafields],
        };
    }
}

export default new ShopifyFieldsService();
