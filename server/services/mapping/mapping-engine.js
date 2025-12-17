import logger from '../../utils/logger.js';

/**
 * Mapping Engine
 * Transforms CSV row data to Shopify product data based on mapping configuration
 */
class MappingEngine {
  /**
   * Transform CSV row to Shopify product object
   * @param {Object} csvRow - CSV row data
   * @param {Array} mappings - Field mappings configuration
   * @param {Object} matchingConfig - Matching configuration
   * @returns {Object} Shopify product data
   */
  transformRow(csvRow, mappings, matchingConfig) {
    const productData = {
      product: {},
      metafields: [],
      identifier: this.getIdentifier(csvRow, matchingConfig),
    };

    mappings.forEach((mapping) => {
      let csvValue;
      if (mapping.csvColumn.startsWith('CONSTANT:')) {
        csvValue = mapping.csvColumn.split(':')[1];
      } else {
        csvValue = csvRow[mapping.csvColumn];
      }

      // Apply transformations
      const transformedValue = this.applyTransformations(
        csvValue,
        mapping.transform || {}
      );

      // Skip if value is empty and ignoreEmpty is true
      if (
        mapping.transform?.ignoreEmpty &&
        this.isEmpty(transformedValue)
      ) {
        return;
      }

      if (mapping.fieldType === 'product') {
        // Map to product field
        this.mapProductField(
          productData.product,
          mapping.shopifyField,
          transformedValue
        );
      } else if (mapping.fieldType === 'metafield') {
        // Map to metafield
        productData.metafields.push({
          namespace: mapping.metafieldNamespace,
          key: mapping.metafieldKey,
          type: mapping.metafieldType,
          value: this.formatMetafieldValue(
            transformedValue,
            mapping.metafieldType
          ),
        });
      }
    });

    return productData;
  }

  /**
   * Get identifier value from CSV row
   * @param {Object} csvRow - CSV row data
   * @param {Object} matchingConfig - Matching configuration
   * @returns {Object} {type, value}
   */
  getIdentifier(csvRow, matchingConfig) {
    const value = csvRow[matchingConfig.column];

    return {
      type: matchingConfig.type,
      value: value ? value.toString().trim() : null,
    };
  }

  /**
   * Apply transformations to CSV value
   * @param {*} value - CSV value
   * @param {Object} transformOptions - Transformation options
   * @returns {*} Transformed value
   */
  applyTransformations(value, transformOptions) {
    if (value === null || value === undefined) {
      return transformOptions.defaultValue || null;
    }

    let transformed = value.toString();

    // Trim whitespace
    if (transformOptions.trim !== false) {
      transformed = transformed.trim();
    }

    // Case transformations
    if (transformOptions.lowercase) {
      transformed = transformed.toLowerCase();
    } else if (transformOptions.uppercase) {
      transformed = transformed.toUpperCase();
    }

    // Return default value if empty after transformations
    if (this.isEmpty(transformed) && transformOptions.defaultValue) {
      return transformOptions.defaultValue;
    }

    return transformed;
  }

  /**
   * Map value to product field
   * @param {Object} product - Product object
   * @param {string} field - Shopify field name
   * @param {*} value - Value to map
   */
  mapProductField(product, field, value) {
    switch (field) {
      case 'title':
      case 'body_html':
      case 'handle':
      case 'vendor':
      case 'product_type':
        product[field] = value;
        break;

      case 'tags':
        // Tags can be comma-separated string or array
        if (typeof value === 'string') {
          product.tags = value.split(',').map((t) => t.trim());
        } else if (Array.isArray(value)) {
          product.tags = value;
        }
        break;

      case 'status':
        // Normalize status value
        const normalizedStatus = value?.toLowerCase();
        if (['active', 'draft', 'archived'].includes(normalizedStatus)) {
          product.status = normalizedStatus;
        }
        break;

      case 'images':
      case 'image':
        // Images can be single URL or comma-separated URLs
        if (!product.images) {
          product.images = [];
        }

        if (typeof value === 'string') {
          const urls = value.split(',').map((url) => url.trim());
          product.images.push(
            ...urls.map((url) => ({ src: url }))
          );
        }
        break;

      default:
        product[field] = value;
    }
  }

