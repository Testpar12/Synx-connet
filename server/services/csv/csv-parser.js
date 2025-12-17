import fs from 'fs';
import { parse } from 'csv-parse';
import logger from '../../utils/logger.js';

/**
 * CSV Parser Service
 * Handles CSV file parsing and validation
 */
class CsvParser {
  /**
   * Parse CSV file
   * @param {string} filePath - Path to CSV file
   * @param {Object} options - Parsing options
   * @returns {Promise<{headers: Array, rows: Array}>}
   */
  async parseFile(filePath, options = {}) {
    const {
      delimiter = ',',
      encoding = 'utf8',
      hasHeader = true,
      skipEmptyLines = true,
    } = options;

    return new Promise((resolve, reject) => {
      const rows = [];
      let headers = [];

      const parser = fs
        .createReadStream(filePath, { encoding })
        .pipe(
          parse({
            delimiter,
            skip_empty_lines: skipEmptyLines,
            trim: true,
            relax_column_count: true, // Allow inconsistent column counts
            from_line: 1,
          })
        );

      parser.on('data', (row) => {
        if (!hasHeader || headers.length === 0) {
          if (hasHeader) {
            // Normalize and uniquify headers
            const rawHeaders = row.map((h) => this.normalizeHeader(h));
            headers = this.uniquifyHeaders(rawHeaders);
          } else {
            // Generate generic headers if no header row
            headers = row.map((_, i) => `column_${i + 1}`);
            rows.push(this.rowToObject(row, headers));
          }
        } else {
          rows.push(this.rowToObject(row, headers));
        }
      });

      parser.on('error', (error) => {
        logger.error('CSV parsing error:', error);
        reject(error);
      });

      parser.on('end', () => {
        logger.info(`CSV parsed: ${rows.length} rows, ${headers.length} columns`);
        resolve({ headers, rows });
      });
    });
  }

  /**
   * Parse CSV with row limit (for preview)
   * @param {string} filePath - Path to CSV file
   * @param {number} limit - Maximum number of rows to parse
   * @param {Object} options - Parsing options
   * @returns {Promise<{headers: Array, rows: Array}>}
   */
  async parseFileWithLimit(filePath, limit, options = {}) {
    const {
      delimiter = ',',
      encoding = 'utf8',
      hasHeader = true,
      skipEmptyLines = true,
    } = options;

    return new Promise((resolve, reject) => {
      const rows = [];
      let headers = [];
      let rowCount = 0;

      // Add safety timeout
      const timeout = setTimeout(() => {
        logger.warn('CSV parsing timed out, returning what we have');
        parser.destroy();
        resolve({ headers, rows });
      }, 5000);

      const parser = fs
        .createReadStream(filePath, { encoding })
        .pipe(
          parse({
            delimiter,
            skip_empty_lines: skipEmptyLines,
            trim: true,
            relax_column_count: true,
            from_line: 1,
            bom: true, // Handle Byte Order Mark
          })
        );

      parser.on('data', (row) => {
        // Extract headers
        if (!hasHeader || headers.length === 0) {
          if (hasHeader) {
            const rawHeaders = row.map((h) => this.normalizeHeader(h));
            headers = this.uniquifyHeaders(rawHeaders);
            return; // Don't count header as data row
          } else {
            headers = row.map((_, i) => `column_${i + 1}`);
          }
        }

        // Stop if limit reached
        if (rowCount >= limit) {
          clearTimeout(timeout);
          parser.destroy();
          // We'll resolve in the error handler or close handler if appropriate, 
          // or just resolve here immediately as destroy might not emit 'end'
          resolve({ headers, rows });
          return;
        }

        rows.push(this.rowToObject(row, headers));
        rowCount++;
      });

      parser.on('error', (error) => {
        clearTimeout(timeout);
        if (error.message === 'Destroyed') {
          resolve({ headers, rows });
        } else {
          logger.error('CSV parsing error:', error);
          reject(error);
        }
      });

      parser.on('end', () => {
        clearTimeout(timeout);
        logger.info(`CSV preview parsed: ${rows.length} rows`);
        resolve({ headers, rows });
      });
    });
  }

  /**
   * Validate CSV structure
   * @param {Object} parsedData - Parsed CSV data
   * @param {Array} requiredColumns - Required column names
   * @returns {{valid: boolean, errors: Array}}
   */
  validate(parsedData, requiredColumns = []) {
    const errors = [];

    if (!parsedData.headers || parsedData.headers.length === 0) {
      errors.push('CSV has no headers');
    }

    if (!parsedData.rows || parsedData.rows.length === 0) {
      errors.push('CSV has no data rows');
    }

    // Check for required columns
    requiredColumns.forEach((col) => {
      if (!parsedData.headers.includes(col)) {
        errors.push(`Missing required column: ${col}`);
      }
    });

    // Check for duplicate headers
    const duplicates = parsedData.headers.filter(
      (item, index) => parsedData.headers.indexOf(item) !== index
    );

    if (duplicates.length > 0) {
      errors.push(`Duplicate column names: ${duplicates.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Convert row array to object using headers
   * @param {Array} row - Row data array
   * @param {Array} headers - Header names
   * @returns {Object}
   */
  rowToObject(row, headers) {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = row[index] !== undefined ? row[index] : null;
    });

    return obj;
  }

  /**
   * Normalize header name
   * @param {string} header - Original header
   * @returns {string} Normalized header
   */
  normalizeHeader(header) {
    return header
      .trim()
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/[^\w]/g, '_') // Replace special chars with underscores
      .replace(/_+/g, '_') // Remove duplicate underscores
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .toLowerCase();
  }

  /**
   * Get CSV row count without full parsing
   * @param {string} filePath - Path to CSV file
   * @param {Object} options - Parsing options
   * @returns {Promise<number>}
   */
  async getRowCount(filePath, options = {}) {
    const {
      delimiter = ',',
      encoding = 'utf8',
      hasHeader = true,
      skipEmptyLines = true,
    } = options;

    return new Promise((resolve, reject) => {
      let count = 0;

      const parser = fs
        .createReadStream(filePath, { encoding })
        .pipe(
          parse({
            delimiter,
            skip_empty_lines: skipEmptyLines,
            from_line: hasHeader ? 2 : 1, // Skip header if present
          })
        );

      parser.on('data', () => {
        count++;
      });

      parser.on('error', reject);
      parser.on('end', () => resolve(count));
    });
  }

  /**
   * Ensure all headers are unique by appending suffixes
   * @param {Array} headers - List of normalized headers
   * @returns {Array} Unique headers
   */
  uniquifyHeaders(headers) {
    const counts = {};
    return headers.map((header) => {
      // Handle empty headers
      const base = header || 'unnamed_column';

      if (counts[base] === undefined) {
        counts[base] = 0;
        return base;
      } else {
        counts[base]++;
        return `${base}_${counts[base]}`;
      }
    });
  }
}

export default new CsvParser();
