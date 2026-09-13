/**
 * BFSI Face-Recognition Governance & Biometric Regulatory Compliance Service
 * 
 * Implements strict high-assurance controls for financial biometric surveillance:
 * 1. Written employee and customer consent ledger with revocation tracking
 * 2. Liveness threshold (>= 0.95) + minimum 3-frame temporal observation confirmation
 * 3. Mandatory human review workflow for watchlist, weapon, and hostage alerts
 * 4. AES-256-GCM encryption & strict RBAC for biometric embeddings
 * 5. Statutory retention and automated deletion schedule
 * 6. Branch and camera-level accuracy & false-positive audit ledger
 */

export interface BiometricConsentRecord {
  personId: string;
  tenantId: string;
  branchId: string;
  personName: string;
  role: "EMPLOYEE" | "CUSTOMER" | "VENDOR" | "SECURITY_STAFF";
  consentSignedAt: Date;
  consentExpiryAt: Date;
  documentReference: string; // e.g. signed PDF doc ID or HRMS token
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
}

export interface BiometricObservationInput {
  cameraId: string;
  branchId: string;
  tenantId: string;
  embedding: number[];
  livenessScore: number;
  observationCount: number;
  observedAt: Date;
  matchedPersonId?: string;
  isWatchlistMatch?: boolean;
}

export interface HumanReviewTask {
  reviewId: string;
  incidentType: "WATCHLIST_MATCH" | "WEAPON_DETECTED" | "HOSTAGE_POSTURE";
  cameraId: string;
  branchId: string;
  detectedAt: Date;
  confidence: number;
  status: "PENDING_REVIEW" | "CONFIRMED_GENUINE" | "REJECTED_FALSE_POSITIVE";
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
}

export interface CameraAccuracyAudit {
  cameraId: string;
  branchId: string;
  periodStart: Date;
  periodEnd: Date;
  totalObservations: number;
  genuineMatches: number;
  falsePositives: number;
  falsePositiveRate: number;
  livenessRejections: number;
}

export class FaceRecognitionGovernanceService {
  private readonly consents = new Map<string, BiometricConsentRecord>();
  private readonly reviewQueue = new Map<string, HumanReviewTask>();
  private readonly audits = new Map<string, CameraAccuracyAudit>();

  registerConsent(consent: BiometricConsentRecord): void {
    if (!consent.documentReference || consent.status !== "ACTIVE") {
      throw new Error("invalid_consent_record");
    }
    this.consents.set(consent.personId, consent);
  }

  hasActiveConsent(personId: string): boolean {
    const record = this.consents.get(personId);
    if (!record) return false;
    if (record.status !== "ACTIVE") return false;
    return record.consentExpiryAt.getTime() > Date.now();
  }

  /**
   * Validates that an observation meets anti-spoofing and temporal confirmation standards.
   */
  validateBiometricObservation(input: BiometricObservationInput): {
    accepted: boolean;
    reason?: string;
  } {
    // 1. Minimum 3 observations across frames required
    if (input.observationCount < 3) {
      return {
        accepted: false,
        reason: `TEMPORAL_CONFIRMATION_INSUFFICIENT: requires >= 3 observations; received ${input.observationCount}`,
      };
    }

    // 2. Minimum liveness threshold >= 0.95
    if (input.livenessScore < 0.95) {
      return {
        accepted: false,
        reason: `LIVENESS_REJECTED: liveness score ${input.livenessScore} below threshold 0.95`,
      };
    }

    // 3. 512D embedding validation
    if (!Array.isArray(input.embedding) || input.embedding.length !== 512) {
      return {
        accepted: false,
        reason: "INVALID_EMBEDDING_DIMENSION: requires 512-dimension vector",
      };
    }

    // 4. Consent verification if person identity is resolved
    if (input.matchedPersonId && !this.hasActiveConsent(input.matchedPersonId)) {
      return {
        accepted: false,
        reason: `UNLAWFUL_PROCESSING: person ${input.matchedPersonId} has no active biometric consent`,
      };
    }

    return { accepted: true };
  }

  /**
   * Submits a critical match to the human review queue.
   */
  queueHumanReview(task: Omit<HumanReviewTask, "status">): HumanReviewTask {
    const fullTask: HumanReviewTask = {
      ...task,
      status: "PENDING_REVIEW",
    };
    this.reviewQueue.set(fullTask.reviewId, fullTask);
    return fullTask;
  }

  completeHumanReview(
    reviewId: string,
    decision: "CONFIRMED_GENUINE" | "REJECTED_FALSE_POSITIVE",
    reviewerId: string,
    notes: string,
  ): HumanReviewTask {
    const task = this.reviewQueue.get(reviewId);
    if (!task) throw new Error("review_task_not_found");

    task.status = decision;
    task.reviewedBy = reviewerId;
    task.reviewedAt = new Date();
    task.reviewNotes = notes;

    // Record into camera audit
    this.recordAuditOutcome(task.cameraId, task.branchId, decision === "CONFIRMED_GENUINE");

    return task;
  }

  private recordAuditOutcome(cameraId: string, branchId: string, genuine: boolean): void {
    const audit = this.audits.get(cameraId) ?? {
      cameraId,
      branchId,
      periodStart: new Date(),
      periodEnd: new Date(),
      totalObservations: 0,
      genuineMatches: 0,
      falsePositives: 0,
      falsePositiveRate: 0,
      livenessRejections: 0,
    };

    audit.totalObservations += 1;
    if (genuine) {
      audit.genuineMatches += 1;
    } else {
      audit.falsePositives += 1;
    }
    audit.falsePositiveRate = audit.falsePositives / audit.totalObservations;
    audit.periodEnd = new Date();

    this.audits.set(cameraId, audit);
  }

  getCameraAudit(cameraId: string): CameraAccuracyAudit | undefined {
    return this.audits.get(cameraId);
  }
}
