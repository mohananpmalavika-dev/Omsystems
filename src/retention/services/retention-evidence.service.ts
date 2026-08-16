/**
 * Retention Evidence Service
 * 
 * Collects, stores, and compares multi-source retention evidence (Platform Index vs Recorder Archive),
 * detects data conflicts, and guards against stale telemetry.
 */

import type {
  RetentionEvidence,
  EvidenceAgreement,
} from "../domain/retention.types.js";

export class RetentionEvidenceService {
  private evidenceStore: Map<string, RetentionEvidence> = new Map();

  /**
   * Records a new piece of evidence
   */
  recordEvidence(evidence: RetentionEvidence): RetentionEvidence {
    this.evidenceStore.set(evidence.id, evidence);
    return evidence;
  }

  /**
   * Retrieves evidence by ID
   */
  getEvidence(id: string): RetentionEvidence | undefined {
    return this.evidenceStore.get(id);
  }

  /**
   * Evaluates agreement between multiple evidence sources for the same camera/recorder
   */
  evaluateAgreement(evidenceList: RetentionEvidence[]): {
    agreement: EvidenceAgreement;
    effectiveConfidence: number;
    effectiveOldestAt?: Date | undefined;
    effectiveNewestAt?: Date | undefined;
    conflictReason?: string | undefined;
  } {
    if (evidenceList.length === 0) {
      return {
        agreement: "NO_EVIDENCE",
        effectiveConfidence: 0,
      };
    }

    if (evidenceList.length === 1) {
      const single = evidenceList[0];
      if (single) {
        return {
          agreement: "SINGLE_SOURCE",
          effectiveConfidence: single.confidence,
          effectiveOldestAt: single.oldestRecordingAt,
          effectiveNewestAt: single.newestRecordingAt,
        };
      }
    }

    // Compare Platform Index vs Recorder Archive
    const recorderEvidence = evidenceList.find((e) => e.source === "RECORDER_ARCHIVE" || e.source === "RECORDER_API");
    const platformEvidence = evidenceList.find((e) => e.source === "PLATFORM_INDEX");

    if (recorderEvidence && platformEvidence) {
      const recDays = recorderEvidence.oldestRecordingAt && recorderEvidence.newestRecordingAt
        ? (recorderEvidence.newestRecordingAt.getTime() - recorderEvidence.oldestRecordingAt.getTime()) / 86_400_000
        : undefined;

      const platDays = platformEvidence.oldestRecordingAt && platformEvidence.newestRecordingAt
        ? (platformEvidence.newestRecordingAt.getTime() - platformEvidence.oldestRecordingAt.getTime()) / 86_400_000
        : undefined;

      if (recDays !== undefined && platDays !== undefined) {
        const deltaDays = Math.abs(recDays - platDays);

        if (deltaDays <= 1.0) {
          // Both sources agree within 24 hours
          return {
            agreement: "AGREED",
            effectiveConfidence: Math.min(0.99, (recorderEvidence.confidence + platformEvidence.confidence) / 2 + 0.1),
            // Always prefer recorder's physical verified timestamp
            effectiveOldestAt: recorderEvidence.oldestRecordingAt,
            effectiveNewestAt: recorderEvidence.newestRecordingAt,
          };
        }

        if (deltaDays > 5.0) {
          // Significant conflict: e.g. Platform claims 93 days, Recorder only has 61 days!
          return {
            agreement: "CONFLICTING",
            effectiveConfidence: 0.4,
            // Conservative: Take the more restrictive (younger) oldest recording to prevent false compliance
            effectiveOldestAt: recorderEvidence.oldestRecordingAt,
            effectiveNewestAt: recorderEvidence.newestRecordingAt,
            conflictReason: `Platform index (${platDays.toFixed(1)}d) conflicts with recorder physical archive (${recDays.toFixed(1)}d)`,
          };
        }

        return {
          agreement: "PARTIAL",
          effectiveConfidence: 0.75,
          effectiveOldestAt: recorderEvidence.oldestRecordingAt,
          effectiveNewestAt: recorderEvidence.newestRecordingAt,
        };
      }
    }

    // Default to the highest confidence source
    const best = [...evidenceList].sort((a, b) => b.confidence - a.confidence)[0];
    if (!best) {
      return {
        agreement: "NO_EVIDENCE",
        effectiveConfidence: 0,
      };
    }
    return {
      agreement: "PARTIAL",
      effectiveConfidence: best.confidence,
      effectiveOldestAt: best.oldestRecordingAt,
      effectiveNewestAt: best.newestRecordingAt,
    };
  }

  /**
   * Checks if evidence is fresh (within maxAgeMinutes)
   */
  isEvidenceFresh(evidence: RetentionEvidence, now: Date = new Date(), maxAgeMinutes = 60): boolean {
    const ageMinutes = (now.getTime() - evidence.observedAt.getTime()) / 60_000;
    return ageMinutes <= maxAgeMinutes;
  }
}

export const retentionEvidenceService = new RetentionEvidenceService();
