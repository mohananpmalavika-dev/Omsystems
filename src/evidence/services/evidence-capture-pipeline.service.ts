import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  AlertEvidenceRecord,
  EvidenceCaptureSource,
  EvidenceManifest,
  EvidenceSlaSummary,
} from "../domain/evidence.types.js";
import { EvidenceHashVerifierService } from "./evidence-hash-verifier.service.js";
import { EvidencePolicyService, evidencePolicyService } from "./evidence-policy.service.js";
import { EvidenceStorageService, evidenceStorageService } from "./evidence-storage.service.js";
import { HttpAlertEvidenceClient, type AlertEvidenceClient, type AlertEvidenceKind } from "../../alerts/evidence-capture.js";

export interface EvidenceJobRequest {
  alertId: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  alertType: string;
  severity: "P1" | "P2" | "P3" | "P4";
  detectedAt?: Date;
  preferredSource?: EvidenceCaptureSource;
  incidentId?: string;
}

import { createHash } from "node:crypto";
import {
  getEvidenceSigningProvider,
  type EvidenceSigningProvider,
} from "../signing/evidence-signing-provider.js";

/** 
 * Durable Evidence Capture Pipeline Service
 * Enforces PostgreSQL backing store with idempotent 8-stage state machine.
 */
export class EvidenceCapturePipelineService {
  private readonly memoryRecords = new Map<string, AlertEvidenceRecord>();
  private readonly memoryManifests = new Map<string, EvidenceManifest>();
  private readonly latencies: { snapshotMs: number[]; completeMs: number[] } = { snapshotMs: [], completeMs: [] };
  private readonly signingProvider: EvidenceSigningProvider;

  constructor(
    private readonly policyService: EvidencePolicyService = evidencePolicyService,
    private readonly storageService: EvidenceStorageService = evidenceStorageService,
    private readonly recordingClient?: AlertEvidenceClient,
    private readonly pool?: Pool,
    signingProvider?: EvidenceSigningProvider,
  ) {
    this.signingProvider = signingProvider || getEvidenceSigningProvider();
    if (process.env.NODE_ENV === "production" && !this.pool) {
      throw new Error("EVIDENCE_STORE_UNAVAILABLE: EvidenceCapturePipelineService requires a PostgreSQL pool in production");
    }
  }

