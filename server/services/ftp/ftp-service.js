import { Client as FtpClient } from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { config } from '../../config/app.js';
import encryption from '../../utils/encryption.js';
import logger from '../../utils/logger.js';

/**
 * FTP/SFTP Service
 * Handles file operations on FTP/SFTP servers
 */
class FtpService {
  /**
   * Test FTP connection
   * @param {Object} connection - FTP connection document
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  async testConnection(connection) {
    let client = null;

    try {
      client = await this.connect(connection);

      // Try to list root directory
      await this.listFiles(connection, connection.rootPath || '/');

      return {
        success: true,
        error: null,
        message: 'Connection successful',
      };
    } catch (error) {
      logger.error('FTP connection test failed:', error);
      return {
        success: false,
        error: error.message,
        message: 'Connection failed',
      };
    } finally {
      if (client) {
        await this.disconnect(client, connection.protocol);
      }
    }
  }

  /**
   * Connect to FTP/SFTP server
   * @param {Object} connection - FTP connection document
   * @returns {Promise<Object>} FTP client instance
   */
  async connect(connection) {
    const protocol = connection.protocol;

    if (protocol === 'sftp') {
      return this.connectSftp(connection);
    } else {
      return this.connectFtp(connection);
    }
  }

  /**
   * Connect to SFTP server
   */
  async connectSftp(connection) {
    const client = new SftpClient();

    const config = {
      host: connection.host,
      port: connection.port,
      username: connection.username,
      readyTimeout: connection.options?.timeout || 30000,
    };

    // Authentication
    if (connection.privateKey) {
      config.privateKey = encryption.decrypt(connection.privateKey);
      if (connection.passphrase) {
        config.passphrase = encryption.decrypt(connection.passphrase);
      }
    } else if (connection.password) {
      config.password = encryption.decrypt(connection.password);
    }

    await client.connect(config);
    return client;
  }

  /**
   * Connect to FTP/FTPS server
   */
  async connectFtp(connection) {
    const client = new FtpClient();
    client.ftp.timeout = connection.options?.timeout || 30000;

    const secure = connection.protocol === 'ftps';

    await client.access({
      host: connection.host,
      port: connection.port,
      user: connection.username,
      password: encryption.decrypt(connection.password),
      secure: secure,
      secureOptions: secure ? connection.options?.secureOptions : undefined,
    });

    return client;
  }

  /**
   * Disconnect from FTP/SFTP server
   */
  async disconnect(client, protocol) {
    try {
      if (protocol === 'sftp') {
        await client.end();
      } else {
        client.close();
      }
    } catch (error) {
      logger.warn('Error disconnecting from FTP:', error);
    }
  }

  /**
   * List files in directory
   * @param {Object} connection - FTP connection document
   * @param {string} dirPath - Directory path
   * @returns {Promise<Array>} List of files
   */
  async listFiles(connection, dirPath = '/') {
    const client = await this.connect(connection);

    try {
      const fullPath = path.posix.join(connection.rootPath || '/', dirPath);

      if (connection.protocol === 'sftp') {
        const fileList = await client.list(fullPath);
        return fileList
          .filter((file) => file.type === '-') // Only files, not directories
          .map((file) => ({
            name: file.name,
            size: file.size,
            modifiedTime: file.modifyTime,
            path: path.posix.join(fullPath, file.name),
          }));
      } else {
        const fileList = await client.list(fullPath);
        return fileList
          .filter((file) => !file.isDirectory)
          .map((file) => ({
            name: file.name,
            size: file.size,
            modifiedTime: file.modifiedAt,
            path: path.posix.join(fullPath, file.name),
          }));
      }
    } finally {
      await this.disconnect(client, connection.protocol);
    }
  }

  /**
   * Download file from FTP/SFTP to local temp directory
   * @param {Object} connection - FTP connection document
   * @param {string} remotePath - Remote file path
   * @returns {Promise<{localPath: string, checksum: string, size: number}>}
   */
  async downloadFile(connection, remotePath) {
    const client = await this.connect(connection);

    try {
      // Create temp directory if doesn't exist
      const tempDir = config.csv.tempDir;
      await fs.mkdir(tempDir, { recursive: true });

      // Generate unique local filename
      const filename = path.basename(remotePath);
      const timestamp = Date.now();
      const localPath = path.join(tempDir, `${timestamp}_${filename}`);

      const fullRemotePath = path.posix.join(
        connection.rootPath || '/',
        remotePath
      );

      // Download file
      if (connection.protocol === 'sftp') {
        await client.get(fullRemotePath, localPath);
      } else {
        await client.downloadTo(localPath, fullRemotePath);
      }

      // Calculate checksum
      const fileBuffer = await fs.readFile(localPath);
      const checksum = crypto
        .createHash('md5')
        .update(fileBuffer)
        .digest('hex');

      const stats = await fs.stat(localPath);

      logger.info(`File downloaded: ${remotePath} -> ${localPath}`);

      return {
        localPath,
        checksum,
        size: stats.size,
      };
    } finally {
      await this.disconnect(client, connection.protocol);
    }
  }

  /**
   * Delete local temporary file
   * @param {string} localPath - Local file path
   */
  async deleteLocalFile(localPath) {
    try {
      await fs.unlink(localPath);
      logger.info(`Temp file deleted: ${localPath}`);
    } catch (error) {
      logger.warn(`Failed to delete temp file: ${localPath}`, error);
    }
  }

  /**
   * Check if file exists on FTP/SFTP
   * @param {Object} connection - FTP connection document
   * @param {string} remotePath - Remote file path
   * @returns {Promise<boolean>}
   */
  async fileExists(connection, remotePath) {
    const client = await this.connect(connection);

    try {
      const fullRemotePath = path.posix.join(
        connection.rootPath || '/',
        remotePath
      );

      if (connection.protocol === 'sftp') {
        return await client.exists(fullRemotePath);
      } else {
        try {
          await client.size(fullRemotePath);
          return true;
        } catch {
          return false;
        }
      }
    } finally {
      await this.disconnect(client, connection.protocol);
    }
  }
}

export default FtpService;
