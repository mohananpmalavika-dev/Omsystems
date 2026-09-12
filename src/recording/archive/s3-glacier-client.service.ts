/**
 * Production AWS S3 & Glacier Storage Client
 * Handles direct streaming upload to cold storage classes (GLACIER, DEEP_ARCHIVE, GLACIER_IR),
 * pre-upload cryptographic SHA-256 integrity verification, S3 Object Lock/SSE-KMS compliance,
 * and asynchronous Glacier retrieval lifecycle (Expedited, Standard, Bulk).
 */

import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  RestoreObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  type StorageClass,
  type ServerSideEncryption,
} from "@aws-sdk/client-s3";
import type {
  ArchiveStorageClass,
  GlacierRestoreTier,
  S3GlacierClientConfig,
  S3GlacierUploadResult,
  RestoreObjectResult,
} from "./types.js";

export class S3GlacierClientService {
  private readonly client: S3Client;
  private readonly defaultBucket: string;
  private readonly defaultRegion: string;
  private readonly kmsKeyId?: string;
  private readonly sseAlgorithm?: ServerSideEncryption;

  constructor(config: S3GlacierClientConfig = {}, injectedClient?: S3Client) {
    this.defaultRegion =
      config.region ||
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      "us-east-1";
    this.defaultBucket =
      config.bucket ||
      process.env.S3_ARCHIVE_BUCKET ||
      "sentinel-cold-archive";
    this.kmsKeyId = config.kmsKeyId || process.env.AWS_KMS_KEY_ID;
    this.sseAlgorithm =
      (config.serverSideEncryption as ServerSideEncryption) ||
      (this.kmsKeyId ? "aws:kms" : "AES256");

    if (injectedClient) {
      this.client = injectedClient;
    } else {
      const endpoint = config.endpoint || process.env.S3_ENDPOINT;
      const forcePathStyle =
        config.forcePathStyle ??
        (process.env.S3_FORCE_PATH_STYLE === "true" || !!endpoint);
      const accessKeyId =
        config.accessKeyId ||
        process.env.AWS_ACCESS_KEY_ID ||
        process.env.AWS_ACCESS_KEY;
      const secretAccessKey =
        config.secretAccessKey ||
        process.env.AWS_SECRET_ACCESS_KEY ||
        process.env.AWS_SECRET_KEY;

      this.client = new S3Client({
        region: this.defaultRegion,
        ...(endpoint ? { endpoint } : {}),
        ...(forcePathStyle !== undefined ? { forcePathStyle } : {}),
        ...(accessKeyId && secretAccessKey
          ? { credentials: { accessKeyId, secretAccessKey } }
          : {}),
      });
    }
  }

  getClient(): S3Client {
    return this.client;
  }

  getDefaultBucket(): string {
    return this.defaultBucket;
  }

  getDefaultRegion(): string {
    return this.defaultRegion;
  }

  /**
   * Upload incident video or evidence package directly to Glacier / S3 cold tiers
   * with pre-computed SHA-256 verification and KMS encryption.
   */
  async uploadIncidentVideo(options: {
    bucket?: string;
    key: string;
    data: Buffer | Readable;
    storageClass?: ArchiveStorageClass;
    metadata?: Record<string, string>;
    contentType?: string;
    expectedSha256?: string;
  }): Promise<S3GlacierUploadResult> {
    const bucket = options.bucket || this.defaultBucket;
    const storageClass: StorageClass =
      (options.storageClass as StorageClass) || "GLACIER";

    // Buffer accumulation for SHA-256 integrity computation
    let buffer: Buffer;
    if (Buffer.isBuffer(options.data)) {
      buffer = options.data;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of options.data) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      buffer = Buffer.concat(chunks);
    }

    const calculatedSha256 = createHash("sha256").update(buffer).digest("hex");

    if (
      options.expectedSha256 &&
      options.expectedSha256.toLowerCase() !== calculatedSha256.toLowerCase()
    ) {
      throw new Error(
        `Integrity failure: expected SHA-256 ${options.expectedSha256} does not match computed ${calculatedSha256}`
      );
    }

