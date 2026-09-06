import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { ExportWorker } from "../../src/recording/export-worker.js";
import { PersistentFileSigningProvider } from "../../src/evidence/signing/evidence-signing-provider.js";
import { canonicalJsonStringify } from "../../src/evidence-export/services/canonical-json.js";
import type { Pool } from "pg";

const execFileAsync = promisify(execFile);

// Helper to create a genuine test MP4 video using FFmpeg
async function generateTestVideo(filePath: string, durationSeconds: number): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-v", "error",
    "-y",
    "-f", "lavfi",
    "-i", `testsrc=duration=${durationSeconds}:size=320x240:rate=10`,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    filePath,
  ]);
}

interface MockTableData {
  cameras: Map<string, any>;
  recording_segments: any[];
  forensic_export_jobs: Map<string, any>;
  chain_of_custody_events: any[];
  evidence_manifests: Map<string, any>;
}

function createMockPool(data: MockTableData): Pool {
  const executeQuery = async (sql: string, params: any[] = []) => {
    const cleanSql = sql.trim().replace(/\s+/g, " ");

    if (cleanSql.startsWith("BEGIN") || cleanSql.startsWith("COMMIT") || cleanSql.startsWith("ROLLBACK")) {
      return { rows: [], rowCount: 0 };
    }

    if (cleanSql.includes("pg_advisory_xact_lock")) {
      return { rows: [{ locked: true }], rowCount: 1 };
    }

    // SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as bytes FROM recording_segments
    if (cleanSql.includes("COUNT(*) as count") && cleanSql.includes("FROM recording_segments")) {
      const cameraId = params[0];
      const fromTime = new Date(params[1]).getTime();
      const toTime = new Date(params[2]).getTime();

      const matching = data.recording_segments.filter(
        (seg) =>
          seg.camera_id === cameraId &&
          new Date(seg.started_at).getTime() < toTime &&
          new Date(seg.ended_at).getTime() > fromTime &&
          (seg.status === "ready" || !seg.status),
      );

      const totalBytes = matching.reduce((sum, seg) => sum + Number(seg.size_bytes || 0), 0);
      return {
        rows: [{ count: matching.length.toString(), bytes: totalBytes.toString() }],
        rowCount: 1,
      };
    }

    // INSERT INTO forensic_export_jobs
    if (cleanSql.includes("INSERT INTO forensic_export_jobs")) {
      const job = {
        id: params[0],
        case_id: params[1],
        tenant_id: params[2],
        export_type: params[3],
        format: params[4],
        cameras: typeof params[5] === "string" ? JSON.parse(params[5]) : params[5],
        options: typeof params[6] === "string" ? JSON.parse(params[6]) : params[6],
        status: params[7],
        priority: params[8],
        requested_by: params[9],
        reason: params[10],
        total_segments: params[11],
        total_bytes: params[12],
        download_count: 0,
        max_downloads: 5,
        created_at: new Date(),
        updated_at: new Date(),
      };
      data.forensic_export_jobs.set(job.id, job);
      return { rows: [job], rowCount: 1 };
    }

    // UPDATE forensic_export_jobs
    if (cleanSql.includes("UPDATE forensic_export_jobs")) {
      const match = cleanSql.match(/WHERE id = \$(\d+)/);
      if (match) {
        const idIndex = parseInt(match[1]!, 10) - 1;
        const jobId = params[idIndex];
        const job = data.forensic_export_jobs.get(jobId);
        if (job) {
          if (cleanSql.includes("status = 'processing'")) {
            job.status = "processing";
            job.started_at = new Date();
          } else if (cleanSql.includes("status = 'ready'")) {
            job.status = "ready";
            job.output_path = params[1];
            job.output_size_bytes = params[2];
            job.output_hash_sha256 = params[3];
            job.manifest_id = params[4];
            job.download_token = params[5];
            job.download_expires_at = params[6];
            job.completed_at = new Date();
          } else if (cleanSql.includes("status = 'failed'")) {
            job.status = "failed";
            if (cleanSql.includes("WORKER_CRASH_RECOVERY")) {
              job.error_message = `WORKER_CRASH_RECOVERY: Interrupted by worker restart or crash during state ${params[1]}`;
            } else {
              job.error_message = params[1];
            }
          }
          job.updated_at = new Date();
          return { rows: [job], rowCount: 1 };
        }
      }
      // UPDATE with SET status = 'failed' and WHERE id = $1
      return { rows: [], rowCount: 0 };
    }

    // SELECT FROM forensic_export_jobs
    if (cleanSql.includes("FROM forensic_export_jobs")) {
      if (cleanSql.includes("WHERE status IN ('processing', 'transcoding'")) {
        const rows = Array.from(data.forensic_export_jobs.values()).filter((j) =>
          ["processing", "transcoding", "packaging", "signing"].includes(j.status),
        );
        return { rows, rowCount: rows.length };
      }
      const match = cleanSql.match(/WHERE id = \$1/);
      if (match) {
        const job = data.forensic_export_jobs.get(params[0]);
        return { rows: job ? [job] : [], rowCount: job ? 1 : 0 };
      }
    }

    // SELECT rs.*, c.name as camera_name, c.node_id as branch_id FROM recording_segments rs JOIN cameras c
    if (cleanSql.includes("FROM recording_segments rs") && cleanSql.includes("JOIN cameras c")) {
      const cameraId = params[0];
      const fromTime = new Date(params[1]).getTime();
      const toTime = new Date(params[2]).getTime();

      const matching = data.recording_segments
        .filter(
          (seg) =>
            seg.camera_id === cameraId &&
            new Date(seg.started_at).getTime() < toTime &&
            new Date(seg.ended_at).getTime() > fromTime &&
            (seg.status === "ready" || !seg.status),
        )
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
        .map((seg) => {
          const cam = data.cameras.get(seg.camera_id) || { name: "Test Camera", node_id: "BR-01" };
          return {
            ...seg,
            camera_name: cam.name,
            branch_id: cam.node_id,
          };
        });

      return { rows: matching, rowCount: matching.length };
    }

    // SELECT sequence, event_hash FROM chain_of_custody_events
    if (cleanSql.includes("FROM chain_of_custody_events") && cleanSql.includes("ORDER BY sequence DESC LIMIT 1")) {
      const evidenceId = params[0];
      const events = data.chain_of_custody_events
        .filter((e) => e.evidence_id === evidenceId)
        .sort((a, b) => b.sequence - a.sequence);
      return { rows: events.length > 0 ? [events[0]] : [], rowCount: events.length > 0 ? 1 : 0 };
    }

    // INSERT INTO chain_of_custody_events
    if (cleanSql.includes("INSERT INTO chain_of_custody_events")) {
      const record = {
        id: params[0],
        evidence_id: params[1],
        sequence: params[2],
        action: params[3],
        performed_by: params[4],
        actor_type: params[5] || "SYSTEM",
        reason: params[6] || null,
        event_hash: params[7],
        previous_hash: params[8],
        created_at: new Date(),
      };
      data.chain_of_custody_events.push(record);
      return { rows: [record], rowCount: 1 };
    }

    // INSERT INTO evidence_manifests
    if (cleanSql.includes("INSERT INTO evidence_manifests")) {
      const record = {
        id: params[0],
        tenant_id: params[1],
        case_id: params[2],
        destination_file: params[3],
        signature: params[4],
        signing_key_id: params[5],
        created_at: new Date(),
      };
      data.evidence_manifests.set(record.id, record);
      return { rows: [record], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  };

  const client = {
    query: executeQuery,
    release: () => {},
  };

  return {
    query: executeQuery,
    connect: async () => client,
  } as unknown as Pool;
}

describe("KryptoVision — Real FFmpeg Multi-Segment Export & Failure Recovery Suite", () => {
  let tmpDir: string;
  let vaultDir: string;
  let storageDir: string;
  let keyDir: string;
  let mockData: MockTableData;
  let mockPool: Pool;
  let signingProvider: PersistentFileSigningProvider;
  let worker: ExportWorker;

  const segmentPaths: string[] = [];
  const segmentHashes: string[] = [];
  const segmentSizes: number[] = [];

  const baseStartTime = new Date("2026-09-07T14:00:00.000Z");

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kryptovision-ffmpeg-test-"));
    vaultDir = path.join(tmpDir, "vault");
    storageDir = path.join(tmpDir, "storage");
    keyDir = path.join(tmpDir, "keys");

    await fs.mkdir(vaultDir, { recursive: true });
    await fs.mkdir(storageDir, { recursive: true });
    await fs.mkdir(keyDir, { recursive: true });

    process.env.EVIDENCE_VAULT_PATH = vaultDir;
    process.env.RECORDING_STORAGE_ROOT = storageDir;

    signingProvider = new PersistentFileSigningProvider({
      keyDir,
      keyId: "krypton-court-key-01",
      allowDevKeygen: true,
    });

    mockData = {
      cameras: new Map(),
      recording_segments: [],
      forensic_export_jobs: new Map(),
      chain_of_custody_events: [],
      evidence_manifests: new Map(),
    };

    mockData.cameras.set("cam-vault-01", {
      id: "cam-vault-01",
      name: "Bank Vault North Camera",
      node_id: "BR-MUMBAI-MAIN",
    });

    // Generate 5 real 5-second MP4 test video segments
    segmentPaths.length = 0;
    segmentHashes.length = 0;
    segmentSizes.length = 0;

    for (let i = 0; i < 5; i++) {
      const segFile = path.join(storageDir, `segment_${String(i).padStart(3, "0")}.mp4`);
      await generateTestVideo(segFile, 5); // 5 seconds of genuine h264 video
      segmentPaths.push(segFile);

      const fileBuf = await fs.readFile(segFile);
      const sha256 = createHash("sha256").update(fileBuf).digest("hex");
      segmentHashes.push(sha256);
      segmentSizes.push(fileBuf.length);

      const segStart = new Date(baseStartTime.getTime() + i * 5000);
      const segEnd = new Date(baseStartTime.getTime() + (i + 1) * 5000);

      mockData.recording_segments.push({
        id: `seg-00${i}`,
        camera_id: "cam-vault-01",
        storage_path: segFile,
        started_at: segStart.toISOString(),
        ended_at: segEnd.toISOString(),
        size_bytes: fileBuf.length,
        checksum_sha256: sha256,
        status: "ready",
      });
    }

    mockPool = createMockPool(mockData);
    worker = new ExportWorker(mockPool, signingProvider);
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // --------------------------------------------------------------------------
  // P1.2 — Multi-Segment Assembly, Exact Trimming & ffprobe Validation
  // --------------------------------------------------------------------------
  it("P1.2: Multi-segment export concatenates all 5 clips, performs exact trimming, verifies ffprobe and signs manifest", async () => {
    // Request window spanning from 2s into Segment 0 to 3s into Segment 4 (Total ~21s)
    const requestFrom = new Date(baseStartTime.getTime() + 2000).toISOString();
    const requestTo = new Date(baseStartTime.getTime() + 23000).toISOString();

    const job = await worker.createExportJob({
      caseId: "CASE-SBI-2026-VAULT-01",
      tenantId: "TENANT-SBI",
      exportType: "viewing-copy",
      format: "mp4",
      cameras: [{ cameraId: "cam-vault-01", fromTime: requestFrom, toTime: requestTo }],
      requestedBy: "cbi-investigator-deshmukh",
      reason: "Forensic analysis of cash movement",
    });

    expect(job.status).toBe("pending");
    expect(job.totalSegments).toBe(5);

    // Process export
    await worker.processExport(job.id);

    const completedJob = mockData.forensic_export_jobs.get(job.id);
    expect(completedJob.status).toBe("ready");
    expect(completedJob.output_path).toBeDefined();

    // Verify output file exists on disk
    const stat = await fs.stat(completedJob.output_path);
    expect(stat.size).toBeGreaterThan(1000);

    // Independent SHA-256 calculation
    const diskBytes = await fs.readFile(completedJob.output_path);
    const independentHash = createHash("sha256").update(diskBytes).digest("hex");
    expect(completedJob.output_hash_sha256).toBe(independentHash);

    // Run ffprobe on output to verify stream validity and duration
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration,format_name:stream=codec_name,width,height",
      "-of", "json",
      completedJob.output_path,
    ]);

    const probe = JSON.parse(stdout);
    const duration = parseFloat(probe.format.duration);
    // Duration should be approx 21 seconds (23s - 2s)
    expect(duration).toBeGreaterThan(18);
    expect(duration).toBeLessThan(23);
    expect(probe.streams[0].codec_name).toBe("h264");
    expect(probe.streams[0].width).toBe(320);
    expect(probe.streams[0].height).toBe(240);

    // Verify manifest was created and signed
    const manifestPath = path.join(vaultDir, job.id, "manifest.json");
    const manifestRaw = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestRaw);

    expect(manifest.sourceSegments).toHaveLength(5);
    expect(manifest.mediaInfo).toBeDefined();
    expect(manifest.mediaInfo.container).toBeDefined();
    expect(manifest.mediaInfo.videoCodec).toBe("h264");

    // Verify signature
    const sigPath = path.join(vaultDir, job.id, "manifest.sig");
    const sigBase64 = await fs.readFile(sigPath, "utf-8");
    const unsignedManifest = { ...manifest };
    delete unsignedManifest.digitalSignature;
    const canonicalManifest = canonicalJsonStringify(unsignedManifest);
    const manifestDigest = createHash("sha256").update(canonicalManifest, "utf8").digest();
    const isSigValid = await signingProvider.verify(
      manifestDigest,
      Buffer.from(sigBase64.trim(), "base64"),
      manifest.signingKeyId,
    );
    expect(isSigValid).toBe(true);
  });

  // --------------------------------------------------------------------------
  // P1.3 — Missing Segment Test (Physical storage deletion vs database index)
  // --------------------------------------------------------------------------
  it("P1.3: Physically missing segment triggers FAILED_SOURCE_INTEGRITY when strictSourceIntegrity is enabled", async () => {
    // Physically remove segment 2 from storage
    await fs.unlink(segmentPaths[2]!);

    const requestFrom = baseStartTime.toISOString();
    const requestTo = new Date(baseStartTime.getTime() + 25000).toISOString();

    const job = await worker.createExportJob({
      caseId: "CASE-TAMPER-002",
      tenantId: "TENANT-SBI",
      exportType: "viewing-copy",
      format: "mp4",
      cameras: [{ cameraId: "cam-vault-01", fromTime: requestFrom, toTime: requestTo }],
      options: { strictSourceIntegrity: true },
      requestedBy: "auditor-mehta",
      reason: "Strict audit requirement",
    });

    await expect(worker.processExport(job.id)).rejects.toThrow(/FAILED_SOURCE_INTEGRITY/);

    const failedJob = mockData.forensic_export_jobs.get(job.id);
    expect(failedJob.status).toBe("failed");
    expect(failedJob.error_message).toContain("FAILED_SOURCE_INTEGRITY");
  });

  // --------------------------------------------------------------------------
  // P1.4 — Corrupt Segment Test (Byte flip triggers SOURCE_HASH_MISMATCH)
  // --------------------------------------------------------------------------
  it("P1.4: One byte modified in source segment triggers SOURCE_HASH_MISMATCH", async () => {
    // Corrupt segment 1 by modifying byte at offset 50
    const seg1Buf = await fs.readFile(segmentPaths[1]!);
    seg1Buf[50] = seg1Buf[50]! ^ 0xff; // Flip bits
    await fs.writeFile(segmentPaths[1]!, seg1Buf);

    const requestFrom = baseStartTime.toISOString();
    const requestTo = new Date(baseStartTime.getTime() + 25000).toISOString();

    const job = await worker.createExportJob({
      caseId: "CASE-CORRUPTION-003",
      tenantId: "TENANT-SBI",
      exportType: "viewing-copy",
      format: "mp4",
      cameras: [{ cameraId: "cam-vault-01", fromTime: requestFrom, toTime: requestTo }],
      requestedBy: "forensic-lab-officer",
      reason: "Verification of segment hash consistency",
    });

    await expect(worker.processExport(job.id)).rejects.toThrow(/SOURCE_HASH_MISMATCH/);

    const failedJob = mockData.forensic_export_jobs.get(job.id);
    expect(failedJob.status).toBe("failed");
    expect(failedJob.error_message).toContain("SOURCE_HASH_MISMATCH");
    expect(failedJob.error_message).toContain("seg-001");
  });

  // --------------------------------------------------------------------------
  // P1.5 — Crash Recovery (Jobs in-flight during crash/kill marked failed/recoverable)
  // --------------------------------------------------------------------------
  it("P1.5: Worker crash recovery scans in-flight jobs and marks them failed with audit trail", async () => {
    // Insert an in-flight job simulating worker killed by SIGKILL mid-transcode
    const crashedJobId = "job-crashed-mid-flight";
    mockData.forensic_export_jobs.set(crashedJobId, {
      id: crashedJobId,
      case_id: "CASE-CRASH-004",
      tenant_id: "TENANT-SBI",
      status: "transcoding",
      requested_by: "system-admin",
      reason: "Recovery test",
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Simulate worker boot
    const recoveredCount = await worker.recoverIncompleteJobs();
    expect(recoveredCount).toBe(1);

    const recoveredJob = mockData.forensic_export_jobs.get(crashedJobId);
    expect(recoveredJob.status).toBe("failed");
    expect(recoveredJob.error_message).toContain("WORKER_CRASH_RECOVERY");
    expect(recoveredJob.error_message).toContain("transcoding");

    // Verify custody event was appended
    const custodyEvent = mockData.chain_of_custody_events.find(
      (e) => e.evidence_id === "CASE-CRASH-004" && e.action === "worker_crash_recovered",
    );
    expect(custodyEvent).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // P0.5 — Authentic POSIX TAR originals bundle
  // --------------------------------------------------------------------------
  it("P0.5: Originals export generates genuine POSIX ustar TAR archive with unmodified segment bytes", async () => {
    const requestFrom = baseStartTime.toISOString();
    const requestTo = new Date(baseStartTime.getTime() + 15000).toISOString(); // first 3 segments

    const job = await worker.createExportJob({
      caseId: "CASE-ORIGINALS-005",
      tenantId: "TENANT-SBI",
      exportType: "original",
      format: "original",
      cameras: [{ cameraId: "cam-vault-01", fromTime: requestFrom, toTime: requestTo }],
      requestedBy: "court-registrar",
      reason: "Production of raw untouched evidence",
    });

    await worker.processExport(job.id);

    const completedJob = mockData.forensic_export_jobs.get(job.id);
    expect(completedJob.status).toBe("ready");
    expect(completedJob.output_path.endsWith("originals.tar")).toBe(true);

    // Verify tar archive format
    const tarBytes = await fs.readFile(completedJob.output_path);
    expect(tarBytes.length).toBeGreaterThan(1024);

    // Check POSIX ustar magic header at byte 257: "ustar\0"
    const magic = tarBytes.subarray(257, 263).toString("ascii");
    expect(magic).toBe("ustar\0");

    // Independent SHA-256 matches
    const tarSha = createHash("sha256").update(tarBytes).digest("hex");
    expect(completedJob.output_hash_sha256).toBe(tarSha);
  });
});
