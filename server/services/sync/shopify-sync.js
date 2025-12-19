import shopify from '../../config/shopify.js';
import Shop from '../../models/Shop.js';
import logger from '../../utils/logger.js';

/**
 * Shopify Sync Service
 * Handles product creation, updates, and metafield management
 */
class ShopifySync {
  /**
   * Find product by SKU or Handle
   * @param {Object} shop - Shop document
   * @param {Object} identifier - {type: 'sku'|'handle', value: string}
   * @returns {Promise<Object|null>} Product or null
   */
  async findProduct(shop, identifier) {
    const session = this.createSession(shop);
    const client = new shopify.clients.Graphql({ session });

    if (identifier.type === 'handle') {
      return this.findByHandle(client, identifier.value);
    } else if (identifier.type === 'sku') {
      return this.findBySku(client, identifier.value);
    }

    return null;
  }

  /**
   * Find product by handle
   */
  async findByHandle(client, handle) {
    const query = `
      query getProductByHandle($handle: String!) {
        productByHandle(handle: $handle) {
          id
          title
          handle
          descriptionHtml
          vendor
          productType
          tags
          status
          metafields(first: 250) {
            edges {
              node {
                id
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    `;

    try {
      const response = await client.request(query, {
        variables: { handle },
      });

      return response.data.productByHandle;
    } catch (error) {
      logger.error('Error finding product by handle:', error);
      throw error;
    }
  }