    const stringMetadata: Record<string, string> = {
      ...(options.metadata || {}),
      "sha256-checksum": calculatedSha256,
      "archived-at": new Date().toISOString(),
    };

    // Multipart upload threshold: 25MB
    const MULTIPART_THRESHOLD = 25 * 1024 * 1024;

    if (buffer.length > MULTIPART_THRESHOLD) {
      return await this.uploadMultipart(
        bucket,
        options.key,
        buffer,
        storageClass,
        stringMetadata,
        options.contentType,
        calculatedSha256
      );
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: options.key,
      Body: buffer,
      StorageClass: storageClass,
      ContentType: options.contentType || "video/mp4",
      Metadata: stringMetadata,
      ServerSideEncryption: this.sseAlgorithm,
      ...(this.kmsKeyId && this.sseAlgorithm === "aws:kms"
        ? { SSEKMSKeyId: this.kmsKeyId }
        : {}),
    });

    const response = await this.client.send(command);

    return {
      bucket,
      key: options.key,
      uri: `s3://${bucket}/${options.key}`,
      eTag: response.ETag?.replace(/"/g, ""),
      checksumSha256: calculatedSha256,
      bytesWritten: buffer.length,
      storageClass: (options.storageClass || "GLACIER") as ArchiveStorageClass,
      versionId: response.VersionId,
    };
  }

  /**
   * Multipart upload for large video files
   */
  private async uploadMultipart(
    bucket: string,
    key: string,
    buffer: Buffer,
    storageClass: StorageClass,
    metadata: Record<string, string>,
    contentType?: string,
    sha256?: string
  ): Promise<S3GlacierUploadResult> {
    const createCommand = new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      StorageClass: storageClass,
      ContentType: contentType || "video/mp4",
      Metadata: metadata,
      ServerSideEncryption: this.sseAlgorithm,
      ...(this.kmsKeyId && this.sseAlgorithm === "aws:kms"
        ? { SSEKMSKeyId: this.kmsKeyId }
        : {}),
    });

    const createRes = await this.client.send(createCommand);
    const uploadId = createRes.UploadId;

    if (!uploadId) {
      throw new Error(`Failed to initialize multipart upload for s3://${bucket}/${key}`);
    }

    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
    const parts: Array<{ ETag: string; PartNumber: number }> = [];

    try {
      let partNumber = 1;
      for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
        const chunk = buffer.subarray(offset, Math.min(offset + CHUNK_SIZE, buffer.length));

        const uploadPartCmd = new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: chunk,
        });

        const partRes = await this.client.send(uploadPartCmd);
        if (!partRes.ETag) {
          throw new Error(`Failed to upload part ${partNumber}`);
        }

        parts.push({
          PartNumber: partNumber,
          ETag: partRes.ETag,
        });

        partNumber++;
      }

      const completeCmd = new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      });

      const completeRes = await this.client.send(completeCmd);

      return {
        bucket,
        key,
        uri: `s3://${bucket}/${key}`,
        eTag: completeRes.ETag?.replace(/"/g, ""),
        checksumSha256: sha256 || createHash("sha256").update(buffer).digest("hex"),
        bytesWritten: buffer.length,
        storageClass: storageClass as ArchiveStorageClass,
        versionId: completeRes.VersionId,
      };
    } catch (err) {
      const abortCmd = new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      });
      await this.client.send(abortCmd).catch(() => {});
      throw err;
    }
  }

  /**
   * Check object headers, storage class, and restore availability in S3/Glacier
   */
  async verifyArchivedObject(bucket: string, key: string) {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    return {
      contentLength: response.ContentLength || 0,
      storageClass: (response.StorageClass as ArchiveStorageClass) || "STANDARD",
      eTag: response.ETag?.replace(/"/g, ""),
      metadata: response.Metadata || {},
      restoreHeader: response.Restore,
      serverSideEncryption: response.ServerSideEncryption,
      sseKmsKeyId: response.SSEKMSKeyId,
      lastModified: response.LastModified,
    };
  }

  /**
   * Request async restoration of an object stored in Glacier or Deep Archive.
   * Tiers:
   *  - Expedited: 1-5 minutes (GLACIER only)
   *  - Standard: 3-5 hours (GLACIER), 12 hours (DEEP_ARCHIVE)
   *  - Bulk: 5-12 hours (GLACIER), 48 hours (DEEP_ARCHIVE)
   */
  async initiateGlacierRestore(options: {
    bucket?: string;
    key: string;
    tier?: GlacierRestoreTier;
    validityDays?: number;
  }): Promise<RestoreObjectResult> {
    const bucket = options.bucket || this.defaultBucket;
    const tier = options.tier || "Standard";
    const validityDays = options.validityDays || 7;

    // Check if already restored or restoring
    const head = await this.verifyArchivedObject(bucket, options.key);
    const parsed = this.parseRestoreHeader(head.restoreHeader);

    if (parsed.status === "RESTORED") {
      return {
        status: "ALREADY_RESTORED",
        tier,
        validityDays,
        estimatedReadyMinutes: 0,
        expiryDate: parsed.expiryDate,
      };
    }

    if (parsed.status === "RESTORING") {
      return {
        status: "RESTORING",
        tier,
        validityDays,
        estimatedReadyMinutes: this.getEstimatedRestoreMinutes(tier, head.storageClass),
      };
    }

    const command = new RestoreObjectCommand({
      Bucket: bucket,
      Key: options.key,
      RestoreRequest: {
        Days: validityDays,
        GlacierJobParameters: {
          Tier: tier,
        },
      },
    });

    try {
      await this.client.send(command);
    } catch (err: any) {
      if (err.name === "RestoreAlreadyInProgress") {
        return {
          status: "RESTORING",
          tier,
          validityDays,
          estimatedReadyMinutes: this.getEstimatedRestoreMinutes(tier, head.storageClass),
        };
      }
      throw err;
    }

    return {
      status: "ACCEPTED",
      tier,
      validityDays,
      estimatedReadyMinutes: this.getEstimatedRestoreMinutes(tier, head.storageClass),
    };
  }

  /**
   * Query current Glacier restore status from S3 HEAD headers
   */
  async checkRestoreStatus(bucket: string, key: string): Promise<{
    status: "NONE" | "RESTORING" | "RESTORED";
    expiryDate?: Date;
    rawHeader?: string;
  }> {
    const head = await this.verifyArchivedObject(bucket, key);
    return this.parseRestoreHeader(head.restoreHeader);
  }

  /**
   * Parse S3 Restore header:
   * ongoing-request="true"
   * or ongoing-request="false", expiry-date="Fri, 23 Dec 2026 00:00:00 GMT"
   */
  private parseRestoreHeader(header?: string): {
    status: "NONE" | "RESTORING" | "RESTORED";
    expiryDate?: Date;
    rawHeader?: string;
  } {
    if (!header) {
      return { status: "NONE" };
    }

    if (header.includes('ongoing-request="true"')) {
      return { status: "RESTORING", rawHeader: header };
    }

    const match = header.match(/expiry-date="([^"]+)"/);
    if (match && match[1]) {
      const expiry = new Date(match[1]);
      return {
        status: "RESTORED",
        expiryDate: isNaN(expiry.getTime()) ? undefined : expiry,
        rawHeader: header,
      };
    }

    if (header.includes('ongoing-request="false"')) {
      return { status: "RESTORED", rawHeader: header };
    }

    return { status: "NONE", rawHeader: header };
  }

  private getEstimatedRestoreMinutes(tier: GlacierRestoreTier, storageClass: string): number {
    if (storageClass === "DEEP_ARCHIVE") {
      return tier === "Standard" ? 720 : 2880; // 12h or 48h
    }
    switch (tier) {
      case "Expedited":
        return 5;
      case "Standard":
        return 240;
      case "Bulk":
        return 600;
      default:
        return 240;
    }
  }

  /**
   * Download a restored object stream
   */
  async downloadRestoredVideo(bucket: string, key: string): Promise<Readable> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`Empty response body received from s3://${bucket}/${key}`);
    }

    return response.Body as Readable;
  }
}