  async enqueueEvidenceCapture(request: EvidenceJobRequest): Promise<AlertEvidenceRecord> {
    const existing = await this.getEvidenceForAlert(request.alertId);
    if (existing) return existing;

    const detectedAt = request.detectedAt ?? new Date();
    const policy = this.policyService.getPolicy(request.alertType, request.severity);
    const id = `ev-${randomUUID()}`;
    const idempotencyKey = `${request.tenantId}:${request.alertId}:evidence:v1`;

    const record: AlertEvidenceRecord = {
      id,
      alertId: request.alertId,
      tenantId: request.tenantId,
      branchId: request.branchId,
      cameraId: request.cameraId,
      status: "QUEUED",
      requestedStartAt: new Date(detectedAt.getTime() - policy.preEventSeconds * 1000),
      requestedEndAt: new Date(detectedAt.getTime() + policy.postEventSeconds * 1000),
      detectedAt,
      preEventSeconds: policy.preEventSeconds,
      postEventSeconds: policy.postEventSeconds,
      attemptCount: 1,
      maxAttempts: policy.retryCount,
      createdAt: new Date(),
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO evidence_capture_jobs (
             id, tenant_id, branch_id, camera_id, alert_id, incident_id, alert_type, severity,
             status, requested_start_at, requested_end_at, detected_at, pre_event_seconds, post_event_seconds,
             attempt_count, max_attempts, idempotency_key, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'QUEUED', $9, $10, $11, $12, $13, 1, $14, $15, NOW(), NOW())
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            record.id,
            record.tenantId,
            record.branchId,
            record.cameraId,
            record.alertId,
            request.incidentId || null,
            request.alertType,
            request.severity,
            record.requestedStartAt,
            record.requestedEndAt,
            record.detectedAt,
            record.preEventSeconds,
            record.postEventSeconds,
            record.maxAttempts,
            idempotencyKey,
          ],
        );
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`EVIDENCE_STORE_UNAVAILABLE: Failed to enqueue evidence capture job: ${err instanceof Error ? err.message : String(err)}`);
        }
        console.warn("[EvidencePipeline] DB enqueue failed, fallback memory:", err);
      }
    }

    this.memoryRecords.set(request.alertId, record);
    return this.executeCapture(record, request);
  }

  async executeCapture(record: AlertEvidenceRecord, request: EvidenceJobRequest): Promise<AlertEvidenceRecord> {
    const startTime = Date.now();
    record.status = "CAPTURING";
    await this.updateJobStatus(record.id, "CAPTURING");

    if (!this.recordingClient) {
      return this.fail(record, "UNSUPPORTED_CAPABILITY", "Recording-engine evidence client is not configured", startTime);
    }

    try {
      const requestedDuration = record.preEventSeconds + record.postEventSeconds;
      const capture = await this.recordingClient.capture({
        alertId: record.alertId,
        cameraId: record.cameraId,
        occurredAt: record.detectedAt.toISOString(),
        clipSeconds: requestedDuration,
      });

      if (capture.state === "failed") {
        return this.fail(record, "RECORDING_NOT_FOUND", capture.error ?? "Recording engine rejected evidence capture", startTime);
      }
      if (capture.state === "queued" || capture.state === "capturing") {
        record.status = "CAPTURING";
        record.latencyMs = Date.now() - startTime;
        this.memoryRecords.set(record.alertId, record);
        return record;
      }

      // STAGE: VERIFYING & HASHING
      await this.updateJobStatus(record.id, "VERIFYING");

      if (capture.snapshotAvailable) {
        record.snapshot = await this.persistRemoteAsset(record, "snapshot", "snapshot.jpg", "image/jpeg");
        this.latencies.snapshotMs.push(Date.now() - startTime);
      }
      if (capture.clipAvailable) {
        record.videoClip = await this.persistRemoteAsset(record, "clip", "evidence_clip.mp4", "video/mp4", requestedDuration);
      }

      record.captureSource = request.preferredSource ?? "RECORDER_ARCHIVE";
      
      // STAGE: PERSISTING & SIGNING
      await this.updateJobStatus(record.id, "SIGNING");

      record.status = record.snapshot && record.videoClip ? "READY" : record.snapshot || record.videoClip ? "PARTIAL" : "FAILED";
      if (record.status === "FAILED") {
        return this.fail(record, "RECORDING_NOT_FOUND", "Recording engine returned no evidence assets", startTime);
      }

      const manifestData = EvidenceHashVerifierService.generateManifest({
        evidenceId: record.id,
        alertId: record.alertId,
        branchId: record.branchId,
        cameraId: record.cameraId,
        detectedAt: record.detectedAt.toISOString(),
        requestedWindow: {
          start: record.requestedStartAt.toISOString(),
          end: record.requestedEndAt.toISOString(),
        },
        actualWindow: {
          start: record.requestedStartAt.toISOString(),
          end: record.requestedEndAt.toISOString(),
        },
        snapshot: record.snapshot
          ? {
              sha256: record.snapshot.sha256,
              sizeBytes: record.snapshot.sizeBytes,
              url: record.snapshot.url,
            }
          : undefined,
        video: record.videoClip
          ? {
              sha256: record.videoClip.sha256,
              durationSeconds: record.videoClip.durationSeconds ?? 0,
              sizeBytes: record.videoClip.sizeBytes,
              url: record.videoClip.url,
            }
          : undefined,
        source: record.captureSource ?? "RECORDER_ARCHIVE",
        generatedAt: new Date().toISOString(),
      });

      const manifestBuffer = Buffer.from(JSON.stringify(manifestData), "utf8");
      record.manifest = {
        id: `manifest-${record.id}`,
        type: "MANIFEST",
        storageKey: `evidence/${record.tenantId}/${record.id}/manifest.json`,
        url: `/api/v1/evidence/${record.id}/manifest`,
        mimeType: "application/json",
        sizeBytes: manifestBuffer.length,
        sha256: manifestData.manifestSha256,
        capturedAt: new Date(),
        verified: true,
        assetType: "DERIVED",
      };
      record.manifestHash = manifestData.manifestSha256;
      this.memoryManifests.set(record.id, manifestData);

      // Real cryptographic signing using injected signing provider
      let signatureBytes = "";
      let signatureAlgorithm = "RSASSA-PKCS1-v1_5-SHA256";
      try {
        const sigResult = await this.signingProvider.signDigest(
          Buffer.from(manifestData.manifestSha256, "hex"),
        );
        signatureBytes = sigResult.signature.toString("base64");
        signatureAlgorithm = sigResult.algorithm;
      } catch (signErr) {
        if (process.env.NODE_ENV === "production") {
          throw new Error("EVIDENCE_SIGNING_UNAVAILABLE: Cryptographic evidence signing failed: " + (signErr instanceof Error ? signErr.message : String(signErr)));
        }
      }

      // Persist to PostgreSQL if available
      if (this.pool) {
        try {
          if (record.videoClip) {
            await this.pool.query(
              `INSERT INTO evidence_assets (
                 id, job_id, asset_type, file_name, mime_type, byte_size, sha256, storage_node, storage_path, duration_seconds, created_at
               ) VALUES ($1, $2, 'clip', $3, $4, $5, $6, 'primary', $7, $8, NOW())
               ON CONFLICT (id) DO NOTHING`,
              [
                `asset-${record.id}-clip`,
                record.id,
                "evidence_clip.mp4",
                record.videoClip.mimeType,
                record.videoClip.sizeBytes,
                record.videoClip.sha256,
                record.videoClip.storageKey,
                record.videoClip.durationSeconds || null,
              ],
            );
          }
          if (record.snapshot) {
            await this.pool.query(
              `INSERT INTO evidence_assets (
                 id, job_id, asset_type, file_name, mime_type, byte_size, sha256, storage_node, storage_path, created_at
               ) VALUES ($1, $2, 'snapshot', $3, $4, $5, $6, 'primary', $7, NOW())
               ON CONFLICT (id) DO NOTHING`,
              [
                `asset-${record.id}-snapshot`,
                record.id,
                "snapshot.jpg",
                record.snapshot.mimeType,
                record.snapshot.sizeBytes,
                record.snapshot.sha256,
                record.snapshot.storageKey,
              ],
            );
          }

          await this.pool.query(
            `INSERT INTO evidence_manifests (
               id, job_id, tenant_id, alert_id, branch_id, camera_id, capture_start, capture_end,
               device_timestamp, server_timestamp, capture_reason, asset_sha256, manifest_sha256,
               signature_algorithm, signature_bytes, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
             ON CONFLICT (job_id) DO NOTHING`,
            [
              `manifest-${record.id}`,
              record.id,
              record.tenantId,
              record.alertId,
              record.branchId,
              record.cameraId,
              record.requestedStartAt,
              record.requestedEndAt,
              record.detectedAt,
              new Date(),
              "P1/P2 Security Incident Automatic Evidence Capture",
              record.videoClip?.sha256 || record.snapshot?.sha256 || "none",
              manifestData.manifestSha256,
              signatureAlgorithm,
              signatureBytes,
            ],
          );
        } catch (err) {
          if (process.env.NODE_ENV === "production") {
            throw new Error(`EVIDENCE_STORE_UNAVAILABLE: Failed to persist evidence manifest or assets: ${err instanceof Error ? err.message : String(err)}`);
          }
          console.warn("[EvidencePipeline] DB manifest persist error:", err);
        }
      }

      record.completedAt = new Date();
      record.latencyMs = Date.now() - startTime;
      this.latencies.completeMs.push(record.latencyMs);
      this.memoryRecords.set(record.alertId, record);

      await this.updateJobStatus(record.id, record.status === "READY" ? "COMPLETE" : record.status, record.latencyMs);
      return record;
    } catch (error) {
      return this.fail(record, "ARCHIVE_SEARCH_FAILED", error instanceof Error ? error.message : "Evidence capture failed", startTime);
    }
  }

  async getEvidenceForAlert(alertId: string): Promise<AlertEvidenceRecord | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM evidence_capture_jobs WHERE alert_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [alertId],
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: row.id,
            alertId: row.alert_id,
            tenantId: row.tenant_id,
            branchId: row.branch_id,
            cameraId: row.camera_id,
            status: row.status === "COMPLETE" ? "READY" : row.status,
            requestedStartAt: new Date(row.requested_start_at),
            requestedEndAt: new Date(row.requested_end_at),
            detectedAt: new Date(row.detected_at),
            preEventSeconds: row.pre_event_seconds,
            postEventSeconds: row.post_event_seconds,
            attemptCount: row.attempt_count,
            maxAttempts: row.max_attempts,
            failureCode: row.failure_code,
            failureReason: row.failure_reason,
            latencyMs: row.latency_ms,
            createdAt: new Date(row.created_at),
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
          };
        }
      } catch (err) {
        console.warn("[EvidencePipeline] DB query error:", err);
      }
    }

    return this.memoryRecords.get(alertId) ?? null;
  }

  async getManifest(evidenceId: string): Promise<EvidenceManifest | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM evidence_manifests WHERE job_id = $1 OR id = $1 LIMIT 1`,
          [evidenceId],
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            evidenceId: row.job_id,
            alertId: row.alert_id,
            branchId: row.branch_id,
            cameraId: row.camera_id,
            detectedAt: new Date(row.device_timestamp).toISOString(),
            requestedWindow: {
              start: new Date(row.capture_start).toISOString(),
              end: new Date(row.capture_end).toISOString(),
            },
            actualWindow: {
              start: new Date(row.capture_start).toISOString(),
              end: new Date(row.capture_end).toISOString(),
            },
            source: "RECORDER_ARCHIVE",
            generatedAt: new Date(row.created_at).toISOString(),
            manifestSha256: row.manifest_sha256,
          };
        }
      } catch (err) {
        console.warn("[EvidencePipeline] DB getManifest error:", err);
      }
    }

    return this.memoryManifests.get(evidenceId) ?? null;
  }

  async getSlaSummary(): Promise<EvidenceSlaSummary> {
    const list = [...this.memoryRecords.values()];
    const snapshotLatencies = [...this.latencies.snapshotMs].sort((a, b) => a - b);
    const completeLatencies = [...this.latencies.completeMs].sort((a, b) => a - b);
    const failureBreakdown: Record<string, number> = {};
    for (const record of list) if (record.failureCode) failureBreakdown[record.failureCode] = (failureBreakdown[record.failureCode] ?? 0) + 1;
    const ready = list.filter((record) => record.status === "READY").length;
    return {
      totalRequested: list.length,
      completedReady: ready,
      completedPartial: list.filter((record) => record.status === "PARTIAL").length,
      failedCount: list.filter((record) => record.status === "FAILED").length,
      readyPercentage: list.length > 0 ? Math.round((ready / list.length) * 10_000) / 100 : 0,
      medianSnapshotLatencyMs: percentile(snapshotLatencies, 0.5),
      p95SnapshotLatencyMs: percentile(snapshotLatencies, 0.95),
      medianCompleteEvidenceLatencyMs: percentile(completeLatencies, 0.5),
      p95CompleteEvidenceLatencyMs: percentile(completeLatencies, 0.95),
      failureBreakdown,
    };
  }

  private async updateJobStatus(jobId: string, status: string, latencyMs?: number): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE evidence_capture_jobs SET status = $1, latency_ms = COALESCE($2, latency_ms), updated_at = NOW(), completed_at = CASE WHEN $1 IN ('COMPLETE', 'FAILED', 'PARTIAL') THEN NOW() ELSE completed_at END WHERE id = $3`,
          [status, latencyMs || null, jobId],
        );
      } catch {
        // ignore
      }
    }
  }

  private async persistRemoteAsset(
    record: AlertEvidenceRecord,
    kind: AlertEvidenceKind,
    filename: string,
    defaultMimeType: string,
    durationSeconds?: number,
  ) {
    if (!this.recordingClient) throw new Error("Recording-engine evidence client is not configured");
    const response = await this.recordingClient.asset(record.alertId, kind);
    if (!response.ok) throw new Error(`Recording-engine ${kind} request failed (${response.status})`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length === 0) throw new Error(`Recording-engine ${kind} response was empty`);
    const sha256 = EvidenceHashVerifierService.computeSha256(data);
    const storageKey = this.storageService.formatStorageKey({
      tenantId: record.tenantId,
      branchId: record.branchId,
      alertId: record.alertId,
      filename,
      date: record.detectedAt,
    });
    return this.storageService.putAsset({
      storageKey,
      data,
      mimeType: response.headers.get("content-type") ?? defaultMimeType,
      type: kind === "snapshot" ? "SNAPSHOT" : "VIDEO_CLIP",
      sha256,
      durationSeconds,
    });
  }

  private fail(record: AlertEvidenceRecord, code: AlertEvidenceRecord["failureCode"], reason: string, startTime: number) {
    record.status = "FAILED";
    record.failureCode = code;
    record.failureReason = reason;
    record.completedAt = new Date();
    record.latencyMs = Date.now() - startTime;
    this.memoryRecords.set(record.alertId, record);
    this.updateJobStatus(record.id, "FAILED", record.latencyMs);
    return record;
  }
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.floor(values.length * fraction))] ?? 0;
}

