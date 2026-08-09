import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { storageHealthAgent, type StorageHealthReport } from "./storage-health-agent.js";

export type StorageStatus = "healthy" | "warning" | "critical" | "offline";
export type StorageType = "local-disk" | "nfs" | "smb" | "s3" | "cloud-archive" | "san";
export type RecordingStorageTier = "hot" | "warm" | "cold";

export type RaidStatus = "healthy" | "degraded" | "rebuilding" | "failed" | "unknown";
export interface SmartStats {
  overallStatus: "passed" | "failed" | "unknown";
  reallocatedSectors: number;
  pendingSectors: number;
  uncorrectableSectors: number;
  temperatureCelsius?: number;
  powerOnHours?: number;
  readErrors: number;
  writeErrors: number;
  remainingSsdLifePercent?: number;
  interfaceCrcErrors: number;
}

export interface RaidStats {
  status: RaidStatus;
  level?: string;
  memberDisks: string[];
  failedMembers: string[];
  rebuildProgressPercent?: number;
  hotSpareStatus?: "active" | "inactive" | "unknown";
  controllerHealth?: "healthy" | "warning" | "critical" | "unknown";
}

export interface StorageProbeResult {
  status: "passed" | "failed";
  latencyMs: number;
  bytesWritten: number;
  checksum: string;
  error?: string;
}

export interface StorageMetrics {
  capacityBytes: number;
  usedBytes: number;
  availableBytes: number;
  status: StorageStatus;
  supportedTiers: RecordingStorageTier[];
  storageType: StorageType;
  location?: string;
  supportedProtocols: string[];
  writeMbps?: number;
  readMbps?: number;
  latencyMs?: number;
  temperatureCelsius?: number;
  mountPath: string;
  smart?: SmartStats;
  raid?: RaidStats;
  lastWriteProbe?: StorageProbeResult;
  healthReport?: StorageHealthReport; // Comprehensive storage health from Storage Health Agent
}

export interface StorageDestinationAdapter {
  getMetrics(): Promise<StorageMetrics>;
  getStagingPath(cameraId: string): Promise<string>;
  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string;
  deleteSegmentFile(storagePath: string): Promise<void>;
  runWriteProbe(): Promise<StorageProbeResult>;
}

export interface StorageAdapterOptions {
  recordingRoot: string;
  supportedTiers: RecordingStorageTier[];
  storageType: StorageType;
  supportedProtocols: string[];
  location?: string;
}

const execFileAsync = promisify(execFile);

export class LocalDiskStorageAdapter implements StorageDestinationAdapter {
  constructor(private readonly options: StorageAdapterOptions) {}

  async getMetrics(): Promise<StorageMetrics> {
    const fsStats = await statfs(this.options.recordingRoot);
    const capacityBytes = fsStats.blocks * fsStats.bsize;
    const availableBytes = fsStats.bavail * fsStats.bsize;
    const usedBytes = Math.max(0, capacityBytes - availableBytes);
    const usedPercent = capacityBytes > 0 ? usedBytes / capacityBytes * 100 : 100;
    const status: StorageStatus = usedPercent >= 95
      ? "critical"
      : usedPercent >= 80
        ? "warning"
        : "healthy";

    // Get comprehensive storage health report from Storage Health Agent
    const healthReport = await storageHealthAgent.getHealthReport();

    // Find the disk that matches our mount path
    const mountPath = resolve(this.options.recordingRoot);
    const physicalDisk = healthReport.physicalDisks.find((d) => d.mountPoint === mountPath);

    // Use data from health report for SMART and RAID
    const smart = physicalDisk?.smart ? {
      overallStatus: physicalDisk.smart.overallStatus,
      reallocatedSectors: physicalDisk.smart.reallocatedSectors,
      pendingSectors: physicalDisk.smart.pendingSectors,
      uncorrectableSectors: physicalDisk.smart.uncorrectableSectors,
      temperatureCelsius: physicalDisk.smart.temperatureCelsius,
      powerOnHours: physicalDisk.smart.powerOnHours,
      readErrors: physicalDisk.smart.readErrors,
      writeErrors: physicalDisk.smart.writeErrors,
      remainingSsdLifePercent: physicalDisk.smart.remainingSsdLifePercent,
      interfaceCrcErrors: physicalDisk.smart.interfaceCrcErrors,
    } : undefined;

    // Find RAID array that includes our disk
    const raidArray = healthReport.raidArrays.find((r) => 
      physicalDisk && r.memberDisks.includes(physicalDisk.devicePath)
    );

    const raid = raidArray ? {
      status: raidArray.status,
      level: raidArray.level,
      memberDisks: raidArray.memberDisks,
      failedMembers: raidArray.failedMembers,
      rebuildProgressPercent: raidArray.rebuildProgressPercent,
      hotSpareStatus: raidArray.spareMemberCount && raidArray.spareMemberCount > 0 ? "active" : "inactive",
      controllerHealth: raidArray.controllerHealth,
    } : undefined;

    return {
      capacityBytes,
      availableBytes,
      usedBytes,
      status,
      supportedTiers: this.options.supportedTiers,
      storageType: this.options.storageType,
      location: this.options.location,
      supportedProtocols: this.options.supportedProtocols,
      mountPath,
      smart,
      raid,
      healthReport, // Include full health report for comprehensive monitoring
    };
  }

