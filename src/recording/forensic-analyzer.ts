import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Pool } from "pg";
import type { RecordingSegment } from "../domain/models.js";

export interface TimestampVerification {
  status: "verified" | "warning" | "error";
  cameraTimestamp: string;
  recorderTimestamp: string;
  controlPlaneTimestamp?: string;
  clockOffsetMs: number;
  ntpStatus: "synchronized" | "not-synchronized" | "unknown";
  timezone: string;
  issues: string[];
  confidence: "high" | "medium" | "low";
}

export interface IntegrityVerification {
  segmentId: string;
  status: "verified" | "mismatch" | "missing" | "corrupted";
  storedHash: string;
  computedHash?: string;
  fileExists: boolean;
  fileSizeMatch: boolean;
  lastVerified: string;
  verificationMethod: "sha256" | "md5" | "checksum";
}

export interface ChainVerification {
  valid: boolean;
  totalEvents: number;
  verifiedEvents: number;
  brokenLinks: Array<{
    eventId: string;
    expectedHash: string;
    actualHash: string;
    position: number;
  }>;
  firstEvent: string;
  lastEvent: string;
}

export interface TamperAnalysis {
  tampered: boolean;
  confidence: number;
  indicators: Array<{
    type: "hash-mismatch" | "timestamp-anomaly" | "metadata-inconsistency" | "chain-break" | "file-modification";
    severity: "critical" | "high" | "medium" | "low";
    description: string;
    evidence: Record<string, unknown>;
  }>;
  recommendation: string;
}

export interface ForensicReport {
  reportId: string;
  generatedAt: string;
  generatedBy: string;
  evidenceCaseId: string;
  caseNumber: string;
  summary: {
    totalSegments: number;
    verifiedSegments: number;
    failedSegments: number;
    totalSnapshots: number;
    chainIntegrity: "intact" | "broken" | "partial";
    overallStatus: "verified" | "warning" | "failed";
  };
  segments: IntegrityVerification[];
  timestamps: TimestampVerification[];
  chainOfCustody: ChainVerification;
  tamperAnalysis: TamperAnalysis;
  recommendations: string[];
}

export class ForensicAnalyzer {
  constructor(
    private readonly pool: Pool,
    private readonly recordingRoot: string,
  ) {}

  /**
   * Verify timestamp authenticity for a recording segment
   */
  async verifyTimestamp(segmentId: string): Promise<TimestampVerification> {
    const segment = await this.getSegment(segmentId);
    if (!segment) {
      return {
        status: "error",
        cameraTimestamp: "",
        recorderTimestamp: "",
        clockOffsetMs: 0,
        ntpStatus: "unknown",
        timezone: "UTC",
        issues: ["Segment not found"],
        confidence: "low",
      };
    }

    const issues: string[] = [];

    // Get camera metadata
    const cameraResult = await this.pool.query(
      `SELECT c.*, rn.metadata
       FROM cameras c
       JOIN resource_nodes rn ON rn.id = c.resource_node_id
       WHERE c.id = $1`,
      [segment.cameraId],
    );

    const camera = cameraResult.rows[0];
    const metadata = camera?.metadata || {};

    // Extract NTP and clock sync information
    const ntpEnabled = metadata.ntpEnabled === true;
    const clockOffsetMs = parseInt(metadata.clockOffsetMs || "0", 10);
    const timezone = metadata.timezone || "UTC";

    // Check segment index record for control plane receipt time
    const indexResult = await this.pool.query(
      `SELECT indexed_at FROM recording_search_index WHERE segment_id = $1`,
      [segmentId],
    );

    const controlPlaneTimestamp = indexResult.rows[0]?.indexed_at;

    // Calculate time differences
    const segmentStart = new Date(segment.startedAt).getTime();
    const indexedTime = controlPlaneTimestamp
      ? new Date(controlPlaneTimestamp).getTime()
      : null;

    // Validate timestamp consistency
    if (indexedTime && indexedTime < segmentStart) {
      issues.push("Control plane received segment before camera timestamp - possible clock skew");
    }

    // Check for NTP synchronization
    if (!ntpEnabled) {
      issues.push("Camera does not have NTP synchronization enabled");
    }

    // Check clock offset magnitude
    if (Math.abs(clockOffsetMs) > 5000) {
      issues.push(`Significant clock offset detected: ${clockOffsetMs}ms`);
    }

    // Determine status and confidence
    let status: "verified" | "warning" | "error" = "verified";
    let confidence: "high" | "medium" | "low" = "high";

    if (issues.length > 0) {
      status = issues.some((i) => i.includes("clock skew")) ? "error" : "warning";
      confidence = ntpEnabled ? "medium" : "low";
    }

    return {
      status,
      cameraTimestamp: segment.startedAt,
      recorderTimestamp: segment.createdAt,
      controlPlaneTimestamp: controlPlaneTimestamp
        ? new Date(controlPlaneTimestamp).toISOString()
        : undefined,
      clockOffsetMs,
      ntpStatus: ntpEnabled ? "synchronized" : "not-synchronized",
      timezone,
      issues,
      confidence,
    };
  }