  /**
   * Format value for metafield type
   * @param {*} value - Raw value
   * @param {string} type - Metafield type
   * @returns {string} Formatted value
   */
  formatMetafieldValue(value, type) {
    if (this.isEmpty(value)) {
      return null;
    }

    switch (type) {
      case 'number_integer':
        return parseInt(value, 10).toString();

      case 'number_decimal':
        return parseFloat(value).toString();

      case 'boolean':
        const normalized = value.toString().toLowerCase();
        return ['true', '1', 'yes', 'on'].includes(normalized)
          ? 'true'
          : 'false';

      case 'json':
        // Validate JSON
        try {
          if (typeof value === 'string') {
            JSON.parse(value);
            return value;
          } else {
            return JSON.stringify(value);
          }
        } catch {
          // If parse fails, it might be a simple string that needs to be stringified
          return JSON.stringify(value);
        }

      case 'date':
      case 'date_time':
        // Validate date format
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
        logger.warn(`Invalid date value for metafield: ${value}`);
        return null;

      case 'url':
        // Basic URL validation
        try {
          new URL(value);
          return value;
        } catch {
          logger.warn(`Invalid URL value for metafield: ${value}`);
          return null;
        }

      default:
        // Handle list types
        if (type.startsWith('list.')) {
          try {
            // Check if it's already a JSON array string
            if (typeof value === 'string') {
              const parsed = JSON.parse(value);
              if (Array.isArray(parsed)) return value;
            }
          } catch (e) {
            // Ignore parse error, proceed to treat as raw value
          }

          // Not a JSON array, treat as delimiter-separated list or single value
          // We support comma, pipe, or semicolon as delimiters for lists
          if (typeof value === 'string') {
            let items = [];
            if (value.includes('|')) {
              items = value.split('|');
            } else if (value.includes(';')) {
              items = value.split(';');
            } else {
              items = value.split(',');
            }

            items = items.map(s => s.trim()).filter(s => s !== '');
            return JSON.stringify(items);
          }

          return JSON.stringify([value]);
        }

        return value.toString();
    }
  }

  /**
   * Check if value is empty
   * @param {*} value - Value to check
   * @returns {boolean}
   */
  isEmpty(value) {
    return (
      value === null ||
      value === undefined ||
      value === '' ||
      (typeof value === 'string' && value.trim() === '')
    );
  }

  /**
   * Validate mapping configuration
   * @param {Array} mappings - Mappings configuration
   * @param {Array} csvHeaders - Available CSV headers
   * @returns {{valid: boolean, errors: Array}}
   */
  validateMappings(mappings, csvHeaders) {
    const errors = [];

    if (!Array.isArray(mappings) || mappings.length === 0) {
      errors.push('No mappings configured');
      return { valid: false, errors };
    }

    mappings.forEach((mapping, index) => {
      // Check required fields
      if (!mapping.csvColumn) {
        errors.push(`Mapping ${index + 1}: CSV column is required`);
      } else if (
        !csvHeaders.includes(mapping.csvColumn) &&
        !mapping.csvColumn.startsWith('CONSTANT:')
      ) {
        errors.push(
          `Mapping ${index + 1}: CSV column "${mapping.csvColumn}" not found in headers`
        );
      }

      if (!mapping.shopifyField) {
        errors.push(`Mapping ${index + 1}: Shopify field is required`);
      }

      if (!mapping.fieldType) {
        errors.push(`Mapping ${index + 1}: Field type is required`);
      }

      // Validate metafield mappings
      if (mapping.fieldType === 'metafield') {
        if (!mapping.metafieldNamespace) {
          errors.push(`Mapping ${index + 1}: Metafield namespace is required`);
        }
        if (!mapping.metafieldKey) {
          errors.push(`Mapping ${index + 1}: Metafield key is required`);
        }
        if (!mapping.metafieldType) {
          errors.push(`Mapping ${index + 1}: Metafield type is required`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Apply filters to CSV row
   * @param {Object} csvRow - CSV row data
   * @param {Array} filters - Filter configuration
   * @returns {boolean} True if row passes filters
   */
  applyFilters(csvRow, filters) {
    if (!filters || filters.length === 0) {
      return true; // No filters, include all rows
    }

    for (const filter of filters) {
      const csvValue = csvRow[filter.column];
      const filterValue = filter.value;
      const passes = this.evaluateFilter(csvValue, filter.operator, filterValue);

      if (filter.action === 'include' && !passes) {
        return false; // Exclude this row
      } else if (filter.action === 'exclude' && passes) {
        return false; // Exclude this row
      }
    }

    return true;
  }

  /**
   * Evaluate filter condition
   * @param {*} csvValue - CSV value
   * @param {string} operator - Filter operator
   * @param {*} filterValue - Filter value
   * @returns {boolean}
   */
  evaluateFilter(csvValue, operator, filterValue) {
    const normalizedCsvValue = (csvValue || '').toString().toLowerCase();
    const normalizedFilterValue = filterValue.toString().toLowerCase();

    switch (operator) {
      case 'equals':
        return normalizedCsvValue === normalizedFilterValue;

      case 'not_equals':
        return normalizedCsvValue !== normalizedFilterValue;

      case 'contains':
        return normalizedCsvValue.includes(normalizedFilterValue);

      case 'not_contains':
        return !normalizedCsvValue.includes(normalizedFilterValue);

      case 'greater_than':
        return parseFloat(csvValue) > parseFloat(filterValue);

      case 'less_than':
        return parseFloat(csvValue) < parseFloat(filterValue);

      default:
        return true;
    }
  }
}

export default new MappingEngine();
