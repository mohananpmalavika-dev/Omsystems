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

    if (cleanSql.includes("COUNT(*) as count") && cleanSql.includes("FROM recording_segments")) {
      const cameraId = params[0];
      const fromTime = new Date(params[1]).getTime();
      const toTime = new Date(params[2]).getTime();
      const tenantId = params[3];

      const matching = data.recording_segments.filter(
        (seg) => {
          const cam = data.cameras.get(seg.camera_id);
          if (tenantId && cam && cam.tenant_id && cam.tenant_id !== tenantId) return false;
          return (
            seg.camera_id === cameraId &&
            new Date(seg.started_at).getTime() < toTime &&
            new Date(seg.ended_at).getTime() > fromTime &&
            (seg.status === "ready" || !seg.status)
          );
        },
      );

      const totalBytes = matching.reduce((sum, seg) => sum + Number(seg.size_bytes || 0), 0);
      return {
        rows: [{ count: matching.length.toString(), bytes: totalBytes.toString() }],
        rowCount: 1,
      };
    }

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
        progress: 0,
        requested_by: params[9],
        reason: params[10],
        total_segments: params[11],
        total_bytes: params[12],
        created_at: new Date(),
        updated_at: new Date(),
      };
      data.forensic_export_jobs.set(job.id, job);
      return { rows: [job], rowCount: 1 };
    }

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
            job.error_message = params[1];
          }
          job.updated_at = new Date();
          return { rows: [job], rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (cleanSql.includes("FROM forensic_export_jobs WHERE id = $1")) {
      const job = data.forensic_export_jobs.get(params[0]);
      return { rows: job ? [job] : [], rowCount: job ? 1 : 0 };
    }

    if (cleanSql.includes("FROM evidence_cases")) {
      return { rows: [{ id: params[0], tenant_id: params[1] || "corp-tenant" }], rowCount: 1 };
    }

    if (cleanSql.includes("FROM cameras")) {
      const cam = data.cameras.get(params[0]);
      if (!cam) return { rows: [], rowCount: 0 };
      if (params[1] && cam.tenant_id && cam.tenant_id !== params[1]) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [cam], rowCount: 1 };
    }

    if (cleanSql.includes("FROM recording_segments") && (cleanSql.includes("camera_id = $1") || cleanSql.includes("rs.camera_id = $1"))) {
      const cameraId = params[0];
      const fromTime = new Date(params[1]).getTime();
      const toTime = new Date(params[2]).getTime();
      const tenantId = params[3];

      const matching = data.recording_segments.filter(
        (seg) => {
          const cam = data.cameras.get(seg.camera_id);
          if (tenantId && cam && cam.tenant_id && cam.tenant_id !== tenantId) return false;
          return (
            seg.camera_id === cameraId &&
            new Date(seg.started_at).getTime() < toTime &&
            new Date(seg.ended_at).getTime() > fromTime &&
            (seg.status === "ready" || !seg.status)
          );
        },
      );

      matching.sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
      return {
        rows: matching.map((r) => ({
          ...r,
          camera_name: data.cameras.get(r.camera_id)?.name || r.camera_id,
          branch_id: data.cameras.get(r.camera_id)?.node_id || "BR-01",
        })),
        rowCount: matching.length,
      };
    }

    if (cleanSql.includes("chain_of_custody_events") && cleanSql.includes("ORDER BY sequence DESC")) {
      const evidenceId = params[0];
      const events = data.chain_of_custody_events.filter((e) => e.evidence_id === evidenceId);
      if (events.length === 0) return { rows: [], rowCount: 0 };
      const sorted = [...events].sort((a, b) => b.sequence - a.sequence);
      return { rows: [{ sequence: sorted[0].sequence, event_hash: sorted[0].event_hash }], rowCount: 1 };
    }

    if (cleanSql.includes("INSERT INTO chain_of_custody_events")) {
      const record = {
        id: params[0],
        evidence_id: params[1],
        sequence: Number(params[2]),
        action: params[3],
        performed_by: params[4],
        actor_type: params[5] || "USER",
        reason: params[6] || null,
        source_ip: params[7] || null,
        workstation_id: params[8] || null,
        event_hash: params[9],
        previous_hash: params[10],
        created_at: new Date(params[11]),
      };
      data.chain_of_custody_events.push(record);
      return { rows: [record], rowCount: 1 };
    }

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

