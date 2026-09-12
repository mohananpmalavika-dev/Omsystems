import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RecordingGapDetectorService,
  EdgeBackfillCoordinatorService,
  EdgeAutoBackfillAgent,
  EdgeStoreForwardJournal,
  WANStatusMonitor,
} from "../../src/recording/recovery/index.js";
import { registerRecordingRecoveryRoutes } from "../../src/routes/recording-recovery.routes.js";
import Fastify from "fastify";
import type { Pool } from "pg";
import { createHash } from "node:crypto";

describe("Recording Gap Recovery & Edge Backfill Engine (recording.recovery)", () => {
  let dbGaps: any[] = [];
  let dbJobs: any[] = [];
  let dbSegments: any[] = [];
  let dbAudit: any[] = [];

  function createMockPool(): Pool {
    return {
      query: vi.fn(async (sql: string, params: any[] = []) => {
        const s = sql.toLowerCase();

        // 1. SELECT from recording_segments
        if (s.includes("from recording_segments")) {
          const cameraId = params[0];
          const filtered = dbSegments.filter((seg) => seg.camera_id === cameraId);
          return { rows: filtered, rowCount: filtered.length };
        }

        // 2. INSERT into recording_segments
        if (s.includes("insert into recording_segments")) {
          const row = {
            id: params[0],
            tenant_id: params[1],
            node_id: params[2],
            camera_id: params[3],
            started_at: params[4],
            ended_at: params[5],
            duration_seconds: params[6],
            size_bytes: params[7],
            storage_path: params[8],
            storage_uri: params[9],
            checksum_sha256: params[10],
            status: "ready",
            health: "HEALTHY",
            segment_state: "FINALIZED",
          };
          const existingIdx = dbSegments.findIndex((x) => x.id === row.id);
          if (existingIdx >= 0) {
            dbSegments[existingIdx] = row;
          } else {
            dbSegments.push(row);
          }
          return { rows: [row], rowCount: 1 };
        }

        // 3. SELECT from recording_gaps
        if (s.includes("from recording_gaps")) {
          if (s.includes("count(*)")) {
            const openGaps = dbGaps.filter((g) => g.status === "OPEN").length;
            const inProgressGaps = dbGaps.filter((g) => g.status === "IN_PROGRESS").length;
            const healedGaps = dbGaps.filter((g) => g.status === "HEALED").length;
            const unrecoverableGaps = dbGaps.filter((g) => g.status === "UNRECOVERABLE").length;
            const largestGap = dbGaps.reduce((max, g) => Math.max(max, g.gap_duration_seconds || 0), 0);
            const totalLost = dbGaps.reduce((acc, g) => acc + (g.gap_duration_seconds || 0), 0);

            return {
              rows: [
                {
                  total_gaps: dbGaps.length,
                  open_gaps: openGaps,
                  in_progress_gaps: inProgressGaps,
                  healed_gaps: healedGaps,
                  unrecoverable_gaps: unrecoverableGaps,
                  largest_gap_seconds: largestGap,
                  total_lost_seconds: totalLost,
                  count: dbGaps.length,
                },
              ],
              rowCount: 1,
            };
          }

          if (s.includes("where id = $1")) {
            const found = dbGaps.find((g) => g.id === params[0]);
            return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
          }

          let results = [...dbGaps];
          if (params.length > 0 && typeof params[0] === "string" && s.includes("camera_id = $1")) {
            results = results.filter((g) => g.camera_id === params[0]);
          }
          return { rows: results, rowCount: results.length };
        }

        // 4. INSERT into recording_gaps
        if (s.includes("insert into recording_gaps")) {
          const row = {
            id: params[0],
            tenant_id: params[1],
            branch_id: params[2],
            camera_id: params[3],
            start_time: params[4],
            end_time: params[5],
            gap_duration_seconds: params[6],
            reason: params[7],
            status: "OPEN",
            detail: typeof params[8] === "string" ? JSON.parse(params[8]) : params[8],
            healed_at: null,
            healed_by: null,
            backfill_job_id: null,
            segments_recovered_count: 0,
            bytes_recovered: 0,
            detected_at: new Date().toISOString(),
          };
          dbGaps.push(row);
          return { rows: [row], rowCount: 1 };
        }

        // 5. UPDATE recording_gaps
        if (s.includes("update recording_gaps")) {
          if (s.includes("where id = $1")) {
            const found = dbGaps.find((g) => g.id === params[0]);
            if (found) {
              found.status = "HEALED";
              found.healed_at = new Date().toISOString();
              found.healed_by = params[1] || "EDGE_BACKFILL";
              found.backfill_job_id = params[2] || found.backfill_job_id;
              found.segments_recovered_count = (found.segments_recovered_count || 0) + (params[3] || 0);
              found.bytes_recovered = (found.bytes_recovered || 0) + (params[4] || 0);
              found.resolved_at = new Date().toISOString();
              return { rows: [found], rowCount: 1 };
            }
          }
          if (s.includes("where camera_id = $1")) {
            const cameraId = params[0];
            const matching = dbGaps.filter((g) => g.camera_id === cameraId && g.status !== "HEALED");
            for (const g of matching) {
              g.status = "HEALED";
              g.healed_at = new Date().toISOString();
              g.healed_by = "EDGE_BACKFILL";
              g.segments_recovered_count = (g.segments_recovered_count || 0) + 1;
              g.bytes_recovered = (g.bytes_recovered || 0) + (params[4] || 0);
              g.resolved_at = new Date().toISOString();
            }
            return { rows: matching, rowCount: matching.length };
          }
          return { rows: [], rowCount: 0 };
        }

        // 6. recording_backfill_jobs
        if (s.includes("insert into recording_backfill_jobs")) {
          const row = {
            id: params[0],
            tenant_id: params[1],
            branch_id: params[2],
            camera_id: params[3],
            gap_id: params[4],
            status: "IN_PROGRESS",
            trigger_source: params[5],
            window_start: params[6],
            window_end: params[7],
            rate_limit_kbps: params[8] || 0,
            total_segments: 0,
            synced_segments: 0,
            skipped_duplicates: 0,
            reconciled_overlaps: 0,
            failed_segments: 0,
            total_bytes: 0,
            transferred_bytes: 0,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
          };
          dbJobs.push(row);
          return { rows: [row], rowCount: 1 };
        }

        if (s.includes("from recording_backfill_jobs")) {
          if (s.includes("count(*)") || s.includes("total_transferred_bytes") || s.includes("active_jobs")) {
            const active = dbJobs.filter((j) => ["PENDING", "SCANNING", "IN_PROGRESS"].includes(j.status)).length;
            const completed = dbJobs.filter((j) => j.status === "COMPLETED").length;
            const transferred = dbJobs.reduce((acc, j) => acc + (j.transferred_bytes || 0), 0);
            const recoveredSegs = dbJobs.reduce((acc, j) => acc + (j.synced_segments || 0) + (j.reconciled_overlaps || 0), 0);
            const skipped = dbJobs.reduce((acc, j) => acc + (j.skipped_duplicates || 0), 0);
            const overlaps = dbJobs.reduce((acc, j) => acc + (j.reconciled_overlaps || 0), 0);

            return {
              rows: [
                {
                  active_jobs: active,
                  completed_jobs: completed,
                  total_transferred_bytes: transferred,
                  total_recovered_segments: recoveredSegs,
                  total_skipped_duplicates: skipped,
                  total_reconciled_overlaps: overlaps,
                  count: dbJobs.length,
                },
              ],
              rowCount: 1,
            };
          }

          if (s.includes("where id = $1")) {
            const found = dbJobs.find((j) => j.id === params[0]);
            return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
          }
          return { rows: dbJobs, rowCount: dbJobs.length };
        }

        if (s.includes("update recording_backfill_jobs")) {
          const jobId = params[0];
          const found = dbJobs.find((j) => j.id === jobId);
          if (found) {
            if (s.includes("set status = $2")) {
              found.status = params[1];
              found.completed_at = new Date().toISOString();
            } else if (s.includes("set status = 'cancelled'")) {
              found.status = "CANCELLED";
              found.completed_at = new Date().toISOString();
            } else if (s.includes("total_segments = total_segments + $2")) {
              found.total_segments += params[1] || 0;
              found.total_bytes += params[2] || 0;
            } else if (s.includes("synced_segments = synced_segments + $2")) {
              found.synced_segments += params[1] || 0;
              found.skipped_duplicates += params[2] || 0;
              found.reconciled_overlaps += params[3] || 0;
              found.failed_segments += params[4] || 0;
              found.transferred_bytes += params[5] || 0;
            }
            return { rows: [found], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }

        // 7. edge_backfill_audit_log
        if (s.includes("insert into edge_backfill_audit_log")) {
          const row = {
            id: params[0],
            job_id: params[1],
            tenant_id: params[2],
            branch_id: params[3],
            camera_id: params[4],
            segment_id: params[5],
            action: params[6],
            file_size: params[7],
            checksum_sha256: params[8],
            start_time: params[9],
            end_time: params[10],
            details: typeof params[11] === "string" ? JSON.parse(params[11]) : params[11],
            logged_at: new Date().toISOString(),
          };
          dbAudit.push(row);
          return { rows: [row], rowCount: 1 };
        }

        if (s.includes("from edge_backfill_audit_log")) {
          if (s.includes("count(*)")) {
            return { rows: [{ count: dbAudit.length }], rowCount: 1 };
          }
          return { rows: dbAudit, rowCount: dbAudit.length };
        }

        return { rows: [], rowCount: 0 };
      }),
    } as unknown as Pool;
  }

  beforeEach(() => {
    dbGaps = [];
    dbJobs = [];
    dbSegments = [];
    dbAudit = [];
  });

  it("RecordingGapDetectorService detects gaps across fragmented recording segments", async () => {
    const pool = createMockPool();
    const detector = new RecordingGapDetectorService(pool);

    const baseMs = 1700000000000;
    const tenMin = 600 * 1000;

    // Segment 1: min 0 to 10
    dbSegments.push({
      id: "seg-1",
      camera_id: "CAM-NORTH-01",
      started_at: new Date(baseMs).toISOString(),
      ended_at: new Date(baseMs + tenMin).toISOString(),
      duration_seconds: 600,
      status: "ready",
    });

    // Gap: min 10 to 30 (20 min missing)

    // Segment 2: min 30 to 40
    dbSegments.push({
      id: "seg-2",
      camera_id: "CAM-NORTH-01",
      started_at: new Date(baseMs + 30 * 60 * 1000).toISOString(),
      ended_at: new Date(baseMs + 40 * 60 * 1000).toISOString(),
      duration_seconds: 600,
      status: "ready",
    });

    const detected = await detector.scanTimelineGaps({
      tenantId: "tenant-bank-01",
      branchId: "branch-01",
      cameraId: "CAM-NORTH-01",
      startTime: new Date(baseMs).toISOString(),
      endTime: new Date(baseMs + 40 * 60 * 1000).toISOString(),
      toleranceSeconds: 5,
    });

    expect(detected.length).toBe(1);
    expect(detected[0]!.gapDurationSeconds).toBe(20 * 60); // 1200 seconds
    expect(detected[0]!.reason).toBe("NETWORK_DISCONNECTION");
    expect(detected[0]!.status).toBe("OPEN");

    // Check gap metrics
    const metrics = await detector.getGapMetrics({ cameraId: "CAM-NORTH-01" });
    expect(metrics.totalGaps).toBe(1);
    expect(metrics.openGaps).toBe(1);
    expect(metrics.largestGapSeconds).toBe(1200);
    expect(metrics.totalLostSeconds).toBe(1200);
  });

  it("EdgeBackfillCoordinatorService deduplicates exact segments and reconciles partial boundary overlaps", async () => {
    const pool = createMockPool();
    const detector = new RecordingGapDetectorService(pool);
    const coordinator = new EdgeBackfillCoordinatorService(pool, detector);

    const baseMs = 1700000000000;
    const tenMin = 600 * 1000;

    // Existing central segment from min 0 to min 10
    dbSegments.push({
      id: "central-seg-0",
      camera_id: "CAM-SOUTH-01",
      started_at: new Date(baseMs).toISOString(),
      ended_at: new Date(baseMs + tenMin).toISOString(),
      duration_seconds: 600,
      checksum_sha256: "hash-seg-0",
      status: "ready",
    });

    // Create backfill job
    const job = await coordinator.createBackfillJob({
      tenantId: "tenant-01",
      branchId: "branch-01",
      cameraId: "CAM-SOUTH-01",
      windowStart: new Date(baseMs).toISOString(),
      windowEnd: new Date(baseMs + 30 * 60 * 1000).toISOString(),
    });

    expect(job.status).toBe("IN_PROGRESS");

    // Ingest segment 0: exact duplicate (same hash and timestamps)
    const resDuplicate = await coordinator.ingestBackfillSegment({
      jobId: job.id,
      tenantId: "tenant-01",
      branchId: "branch-01",
      cameraId: "CAM-SOUTH-01",
      segmentId: "edge-seg-0",
      startTime: new Date(baseMs).toISOString(),
      endTime: new Date(baseMs + tenMin).toISOString(),
      durationMs: tenMin,
      fileSize: 5000,
      sha256: "hash-seg-0",
      storagePath: "edge/seg_0.mp4",
    });

    expect(resDuplicate.action).toBe("SKIPPED_DUPLICATE");

    // Ingest segment 1: partial boundary overlap (starts at min 8, ends at min 20)
    const resOverlap = await coordinator.ingestBackfillSegment({
      jobId: job.id,
      tenantId: "tenant-01",
      branchId: "branch-01",
      cameraId: "CAM-SOUTH-01",
      segmentId: "edge-seg-1",
      startTime: new Date(baseMs + 8 * 60 * 1000).toISOString(),
      endTime: new Date(baseMs + 20 * 60 * 1000).toISOString(),
      durationMs: 12 * 60 * 1000,
      fileSize: 8000,
      sha256: "hash-seg-1",
      storagePath: "edge/seg_1.mp4",
    });

    expect(resOverlap.action).toBe("OVERLAP_RECONCILED");
    // Boundary adjusted to min 10
    expect(new Date(resOverlap.adjustedStartTime!).getTime()).toBe(baseMs + tenMin);

    // Ingest segment 2: clean backfilled segment (min 20 to min 30)
    const resClean = await coordinator.ingestBackfillSegment({
      jobId: job.id,
      tenantId: "tenant-01",
      branchId: "branch-01",
      cameraId: "CAM-SOUTH-01",
      segmentId: "edge-seg-2",
      startTime: new Date(baseMs + 20 * 60 * 1000).toISOString(),
      endTime: new Date(baseMs + 30 * 60 * 1000).toISOString(),
      durationMs: tenMin,
      fileSize: 6000,
      sha256: "hash-seg-2",
      storagePath: "edge/seg_2.mp4",
    });

    expect(resClean.action).toBe("SYNCHRONIZED");

    // Verify audit logs
    const audit = await coordinator.listAuditEntries({ cameraId: "CAM-SOUTH-01" });
    expect(audit.total).toBe(3);
    expect(audit.items.some((a) => a.action === "SKIPPED_DUPLICATE")).toBe(true);
    expect(audit.items.some((a) => a.action === "OVERLAP_RECONCILED")).toBe(true);
    expect(audit.items.some((a) => a.action === "SYNCHRONIZED")).toBe(true);
  });

  it("EdgeAutoBackfillAgent triggers automatic upload upon WAN recovery event", async () => {
    let linkStatus = false;
    const wanMonitor = new WANStatusMonitor({
      probeFn: async () => linkStatus,
      failureThreshold: 2,
      recoveryThreshold: 2,
      heartbeatIntervalMs: 0,
    });

    const journal = new EdgeStoreForwardJournal();

    // Register offline buffered recording during outage
    journal.registerSegment({
      id: "seg-offline-01",
      tenantId: "tenant-01",
      branchId: "branch-01",
      cameraId: "CAM-VAULT-01",
      startTime: new Date(1700000000000).toISOString(),
      endTime: new Date(1700000600000).toISOString(),
      durationMs: 600000,
      fileSize: 4000,
      sha256: "sha256-offline-01",
      storagePath: "local/seg1.mp4",
    });

    expect(journal.getPendingSyncSegments().length).toBe(1);

    const uploadedSegments: any[] = [];
    const agent = new EdgeAutoBackfillAgent(wanMonitor, journal, {
      customUploader: async (seg) => {
        uploadedSegments.push(seg);
        return { action: "SYNCHRONIZED", message: "Success" };
      },
    });

    // Put into isolated offline state first
    wanMonitor.setState("ISOLATED_OFFLINE");
    expect(wanMonitor.isIsolated()).toBe(true);

    // Simulate WAN coming back up
    linkStatus = true;
    await wanMonitor.probe();
    await wanMonitor.probe(); // Reaches recovery threshold -> fires wan_recovered

    expect(wanMonitor.isOnline()).toBe(true);

    // Give microtask queue time to process
    await new Promise((res) => setTimeout(res, 50));

    expect(uploadedSegments.length).toBe(1);
    expect(uploadedSegments[0].id).toBe("seg-offline-01");
    // Journal should be marked SYNCED
    expect(journal.getPendingSyncSegments().length).toBe(0);
  });

  it("Fastify REST API endpoints handle full recording recovery life-cycle", async () => {
    const pool = createMockPool();
    const app = Fastify();

    const mockStore: any = { pool, db: pool };
    await registerRecordingRecoveryRoutes(app, mockStore);

    // 1. Scan gaps via API
    const scanRes = await app.inject({
      method: "POST",
      url: "/v1/recording/recovery/scan-gaps",
      payload: {
        cameraId: "CAM-ATM-01",
        branchId: "branch-main",
        startTime: new Date(1700000000000).toISOString(),
        endTime: new Date(1700003600000).toISOString(),
        toleranceSeconds: 5,
      },
    });

    expect(scanRes.statusCode).toBe(200);
    const scanBody = scanRes.json();
    expect(scanBody.success).toBe(true);
    expect(scanBody.data.length).toBe(1); // Total gap

    const gapId = scanBody.data[0].id;

    // 2. Query gaps list via API
    const listGapsRes = await app.inject({
      method: "GET",
      url: "/v1/recording/recovery/gaps?cameraId=CAM-ATM-01",
    });

    expect(listGapsRes.statusCode).toBe(200);
    const listBody = listGapsRes.json();
    expect(listBody.data.length).toBe(1);

    // 3. Create a backfill job
    const createJobRes = await app.inject({
      method: "POST",
      url: "/v1/recording/recovery/jobs",
      payload: {
        branchId: "branch-main",
        cameraId: "CAM-ATM-01",
        gapId,
        windowStart: new Date(1700000000000).toISOString(),
        windowEnd: new Date(1700003600000).toISOString(),
        rateLimitKbps: 5000,
      },
    });

    expect(createJobRes.statusCode).toBe(201);
    const job = createJobRes.json().data;
    expect(job.status).toBe("IN_PROGRESS");

    // 4. Ingest backfilled segment chunk via API
    const uploadRes = await app.inject({
      method: "POST",
      url: "/v1/recording/recovery/backfill/upload",
      payload: {
        jobId: job.id,
        branchId: "branch-main",
        cameraId: "CAM-ATM-01",
        segmentId: "backfilled-seg-01",
        startTime: new Date(1700000000000).toISOString(),
        endTime: new Date(1700001800000).toISOString(),
        durationMs: 1800000,
        fileSize: 1200000,
        sha256: createHash("sha256").update("backfill-01").digest("hex"),
        storagePath: "backfill/seg01.mp4",
      },
    });

    expect(uploadRes.statusCode).toBe(200);
    const uploadBody = uploadRes.json();
    expect(uploadBody.data.action).toBe("SYNCHRONIZED");

    // 5. Query recovery stats
    const statsRes = await app.inject({
      method: "GET",
      url: "/v1/recording/recovery/stats",
    });

    expect(statsRes.statusCode).toBe(200);
    const stats = statsRes.json().data;
    expect(stats.totalGaps).toBe(1);
    expect(stats.healedGaps).toBe(1);
    expect(stats.totalBackfilledBytes).toBe(1200000);

    // 6. Query audit logs via API
    const auditRes = await app.inject({
      method: "GET",
      url: "/v1/recording/recovery/audit?cameraId=CAM-ATM-01",
    });

    expect(auditRes.statusCode).toBe(200);
    const auditData = auditRes.json();
    expect(auditData.data.length).toBe(1);
    expect(auditData.data[0].action).toBe("SYNCHRONIZED");
  });
});
