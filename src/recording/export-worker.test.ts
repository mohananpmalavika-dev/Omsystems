import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Pool } from "pg";
import { ExportWorker } from "./export-worker.js";

describe("ExportWorker", () => {
  let mockPool: Pool;
  let worker: ExportWorker;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    worker = new ExportWorker(mockPool, "/tmp/exports");
  });

  afterEach(() => {
    worker.stop();
  });

  describe("createExportJob", () => {
    it("should create new export job", async () => {
      const mockJob = {
        id: "job-1",
        segment_ids: ["seg-1", "seg-2"],
        format: "viewing-copy",
        status: "pending",
        created_by: "user-1",
        created_at: new Date().toISOString(),
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockJob],
      } as any);

      const result = await worker.createExportJob(
        ["seg-1", "seg-2"],
        "viewing-copy",
        "user-1",
        { includeMetadata: true }
      );

      expect(result.id).toBe("job-1");
      expect(result.status).toBe("pending");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO export_jobs"),
        expect.arrayContaining([["seg-1", "seg-2"], "viewing-copy", "user-1"])
      );
    });

    it("should support all export formats", async () => {
      const formats: Array<"original" | "viewing-copy" | "manifest-only"> = [
        "original",
        "viewing-copy",
        "manifest-only",
      ];

      for (const format of formats) {
        vi.mocked(mockPool.query).mockResolvedValueOnce({
          rows: [{ id: "job-1", format }],
        } as any);

        const result = await worker.createExportJob(
          ["seg-1"],
          format,
          "user-1"
        );

        expect(result.format).toBe(format);
      }
    });

    it("should store export options", async () => {
      const options = {
        includeMetadata: true,
        includeChainOfCustody: true,
        watermark: {
          enabled: true,
          text: "CONFIDENTIAL",
          position: "bottom-right" as const,
        },
        password: "secret123",
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ id: "job-1", options }],
      } as any);

      const result = await worker.createExportJob(
        ["seg-1"],
        "viewing-copy",
        "user-1",
        options
      );

      const callArgs = vi.mocked(mockPool.query).mock.calls[0];
      expect(callArgs[1]).toContain(JSON.stringify(options));
    });

    it("should associate with evidence case", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ id: "job-1", evidence_case_id: "case-1" }],
      } as any);

      const result = await worker.createExportJob(
        ["seg-1"],
        "original",
        "user-1",
        {},
        "case-1"
      );

      expect(result.evidence_case_id).toBe("case-1");
    });
  });

  describe("processExportJob", () => {
    it("should process pending export job", async () => {
      const mockJob = {
        id: "job-1",
        segment_ids: ["seg-1"],
        format: "viewing-copy",
        status: "pending",
      };

      const mockSegments = [
        {
          id: "seg-1",
          file_path: "/storage/seg-1.mp4",
          size_bytes: 10000000,
        },
      ];

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [mockJob] } as any)
        .mockResolvedValueOnce({ rows: mockSegments } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ status: "processing" }] } as any)
        .mockResolvedValueOnce({ rows: [{ status: "completed" }] } as any);

      await worker.processExportJob("job-1");

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE export_jobs"),
        expect.arrayContaining(["job-1"])
      );
    });

    it("should update job status to processing", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({
          rows: [{
            id: "job-1",
            segment_ids: ["seg-1"],
            format: "manifest-only",
          }],
        } as any)
        .mockResolvedValueOnce({ rows: [{ id: "seg-1" }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ status: "processing" }] } as any)
        .mockResolvedValueOnce({ rows: [{ status: "completed" }] } as any);

      await worker.processExportJob("job-1");

      const statusUpdateCall = vi.mocked(mockPool.query).mock.calls.find(
        (call) => call[0].includes("status = 'processing'")
      );
      expect(statusUpdateCall).toBeDefined();
    });

    it("should handle job processing errors", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({
          rows: [{
            id: "job-1",
            segment_ids: ["seg-1"],
            format: "original",
          }],
        } as any)
        .mockRejectedValueOnce(new Error("Processing failed"))
        .mockResolvedValueOnce({
          rows: [{ status: "failed", error: "Processing failed" }],
        } as any);

      await worker.processExportJob("job-1");

      const failedStatusCall = vi.mocked(mockPool.query).mock.calls.find(
        (call) => call[0].includes("status = 'failed'")
      );
      expect(failedStatusCall).toBeDefined();
    });

    it("should set completed_at timestamp on success", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({
          rows: [{
            id: "job-1",
            segment_ids: ["seg-1"],
            format: "manifest-only",
          }],
        } as any)
        .mockResolvedValueOnce({ rows: [{ id: "seg-1" }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ status: "processing" }] } as any)
        .mockResolvedValueOnce({ rows: [{ status: "completed" }] } as any);

      await worker.processExportJob("job-1");

      const completionCall = vi.mocked(mockPool.query).mock.calls.find(
        (call) => call[0].includes("completed_at")
      );
      expect(completionCall).toBeDefined();
    });
  });

  describe("generateManifest", () => {
    it("should generate export manifest", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          camera_id: "cam-1",
          camera_name: "Front Entrance",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
          checksum_sha256: "abc123",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSegments,
      } as any);

      const manifest = await worker.generateManifest(["seg-1"], {
        format: "original",
        exportedBy: "user-1",
        caseId: "case-1",
      });

      expect(manifest.segments).toHaveLength(1);
      expect(manifest.segments[0].id).toBe("seg-1");
      expect(manifest.segments[0].camera_name).toBe("Front Entrance");
      expect(manifest.exportInfo.format).toBe("original");
      expect(manifest.exportInfo.caseId).toBe("case-1");
    });

    it("should include chain of custody if requested", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ id: "seg-1" }] } as any)
        .mockResolvedValueOnce({
          rows: [
            {
              timestamp: "2024-01-01T10:00:00Z",
              action: "recording_started",
              actor: "system",
            },
          ],
        } as any);

      const manifest = await worker.generateManifest(["seg-1"], {
        format: "original",
        exportedBy: "user-1",
        includeChainOfCustody: true,
      });

      expect(manifest.chainOfCustody).toBeDefined();
      expect(manifest.chainOfCustody).toHaveLength(1);
    });

    it("should include metadata if requested", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          codec: "h264",
          bitrate: 4000000,
          fps: 30,
          resolution: "1920x1080",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSegments,
      } as any);

      const manifest = await worker.generateManifest(["seg-1"], {
        format: "original",
        exportedBy: "user-1",
        includeMetadata: true,
      });

      expect(manifest.segments[0].codec).toBe("h264");
      expect(manifest.segments[0].fps).toBe(30);
    });

    it("should calculate manifest hash", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ id: "seg-1", checksum_sha256: "abc123" }],
      } as any);

      const manifest = await worker.generateManifest(["seg-1"], {
        format: "original",
        exportedBy: "user-1",
      });

      expect(manifest.manifestHash).toBeDefined();
      expect(manifest.manifestHash).toHaveLength(64); // SHA-256 hex length
    });
  });

  describe("createDownloadToken", () => {
    it("should create download token for export", async () => {
      const mockToken = {
        id: "token-1",
        export_job_id: "job-1",
        token: "abc123def456",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        max_downloads: 5,
        download_count: 0,
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockToken],
      } as any);

      const result = await worker.createDownloadToken("job-1");

      expect(result.token).toBeDefined();
      expect(result.expires_at).toBeDefined();
      expect(result.max_downloads).toBe(5);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO download_tokens"),
        expect.arrayContaining(["job-1"])
      );
    });

    it("should set expiration to 7 days by default", async () => {
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{
          id: "token-1",
          expires_at: sevenDaysFromNow.toISOString(),
        }],
      } as any);

      const result = await worker.createDownloadToken("job-1");

      const expiresAt = new Date(result.expires_at);
      const diffDays = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBeGreaterThan(6.9);
      expect(diffDays).toBeLessThan(7.1);
    });

    it("should allow custom expiration", async () => {
      const customExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{
          id: "token-1",
          expires_at: customExpiry.toISOString(),
        }],
      } as any);

      await worker.createDownloadToken("job-1", 24 * 60 * 60);

      const callArgs = vi.mocked(mockPool.query).mock.calls[0];
      expect(callArgs[0]).toContain("INTERVAL");
    });

    it("should limit max downloads to 5", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ id: "token-1", max_downloads: 5 }],
      } as any);

      const result = await worker.createDownloadToken("job-1");

      expect(result.max_downloads).toBe(5);
    });
  });

  describe("validateDownloadToken", () => {
    it("should validate unexpired token with remaining downloads", async () => {
      const mockToken = {
        id: "token-1",
        export_job_id: "job-1",
        token: "valid-token",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        max_downloads: 5,
        download_count: 2,
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockToken],
      } as any);

      const result = await worker.validateDownloadToken("valid-token");

      expect(result.isValid).toBe(true);
      expect(result.remainingDownloads).toBe(3);
      expect(result.exportJobId).toBe("job-1");
    });

    it("should reject expired token", async () => {
      const mockToken = {
        id: "token-1",
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        max_downloads: 5,
        download_count: 0,
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockToken],
      } as any);

      const result = await worker.validateDownloadToken("expired-token");

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("expired");
    });

    it("should reject token with exceeded download limit", async () => {
      const mockToken = {
        id: "token-1",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        max_downloads: 5,
        download_count: 5,
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockToken],
      } as any);

      const result = await worker.validateDownloadToken("maxed-token");

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("download limit");
    });

    it("should return invalid for non-existent token", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any);

      const result = await worker.validateDownloadToken("invalid-token");

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("not found");
    });
  });

  describe("incrementDownloadCount", () => {
    it("should increment download count", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ download_count: 3 }],
      } as any);

      await worker.incrementDownloadCount("token-1");

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("download_count = download_count + 1"),
        ["token-1"]
      );
    });

    it("should update last_downloaded_at timestamp", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ last_downloaded_at: new Date().toISOString() }],
      } as any);

      await worker.incrementDownloadCount("token-1");

      const callArgs = vi.mocked(mockPool.query).mock.calls[0];
      expect(callArgs[0]).toContain("last_downloaded_at");
    });
  });

  describe("getExportJobStatus", () => {
    it("should retrieve export job status", async () => {
      const mockJob = {
        id: "job-1",
        status: "completed",
        progress: 100,
        created_at: "2024-01-01T10:00:00Z",
        completed_at: "2024-01-01T10:05:00Z",
        file_size_bytes: 50000000,
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockJob],
      } as any);

      const result = await worker.getExportJobStatus("job-1");

      expect(result.status).toBe("completed");
      expect(result.progress).toBe(100);
      expect(result.file_size_bytes).toBe(50000000);
    });

    it("should return null for non-existent job", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any);

      const result = await worker.getExportJobStatus("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getUserExportJobs", () => {
    it("should retrieve user's export jobs", async () => {
      const mockJobs = [
        {
          id: "job-1",
          format: "viewing-copy",
          status: "completed",
          created_at: "2024-01-01T10:00:00Z",
        },
        {
          id: "job-2",
          format: "original",
          status: "processing",
          created_at: "2024-01-01T11:00:00Z",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockJobs,
      } as any);

      const result = await worker.getUserExportJobs("user-1");

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe("completed");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("created_by = $1"),
        ["user-1"]
      );
    });

    it("should order by creation date descending", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any);

      await worker.getUserExportJobs("user-1");

      const callArgs = vi.mocked(mockPool.query).mock.calls[0];
      expect(callArgs[0]).toContain("ORDER BY created_at DESC");
    });
  });

  describe("cleanupExpiredTokens", () => {
    it("should delete expired download tokens", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ count: 15 }],
      } as any);

      const result = await worker.cleanupExpiredTokens();

      expect(result).toBe(15);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM download_tokens"),
        []
      );
    });

    it("should only delete expired tokens", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ count: 5 }],
      } as any);

      await worker.cleanupExpiredTokens();

      const callArgs = vi.mocked(mockPool.query).mock.calls[0];
      expect(callArgs[0]).toContain("expires_at < NOW()");
    });
  });

  describe("cancelExportJob", () => {
    it("should cancel pending export job", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{
          id: "job-1",
          status: "cancelled",
        }],
      } as any);

      await worker.cancelExportJob("job-1", "user-1");

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'cancelled'"),
        expect.arrayContaining(["job-1"])
      );
    });

    it("should not cancel completed jobs", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any);

      await expect(
        worker.cancelExportJob("job-1", "user-1")
      ).rejects.toThrow();

      const callArgs = vi.mocked(mockPool.query).mock.calls[0];
      expect(callArgs[0]).toContain("status IN ('pending', 'processing')");
    });
  });

  describe("getExportStatistics", () => {
    it("should calculate export statistics", async () => {
      const mockStats = {
        total_exports: 250,
        completed_exports: 230,
        failed_exports: 15,
        pending_exports: 5,
        total_size_bytes: 125000000000,
        avg_export_time_seconds: 180,
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockStats],
      } as any);

      const result = await worker.getExportStatistics();

      expect(result.total_exports).toBe(250);
      expect(result.completed_exports).toBe(230);
      expect(result.total_size_bytes).toBe(125000000000);
    });
  });
});