  /**
   * Find product by SKU
   */
  async findBySku(client, sku) {
    const query = `
      query getProductBySku($query: String!) {
        products(first: 1, query: $query) {
          edges {
            node {
              id
              title
              handle
              descriptionHtml
              vendor
              productType
              tags
              status
              variants(first: 1) {
                edges {
                  node {
                    id
                    sku
                  }
                }
              }
              metafields(first: 250) {
                edges {
                  node {
                    id
                    namespace
                    key
                    value
                    type
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await client.request(query, {
        variables: { query: `sku:${sku}` },
      });

      const products = response.data.products.edges;
      return products.length > 0 ? products[0].node : null;
    } catch (error) {
      logger.error('Error finding product by SKU:', error);
      throw error;
    }
  }

  /**
   * Create new product
   * @param {Object} shop - Shop document
   * @param {Object} productData - Product data
   * @param {string} sku - SKU for variant
   * @returns {Promise<Object>} Created product
   */
  async createProduct(shop, productData, sku) {
    const session = this.createSession(shop);
    const client = new shopify.clients.Graphql({ session });

    // 1. Create product without properties that belong to variants
    const createMutation = `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            handle
            status
            variants(first: 1) {
              edges {
                node {
                  id
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const input = {
      title: productData.title || 'Untitled Product',
      descriptionHtml: productData.body_html || '',
      vendor: productData.vendor || '',
      productType: productData.product_type || '',
      tags: productData.tags || [],
      status: productData.status?.toUpperCase() || 'DRAFT',
    };

    if (productData.handle) {
      input.handle = productData.handle;
    }

    try {
      const response = await client.request(createMutation, {
        variables: { input },
      });

      const { product, userErrors } = response.data.productCreate;

      if (userErrors && userErrors.length > 0) {
        throw new Error(
          `Product creation failed: ${userErrors.map((e) => e.message).join(', ')}`
        );
      }

      // 2. Update the default variant with SKU and Inventory Policy
      if (product.variants?.edges?.length > 0) {
        const variantId = product.variants.edges[0].node.id;
        await this.updateVariant(client, product.id, variantId, {
          sku: sku,
          inventoryPolicy: 'DENY', // Or 'CONTINUE' based on requirements
        });
      }

      logger.info(`Product created: ${product.id}`);
      return product;
    } catch (error) {
      logger.error('Error creating product:', error);
      throw error;
    }
  }

  /**
   * Update product variant (helper) - Uses productVariantsBulkUpdate for API 2025-01+
   */
  async updateVariant(client, productId, variantId, data) {
    const mutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            sku
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variants = [
      {
        id: variantId,
        inventoryItem: {
          sku: data.sku,
        },
        inventoryPolicy: data.inventoryPolicy,
      },
    ];

    const response = await client.request(mutation, {
      variables: {
        productId,
        variants,
      },
    });

    const { userErrors } = response.data.productVariantsBulkUpdate;

    if (userErrors && userErrors.length > 0) {
      throw new Error(
        `Variant update failed: ${userErrors.map((e) => e.message).join(', ')}`
      );
    }
  }

  /**
   * Update existing product
   * @param {Object} shop - Shop document
   * @param {string} productId - Shopify product ID
   * @param {Object} productData - Product data to update
   * @returns {Promise<Object>} Updated product
   */
  async updateProduct(shop, productId, productData) {
    const session = this.createSession(shop);
    const client = new shopify.clients.Graphql({ session });

    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            handle
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const input = {
      id: productId,
      ...productData,
    };

    // ============================================
    // FIELD SANITIZATION FOR SHOPIFY GRAPHQL API
    // The Shopify GraphQL API expects camelCase field names,
    // but our internal mapping uses snake_case for compatibility.
    // This block converts all known fields to their GraphQL equivalents.
    // ============================================

    // body_html → descriptionHtml
    if (input.body_html !== undefined) {
      input.descriptionHtml = input.body_html;
      delete input.body_html;
    }

    // product_type → productType
    if (input.product_type !== undefined) {
      input.productType = input.product_type;
      delete input.product_type;
    }

    // template_suffix → templateSuffix
    if (input.template_suffix !== undefined) {
      input.templateSuffix = input.template_suffix;
      delete input.template_suffix;
    }

    // Convert status to uppercase if present (GraphQL requires ACTIVE, DRAFT, or ARCHIVED)
    if (input.status) {
      input.status = input.status.toUpperCase();
    }

    // ============================================
    // REMOVE INVALID FIELDS
    // These fields are not valid in ProductInput and will cause GraphQL errors
    // ============================================

    // published_scope - Use publications API instead
    delete input.published_scope;
    delete input.publishedScope;

    // published - Not a valid field
    delete input.published;

    // images - Handled separately via productCreateMedia mutation
    delete input.images;
    delete input.image;

    // variants - Handled separately via productVariantsBulkUpdate
    delete input.variants;

    // metafields - Handled separately via metafieldsSet mutation
    delete input.metafields;

    // created_at / updated_at - Read-only fields
    delete input.created_at;
    delete input.updated_at;
    delete input.createdAt;
    delete input.updatedAt;

    try {
      const response = await client.request(mutation, {
        variables: { input },
      });

      const { product, userErrors } = response.data.productUpdate;

      if (userErrors && userErrors.length > 0) {
        throw new Error(
          `Product update failed: ${userErrors.map((e) => e.message).join(', ')}`
        );
      }

      logger.info(`Product updated: ${product.id}`);
      return product;
    } catch (error) {
      logger.error('Error updating product:', error);
      throw error;
    }
  }

  /**
   * Set metafields for product
   * @param {Object} shop - Shop document
   * @param {string} productId - Shopify product ID
   * @param {Array} metafields - Metafields to set
   * @returns {Promise<Array>} Set metafields
   */
  async setMetafields(shop, productId, metafields) {
    if (!metafields || metafields.length === 0) {
      return [];
    }

    const session = this.createSession(shop);
    const client = new shopify.clients.Graphql({ session });

    const mutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const metafieldInputs = metafields
      .filter((meta) => meta.value !== null && meta.value !== '')
      .map((meta) => ({
        ownerId: productId,
        namespace: meta.namespace,
        key: meta.key,
        value: meta.value.toString(),
        type: meta.type,
      }));

    if (metafieldInputs.length === 0) {
      return [];
    }

    // Shopify limit is 25 per request
    const chunkSize = 25;
    const allSetMetafields = [];

    for (let i = 0; i < metafieldInputs.length; i += chunkSize) {
      const chunk = metafieldInputs.slice(i, i + chunkSize);

      try {
        const response = await client.request(mutation, {
          variables: { metafields: chunk },
        });

        const { metafields: setMetafields, userErrors } =
          response.data.metafieldsSet;

        if (userErrors && userErrors.length > 0) {
          logger.warn(
            `Metafield errors (chunk ${i / chunkSize + 1}): ${userErrors.map((e) => e.message).join(', ')}`
          );
        } else {
          if (setMetafields) {
            allSetMetafields.push(...setMetafields);
          }
        }

        // Brief delay between chunks to be safe
        if (i + chunkSize < metafieldInputs.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

      } catch (error) {
        logger.error(`Error setting metafields chunk ${i / chunkSize + 1}:`, error);
        // We continue processing other chunks even if one fails
      }
    }

    logger.info(`Metafields set for product: ${productId} (${allSetMetafields.length}/${metafieldInputs.length})`);
    return allSetMetafields;
  }

  /**
   * Add images to product
   * @param {Object} shop - Shop document
   * @param {string} productId - Shopify product ID
   * @param {Array} imageUrls - Image URLs
   * @returns {Promise<Array>} Created images
   */
  async addImages(shop, productId, imageUrls) {
    if (!imageUrls || imageUrls.length === 0) {
      return [];
    }

    const session = this.createSession(shop);
    const client = new shopify.clients.Graphql({ session });

    const mutation = `
      mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
        productCreateMedia(media: $media, productId: $productId) {
          media {
            ... on MediaImage {
              id
              image {
                url
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const mediaInputs = imageUrls.map((url) => ({
      originalSource: url,
      mediaContentType: 'IMAGE',
    }));

    try {
      const response = await client.request(mutation, {
        variables: {
          productId,
          media: mediaInputs,
        },
      });

      const { media, userErrors } = response.data.productCreateMedia;

      if (userErrors && userErrors.length > 0) {
        logger.warn(
          `Image upload errors: ${userErrors.map((e) => e.message).join(', ')}`
        );
      }

      logger.info(`Images added to product: ${productId}`);
      return media;
    } catch (error) {
      logger.error('Error adding images:', error);
      throw error;
    }
  }

  /**
   * Sync product (create or update)
   * @param {Object} shop - Shop document
   * @param {Object} productData - Transformed product data
   * @param {Object} identifier - Product identifier
   * @param {Object} options - Sync options
   * @returns {Promise<{operation: string, product: Object, changes: Array}>}
   */
  async syncProduct(shop, productData, identifier, options = {}) {
    const { updateExisting = true, createNew = true } = options;

    // Find existing product
    const existingProduct = await this.findProduct(shop, identifier);

    if (existingProduct) {
      // Product exists
      if (!updateExisting) {
        return {
          operation: 'skip',
          reason: 'Product exists and updateExisting is false',
          product: existingProduct,
        };
      }

      // Update product fields if any
      if (Object.keys(productData.product).length > 0) {
        await this.updateProduct(
          shop,
          existingProduct.id,
          productData.product
        );
      }

      // Update metafields
      if (productData.metafields && productData.metafields.length > 0) {
        await this.setMetafields(
          shop,
          existingProduct.id,
          productData.metafields
        );
      }

      // Add images if present
      if (productData.product.images && productData.product.images.length > 0) {
        const imageUrls = productData.product.images.map((img) => img.src);
        await this.addImages(shop, existingProduct.id, imageUrls);
      }

      return {
        operation: 'update',
        product: existingProduct,
      };
    } else {
      // Product doesn't exist
      if (!createNew) {
        return {
          operation: 'skip',
          reason: 'Product not found and createNew is false',
        };
      }

      // Create product
      const newProduct = await this.createProduct(
        shop,
        productData.product,
        identifier.value
      );

      // Set metafields
      if (productData.metafields && productData.metafields.length > 0) {
        await this.setMetafields(shop, newProduct.id, productData.metafields);
      }

      // Add images
      if (productData.product.images && productData.product.images.length > 0) {
        const imageUrls = productData.product.images.map((img) => img.src);
        await this.addImages(shop, newProduct.id, imageUrls);
      }

      return {
        operation: 'create',
        product: newProduct,
      };
    }
  }

  /**
   * Create Shopify session from shop document
   * @param {Object} shop - Shop document
   * @returns {Object} Shopify session
   */
  createSession(shop) {
    return {
      shop: shop.domain,
      accessToken: shop.accessToken,
    };
  }

  /**
   * Rate limit delay
   */
  async rateLimit() {
    return new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay
  }
}

export default new ShopifySync();
