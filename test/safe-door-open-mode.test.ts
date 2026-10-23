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

describe("Safe / Locker Door Open Mode Rule (tmpl-34)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Instantiation", () => {
    it("retrieves tmpl-34-safe-door-sensor-correlation directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-34-safe-door-sensor-correlation");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-34-safe-door-sensor-correlation");
      expect(templateDirect?.name).toBe("Safe / Locker Door Open Mode");
      expect(templateDirect?.category).toBe("VAULT_LOCKER");
      expect(templateDirect?.detectorType).toBe("zone");
      expect(templateDirect?.defaultSeverity).toBe("CRITICAL");
      expect(templateDirect?.defaultDurationMs).toBe(0);
      expect(templateDirect?.defaultActions).toContain("START_HIGH_PRIORITY_RECORDING");
      expect(templateDirect?.defaultActions).toContain("BOOKMARK_RECORDING");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_SOC");

      const templateAlias = await repository.getTemplate("safe-door");
      expect(templateAlias).toBeDefined();
      expect(templateAlias?.id).toBe("tmpl-34-safe-door-sensor-correlation");
    });

    it("includes safe-door detector in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const safeDoorModel = models.find((m) => m.detector === "safe-door");
      expect(safeDoorModel).toBeDefined();
      expect(safeDoorModel?.status).toBe("PRODUCTION_READY");
    });

    it("instantiates rule preserving VAULT_LOCKER category and critical actions", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-34-safe-door-sensor-correlation",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-vault-01"],
          zoneId: "zone-strong-room",
        },
        "soc-admin"
      );

      expect(rule).toBeDefined();
      expect(rule.name).toBe("Safe / Locker Door Open Mode");
      expect(rule.category).toBe("VAULT_LOCKER");
      expect(rule.severity).toBe("CRITICAL");
      expect(rule.actions).toContain("START_HIGH_PRIORITY_RECORDING");
      expect(rule.actions).toContain("BOOKMARK_RECORDING");
      expect(rule.actions).toContain("NOTIFY_SOC");
    });
  });

  describe("Rule Engine Evaluation & Metric Equivalence", () => {
    it("triggers immediately on standard safe_door_state: 'OPEN'", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-34-safe-door-sensor-correlation",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-vault-01"],
        }
      );

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-vault-01",
        timestamp: new Date("2026-10-23T10:00:00Z"),
        metrics: { safe_door_state: "OPEN" },
      });

      expect(result.conditionMet).toBe(true);
      expect(result.triggered).toBe(true);
      expect(result.isTriggered).toBe(true);
      expect(result.status).toBe("ACTIVE_ALERTING");
      expect(result.severity).toBe("CRITICAL");
      expect(result.alertRequired).toBe(true);
      expect(result.highPriorityRecordingRequired).toBe(true);
      expect(result.bookmarkRecordingRequired).toBe(true);
      expect(result.socNotificationRequired).toBe(true);
    });

    it("triggers on boolean and lowercase IoT sensor telemetry aliases", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-34-safe-door-sensor-correlation",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-vault-01"],
        }
      );

      // Boolean safe_door_open: true
      const boolResult = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-vault-01",
        timestamp: new Date("2026-10-23T10:00:00Z"),
        metrics: { safe_door_open: true },
      });
      expect(boolResult.conditionMet).toBe(true);

      // Lowercase string "open"
      const lowerResult = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-vault-01",
        timestamp: new Date("2026-10-23T10:01:00Z"),
        metrics: { door_state: "open" },
      });
      expect(lowerResult.conditionMet).toBe(true);

      // Vault door sensor alias
      const vaultResult = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-vault-01",
        timestamp: new Date("2026-10-23T10:02:00Z"),
        metrics: { vault_door_open: true },
      });
      expect(vaultResult.conditionMet).toBe(true);

      // Triggered contact sensor
      const sensorResult = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-vault-01",
        timestamp: new Date("2026-10-23T10:03:00Z"),
        metrics: { sensor_state: "TRIGGERED" },
      });
      expect(sensorResult.conditionMet).toBe(true);
    });

    it("does not trigger when safe door is closed", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-34-safe-door-sensor-correlation",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-vault-01"],
        }
      );

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-vault-01",
        timestamp: new Date("2026-10-23T10:00:00Z"),
        metrics: { safe_door_state: "CLOSED", safe_door_open: false },
      });

      expect(result.conditionMet).toBe(false);
      expect(result.triggered).toBe(false);
    });
  });

  describe("Core Rule Engine Integration & Alert Titles", () => {
    it("maps safe-door and door-open in eventDetectionTypes", () => {
      const event: AnalyticsEventInput = {
        tenantId: "tenant-01",
        cameraId: "cam-01",
        detectionType: "safe-door-open",
        confidence: 0.99,
        durationSeconds: 1,
        occurredAt: "2026-10-23T10:00:00Z",
        objects: [],
        metadata: { doorName: "Locker Door 01" },
      };

      const types = eventDetectionTypes(event);
      expect(types).toContain("safe-door");
      expect(types).toContain("zone");
    });

    it("matches sensor events even with empty objects array", () => {
      const coreRule: CoreAnalyticsRule = {
        id: "rule-safe-door-01",
        tenantId: "tenant-01",
        cameraId: "cam-01",
        name: "Safe / Locker Door Open Mode",
        detectionType: "safe-door",
        objectClasses: ["sensor"],
        severity: "P1",
        confidence: 0.8,
        minConfidence: 0.7,
        minDurationSeconds: 1,
        cooldownSeconds: 30,
        enabled: true,
        direction: "any",
        createdAt: "2026-10-23T00:00:00Z",
        updatedAt: "2026-10-23T00:00:00Z",
      };

      const event: AnalyticsEventInput = {
        tenantId: "tenant-01",
        cameraId: "cam-01",
        detectionType: "safe-door-open",
        confidence: 0.95,
        durationSeconds: 1,
        occurredAt: "2026-10-23T10:00:00Z",
        objects: [],
        metadata: {},
      };

      const matches = sortedMatchingRules([coreRule], event);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe("rule-safe-door-01");
    });

    it("formats high-security alert title and forensic recording description", () => {
      const coreRule: CoreAnalyticsRule = {
        id: "rule-safe-door-01",
        tenantId: "tenant-01",
        cameraId: "cam-01",
        name: "Safe / Locker Door Open Mode",
        detectionType: "safe-door",
        objectClasses: [],
        severity: "P1",
        confidence: 0.9,
        minConfidence: 0.7,
        minDurationSeconds: 1,
        cooldownSeconds: 30,
        enabled: true,
        direction: "any",
        createdAt: "2026-10-23T00:00:00Z",
        updatedAt: "2026-10-23T00:00:00Z",
      };

      const title = analyticsAlertTitle(coreRule, { doorName: "Vault Strong Room Safe Door" });
      const description = analyticsAlertDescription(coreRule, { doorName: "Vault Strong Room Safe Door" });

      expect(title).toBe("Safe / Locker Door Opened - Continuous Surveillance Active");
      expect(description).toContain("Vault Strong Room Safe Door opened");
      expect(description).toContain("Forensic high-priority continuous recording");
    });
  });
});
