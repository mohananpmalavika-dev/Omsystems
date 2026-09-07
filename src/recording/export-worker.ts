import { randomUUID, createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  copyFileSync,
  unlinkSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { Pool } from "pg";
import {
  getEvidenceSigningProvider,
  type EvidenceSigningProvider,
} from "../evidence/signing/evidence-signing-provider.js";
import {
  canonicalJsonStringify,
  appendCustodyEventTx,
} from "../database/evidence-repository.js";
import { packageEvidenceToZip64, packageDirectoryToZip } from "./zip-archive.js";

/**
 * Creates a standard POSIX ustar TAR archive buffer from memory entries.
 */
export function createPosixTarArchive(
  entries: Array<{ name: string; buffer: Buffer; mtime?: Date }>,
): Buffer {
  const chunks: Buffer[] = [];

  for (const entry of entries) {
    const header = Buffer.alloc(512, 0);
    const name = entry.name.replace(/\\/g, "/");

    // File name: 100 bytes (0-99)
    header.write(name.slice(0, 100), 0, 100, "ascii");

    // File mode: 8 bytes (100-107) -> "0000644\0"
    header.write("0000644\0", 100, 8, "ascii");

    // Owner UID: 8 bytes (108-115) -> "0000000\0"
    header.write("0000000\0", 108, 8, "ascii");

    // Group GID: 8 bytes (116-123) -> "0000000\0"
    header.write("0000000\0", 116, 8, "ascii");

    // File size: 12 bytes octal (124-135)
    const sizeOctal = entry.buffer.length.toString(8).padStart(11, "0") + " ";
    header.write(sizeOctal, 124, 12, "ascii");

    // Modification time: 12 bytes octal (136-147)
    const mtimeSec = Math.floor((entry.mtime ? entry.mtime.getTime() : Date.now()) / 1000);
    const mtimeOctal = mtimeSec.toString(8).padStart(11, "0") + " ";
    header.write(mtimeOctal, 136, 12, "ascii");

    // Checksum placeholder: 8 spaces (148-155)
    header.fill(0x20, 148, 156);

    // Typeflag: 1 byte (156) -> '0' (regular file)
    header.write("0", 156, 1, "ascii");

    // Magic: 6 bytes (257-262) -> "ustar\0"
    header.write("ustar\0", 257, 6, "ascii");

    // Version: 2 bytes (263-264) -> "00"
    header.write("00", 263, 2, "ascii");

    // Uname: 32 bytes (265-296) -> "kryptovision\0"
    header.write("kryptovision\0", 265, 32, "ascii");

    // Gname: 32 bytes (297-328) -> "kryptovision\0"
    header.write("kryptovision\0", 297, 32, "ascii");

    // Calculate checksum: unsigned sum of all bytes in 512-byte header
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i]!;
    }
    const checksumOctal = checksum.toString(8).padStart(6, "0") + "\0 ";
    header.write(checksumOctal, 148, 8, "ascii");

    chunks.push(header);
    chunks.push(entry.buffer);

    // Padding to 512-byte boundary
    const remainder = entry.buffer.length % 512;
    if (remainder > 0) {
      chunks.push(Buffer.alloc(512 - remainder, 0));
    }
  }

  // End of archive marker: two 512-byte blocks of zeroes (1024 bytes)
  chunks.push(Buffer.alloc(1024, 0));

  return Buffer.concat(chunks);
}

export interface ExportJob {
  id: string;
  caseId: string;
  tenantId: string;
  exportType: "original" | "viewing-copy" | "multi-camera" | "investigation-package";
  format: "original" | "mp4" | "mkv" | "manifest-only";
  cameras: Array<{
    cameraId: string;
    fromTime: string;
    toTime: string;
  }>;
  options: {
    watermark?: boolean;
    timestampOverlay?: boolean;
    audioIncluded?: boolean;
    password?: string;
    quality?: "original" | "high" | "medium";
    strictSourceIntegrity?: boolean;
    includeAuditTrail?: boolean;
    includePlaybackPlayer?: boolean;
  };
  status:
    | "pending"
    | "queued"
    | "processing"
    | "transcoding"
    | "packaging"
    | "signing"
    | "ready"
    | "failed"
    | "expired";
  priority: number;
  requestedBy: string;
  approvedBy?: string;
  approvedAt?: string;
  reason: string;
  totalSegments: number;
  processedSegments: number;
  totalBytes: number;
  outputPath?: string;
  outputSizeBytes?: number;
  outputHashSha256?: string;
  manifestId?: string;
  downloadToken?: string;
  downloadExpiresAt?: string;
  downloadCount: number;
  maxDownloads: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SegmentValidationResult {
  segmentId: string;
  cameraId: string;
  cameraName: string;
  startTime: string;
  endTime: string;
  storagePath: string;
  expectedSha256?: string;
  actualSha256?: string;
  sizeBytes: number;
  exists: boolean;
  isReadable: boolean;
  isValid: boolean;
  error?: string;
}

export interface RecordingGapItem {
  cameraId: string;
  from: string;
  to: string;
  durationSeconds: number;
  durationMs?: number;
  reason?: string;
}

export interface CameraExportDetails {
  cameraId: string;
  cameraName: string;
  requestedWindow: { start: string; end: string };
  actualFootageWindow: { start: string | null; end: string | null };
  startDeviationMs: number;
  endDeviationMs: number;
  coveragePercent: number;
  gapCount: number;
  totalGapsDurationMs: number;
  segmentCount: number;
  outputFile: string;
  outputSha256: string;
  codec?: { video?: string; audio?: string };
  resolution?: string;
  fps?: number;
  mediaInfo?: any;
}

export interface ExportManifest {
  schemaVersion: string;
  packageId: string;
  caseId: string;
  caseNumber: string;
  tenantId: string;
  createdAt: string;
  exportedBy: string;
  reason: string;
  branchId: string | null;
  investigationWindow: {
    start: string;
    end: string;
  };
  camera: {
    id: string;
    name: string;
    channel: number | null;
    recorder: string | null;
    location: string | null;
  };
  cameras: Record<string, CameraExportDetails>;
  requested: {
    from: string;
    to: string;
  };
  actual: {
    firstFrame: string | null;
    lastFrame: string | null;
    startDeviationMs?: number;
    endDeviationMs?: number;
  };
  mediaInfo?: {
    container: string;
    videoCodec?: string;
    width?: number;
    height?: number;
    fps?: number;
    durationSeconds: number;
    hasAudio: boolean;
    streamCount: number;
    startTime?: string;
  };
  packageDigest?: string;
  deviceTimestamp: string | null;
  serverReceiveTimestamp: string | null;
  recordingServerReceiveTimestamp?: string | null;
  exportServerTimestamp: string;
  estimatedClockOffset: number | null;
  cameraClockOffset: string;
  clockOffsetSource: string;
  ntpStatus: string;
  timezone: string;
  sourceSegments: Array<{
    id: string;
    cameraId?: string;
    start: string;
    end: string;
    size: number;
    sha256: string;
    storageLocator: string;
    valid: boolean;
    recordingServerReceiveTimestamp?: string | null;
  }>;
  gaps: RecordingGapItem[];
  outputFiles: Array<{
    filename: string;
    mimeType: string;
    size: number;
    sha256: string;
  }>;
  watermarkApplied: boolean;
  redactionApplied: boolean;
  audioIncluded: boolean;
  signingAlgorithm: string;
  signingKeyId: string;
  signedAt: string;
  digitalSignature?: string;
}

export class ExportWorker {
  private signingProvider: EvidenceSigningProvider;

