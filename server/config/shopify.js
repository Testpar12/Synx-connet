import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { config } from '../config/app.js';

/**
 * Shopify API Configuration
 */
const shopify = shopifyApi({
  apiKey: config.shopify.apiKey,
  apiSecretKey: config.shopify.apiSecret,
  scopes: config.shopify.scopes,
  hostName: config.shopify.appUrl.replace(/https?:\/\//, ''),
  apiVersion: config.shopify.apiVersion || LATEST_API_VERSION,
  isEmbeddedApp: true,
  billing: undefined, // Add billing configuration when needed
});

export default shopify;