  async getStagingPath(cameraId: string): Promise<string> {
    const stagingPath = join(resolve(this.options.recordingRoot), safe(cameraId), ".staging");
    await mkdir(stagingPath, { recursive: true });
    return stagingPath;
  }

  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    return join(
      resolve(this.options.recordingRoot),
      safe(cameraId),
      String(startedAt.getUTCFullYear()),
      two(startedAt.getUTCMonth() + 1),
      two(startedAt.getUTCDate()),
      two(startedAt.getUTCHours()),
      fileName,
    );
  }

  async deleteSegmentFile(storagePath: string): Promise<void> {
    const targetPath = resolve(this.options.recordingRoot, storagePath);
    assertInsideRoot(targetPath, this.options.recordingRoot);
    await unlink(targetPath);
  }

  async runWriteProbe(): Promise<StorageProbeResult> {
    const startedAt = Date.now();
    const probeDir = join(resolve(this.options.recordingRoot), ".write-probe");
    const probePath = join(probeDir, `probe-${Date.now()}.bin`);
    const payload = Buffer.from(`sentinel-write-probe:${Date.now()}:${Math.random().toString(36)}`);
    try {
      await mkdir(probeDir, { recursive: true });
      await writeFile(probePath, payload);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const contents = await readFile(probePath);
      if (!contents.equals(payload)) throw new Error("probe_payload_mismatch");
      const checksum = createHash("sha256").update(contents).digest("hex");
      await unlink(probePath);
      return {
        status: "passed",
        latencyMs: Date.now() - startedAt,
        bytesWritten: payload.length,
        checksum,
      };
    } catch (error) {
      await unlink(probePath).catch(() => undefined);
      return {
        status: "failed",
        latencyMs: Date.now() - startedAt,
        bytesWritten: payload.length,
        checksum: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
}

export class NfsStorageAdapter implements StorageDestinationAdapter {
  constructor(private readonly options: StorageAdapterOptions) {}
  
  async getMetrics(): Promise<StorageMetrics> {
    const fsStats = await statfs(this.options.recordingRoot);
    const capacityBytes = fsStats.blocks * fsStats.bsize;
    const availableBytes = fsStats.bavail * fsStats.bsize;
    const usedBytes = Math.max(0, capacityBytes - availableBytes);
    const usedPercent = capacityBytes > 0 ? usedBytes / capacityBytes * 100 : 100;
    const status: StorageStatus = usedPercent >= 95
      ? "critical"
      : usedPercent >= 80
        ? "warning"
        : "healthy";

    // NFS-specific: Get comprehensive storage health report from Storage Health Agent
    const healthReport = await storageHealthAgent.getHealthReport();

    // For NFS, SMART data is not directly available (remote storage)
    // But we can still report basic metrics
    const mountPath = resolve(this.options.recordingRoot);

    return {
      capacityBytes,
      availableBytes,
      usedBytes,
      status,
      supportedTiers: this.options.supportedTiers,
      storageType: this.options.storageType,
      location: this.options.location,
      supportedProtocols: this.options.supportedProtocols,
      mountPath,
      healthReport,
    };
  }

  async runWriteProbe(): Promise<StorageProbeResult> {
    const startedAt = Date.now();
    const probeDir = join(resolve(this.options.recordingRoot), ".write-probe");
    const probePath = join(probeDir, `probe-${Date.now()}.bin`);
    const payload = Buffer.from(`sentinel-write-probe:${Date.now()}:${Math.random().toString(36)}`);
    try {
      await mkdir(probeDir, { recursive: true });
      await writeFile(probePath, payload);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const contents = await readFile(probePath);
      if (!contents.equals(payload)) throw new Error("probe_payload_mismatch");
      const checksum = createHash("sha256").update(contents).digest("hex");
      await unlink(probePath);
      return {
        status: "passed",
        latencyMs: Date.now() - startedAt,
        bytesWritten: payload.length,
        checksum,
      };
    } catch (error) {
      await unlink(probePath).catch(() => undefined);
      return {
        status: "failed",
        latencyMs: Date.now() - startedAt,
        bytesWritten: payload.length,
        checksum: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getStagingPath(cameraId: string): Promise<string> {
    const stagingPath = join(resolve(this.options.recordingRoot), safe(cameraId), ".staging");
    await mkdir(stagingPath, { recursive: true });
    return stagingPath;
  }

  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    return join(
      resolve(this.options.recordingRoot),
      safe(cameraId),
      String(startedAt.getUTCFullYear()),
      two(startedAt.getUTCMonth() + 1),
      two(startedAt.getUTCDate()),
      two(startedAt.getUTCHours()),
      fileName,
    );
  }

  async deleteSegmentFile(storagePath: string): Promise<void> {
    const targetPath = resolve(this.options.recordingRoot, storagePath);
    assertInsideRoot(targetPath, this.options.recordingRoot);
    await unlink(targetPath);
  }
}

export class SmbStorageAdapter implements StorageDestinationAdapter {
  constructor(private readonly options: StorageAdapterOptions) {}
  async getMetrics(): Promise<StorageMetrics> {
    throw new Error("SMB storage adapter is not implemented yet");
  }
  async runWriteProbe(): Promise<StorageProbeResult> {
    throw new Error("SMB storage adapter is not implemented yet");
  }
  async getStagingPath(cameraId: string): Promise<string> {
    throw new Error("SMB storage adapter is not implemented yet");
  }
  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    throw new Error("SMB storage adapter is not implemented yet");
  }
  async deleteSegmentFile(storagePath: string): Promise<void> {
    throw new Error("SMB storage adapter is not implemented yet");
  }
}

/**
 * S3-compatible storage adapter for cloud object storage
 * Supports: AWS S3, MinIO, Wasabi, Backblaze B2, DigitalOcean Spaces
 * 
 * Features:
 * - Multipart uploads for large video files
 * - Server-side encryption (SSE-S3, SSE-KMS, SSE-C)
 * - Lifecycle policies for tiered storage
 * - Intelligent-Tiering support
 * - Cross-region replication ready
 * - Versioning support
 */
export class S3StorageAdapter implements StorageDestinationAdapter {
  private s3Client: any;
  private bucket: string;
  private prefix: string;
  private region: string;
  private storageClass: string;
  private encryption: 'AES256' | 'aws:kms' | null;
  private kmsKeyId?: string;
  private useAccelerateEndpoint: boolean;
  private multipartThresholdBytes: number;
  private multipartChunkSizeBytes: number;
  private localStagingDir?: string;

  constructor(private readonly options: StorageAdapterOptions & { 
    s3Config?: {
      bucket: string;
      prefix?: string;
      region?: string;
      endpoint?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      storageClass?: 'STANDARD' | 'STANDARD_IA' | 'ONEZONE_IA' | 'INTELLIGENT_TIERING' | 'GLACIER' | 'GLACIER_IR' | 'DEEP_ARCHIVE';
      encryption?: 'AES256' | 'aws:kms';
      kmsKeyId?: string;
      useAccelerateEndpoint?: boolean;
      multipartThresholdMB?: number;
      multipartChunkSizeMB?: number;
      localStagingDir?: string;
    }
  }) {
    if (!options.s3Config?.bucket) {
      throw new Error('S3StorageAdapter requires bucket configuration');
    }

    this.bucket = options.s3Config.bucket;
    this.prefix = options.s3Config.prefix || 'recordings';
    this.region = options.s3Config.region || process.env.AWS_REGION || 'us-east-1';
    this.storageClass = options.s3Config.storageClass || 'STANDARD';
    this.encryption = options.s3Config.encryption || 'AES256';
    this.kmsKeyId = options.s3Config.kmsKeyId;
    this.useAccelerateEndpoint = options.s3Config.useAccelerateEndpoint || false;
    this.multipartThresholdBytes = (options.s3Config.multipartThresholdMB || 100) * 1024 * 1024;
    this.multipartChunkSizeBytes = (options.s3Config.multipartChunkSizeMB || 10) * 1024 * 1024;
    this.localStagingDir = options.s3Config.localStagingDir;

    this.initializeS3Client();
  }

  private initializeS3Client(): void {
    try {
      const AWS = require('aws-sdk');
      
      const s3Config: any = {
        region: this.region,
        apiVersion: '2006-03-01',
        maxRetries: 3,
        httpOptions: {
          timeout: 300000, // 5 minutes for large uploads
          connectTimeout: 10000
        }
      };

      // Custom endpoint (for MinIO, Wasabi, etc.)
      if (this.options.s3Config?.endpoint) {
        s3Config.endpoint = this.options.s3Config.endpoint;
        s3Config.s3ForcePathStyle = true; // Required for MinIO
      }

      // Explicit credentials (if provided)
      if (this.options.s3Config?.accessKeyId && this.options.s3Config?.secretAccessKey) {
        s3Config.accessKeyId = this.options.s3Config.accessKeyId;
        s3Config.secretAccessKey = this.options.s3Config.secretAccessKey;
      }

      // S3 Transfer Acceleration
      if (this.useAccelerateEndpoint) {
        s3Config.useAccelerateEndpoint = true;
      }

      this.s3Client = new AWS.S3(s3Config);
      
      console.log(`[S3StorageAdapter] Initialized: bucket=${this.bucket}, region=${this.region}, class=${this.storageClass}`);
    } catch (error: any) {
      throw new Error(`Failed to initialize S3 client: ${error.message}`);
    }
  }

  async getMetrics(): Promise<StorageMetrics> {
    try {
      // Get bucket size and object count from CloudWatch or by listing
      // For performance, we'll use a cached approach or CloudWatch metrics
      
      let capacityBytes = 0;
      let usedBytes = 0;
      let objectCount = 0;

      // Try to get metrics from S3 Storage Lens or CloudWatch
      // For now, estimate based on bucket prefix
      try {
        const objects = await this.s3Client.listObjectsV2({
          Bucket: this.bucket,
          Prefix: this.prefix,
          MaxKeys: 1000 // Sample for estimation
        }).promise();

        objectCount = objects.KeyCount || 0;
        
        // Calculate used bytes from sample
        if (objects.Contents) {
          const sampleSize = objects.Contents.reduce((sum: number, obj: any) => sum + (obj.Size || 0), 0);
          
          // If truncated, estimate total
          if (objects.IsTruncated) {
            // Rough estimate: multiply by approximate pages
            usedBytes = sampleSize * 10; // Conservative estimate
          } else {
            usedBytes = sampleSize;
          }
        }

        // S3 has virtually unlimited capacity
        capacityBytes = 5 * 1024 * 1024 * 1024 * 1024; // 5 PB virtual capacity
      } catch (error: any) {
        console.warn(`[S3StorageAdapter] Failed to get bucket metrics: ${error.message}`);
        // Use defaults
        capacityBytes = 5 * 1024 * 1024 * 1024 * 1024;
        usedBytes = 0;
      }

      const availableBytes = capacityBytes - usedBytes;
      const usedPercent = capacityBytes > 0 ? usedBytes / capacityBytes * 100 : 0;
      
      // S3 is virtually never full, but we can check account quotas
      const status: StorageStatus = usedPercent >= 95 
        ? "critical" 
        : usedPercent >= 80 
          ? "warning" 
          : "healthy";

      return {
        capacityBytes,
        availableBytes,
        usedBytes,
        status,
        supportedTiers: this.options.supportedTiers,
        storageType: this.options.storageType,
        location: `s3://${this.bucket}/${this.prefix}`,
        supportedProtocols: ['https', 's3'],
        mountPath: `s3://${this.bucket}`,
        // S3 doesn't have SMART/RAID stats
      };
    } catch (error: any) {
      throw new Error(`Failed to get S3 metrics: ${error.message}`);
    }
  }

  async runWriteProbe(): Promise<StorageProbeResult> {
    const startedAt = Date.now();
    const probeKey = `${this.prefix}/.write-probe/probe-${Date.now()}.bin`;
    const payload = Buffer.from(`sentinel-write-probe:${Date.now()}:${Math.random().toString(36)}`);

    try {
      // Write probe object
      await this.s3Client.putObject({
        Bucket: this.bucket,
        Key: probeKey,
        Body: payload,
        ContentType: 'application/octet-stream',
        StorageClass: this.storageClass,
        ServerSideEncryption: this.encryption || undefined,
        SSEKMSKeyId: this.kmsKeyId
      }).promise();

      // Small delay to ensure consistency
      await new Promise(resolve => setTimeout(resolve, 10));

      // Read back probe object
      const result = await this.s3Client.getObject({
        Bucket: this.bucket,
        Key: probeKey
      }).promise();

      const contents = Buffer.from(result.Body);
      
      if (!contents.equals(payload)) {
        throw new Error('probe_payload_mismatch');
      }

      const checksum = createHash('sha256').update(contents).digest('hex');

      // Clean up probe object
      await this.s3Client.deleteObject({
        Bucket: this.bucket,
        Key: probeKey
      }).promise();

      return {
        status: 'passed',
        latencyMs: Date.now() - startedAt,
        bytesWritten: payload.length,
        checksum
      };
    } catch (error: any) {
      // Attempt cleanup
      try {
        await this.s3Client.deleteObject({
          Bucket: this.bucket,
          Key: probeKey
        }).promise();
      } catch {}

      return {
        status: 'failed',
        latencyMs: Date.now() - startedAt,
        bytesWritten: payload.length,
        checksum: '',
        error: error.message
      };
    }
  }

  async getStagingPath(cameraId: string): Promise<string> {
    // For S3, we can either:
    // 1. Use local staging directory (if provided)
    // 2. Stage directly to S3 with temp prefix
    
    if (this.localStagingDir) {
      // Use local disk staging
      const stagingPath = join(resolve(this.localStagingDir), safe(cameraId), '.staging');
      await mkdir(stagingPath, { recursive: true });
      return stagingPath;
    } else {
      // Return S3 staging prefix - caller must handle S3 directly
      return `s3://${this.bucket}/${this.prefix}/${safe(cameraId)}/.staging`;
    }
  }

  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    // S3 object key path
    return `${this.prefix}/${safe(cameraId)}/${startedAt.getUTCFullYear()}/${two(startedAt.getUTCMonth() + 1)}/${two(startedAt.getUTCDate())}/${two(startedAt.getUTCHours())}/${fileName}`;
  }

  async deleteSegmentFile(storagePath: string): Promise<void> {
    try {
      // storagePath could be full S3 URI or just key
      let key = storagePath;
      
      if (storagePath.startsWith('s3://')) {
        const url = new URL(storagePath);
        key = url.pathname.substring(1); // Remove leading slash
      }

      await this.s3Client.deleteObject({
        Bucket: this.bucket,
        Key: key
      }).promise();
    } catch (error: any) {
      throw new Error(`Failed to delete S3 object: ${error.message}`);
    }
  }

  /**
   * Upload file to S3 with automatic multipart upload for large files
   */
  async uploadFile(localPath: string, s3Key: string): Promise<{ etag: string; versionId?: string }> {
    try {
      const fileStats = await stat(localPath);
      const fileSize = fileStats.size;

      // Use multipart upload for large files
      if (fileSize > this.multipartThresholdBytes) {
        return await this.multipartUpload(localPath, s3Key, fileSize);
      } else {
        return await this.singlePartUpload(localPath, s3Key);
      }
    } catch (error: any) {
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  /**
   * Single-part upload for small files
   */
  private async singlePartUpload(localPath: string, s3Key: string): Promise<{ etag: string; versionId?: string }> {
    const fileContent = await readFile(localPath);
    
    const result = await this.s3Client.putObject({
      Bucket: this.bucket,
      Key: s3Key,
      Body: fileContent,
      ContentType: 'video/mp4', // Adjust based on file type
      StorageClass: this.storageClass,
      ServerSideEncryption: this.encryption || undefined,
      SSEKMSKeyId: this.kmsKeyId,
      Metadata: {
        'uploaded-at': new Date().toISOString(),
        'upload-method': 'single-part'
      }
    }).promise();

    return {
      etag: result.ETag,
      versionId: result.VersionId
    };
  }

  /**
   * Multipart upload for large files (> 100MB by default)
   */
  private async multipartUpload(localPath: string, s3Key: string, fileSize: number): Promise<{ etag: string; versionId?: string }> {
    // Initiate multipart upload
    const initResult = await this.s3Client.createMultipartUpload({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: 'video/mp4',
      StorageClass: this.storageClass,
      ServerSideEncryption: this.encryption || undefined,
      SSEKMSKeyId: this.kmsKeyId,
      Metadata: {
        'uploaded-at': new Date().toISOString(),
        'upload-method': 'multipart'
      }
    }).promise();

    const uploadId = initResult.UploadId;
    const parts: any[] = [];

    try {
      // Calculate number of parts
      const numParts = Math.ceil(fileSize / this.multipartChunkSizeBytes);

      // Upload parts in parallel (with concurrency limit)
      const concurrency = 4; // Upload 4 parts at a time
      
      for (let i = 0; i < numParts; i += concurrency) {
        const batch = [];
        
        for (let j = 0; j < concurrency && (i + j) < numParts; j++) {
          const partNumber = i + j + 1;
          const start = (i + j) * this.multipartChunkSizeBytes;
          const end = Math.min(start + this.multipartChunkSizeBytes, fileSize);
          
          batch.push(this.uploadPart(localPath, s3Key, uploadId, partNumber, start, end));
        }

        const batchResults = await Promise.all(batch);
        parts.push(...batchResults);
      }

      // Complete multipart upload
      const completeResult = await this.s3Client.completeMultipartUpload({
        Bucket: this.bucket,
        Key: s3Key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber)
        }
      }).promise();

      return {
        etag: completeResult.ETag,
        versionId: completeResult.VersionId
      };
    } catch (error: any) {
      // Abort multipart upload on failure
      try {
        await this.s3Client.abortMultipartUpload({
          Bucket: this.bucket,
          Key: s3Key,
          UploadId: uploadId
        }).promise();
      } catch {}

      throw new Error(`Multipart upload failed: ${error.message}`);
    }
  }

  /**
   * Upload a single part of a multipart upload
   */
  private async uploadPart(
    localPath: string,
    s3Key: string,
    uploadId: string,
    partNumber: number,
    start: number,
    end: number
  ): Promise<{ PartNumber: number; ETag: string }> {
    const fs = require('fs');
    const stream = fs.createReadStream(localPath, { start, end: end - 1 });
    
    const result = await this.s3Client.uploadPart({
      Bucket: this.bucket,
      Key: s3Key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: stream
    }).promise();

    return {
      PartNumber: partNumber,
      ETag: result.ETag
    };
  }

  /**
   * Download file from S3
   */
  async downloadFile(s3Key: string, localPath: string): Promise<void> {
    const fs = require('fs');
    
    const result = await this.s3Client.getObject({
      Bucket: this.bucket,
      Key: s3Key
    }).promise();

    await writeFile(localPath, result.Body);
  }

  /**
   * Check if object exists in S3
   */
  async exists(s3Key: string): Promise<boolean> {
    try {
      await this.s3Client.headObject({
        Bucket: this.bucket,
        Key: s3Key
      }).promise();
      return true;
    } catch (error: any) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get object metadata
   */
  async getObjectMetadata(s3Key: string): Promise<{
    size: number;
    lastModified: Date;
    etag: string;
    storageClass: string;
  }> {
    const result = await this.s3Client.headObject({
      Bucket: this.bucket,
      Key: s3Key
    }).promise();

    return {
      size: result.ContentLength,
      lastModified: new Date(result.LastModified),
      etag: result.ETag,
      storageClass: result.StorageClass
    };
  }

  /**
   * Set lifecycle policy for automatic tiering/expiration
   */
  async setLifecyclePolicy(rules: {
    id: string;
    prefix: string;
    transitionDays?: { storageClass: string; days: number }[];
    expirationDays?: number;
  }[]): Promise<void> {
    const lifecycleRules = rules.map(rule => {
      const lifecycleRule: any = {
        ID: rule.id,
        Status: 'Enabled',
        Filter: {
          Prefix: rule.prefix
        }
      };

      if (rule.transitionDays) {
        lifecycleRule.Transitions = rule.transitionDays.map(t => ({
          Days: t.days,
          StorageClass: t.storageClass
        }));
      }

      if (rule.expirationDays) {
        lifecycleRule.Expiration = {
          Days: rule.expirationDays
        };
      }

      return lifecycleRule;
    });

    await this.s3Client.putBucketLifecycleConfiguration({
      Bucket: this.bucket,
      LifecycleConfiguration: {
        Rules: lifecycleRules
      }
    }).promise();
  }
}

export class CloudArchiveStorageAdapter implements StorageDestinationAdapter {
  constructor(private readonly options: StorageAdapterOptions) {}
  async getMetrics(): Promise<StorageMetrics> {
    throw new Error("Cloud archive storage adapter is not implemented yet");
  }
  async runWriteProbe(): Promise<StorageProbeResult> {
    throw new Error("Cloud archive storage adapter is not implemented yet");
  }
  async getStagingPath(cameraId: string): Promise<string> {
    throw new Error("Cloud archive storage adapter is not implemented yet");
  }
  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    throw new Error("Cloud archive storage adapter is not implemented yet");
  }
  async deleteSegmentFile(storagePath: string): Promise<void> {
    throw new Error("Cloud archive storage adapter is not implemented yet");
  }
}

export class SanStorageAdapter implements StorageDestinationAdapter {
  constructor(private readonly options: StorageAdapterOptions) {}
  async getMetrics(): Promise<StorageMetrics> {
    throw new Error("SAN storage adapter is not implemented yet");
  }
  async runWriteProbe(): Promise<StorageProbeResult> {
    throw new Error("SAN storage adapter is not implemented yet");
  }
  async getStagingPath(cameraId: string): Promise<string> {
    throw new Error("SAN storage adapter is not implemented yet");
  }
  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    throw new Error("SAN storage adapter is not implemented yet");
  }
  async deleteSegmentFile(storagePath: string): Promise<void> {
    throw new Error("SAN storage adapter is not implemented yet");
  }
}

export function createStorageAdapter(options: StorageAdapterOptions & { s3Config?: any; smbConfig?: any; sanConfig?: any; cloudArchiveConfig?: any }): StorageDestinationAdapter {
  switch (options.storageType) {
    case "local-disk":
      return new LocalDiskStorageAdapter(options);
    case "nfs":
      return new NfsStorageAdapter(options);
    case "smb":
      return new SmbStorageAdapter(options);
    case "s3":
      return new S3StorageAdapter(options);
    case "cloud-archive":
      return new CloudArchiveStorageAdapter(options);
    case "san":
      return new SanStorageAdapter(options);
    default:
      throw new Error(`unsupported_storage_type:${options.storageType}`);
  }
}

function safe(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
}

function two(value: number) {
  return String(value).padStart(2, "0");
}

function assertInsideRoot(path: string, root: string) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + sep)) {
    throw new Error("invalid_storage_path");
  }
}
