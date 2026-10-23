import { describe, it, expect, beforeEach } from "vitest";
import { NbfcRuleRepository } from "../src/analytics/nbfc-rule-repository.js";
import { NbfcRuleEngineService } from "../src/analytics/nbfc-rule-engine.service.js";
import {
  sortedMatchingRules,
  analyticsAlertTitle,
  analyticsAlertDescription,
  eventDetectionTypes,
} from "../src/analytics/rule-engine.js";
import type { AnalyticsRule as CoreAnalyticsRule } from "../src/domain/models.js";
import type { AnalyticsEventInput } from "../src/control-plane-store.js";

describe("Camera Offline in Business Hours Rule (tmpl-16)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Registration", () => {
    it("retrieves tmpl-16-camera-offline-business-hours directly and via normalized aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-16-camera-offline-business-hours");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-16-camera-offline-business-hours");
      expect(templateDirect?.name).toBe("Camera Offline in Business Hours");
      expect(templateDirect?.category).toBe("HARDWARE_CONTINUITY");
      expect(templateDirect?.detectorType).toBe("health");
      expect(templateDirect?.defaultSeverity).toBe("CRITICAL");
      expect(templateDirect?.defaultDurationMs).toBe(30000);
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("CREATE_INCIDENT");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_SOC");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_BRANCH_MANAGER");
      expect(templateDirect?.suggestedSchedule).toBe("BUSINESS_HOURS");
      expect(templateDirect?.recommendedZoneTypes).toContain("ALL");

      const templateAlias = await repository.getTemplate("Camera Offline in Business Hours");
      expect(templateAlias).toBeDefined();
      expect(templateAlias?.id).toBe("tmpl-16-camera-offline-business-hours");

      const shortAlias = await repository.getTemplate("camera-offline-business-hours");
      expect(shortAlias).toBeDefined();
      expect(shortAlias?.id).toBe("tmpl-16-camera-offline-business-hours");
    });

    it("lists tmpl-16 under HARDWARE_CONTINUITY category", async () => {
      const hwTemplates = await repository.listTemplates("HARDWARE_CONTINUITY");
      const found = hwTemplates.find((t) => t.id === "tmpl-16-camera-offline-business-hours");
      expect(found).toBeDefined();
      expect(found?.name).toBe("Camera Offline in Business Hours");
    });

    it("includes health and camera-offline detectors in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const healthModel = models.find((m) => m.detector === "health");
      const camHealthModel = models.find((m) => m.detector === "CAMERA_HEALTH");
      const camOfflineModel = models.find((m) => m.detector === "camera-offline");

      expect(healthModel).toBeDefined();
      expect(healthModel?.status).toBe("PRODUCTION_READY");
      expect(camHealthModel).toBeDefined();
      expect(camOfflineModel).toBeDefined();
    });
  });

  describe("Metric Resolution & Aliasing", () => {
    it("resolves various offline telemetry formats to OFFLINE", () => {
      expect(ruleEngine.resolveMetricValue({ health_status: "OFFLINE" }, "health_status")).toBe("OFFLINE");
      expect(ruleEngine.resolveMetricValue({ health_status: "offline" }, "health_status")).toBe("OFFLINE");
      expect(ruleEngine.resolveMetricValue({ healthStatus: "down" }, "health_status")).toBe("OFFLINE");
      expect(ruleEngine.resolveMetricValue({ camera_status: "disconnected" }, "health_status")).toBe("OFFLINE");
      expect(ruleEngine.resolveMetricValue({ status: "unreachable" }, "health_status")).toBe("OFFLINE");
      expect(ruleEngine.resolveMetricValue({ is_online: false }, "health_status")).toBe("OFFLINE");
      expect(ruleEngine.resolveMetricValue({ online: false }, "health_status")).toBe("OFFLINE");
      expect(ruleEngine.resolveMetricValue({ isOffline: true }, "health_status")).toBe("OFFLINE");
      expect(ruleEngine.resolveMetricValue({ heartbeat_lost: true }, "health_status")).toBe("OFFLINE");
      expect(ruleEngine.resolveMetricValue({ ping_loss: 100 }, "health_status")).toBe("OFFLINE");
      expect(ruleEngine.resolveMetricValue({ ping_status: "failed" }, "health_status")).toBe("OFFLINE");
    });

    it("resolves healthy/online telemetry formats to ONLINE", () => {
      expect(ruleEngine.resolveMetricValue({ health_status: "ONLINE" }, "health_status")).toBe("ONLINE");
      expect(ruleEngine.resolveMetricValue({ healthStatus: "healthy" }, "health_status")).toBe("ONLINE");
      expect(ruleEngine.resolveMetricValue({ camera_status: "up" }, "health_status")).toBe("ONLINE");
      expect(ruleEngine.resolveMetricValue({ status: "connected" }, "health_status")).toBe("ONLINE");
      expect(ruleEngine.resolveMetricValue({ is_online: true }, "health_status")).toBe("ONLINE");
      expect(ruleEngine.resolveMetricValue({ online: true }, "health_status")).toBe("ONLINE");
    });

    it("resolves offline duration metrics across multiple aliases", () => {
      expect(ruleEngine.resolveMetricValue({ offline_duration_seconds: 45 }, "offline_duration_seconds")).toBe(45);
      expect(ruleEngine.resolveMetricValue({ offlineDurationSeconds: 60 }, "offline_duration_seconds")).toBe(60);
      expect(ruleEngine.resolveMetricValue({ offline_seconds: 35 }, "offline_duration_seconds")).toBe(35);
      expect(ruleEngine.resolveMetricValue({ downtime_seconds: 50 }, "offline_duration_seconds")).toBe(50);
      expect(ruleEngine.resolveMetricValue({ offlineDurationMs: 90000 }, "offline_duration_seconds")).toBe(90);
      expect(ruleEngine.resolveMetricValue({ downtime: 45000 }, "offline_duration_seconds")).toBe(45);
    });
  });

  describe("Rule Evaluation & State Lifecycle", () => {
    // Tuesday 11:30 AM IST (06:00:00 UTC) -> active business hours
    const businessHoursTime = new Date("2026-03-24T06:00:00Z");
    // Sunday 11:30 AM IST (06:00:00 UTC) -> non-business day
    const sundayTime = new Date("2026-03-22T06:00:00Z");

    it("triggers alert immediately during business hours when offline duration meets threshold", async () => {
      const template = await repository.getTemplate("tmpl-16-camera-offline-business-hours");
      expect(template).toBeDefined();

      const rule = {
        id: "rule-cam-offline-01",
        tenantId: "tenant-001",
        branchId: "branch-001",
        name: "Camera Offline in Business Hours",
        templateId: template!.id,
        category: template!.category,
        detectorType: template!.detectorType,
        condition: template!.defaultCondition,
        durationMs: template!.defaultDurationMs,
        severity: template!.defaultSeverity,
        cooldownMs: template!.defaultCooldownMs,
        actions: template!.defaultActions,
        schedule: { type: "BUSINESS_HOURS", timezone: "Asia/Kolkata" },
        enabled: true,
        state: "ACTIVE" as const,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-lobby-01",
        timestamp: businessHoursTime,
        metrics: {
          health_status: "OFFLINE",
          offline_duration_seconds: 35, // exceeds 30s threshold
        },
      });

      expect(result.conditionMet).toBe(true);
      expect(result.triggered).toBe(true);
      expect(result.alertRequired).toBe(true);
      expect(result.incidentRequired).toBe(true);
      expect(result.socNotificationRequired).toBe(true);
      expect(result.branchManagerNotificationRequired).toBe(true);
      expect(result.severity).toBe("CRITICAL");
    });

    it("transitions to CONDITION_MET_PENDING_DURATION when duration is below threshold", async () => {
      const template = await repository.getTemplate("tmpl-16-camera-offline-business-hours");
      expect(template).toBeDefined();

      const rule = {
        id: "rule-cam-offline-02",
        tenantId: "tenant-001",
        branchId: "branch-001",
        name: "Camera Offline in Business Hours",
        templateId: template!.id,
        category: template!.category,
        detectorType: template!.detectorType,
        condition: template!.defaultCondition,
        durationMs: 30000,
        severity: template!.defaultSeverity,
        cooldownMs: template!.defaultCooldownMs,
        actions: template!.defaultActions,
        schedule: { type: "BUSINESS_HOURS", timezone: "Asia/Kolkata" },
        enabled: true,
        state: "ACTIVE" as const,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-locker-01",
        timestamp: businessHoursTime,
        metrics: {
          health_status: "OFFLINE",
        },
      });

      expect(result.conditionMet).toBe(true);
      expect(result.triggered).toBe(false);
      expect(result.status).toBe("CONDITION_MET_PENDING_DURATION");
      expect(result.alertRequired).toBe(false);
    });

    it("suppresses evaluation when outside business hours (e.g. on Sunday)", async () => {
      const template = await repository.getTemplate("tmpl-16-camera-offline-business-hours");
      expect(template).toBeDefined();

      const rule = {
        id: "rule-cam-offline-03",
        tenantId: "tenant-001",
        branchId: "branch-001",
        name: "Camera Offline in Business Hours",
        templateId: template!.id,
        category: template!.category,
        detectorType: template!.detectorType,
        condition: template!.defaultCondition,
        durationMs: 30000,
        severity: template!.defaultSeverity,
        cooldownMs: template!.defaultCooldownMs,
        actions: template!.defaultActions,
        schedule: { type: "BUSINESS_HOURS", timezone: "Asia/Kolkata" },
        enabled: true,
        state: "ACTIVE" as const,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-cash-01",
        timestamp: sundayTime, // Sunday is closed
        metrics: {
          health_status: "OFFLINE",
          offline_duration_seconds: 60,
        },
      });

      expect(result.conditionMet).toBe(false);
      expect(result.triggered).toBe(false);
      expect(result.status).toBe("SCHEDULE_INACTIVE");
      expect(result.alertRequired).toBe(false);
    });

    it("transitions state to RESOLVED when camera comes back online", async () => {
      const template = await repository.getTemplate("tmpl-16-camera-offline-business-hours");

      const rule = {
        id: "rule-cam-offline-04",
        tenantId: "tenant-001",
        branchId: "branch-001",
        name: "Camera Offline in Business Hours",
        templateId: template!.id,
        category: template!.category,
        detectorType: template!.detectorType,
        condition: template!.defaultCondition,
        durationMs: 30000,
        severity: template!.defaultSeverity,
        cooldownMs: template!.defaultCooldownMs,
        actions: template!.defaultActions,
        schedule: { type: "BUSINESS_HOURS", timezone: "Asia/Kolkata" },
        enabled: true,
        state: "ACTIVE" as const,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // First evaluation triggers alert
      await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-vault-01",
        timestamp: businessHoursTime,
        metrics: { health_status: "OFFLINE", offline_duration_seconds: 40 },
      });

      // Second evaluation: camera back ONLINE
      const resolvedResult = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-vault-01",
        timestamp: new Date(businessHoursTime.getTime() + 60000),
        metrics: { health_status: "ONLINE", is_online: true },
      });

      expect(resolvedResult.conditionMet).toBe(false);
      expect(resolvedResult.status).toBe("RESOLVED");
      expect(resolvedResult.triggered).toBe(false);
    });
  });

  describe("Core Rule Engine Integration", () => {
    const businessHoursTime = "2026-03-24T06:00:00.000Z";

    it("matches rule against events with detectionType health, camera-offline, and device-offline", () => {
      const rule: CoreAnalyticsRule = {
        id: "core-rule-health-01",
        name: "Camera Offline in Business Hours",
        detectionType: "health",
        severity: "P1",
        minConfidence: 0.5,
        minDurationSeconds: 0,
        cooldownSeconds: 60,
        direction: "any",
        objectClasses: [],
        enabled: true,
        deleted: false,
        actions: ["alarm"],
        schedule: {
          timezone: "Asia/Kolkata",
          start: "08:30",
          end: "17:30",
          days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        },
      };

      const eventHealth: AnalyticsEventInput = {
        eventId: "evt-health-01",
        detectionType: "health",
        confidence: 0.95,
        durationSeconds: 30,
        occurredAt: businessHoursTime,
        objects: [],
        metadata: { cameraName: "Cash Counter Cam 2", status: "OFFLINE" },
      };

      const matchesHealth = sortedMatchingRules([rule], eventHealth);
      expect(matchesHealth.length).toBe(1);
      expect(matchesHealth[0].id).toBe("core-rule-health-01");

      const eventCamOffline: AnalyticsEventInput = {
        eventId: "evt-cam-offline-02",
        detectionType: "camera-offline",
        confidence: 0.99,
        durationSeconds: 35,
        occurredAt: businessHoursTime,
        objects: [],
        metadata: { cameraName: "Vault Camera 1", status: "OFFLINE" },
      };

      const matchesOffline = sortedMatchingRules([rule], eventCamOffline);
      expect(matchesOffline.length).toBe(1);
    });

    it("generates correct alert title and informative description for camera offline", () => {
      const rule: CoreAnalyticsRule = {
        id: "core-rule-health-02",
        name: "Camera Offline in Business Hours",
        detectionType: "health",
        severity: "P1",
        minConfidence: 0.5,
        minDurationSeconds: 0,
        cooldownSeconds: 60,
        direction: "any",
        objectClasses: [],
        enabled: true,
        deleted: false,
        actions: ["alarm"],
      };

      const title = analyticsAlertTitle(rule);
      expect(title).toBe("Critical Alert: Camera Offline in Business Hours");

      const desc = analyticsAlertDescription(rule, {
        cameraName: "Main Entrance Shutter Camera",
        offline_duration_seconds: 45,
      });
      expect(desc).toContain("Main Entrance Shutter Camera dropped offline for 45s during active business hours");
      expect(desc).toContain("surveillance interrupted in violation of NBFC security SLA");
    });
  });
});
