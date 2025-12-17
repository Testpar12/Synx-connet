import logger from '../../utils/logger.js';

/**
 * Diff Engine
 * Compares Shopify product data with CSV data to detect changes
 */
class DiffEngine {
  /**
   * Compare product data and return list of changes
   * @param {Object} existingProduct - Current Shopify product data
   * @param {Object} newProductData - New data from CSV
   * @param {Array} mappings - Field mappings to compare
   * @returns {Array} List of changes {field, oldValue, newValue, fieldType}
   */
  compareProduct(existingProduct, newProductData, mappings) {
    const changes = [];

    // Compare product fields
    const productChanges = this.compareProductFields(
      existingProduct,
      newProductData.product
    );
    changes.push(...productChanges);

    // Compare metafields
    const metafieldChanges = this.compareMetafields(
      existingProduct.metafields || [],
      newProductData.metafields || []
    );
    changes.push(...metafieldChanges);

    return changes;
  }

  /**
   * Compare product fields
   * @param {Object} existing - Existing product
   * @param {Object} newData - New product data
   * @returns {Array} List of changed fields
   */
  compareProductFields(existing, newData) {
    const changes = [];
    const fieldsToCompare = Object.keys(newData);

    fieldsToCompare.forEach((field) => {
      const oldValue = existing[field];
      const newValue = newData[field];

      if (!this.valuesEqual(oldValue, newValue, field)) {
        changes.push({
          field,
          oldValue: this.formatValue(oldValue),
          newValue: this.formatValue(newValue),
          fieldType: 'product',
        });
      }
    });

    return changes;
  }

  /**
   * Compare metafields
   * @param {Array} existingMetafields - Existing metafields
   * @param {Array} newMetafields - New metafields from CSV
   * @returns {Array} List of changed metafields
   */
  compareMetafields(existingMetafields, newMetafields) {
    const changes = [];

    newMetafields.forEach((newMeta) => {
      const existing = existingMetafields.find(
        (m) =>
          m.namespace === newMeta.namespace &&
          m.key === newMeta.key
      );

      if (!existing) {
        // New metafield
        changes.push({
          field: `${newMeta.namespace}.${newMeta.key}`,
          oldValue: null,
          newValue: this.formatValue(newMeta.value),
          fieldType: 'metafield',
          metafield: newMeta,
        });
      } else if (!this.valuesEqual(existing.value, newMeta.value, 'metafield')) {
        // Changed metafield
        changes.push({
          field: `${newMeta.namespace}.${newMeta.key}`,
          oldValue: this.formatValue(existing.value),
          newValue: this.formatValue(newMeta.value),
          fieldType: 'metafield',
          metafield: newMeta,
        });
      }
    });

    return changes;
  }

  /**
   * Check if two values are equal
   * @param {*} value1 - First value
   * @param {*} value2 - Second value
   * @param {string} field - Field name for special comparison logic
   * @returns {boolean}
   */
  valuesEqual(value1, value2, field) {
    // Handle null/undefined
    if (this.isNullOrEmpty(value1) && this.isNullOrEmpty(value2)) {
      return true;
    }

    if (this.isNullOrEmpty(value1) || this.isNullOrEmpty(value2)) {
      return false;
    }

    // Special handling for arrays (tags, images)
    if (Array.isArray(value1) || Array.isArray(value2)) {
      return this.arraysEqual(value1, value2);
    }

    // Special handling for objects
    if (typeof value1 === 'object' || typeof value2 === 'object') {
      return JSON.stringify(value1) === JSON.stringify(value2);
    }

    // Normalize strings for comparison
    const normalized1 = this.normalizeValue(value1);
    const normalized2 = this.normalizeValue(value2);

    return normalized1 === normalized2;
  }

  /**
   * Compare two arrays
   * @param {Array} arr1 - First array
   * @param {Array} arr2 - Second array
   * @returns {boolean}
   */
  arraysEqual(arr1, arr2) {
    if (!Array.isArray(arr1)) arr1 = [arr1];
    if (!Array.isArray(arr2)) arr2 = [arr2];

    if (arr1.length !== arr2.length) {
      return false;
    }

    const sorted1 = [...arr1].map(this.normalizeValue).sort();
    const sorted2 = [...arr2].map(this.normalizeValue).sort();

    return sorted1.every((val, index) => val === sorted2[index]);
  }

  /**
   * Normalize value for comparison
   * @param {*} value - Value to normalize
   * @returns {string}
   */
  normalizeValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    return value
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Check if value is null or empty
   * @param {*} value - Value to check
   * @returns {boolean}
   */
  isNullOrEmpty(value) {
    return (
      value === null ||
      value === undefined ||
      value === '' ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0)
    );
  }

  /**
   * Format value for display/logging
   * @param {*} value - Value to format
   * @returns {string}
   */
  formatValue(value) {
    if (this.isNullOrEmpty(value)) {
      return '<empty>';
    }

    if (Array.isArray(value)) {
      return value.join(', ');
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return value.toString();
  }

  /**
   * Check if product has any changes
   * @param {Object} existingProduct - Existing product
   * @param {Object} newProductData - New product data
   * @param {Array} mappings - Field mappings
   * @returns {boolean}
   */
  hasChanges(existingProduct, newProductData, mappings) {
    const changes = this.compareProduct(existingProduct, newProductData, mappings);
    return changes.length > 0;
  }

  /**
   * Build update payload with only changed fields
   * @param {Object} existingProduct - Existing product
   * @param {Object} newProductData - New product data
   * @param {Array} changes - List of changes
   * @returns {Object} Update payload
   */
  buildUpdatePayload(existingProduct, newProductData, changes) {
    const payload = {
      product: {},
      metafields: [],
    };

    changes.forEach((change) => {
      if (change.fieldType === 'product') {
        payload.product[change.field] = newProductData.product[change.field];
      } else if (change.fieldType === 'metafield') {
        payload.metafields.push(change.metafield);
      }
    });

    return payload;
  }
}

export default new DiffEngine();