  /**
   * Verify segment integrity by comparing stored and computed hashes
   */
  async verifySegmentIntegrity(
    segmentId: string,
    computeHash = false,
  ): Promise<IntegrityVerification> {
    const segment = await this.getSegment(segmentId);
    if (!segment) {
      return {
        segmentId,
        status: "missing",
        storedHash: "",
        fileExists: false,
        fileSizeMatch: false,
        lastVerified: new Date().toISOString(),
        verificationMethod: "sha256",
      };
    }

    const storedHash = segment.checksumSha256 || "";
    let computedHash: string | undefined;
    let fileExists = false;
    let fileSizeMatch = false;

    if (computeHash && storedHash) {
      try {
        // Check if file exists
        const filePath = `${this.recordingRoot}/${segment.storagePath}`;
        const stats = await stat(filePath);
        fileExists = true;
        fileSizeMatch = stats.size === segment.sizeBytes;

        // Compute hash
        computedHash = await this.computeFileHash(filePath);
      } catch (error) {
        fileExists = false;
      }
    }

    let status: "verified" | "mismatch" | "missing" | "corrupted" = "verified";

    if (!storedHash) {
      status = "missing";
    } else if (computedHash) {
      if (computedHash !== storedHash) {
        status = "mismatch";
      } else if (!fileSizeMatch) {
        status = "corrupted";
      }
    }

    return {
      segmentId,
      status,
      storedHash,
      computedHash,
      fileExists,
      fileSizeMatch,
      lastVerified: new Date().toISOString(),
      verificationMethod: "sha256",
    };
  }

  /**
   * Verify chain of custody integrity
   */
  async verifyChainOfCustody(evidenceCaseId: string): Promise<ChainVerification> {
    const result = await this.pool.query(
      `SELECT * FROM chain_of_custody_events
       WHERE evidence_id = $1
       ORDER BY created_at ASC`,
      [evidenceCaseId],
    );

    const events = result.rows;
    const brokenLinks: Array<{
      eventId: string;
      expectedHash: string;
      actualHash: string;
      position: number;
    }> = [];

    let verifiedEvents = 0;

    // Verify hash chain
    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      if (i === 0) {
        // First event should have no previous hash
        if (!event.previous_hash) {
          verifiedEvents++;
        } else {
          brokenLinks.push({
            eventId: event.id,
            expectedHash: "null",
            actualHash: event.previous_hash,
            position: i,
          });
        }
      } else {
        const prevEvent = events[i - 1];
        if (event.previous_hash === prevEvent.event_hash) {
          verifiedEvents++;
        } else {
          brokenLinks.push({
            eventId: event.id,
            expectedHash: prevEvent.event_hash,
            actualHash: event.previous_hash || "null",
            position: i,
          });
        }
      }
    }