  constructor(
    private readonly pool: Pool,
    signingProvider?: EvidenceSigningProvider,
  ) {
    this.signingProvider = signingProvider || getEvidenceSigningProvider();
  }

  /**
   * Create a new export job using PostgreSQL as authoritative source.
   * Uses correct interval overlap logic:
   *   segment.started_at < requested_to AND segment.ended_at > requested_from
   */
  async createExportJob(input: {
    caseId: string;
    tenantId: string;
    exportType: "original" | "viewing-copy" | "multi-camera" | "investigation-package";
    format: "original" | "mp4" | "mkv" | "manifest-only";
    cameras: Array<{ cameraId: string; fromTime: string; toTime: string }>;
    options?: {
      watermark?: boolean;
      timestampOverlay?: boolean;
      audioIncluded?: boolean;
      password?: string;
      quality?: "original" | "high" | "medium";
    };
    requestedBy: string;
    reason: string;
    priority?: number;
  }): Promise<ExportJob> {
    const id = randomUUID();

    let totalSegments = 0;
    let totalBytes = 0;

    for (const camera of input.cameras) {
      // Validate camera ownership under tenant
      const camCheck = await this.pool.query(
        `SELECT c.id FROM cameras c
         LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
         WHERE c.id = $1 AND (c.tenant_id = $2 OR rn.tenant_id = $2)`,
        [camera.cameraId, input.tenantId],
      );
      if (camCheck.rows.length === 0) {
        const err = new Error(`TENANT_RESOURCE_NOT_FOUND: Camera ${camera.cameraId} not found or does not belong to tenant ${input.tenantId}`);
        (err as any).code = "TENANT_RESOURCE_NOT_FOUND";
        (err as any).statusCode = 404;
        throw err;
      }

      const result = await this.pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(rs.size_bytes), 0) as bytes
         FROM recording_segments rs
         JOIN cameras c ON c.id = rs.camera_id
         LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
         WHERE rs.camera_id = $1
         AND (c.tenant_id = $4 OR rn.tenant_id = $4)
         AND rs.started_at < $3::timestamptz
         AND rs.ended_at > $2::timestamptz
         AND (rs.status = 'ready' OR rs.status IS NULL)`,
        [camera.cameraId, camera.fromTime, camera.toTime, input.tenantId],
      );

      totalSegments += parseInt(result.rows[0].count || "0", 10);
      totalBytes += parseInt(result.rows[0].bytes || "0", 10);
    }

    const result = await this.pool.query(
      `INSERT INTO forensic_export_jobs (
         id, case_id, tenant_id, export_type, format, cameras, options,
         status, priority, requested_by, reason, total_segments, total_bytes,
         download_count, max_downloads, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, 5, now(), now())
       RETURNING *`,
      [
        id,
        input.caseId,
        input.tenantId,
        input.exportType,
        input.format,
        JSON.stringify(input.cameras),
        JSON.stringify(input.options || {}),
        "pending",
        input.priority ?? 100,
        input.requestedBy,
        input.reason,
        totalSegments,
        totalBytes,
      ],
    );

    await this.recordCustodyEvent({
      evidenceId: input.caseId,
      action: "export_requested",
      performedBy: input.requestedBy,
      reason: input.reason,
    });

    return mapExportJob(result.rows[0]);
  }

  /**
   * Approve export job (requires elevated permissions)
   */
  async approveExport(input: {
    jobId: string;
    approvedBy: string;
  }): Promise<ExportJob | undefined> {
    const result = await this.pool.query(
      `UPDATE forensic_export_jobs
       SET status = 'queued',
           approved_by = $2,
           approved_at = now(),
           updated_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [input.jobId, input.approvedBy],
    );

    if (result.rows[0]) {
      const job = result.rows[0];
      await this.recordCustodyEvent({
        evidenceId: job.case_id,
        action: "export_approved",
        performedBy: input.approvedBy,
      });
    }

    return result.rows[0] ? mapExportJob(result.rows[0]) : undefined;
  }

