/**
 * Comprehensive Unit & Integration Tests for Cold Cloud Archive Export (recording.archive)
 * Tests S3/Glacier client integration, cryptographic SHA-256 verification,
 * automated policy sweeps, Glacier restore lifecycle, audit ledger, and Fastify REST routes.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import type { Pool } from "pg";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  S3GlacierClientService,
  ColdCloudArchiveCoordinatorService,
  type ColdCloudArchiveJob,
  type ArchivePolicy,
} from "../../src/recording/archive/index.js";
import { registerColdCloudArchiveRoutes } from "../../src/routes/cold-cloud-archive.routes.js";

describe("Cold Cloud Archive Export (recording.archive)", () => {
  let dbJobs: any[] = [];
  let dbPolicies: any[] = [];
  let dbAudit: any[] = [];
  let dbIncidents: any[] = [];

  function createMockPool(): Pool {
    return {
      query: vi.fn(async (sql: string, params: any[] = []) => {
        const s = sql.toLowerCase();

        // 0. incidents query
        if (s.includes("from incidents")) {
          if (s.includes("where id = $1") || s.includes("where i.id = $1")) {
            const found = dbIncidents.find((i) => i.id === params[0]);
            return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
          }
          return { rows: [...dbIncidents], rowCount: dbIncidents.length };
        }

        // 1. SELECT from cold_cloud_archive_jobs
        if (s.includes("from cold_cloud_archive_jobs")) {
          if (s.includes("count(*) as total_jobs") || s.includes("count(*) filter")) {
            const archived = dbJobs.filter((j) => j.archive_status === "ARCHIVED");
            const pending = dbJobs.filter((j) => j.archive_status === "PENDING" || j.archive_status === "EXPORTING");
            const failed = dbJobs.filter((j) => j.archive_status === "FAILED");
            const restoring = dbJobs.filter((j) => j.restore_status === "RESTORING" || j.restore_status === "RESTORE_REQUESTED");
            const restored = dbJobs.filter((j) => j.restore_status === "RESTORED");

            const totalBytesArchived = archived.reduce((sum, j) => sum + (j.file_size_bytes || 0), 0);
            const totalBytesGlacier = archived
              .filter((j) => j.storage_tier === "GLACIER")
              .reduce((sum, j) => sum + (j.file_size_bytes || 0), 0);
            const totalBytesDeepArchive = archived
              .filter((j) => j.storage_tier === "DEEP_ARCHIVE")
              .reduce((sum, j) => sum + (j.file_size_bytes || 0), 0);

            return {
              rows: [
                {
                  total_jobs: dbJobs.length,
                  archived_jobs: archived.length,
                  pending_jobs: pending.length,
                  failed_jobs: failed.length,
                  total_bytes_archived: totalBytesArchived,
                  total_bytes_glacier: totalBytesGlacier,
                  total_bytes_deep_archive: totalBytesDeepArchive,
                  active_restores: restoring.length,
                  completed_restores: restored.length,
                },
              ],
              rowCount: 1,
            };
          }

          if (s.includes("where id = $1")) {
            const found = dbJobs.find((j) => j.id === params[0]);
            return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
          }

          if (s.includes("count(*)")) {
            return { rows: [{ count: dbJobs.length }], rowCount: 1 };
          }

          return { rows: [...dbJobs], rowCount: dbJobs.length };
        }

        // 2. INSERT into cold_cloud_archive_jobs
        if (s.includes("insert into cold_cloud_archive_jobs")) {
          const row = {
            id: params[0],
            tenant_id: params[1],
            incident_id: params[2],
            incident_number: params[3],
            camera_id: params[4],
            branch_id: params[5],
            evidence_package_id: params[6],
            clip_id: params[7],
            storage_tier: params[8],
            s3_bucket: params[9],
            s3_key: params[10],
            s3_region: params[11],
            file_size_bytes: params[12],
            checksum_sha256: params[13],
            archive_status: "EXPORTING",
            restore_status: "NONE",
            metadata: typeof params[14] === "string" ? JSON.parse(params[14]) : params[14],
            created_by: params[15],
            created_at: new Date(),
            started_at: new Date(),
          };
          dbJobs.push(row);
          return { rows: [row], rowCount: 1 };
        }

        // 3. UPDATE cold_cloud_archive_jobs
        if (s.includes("update cold_cloud_archive_jobs")) {
          const jobId = params[params.length - 1];
          const idx = dbJobs.findIndex((j) => j.id === jobId);
          if (idx >= 0) {
            if (s.includes("archive_status = 'archived'")) {
              dbJobs[idx].archive_status = "ARCHIVED";
              dbJobs[idx].completed_at = new Date();
              dbJobs[idx].checksum_sha256 = params[0];
              dbJobs[idx].file_size_bytes = params[1];
            } else if (s.includes("restore_status = $1")) {
              dbJobs[idx].restore_status = params[0];
              dbJobs[idx].restore_tier = params[1];
              dbJobs[idx].restore_expires_at = params[2];
              dbJobs[idx].restore_requested_at = new Date();
              if (params[0] === "RESTORED") {
                dbJobs[idx].restore_completed_at = new Date();
              }
            } else if (s.includes("restore_status = 'restored'")) {
              dbJobs[idx].restore_status = "RESTORED";
              dbJobs[idx].restore_completed_at = new Date();
            } else if (s.includes("archive_status = 'failed'")) {
              dbJobs[idx].archive_status = "FAILED";
              dbJobs[idx].error_message = params[0];
            }
            return { rows: [dbJobs[idx]], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }

        // 4. cold_cloud_archive_policies
        if (s.includes("from cold_cloud_archive_policies")) {
          return { rows: [...dbPolicies], rowCount: dbPolicies.length };
        }

        if (s.includes("insert into cold_cloud_archive_policies")) {
          const row = {
            id: params[0],
            tenant_id: params[1],
            name: params[2],
            description: params[3],
            enabled: params[4],
            target_storage_class: params[5],
            target_bucket: params[6],
            target_prefix: params[7],
            trigger_condition: typeof params[8] === "string" ? JSON.parse(params[8]) : params[8],
            encryption_kms_key_id: params[9],
            retention_days: params[10],
            created_by: params[11],
            created_at: new Date(),
            updated_at: new Date(),
          };
          dbPolicies.push(row);
          return { rows: [row], rowCount: 1 };
        }

        // 5. cold_cloud_archive_audit_log
        if (s.includes("insert into cold_cloud_archive_audit_log")) {
          const row = {
            id: "audit-" + (dbAudit.length + 1),
            job_id: params[0],
            tenant_id: params[1],
            incident_id: params[2],
            incident_number: params[3],
            action: params[4],
            operator_id: params[5],
            checksum_sha256: params[6],
            s3_uri: params[7],
            storage_class: params[8],
            details: typeof params[9] === "string" ? JSON.parse(params[9]) : params[9],
            timestamp: new Date(),
          };
          dbAudit.push(row);
          return { rows: [row], rowCount: 1 };
        }

        if (s.includes("from cold_cloud_archive_audit_log")) {
          if (s.includes("count(*)")) {
            return { rows: [{ count: dbAudit.length }], rowCount: 1 };
          }
          return { rows: [...dbAudit], rowCount: dbAudit.length };
        }

        // 6. incidents query
        if (s.includes("from incidents")) {
          if (s.includes("where id = $1")) {
            const found = dbIncidents.find((i) => i.id === params[0]);
            return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
          }
          return { rows: [...dbIncidents], rowCount: dbIncidents.length };
        }

        // 7. incident_clips query
        if (s.includes("from incident_clips")) {
          return { rows: [], rowCount: 0 };
        }

        return { rows: [], rowCount: 0 };
      }) as any,
    } as unknown as Pool;
  }

  function createMockS3Client(): any {
    const s3Storage = new Map<string, { body: Buffer; metadata: any; storageClass: string; restore?: string }>();

    return {
      send: vi.fn(async (cmd: any) => {
        const cmdName = cmd.constructor.name;

        if (cmdName === "PutObjectCommand") {
          const key = `${cmd.input.Bucket}/${cmd.input.Key}`;
          const body = Buffer.isBuffer(cmd.input.Body) ? cmd.input.Body : Buffer.from(cmd.input.Body);
          s3Storage.set(key, {
            body,
            metadata: cmd.input.Metadata || {},
            storageClass: cmd.input.StorageClass || "GLACIER",
          });
          const eTag = createHash("md5").update(body).digest("hex");
          return { ETag: `"${eTag}"`, VersionId: "v1-mock" };
        }

        if (cmdName === "HeadObjectCommand") {
          const key = `${cmd.input.Bucket}/${cmd.input.Key}`;
          const item = s3Storage.get(key);
          if (!item) {
            const err: any = new Error("NotFound");
            err.name = "NotFound";
            throw err;
          }
          return {
            ContentLength: item.body.length,
            StorageClass: item.storageClass,
            Metadata: item.metadata,
            Restore: item.restore,
            ETag: `"${createHash("md5").update(item.body).digest("hex")}"`,
          };
        }

        if (cmdName === "RestoreObjectCommand") {
          const key = `${cmd.input.Bucket}/${cmd.input.Key}`;
          const item = s3Storage.get(key);
          if (!item) throw new Error("NotFound");
          item.restore = 'ongoing-request="true"';
          return {};
        }

        if (cmdName === "GetObjectCommand") {
          const key = `${cmd.input.Bucket}/${cmd.input.Key}`;
          const item = s3Storage.get(key);
          if (!item) throw new Error("NotFound");
          return {
            Body: Readable.from(item.body),
          };
        }

        return {};
      }),
      _storage: s3Storage,
    };
  }

  beforeEach(() => {
    dbJobs = [];
    dbPolicies = [];
    dbAudit = [];
    dbIncidents = [
      {
        id: "inc-001",
        incident_number: "INC-2026-BURGLARY-1",
        status: "archived",
        severity: "CRITICAL",
        branch_id: "branch-central-vault",
        created_at: new Date(Date.now() - 35 * 24 * 3600 * 1000),
      },
      {
        id: "inc-002",
        incident_number: "INC-2026-VAULT-ALERT",
        status: "closed",
        severity: "HIGH",
        branch_id: "branch-east",
        created_at: new Date(Date.now() - 40 * 24 * 3600 * 1000),
      },
    ];
  });

  // ============================================================================
  // UNIT TESTS: S3GlacierClientService
  // ============================================================================
  describe("S3GlacierClientService", () => {
    it("successfully uploads incident video directly to GLACIER with SHA-256 verification", async () => {
      const mockRawClient = createMockS3Client();
      const s3Client = new S3GlacierClientService({ bucket: "test-vault-bucket" }, mockRawClient);

      const fakeVideo = Buffer.from("VIDEO_FRAME_CONTENT_BINARY_MP4_HEADER_TEST_BYTES");
      const sha256 = createHash("sha256").update(fakeVideo).digest("hex");

      const result = await s3Client.uploadIncidentVideo({
        key: "incidents/INC-2026-001/video.mp4",
        data: fakeVideo,
        storageClass: "GLACIER",
        expectedSha256: sha256,
      });

      expect(result.uri).toBe("s3://test-vault-bucket/incidents/INC-2026-001/video.mp4");
      expect(result.storageClass).toBe("GLACIER");
      expect(result.checksumSha256).toBe(sha256);
      expect(result.bytesWritten).toBe(fakeVideo.length);

      // Verify HeadObject verification returns correct storage class
      const head = await s3Client.verifyArchivedObject("test-vault-bucket", "incidents/INC-2026-001/video.mp4");
      expect(head.storageClass).toBe("GLACIER");
      expect(head.contentLength).toBe(fakeVideo.length);
    });

    it("fails upload with integrity error when computed SHA-256 does not match expected hash", async () => {
      const mockRawClient = createMockS3Client();
      const s3Client = new S3GlacierClientService({ bucket: "test-vault-bucket" }, mockRawClient);

      const fakeVideo = Buffer.from("TAMPERED_VIDEO_STREAM");

      await expect(
        s3Client.uploadIncidentVideo({
          key: "incidents/INC-TAMPERED/video.mp4",
          data: fakeVideo,
          storageClass: "DEEP_ARCHIVE",
          expectedSha256: "0000000000000000000000000000000000000000000000000000000000000000",
        })
      ).rejects.toThrow(/Integrity failure/);
    });

    it("initiates Glacier restore and correctly reports restoring header state", async () => {
      const mockRawClient = createMockS3Client();
      const s3Client = new S3GlacierClientService({ bucket: "test-vault-bucket" }, mockRawClient);

      const fakeVideo = Buffer.from("GLACIER_CLIP_RESTORATION_TEST");
      await s3Client.uploadIncidentVideo({
        key: "archive/restore-test.mp4",
        data: fakeVideo,
        storageClass: "GLACIER",
      });

      // Initiate restore
      const restoreRes = await s3Client.initiateGlacierRestore({
        key: "archive/restore-test.mp4",
        tier: "Expedited",
        validityDays: 5,
      });

      expect(restoreRes.status).toBe("ACCEPTED");
      expect(restoreRes.tier).toBe("Expedited");
      expect(restoreRes.estimatedReadyMinutes).toBe(5);

      // Verify restore header query
      const statusRes = await s3Client.checkRestoreStatus("test-vault-bucket", "archive/restore-test.mp4");
      expect(statusRes.status).toBe("RESTORING");

      // Simulate completion by manually setting header
      mockRawClient._storage.get("test-vault-bucket/archive/restore-test.mp4").restore =
        'ongoing-request="false", expiry-date="Fri, 23 Dec 2026 00:00:00 GMT"';

      const restoredStatus = await s3Client.checkRestoreStatus("test-vault-bucket", "archive/restore-test.mp4");
      expect(restoredStatus.status).toBe("RESTORED");
      expect(restoredStatus.expiryDate).toBeDefined();
    });
  });

  // ============================================================================
  // INTEGRATION TESTS: ColdCloudArchiveCoordinatorService
  // ============================================================================
  describe("ColdCloudArchiveCoordinatorService", () => {
    it("creates an archive job, performs upload, transitions state to ARCHIVED, and writes audit log", async () => {
      const pool = createMockPool();
      const mockRawClient = createMockS3Client();
      const s3Client = new S3GlacierClientService({ bucket: "prod-vault" }, mockRawClient);
      const coordinator = new ColdCloudArchiveCoordinatorService(pool, s3Client);

      const videoBuffer = Buffer.from("CRITICAL_EVIDENCE_INCIDENT_BURGLARY_OCT_2026");
      const sha256 = createHash("sha256").update(videoBuffer).digest("hex");

      const job = await coordinator.createArchiveJob(
        "tenant-bank-01",
        {
          incidentId: "inc-001",
          cameraId: "cam-main-vault",
          incidentNumber: "INC-2026-BURGLARY-1",
          storageTier: "DEEP_ARCHIVE",
          videoData: videoBuffer,
        },
        "investigator-smith"
      );

      expect(job.archiveStatus).toBe("ARCHIVED");
      expect(job.storageTier).toBe("DEEP_ARCHIVE");
      expect(job.checksumSha256).toBe(sha256);
      expect(job.s3Bucket).toBe("prod-vault");
      expect(job.s3Key).toContain("INC-2026-BURGLARY-1");

      // Verify audit trail logged
      expect(dbAudit.length).toBeGreaterThanOrEqual(2);
      const tierEvent = dbAudit.find((a) => a.action === "TIERED_TO_GLACIER");
      expect(tierEvent).toBeDefined();
      expect(tierEvent.operator_id).toBe("investigator-smith");
      expect(tierEvent.checksum_sha256).toBe(sha256);
    });

    it("runs automated retention policy sweep and auto-archives eligible marked incidents", async () => {
      const pool = createMockPool();
      const mockRawClient = createMockS3Client();
      const s3Client = new S3GlacierClientService({ bucket: "prod-vault" }, mockRawClient);
      const coordinator = new ColdCloudArchiveCoordinatorService(pool, s3Client);

      // Create an active retention policy
      await coordinator.createPolicy("tenant-bank-01", {
        name: "7-Year Statutory Crime Archive",
        targetStorageClass: "GLACIER",
        targetBucket: "prod-vault",
        retentionDays: 2555,
        triggerCondition: { incidentStatuses: ["archived", "closed"] },
      });

      const sweepResult = await coordinator.runAutomatedArchiveSweep("tenant-bank-01");

      expect(sweepResult.discoveredIncidentsCount).toBe(2);
      expect(sweepResult.createdJobsCount).toBe(2);
      expect(sweepResult.jobIds.length).toBe(2);
      expect(dbJobs.length).toBe(2);
      expect(dbJobs[0].archive_status).toBe("ARCHIVED");
      expect(dbJobs[1].archive_status).toBe("ARCHIVED");
    });

    it("orchestrates Glacier restore lifecycle and tracks completion", async () => {
      const pool = createMockPool();
      const mockRawClient = createMockS3Client();
      const s3Client = new S3GlacierClientService({ bucket: "prod-vault" }, mockRawClient);
      const coordinator = new ColdCloudArchiveCoordinatorService(pool, s3Client);

      // Create archived job
      const videoBuffer = Buffer.from("VIDEO_FOR_RESTORE_TEST");
      const job = await coordinator.createArchiveJob("tenant-bank-01", {
        incidentId: "inc-001",
        cameraId: "cam-vault",
        storageTier: "GLACIER",
        videoData: videoBuffer,
      });

      // Request restore
      const restoringJob = await coordinator.requestGlacierRestore(
        job.id,
        "tenant-bank-01",
        "Standard",
        10,
        "operator-jones"
      );

      expect(restoringJob.restoreStatus).toBe("RESTORING");
      expect(restoringJob.restoreTier).toBe("Standard");
      expect(restoringJob.restoreExpiresAt).toBeDefined();

      // Poll before completion
      const inFlightJob = await coordinator.pollRestoreStatus(job.id, "tenant-bank-01");
      expect(inFlightJob.restoreStatus).toBe("RESTORING");

      // Simulate S3 completing restore
      mockRawClient._storage.get(`prod-vault/${job.s3Key}`).restore =
        'ongoing-request="false", expiry-date="Fri, 23 Dec 2026 00:00:00 GMT"';

      const completedJob = await coordinator.pollRestoreStatus(job.id, "tenant-bank-01");
      expect(completedJob.restoreStatus).toBe("RESTORED");

      // Verify audit entry for restore completed
      const auditEntry = dbAudit.find((a) => a.action === "RESTORE_COMPLETED");
      expect(auditEntry).toBeDefined();
    });

    it("computes live aggregate statistics and cloud cost savings", async () => {
      const pool = createMockPool();
      const mockRawClient = createMockS3Client();
      const s3Client = new S3GlacierClientService({ bucket: "prod-vault" }, mockRawClient);
      const coordinator = new ColdCloudArchiveCoordinatorService(pool, s3Client);

      // Seed 2 jobs in DB (1 in Glacier, 1 in Deep Archive)
      const oneGb = 1024 * 1024 * 1024;
      dbJobs.push({
        id: "job-1",
        tenant_id: "tenant-bank-01",
        archive_status: "ARCHIVED",
        storage_tier: "GLACIER",
        file_size_bytes: 10 * oneGb, // 10 GB
        restore_status: "NONE",
      });
      dbJobs.push({
        id: "job-2",
        tenant_id: "tenant-bank-01",
        archive_status: "ARCHIVED",
        storage_tier: "DEEP_ARCHIVE",
        file_size_bytes: 40 * oneGb, // 40 GB
        restore_status: "RESTORED",
      });

      const stats = await coordinator.getArchiveStatistics("tenant-bank-01");

      expect(stats.totalJobs).toBe(2);
      expect(stats.archivedJobs).toBe(2);
      expect(stats.totalBytesArchived).toBe(50 * oneGb);
      expect(stats.totalBytesGlacier).toBe(10 * oneGb);
      expect(stats.totalBytesDeepArchive).toBe(40 * oneGb);
      expect(stats.completedRestoresCount).toBe(1);
      expect(stats.estimatedMonthlyHotCostUsd).toBeGreaterThan(0);
      expect(stats.estimatedMonthlyColdCostUsd).toBeLessThan(stats.estimatedMonthlyHotCostUsd);
      expect(stats.savingsPercentage).toBeGreaterThanOrEqual(80);
    });
  });

  // ============================================================================
  // REST API ROUTE TESTS (Fastify)
  // ============================================================================
  describe("Fastify REST Routes (/v1/recording/archive/*)", () => {
    let app: any;
    let rawS3Client: any;

    beforeEach(async () => {
      app = Fastify();
      const pool = createMockPool();
      rawS3Client = createMockS3Client();
      const s3Client = new S3GlacierClientService({ bucket: "prod-vault" }, rawS3Client);

      // Provide store with pool and injected clients
      const mockStore = { pool, db: pool };
      const coordinator = new ColdCloudArchiveCoordinatorService(pool, s3Client);
      await registerColdCloudArchiveRoutes(app, mockStore as any, { s3Client, coordinator });
      await app.ready();
    });

    it("GET /v1/recording/archive/jobs returns paginated jobs", async () => {
      dbJobs.push({
        id: "job-api-1",
        tenant_id: "00000000-0000-4000-8000-000000000000",
        incident_id: "inc-001",
        incident_number: "INC-2026-001",
        camera_id: "cam-1",
        storage_tier: "GLACIER",
        s3_bucket: "vault",
        s3_key: "incidents/video.mp4",
        s3_region: "us-east-1",
        file_size_bytes: 1000,
        checksum_sha256: "abc123456",
        archive_status: "ARCHIVED",
        restore_status: "NONE",
        metadata: {},
        created_at: new Date(),
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/recording/archive/jobs",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe("job-api-1");
      expect(body.meta.total).toBe(1);
    });

    it("POST /v1/recording/archive/jobs validates payload and initiates archive", async () => {
      const payload = {
        incidentId: "inc-001",
        cameraId: "cam-entrance",
        incidentNumber: "INC-TEST-99",
        storageTier: "GLACIER",
        videoData: Buffer.from("TEST_API_PAYLOAD_VIDEO").toString("base64"),
      };

      const response = await app.inject({
        method: "POST",
        url: "/v1/recording/archive/jobs",
        payload,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.incidentNumber).toBe("INC-TEST-99");
      expect(body.data.archiveStatus).toBe("ARCHIVED");
      expect(body.data.s3Key).toContain("INC-TEST-99");
    });

    it("POST /v1/recording/archive/jobs/:id/restore triggers Glacier retrieval", async () => {
      // Pre-populate S3 storage so HeadObjectCommand verifies presence
      rawS3Client._storage.set("vault/incidents/video.mp4", {
        body: Buffer.from("SAVED_INCIDENT_VIDEO_CONTENT"),
        metadata: {},
        storageClass: "GLACIER",
      });

      dbJobs.push({
        id: "job-to-restore",
        tenant_id: "00000000-0000-4000-8000-000000000000",
        incident_id: "inc-001",
        incident_number: "INC-2026-001",
        camera_id: "cam-1",
        storage_tier: "GLACIER",
        s3_bucket: "vault",
        s3_key: "incidents/video.mp4",
        s3_region: "us-east-1",
        file_size_bytes: 1000,
        checksum_sha256: "abc123456",
        archive_status: "ARCHIVED",
        restore_status: "NONE",
        metadata: {},
        created_at: new Date(),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/recording/archive/jobs/job-to-restore/restore",
        payload: {
          tier: "Expedited",
          validityDays: 5,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.restoreStatus).toBe("RESTORING");
      expect(body.data.restoreTier).toBe("Expedited");
    });

    it("POST /v1/recording/archive/auto-export triggers automated policy sweep", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/recording/archive/auto-export",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.sweptPoliciesCount).toBeGreaterThanOrEqual(1);
    });

    it("GET /v1/recording/archive/statistics returns storage cost metrics", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/recording/archive/statistics",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.savingsPercentage).toBeDefined();
      expect(body.data.totalJobs).toBeDefined();
    });

    it("GET /v1/recording/archive/audit returns immutable audit log", async () => {
      dbAudit.push({
        id: "audit-1",
        job_id: "job-1",
        tenant_id: "00000000-0000-4000-8000-000000000000",
        action: "TIERED_TO_GLACIER",
        checksum_sha256: "hash-001",
        timestamp: new Date(),
        details: {},
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/recording/archive/audit",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].action).toBe("TIERED_TO_GLACIER");
    });
  });
});
