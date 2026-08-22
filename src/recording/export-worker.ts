import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Pool } from "pg";

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

export interface ExportManifest {
  id: string;
  caseId: string;
  version: string;
  evidenceId: string;
  caseNumber: string;
  exportedBy: string;
  exportedAt: string;
  sourceSegments: Array<{
    segmentId: string;
    cameraId: string;
    cameraName: string;
    startTime: string;
    endTime: string;
    sha256: string;
    storagePath: string;
  }>;
  destinationFile: {
    format: string;
    sha256: string;
    fileSize: number;
    codec?: string;
    resolution?: string;
  };
  timestamp: {
    cameraTime: string;
    recorderTime: string;
    clockOffset: number;
    ntpStatus: string;
    timezone: string;
  };
  cameras: Array<{
    id: string;
    name: string;
    location: string;
    ntpEnabled: boolean;
  }>;
  exportChain: Array<{
    step: string;
    timestamp: string;
    details: Record<string, unknown>;
  }>;
  watermarkApplied: boolean;
  passwordProtected: boolean;
  digitalSignature?: string;
  signingKeyId?: string;
  signedAt?: string;
}

export class ExportWorker {
  constructor(private readonly pool: Pool) {}

  /**
   * Create a new export job
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

    // Count total segments to be exported
    let totalSegments = 0;
    let totalBytes = 0;

    for (const camera of input.cameras) {
      const result = await this.pool.query(
        `SELECT COUNT(*) as count, SUM(size_bytes) as bytes
         FROM recording_segments
         WHERE camera_id = $1
         AND started_at >= $2::timestamptz
         AND ended_at <= $3::timestamptz
         AND status = 'ready'`,
        [camera.cameraId, camera.fromTime, camera.toTime],
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
   * Process export job (called by background worker)
   */
  async processExport(jobId: string): Promise<void> {
    // Update status to processing
    await this.pool.query(
      `UPDATE forensic_export_jobs
       SET status = 'processing', started_at = now(), updated_at = now()
       WHERE id = $1`,
      [jobId],
    );

    try {
      const job = await this.getExportJob(jobId);
      if (!job) throw new Error("Job not found");

      const cameras = JSON.parse(job.cameras as any);
      const segments: any[] = [];

      // Collect all segments
      for (const camera of cameras) {
        const result = await this.pool.query(
          `SELECT rs.*, c.name as camera_name
           FROM recording_segments rs
           JOIN cameras c ON c.id = rs.camera_id
           WHERE rs.camera_id = $1
           AND rs.started_at >= $2::timestamptz
           AND rs.ended_at <= $3::timestamptz
           AND rs.status = 'ready'
           ORDER BY rs.started_at ASC`,
          [camera.cameraId, camera.fromTime, camera.toTime],
        );

        segments.push(...result.rows);
      }

      // Generate export based on type
      let outputPath: string;
      let outputHash: string;
      let outputSize: number;

      if (job.format === "manifest-only") {
        // Only create manifest
        const manifest = await this.createManifest({
          caseId: job.caseId,
          exportedBy: job.requestedBy,
          segments,
        });

        outputPath = `manifests/${manifest.id}.json`;
        outputHash = manifest.id; // Placeholder
        outputSize = 0;
      } else if (job.exportType === "original") {
        // Original export - copy segments as-is
        const result = await this.exportOriginalEvidence(jobId, segments);
        outputPath = result.outputPath;
        outputHash = result.hash;
        outputSize = result.size;
      } else {
        // Viewing copy - transcode to MP4
        const result = await this.createViewingCopy(jobId, segments, job.options);
        outputPath = result.outputPath;
        outputHash = result.hash;
        outputSize = result.size;
      }

      // Generate signed manifest
      const manifestId = await this.generateSignedManifest({
        jobId,
        caseId: job.caseId,
        segments,
        outputPath,
        outputHash,
        outputSize,
        exportedBy: job.requestedBy,
      });

      // Generate download token
      const downloadToken = randomUUID();
      const downloadExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Update job as complete
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
      });
    } catch (error) {
      // Mark as failed
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
   * Export original evidence (untranscoded)
   */
  private async exportOriginalEvidence(
    jobId: string,
    segments: any[],
  ): Promise<{ outputPath: string; hash: string; size: number }> {
    // In production: Copy original segments to evidence vault
    // For now, return placeholder
    const outputPath = `evidence-exports/${jobId}/original.tar`;
    const hash = createHash("sha256").update(jobId).digest("hex");
    const size = segments.reduce((sum, s) => sum + Number(s.size_bytes || 0), 0);

    // Update progress
    for (let i = 0; i < segments.length; i++) {
      await this.pool.query(
        `UPDATE forensic_export_jobs
         SET processed_segments = $2, updated_at = now()
         WHERE id = $1`,
        [jobId, i + 1],
      );
    }

    return { outputPath, hash, size };
  }

  /**
   * Create viewing copy (transcoded MP4 with optional watermark)
   */
  private async createViewingCopy(
    jobId: string,
    segments: any[],
    options: any,
  ): Promise<{ outputPath: string; hash: string; size: number }> {
    // Update status to transcoding
    await this.pool.query(
      `UPDATE forensic_export_jobs
       SET status = 'transcoding', updated_at = now()
       WHERE id = $1`,
      [jobId],
    );

    // In production: Use FFmpeg to transcode, add watermark/overlay
    // For now, return placeholder
    const outputPath = `evidence-exports/${jobId}/viewing-copy.mp4`;
    const hash = createHash("sha256").update(`${jobId}-viewing`).digest("hex");
    const estimatedSize = Math.floor(
      segments.reduce((sum, s) => sum + Number(s.size_bytes || 0), 0) * 0.7,
    );

    // Simulate progress
    for (let i = 0; i < segments.length; i++) {
      await this.pool.query(
        `UPDATE forensic_export_jobs
         SET processed_segments = $2, updated_at = now()
         WHERE id = $1`,
        [jobId, i + 1],
      );
    }

    return { outputPath, hash, size: estimatedSize };
  }

  /**
   * Generate signed manifest
   */
  private async generateSignedManifest(input: {
    jobId: string;
    caseId: string;
    segments: any[];
    outputPath: string;
    outputHash: string;
    outputSize: number;
    exportedBy: string;
  }): Promise<string> {
    const manifestId = randomUUID();

    // Get case details
    const caseResult = await this.pool.query(
      `SELECT * FROM evidence_cases WHERE id = $1`,
      [input.caseId],
    );
    const evidenceCase = caseResult.rows[0];

    const sourceSegments = input.segments.map((seg) => ({
      segmentId: seg.id,
      cameraId: seg.camera_id,
      cameraName: seg.camera_name || seg.camera_id,
      startTime: new Date(seg.started_at).toISOString(),
      endTime: new Date(seg.ended_at).toISOString(),
      sha256: seg.checksum_sha256 || "",
      storagePath: seg.storage_path,
    }));

    const exportChain = [
      {
        step: "segments_collected",
        timestamp: new Date().toISOString(),
        details: { count: input.segments.length },
      },
      {
        step: "export_generated",
        timestamp: new Date().toISOString(),
        details: { outputPath: input.outputPath },
      },
    ];

    // Create digital signature (in production: use actual signing key)
    const signatureData = JSON.stringify({
      manifestId,
      caseId: input.caseId,
      outputHash: input.outputHash,
      exportedBy: input.exportedBy,
      timestamp: new Date().toISOString(),
    });
    const signature = createHash("sha256").update(signatureData).digest("hex");

    await this.pool.query(
      `INSERT INTO evidence_manifests (
         id, case_id, version, export_job_id, source_segments, destination_file,
         timestamp, export_chain, watermark_applied, password_protected,
         digital_signature, signing_key_id, signed_at, exported_by, created_at
       ) VALUES ($1, $2, 'v1.0', $3, $4, $5, $6, $7, false, false, $8, 'system-key-01', now(), $9, now())`,
      [
        manifestId,
        input.caseId,
        input.jobId,
        JSON.stringify(sourceSegments),
        JSON.stringify({
          format: "mp4",
          sha256: input.outputHash,
          fileSize: input.outputSize,
        }),
        JSON.stringify({
          cameraTime: new Date().toISOString(),
          recorderTime: new Date().toISOString(),
          clockOffset: 0,
          ntpStatus: "synchronized",
          timezone: "UTC",
        }),
        JSON.stringify(exportChain),
        signature,
        input.exportedBy,
      ],
    );

    return manifestId;
  }

  /**
   * Create manifest document
   */
  async createManifest(input: {
    caseId: string;
    exportedBy: string;
    segments: any[];
  }): Promise<ExportManifest> {
    const manifestId = randomUUID();

    const sourceSegments = input.segments.map((seg: any) => ({
      segmentId: seg.id,
      cameraId: seg.camera_id,
      cameraName: seg.camera_name || "",
      startTime: new Date(seg.started_at).toISOString(),
      endTime: new Date(seg.ended_at).toISOString(),
      sha256: seg.checksum_sha256 || "",
      storagePath: seg.storage_path,
    }));

    return {
      id: manifestId,
      caseId: input.caseId,
      version: "v1.0",
      evidenceId: input.caseId,
      caseNumber: "CASE-" + Date.now(),
      exportedBy: input.exportedBy,
      exportedAt: new Date().toISOString(),
      sourceSegments,
      destinationFile: {
        format: "manifest",
        sha256: "",
        fileSize: 0,
      },
      timestamp: {
        cameraTime: new Date().toISOString(),
        recorderTime: new Date().toISOString(),
        clockOffset: 0,
        ntpStatus: "synchronized",
        timezone: "UTC",
      },
      cameras: [],
      exportChain: [],
      watermarkApplied: false,
      passwordProtected: false,
    };
  }

  /**
   * Get export job by ID
   */
  async getExportJob(jobId: string): Promise<ExportJob | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM forensic_export_jobs WHERE id = $1`,
      [jobId],
    );

    return result.rows[0] ? mapExportJob(result.rows[0]) : undefined;
  }

  /**
   * List export jobs for a case
   */
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
   * Validate download token and increment count
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

    // Increment download count
    await this.pool.query(
      `UPDATE forensic_export_jobs
       SET download_count = download_count + 1, updated_at = now()
       WHERE id = $1`,
      [job.id],
    );

    return { valid: true, job };
  }

  /**
   * Record chain of custody event
   */
  private async recordCustodyEvent(input: {
    evidenceId: string;
    action: string;
    performedBy: string;
    reason?: string;
  }): Promise<void> {
    const prevResult = await this.pool.query(
      `SELECT event_hash FROM chain_of_custody_events
       WHERE evidence_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.evidenceId],
    );

    const previousHash = prevResult.rows[0]?.event_hash ?? null;

    const eventData = JSON.stringify({
      action: input.action,
      performedBy: input.performedBy,
      timestamp: new Date().toISOString(),
      reason: input.reason,
      previousHash,
    });
    const eventHash = createHash("sha256").update(eventData).digest("hex");

    await this.pool.query(
      `INSERT INTO chain_of_custody_events (
         id, evidence_id, action, performed_by, reason,
         event_hash, previous_hash, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [randomUUID(), input.evidenceId, input.action, input.performedBy, input.reason ?? null, eventHash, previousHash],
    );
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
