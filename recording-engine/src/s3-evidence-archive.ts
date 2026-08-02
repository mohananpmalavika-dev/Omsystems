import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import {
  HeadObjectCommand,
  ObjectLockMode,
  PutObjectCommand,
  S3Client,
  ServerSideEncryption,
} from "@aws-sdk/client-s3";
import type { EvidenceArchive, EvidenceArchiveAsset } from "./alert-evidence-capture.js";

export interface S3EvidenceArchiveOptions {
  bucket: string;
  region: string;
  prefix?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  serverSideEncryption?: "AES256" | "aws:kms";
  kmsKeyId?: string;
  objectLockDays?: number;
}

/**
 * Writes alert evidence to S3-compatible object storage, then verifies the
 * resulting object length and SHA-256 metadata before reporting success.
 */
export class S3EvidenceArchive implements EvidenceArchive {
  private readonly client: S3Client;
  private readonly prefix: string;

  constructor(private readonly options: S3EvidenceArchiveOptions) {
    this.prefix = (options.prefix ?? "sentinel/evidence").replace(/^\/+|\/+$/g, "");
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.forcePathStyle !== undefined ? { forcePathStyle: options.forcePathStyle } : {}),
      ...(options.accessKeyId && options.secretAccessKey
        ? { credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } }
        : {}),
    });
  }

  async archiveAsset(input: Parameters<EvidenceArchive["archiveAsset"]>[0]): Promise<EvidenceArchiveAsset> {
    const details = await stat(input.path);
    if (!details.isFile() || details.size === 0) throw new Error("evidence_asset_empty");

    const checksumHex = createHash("sha256").update(await readFile(input.path)).digest("hex");
    const occurredAt = new Date(input.occurredAt);
    const day = Number.isNaN(occurredAt.valueOf()) ? new Date() : occurredAt;
    const alertHash = createHash("sha256").update(input.alertId).digest("hex");
    const extension = input.kind === "snapshot" ? "jpg" : "mp4";
    const key = [
      this.prefix,
      String(day.getUTCFullYear()),
      String(day.getUTCMonth() + 1).padStart(2, "0"),
      String(day.getUTCDate()).padStart(2, "0"),
      alertHash,
      `${input.kind}.${extension}`,
    ].filter(Boolean).join("/");
    const retainUntilDate = this.options.objectLockDays
      ? new Date(Date.now() + this.options.objectLockDays * 86_400_000)
      : undefined;

    await this.client.send(new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: key,
      Body: createReadStream(input.path),
      ContentLength: details.size,
      ContentType: input.contentType,
      Metadata: {
        sha256: checksumHex,
        camera: createHash("sha256").update(input.cameraId).digest("hex"),
      },
      ...(this.options.serverSideEncryption
        ? { ServerSideEncryption: this.options.serverSideEncryption as ServerSideEncryption }
        : {}),
      ...(this.options.kmsKeyId ? { SSEKMSKeyId: this.options.kmsKeyId } : {}),
      ...(retainUntilDate
        ? { ObjectLockMode: ObjectLockMode.GOVERNANCE, ObjectLockRetainUntilDate: retainUntilDate }
        : {}),
    }));

    const verified = await this.client.send(new HeadObjectCommand({
      Bucket: this.options.bucket,
      Key: key,
    }));
    if (verified.ContentLength !== details.size || verified.Metadata?.sha256 !== checksumHex) {
      throw new Error("evidence_archive_verification_failed");
    }
    return { provider: "s3", key };
  }
}
