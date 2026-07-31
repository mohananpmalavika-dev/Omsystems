/**
 * Video Encryption Service
 * Encrypt video at rest and in transit
 */

import { IVideoEncryptionService } from '../interfaces';
import { EncryptedVideo, EncryptionConfig, EncryptionAlgorithm, EncryptionKey } from '../types';
import { getDatabase } from '../../config/database';
import { EventEmitter } from 'events';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

export class VideoEncryptionService extends EventEmitter implements IVideoEncryptionService {
  private config: EncryptionConfig = {
    algorithm: EncryptionAlgorithm.AES_256_GCM,
    keySize: 256,
    keyRotationDays: 90,
    compressBeforeEncrypt: true
  };
  private currentKey: EncryptionKey | null = null;

  async setEncryptionConfig(config: EncryptionConfig): Promise<void> {
    this.config = config;
    this.emit('config:updated', config);
  }

  async getEncryptionConfig(): Promise<EncryptionConfig> {
    return this.config;
  }

  /**
   * Encrypt video file
   */
  async encryptVideo(videoId: string, videoPath: string): Promise<EncryptedVideo> {
    const db = getDatabase();
    const fs = require('fs');
    
    try {
      // Get or generate encryption key
      const key = await this.getCurrentKey();
      
      // Generate IV
      const iv = randomBytes(16);
      
      // Create cipher
      const cipher = createCipheriv(
        this.config.algorithm,
        Buffer.from(key.keyBase64, 'base64'),
        iv
      );
      
      // Read original file stats
      const stats = fs.statSync(videoPath);
      const originalSize = stats.size;
      
      // Encrypt file
      const encryptedPath = `${videoPath}.enc`;
      const readStream = createReadStream(videoPath);
      const writeStream = createWriteStream(encryptedPath);
      
      await pipeline(
        readStream,
        cipher,
        writeStream
      );
      
      // Get auth tag (for GCM mode)
      const authTag = (cipher as any).getAuthTag ? (cipher as any).getAuthTag() : Buffer.alloc(0);
      
      // Get encrypted file size
      const encryptedStats = fs.statSync(encryptedPath);
      const encryptedSize = encryptedStats.size;
      
      // Calculate checksum
      const checksum = this.calculateChecksum(encryptedPath);
      
      const encryptedVideo: EncryptedVideo = {
        id: this.generateId(),
        originalVideoId: videoId,
        algorithm: this.config.algorithm,
        keyId: key.id,
        ivBase64: iv.toString('base64'),
        authTagBase64: authTag.toString('base64'),
        encryptedSize,
        originalSize,
        encryptedAt: new Date(),
        encryptedBy: 'system',
        checksum,
        metadata: {
          encryptedPath,
          originalPath: videoPath
        }
      };
      
      await db.collection('encrypted_videos').insertOne(encryptedVideo);
      
      this.emit('video:encrypted', { videoId, encryptedVideoId: encryptedVideo.id });
      
      return encryptedVideo;
    } catch (error) {
      throw new Error(`Video encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt video file
   */
  async decryptVideo(encryptedVideoId: string, outputPath: string): Promise<void> {
    const db = getDatabase();
    
    try {
      const encryptedVideo = await db.collection('encrypted_videos').findOne({ id: encryptedVideoId });
      
      if (!encryptedVideo) {
        throw new Error('Encrypted video not found');
      }
      
      // Get decryption key
      const key = await this.getKeyById(encryptedVideo.keyId);
      
      // Create decipher
      const iv = Buffer.from(encryptedVideo.ivBase64, 'base64');
      const decipher = createDecipheriv(
        encryptedVideo.algorithm,
        Buffer.from(key.keyBase64, 'base64'),
        iv
      );
      
      // Set auth tag (for GCM mode)
      if (encryptedVideo.authTagBase64) {
        const authTag = Buffer.from(encryptedVideo.authTagBase64, 'base64');
        (decipher as any).setAuthTag(authTag);
      }
      
      // Decrypt file
      const encryptedPath = encryptedVideo.metadata.encryptedPath;
      const readStream = createReadStream(encryptedPath);
      const writeStream = createWriteStream(outputPath);
      
      await pipeline(
        readStream,
        decipher,
        writeStream
      );
      
      this.emit('video:decrypted', { encryptedVideoId, outputPath });
    } catch (error) {
      throw new Error(`Video decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate new encryption key
   */
  async generateEncryptionKey(): Promise<EncryptionKey> {
    const db = getDatabase();
    
    const keyBuffer = randomBytes(this.config.keySize / 8);
    
    const key: EncryptionKey = {
      id: this.generateId(),
      algorithm: this.config.algorithm,
      keyBase64: keyBuffer.toString('base64'),
      createdAt: new Date(),
      usageCount: 0,
      purpose: 'video_encryption'
    };
    
    await db.collection('encryption_keys').insertOne(key);
    
    this.currentKey = key;
    this.emit('key:generated', { keyId: key.id });
    
    return key;
  }

  /**
   * Rotate encryption keys
   */
  async rotateKeys(): Promise<void> {
    await this.generateEncryptionKey();
    this.emit('keys:rotated');
  }

  /**
   * Encrypt stream
   */
  encryptStream(inputStream: NodeJS.ReadableStream): NodeJS.ReadableStream {
    const key = randomBytes(32);
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.config.algorithm, key, iv);
    
    return inputStream.pipe(cipher);
  }

  /**
   * Decrypt stream
   */
  decryptStream(inputStream: NodeJS.ReadableStream, keyId: string, ivBase64: string): NodeJS.ReadableStream {
    // This would need to fetch the key and create the decipher
    const iv = Buffer.from(ivBase64, 'base64');
    const key = randomBytes(32); // Placeholder
    const decipher = createDecipheriv(this.config.algorithm, key, iv);
    
    return inputStream.pipe(decipher);
  }

  /**
   * Get encrypted video info
   */
  async getEncryptedVideoInfo(id: string): Promise<EncryptedVideo> {
    const db = getDatabase();
    
    const video = await db.collection('encrypted_videos').findOne({ id });
    
    if (!video) {
      throw new Error('Encrypted video not found');
    }
    
    return video;
  }

  /**
   * Verify integrity of encrypted video
   */
  async verifyIntegrity(encryptedVideoId: string): Promise<boolean> {
    const video = await this.getEncryptedVideoInfo(encryptedVideoId);
    const currentChecksum = this.calculateChecksum(video.metadata.encryptedPath);
    return currentChecksum === video.checksum;
  }

  /**
   * Get current encryption key
   */
  private async getCurrentKey(): Promise<EncryptionKey> {
    if (this.currentKey) {
      const age = Date.now() - this.currentKey.createdAt.getTime();
      const maxAge = this.config.keyRotationDays * 24 * 60 * 60 * 1000;
      
      if (age < maxAge) {
        return this.currentKey;
      }
    }
    
    return await this.generateEncryptionKey();
  }

  /**
   * Get key by ID
   */
  private async getKeyById(keyId: string): Promise<EncryptionKey> {
    const db = getDatabase();
    
    const key = await db.collection('encryption_keys').findOne({ id: keyId });
    
    if (!key) {
      throw new Error('Encryption key not found');
    }
    
    return key;
  }

  /**
   * Calculate file checksum
   */
  private calculateChecksum(filePath: string): string {
    const crypto = require('crypto');
    const fs = require('fs');
    const hash = crypto.createHash('sha256');
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
  }

  private generateId(): string {
    return `enc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const db = getDatabase();
      const totalEncrypted = await db.collection('encrypted_videos').countDocuments();
      const activeKeys = await db.collection('encryption_keys').countDocuments();
      
      return {
        status: 'healthy',
        details: {
          encryptedVideos: totalEncrypted,
          activeKeys,
          algorithm: this.config.algorithm
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }
}