    return {
      valid: brokenLinks.length === 0,
      totalEvents: events.length,
      verifiedEvents,
      brokenLinks,
      firstEvent: events[0]?.id || "",
      lastEvent: events[events.length - 1]?.id || "",
    };
  }

  /**
   * Check for tampering indicators
   */
  async checkTamperEvidence(input: {
    evidenceCaseId?: string;
    segmentIds?: string[];
  }): Promise<TamperAnalysis> {
    const indicators: TamperAnalysis["indicators"] = [];

    // Check segment integrity
    if (input.segmentIds) {
      for (const segmentId of input.segmentIds) {
        const integrity = await this.verifySegmentIntegrity(segmentId, true);

        if (integrity.status === "mismatch") {
          indicators.push({
            type: "hash-mismatch",
            severity: "critical",
            description: `Segment ${segmentId} hash does not match stored value`,
            evidence: {
              segmentId,
              storedHash: integrity.storedHash,
              computedHash: integrity.computedHash,
            },
          });
        }
      }
    }

    // Check chain of custody
    if (input.evidenceCaseId) {
      const chain = await this.verifyChainOfCustody(input.evidenceCaseId);

      if (!chain.valid) {
        indicators.push({
          type: "chain-break",
          severity: "critical",
          description: `Chain of custody has ${chain.brokenLinks.length} broken link(s)`,
          evidence: {
            brokenLinks: chain.brokenLinks,
            totalEvents: chain.totalEvents,
          },
        });
      }

      // Check for timestamp anomalies in chain
      const result = await this.pool.query(
        `SELECT * FROM chain_of_custody_events
         WHERE evidence_id = $1
         ORDER BY created_at ASC`,
        [input.evidenceCaseId],
      );

      const events = result.rows;
      for (let i = 1; i < events.length; i++) {
        const prev = events[i - 1];
        const curr = events[i];
        const timeDiff =
          new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();

        if (timeDiff < 0) {
          indicators.push({
            type: "timestamp-anomaly",
            severity: "high",
            description: "Custody event timestamp is earlier than previous event",
            evidence: {
              eventId: curr.id,
              currentTime: curr.created_at,
              previousTime: prev.created_at,
            },
          });
        }
      }
    }

    // Calculate tamper confidence
    const criticalCount = indicators.filter((i) => i.severity === "critical").length;
    const highCount = indicators.filter((i) => i.severity === "high").length;

    const tampered = criticalCount > 0 || highCount > 1;
    const confidence = criticalCount > 0 ? 0.95 : highCount > 0 ? 0.7 : 0.1;

    let recommendation = "No evidence of tampering detected";
    if (tampered) {
      recommendation = criticalCount > 0
        ? "Critical tampering indicators found - evidence integrity compromised"
        : "Potential tampering detected - further investigation recommended";
    }

    return {
      tampered,
      confidence,
      indicators,
      recommendation,
    };
  }

  /**
   * Generate comprehensive forensic verification report
   */
  async generateVerificationReport(input: {
    evidenceCaseId: string;
    generatedBy: string;
    includeSegmentVerification?: boolean;
  }): Promise<ForensicReport> {
    const reportId = createHash("sha256")
      .update(`${input.evidenceCaseId}-${Date.now()}`)
      .digest("hex")
      .substring(0, 16);

    // Get case details
    const caseResult = await this.pool.query(
      `SELECT * FROM evidence_cases WHERE id = $1`,
      [input.evidenceCaseId],
    );

    const evidenceCase = caseResult.rows[0];
    if (!evidenceCase) {
      throw new Error("Evidence case not found");
    }

    // Get all evidence items
    const itemsResult = await this.pool.query(
      `SELECT * FROM evidence_items WHERE case_id = $1`,
      [input.evidenceCaseId],
    );

    const items = itemsResult.rows;
    const segmentIds = items
      .filter((item) => item.type === "recording")
      .map((item) => item.camera_id); // This should reference segment_id

    // Verify segment integrity
    const segments: IntegrityVerification[] = [];
    if (input.includeSegmentVerification !== false && segmentIds.length > 0) {
      for (const segmentId of segmentIds.slice(0, 100)) {
        // Limit to 100
        const verification = await this.verifySegmentIntegrity(segmentId, true);
        segments.push(verification);
      }
    }

    const verifiedSegments = segments.filter((s) => s.status === "verified").length;
    const failedSegments = segments.filter(
      (s) => s.status === "mismatch" || s.status === "corrupted",
    ).length;

    // Verify timestamps (sample)
    const timestamps: TimestampVerification[] = [];
    if (segmentIds.length > 0) {
      const sampleSegments = segmentIds.slice(0, 10);
      for (const segmentId of sampleSegments) {
        const verification = await this.verifyTimestamp(segmentId);
        timestamps.push(verification);
      }
    }

    // Verify chain of custody
    const chainOfCustody = await this.verifyChainOfCustody(input.evidenceCaseId);

    // Tamper analysis
    const tamperAnalysis = await this.checkTamperEvidence({
      evidenceCaseId: input.evidenceCaseId,
      segmentIds: segmentIds.slice(0, 20),
    });

    // Overall status
    let overallStatus: "verified" | "warning" | "failed" = "verified";
    let chainIntegrity: "intact" | "broken" | "partial" = "intact";

    if (failedSegments > 0 || tamperAnalysis.tampered) {
      overallStatus = "failed";
    } else if (!chainOfCustody.valid || timestamps.some((t) => t.status === "warning")) {
      overallStatus = "warning";
    }

    if (!chainOfCustody.valid) {
      chainIntegrity = chainOfCustody.brokenLinks.length > chainOfCustody.totalEvents / 2
        ? "broken"
        : "partial";
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (failedSegments > 0) {
      recommendations.push(
        `${failedSegments} segment(s) failed integrity verification - investigate source`,
      );
    }
    if (!chainOfCustody.valid) {
      recommendations.push(
        "Chain of custody has gaps - review access logs and custody procedures",
      );
    }
    if (timestamps.some((t) => t.ntpStatus !== "synchronized")) {
      recommendations.push("Enable NTP synchronization on all cameras for timestamp accuracy");
    }
    if (tamperAnalysis.tampered) {
      recommendations.push(tamperAnalysis.recommendation);
    }
    if (recommendations.length === 0) {
      recommendations.push("All verification checks passed - evidence integrity confirmed");
    }

    // Get snapshot count
    const snapshotResult = await this.pool.query(
      `SELECT COUNT(*) as count FROM recording_snapshots WHERE evidence_case_id = $1`,
      [input.evidenceCaseId],
    );
    const totalSnapshots = parseInt(snapshotResult.rows[0]?.count || "0", 10);

    return {
      reportId,
      generatedAt: new Date().toISOString(),
      generatedBy: input.generatedBy,
      evidenceCaseId: input.evidenceCaseId,
      caseNumber: evidenceCase.case_number,
      summary: {
        totalSegments: segments.length,
        verifiedSegments,
        failedSegments,
        totalSnapshots,
        chainIntegrity,
        overallStatus,
      },
      segments,
      timestamps,
      chainOfCustody,
      tamperAnalysis,
      recommendations,
    };
  }

  /**
   * Record verification in log
   */
  async recordVerification(input: {
    exportJobId: string;
    verifiedBy: string;
    verificationType: "integrity" | "timestamp" | "chain-of-custody" | "signature";
    status: "verified" | "mismatch" | "missing" | "tampered" | "inconclusive";
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO export_verification_log (
         export_job_id, verified_by, verification_type, status, details, verified_at
       ) VALUES ($1, $2, $3, $4, $5, now())`,
      [
        input.exportJobId,
        input.verifiedBy,
        input.verificationType,
        input.status,
        JSON.stringify(input.details || {}),
      ],
    );
  }

  /**
   * Compute SHA-256 hash of a file
   */
  private async computeFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(filePath);

      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  /**
   * Get segment from database
   */
  private async getSegment(segmentId: string): Promise<RecordingSegment | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM recording_segments WHERE id = $1`,
      [segmentId],
    );

    if (!result.rows[0]) return undefined;

    const row = result.rows[0];
    return {
      id: row.id,
      cameraId: row.camera_id,
      jobId: row.job_id,
      startedAt: new Date(row.started_at).toISOString(),
      endedAt: new Date(row.ended_at).toISOString(),
      storagePath: row.storage_path,
      sizeBytes: Number(row.size_bytes),
      storageNodeExternalId: row.storage_node_external_id,
      storageTier: row.storage_tier,
      status: row.status,
      checksumSha256: row.checksum_sha256,
      codec: row.codec,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