describe("Multi-Camera Forensic Export & Manifest Architecture (P0-01, P0-02, P0-23, P0-24)", () => {
  let tmpDir: string;
  let vaultDir: string;
  let storageDir: string;
  let keyDir: string;
  let mockData: MockTableData;
  let mockPool: Pool;
  let signingProvider: PersistentFileSigningProvider;
  let worker: ExportWorker;

  const baseStartTime = new Date("2026-09-07T12:00:00.000Z");

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kryptovision-multicam-"));
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
      keyId: "krypton-multicam-key",
      allowDevKeygen: true,
    });

    mockData = {
      cameras: new Map(),
      recording_segments: [],
      forensic_export_jobs: new Map(),
      chain_of_custody_events: [],
      evidence_manifests: new Map(),
    };

    mockData.cameras.set("CAM-VAULT-01", {
      id: "CAM-VAULT-01",
      name: "Vault North Camera",
      node_id: "BR-DELHI-MAIN",
      tenant_id: "corp-tenant",
    });

    mockData.cameras.set("CAM-TELLER-02", {
      id: "CAM-TELLER-02",
      name: "Teller Counter 2 Camera",
      node_id: "BR-DELHI-MAIN",
      tenant_id: "corp-tenant",
    });

    // Create 2 real video segments for CAM-VAULT-01 (5 seconds each)
    for (let i = 0; i < 2; i++) {
      const segFile = path.join(storageDir, `vault_seg_${i}.mp4`);
      await generateTestVideo(segFile, 5);
      const fileBuf = await fs.readFile(segFile);
      mockData.recording_segments.push({
        id: `seg-v-00${i}`,
        camera_id: "CAM-VAULT-01",
        storage_path: segFile,
        started_at: new Date(baseStartTime.getTime() + i * 5000).toISOString(),
        ended_at: new Date(baseStartTime.getTime() + (i + 1) * 5000).toISOString(),
        size_bytes: fileBuf.length,
        sha256: createHash("sha256").update(fileBuf).digest("hex"),
        status: "ready",
      });
    }

    // Create 2 real video segments for CAM-TELLER-02 (5 seconds each)
    for (let i = 0; i < 2; i++) {
      const segFile = path.join(storageDir, `teller_seg_${i}.mp4`);
      await generateTestVideo(segFile, 5);
      const fileBuf = await fs.readFile(segFile);
      mockData.recording_segments.push({
        id: `seg-t-00${i}`,
        camera_id: "CAM-TELLER-02",
        storage_path: segFile,
        started_at: new Date(baseStartTime.getTime() + i * 5000).toISOString(),
        ended_at: new Date(baseStartTime.getTime() + (i + 1) * 5000).toISOString(),
        size_bytes: fileBuf.length,
        sha256: createHash("sha256").update(fileBuf).digest("hex"),
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

  it("exports multi-camera viewing copies with individual footage files and honest manifest", async () => {
    const fromTime = baseStartTime.toISOString();
    const toTime = new Date(baseStartTime.getTime() + 10000).toISOString();

    const job = await worker.createExportJob({
      caseId: "CASE-CORP-2026-001",
      tenantId: "corp-tenant",
      exportType: "multi-camera",
      format: "mp4",
      cameras: [
        { cameraId: "CAM-VAULT-01", fromTime, toTime },
        { cameraId: "CAM-TELLER-02", fromTime, toTime },
      ],
      options: {
        strictSourceIntegrity: true,
      },
      requestedBy: "lead.investigator",
      reason: "Multi-camera incident review",
    });

    await worker.processExport(job.id);

    const savedJob = mockData.forensic_export_jobs.get(job.id);
    expect(savedJob).toBeDefined();
    expect(savedJob.status).toBe("ready");

    // Verify per-camera viewing copies in footage/
    const vaultMp4 = path.join(vaultDir, job.id, "footage", "CAM-VAULT-01.mp4");
    const tellerMp4 = path.join(vaultDir, job.id, "footage", "CAM-TELLER-02.mp4");

    const vaultStat = await fs.stat(vaultMp4);
    const tellerStat = await fs.stat(tellerMp4);
    expect(vaultStat.size).toBeGreaterThan(1000);
    expect(tellerStat.size).toBeGreaterThan(1000);

    // Verify manifest.json structure and cryptographic truth (P0-02, P0-23, P0-24)
    const manifestPath = path.join(vaultDir, job.id, "manifest.json");
    const manifestRaw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw);

    // Investigation Window
    expect(manifest.investigationWindow).toEqual({
      start: fromTime,
      end: toTime,
    });

    // Root export timestamp
    expect(manifest.exportServerTimestamp).toBeDefined();

    // Independent camera metadata
    expect(manifest.cameras["CAM-VAULT-01"]).toBeDefined();
    expect(manifest.cameras["CAM-TELLER-02"]).toBeDefined();

    const camVault = manifest.cameras["CAM-VAULT-01"];
    expect(camVault.coveragePercent).toBe(100);
    expect(camVault.gapCount).toBe(0);
    expect(camVault.outputFile).toBe("footage/CAM-VAULT-01.mp4");
    expect(camVault.outputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(camVault.codec.video).toBe("h264");
    expect(camVault.resolution).toBe("320x240");

    const camTeller = manifest.cameras["CAM-TELLER-02"];
    expect(camTeller.coveragePercent).toBe(100);
    expect(camTeller.gapCount).toBe(0);
    expect(camTeller.outputFile).toBe("footage/CAM-TELLER-02.mp4");
    expect(camTeller.outputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(camTeller.codec.video).toBe("h264");
    expect(camTeller.resolution).toBe("320x240");

    // Clock disclosures
    expect(manifest.cameraClockOffset).toBe("UNKNOWN");

    // Cryptographic signature verification on manifest
    const signaturePath = path.join(vaultDir, job.id, "manifest.sig");
    const signatureBase64 = await fs.readFile(signaturePath, "utf8");
    const unsignedManifest = { ...manifest };
    delete unsignedManifest.digitalSignature;
    const canonicalManifest = canonicalJsonStringify(unsignedManifest);
    const manifestDigest = createHash("sha256").update(canonicalManifest, "utf8").digest();

    const isSigValid = await signingProvider.verify(
      manifestDigest,
      Buffer.from(signatureBase64.trim(), "base64"),
      manifest.signingKeyId,
    );
    expect(isSigValid).toBe(true);
  });

  it("exports multi-camera originals into per-camera grouped directories and tarball", async () => {
    const fromTime = baseStartTime.toISOString();
    const toTime = new Date(baseStartTime.getTime() + 10000).toISOString();

    const job = await worker.createExportJob({
      caseId: "CASE-CORP-2026-002",
      tenantId: "corp-tenant",
      exportType: "original",
      format: "original",
      cameras: [
        { cameraId: "CAM-VAULT-01", fromTime, toTime },
        { cameraId: "CAM-TELLER-02", fromTime, toTime },
      ],
      options: {
        strictSourceIntegrity: true,
      },
      requestedBy: "lead.investigator",
      reason: "Multi-camera raw originals export",
    });

    await worker.processExport(job.id);

    const savedJob = mockData.forensic_export_jobs.get(job.id);
    expect(savedJob.status).toBe("ready");

    // Verify per-camera grouped originals directories
    const vaultDirEntries = await fs.readdir(path.join(vaultDir, job.id, "originals", "CAM-VAULT-01"));
    const tellerDirEntries = await fs.readdir(path.join(vaultDir, job.id, "originals", "CAM-TELLER-02"));
    expect(vaultDirEntries.length).toBe(2);
    expect(tellerDirEntries.length).toBe(2);

    // Verify originals.tar archive
    const tarStat = await fs.stat(path.join(vaultDir, job.id, "originals.tar"));
    expect(tarStat.size).toBeGreaterThan(4000);
  });
});
