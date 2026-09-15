/**
 * BFSI Compliance Test Suite
 * Tests biometric governance, liveness validation, consent, temporal confirmation, and human review
 */

import { describe, expect, it, beforeEach } from "vitest";
import { FaceRecognitionGovernanceService } from "../src/banking/governance/face-recognition-governance.service.js";

describe("BFSI Face Recognition Governance", () => {
  let governanceService: FaceRecognitionGovernanceService;

  beforeEach(() => {
    governanceService = new FaceRecognitionGovernanceService();
  });

  describe("Biometric Consent Management", () => {
    it("registers and validates active consent", () => {
      const personId = "person-consent-001";
      
      governanceService.registerConsent({
        personId,
        tenantId: "tenant-001",
        branchId: "branch-001",
        personName: "John Doe",
        role: "EMPLOYEE",
        consentSignedAt: new Date(),
        consentExpiryAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        documentReference: "consent-doc-hr-2024-001",
        status: "ACTIVE",
      });

      expect(governanceService.hasActiveConsent(personId)).toBe(true);
    });

    it("rejects expired consent", () => {
      const personId = "person-expired-001";
      
      governanceService.registerConsent({
        personId,
        tenantId: "tenant-001",
        branchId: "branch-001",
        personName: "Jane Smith",
        role: "CUSTOMER",
        consentSignedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), // 400 days ago
        consentExpiryAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // Expired 10 days ago
        documentReference: "consent-doc-expired",
        status: "ACTIVE",
      });

      expect(governanceService.hasActiveConsent(personId)).toBe(false);
    });

    it("rejects revoked consent", () => {
      const personId = "person-revoked-001";
      
      governanceService.registerConsent({
        personId,
        tenantId: "tenant-001",
        branchId: "branch-001",
        personName: "Bob Johnson",
        role: "VENDOR",
        consentSignedAt: new Date(),
        consentExpiryAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        documentReference: "consent-doc-revoked",
        status: "REVOKED",
      });

      expect(governanceService.hasActiveConsent(personId)).toBe(false);
    });

    it("throws error for invalid consent record", () => {
      expect(() => {
        governanceService.registerConsent({
          personId: "person-invalid",
          tenantId: "tenant-001",
          branchId: "branch-001",
          personName: "Invalid Person",
          role: "EMPLOYEE",
          consentSignedAt: new Date(),
          consentExpiryAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          documentReference: "", // Invalid: empty document reference
          status: "ACTIVE",
        });
      }).toThrow("invalid_consent_record");
    });
  });

  describe("Liveness and Anti-Spoofing Validation", () => {
    it("accepts observation with liveness >= 0.95", () => {
      const validation = governanceService.validateBiometricObservation({
        cameraId: "camera-001",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.1),
        livenessScore: 0.96,
        observationCount: 3,
        observedAt: new Date(),
        matchedPersonId: undefined,
        isWatchlistMatch: false,
      });

      expect(validation.accepted).toBe(true);
      expect(validation.reason).toBeUndefined();
    });

    it("rejects observation with liveness < 0.95", () => {
      const validation = governanceService.validateBiometricObservation({
        cameraId: "camera-002",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.1),
        livenessScore: 0.89,
        observationCount: 3,
        observedAt: new Date(),
      });

      expect(validation.accepted).toBe(false);
      expect(validation.reason).toContain("LIVENESS_REJECTED");
      expect(validation.reason).toContain("0.89");
      expect(validation.reason).toContain("0.95");
    });

    it("enforces minimum liveness threshold exactly at 0.95", () => {
      const validationPass = governanceService.validateBiometricObservation({
        cameraId: "camera-003",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.1),
        livenessScore: 0.95,
        observationCount: 3,
        observedAt: new Date(),
      });

      expect(validationPass.accepted).toBe(true);

      const validationFail = governanceService.validateBiometricObservation({
        cameraId: "camera-003",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.1),
        livenessScore: 0.9499, // Just below threshold
        observationCount: 3,
        observedAt: new Date(),
      });

      expect(validationFail.accepted).toBe(false);
    });
  });

  describe("Temporal Confirmation Requirements", () => {
    it("requires minimum 3 frame observations", () => {
      const validation1 = governanceService.validateBiometricObservation({
        cameraId: "camera-temporal",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.1),
        livenessScore: 0.98,
        observationCount: 1,
        observedAt: new Date(),
      });

      expect(validation1.accepted).toBe(false);
      expect(validation1.reason).toContain("TEMPORAL_CONFIRMATION_INSUFFICIENT");
      expect(validation1.reason).toContain("requires >= 3 observations");
      expect(validation1.reason).toContain("received 1");

      const validation2 = governanceService.validateBiometricObservation({
        cameraId: "camera-temporal",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.1),
        livenessScore: 0.98,
        observationCount: 2,
        observedAt: new Date(),
      });

      expect(validation2.accepted).toBe(false);
      expect(validation2.reason).toContain("received 2");
    });

    it("accepts observation with exactly 3 frames", () => {
      const validation = governanceService.validateBiometricObservation({
        cameraId: "camera-temporal",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.1),
        livenessScore: 0.98,
        observationCount: 3,
        observedAt: new Date(),
      });

      expect(validation.accepted).toBe(true);
    });

    it("accepts observation with more than 3 frames", () => {
      const validation = governanceService.validateBiometricObservation({
        cameraId: "camera-temporal",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.1),
        livenessScore: 0.98,
        observationCount: 10,
        observedAt: new Date(),
      });

      expect(validation.accepted).toBe(true);
    });
  });

  describe("Embedding Dimension Validation", () => {
    it("accepts 512-dimension embedding vector", () => {
      const validation = governanceService.validateBiometricObservation({
        cameraId: "camera-embedding",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.5),
        livenessScore: 0.97,
        observationCount: 3,
        observedAt: new Date(),
      });

      expect(validation.accepted).toBe(true);
    });

    it("rejects invalid embedding dimensions", () => {
      const validation128 = governanceService.validateBiometricObservation({
        cameraId: "camera-embedding",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(128).fill(0.5), // Wrong dimension
        livenessScore: 0.97,
        observationCount: 3,
        observedAt: new Date(),
      });

      expect(validation128.accepted).toBe(false);
      expect(validation128.reason).toContain("INVALID_EMBEDDING_DIMENSION");
      expect(validation128.reason).toContain("512-dimension vector");

      const validation256 = governanceService.validateBiometricObservation({
        cameraId: "camera-embedding",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(256).fill(0.5),
        livenessScore: 0.97,
        observationCount: 3,
        observedAt: new Date(),
      });

      expect(validation256.accepted).toBe(false);
    });

    it("rejects non-array embedding", () => {
      const validation = governanceService.validateBiometricObservation({
        cameraId: "camera-embedding",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: null as any,
        livenessScore: 0.97,
        observationCount: 3,
        observedAt: new Date(),
      });

      expect(validation.accepted).toBe(false);
      expect(validation.reason).toContain("INVALID_EMBEDDING_DIMENSION");
    });
  });

  describe("Consent Verification for Identified Persons", () => {
    it("requires consent when person identity is resolved", () => {
      const personId = "person-no-consent";

      const validation = governanceService.validateBiometricObservation({
        cameraId: "camera-consent",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.1),
        livenessScore: 0.98,
        observationCount: 5,
        observedAt: new Date(),
        matchedPersonId: personId,
        isWatchlistMatch: true,
      });

      expect(validation.accepted).toBe(false);
      expect(validation.reason).toContain("UNLAWFUL_PROCESSING");
      expect(validation.reason).toContain(personId);
      expect(validation.reason).toContain("no active biometric consent");
    });

    it("accepts observation with valid consent", () => {
      const personId = "person-with-consent";

      // Register consent first
      governanceService.registerConsent({
        personId,
        tenantId: "tenant-001",
        branchId: "branch-001",
        personName: "Consented Person",
        role: "EMPLOYEE",
        consentSignedAt: new Date(),
        consentExpiryAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        documentReference: "consent-doc-valid",
        status: "ACTIVE",
      });

      const validation = governanceService.validateBiometricObservation({
        cameraId: "camera-consent",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.1),
        livenessScore: 0.98,
        observationCount: 5,
        observedAt: new Date(),
        matchedPersonId: personId,
        isWatchlistMatch: true,
      });

      expect(validation.accepted).toBe(true);
    });

    it("skips consent check for unidentified faces", () => {
      const validation = governanceService.validateBiometricObservation({
        cameraId: "camera-consent",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.1),
        livenessScore: 0.98,
        observationCount: 5,
        observedAt: new Date(),
        matchedPersonId: undefined,
        isWatchlistMatch: false,
      });

      expect(validation.accepted).toBe(true);
    });
  });

  describe("Human Review Workflow", () => {
    it("queues review task and tracks status", () => {
      const task = governanceService.queueHumanReview({
        reviewId: "review-001",
        incidentType: "WATCHLIST_MATCH",
        cameraId: "camera-review",
        branchId: "branch-001",
        detectedAt: new Date(),
        confidence: 0.87,
      });

      expect(task.status).toBe("PENDING_REVIEW");
      expect(task.reviewId).toBe("review-001");
      expect(task.incidentType).toBe("WATCHLIST_MATCH");
    });

    it("completes review with genuine confirmation", () => {
      const task = governanceService.queueHumanReview({
        reviewId: "review-genuine",
        incidentType: "WEAPON_DETECTED",
        cameraId: "camera-weapon",
        branchId: "branch-002",
        detectedAt: new Date(),
        confidence: 0.92,
      });

      const completed = governanceService.completeHumanReview(
        "review-genuine",
        "CONFIRMED_GENUINE",
        "reviewer-alice",
        "Verified weapon detection is accurate",
      );

      expect(completed.status).toBe("CONFIRMED_GENUINE");
      expect(completed.reviewedBy).toBe("reviewer-alice");
      expect(completed.reviewNotes).toBe("Verified weapon detection is accurate");
      expect(completed.reviewedAt).toBeTruthy();
    });

    it("completes review with false positive rejection", () => {
      const task = governanceService.queueHumanReview({
        reviewId: "review-false",
        incidentType: "WATCHLIST_MATCH",
        cameraId: "camera-false",
        branchId: "branch-003",
        detectedAt: new Date(),
        confidence: 0.68,
      });

      const completed = governanceService.completeHumanReview(
        "review-false",
        "REJECTED_FALSE_POSITIVE",
        "reviewer-bob",
        "Person looks similar but is not a match",
      );

      expect(completed.status).toBe("REJECTED_FALSE_POSITIVE");
      expect(completed.reviewedBy).toBe("reviewer-bob");
      expect(completed.reviewNotes).toBeTruthy();
    });

    it("throws error for non-existent review task", () => {
      expect(() => {
        governanceService.completeHumanReview(
          "non-existent-review",
          "CONFIRMED_GENUINE",
          "reviewer-charlie",
          "This should fail",
        );
      }).toThrow("review_task_not_found");
    });
  });

  describe("Camera Accuracy Audit Trail", () => {
    it("tracks false positive rate per camera", () => {
      governanceService.queueHumanReview({
        reviewId: "audit-1",
        incidentType: "WATCHLIST_MATCH",
        cameraId: "camera-audit",
        branchId: "branch-audit",
        detectedAt: new Date(),
        confidence: 0.85,
      });

      governanceService.completeHumanReview(
        "audit-1",
        "CONFIRMED_GENUINE",
        "reviewer-audit",
        "Genuine match",
      );

      governanceService.queueHumanReview({
        reviewId: "audit-2",
        incidentType: "WATCHLIST_MATCH",
        cameraId: "camera-audit",
        branchId: "branch-audit",
        detectedAt: new Date(),
        confidence: 0.72,
      });

      governanceService.completeHumanReview(
        "audit-2",
        "REJECTED_FALSE_POSITIVE",
        "reviewer-audit",
        "False positive",
      );

      const audit = governanceService.getCameraAudit("camera-audit");

      expect(audit).toBeTruthy();
      expect(audit!.totalObservations).toBe(2);
      expect(audit!.genuineMatches).toBe(1);
      expect(audit!.falsePositives).toBe(1);
      expect(audit!.falsePositiveRate).toBe(0.5);
    });

    it("calculates false positive rate correctly", () => {
      const cameraId = "camera-accuracy";

      // Add 7 genuine and 3 false positives
      for (let i = 0; i < 7; i++) {
        governanceService.queueHumanReview({
          reviewId: `genuine-${i}`,
          incidentType: "WATCHLIST_MATCH",
          cameraId,
          branchId: "branch-001",
          detectedAt: new Date(),
          confidence: 0.90,
        });
        governanceService.completeHumanReview(
          `genuine-${i}`,
          "CONFIRMED_GENUINE",
          "reviewer-test",
          "Genuine",
        );
      }

      for (let i = 0; i < 3; i++) {
        governanceService.queueHumanReview({
          reviewId: `false-${i}`,
          incidentType: "WATCHLIST_MATCH",
          cameraId,
          branchId: "branch-001",
          detectedAt: new Date(),
          confidence: 0.65,
        });
        governanceService.completeHumanReview(
          `false-${i}`,
          "REJECTED_FALSE_POSITIVE",
          "reviewer-test",
          "False",
        );
      }

      const audit = governanceService.getCameraAudit(cameraId);

      expect(audit!.totalObservations).toBe(10);
      expect(audit!.genuineMatches).toBe(7);
      expect(audit!.falsePositives).toBe(3);
      expect(audit!.falsePositiveRate).toBe(0.3);
    });
  });

  describe("Combined Multi-Factor Validation", () => {
    it("accepts observation meeting all requirements", () => {
      const personId = "person-compliant";

      // Register valid consent
      governanceService.registerConsent({
        personId,
        tenantId: "tenant-001",
        branchId: "branch-001",
        personName: "Fully Compliant Person",
        role: "EMPLOYEE",
        consentSignedAt: new Date(),
        consentExpiryAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        documentReference: "consent-doc-compliant",
        status: "ACTIVE",
      });

      const validation = governanceService.validateBiometricObservation({
        cameraId: "camera-compliant",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.2),
        livenessScore: 0.98, // ✓ >= 0.95
        observationCount: 5, // ✓ >= 3
        observedAt: new Date(),
        matchedPersonId: personId, // ✓ Has active consent
        isWatchlistMatch: true,
      });

      expect(validation.accepted).toBe(true);
      expect(validation.reason).toBeUndefined();
    });

    it("rejects when any single requirement fails", () => {
      const personId = "person-multi-fail";

      governanceService.registerConsent({
        personId,
        tenantId: "tenant-001",
        branchId: "branch-001",
        personName: "Multi Fail Person",
        role: "EMPLOYEE",
        consentSignedAt: new Date(),
        consentExpiryAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        documentReference: "consent-multi-fail",
        status: "ACTIVE",
      });

      // Fail on liveness only
      const validation1 = governanceService.validateBiometricObservation({
        cameraId: "camera-multi",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.2),
        livenessScore: 0.90, // ✗ Fail
        observationCount: 5, // ✓ Pass
        observedAt: new Date(),
        matchedPersonId: personId, // ✓ Has consent
      });

      expect(validation1.accepted).toBe(false);
      expect(validation1.reason).toContain("LIVENESS_REJECTED");

      // Fail on temporal only
      const validation2 = governanceService.validateBiometricObservation({
        cameraId: "camera-multi",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(512).fill(0.2),
        livenessScore: 0.97, // ✓ Pass
        observationCount: 2, // ✗ Fail
        observedAt: new Date(),
        matchedPersonId: personId, // ✓ Has consent
      });

      expect(validation2.accepted).toBe(false);
      expect(validation2.reason).toContain("TEMPORAL_CONFIRMATION_INSUFFICIENT");

      // Fail on embedding dimension only
      const validation3 = governanceService.validateBiometricObservation({
        cameraId: "camera-multi",
        branchId: "branch-001",
        tenantId: "tenant-001",
        embedding: new Array(256).fill(0.2), // ✗ Fail
        livenessScore: 0.97, // ✓ Pass
        observationCount: 5, // ✓ Pass
        observedAt: new Date(),
        matchedPersonId: personId, // ✓ Has consent
      });

      expect(validation3.accepted).toBe(false);
      expect(validation3.reason).toContain("INVALID_EMBEDDING_DIMENSION");
    });
  });
});
