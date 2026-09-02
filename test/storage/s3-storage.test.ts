import { describe, it, expect, vi, beforeEach } from "vitest";
import { S3StorageBackend } from "../../recording-engine/src/backends/s3-storage.backend.js";
import { MultipartUploadRecoveryService } from "../../recording-engine/src/backends/multipart-recovery.service.js";
import {
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";

describe("S3 Storage Backend (AWS SDK v3 & Elastic Semantics)", () => {
  let mockSend: any;
  let mockClient: any;
  let s3Backend: S3StorageBackend;

  beforeEach(() => {
    mockSend = vi.fn();
    mockClient = {
      send: mockSend,
    };

    s3Backend = new S3StorageBackend({
      id: "node-s3-test",
      bucket: "sentinel-recordings-test",
      region: "us-east-1",
      client: mockClient,
    });
  });

  it("reports elastic capacity without fabricated numeric bounds", async () => {
    mockSend.mockImplementation(async (command: any) => {
      if (command instanceof ListObjectsV2Command) {
        return {
          Contents: [
            { Size: 1024 * 1024 * 50 }, // 50MB
            { Size: 1024 * 1024 * 30 }, // 30MB
          ],
        };
      }
      return {};
    });

    const metrics = await s3Backend.getMetrics();
    expect(metrics.backendKind).toBe("OBJECT_STORE");
    expect(metrics.capacity.type).toBe("ELASTIC");
    expect(metrics.capacity.totalBytes).toBeNull();
    expect(metrics.capacity.availableBytes).toBeNull();
    expect(metrics.capacity.usedBytes).toBe(1024 * 1024 * 80);
    expect(metrics.metricsFreshness).toBe("DELAYED");
  });

  it("runs write probe, puts object with SHA-256 metadata, and verifies with HEAD", async () => {
    let writtenLength = 0;
    mockSend.mockImplementation(async (command: any) => {
      const cmdName = command?.constructor?.name || "";
      if (cmdName === "PutObjectCommand" || command instanceof PutObjectCommand) {
        const body = command.input?.Body;
        writtenLength = Buffer.isBuffer(body) ? body.length : 64;
        return { VersionId: "v-probe-1" };
      }
      if (cmdName === "HeadObjectCommand" || command instanceof HeadObjectCommand) {
        return { ContentLength: writtenLength, Metadata: { sha256: "probe-sha256" } };
      }
      if (cmdName === "DeleteObjectCommand" || command instanceof DeleteObjectCommand) {
        return {};
      }
      return {};
    });

    // Write probe executes without errors
    const probe = await s3Backend.runWriteProbe();
    if (probe.status === "failed") {
      console.error("Probe failed with error:", probe.error);
    }
    expect(probe.status).toBe("passed");
  });


  describe("Multipart Upload Recovery Service", () => {
    it("scans and aborts orphaned multipart uploads exceeding age threshold", async () => {
      const recoveryService = new MultipartUploadRecoveryService(mockClient, "sentinel-recordings-test");

      const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);
      mockSend.mockImplementation(async (command: any) => {
        if (command instanceof ListMultipartUploadsCommand) {
          return {
            Uploads: [
              {
                Key: "recordings/cam-1/abandoned-1.mkv",
                UploadId: "up-old-1",
                Initiated: twoDaysAgo.toISOString(),
              },
              {
                Key: "recordings/cam-1/fresh-2.mkv",
                UploadId: "up-fresh-2",
                Initiated: new Date().toISOString(), // recent upload, not stale
              },
            ],
          };
        }
        if (command instanceof AbortMultipartUploadCommand) {
          return {};
        }
        return {};
      });

      const stale = await recoveryService.listStaleUploads(24);
      expect(stale).toHaveLength(1);
      expect(stale[0]!.uploadId).toBe("up-old-1");

      const cleanup = await recoveryService.cleanupStaleUploads(24);
      expect(cleanup.abortedCount).toBe(1);
      expect(cleanup.errors).toBe(0);
    });
  });
});
