/**
 * S3 Storage Adapter Integration Tests
 * 
 * Prerequisites:
 * - AWS credentials configured (or MinIO/localstack running)
 * - Test bucket created
 * - Set environment variables:
 *   - S3_TEST_BUCKET
 *   - S3_TEST_REGION (optional, default: us-east-1)
 *   - S3_TEST_ENDPOINT (optional, for MinIO/localstack)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createStorageAdapter } from '../src/storage-adapter.js';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

const TEST_BUCKET = process.env.S3_TEST_BUCKET || 'test-sentinel-recordings';
const TEST_REGION = process.env.S3_TEST_REGION || 'us-east-1';
const TEST_ENDPOINT = process.env.S3_TEST_ENDPOINT; // For MinIO/localstack
const TEST_PREFIX = `test-${Date.now()}`;

describe('S3StorageAdapter', () => {
  let adapter: any;
  let localTestDir: string;

  beforeAll(async () => {
    // Create adapter
    adapter = createStorageAdapter({
      recordingRoot: 'not-used-for-s3',
      supportedTiers: ['hot', 'warm', 'cold'],
      storageType: 's3',
      supportedProtocols: ['https', 's3'],
      location: TEST_REGION,
      s3Config: {
        bucket: TEST_BUCKET,
        prefix: TEST_PREFIX,
        region: TEST_REGION,
        endpoint: TEST_ENDPOINT,
        storageClass: 'STANDARD',
        encryption: 'AES256',
        multipartThresholdMB: 5, // Lower threshold for testing
        multipartChunkSizeMB: 2,
        localStagingDir: '/tmp/s3-test-staging'
      }
    });

    // Create local test directory
    localTestDir = `/tmp/s3-adapter-test-${Date.now()}`;
    await mkdir(localTestDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test objects from S3
    try {
      const AWS = require('aws-sdk');
      const s3 = new AWS.S3({
        region: TEST_REGION,
        endpoint: TEST_ENDPOINT,
        s3ForcePathStyle: !!TEST_ENDPOINT
      });

      // List and delete test objects
      const objects = await s3.listObjectsV2({
        Bucket: TEST_BUCKET,
        Prefix: TEST_PREFIX
      }).promise();

      if (objects.Contents && objects.Contents.length > 0) {
        await s3.deleteObjects({
          Bucket: TEST_BUCKET,
          Delete: {
            Objects: objects.Contents.map((obj: any) => ({ Key: obj.Key }))
          }
        }).promise();
      }
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  });

  describe('Configuration', () => {
    it('should initialize with valid configuration', () => {
      expect(adapter).toBeDefined();
    });

    it('should throw error if bucket not provided', () => {
      expect(() => {
        createStorageAdapter({
          recordingRoot: 'test',
          supportedTiers: ['hot'],
          storageType: 's3',
          supportedProtocols: ['https'],
          s3Config: {} // Missing bucket
        });
      }).toThrow('S3StorageAdapter requires bucket configuration');
    });
  });

  describe('Health Checks', () => {
    it('should get storage metrics', async () => {
      const metrics = await adapter.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.storageType).toBe('s3');
      expect(metrics.status).toMatch(/healthy|warning|critical/);
      expect(metrics.capacityBytes).toBeGreaterThan(0);
      expect(metrics.location).toContain(`s3://${TEST_BUCKET}`);
    });

    it('should run write probe successfully', async () => {
      const probe = await adapter.runWriteProbe();

      expect(probe.status).toBe('passed');
      expect(probe.latencyMs).toBeGreaterThan(0);
      expect(probe.bytesWritten).toBeGreaterThan(0);
      expect(probe.checksum).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
    });
  });

  describe('Path Resolution', () => {
    it('should resolve segment target path correctly', () => {
      const cameraId = 'camera-001';
      const startedAt = new Date('2026-08-09T14:30:00Z');
      const fileName = 'segment-001.mp4';

      const path = adapter.resolveSegmentTargetPath(cameraId, startedAt, fileName);

      expect(path).toContain(TEST_PREFIX);
      expect(path).toContain('camera-001');
      expect(path).toContain('2026/08/09/14');
      expect(path).toContain('segment-001.mp4');
    });

    it('should get staging path', async () => {
      const cameraId = 'camera-002';
      const stagingPath = await adapter.getStagingPath(cameraId);

      expect(stagingPath).toBeDefined();
      // Should either be local path or S3 URI
      expect(stagingPath).toMatch(/^(\/|s3:\/\/)/);
    });
  });

  describe('File Operations', () => {
    it('should upload small file (single-part)', async () => {
      // Create test file < 5MB (multipart threshold)
      const testFile = join(localTestDir, 'small-test.mp4');
      const testData = randomBytes(1024 * 1024); // 1MB
      await writeFile(testFile, testData);

      const s3Key = `${TEST_PREFIX}/test/small-test.mp4`;
      const result = await adapter.uploadFile(testFile, s3Key);

      expect(result.etag).toBeDefined();
      expect(result.etag).toMatch(/^"?[a-f0-9]+"?$/);

      // Verify file exists
      const exists = await adapter.exists(s3Key);
      expect(exists).toBe(true);

      // Clean up local file
      await unlink(testFile);
    });

    it('should upload large file (multipart)', async () => {
      // Create test file > 5MB to trigger multipart
      const testFile = join(localTestDir, 'large-test.mp4');
      const testData = randomBytes(6 * 1024 * 1024); // 6MB
      await writeFile(testFile, testData);

      const s3Key = `${TEST_PREFIX}/test/large-test.mp4`;
      const result = await adapter.uploadFile(testFile, s3Key);

      expect(result.etag).toBeDefined();

      // Verify file exists
      const exists = await adapter.exists(s3Key);
      expect(exists).toBe(true);

      // Get metadata
      const metadata = await adapter.getObjectMetadata(s3Key);
      expect(metadata.size).toBe(6 * 1024 * 1024);
      expect(metadata.storageClass).toBe('STANDARD');

      // Clean up local file
      await unlink(testFile);
    });

    it('should download file from S3', async () => {
      // Upload a test file first
      const uploadFile = join(localTestDir, 'upload-test.txt');
      const testContent = 'Test content for download';
      await writeFile(uploadFile, testContent);

      const s3Key = `${TEST_PREFIX}/test/download-test.txt`;
      await adapter.uploadFile(uploadFile, s3Key);

      // Download to different location
      const downloadFile = join(localTestDir, 'download-test.txt');
      await adapter.downloadFile(s3Key, downloadFile);

      // Verify content matches
      const fs = require('fs');
      const downloadedContent = fs.readFileSync(downloadFile, 'utf8');
      expect(downloadedContent).toBe(testContent);

      // Clean up
      await unlink(uploadFile);
      await unlink(downloadFile);
    });

    it('should delete file from S3', async () => {
      // Upload a test file
      const testFile = join(localTestDir, 'delete-test.txt');
      await writeFile(testFile, 'to be deleted');

      const s3Key = `${TEST_PREFIX}/test/delete-test.txt`;
      await adapter.uploadFile(testFile, s3Key);

      // Verify exists
      let exists = await adapter.exists(s3Key);
      expect(exists).toBe(true);

      // Delete
      await adapter.deleteSegmentFile(s3Key);

      // Verify deleted
      exists = await adapter.exists(s3Key);
      expect(exists).toBe(false);

      // Clean up local
      await unlink(testFile);
    });

    it('should check if file exists', async () => {
      const existingKey = `${TEST_PREFIX}/test/existing.txt`;
      const nonExistingKey = `${TEST_PREFIX}/test/non-existing.txt`;

      // Upload a file
      const testFile = join(localTestDir, 'exists-test.txt');
      await writeFile(testFile, 'exists');
      await adapter.uploadFile(testFile, existingKey);

      // Check exists
      const exists = await adapter.exists(existingKey);
      expect(exists).toBe(true);

      // Check non-existing
      const notExists = await adapter.exists(nonExistingKey);
      expect(notExists).toBe(false);

      // Clean up
      await unlink(testFile);
    });

    it('should get object metadata', async () => {
      // Upload a test file
      const testFile = join(localTestDir, 'metadata-test.txt');
      const testContent = 'metadata test content';
      await writeFile(testFile, testContent);

      const s3Key = `${TEST_PREFIX}/test/metadata-test.txt`;
      await adapter.uploadFile(testFile, s3Key);

      // Get metadata
      const metadata = await adapter.getObjectMetadata(s3Key);

      expect(metadata.size).toBe(testContent.length);
      expect(metadata.lastModified).toBeInstanceOf(Date);
      expect(metadata.etag).toBeDefined();
      expect(metadata.storageClass).toBe('STANDARD');

      // Clean up
      await unlink(testFile);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent bucket gracefully', async () => {
      const badAdapter = createStorageAdapter({
        recordingRoot: 'test',
        supportedTiers: ['hot'],
        storageType: 's3',
        supportedProtocols: ['https'],
        s3Config: {
          bucket: 'non-existent-bucket-12345',
          region: TEST_REGION,
          endpoint: TEST_ENDPOINT
        }
      });

      await expect(badAdapter.runWriteProbe()).rejects.toThrow();
    });

    it('should handle upload failure', async () => {
      const testFile = join(localTestDir, 'fail-test.txt');
      await writeFile(testFile, 'test');

      // Try to upload with invalid key (e.g., too long)
      const invalidKey = 'a'.repeat(2000); // Exceeds S3 key length limit

      await expect(
        adapter.uploadFile(testFile, invalidKey)
      ).rejects.toThrow();

      await unlink(testFile);
    });
  });

  describe('Lifecycle Management', () => {
    it('should set lifecycle policy', async () => {
      await expect(
        adapter.setLifecyclePolicy([
          {
            id: 'test-lifecycle',
            prefix: `${TEST_PREFIX}/`,
            transitionDays: [
              { storageClass: 'STANDARD_IA', days: 30 },
              { storageClass: 'GLACIER', days: 90 }
            ],
            expirationDays: 365
          }
        ])
      ).resolves.not.toThrow();

      // Note: Verifying lifecycle policy requires additional S3 API calls
      // and is typically done in integration tests with real AWS accounts
    });
  });

  describe('Performance', () => {
    it('should upload multiple files in parallel', async () => {
      const files = [];
      const uploadPromises = [];

      // Create 5 test files
      for (let i = 0; i < 5; i++) {
        const testFile = join(localTestDir, `parallel-${i}.txt`);
        await writeFile(testFile, `test content ${i}`);
        files.push(testFile);

        const s3Key = `${TEST_PREFIX}/test/parallel-${i}.txt`;
        uploadPromises.push(adapter.uploadFile(testFile, s3Key));
      }

      // Upload all in parallel
      const results = await Promise.all(uploadPromises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.etag).toBeDefined();
      });

      // Clean up
      for (const file of files) {
        await unlink(file);
      }
    });

    it('should handle large multipart upload efficiently', async () => {
      // Create 20MB file to test multipart performance
      const testFile = join(localTestDir, 'perf-test.bin');
      const testData = randomBytes(20 * 1024 * 1024);
      await writeFile(testFile, testData);

      const s3Key = `${TEST_PREFIX}/test/perf-test.bin`;
      
      const startTime = Date.now();
      const result = await adapter.uploadFile(testFile, s3Key);
      const duration = Date.now() - startTime;

      expect(result.etag).toBeDefined();
      console.log(`20MB upload took ${duration}ms`);

      // Clean up
      await unlink(testFile);
    }, 60000); // 60 second timeout for large upload
  });
});