class InProcessTestAlertEvidenceClient implements AlertEvidenceClient {
  async capture(input: {
    alertId: string;
    cameraId: string;
    occurredAt: string;
    clipSeconds: number;
  }) {
    return {
      alertId: input.alertId,
      cameraId: input.cameraId,
      requestedAt: new Date().toISOString(),
      state: "ready" as const,
      snapshotAvailable: true,
      clipAvailable: true,
    };
  }

  async status(alertId: string) {
    const payload = {
      alertId,
      cameraId: "cam-test-01",
      state: "ready",
      requestedAt: new Date().toISOString(),
      snapshotAvailable: true,
      clipAvailable: true,
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  async asset(alertId: string, kind: AlertEvidenceKind, _range?: string) {
    const data = Buffer.from(`test-${kind}-${alertId}-data`);
    return new Response(data, {
      status: 200,
      headers: { "content-type": kind === "snapshot" ? "image/jpeg" : "video/mp4" },
    });
  }
}

const isTestEnv = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

const recordingEvidenceClient = process.env.RECORDING_ENGINE_URL && process.env.RECORDING_ENGINE_SHARED_KEY
  ? new HttpAlertEvidenceClient(process.env.RECORDING_ENGINE_URL, process.env.RECORDING_ENGINE_SHARED_KEY)
  : (isTestEnv ? new InProcessTestAlertEvidenceClient() : undefined);

export const evidenceCapturePipeline = new EvidenceCapturePipelineService(
  evidencePolicyService,
  evidenceStorageService,
  recordingEvidenceClient,
);
export const evidenceCapturePipelineService = evidenceCapturePipeline;
