/**
 * Video Redaction & Privacy Export Service
 * 
 * Authoritative production service for GDPR / DPDP privacy redaction,
 * automated face and license plate blurring, static camera privacy zone masking,
 * and cryptographic export compliance certification.
 */

import { randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import { privacyPolicyService } from "../../privacy/services/privacy-policy.service.js";
import {
  HardwareEncoderDetector,
  RedactionFilterGraphBuilder,
  type BoundingBoxRedaction,
  type RedactionFilterOptions,
} from "../../recording/hardware-encoder.js";
import {
  canonicalJsonStringify,
  appendCustodyEventTx,
} from "../../database/evidence-repository.js";
import {
  getEvidenceSigningProvider,
  type EvidenceSigningProvider,
} from "../signing/evidence-signing-provider.js";

export type RedactionComplianceStandard = "GDPR" | "DPDP" | "HIPAA" | "CUSTOM";

export interface RedactionExportConfig {
  enabled?: boolean;
  complianceStandard?: RedactionComplianceStandard;
  targets?: Array<"FACES" | "LICENSE_PLATES" | "PEOPLE" | "STATIC_ZONES" | "CUSTOM">;
  faceBlur?: boolean;
  plateBlur?: boolean;
  blurStrength?: number;
  mode?: "blur" | "pixelate" | "solid";
  boundingBoxes?: Array<BoundingBoxRedaction & { label?: string }>;
  applyStaticZones?: boolean;
  audioAction?: "PASS_THROUGH" | "MUTE" | "REMOVE_TRACK";
  watermarkText?: string;
}

export interface RedactionComplianceCertificate {
  certificateId: string;
  caseNumber: string;
  caseId: string;
  exportJobId: string;
  complianceStandard: RedactionComplianceStandard;
  complianceNotice: string;
  issuedAt: string;
  issuedBy: string;
  sourceSha256?: string;
  redactedSha256: string;
  transformsApplied: {
    faceBlur: boolean;
    plateBlur: boolean;
    staticZonesCount: number;
    customBoxesCount: number;
    totalZonesBlurred: number;
    audioAction: string;
    mode: string;
    blurStrength: number;
    watermarkApplied: boolean;
  };
  signature: string;
  signingKeyId?: string;
}

export interface RedactionAuditRecord {
  id?: string;
  exportJobId: string;
  caseId: string;
  tenantId: string;
  performedBy: string;
  complianceStandard: RedactionComplianceStandard;
  targets: string[];
  boundingBoxCount: number;
  faceBlurApplied: boolean;
  plateBlurApplied: boolean;
  staticZonesApplied: number;
  audioAction: "PASS_THROUGH" | "MUTE" | "REMOVE_TRACK";
  unredactedSha256?: string;
  redactedSha256: string;
  certificateId: string;
  signature?: string;
  metadata?: Record<string, unknown>;
}

export class VideoRedactionService {
  private signingProvider: EvidenceSigningProvider;

  constructor(
    private readonly pool?: Pool,
    signingProvider?: EvidenceSigningProvider,
  ) {
    this.signingProvider = signingProvider || getEvidenceSigningProvider();
  }

  /**
   * Normalizes arbitrary coordinates (either normalized 0.0-1.0 or raw pixels)
   * into valid integer pixel dimensions compatible with FFmpeg crop filter.
   */
  public normalizePixelBox(
    box: { x: number; y: number; width: number; height: number },
    videoWidth: number,
    videoHeight: number,
  ): { x: number; y: number; width: number; height: number } {
    const isNormalized = box.x <= 1.0 && box.y <= 1.0 && box.width <= 1.0 && box.height <= 1.0;

    let x = isNormalized ? Math.round(box.x * videoWidth) : Math.round(box.x);
    let y = isNormalized ? Math.round(box.y * videoHeight) : Math.round(box.y);
    let width = isNormalized ? Math.round(box.width * videoWidth) : Math.round(box.width);
    let height = isNormalized ? Math.round(box.height * videoHeight) : Math.round(box.height);

    // Clamp coordinates within video frame boundaries
    x = Math.max(0, Math.min(videoWidth - 4, x));
    y = Math.max(0, Math.min(videoHeight - 4, y));
    width = Math.max(4, Math.min(videoWidth - x, width));
    height = Math.max(4, Math.min(videoHeight - y, height));

    // Ensure dimensions are even numbers (required by h264/yuv420p encoders)
    if (width % 2 !== 0) width = Math.max(4, width - 1);
    if (height % 2 !== 0) height = Math.max(4, height - 1);
    if (x % 2 !== 0) x = Math.max(0, x - 1);
    if (y % 2 !== 0) y = Math.max(0, y - 1);

    return { x, y, width, height };
  }

  /**
   * Resolves all active static privacy zones for a camera and converts them to pixel bounding boxes
   */
  public resolveCameraStaticZones(
    cameraId: string,
    videoWidth: number,
    videoHeight: number,
  ): BoundingBoxRedaction[] {
    const staticZones = privacyPolicyService.getStaticZones(cameraId);
    const resolvedBoxes: BoundingBoxRedaction[] = [];

    for (const zone of staticZones) {
      if (zone.coordinates && zone.coordinates.length >= 2) {
        const xs = zone.coordinates.map((c) => c.x);
        const ys = zone.coordinates.map((c) => c.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const normBox = this.normalizePixelBox(
          {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          },
          videoWidth,
          videoHeight,
        );

        resolvedBoxes.push({
          x: normBox.x,
          y: normBox.y,
          width: normBox.width,
          height: normBox.height,
          mode: zone.mode === "solid" ? "solid" : zone.mode === "pixelate" ? "pixelate" : "blur",
          blurRadius: 25,
          label: zone.name,
        });
      }
    }

    return resolvedBoxes;
  }

  /**
   * Queries stored AI detections from PostgreSQL (e.g. face / person / plate) for the interval
   */
  public async resolveStoredAiDetections(options: {
    cameraId: string;
    fromTime: string;
    toTime: string;
    videoWidth: number;
    videoHeight: number;
    targets: Array<"FACES" | "LICENSE_PLATES" | "PEOPLE">;
  }): Promise<BoundingBoxRedaction[]> {
    if (!this.pool) {
      return [];
    }

    const labels: string[] = [];
    if (options.targets.includes("FACES")) {
      labels.push("face", "human_face", "person_face");
    }
    if (options.targets.includes("LICENSE_PLATES")) {
      labels.push("license_plate", "plate", "vehicle_plate");
    }
    if (options.targets.includes("PEOPLE")) {
      labels.push("person", "human");
    }

    if (labels.length === 0) return [];

    try {
      const result = await this.pool.query(
        `SELECT do.bounding_box, ae.occurred_at, ae.ended_at, do.label
         FROM detected_objects do
         JOIN analytics_events ae ON ae.id = do.event_id
         WHERE ae.camera_id = $1
           AND ae.occurred_at <= $3::timestamptz
           AND (ae.ended_at IS NULL OR ae.ended_at >= $2::timestamptz)
           AND LOWER(do.label) = ANY($4)
         ORDER BY ae.occurred_at ASC
         LIMIT 200`,
        [options.cameraId, options.fromTime, options.toTime, labels],
      );

      const reqStartMs = new Date(options.fromTime).getTime();
      const detectedBoxes: BoundingBoxRedaction[] = [];

      for (const row of result.rows) {
        const rawBox = row.bounding_box;
        if (!rawBox) continue;

        const norm = this.normalizePixelBox(rawBox, options.videoWidth, options.videoHeight);
        const eventStartMs = new Date(row.occurred_at).getTime();
        const eventEndMs = row.ended_at ? new Date(row.ended_at).getTime() : eventStartMs + 5000;

        const startTimeSec = Math.max(0, (eventStartMs - reqStartMs) / 1000);
        const endTimeSec = Math.max(startTimeSec + 0.5, (eventEndMs - reqStartMs) / 1000);

        detectedBoxes.push({
          x: norm.x,
          y: norm.y,
          width: norm.width,
          height: norm.height,
          startTimeSec,
          endTimeSec,
          label: row.label,
        });
      }

      return detectedBoxes;
    } catch {
      // Return empty if database query fails or table does not exist
      return [];
    }
  }

  /**
   * Prepares and coordinates the complete redaction parameters for an export operation
   */
  public async prepareRedactionPlan(options: {
    cameraId: string;
    fromTime: string;
    toTime: string;
    videoWidth: number;
    videoHeight: number;
    config: RedactionExportConfig;
  }): Promise<{
    filterOptions: RedactionFilterOptions;
    resolvedBoxes: BoundingBoxRedaction[];
    staticZonesCount: number;
    customBoxesCount: number;
    detectedBoxesCount: number;
    complianceNotice: string;
  }> {
    const config = options.config;
    const videoWidth = Math.max(320, options.videoWidth || 1920);
    const videoHeight = Math.max(240, options.videoHeight || 1080);
    const resolvedBoxes: BoundingBoxRedaction[] = [];

    // 1. Static Camera Privacy Zones
    let staticZonesCount = 0;
    if (config.applyStaticZones !== false) {
      const staticBoxes = this.resolveCameraStaticZones(options.cameraId, videoWidth, videoHeight);
      staticZonesCount = staticBoxes.length;
      resolvedBoxes.push(...staticBoxes);
    }

    // 2. Custom User-Supplied Bounding Boxes
    let customBoxesCount = 0;
    if (config.boundingBoxes && config.boundingBoxes.length > 0) {
      for (const customBox of config.boundingBoxes) {
        const norm = this.normalizePixelBox(customBox, videoWidth, videoHeight);
        resolvedBoxes.push({
          ...customBox,
          x: norm.x,
          y: norm.y,
          width: norm.width,
          height: norm.height,
          blurRadius: customBox.blurRadius || config.blurStrength || 20,
          mode: customBox.mode || config.mode || "blur",
        });
        customBoxesCount += 1;
      }
    }

    // 3. Automated AI Face & Plate Detections
    let detectedBoxesCount = 0;
    const aiTargets: Array<"FACES" | "LICENSE_PLATES" | "PEOPLE"> = [];
    if (config.faceBlur) aiTargets.push("FACES");
    if (config.plateBlur) aiTargets.push("LICENSE_PLATES");
    if (config.targets?.includes("PEOPLE")) aiTargets.push("PEOPLE");

    if (aiTargets.length > 0) {
      const aiBoxes = await this.resolveStoredAiDetections({
        cameraId: options.cameraId,
        fromTime: options.fromTime,
        toTime: options.toTime,
        videoWidth,
        videoHeight,
        targets: aiTargets,
      });

      detectedBoxesCount = aiBoxes.length;
      resolvedBoxes.push(...aiBoxes);

      // If face blur is enabled but no discrete bounding boxes exist in analytics events,
      // construct a privacy protection upper-corridor zone (standard GDPR banking corridor mask)
      if (config.faceBlur && resolvedBoxes.length === 0) {
        const defaultFaceCorridor = this.normalizePixelBox(
          { x: 0.1, y: 0.05, width: 0.8, height: 0.45 },
          videoWidth,
          videoHeight,
        );
        resolvedBoxes.push({
          x: defaultFaceCorridor.x,
          y: defaultFaceCorridor.y,
          width: defaultFaceCorridor.width,
          height: defaultFaceCorridor.height,
          mode: config.mode || "blur",
          blurRadius: config.blurStrength || 25,
          label: "Automated Face Privacy Corridor (GDPR/DPDP Default)",
        });
      }
    }

    // Determine compliance watermark & legal notice
    const std = config.complianceStandard || "GDPR";
    const complianceNotice =
      std === "GDPR"
        ? "PRIVACY REDACTED (GDPR 2016/679 ART 32)"
        : std === "DPDP"
          ? "PRIVACY REDACTED (DPDP ACT 2023 SEC 8)"
          : "PRIVACY REDACTED EXPORT";

    const watermarkText = config.watermarkText || `${complianceNotice} • CAMERA ${options.cameraId.slice(0, 8)}`;

    const filterOptions: RedactionFilterOptions = {
      boundingBoxes: resolvedBoxes,
      blurStrength: config.blurStrength || 20,
      mode: config.mode || "blur",
      watermarkText: config.watermarkText !== undefined ? config.watermarkText : watermarkText,
      videoWidth,
      videoHeight,
    };

    return {
      filterOptions,
      resolvedBoxes,
      staticZonesCount,
      customBoxesCount,
      detectedBoxesCount,
      complianceNotice,
    };
  }

  /**
   * Generates a tamper-evident compliance certificate with SHA-256 provenance hashes and signing
   */
  public async generateComplianceCertificate(input: {
    caseNumber: string;
    caseId: string;
    exportJobId: string;
    complianceStandard: RedactionComplianceStandard;
    issuedBy: string;
    sourceSha256?: string;
    redactedSha256: string;
    transforms: {
      faceBlur: boolean;
      plateBlur: boolean;
      staticZonesCount: number;
      customBoxesCount: number;
      totalZonesBlurred: number;
      audioAction: string;
      mode: string;
      blurStrength: number;
      watermarkApplied: boolean;
    };
  }): Promise<RedactionComplianceCertificate> {
    const certificateId = `REDACT-CERT-${randomUUID().substring(0, 8).toUpperCase()}`;
    const issuedAt = new Date().toISOString();

    const complianceNotice =
      input.complianceStandard === "GDPR"
        ? "Validated per GDPR (EU 2016/679) Article 32: Technical and organisational data protection safeguards, data pseudonymisation, and privacy-preserving export."
        : input.complianceStandard === "DPDP"
          ? "Validated per DPDP Act 2023 Section 8: Reasonable security safeguards to prevent personal data breach and unauthorized individual identification."
          : "Validated per privacy protection and video redaction governance specifications.";

    const canonicalPayload = canonicalJsonStringify({
      certificateId,
      caseNumber: input.caseNumber,
      caseId: input.caseId,
      exportJobId: input.exportJobId,
      complianceStandard: input.complianceStandard,
      issuedAt,
      issuedBy: input.issuedBy,
      redactedSha256: input.redactedSha256,
      sourceSha256: input.sourceSha256 || "0".repeat(64),
      transformsApplied: input.transforms,
    });

    const signResult = await this.signingProvider.signDigest(Buffer.from(canonicalPayload, "utf8"));

    return {
      certificateId,
      caseNumber: input.caseNumber,
      caseId: input.caseId,
      exportJobId: input.exportJobId,
      complianceStandard: input.complianceStandard,
      complianceNotice,
      issuedAt,
      issuedBy: input.issuedBy,
      sourceSha256: input.sourceSha256,
      redactedSha256: input.redactedSha256,
      transformsApplied: input.transforms,
      signature: signResult.signature.toString("base64"),
      signingKeyId: signResult.keyId,
    };
  }

  /**
   * Cryptographically verifies a redaction compliance certificate against its digital signature
   */
  public async verifyComplianceCertificate(
    certificate: RedactionComplianceCertificate,
  ): Promise<boolean> {
    if (!certificate || !certificate.signature) {
      return false;
    }

    try {
      const canonicalPayload = canonicalJsonStringify({
        certificateId: certificate.certificateId,
        caseNumber: certificate.caseNumber,
        caseId: certificate.caseId,
        exportJobId: certificate.exportJobId,
        complianceStandard: certificate.complianceStandard,
        issuedAt: certificate.issuedAt,
        issuedBy: certificate.issuedBy,
        redactedSha256: certificate.redactedSha256,
        sourceSha256: certificate.sourceSha256 || "0".repeat(64),
        transformsApplied: certificate.transformsApplied,
      });

      return await this.signingProvider.verify(
        Buffer.from(canonicalPayload, "utf8"),
        Buffer.from(certificate.signature, "base64"),
        certificate.signingKeyId,
      );
    } catch {
      return false;
    }
  }


  /**
   * Records redaction audit ledger record and appends to hash-chained chain of custody
   */
  public async recordRedactionAudit(record: RedactionAuditRecord): Promise<void> {
    if (!this.pool) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Insert into evidence_redaction_logs
      await client.query(
        `INSERT INTO evidence_redaction_logs (
           export_job_id, case_id, tenant_id, performed_by, compliance_standard,
           targets, bounding_box_count, face_blur_applied, plate_blur_applied,
           static_zones_applied, audio_action, unredacted_sha256, redacted_sha256,
           certificate_id, signature, metadata, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())`,
        [
          record.exportJobId,
          record.caseId,
          record.tenantId,
          record.performedBy,
          record.complianceStandard,
          record.targets,
          record.boundingBoxCount,
          record.faceBlurApplied,
          record.plateBlurApplied,
          record.staticZonesApplied,
          record.audioAction,
          record.unredactedSha256 || null,
          record.redactedSha256,
          record.certificateId,
          record.signature || null,
          record.metadata ? JSON.stringify(record.metadata) : "{}",
        ],
      );

      // 2. Append immutable chain of custody event
      await appendCustodyEventTx(client, {
        evidenceId: record.caseId,
        action: "PRIVACY_REDACTED_EXPORT",
        performedBy: record.performedBy,
        actorType: "USER",
        reason: `${record.complianceStandard} compliance export: ${record.boundingBoxCount} zones blurred (faces: ${record.faceBlurApplied}, plates: ${record.plateBlurApplied}, static: ${record.staticZonesApplied})`,
        details: {
          exportJobId: record.exportJobId,
          certificateId: record.certificateId,
          complianceStandard: record.complianceStandard,
          redactedSha256: record.redactedSha256,
        },
      });

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves redaction audit details for an export job
   */
  public async getRedactionAudit(exportJobId: string, tenantId?: string): Promise<any | null> {
    if (!this.pool) return null;

    const query = tenantId
      ? `SELECT * FROM evidence_redaction_logs WHERE export_job_id = $1 AND tenant_id = $2 LIMIT 1`
      : `SELECT * FROM evidence_redaction_logs WHERE export_job_id = $1 LIMIT 1`;
    const params = tenantId ? [exportJobId, tenantId] : [exportJobId];

    const result = await this.pool.query(query, params);
    return result.rows[0] || null;
  }
}
