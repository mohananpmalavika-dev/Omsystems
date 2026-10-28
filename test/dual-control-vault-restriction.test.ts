import { describe, expect, it } from "vitest";
import {
  sortedMatchingRules,
  isVaultCameraTarget,
} from "../src/analytics/rule-engine.js";
import { ensureCameraAiBundle } from "../src/analytics/camera-ai-bundle.js";
import type { AnalyticsRule, Camera } from "../src/domain/models.js";
import type { AnalyticsEventInput } from "../src/control-plane-store.js";
import { MemoryStore } from "../src/store.js";

function makeDualControlRule(cameraId: string, overrides: Partial<AnalyticsRule> = {}): AnalyticsRule {
  return {
    id: `rule-dc-${cameraId}`,
    tenantId: "omsystems",
    cameraId,
    name: "Banking AI - Dual control verification",
    detectionType: "dual-control-verification",
    enabled: true,
    objectClasses: [],
    minConfidence: 0.65,
    minDurationSeconds: 0,
    direction: "any",
    severity: "P1",
    cooldownSeconds: 30,
    recipients: [],
    recordingPolicy: "protect-window",
    preRollSeconds: 30,
    postRollSeconds: 120,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function addCameraToStore(
  store: MemoryStore,
  overrides: Partial<Camera> & { name: string; channel: number },
): Camera {
  const camera: Camera = {
    id: `cam-${Math.random().toString(36).slice(2, 9)}`,
    deviceIdentityId: `dev-${Math.random().toString(36).slice(2, 9)}`,
    nodeId: "camera-entrance",
    branchId: "A005",
    vendor: "hikvision",
    model: "DS-2CD2143G0-I",
    status: "online",
    protocol: "rtsp",
    profiles: [],
    ...overrides,
  };
  store.cameras.set(camera.id, camera);
  return camera;
}

describe("Dual Control Vault Camera Restriction", () => {
  describe("isVaultCameraTarget detection", () => {
    it("identifies vault cameras from camera names, zones, and channels", () => {
      expect(isVaultCameraTarget({ cameraId: "cam-1", metadata: { cameraName: "Main Branch - Vault Camera" } })).toBe(true);
      expect(isVaultCameraTarget({ cameraId: "cam-2", metadata: { cameraName: "Strong Room Dual-Custody Door" } })).toBe(true);
      expect(isVaultCameraTarget({ cameraId: "cam-3", metadata: { cameraName: "Strongroom Inside View" } })).toBe(true);
      expect(isVaultCameraTarget({ cameraId: "cam-4", metadata: { cameraName: "Locker Area North" } })).toBe(true);
      expect(isVaultCameraTarget({ cameraId: "cam-5", metadata: { cameraName: "Safe Deposit Room" } })).toBe(true);
      expect(isVaultCameraTarget({ cameraId: "cam-6", metadata: { cameraName: "Currency Chest Camera" } })).toBe(true);
      expect(isVaultCameraTarget({ cameraId: "cam-7", metadata: { cameraName: "Rajkot - Channel 8" } })).toBe(true);
      expect(isVaultCameraTarget({ cameraId: "cam-8", metadata: { channel: 8 } })).toBe(true);
      expect(isVaultCameraTarget({ cameraId: "cam-9", metadata: { zone: "VAULT" } })).toBe(true);
      expect(isVaultCameraTarget({ cameraId: "cam-10", metadata: { zoneType: "LOCKER" } })).toBe(true);
      expect(isVaultCameraTarget({ cameraId: "cam-11", metadata: { zoneName: "Strong_Room_Zone" } })).toBe(true);

      // Designated vault camera IDs
      expect(isVaultCameraTarget({ cameraId: "ca035670-aeee-481e-b47c-3eea98344fc6" })).toBe(true); // Bettaih Ch 1
      expect(isVaultCameraTarget({ cameraId: "e79e2f24-7adf-4908-93fb-6438b2ceb24f" })).toBe(true); // Hajipur Ch 6
      expect(isVaultCameraTarget({ cameraId: "b9522b23-506b-4eb2-9b24-bb05fb0148db" })).toBe(true); // KOLLAM Ch 4
      expect(isVaultCameraTarget({ cameraId: "541745ca-3aa1-4a3a-ad79-9e36d9f74fe8" })).toBe(true); // PERAVARUNI Ch 7
      expect(isVaultCameraTarget({ cameraId: "4d74d7ad-6922-4af0-9f36-420b84879425" })).toBe(true); // Rajkot Ch 8

      // Branch-specific channel mapping
      expect(isVaultCameraTarget({ metadata: { branchName: "Bettaih", channel: 1 } })).toBe(true);
      expect(isVaultCameraTarget({ metadata: { branchName: "Hajipur", channel: 6 } })).toBe(true);
      expect(isVaultCameraTarget({ metadata: { branchName: "KOLLAM", channel: 4 } })).toBe(true);
      expect(isVaultCameraTarget({ metadata: { branchName: "PERAVARUNI", channel: 7 } })).toBe(true);
      expect(isVaultCameraTarget({ metadata: { branchName: "Rajkot", channel: 8 } })).toBe(true);
    });

    it("rejects non-vault cameras", () => {
      expect(isVaultCameraTarget({ cameraId: "cam-1", metadata: { cameraName: "Branch Entrance Main Shutter" } })).toBe(false);
      expect(isVaultCameraTarget({ cameraId: "cam-2", metadata: { cameraName: "Cash Counter 01 Teller" } })).toBe(false);
      expect(isVaultCameraTarget({ cameraId: "cam-3", metadata: { cameraName: "ATM Lobby Kiosk" } })).toBe(false);
      expect(isVaultCameraTarget({ cameraId: "cam-4", metadata: { cameraName: "Customer Waiting Area" } })).toBe(false);
      expect(isVaultCameraTarget({ cameraId: "cam-5", metadata: { cameraName: "Parking Lot Camera" } })).toBe(false);
      expect(isVaultCameraTarget({ cameraId: "cam-6", metadata: { cameraName: "Rajkot - Channel 1" } })).toBe(false);
      expect(isVaultCameraTarget({ cameraId: "cam-7", metadata: { channel: 2 } })).toBe(false);

      // Non-vault channels on specific branches must be rejected (not confused with Rajkot Ch 8)
      expect(isVaultCameraTarget({ metadata: { branchName: "Bettaih", channel: 8 } })).toBe(false);
      expect(isVaultCameraTarget({ metadata: { branchName: "Bettaih", channel: 5 } })).toBe(false);
      expect(isVaultCameraTarget({ metadata: { branchName: "Bettaih", channel: 2 } })).toBe(false);
      expect(isVaultCameraTarget({ metadata: { branchName: "KOLLAM", channel: 5 } })).toBe(false);
      expect(isVaultCameraTarget({ metadata: { branchName: "KOLLAM", channel: 8 } })).toBe(false);
      expect(isVaultCameraTarget({ metadata: { branchName: "KOLLAM", channel: 1 } })).toBe(false);
      expect(isVaultCameraTarget({ metadata: { branchName: "PERAVARUNI", channel: 1 } })).toBe(false);
      expect(isVaultCameraTarget({ metadata: { branchName: "PERAVARUNI", channel: 3 } })).toBe(false);
      expect(isVaultCameraTarget({ metadata: { branchName: "PERAVARUNI", channel: 5 } })).toBe(false);
      expect(isVaultCameraTarget({ metadata: { branchName: "Hajipur", channel: 1 } })).toBe(false);
    });
  });

  describe("sortedMatchingRules rule matching", () => {
    it("suppresses dual-control violations on non-vault cameras", () => {
      const nonVaultRule = makeDualControlRule("cam-entrance");
      const event: AnalyticsEventInput = {
        tenantId: "omsystems",
        cameraId: "cam-entrance",
        sourceEventId: "evt-dc-1",
        detectionType: "dual-control-verification",
        occurredAt: new Date().toISOString(),
        confidence: 0.95,
        durationSeconds: 10,
        objects: [],
        metadata: {
          cameraName: "Branch Front Entrance",
          actualPersons: 1,
          requiredPersons: 2,
          violation: "SINGLE_PERSON_IN_VAULT",
        },
      };

      const matched = sortedMatchingRules([nonVaultRule], event);
      expect(matched).toEqual([]);
    });

    it("allows dual-control violations on vault cameras", () => {
      const vaultRule = makeDualControlRule("cam-vault");
      const event: AnalyticsEventInput = {
        tenantId: "omsystems",
        cameraId: "cam-vault",
        sourceEventId: "evt-dc-2",
        detectionType: "dual-control-verification",
        occurredAt: new Date().toISOString(),
        confidence: 0.95,
        durationSeconds: 10,
        objects: [],
        metadata: {
          cameraName: "Strong Room Vault Camera",
          actualPersons: 1,
          requiredPersons: 2,
          violation: "SINGLE_PERSON_IN_VAULT",
        },
      };

      const matched = sortedMatchingRules([vaultRule], event);
      expect(matched).toHaveLength(1);
      expect(matched[0]!.id).toBe(vaultRule.id);
    });

    it("allows branch opening dual control violations on entrance cameras during opening window", () => {
      const entranceRule = makeDualControlRule("cam-entrance");
      const event: AnalyticsEventInput = {
        tenantId: "omsystems",
        cameraId: "cam-entrance",
        sourceEventId: "branch-opening:rule-1:branch-1:2026-10-25",
        detectionType: "dual-control-verification",
        occurredAt: new Date().toISOString(),
        confidence: 0.95,
        durationSeconds: 0,
        objects: [],
        metadata: {
          cameraName: "Main Entrance Shutter",
          staffCount: 1,
          requiredStaff: 2,
          violation: "BRANCH_OPENING_MINIMUM_STAFF",
        },
      };

      const matched = sortedMatchingRules([entranceRule], event);
      expect(matched).toHaveLength(1);
    });
  });

  describe("Store processAnalyticsEvent", () => {
    it("suppresses dual-control violations on non-vault cameras in store", async () => {
      const store = new MemoryStore();
      const camera = addCameraToStore(store, {
        name: "Teller Cash Counter 01",
        channel: 2,
      });

      await store.createAnalyticsRule(
        "omsystems",
        camera.id,
        undefined,
        {
          name: "Banking AI - Dual control verification",
          detectionType: "dual-control-verification",
          enabled: true,
          objectClasses: [],
          minConfidence: 0.65,
          minDurationSeconds: 0,
          direction: "any",
          severity: "P1",
          cooldownSeconds: 30,
          recipients: [],
          recordingPolicy: "protect-window",
          preRollSeconds: 30,
          postRollSeconds: 120,
        },
      );

      const result = await store.processAnalyticsEvent({
        tenantId: "omsystems",
        cameraId: camera.id,
        sourceEventId: "test-single-person-counter",
        detectionType: "dual-control-verification",
        occurredAt: new Date().toISOString(),
        confidence: 0.95,
        durationSeconds: 10,
        objects: [],
        metadata: {
          violation: "SINGLE_PERSON_IN_VAULT",
        },
      });

      expect(result.event.status).toBe("suppressed");
      expect(result.alerts).toHaveLength(0);
    });

    it("creates alerts for dual-control violations on vault cameras in store", async () => {
      const store = new MemoryStore();
      const camera = addCameraToStore(store, {
        name: "Strong Room Vault Camera",
        channel: 8,
      });

      await store.createAnalyticsRule(
        "omsystems",
        camera.id,
        undefined,
        {
          name: "Banking AI - Dual control verification",
          detectionType: "dual-control-verification",
          enabled: true,
          objectClasses: [],
          minConfidence: 0.65,
          minDurationSeconds: 0,
          direction: "any",
          severity: "P1",
          cooldownSeconds: 30,
          recipients: [],
          recordingPolicy: "protect-window",
          preRollSeconds: 30,
          postRollSeconds: 120,
        },
      );

      const result = await store.processAnalyticsEvent({
        tenantId: "omsystems",
        cameraId: camera.id,
        sourceEventId: "test-single-person-vault",
        detectionType: "dual-control-verification",
        occurredAt: new Date().toISOString(),
        confidence: 0.95,
        durationSeconds: 10,
        objects: [],
        metadata: {
          violation: "SINGLE_PERSON_IN_VAULT",
        },
      });

      expect(result.event.status).toBe("accepted");
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0]!.title).toBe("Dual control violation detected");
      expect(result.alerts[0]!.description).toBe(
        "Single person detected in vault area. Dual control policy requires minimum 2 authorized persons."
      );
    });
  });

  describe("ensureCameraAiBundle provisioning", () => {
    it("disables dual-control-verification on non-vault cameras", async () => {
      const store = new MemoryStore();
      const entranceCam = addCameraToStore(store, {
        name: "Lobby Front Door",
        channel: 1,
      });

      await ensureCameraAiBundle(store, "omsystems", entranceCam.id);
      const rules = await store.listAnalyticsRules(entranceCam.id);
      const dcRule = rules.find((r) => r.detectionType === "dual-control-verification");
      expect(dcRule).toBeDefined();
      expect(dcRule!.enabled).toBe(false);
    });

    it("enables dual-control-verification on vault cameras", async () => {
      const store = new MemoryStore();
      const vaultCam = addCameraToStore(store, {
        name: "Vault Safe Deposit Lockers",
        channel: 8,
      });

      await ensureCameraAiBundle(store, "omsystems", vaultCam.id);
      const rules = await store.listAnalyticsRules(vaultCam.id);
      const dcRule = rules.find((r) => r.detectionType === "dual-control-verification");
      expect(dcRule).toBeDefined();
      expect(dcRule!.enabled).toBe(true);
    });
  });
});
