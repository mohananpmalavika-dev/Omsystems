/**
 * S3 Multipart Upload Recovery Service
 * 
 * Identifies, recovers, or aborts abandoned/stale multipart uploads following process crashes.
 */

import {
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

export interface StaleMultipartUpload {
  bucket: string;
  key: string;
  uploadId: string;
  initiatedAt: Date;
  ageHours: number;
}

export class MultipartUploadRecoveryService {
  constructor(private readonly client: S3Client, private readonly bucket: string) {}

  /**
   * Lists in-progress multipart uploads older than maxAgeHours
   */
  async listStaleUploads(maxAgeHours = 24): Promise<StaleMultipartUpload[]> {
    const stale: StaleMultipartUpload[] = [];
    const now = Date.now();
    const thresholdMs = maxAgeHours * 3600 * 1000;

    try {
      const response = await this.client.send(
        new ListMultipartUploadsCommand({
          Bucket: this.bucket,
        }),
      );

      if (response.Uploads) {
        for (const upload of response.Uploads) {
          if (upload.Key && upload.UploadId && upload.Initiated) {
            const initiatedTime = new Date(upload.Initiated).getTime();
            const ageMs = now - initiatedTime;
            if (ageMs > thresholdMs) {
              stale.push({
                bucket: this.bucket,
                key: upload.Key,
                uploadId: upload.UploadId,
                initiatedAt: new Date(upload.Initiated),
                ageHours: ageMs / (3600 * 1000),
              });
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[MultipartUploadRecoveryService] Failed to list multipart uploads: ${err.message}`);
    }

    return stale;
  }

  /**
   * Aborts a specific orphaned multipart upload
   */
  async abortUpload(key: string, uploadId: string): Promise<boolean> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
      return true;
    } catch (err: any) {
      console.warn(`[MultipartUploadRecoveryService] Failed to abort upload ${uploadId} for key ${key}: ${err.message}`);
      return false;
    }
  }

  /**
   * Cleans up all stale multipart uploads exceeding age threshold
   */
  async cleanupStaleUploads(maxAgeHours = 24): Promise<{ abortedCount: number; errors: number }> {
    const stale = await this.listStaleUploads(maxAgeHours);
    let abortedCount = 0;
    let errors = 0;

    for (const upload of stale) {
      const success = await this.abortUpload(upload.key, upload.uploadId);
      if (success) {
        abortedCount++;
      } else {
        errors++;
      }
    }

    return { abortedCount, errors };
  }
}