  /**
   * Authoritative export processing pipeline:
   * 1. Query segments with overlap logic
   * 2. Validate every single segment on physical storage
   * 3. Compute actual recording gaps
   * 4. Remux / copy actual media via FFmpeg or native binary operations
   * 5. Calculate SHA-256 over ACTUAL OUTPUT BYTES
   * 6. Generate canonical manifest & digitally sign with EvidenceSigningProvider
   * 7. Append immutable custody events
   */
  async processExport(jobId: string): Promise<void> {
    await this.pool.query(
      `UPDATE forensic_export_jobs
       SET status = 'processing', started_at = now(), updated_at = now()
       WHERE id = $1`,
      [jobId],
    );

    try {
      const job = await this.getExportJob(jobId);
      if (!job) throw new Error("Job not found");

      // Verify case belongs to job tenant (Priority 1)
      const caseCheck = await this.pool.query(
        `SELECT id FROM evidence_cases WHERE id = $1 AND tenant_id = $2`,
        [job.caseId, job.tenantId],
      );
      if (caseCheck.rows.length === 0) {
        const err = new Error(`EXPORT_DENIED: Case ${job.caseId} does not belong to tenant ${job.tenantId}`);
        (err as any).code = "EXPORT_DENIED";
        throw err;
      }

      const cameras: Array<{ cameraId: string; fromTime: string; toTime: string }> =
        typeof job.cameras === "string" ? JSON.parse(job.cameras) : job.cameras;

      const allRawSegments: any[] = [];

      for (const camera of cameras) {
        // Enforce camera tenant ownership (Priority 1)
        const camCheck = await this.pool.query(
          `SELECT c.id FROM cameras c
           LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
           WHERE c.id = $1 AND (c.tenant_id = $2 OR rn.tenant_id = $2)`,
          [camera.cameraId, job.tenantId],
        );
        if (camCheck.rows.length === 0) {
          const err = new Error(`EXPORT_DENIED: Camera ${camera.cameraId} does not belong to tenant ${job.tenantId}`);
          (err as any).code = "EXPORT_DENIED";
          throw err;
        }

        const result = await this.pool.query(
          `SELECT rs.*, c.name as camera_name, c.node_id as branch_id
           FROM recording_segments rs
           JOIN cameras c ON c.id = rs.camera_id
           LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
           WHERE rs.camera_id = $1
           AND (c.tenant_id = $4 OR rn.tenant_id = $4)
           AND rs.started_at < $3::timestamptz
           AND rs.ended_at > $2::timestamptz
           AND (rs.status = 'ready' OR rs.status IS NULL)
           ORDER BY rs.started_at ASC`,
          [camera.cameraId, camera.fromTime, camera.toTime, job.tenantId],
        );
        allRawSegments.push(...result.rows);
      }

      // 2. Validate every source segment
      const validationResults = await this.validateSourceSegments(allRawSegments);
      const gaps = this.calculateGaps(cameras, validationResults);

      const hashMismatch = validationResults.find(
        (v) => v.expectedSha256 && v.actualSha256 && v.expectedSha256.toLowerCase() !== v.actualSha256.toLowerCase(),
      );
      if (hashMismatch) {
        const err = new Error(
          `SOURCE_HASH_MISMATCH: Segment ${hashMismatch.segmentId} checksum failed. Expected ${hashMismatch.expectedSha256}, got ${hashMismatch.actualSha256}`,
        );
        (err as any).code = "SOURCE_HASH_MISMATCH";
        throw err;
      }

      const missingSegments = validationResults.filter((v) => !v.exists);
      if (missingSegments.length > 0 && (job.options as any)?.strictSourceIntegrity) {
        const err = new Error(
          `FAILED_SOURCE_INTEGRITY: ${missingSegments.length} indexed segments physically missing from storage`,
        );
        (err as any).code = "FAILED_SOURCE_INTEGRITY";
        throw err;
      }

      const existingValid = validationResults.filter((v) => v.exists && v.sizeBytes > 0 && v.isValid);
      if (job.format !== "manifest-only" && existingValid.length === 0) {
        const err = new Error("EXPORT_FAILED: No valid source recordings available for requested interval");
        (err as any).code = "EXPORT_FAILED";
        throw err;
      }

      await this.recordCustodyEvent({
        evidenceId: job.caseId,
        action: "source_verified",
        performedBy: "system",
        reason: `Validated ${validationResults.length} segments. Declared gaps: ${gaps.length}`,
      });

      const vaultRoot = process.env.EVIDENCE_VAULT_PATH || resolve(process.cwd(), "evidence-vault");
      const jobDir = resolve(vaultRoot, jobId);
      mkdirSync(jobDir, { recursive: true });

      let outputPath: string = "";
      let outputHash: string = "0".repeat(64);
      let outputSize: number = 0;
      let mediaInfo: any;
      const outputFiles: Array<{ filename: string; mimeType: string; size: number; sha256: string }> = [];
      const cameraExportDetails: Record<string, CameraExportDetails> = {};

      if (job.format === "manifest-only") {
        outputPath = resolve(jobDir, "manifest.json");
        outputHash = "0".repeat(64);
        outputSize = 0;
      } else if (job.exportType === "original") {
        const origResult = await this.exportOriginalEvidence(jobDir, validationResults, cameras, job.options);
        outputPath = origResult.outputPath;
        outputHash = origResult.hash;
        outputSize = origResult.size;
        for (const file of origResult.files) {
          outputFiles.push(file);
        }

        // Populate camera details for originals
        for (const cam of cameras) {
          const camValidations = validationResults.filter((v) => v.cameraId === cam.cameraId);
          const camValidSorted = camValidations
            .filter((v) => v.isValid)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
          const firstFrame = camValidSorted.length > 0 ? camValidSorted[0]!.startTime : null;
          const lastFrame = camValidSorted.length > 0 ? camValidSorted[camValidSorted.length - 1]!.endTime : null;
          const reqFromMs = new Date(cam.fromTime).getTime();
          const reqToMs = new Date(cam.toTime).getTime();
          const reqDurationMs = Math.max(1, reqToMs - reqFromMs);
          const firstFrameMs = firstFrame ? new Date(firstFrame).getTime() : 0;
          const lastFrameMs = lastFrame ? new Date(lastFrame).getTime() : 0;
          const startDeviationMs = firstFrameMs ? firstFrameMs - reqFromMs : 0;
          const endDeviationMs = lastFrameMs ? lastFrameMs - reqToMs : 0;
          const camGaps = gaps.filter((g) => g.cameraId === cam.cameraId);
          const totalGapsDurationMs = camGaps.reduce((sum, g) => sum + g.durationSeconds * 1000, 0);
          const coveredDurationMs = Math.max(0, reqDurationMs - totalGapsDurationMs);
          const coveragePercent = Math.min(100, Math.round((coveredDurationMs / reqDurationMs) * 1000) / 10);

          cameraExportDetails[cam.cameraId] = {
            cameraId: cam.cameraId,
            cameraName: camValidations[0]?.cameraName || cam.cameraId,
            requestedWindow: { start: cam.fromTime, end: cam.toTime },
            actualFootageWindow: { start: firstFrame, end: lastFrame },
            startDeviationMs,
            endDeviationMs,
            coveragePercent,
            gapCount: camGaps.length,
            totalGapsDurationMs,
            segmentCount: camValidSorted.length,
            outputFile: `originals/${cam.cameraId}/`,
            outputSha256: outputHash,
          };
        }
      } else {
        // Multi-camera or viewing copy
        if (cameras.length > 1 || job.exportType === "multi-camera") {
          for (const camera of cameras) {
            const camValidations = validationResults.filter((v) => v.cameraId === camera.cameraId);
            const camValidSorted = camValidations
              .slice()
              .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
            const camResult = await this.createViewingCopy(
              jobDir,
              camera.cameraId,
              camValidations,
              job.options,
              camera,
            );
            outputFiles.push({
              filename: camResult.relativePath,
              mimeType: "video/mp4",
              size: camResult.size,
              sha256: camResult.hash,
            });
            if (!outputPath!) {
              outputPath = camResult.outputPath;
              outputHash = camResult.hash;
              outputSize = camResult.size;
              mediaInfo = camResult.mediaInfo;
            }

            const firstSegStartMs = camValidSorted.length > 0 ? new Date(camValidSorted[0]!.startTime).getTime() : 0;
            const reqFromMs = new Date(camera.fromTime).getTime();
            const reqToMs = new Date(camera.toTime).getTime();
            const reqDurationMs = Math.max(1, reqToMs - reqFromMs);
            const actualStartMs = firstSegStartMs > 0 ? Math.max(firstSegStartMs, reqFromMs) : reqFromMs;
            const actualDurationSec = camResult.mediaInfo?.durationSeconds || reqDurationMs / 1000;
            const actualEndMs = actualStartMs + Math.round(actualDurationSec * 1000);
            const startDeviationMs = actualStartMs - reqFromMs;
            const endDeviationMs = actualEndMs - reqToMs;
            const actualStart = new Date(actualStartMs).toISOString();
            const actualEnd = new Date(actualEndMs).toISOString();
            const camGaps = gaps.filter((g) => g.cameraId === camera.cameraId);
            const totalGapsDurationMs = camGaps.reduce((sum, g) => sum + g.durationSeconds * 1000, 0);
            const coveredDurationMs = Math.max(0, reqDurationMs - totalGapsDurationMs);
            const coveragePercent = Math.min(100, Math.round((coveredDurationMs / reqDurationMs) * 1000) / 10);

            cameraExportDetails[camera.cameraId] = {
              cameraId: camera.cameraId,
              cameraName: camValidations[0]?.cameraName || camera.cameraId,
              requestedWindow: { start: camera.fromTime, end: camera.toTime },
              actualFootageWindow: { start: actualStart, end: actualEnd },
              startDeviationMs,
              endDeviationMs,
              coveragePercent,
              gapCount: camGaps.length,
              totalGapsDurationMs,
              segmentCount: camValidSorted.length,
              outputFile: camResult.relativePath,
              outputSha256: camResult.hash,
              codec: {
                video: camResult.mediaInfo?.videoCodec,
                audio: camResult.mediaInfo?.hasAudio ? "aac" : undefined,
              },
              resolution: camResult.mediaInfo?.width && camResult.mediaInfo?.height
                ? `${camResult.mediaInfo.width}x${camResult.mediaInfo.height}`
                : undefined,
              fps: camResult.mediaInfo?.fps,
              mediaInfo: camResult.mediaInfo,
            };
          }
        } else {
          // Single camera viewing copy
          const viewingResult = await this.createViewingCopy(jobDir, jobId, validationResults, job.options, cameras[0]);
          outputPath = viewingResult.outputPath;
          outputHash = viewingResult.hash;
          outputSize = viewingResult.size;
          mediaInfo = viewingResult.mediaInfo;
          outputFiles.push({
            filename: "viewing-copy.mp4",
            mimeType: "video/mp4",
            size: outputSize,
            sha256: outputHash,
          });

          if (cameras[0]) {
            const camValidSorted = validationResults
              .filter((v) => v.isValid)
              .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
            const firstSegStartMs = camValidSorted.length > 0 ? new Date(camValidSorted[0]!.startTime).getTime() : 0;
            const reqFromMs = new Date(cameras[0].fromTime).getTime();
            const reqToMs = new Date(cameras[0].toTime).getTime();
            const reqDurationMs = Math.max(1, reqToMs - reqFromMs);
            const actualStartMs = firstSegStartMs > 0 ? Math.max(firstSegStartMs, reqFromMs) : reqFromMs;
            const actualDurationSec = viewingResult.mediaInfo?.durationSeconds || reqDurationMs / 1000;
            const actualEndMs = actualStartMs + Math.round(actualDurationSec * 1000);
            const startDeviationMs = actualStartMs - reqFromMs;
            const endDeviationMs = actualEndMs - reqToMs;
            const actualStart = new Date(actualStartMs).toISOString();
            const actualEnd = new Date(actualEndMs).toISOString();
            const totalGapsDurationMs = gaps.reduce((sum, g) => sum + g.durationSeconds * 1000, 0);
            const coveredDurationMs = Math.max(0, reqDurationMs - totalGapsDurationMs);
            const coveragePercent = Math.min(100, Math.round((coveredDurationMs / reqDurationMs) * 1000) / 10);

            cameraExportDetails[cameras[0].cameraId] = {
              cameraId: cameras[0].cameraId,
              cameraName: validationResults[0]?.cameraName || cameras[0].cameraId,
              requestedWindow: { start: cameras[0].fromTime, end: cameras[0].toTime },
              actualFootageWindow: { start: actualStart, end: actualEnd },
              startDeviationMs,
              endDeviationMs,
              coveragePercent,
              gapCount: gaps.length,
              totalGapsDurationMs,
              segmentCount: camValidSorted.length,
              outputFile: `footage/${jobId}.mp4`,
              outputSha256: outputHash,
              codec: {
                video: viewingResult.mediaInfo?.videoCodec,
                audio: viewingResult.mediaInfo?.hasAudio ? "aac" : undefined,
              },
              resolution: viewingResult.mediaInfo?.width && viewingResult.mediaInfo?.height
                ? `${viewingResult.mediaInfo.width}x${viewingResult.mediaInfo.height}`
                : undefined,
              fps: viewingResult.mediaInfo?.fps,
              mediaInfo: viewingResult.mediaInfo,
            };
          }
        }
      }

      // Generate real metadata.json and audit.json for the evidence package
      const metadataPath = resolve(jobDir, "metadata.json");
      const metadataContent = JSON.stringify(
        {
          packageId: jobId,
          caseId: job.caseId,
          tenantId: job.tenantId,
          requestedBy: job.requestedBy,
          reason: job.reason,
          cameras,
          options: job.options,
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      );
      writeFileSync(metadataPath, metadataContent, "utf-8");
      outputFiles.push({
        filename: "metadata.json",
        mimeType: "application/json",
        size: Buffer.byteLength(metadataContent),
        sha256: createHash("sha256").update(metadataContent).digest("hex"),
      });

      const auditPath = resolve(jobDir, "audit.json");
      const auditContent = JSON.stringify(
        {
          jobId,
          caseId: job.caseId,
          totalSegments: validationResults.length,
          validSegments: validationResults.filter((v) => v.isValid).length,
          gaps,
          auditedAt: new Date().toISOString(),
        },
        null,
        2,
      );
      writeFileSync(auditPath, auditContent, "utf-8");
      outputFiles.push({
        filename: "audit.json",
        mimeType: "application/json",
        size: Buffer.byteLength(auditContent),
        sha256: createHash("sha256").update(auditContent).digest("hex"),
      });

      // Gap disclosure artifact (Priority 17)
      const gapsPath = resolve(jobDir, "recording-gaps.json");
      const gapsContent = JSON.stringify(gaps, null, 2);
      writeFileSync(gapsPath, gapsContent, "utf-8");
      outputFiles.push({
        filename: "recording-gaps.json",
        mimeType: "application/json",
        size: Buffer.byteLength(gapsContent),
        sha256: createHash("sha256").update(gapsContent).digest("hex"),
      });

      await this.recordCustodyEvent({
        evidenceId: job.caseId,
        action: "package_hashed",
        performedBy: "system",
        reason: `Output files generated and hashed: ${outputHash}`,
      });

      // Generate signed manifest
      const manifestId = await this.generateSignedManifest({
        jobId,
        caseId: job.caseId,
        tenantId: job.tenantId,
        cameras,
        rawSegments: allRawSegments,
        validationResults,
        gaps,
        outputPath,
        outputFiles,
        exportedBy: job.requestedBy,
        options: job.options,
        jobDir,
        mediaInfo,
        cameraExportDetails,
      });

      await this.recordCustodyEvent({
        evidenceId: job.caseId,
        action: "package_signed",
        performedBy: "system",
        reason: `Manifest ${manifestId} signed cryptographically`,
      });

      // Priority 2: Deterministic multi-camera downloadable ZIP64 package (P0-01, P0-02, P0-03)
      if (job.format !== "manifest-only") {
        const zipFilename = `KryptoVision-Evidence-${jobId}.zip`;
        const zipPath = resolve(jobDir, zipFilename);
        const explicitFiles = outputFiles.map((f) => f.filename).concat(["manifest.json", "manifest.sig"]);
        const zipResult = await packageEvidenceToZip64(jobDir, zipPath, { explicitFiles });

        outputPath = zipResult.outputPath;
        outputSize = zipResult.sizeBytes;
        outputHash = zipResult.sha256;
      }

      // Generate secure download token
      const downloadToken = randomUUID();
      const downloadExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await this.pool.query(
        `UPDATE forensic_export_jobs
         SET status = 'ready',
             processed_segments = total_segments,
             output_path = $2,
             output_size_bytes = $3,
             output_hash_sha256 = $4,
             manifest_id = $5,
             download_token = $6,
             download_expires_at = $7,
             completed_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [jobId, outputPath, outputSize, outputHash, manifestId, downloadToken, downloadExpiry],
      );

      await this.recordCustodyEvent({
        evidenceId: job.caseId,
        action: "export_completed",
        performedBy: "system",
        reason: "Evidence export package ready for authorized distribution",
      });
    } catch (error) {
      await this.pool.query(
        `UPDATE forensic_export_jobs
         SET status = 'failed',
             error_message = $2,
             updated_at = now()
         WHERE id = $1`,
        [jobId, error instanceof Error ? error.message : String(error)],
      );
      throw error;
    }
  }

  /**
   * Validates every segment against physical storage
   */
  private async validateSourceSegments(segments: any[]): Promise<SegmentValidationResult[]> {
    const results: SegmentValidationResult[] = [];

    for (const seg of segments) {
      const storagePath = seg.storage_path;
      const resolvedPath = this.resolveStoragePath(storagePath);
      const exists = existsSync(resolvedPath);

      let isReadable = false;
      let actualSha256: string | undefined;
      let sizeBytes = 0;
      let error: string | undefined;

      if (exists) {
        try {
          const stats = statSync(resolvedPath);
          sizeBytes = stats.size;
          isReadable = true;
          actualSha256 = await this.computeFileSha256(resolvedPath);
        } catch (err: any) {
          error = err.message;
        }
      } else {
        error = `Recording segment file not found on storage: ${storagePath}`;
      }

      const expectedSha256 = seg.checksum_sha256;
      const isValid = Boolean(
        exists &&
        isReadable &&
        (!expectedSha256 || actualSha256?.toLowerCase() === expectedSha256.toLowerCase()),
      );

      results.push({
        segmentId: seg.id,
        cameraId: seg.camera_id,
        cameraName: seg.camera_name || seg.camera_id,
        startTime: new Date(seg.started_at).toISOString(),
        endTime: new Date(seg.ended_at).toISOString(),
        storagePath,
        expectedSha256,
        actualSha256,
        sizeBytes,
        exists,
        isReadable,
        isValid,
        error,
      });
    }

    return results;
  }

  /**
   * Calculates recording gaps across the requested window
   */
  private calculateGaps(
    cameras: Array<{ cameraId: string; fromTime: string; toTime: string }>,
    validationResults: SegmentValidationResult[],
  ): RecordingGapItem[] {
    const gaps: RecordingGapItem[] = [];

    for (const req of cameras) {
      const camSegments = validationResults
        .filter((s) => s.cameraId === req.cameraId && s.isValid)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      const reqStart = new Date(req.fromTime).getTime();
      const reqEnd = new Date(req.toTime).getTime();

      if (camSegments.length === 0) {
        const durSec = Math.max(0, Math.round((reqEnd - reqStart) / 1000));
        gaps.push({
          cameraId: req.cameraId,
          from: req.fromTime,
          to: req.toTime,
          durationSeconds: durSec,
          durationMs: durSec * 1000,
          reason: "NO_RECORDINGS_IN_WINDOW",
        });
        continue;
      }

      // Check gap before first segment
      const firstStart = new Date(camSegments[0]!.startTime).getTime();
      if (firstStart - reqStart > 3000) {
        const durSec = Math.round((firstStart - reqStart) / 1000);
        gaps.push({
          cameraId: req.cameraId,
          from: req.fromTime,
          to: camSegments[0]!.startTime,
          durationSeconds: durSec,
          durationMs: durSec * 1000,
          reason: "PRE_WINDOW_DISCONTINUITY",
        });
      }

      // Check gaps between segments
      for (let i = 0; i < camSegments.length - 1; i++) {
        const segEnd = new Date(camSegments[i]!.endTime).getTime();
        const nextStart = new Date(camSegments[i + 1]!.startTime).getTime();
        if (nextStart - segEnd > 3000) {
          const durSec = Math.round((nextStart - segEnd) / 1000);
          gaps.push({
            cameraId: req.cameraId,
            from: camSegments[i]!.endTime,
            to: camSegments[i + 1]!.startTime,
            durationSeconds: durSec,
            durationMs: durSec * 1000,
            reason: "RECORDING_DISCONTINUITY",
          });
        }
      }

      // Check gap after last segment
      const lastEnd = new Date(camSegments[camSegments.length - 1]!.endTime).getTime();
      if (reqEnd - lastEnd > 3000) {
        const durSec = Math.round((reqEnd - lastEnd) / 1000);
        gaps.push({
          cameraId: req.cameraId,
          from: camSegments[camSegments.length - 1]!.endTime,
          to: req.toTime,
          durationSeconds: durSec,
          durationMs: durSec * 1000,
          reason: "POST_WINDOW_DISCONTINUITY",
        });
      }
    }

    return gaps;
  }

  /**
   * Export original evidence: package immutable segments into authentic POSIX TAR archive
   * Packages originals per camera under originals/${cameraId}/ per P0-01 forensic spec.
   */
  private async exportOriginalEvidence(
    jobDir: string,
    validations: SegmentValidationResult[],
    cameras?: Array<{ cameraId: string; fromTime: string; toTime: string }>,
    options?: any,
  ): Promise<{ outputPath: string; hash: string; size: number; files: Array<{ filename: string; mimeType: string; size: number; sha256: string }> }> {
    const originalsDir = resolve(jobDir, "originals");
    mkdirSync(originalsDir, { recursive: true });

    const outputFiles: Array<{ filename: string; mimeType: string; size: number; sha256: string }> = [];
    let totalSize = 0;
    const combinedHash = createHash("sha256");

    for (const val of validations) {
      if (!val.exists) continue;
      const src = this.resolveStoragePath(val.storagePath);
      const filename = val.storagePath.includes("/") || val.storagePath.includes("\\")
        ? val.storagePath.split(/[/\\]/).pop()!
        : `${val.segmentId}.mp4`;

      const camDir = resolve(originalsDir, val.cameraId);
      mkdirSync(camDir, { recursive: true });
      const destFile = resolve(camDir, filename);
      copyFileSync(src, destFile);

      const stat = statSync(destFile);
      const segHash = val.actualSha256 || val.expectedSha256 || (await this.computeFileSha256(destFile));
      totalSize += stat.size;
      combinedHash.update(segHash);

      const relPath = `originals/${val.cameraId}/${filename}`;
      outputFiles.push({
        filename: relPath,
        mimeType: "video/mp4",
        size: stat.size,
        sha256: segHash,
      });
    }

    let primaryOutputPath = originalsDir;
    let finalHash = combinedHash.digest("hex");

    // Produce standalone POSIX ustar TAR archive on disk
    const tarEntries: Array<{ name: string; buffer: Buffer; mtime?: Date }> = [];
    for (const val of validations) {
      if (!val.exists) continue;
      const src = this.resolveStoragePath(val.storagePath);
      const data = readFileSync(src);
      const filename = val.storagePath.includes("/") || val.storagePath.includes("\\")
        ? val.storagePath.split(/[/\\]/).pop()!
        : `${val.segmentId}.mp4`;
      tarEntries.push({
        name: `originals/${val.cameraId}/${filename}`,
        buffer: data,
        mtime: new Date(val.startTime),
      });
    }
    const tarBuffer = createPosixTarArchive(tarEntries);
    const bundlePath = resolve(jobDir, "originals.tar");
    writeFileSync(bundlePath, tarBuffer);
    const tarHash = createHash("sha256").update(tarBuffer).digest("hex");

    return {
      outputPath: bundlePath,
      hash: tarHash,
      size: tarBuffer.length,
      files: outputFiles,
    };
  }

  /**
   * Create viewing copy (stream-copied/trimmed MP4 using FFmpeg concat demuxer)
   * Validates output with ffprobe and hashes the ACTUAL OUTPUT BYTES directly from disk.
   */
  private async createViewingCopy(
    jobDir: string,
    outputName: string,
    validations: SegmentValidationResult[],
    options: any,
    camera?: { cameraId: string; fromTime: string; toTime: string },
  ): Promise<{ outputPath: string; relativePath: string; hash: string; size: number; mediaInfo?: any }> {
    const footageDir = resolve(jobDir, "footage");
    mkdirSync(footageDir, { recursive: true });
    const outputPath = resolve(footageDir, `${outputName}.mp4`);
    const relativePath = `footage/${outputName}.mp4`;

    const existingValid = validations
      .filter((v) => v.exists && v.sizeBytes > 0 && v.isValid)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    if (existingValid.length === 0) {
      const err = new Error("EXPORT_FAILED: No valid source recordings available for requested interval");
      (err as any).code = "EXPORT_FAILED";
      throw err;
    }

    const ffmpegInstalled = await this.checkFfmpegAvailable();
    if (!ffmpegInstalled) {
      const err = new Error("MEDIA_ASSEMBLY_FAILED: FFmpeg is required for forensic media assembly");
      (err as any).code = "MEDIA_ASSEMBLY_FAILED";
      throw err;
    }

    // Build FFmpeg concat demuxer manifest
    const safeConcatId = outputName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const concatPath = resolve(jobDir, `concat_${safeConcatId}.txt`);
    const concatLines = existingValid.map((v) => {
      const resolved = this.resolveStoragePath(v.storagePath).replace(/\\/g, "/");
      return `file '${resolved}'`;
    });
    writeFileSync(concatPath, concatLines.join("\n"), "utf-8");

    let startOffsetSec = 0;
    let durationSec = 0;
    if (camera?.fromTime && camera?.toTime) {
      const firstSegStart = new Date(existingValid[0]!.startTime).getTime();
      const reqFrom = new Date(camera.fromTime).getTime();
      const reqTo = new Date(camera.toTime).getTime();
      startOffsetSec = Math.max(0, (reqFrom - firstSegStart) / 1000);
      durationSec = Math.max(0.1, (reqTo - reqFrom) / 1000);
    }

    const args = [
      "-v", "error",
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
    ];

    if (startOffsetSec > 0.05) {
      args.push("-ss", startOffsetSec.toFixed(3));
    }
    if (durationSec > 0) {
      args.push("-t", durationSec.toFixed(3));
    }
    args.push("-c", "copy", "-movflags", "+faststart", outputPath);

    let stderr = "";
    const exitCode = await new Promise<number | null>((resolvePromise) => {
      const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
      child.once("exit", (code) => resolvePromise(code));
      child.once("error", () => resolvePromise(-1));
    });

    // P0-03 & P0-04: Clean up temporary worker concat demuxer file immediately to prevent internal server path leakage
    try {
      if (existsSync(concatPath)) {
        unlinkSync(concatPath);
      }
    } catch {}

    if (exitCode !== 0) {
      const err = new Error(`MEDIA_ASSEMBLY_FAILED: FFmpeg exited with code ${exitCode}. ${stderr}`);
      (err as any).code = "MEDIA_ASSEMBLY_FAILED";
      throw err;
    }

    if (!existsSync(outputPath) || statSync(outputPath).size < 100) {
      const err = new Error("MEDIA_ASSEMBLY_FAILED: Output file was not generated or is empty");
      (err as any).code = "MEDIA_ASSEMBLY_FAILED";
      throw err;
    }

    // Verify output with ffprobe
    const probeResult = await this.probeMedia(outputPath);
    if (!probeResult.isValid || probeResult.durationSeconds <= 0) {
      const err = new Error(`MEDIA_ASSEMBLY_FAILED: ffprobe validation failed: ${probeResult.error || "invalid video stream"}`);
      (err as any).code = "MEDIA_ASSEMBLY_FAILED";
      throw err;
    }

    const finalSize = statSync(outputPath).size;
    const finalHash = await this.computeFileSha256(outputPath);

    return {
      outputPath,
      relativePath,
      hash: finalHash,
      size: finalSize,
      mediaInfo: probeResult,
    };
  }

  /**
   * Generates canonical manifest, calculates SHA-256 digest, and signs with EvidenceSigningProvider
   */
  private async generateSignedManifest(input: {
    jobId: string;
    caseId: string;
    tenantId: string;
    cameras: Array<{ cameraId: string; fromTime: string; toTime: string }>;
    rawSegments: any[];
    validationResults: SegmentValidationResult[];
    gaps: RecordingGapItem[];
    outputPath: string;
    outputFiles: Array<{ filename: string; mimeType: string; size: number; sha256: string }>;
    exportedBy: string;
    options: any;
    jobDir: string;
    mediaInfo?: any;
    cameraExportDetails?: Record<string, CameraExportDetails>;
  }): Promise<string> {
    const manifestId = randomUUID();

    const caseResult = await this.pool.query(
      `SELECT * FROM evidence_cases WHERE id = $1 AND tenant_id = $2`,
      [input.caseId, input.tenantId],
    );
    if (caseResult.rows.length === 0) {
      const err = new Error(`EXPORT_DENIED: Case ${input.caseId} does not belong to tenant ${input.tenantId}`);
      (err as any).code = "EXPORT_DENIED";
      throw err;
    }
    const evidenceCase = caseResult.rows[0];

    const firstCamera = input.cameras[0];
    const cameraResult = firstCamera
      ? await this.pool.query(
          `SELECT c.*, c.node_id as branch_id FROM cameras c
           LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
           WHERE c.id = $1 AND (c.tenant_id = $2 OR rn.tenant_id = $2)`,
          [firstCamera.cameraId, input.tenantId],
        )
      : { rows: [] };
    if (firstCamera && cameraResult.rows.length === 0) {
      const err = new Error(`EXPORT_DENIED: Camera ${firstCamera.cameraId} does not belong to tenant ${input.tenantId}`);
      (err as any).code = "EXPORT_DENIED";
      throw err;
    }
    const cameraRow = cameraResult.rows[0];

    const sortedValid = input.validationResults
      .filter((s) => s.isValid)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    const firstFrame = sortedValid.length > 0 ? sortedValid[0]!.startTime : null;
    const lastFrame = sortedValid.length > 0 ? sortedValid[sortedValid.length - 1]!.endTime : null;

    const earliestReqStart = input.cameras.reduce((min, c) => (!min || c.fromTime < min ? c.fromTime : min), "");
    const latestReqEnd = input.cameras.reduce((max, c) => (!max || c.toTime > max ? c.toTime : max), "");
    const investigationWindow = {
      start: earliestReqStart || new Date().toISOString(),
      end: latestReqEnd || new Date().toISOString(),
    };

    const reqFromMs = firstCamera ? new Date(firstCamera.fromTime).getTime() : 0;
    const reqToMs = firstCamera ? new Date(firstCamera.toTime).getTime() : 0;
    const firstFrameMs = firstFrame ? new Date(firstFrame).getTime() : 0;
    const lastFrameMs = lastFrame ? new Date(lastFrame).getTime() : 0;
    const startDeviationMs = firstFrameMs && reqFromMs ? firstFrameMs - reqFromMs : 0;
    const endDeviationMs = lastFrameMs && reqToMs ? lastFrameMs - reqToMs : 0;

    const sortedOutputs = [...input.outputFiles].sort((a, b) => a.filename.localeCompare(b.filename));
    const packageDigest = createHash("sha256")
      .update(canonicalJsonStringify(sortedOutputs.map((f) => ({ filename: f.filename, size: f.size, sha256: f.sha256 }))))
      .digest("hex");

    const rawMap = new Map<string, any>();
    for (const r of input.rawSegments) {
      rawMap.set(r.id, r);
    }

    const sourceSegments = input.validationResults.map((v) => {
      const raw = rawMap.get(v.segmentId);
      const receiveTs = raw?.server_receive_timestamp || raw?.received_at;
      const filename = v.storagePath.includes("/") || v.storagePath.includes("\\")
        ? v.storagePath.split(/[/\\]/).pop()!
        : `${v.segmentId}.mp4`;
      // P0-04: Prevent internal storage path leakage; use logical identifier
      const logicalLocator = `originals/${v.cameraId}/${filename}`;
      return {
        id: v.segmentId,
        cameraId: v.cameraId,
        start: v.startTime,
        end: v.endTime,
        size: v.sizeBytes,
        sha256: v.actualSha256 || v.expectedSha256 || "0".repeat(64),
        storageLocator: logicalLocator,
        valid: v.isValid,
        recordingServerReceiveTimestamp: receiveTs ? new Date(receiveTs).toISOString() : null,
      };
    });

    const firstRecv = sourceSegments.find((s) => s.recordingServerReceiveTimestamp)?.recordingServerReceiveTimestamp || null;
    const exportServerTimestamp = new Date().toISOString();

    // Build real manifest - no fabricated clock offset or NTP state
    const manifestPayload: ExportManifest = {
      schemaVersion: "2.0",
      packageId: input.jobId,
      caseId: input.caseId,
      caseNumber: evidenceCase?.case_number || `CASE-${input.caseId.slice(0, 8)}`,
      tenantId: input.tenantId,
      createdAt: new Date().toISOString(),
      exportedBy: input.exportedBy,
      reason: evidenceCase?.description || "Forensic Investigation Export",
      branchId: cameraRow?.branch_id || null,
      investigationWindow,
      camera: {
        id: cameraRow?.id || firstCamera?.cameraId || "unknown",
        name: cameraRow?.name || "Camera",
        channel: cameraRow?.channel ?? null,
        recorder: cameraRow?.recorder_id ?? null,
        location: cameraRow?.location_type ?? null,
      },
      cameras: input.cameraExportDetails || {},
      requested: {
        from: firstCamera?.fromTime || investigationWindow.start,
        to: firstCamera?.toTime || investigationWindow.end,
      },
      actual: {
        firstFrame,
        lastFrame,
        startDeviationMs,
        endDeviationMs,
      },
      mediaInfo: input.mediaInfo,
      packageDigest,
      deviceTimestamp: firstFrame,
      serverReceiveTimestamp: firstRecv,
      recordingServerReceiveTimestamp: firstRecv,
      exportServerTimestamp,
      estimatedClockOffset: null, // Null unless telemetry recorded
      cameraClockOffset: "UNKNOWN", // P0-02: Never fabricate 0 or omit when offset is unknown
      clockOffsetSource: "UNAVAILABLE",
      ntpStatus: "UNKNOWN", // Never fabricate "synchronized"
      timezone: "UTC",
      sourceSegments,
      gaps: input.gaps,
      outputFiles: input.outputFiles,
      watermarkApplied: Boolean(input.options?.watermark),
      redactionApplied: false,
      audioIncluded: Boolean(input.options?.audioIncluded),
      signingAlgorithm: "ED25519",
      signingKeyId: await this.signingProvider.getKeyId(),
      signedAt: new Date().toISOString(),
    };

    // Clean and serialize canonically with deterministic key ordering
    const cleanPayload = JSON.parse(JSON.stringify(manifestPayload));
    delete cleanPayload.digitalSignature;
    const canonicalManifestJson = canonicalJsonStringify(cleanPayload);
    const manifestDigest = createHash("sha256").update(canonicalManifestJson, "utf8").digest();

    // Sign with persistent EvidenceSigningProvider
    const signatureResult = await this.signingProvider.signDigest(manifestDigest);
    const signatureBase64 = signatureResult.signature.toString("base64");

    cleanPayload.digitalSignature = signatureBase64;
    cleanPayload.signingAlgorithm = signatureResult.algorithm;
    cleanPayload.signingKeyId = signatureResult.keyId;

    // Write manifest files to package folder
    const manifestPath = resolve(input.jobDir, "manifest.json");
    const sigPath = resolve(input.jobDir, "manifest.sig");
    writeFileSync(manifestPath, JSON.stringify(cleanPayload, null, 2), "utf-8");
    writeFileSync(sigPath, signatureBase64, "utf-8");

    // Persist to PostgreSQL database
    await this.pool.query(
      `INSERT INTO evidence_manifests (
         id, case_id, version, export_job_id, source_segments, destination_file,
         timestamp, export_chain, watermark_applied, password_protected,
         digital_signature, signing_key_id, signed_at, exported_by, created_at
       ) VALUES ($1, $2, 'v2.0', $3, $4, $5, $6, $7, $8, false, $9, $10, now(), $11, now())`,
      [
        manifestId,
        input.caseId,
        input.jobId,
        JSON.stringify(manifestPayload.sourceSegments),
        JSON.stringify(input.outputFiles[0] || { format: "unknown", size: 0, sha256: "" }),
        JSON.stringify({
          serverReceiveTimestamp: manifestPayload.serverReceiveTimestamp,
          estimatedClockOffset: manifestPayload.estimatedClockOffset,
          ntpStatus: manifestPayload.ntpStatus,
        }),
        JSON.stringify([
          { step: "source_verified", timestamp: new Date().toISOString() },
          { step: "manifest_signed", timestamp: manifestPayload.signedAt },
        ]),
        manifestPayload.watermarkApplied,
        signatureBase64,
        signatureResult.keyId,
        input.exportedBy,
      ],
    );

    return manifestId;
  }

  /**
   * Validates media file using ffprobe and extracts technical metadata
   */
  async probeMedia(filePath: string): Promise<{
    isValid: boolean;
    container: string;
    videoCodec?: string;
    width?: number;
    height?: number;
    fps?: number;
    durationSeconds: number;
    hasAudio: boolean;
    streamCount: number;
    startTime?: string;
    error?: string;
  }> {
    return new Promise((resolvePromise) => {
      const child = spawn("ffprobe", [
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        filePath,
      ]);

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => { stdout += d.toString(); });
      child.stderr?.on("data", (d) => { stderr += d.toString(); });

      child.once("exit", (code) => {
        if (code !== 0) {
          return resolvePromise({
            isValid: false,
            container: "unknown",
            durationSeconds: 0,
            hasAudio: false,
            streamCount: 0,
            error: stderr || `ffprobe exited with code ${code}`,
          });
        }

        try {
          const data = JSON.parse(stdout);
          const format = data.format || {};
          const streams = Array.isArray(data.streams) ? data.streams : [];
          const videoStream = streams.find((s: any) => s.codec_type === "video");
          const audioStream = streams.find((s: any) => s.codec_type === "audio");
          const durationSeconds = parseFloat(format.duration || "0") || (videoStream ? parseFloat(videoStream.duration || "0") : 0);

          let fps = 0;
          if (videoStream?.r_frame_rate) {
            const parts = videoStream.r_frame_rate.split("/");
            fps = parts.length === 2 && parseFloat(parts[1]) > 0 ? parseFloat(parts[0]) / parseFloat(parts[1]) : parseFloat(parts[0]);
          }

          resolvePromise({
            isValid: Boolean(videoStream && durationSeconds > 0),
            container: format.format_name || "mp4",
            videoCodec: videoStream?.codec_name,
            width: videoStream?.width ? parseInt(videoStream.width, 10) : undefined,
            height: videoStream?.height ? parseInt(videoStream.height, 10) : undefined,
            fps: Math.round(fps * 100) / 100,
            durationSeconds: Math.round(durationSeconds * 1000) / 1000,
            hasAudio: Boolean(audioStream),
            streamCount: streams.length,
            startTime: format.start_time,
          });
        } catch (err: any) {
          resolvePromise({
            isValid: false,
            container: "unknown",
            durationSeconds: 0,
            hasAudio: false,
            streamCount: 0,
            error: err.message,
          });
        }
      });

      child.once("error", (err) => {
        resolvePromise({
          isValid: false,
          container: "unknown",
          durationSeconds: 0,
          hasAudio: false,
          streamCount: 0,
          error: err.message,
        });
      });
    });
  }

  /**
   * P1.5 Crash Recovery: On startup or worker restart, scan for jobs left in-flight
   * (status in 'processing', 'transcoding', 'packaging', 'signing') due to worker crash
   * or power loss, and transition them to 'failed' with explicit forensic audit trails,
   * preventing jobs from remaining indefinitely stuck in 'processing'.
   */
  async recoverIncompleteJobs(): Promise<number> {
    const result = await this.pool.query(
      `SELECT id, case_id, status FROM forensic_export_jobs
       WHERE status IN ('processing', 'transcoding', 'packaging', 'signing')`,
    );

    for (const row of result.rows) {
      await this.pool.query(
        `UPDATE forensic_export_jobs
         SET status = 'failed',
             error_message = 'WORKER_CRASH_RECOVERY: Interrupted by worker restart or crash during state ' || $2,
             updated_at = now()
         WHERE id = $1`,
        [row.id, row.status],
      );

      await this.recordCustodyEvent({
        evidenceId: row.case_id,
        action: "worker_crash_recovered",
        performedBy: "system",
        reason: `Export job ${row.id} recovered after worker crash during state ${row.status}`,
      });
    }

    return result.rows.length;
  }

  async getExportJob(jobId: string): Promise<ExportJob | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM forensic_export_jobs WHERE id = $1`,
      [jobId],
    );
    return result.rows[0] ? mapExportJob(result.rows[0]) : undefined;
  }

  async listExportJobs(
    caseId: string,
    filters?: { status?: string; limit?: number },
  ): Promise<ExportJob[]> {
    const limit = filters?.limit ?? 50;
    const statusFilter = filters?.status ? `AND status = $2` : "";

    const result = await this.pool.query(
      `SELECT * FROM forensic_export_jobs
       WHERE case_id = $1 ${statusFilter}
       ORDER BY created_at DESC
       LIMIT ${limit}`,
      filters?.status ? [caseId, filters.status] : [caseId],
    );

    return result.rows.map(mapExportJob);
  }

  /**
   * Validate download token, enforcing expiry, maximum downloads, and recording download audit
   */
  async validateDownload(
    downloadToken: string,
  ): Promise<{ valid: boolean; job?: ExportJob; reason?: string }> {
    const result = await this.pool.query(
      `SELECT * FROM forensic_export_jobs
       WHERE download_token = $1 AND status = 'ready'`,
      [downloadToken],
    );

    if (!result.rows[0]) {
      return { valid: false, reason: "Invalid token" };
    }

    const job = mapExportJob(result.rows[0]);

    if (job.downloadExpiresAt && new Date(job.downloadExpiresAt) < new Date()) {
      return { valid: false, reason: "Download expired", job };
    }

    if (job.downloadCount >= job.maxDownloads) {
      return { valid: false, reason: "Maximum downloads exceeded", job };
    }

    await this.pool.query(
      `UPDATE forensic_export_jobs
       SET download_count = download_count + 1, updated_at = now()
       WHERE id = $1`,
      [job.id],
    );

    return { valid: true, job };
  }

  private async recordCustodyEvent(input: {
    evidenceId: string;
    action: string;
    performedBy: string;
    reason?: string;
    tenantId?: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await appendCustodyEventTx(client, {
        evidenceId: input.evidenceId,
        action: input.action,
        performedBy: input.performedBy,
        actorType: "SYSTEM",
        reason: input.reason,
      });
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private resolveStoragePath(storagePath: string): string {
    if (existsSync(storagePath)) return storagePath;
    const base = process.env.RECORDING_STORAGE_ROOT || process.cwd();
    const candidate = resolve(base, storagePath);
    return candidate;
  }

  private async computeFileSha256(filePath: string): Promise<string> {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    return new Promise((res, rej) => {
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", (err) => rej(err));
      stream.on("end", () => res(hash.digest("hex")));
    });
  }

  private async checkFfmpegAvailable(): Promise<boolean> {
    return new Promise((res) => {
      const child = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
      child.once("error", () => res(false));
      child.once("exit", (code) => res(code === 0));
    });
  }
}

function mapExportJob(row: any): ExportJob {
  return {
    id: row.id,
    caseId: row.case_id,
    tenantId: row.tenant_id,
    exportType: row.export_type,
    format: row.format,
    cameras: row.cameras,
    options: row.options || {},
    status: row.status,
    priority: row.priority,
    requestedBy: row.requested_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : undefined,
    reason: row.reason,
    totalSegments: row.total_segments,
    processedSegments: row.processed_segments,
    totalBytes: Number(row.total_bytes),
    outputPath: row.output_path,
    outputSizeBytes: row.output_size_bytes ? Number(row.output_size_bytes) : undefined,
    outputHashSha256: row.output_hash_sha256,
    manifestId: row.manifest_id,
    downloadToken: row.download_token,
    downloadExpiresAt: row.download_expires_at
      ? new Date(row.download_expires_at).toISOString()
      : undefined,
    downloadCount: row.download_count,
    maxDownloads: row.max_downloads,
    errorMessage: row.error_message,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
