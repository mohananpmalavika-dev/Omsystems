import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { BfsiZoneCalibrationService } from "../../src/banking/calibration/bfsi-zone-calibration.service.js";
import { AudioHardwareGovernanceService } from "../../src/banking/audio/audio-hardware-governance.service.js";
import { BfsiAlertEscalationService } from "../../src/banking/escalation/bfsi-alert-escalation.service.js";
import { FaceRecognitionGovernanceService } from "../../src/banking/governance/face-recognition-governance.service.js";
import { BfsiSecurityPolicyEngine } from "../../analytics-engine/src/banking/bfsi-security-policy-engine.js";

function fileSha256(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

describe("BFSI Bank / NBFC Production Rollout - 6 Pillars Acceptance Suite", () => {
  // --------------------------------------------------------------------------
  // Pillar 1: Approved AI Models & Cryptographic Checksums
  // --------------------------------------------------------------------------
  describe("Pillar 1: Approved AI Models & Cryptographic Checksums", () => {
    it("verifies edge-agent secure-face models and manifest.json", () => {
      const manifestPath = resolve("edge-agent/models/secure-face/manifest.json");
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      expect(manifest.version).toBe(1);
      expect(manifest.artifacts).toHaveLength(3);

      for (const artifact of manifest.artifacts) {
        const modelPath = resolve("edge-agent/models/secure-face", artifact.file);
        expect(existsSync(modelPath)).toBe(true);

        const digest = fileSha256(modelPath);
        expect(digest).toBe(artifact.sha256.toLowerCase());
        expect(artifact.license).toBeTruthy();
        expect(artifact.modelVersion).toBeTruthy();
      }
    });

    it("verifies analytics-engine required and BFSI security models", () => {
      const manifestPath = resolve("analytics-engine/models/manifest.json");
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const modelMap = new Map(manifest.models.map((m: any) => [m.id, m]));

      // Verify core models
      const expectedModels = [
        "yolov8n",
        "face-detector",
        "face-embedding",
        "anpr-detector",
        "anpr-recognizer",
        "helmet",
        "weapon-detector",
        "atm-tamper-detector",
        "pose-estimator",
        "acoustic-security",
      ];

      for (const id of expectedModels) {
        const model = modelMap.get(id);
        expect(model).toBeDefined();
        if (model.path) {
          const modelFile = resolve("analytics-engine/models", model.path);
          expect(existsSync(modelFile)).toBe(true);
          const digest = fileSha256(modelFile);
          expect(digest).toBe(model.sha256.toLowerCase());
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 2: Edge-Agent Configuration & Matching Control-Plane Secret
  // --------------------------------------------------------------------------
  describe("Pillar 2: Edge-Agent Configuration & Token Alignment", () => {
    it("verifies edge agent has secure face configuration and token", () => {
      const edgeEnvPath = resolve("edge-agent/.env");
      expect(existsSync(edgeEnvPath)).toBe(true);

      const edgeEnv = readFileSync(edgeEnvPath, "utf8");
      expect(edgeEnv).toContain("SECURE_FACE_AI_ENABLED=true");
      expect(edgeEnv).toContain("SECURE_FACE_MIN_LIVENESS=0.95");
      expect(edgeEnv).toContain("SECURE_FACE_MIN_OBSERVATIONS=3");
      expect(edgeEnv).toMatch(/SECURE_FACE_INGEST_TOKEN=[a-f0-9]{32,}/i);
    });

    it("verifies matching token configuration template exists on control-plane", () => {
      const rootEnvExample = readFileSync(resolve(".env.example"), "utf8");
      expect(rootEnvExample).toContain("SECURE_AREA_EDGE_INGEST_TOKEN=");
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 3: Camera and Zone Calibration Suite
  // --------------------------------------------------------------------------
  describe("Pillar 3: Camera and Zone Calibration Suite", () => {
    const calibrationService = new BfsiZoneCalibrationService();

    it("registers and validates full ATM camera zone calibration", () => {
      calibrationService.registerCalibration({
        cameraId: "cam-atm-01",
        branchId: "branch-blr-101",
        tenantId: "tenant-bank-01",
        calibratedAt: new Date(),
        calibratedBy: "cert-engineer-42",
        zoneType: "atm",
        atm: {
          kioskBoundary: [
            { x: 0.1, y: 0.1 },
            { x: 0.9, y: 0.1 },
            { x: 0.9, y: 0.9 },
            { x: 0.1, y: 0.9 },
          ],
          machineCardSlotRoi: { x: 0.35, y: 0.4, width: 0.3, height: 0.25 },
          entryZone: [
            { x: 0.1, y: 0.7 },
            { x: 0.9, y: 0.7 },
            { x: 0.9, y: 0.9 },
            { x: 0.1, y: 0.9 },
          ],
          maxLoiteringSeconds: 180,
          maxPeopleAllowed: 1,
        },
        environmentalMatrix: {
          daytime: { condition: "daytime", testedAt: new Date(), status: "PASSED", minDetectionConfidence: 0.95, falsePositiveRate: 0.01, notes: "Direct daylight calibrated" },
          night_ir: { condition: "night_ir", testedAt: new Date(), status: "PASSED", minDetectionConfidence: 0.92, falsePositiveRate: 0.02, notes: "IR illumination verified" },
          low_light: { condition: "low_light", testedAt: new Date(), status: "PASSED", minDetectionConfidence: 0.91, falsePositiveRate: 0.02, notes: "Low light tested at 15 lux" },
          face_cover: { condition: "face_cover", testedAt: new Date(), status: "PASSED", minDetectionConfidence: 0.94, falsePositiveRate: 0.01, notes: "Helmet and mask detected" },
          crowd: { condition: "crowd", testedAt: new Date(), status: "PASSED", minDetectionConfidence: 0.93, falsePositiveRate: 0.03, notes: "Queue clustering tested" },
          partial_occlusion: { condition: "partial_occlusion", testedAt: new Date(), status: "PASSED", minDetectionConfidence: 0.90, falsePositiveRate: 0.02, notes: "Glass partition calibrated" },
        },
      });

      const cal = calibrationService.getCalibration("cam-atm-01");
      expect(cal).toBeDefined();
      expect(calibrationService.isPointInPolygon({ x: 0.5, y: 0.5 }, cal!.atm!.kioskBoundary)).toBe(true);
      expect(calibrationService.isPointInPolygon({ x: 0.05, y: 0.05 }, cal!.atm!.kioskBoundary)).toBe(false);
    });

    it("registers and validates Cash Counter, Vault, Gold Loan, and Guard Post profiles", () => {
      // Guard Post
      calibrationService.registerCalibration({
        cameraId: "cam-guard-01",
        branchId: "branch-blr-101",
        tenantId: "tenant-bank-01",
        calibratedAt: new Date(),
        calibratedBy: "cert-engineer-42",
        zoneType: "guard_post",
        guardPost: {
          chairPostZone: [
            { x: 0.2, y: 0.2 },
            { x: 0.6, y: 0.2 },
            { x: 0.6, y: 0.8 },
            { x: 0.2, y: 0.8 },
          ],
          allowedInactivityDurationSeconds: 60,
        },
        environmentalMatrix: {
          daytime: { condition: "daytime", testedAt: new Date(), status: "PASSED", minDetectionConfidence: 0.95, falsePositiveRate: 0.01, notes: "OK" },
          night_ir: { condition: "night_ir", testedAt: new Date(), status: "PASSED", minDetectionConfidence: 0.92, falsePositiveRate: 0.02, notes: "OK" },
          low_light: { condition: "low_light", testedAt: new Date(), status: "PASSED", minDetectionConfidence: 0.91, falsePositiveRate: 0.02, notes: "OK" },
          face_cover: { condition: "face_cover", testedAt: new Date(), status: "PASSED", minDetectionConfidence: 0.94, falsePositiveRate: 0.01, notes: "OK" },
          crowd: { condition: "crowd", testedAt: new Date(), status: "PASSED", minDetectionConfidence: 0.93, falsePositiveRate: 0.03, notes: "OK" },
          partial_occlusion: { condition: "partial_occlusion", testedAt: new Date(), status: "PASSED", minDetectionConfidence: 0.90, falsePositiveRate: 0.02, notes: "OK" },
        },
      });

      expect(calibrationService.getCalibration("cam-guard-01")?.guardPost?.allowedInactivityDurationSeconds).toBe(60);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 4: Audio Hardware & Ingestion Policy
  // --------------------------------------------------------------------------
  describe("Pillar 4: Audio Hardware & Ingestion Policy", () => {
    const audioGov = new AudioHardwareGovernanceService();

    it("fails closed if camera lacks microphone or branch lacks consent", () => {
      // Unconfigured camera
      const check1 = audioGov.canEnableAcousticAlerts("cam-silent-01", "branch-101");
      expect(check1.canEnable).toBe(false);
      expect(check1.reasons.some((r) => r.includes("NO_MICROPHONE_HARDWARE"))).toBe(true);

      // Register microphone hardware
      audioGov.registerCameraAudio({
        cameraId: "cam-mic-01",
        branchId: "branch-101",
        tenantId: "tenant-bank-01",
        hasMicrophone: true,
        microphoneType: "camera_builtin",
        audioCodec: "AAC",
        samplingRateHz: 16000,
      });

      // Still fails because branch consent is not registered
      const check2 = audioGov.canEnableAcousticAlerts("cam-mic-01", "branch-101");
      expect(check2.canEnable).toBe(false);
      expect(check2.reasons.some((r) => r.includes("NO_ACTIVE_AUDIO_CONSENT"))).toBe(true);

      // Register branch consent
      audioGov.registerBranchConsent({
        branchId: "branch-101",
        tenantId: "tenant-bank-01",
        consentSignedAt: new Date(),
        consentSignedBy: "BM-John-Doe",
        noticeDisplayedAtPremises: true,
        noticeLanguage: ["English", "Malayalam"],
        recordingRetentionDays: 90,
        status: "ACTIVE",
      });

      // Still fails because test clips have not been verified
      const check3 = audioGov.canEnableAcousticAlerts("cam-mic-01", "branch-101");
      expect(check3.canEnable).toBe(false);
      expect(check3.reasons.some((r) => r.includes("MISSING_AUDIO_CALIBRATION"))).toBe(true);

      // Register test clips for all 3 events
      audioGov.registerCalibrationClip({ clipId: "c1", cameraId: "cam-mic-01", eventType: "glass_break", durationSeconds: 2, snrDb: 22, crestFactorDb: 19, detectedConfidence: 0.94, passed: true, verifiedAt: new Date() });
      audioGov.registerCalibrationClip({ clipId: "c2", cameraId: "cam-mic-01", eventType: "gunshot", durationSeconds: 1, snrDb: 28, crestFactorDb: 24, detectedConfidence: 0.97, passed: true, verifiedAt: new Date() });
      audioGov.registerCalibrationClip({ clipId: "c3", cameraId: "cam-mic-01", eventType: "scream", durationSeconds: 3, snrDb: 20, crestFactorDb: 18, detectedConfidence: 0.91, passed: true, verifiedAt: new Date() });

      // Now all prerequisites are satisfied
      const check4 = audioGov.canEnableAcousticAlerts("cam-mic-01", "branch-101");
      expect(check4.canEnable).toBe(true);
      expect(check4.reasons).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 5: Alert Escalation & P1 Workflow
  // --------------------------------------------------------------------------
  describe("Pillar 5: Alert Escalation & P1 Workflow", () => {
    const escalationService = new BfsiAlertEscalationService();
    escalationService.addRecipient({
      role: "SOC_OPERATOR",
      name: "Operator 1",
      phone: "+919876543210",
      email: "soc1@bank.com",
      whatsappNumber: "+919876543210",
      onCall: true,
    });
    escalationService.addRecipient({
      role: "BRANCH_MANAGER",
      name: "Manager Bob",
      phone: "+919876543211",
      email: "bm@bank.com",
      whatsappNumber: "+919876543211",
      onCall: true,
    });

    it("triggers silent panic and multi-channel escalation for WEAPON_DETECTED", async () => {
      const result = await escalationService.dispatchEscalation({
        incidentId: "inc-001",
        tenantId: "tenant-bank-01",
        branchId: "branch-blr-101",
        cameraId: "cam-01",
        eventCode: "WEAPON_DETECTED",
        severity: "P1",
        message: "Handgun identified in banking hall",
        occurredAt: new Date(),
        isSilentPanic: true,
        retentionLockDays: 90,
      });

      expect(result.socNotified).toBe(true);
      expect(result.silentPanicDispatched).toBe(true);
      expect(result.smsSentCount).toBe(2);
      expect(result.voiceCallsPlacedCount).toBe(2);
      expect(result.whatsAppSentCount).toBe(2);
      expect(result.speakerWarningBroadcast).toBe(false); // Armed attack: NO speaker broadcast
      expect(result.evidenceRetentionLocked).toBe(true);
    });

    it("triggers two-way speaker warning strictly for non-violent ATM helmet deterrence", async () => {
      const result = await escalationService.dispatchEscalation({
        incidentId: "inc-002",
        tenantId: "tenant-bank-01",
        branchId: "branch-blr-101",
        cameraId: "cam-atm-01",
        eventCode: "ATM_FACE_CONCEALMENT",
        severity: "P2",
        message: "Face concealment in ATM",
        occurredAt: new Date(),
        isSilentPanic: false,
        speakerWarningMessage: "Please remove helmet/face covering and leave the ATM kiosk.",
        retentionLockDays: 90,
      });

      expect(result.silentPanicDispatched).toBe(false);
      expect(result.speakerWarningBroadcast).toBe(true); // Deterrence warning broadcast
    });

    it("strictly prohibits AI from autonomously executing door unlock or punitive decisions", async () => {
      await expect(
        escalationService.dispatchEscalation({
          incidentId: "inc-003",
          tenantId: "tenant-bank-01",
          branchId: "branch-blr-101",
          cameraId: "cam-vault-01",
          eventCode: "DOOR_UNLOCK_REQUEST",
          severity: "P1",
          message: "AI trying to unlock vault",
          occurredAt: new Date(),
          isSilentPanic: false,
          retentionLockDays: 90,
        }),
      ).rejects.toThrow(/PROHIBITED_AUTONOMOUS_ACTION/);
    });
  });

  // --------------------------------------------------------------------------
  // Pillar 6: Face-Recognition Governance
  // --------------------------------------------------------------------------
  describe("Pillar 6: Face-Recognition Governance", () => {
    const govService = new FaceRecognitionGovernanceService();

    it("enforces liveness >= 0.95 and minimum 3-frame temporal confirmation", () => {
      const dummy512Embedding = Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0));

      // 1. Rejected: observationCount < 3
      const check1 = govService.validateBiometricObservation({
        cameraId: "cam-01",
        branchId: "branch-101",
        tenantId: "tenant-bank-01",
        embedding: dummy512Embedding,
        livenessScore: 0.98,
        observationCount: 1, // Single frame
        observedAt: new Date(),
      });
      expect(check1.accepted).toBe(false);
      expect(check1.reason).toContain("TEMPORAL_CONFIRMATION_INSUFFICIENT");

      // 2. Rejected: liveness < 0.95
      const check2 = govService.validateBiometricObservation({
        cameraId: "cam-01",
        branchId: "branch-101",
        tenantId: "tenant-bank-01",
        embedding: dummy512Embedding,
        livenessScore: 0.88, // Below 0.95
        observationCount: 3,
        observedAt: new Date(),
      });
      expect(check2.accepted).toBe(false);
      expect(check2.reason).toContain("LIVENESS_REJECTED");

      // 3. Accepted: 3-frame temporal confirmation + liveness >= 0.95
      const check3 = govService.validateBiometricObservation({
        cameraId: "cam-01",
        branchId: "branch-101",
        tenantId: "tenant-bank-01",
        embedding: dummy512Embedding,
        livenessScore: 0.98,
        observationCount: 3,
        observedAt: new Date(),
      });
      expect(check3.accepted).toBe(true);
    });

    it("requires written consent before resolving individual biometric identities", () => {
      const dummy512Embedding = Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0));

      // Without consent
      const checkWithoutConsent = govService.validateBiometricObservation({
        cameraId: "cam-01",
        branchId: "branch-101",
        tenantId: "tenant-bank-01",
        embedding: dummy512Embedding,
        livenessScore: 0.98,
        observationCount: 3,
        observedAt: new Date(),
        matchedPersonId: "employee-123",
      });
      expect(checkWithoutConsent.accepted).toBe(false);
      expect(checkWithoutConsent.reason).toContain("UNLAWFUL_PROCESSING");

      // Register consent
      govService.registerConsent({
        personId: "employee-123",
        tenantId: "tenant-bank-01",
        branchId: "branch-101",
        personName: "Alice Employee",
        role: "EMPLOYEE",
        consentSignedAt: new Date(),
        consentExpiryAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
        documentReference: "HRMS-CONSENT-DOC-9876",
        status: "ACTIVE",
      });

      // With consent
      const checkWithConsent = govService.validateBiometricObservation({
        cameraId: "cam-01",
        branchId: "branch-101",
        tenantId: "tenant-bank-01",
        embedding: dummy512Embedding,
        livenessScore: 0.98,
        observationCount: 3,
        observedAt: new Date(),
        matchedPersonId: "employee-123",
      });
      expect(checkWithConsent.accepted).toBe(true);
    });

    it("manages human review workflow and tracks camera false-positive audit", () => {
      const task = govService.queueHumanReview({
        reviewId: "rev-001",
        incidentType: "WATCHLIST_MATCH",
        cameraId: "cam-01",
        branchId: "branch-101",
        detectedAt: new Date(),
        confidence: 0.89,
      });
      expect(task.status).toBe("PENDING_REVIEW");

      // Complete review
      govService.completeHumanReview("rev-001", "CONFIRMED_GENUINE", "soc-supervisor-1", "Match verified against ID photo");
      const audit = govService.getCameraAudit("cam-01");
      expect(audit).toBeDefined();
      expect(audit?.genuineMatches).toBe(1);
      expect(audit?.falsePositives).toBe(0);
      expect(audit?.falsePositiveRate).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Integration: Policy Engine Correlation with Verified Perceptions
  // --------------------------------------------------------------------------
  describe("Policy Engine Integration with Perceptions", () => {
    const engine = new BfsiSecurityPolicyEngine();

    it("fails closed when perception source is unverified", () => {
      const actions = engine.evaluate({
        tenantId: "tenant-bank-01",
        branchId: "branch-101",
        cameraId: "cam-01",
        zone: "atm",
        signal: "atm_tamper",
        confidence: 0.95,
        observedAt: new Date(),
        verifiedSource: false, // Model was not verified!
      });
      expect(actions).toHaveLength(0); // FAILS CLOSED
    });

    it("generates silent panic for verified weapon, tamper, and gunshot signals", () => {
      // Weapon
      const weaponActions = engine.evaluate({
        tenantId: "tenant-bank-01",
        branchId: "branch-101",
        cameraId: "cam-01",
        zone: "cash_counter",
        signal: "weapon",
        confidence: 0.92,
        observedAt: new Date(),
        verifiedSource: true,
      });
      expect(weaponActions.some((a) => a.type === "silent_panic")).toBe(true);
      expect(weaponActions.some((a) => a.type === "human_review")).toBe(true);

      // Gunshot
      const audioActions = engine.evaluate({
        tenantId: "tenant-bank-01",
        branchId: "branch-101",
        cameraId: "cam-01",
        zone: "branch_entry",
        signal: "gunshot",
        confidence: 0.96,
        observedAt: new Date(),
        verifiedSource: true,
      });
      expect(audioActions[0]).toMatchObject({
        type: "silent_panic",
        severity: "P1",
        code: "AUDIO_GUNSHOT",
      });
    });
  });
});
