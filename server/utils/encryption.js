import CryptoJS from 'crypto-js';
import { config } from '../config/app.js';

/**
 * Encryption utility for sensitive data (FTP credentials)
 */
class EncryptionService {
  constructor() {
    this.key = config.encryption.key;
  }

  /**
   * Encrypt data using AES-256
   * @param {string} data - Data to encrypt
   * @returns {string} Encrypted string
   */
  encrypt(data) {
    if (!data) return null;
    return CryptoJS.AES.encrypt(data, this.key).toString();
  }

  /**
   * Decrypt AES-256 encrypted data
   * @param {string} encryptedData - Encrypted string
   * @returns {string} Decrypted data
   */
  decrypt(encryptedData) {
    if (!encryptedData) return null;
    const bytes = CryptoJS.AES.decrypt(encryptedData, this.key);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  /**
   * Encrypt object properties
   * @param {object} obj - Object with properties to encrypt
   * @param {string[]} fields - Fields to encrypt
   * @returns {object} Object with encrypted fields
   */
  encryptFields(obj, fields) {
    const encrypted = { ...obj };
    fields.forEach((field) => {
      if (encrypted[field]) {
        encrypted[field] = this.encrypt(encrypted[field]);
      }
    });
    return encrypted;
  }

  /**
   * Decrypt object properties
   * @param {object} obj - Object with encrypted properties
   * @param {string[]} fields - Fields to decrypt
   * @returns {object} Object with decrypted fields
   */
  decryptFields(obj, fields) {
    const decrypted = { ...obj };
    fields.forEach((field) => {
      if (decrypted[field]) {
        decrypted[field] = this.decrypt(decrypted[field]);
      }
    });
    return decrypted;
  }
}

export default new EncryptionService();
