import { describe, it, expect, beforeEach } from "vitest";
import { NbfcRuleRepository } from "../src/analytics/nbfc-rule-repository.js";
import { NbfcRuleEngineService } from "../src/analytics/nbfc-rule-engine.service.js";
import {
  sortedMatchingRules,
  analyticsAlertTitle,
  analyticsAlertDescription,
  eventDetectionTypes,
} from "../src/analytics/rule-engine.js";
import { RuleEngine as AnomalyRuleEngine } from "../src/security-commander/anomaly/detection-rules.js";
import type { SecurityEvent } from "../src/security-commander/types/security-event.types.js";
import type { AnalyticsRule as CoreAnalyticsRule } from "../src/domain/models.js";
import type { AnalyticsEventInput } from "../src/control-plane-store.js";

describe("Locker / Vault Maximum Occupancy Rule (tmpl-01)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Registration", () => {
    it("retrieves tmpl-01-locker-max-occupancy directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-01-locker-max-occupancy");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-01-locker-max-occupancy");
      expect(templateDirect?.name).toBe("Locker / Vault Maximum Occupancy");
      expect(templateDirect?.category).toBe("VAULT_LOCKER");
      expect(templateDirect?.detectorType).toBe("person");
      expect(templateDirect?.defaultSeverity).toBe("CRITICAL");
      expect(templateDirect?.defaultDurationMs).toBe(5000);
      expect(templateDirect?.defaultCooldownMs).toBe(60000);
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("CREATE_INCIDENT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_SNAPSHOT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_EVIDENCE_CLIP");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_SOC");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_BRANCH_MANAGER");
      expect(templateDirect?.suggestedSchedule).toBe("BUSINESS_HOURS");
      expect(templateDirect?.recommendedZoneTypes).toContain("LOCKER");
      expect(templateDirect?.recommendedZoneTypes).toContain("STRONG_ROOM");
      expect(templateDirect?.recommendedZoneTypes).toContain("RESTRICTED_AREA");

      // Aliases
      const templateByName = await repository.getTemplate("Locker / Vault Maximum Occupancy");
      expect(templateByName).toBeDefined();
      expect(templateByName?.id).toBe("tmpl-01-locker-max-occupancy");

      const shortAlias = await repository.getTemplate("locker-max-occupancy");
      expect(shortAlias).toBeDefined();
      expect(shortAlias?.id).toBe("tmpl-01-locker-max-occupancy");

      const numAlias = await repository.getTemplate("tmpl-01");
      expect(numAlias).toBeDefined();
      expect(numAlias?.id).toBe("tmpl-01-locker-max-occupancy");

      const vaultOccupancyAlias = await repository.getTemplate("vault-occupancy");
      expect(vaultOccupancyAlias).toBeDefined();
      expect(vaultOccupancyAlias?.id).toBe("tmpl-01-locker-max-occupancy");

      const vaultMaxAlias = await repository.getTemplate("vault-max-occupancy");
      expect(vaultMaxAlias).toBeDefined();
      expect(vaultMaxAlias?.id).toBe("tmpl-01-locker-max-occupancy");

      const maxOccupancyAlias = await repository.getTemplate("max-occupancy");
      expect(maxOccupancyAlias).toBeDefined();
      expect(maxOccupancyAlias?.id).toBe("tmpl-01-locker-max-occupancy");
    });

    it("verifies template metadata configuration for vault occupancy policy", async () => {
      const template = await repository.getTemplate("tmpl-01-locker-max-occupancy");
      expect(template?.metadata).toBeDefined();
      expect(template?.metadata?.complianceTag).toBe("NBFC_VAULT_OCCUPANCY_POLICY");
      expect(template?.metadata?.targetMetrics).toEqual(["person_count", "occupancy", "vault_occupancy"]);
      expect(template?.metadata?.maxAllowedOccupancy).toBe(2);
      expect(template?.metadata?.requiresIncident).toBe(true);
      expect(template?.metadata?.serviceArea).toBe("VAULT_LOCKER");
      expect(template?.metadata?.securityLevel).toBe("HIGH_SECURITY");
    });

    it("registers locker and vault occupancy detectors in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const lockerModel = models.find((m) => m.detector === "locker-occupancy");
      const vaultModel = models.find((m) => m.detector === "vault-occupancy");
      const maxModel = models.find((m) => m.detector === "max-occupancy");

      expect(lockerModel).toBeDefined();
      expect(lockerModel?.model).toBe("YOLOv8n-COCO (ONNX)");
      expect(lockerModel?.status).toBe("PRODUCTION_READY");

      expect(vaultModel).toBeDefined();
      expect(vaultModel?.model).toBe("YOLOv8n-COCO (ONNX)");
      expect(vaultModel?.status).toBe("PRODUCTION_READY");

      expect(maxModel).toBeDefined();
      expect(maxModel?.model).toBe("YOLOv8n-COCO (ONNX)");
      expect(maxModel?.status).toBe("PRODUCTION_READY");
    });
  });

  describe("Metric Resolution: person_count and occupancy aliases", () => {
    it("resolves direct numeric person count and occupancy aliases", () => {
      // Direct person_count
      expect(
        (ruleEngine as any).resolveMetricValue({ person_count: 3 }, "person_count")
      ).toBe(3);

      // Nested metadata unwrap
      expect(
        (ruleEngine as any).resolveMetricValue({ metadata: { person_count: 4 } }, "person_count")
      ).toBe(4);

      // vault_occupancy alias
      expect(
        (ruleEngine as any).resolveMetricValue({ vault_occupancy: 3 }, "person_count")
      ).toBe(3);

      // locker_occupancy alias
      expect(
        (ruleEngine as any).resolveMetricValue({ locker_occupancy: 5 }, "person_count")
      ).toBe(5);

      // head_count alias
      expect(
        (ruleEngine as any).resolveMetricValue({ head_count: 3 }, "person_count")
      ).toBe(3);

      // max_occupancy alias
      expect(
        (ruleEngine as any).resolveMetricValue({ max_occupancy: 4 }, "person_count")
      ).toBe(4);

      // occupancy alias
      expect(
        (ruleEngine as any).resolveMetricValue({ occupancy: 3 }, "person_count")
      ).toBe(3);

      // String to numeric conversion
      expect(
        (ruleEngine as any).resolveMetricValue({ person_count: "3" }, "person_count")
      ).toBe(3);
    });
  });

  describe("Rule Engine Lifecycle: Evaluation, Persistence, and Incident Actions", () => {
    it("evaluates over-occupancy with 5000ms duration delay and fires active alert with incident", async () => {
      const template = await repository.getTemplate("tmpl-01-locker-max-occupancy");
      expect(template).toBeDefined();

      const rule = {
        id: "rule-vault-occ-1",
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        templateId: template!.id,
        name: template!.name,
        enabled: true,
        severity: template!.defaultSeverity,
        condition: template!.defaultCondition,
        durationMs: template!.defaultDurationMs,
        cooldownMs: template!.defaultCooldownMs,
        actions: template!.defaultActions,
        schedule: { enabled: false },
        zones: ["VAULT_ROOM"],
        detectorType: template!.detectorType,
      };

      const start = new Date("2026-10-24T10:00:00.000Z");

      // T=0: 3 persons detected in vault (exceeds threshold 2)
      const res1 = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "VAULT_ROOM",
        timestamp: start,
        metrics: { person_count: 3 },
      });

      // Condition met but pending 5000ms duration window
      expect(res1.conditionMet).toBe(true);
      expect(res1.status).toBe("CONDITION_MET_PENDING_DURATION");
      expect(res1.actions).toEqual([]);

      // T=2000ms: still over occupancy, duration not yet elapsed (2000ms < 5000ms)
      const t2 = new Date(start.getTime() + 2000);
      const res2 = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "VAULT_ROOM",
        timestamp: t2,
        metrics: { person_count: 3 },
      });
      expect(res2.conditionMet).toBe(true);
      expect(res2.status).toBe("CONDITION_MET_PENDING_DURATION");
      expect(res2.actions).toEqual([]);

      // T=6000ms: duration elapsed (6000ms >= 5000ms) -> transitions to ACTIVE_ALERTING
      const t3 = new Date(start.getTime() + 6000);
      const res3 = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "VAULT_ROOM",
        timestamp: t3,
        metrics: { person_count: 3 },
      });
      expect(res3.conditionMet).toBe(true);
      expect(res3.status).toBe("ACTIVE_ALERTING");
      expect(res3.actions).toContain("CREATE_ALERT");
      expect(res3.actions).toContain("CREATE_INCIDENT");
      expect(res3.actions).toContain("CAPTURE_SNAPSHOT");
      expect(res3.actions).toContain("CAPTURE_EVIDENCE_CLIP");
      expect(res3.actions).toContain("NOTIFY_SOC");
      expect(res3.actions).toContain("NOTIFY_BRANCH_MANAGER");

      // T=8000ms: count drops back to 2 (authorized dual custody limit) -> transitions to RESOLVED
      const t4 = new Date(start.getTime() + 8000);
      const res4 = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "VAULT_ROOM",
        timestamp: t4,
        metrics: { person_count: 2 },
      });
      expect(res4.conditionMet).toBe(false);
      expect(res4.status).toBe("RESOLVED");
    });
  });

  describe("Core Rule Engine Integration: Detection Types, Alert Titles & Descriptions", () => {
    it("maps occupancy detection types correctly in eventDetectionTypes", () => {
      const event: AnalyticsEventInput = {
        eventId: "evt-vault-occ-01",
        cameraId: "cam-vault-01",
        detectionType: "vault-occupancy",
        confidence: 0.95,
        durationSeconds: 0,
        occurredAt: "2026-10-24T00:00:00Z",
        objects: [],
      };

      const types = eventDetectionTypes(event);
      expect(types).toContain("vault-occupancy");
      expect(types).toContain("occupancy");
      expect(types).toContain("locker-occupancy");
      expect(types).toContain("max-occupancy");
      expect(types).toContain("person");
    });

    it("matches core rule with empty objects array due to whitelist", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-vault-max-occ",
        name: "Locker / Vault Maximum Occupancy",
        cameraId: "cam-vault-01",
        detectionType: "vault-occupancy",
        objectClasses: ["person"],
        minConfidence: 0.8,
        minDurationSeconds: 0,
        severity: "P1",
        direction: "any",
        enabled: true,
        deleted: false,
        actions: ["alert"],
        cooldownSeconds: 60,
      };

      const event: AnalyticsEventInput = {
        eventId: "evt-vault-occ-02",
        cameraId: "cam-vault-01",
        detectionType: "vault-occupancy",
        confidence: 0.95,
        durationSeconds: 0,
        occurredAt: "2026-10-24T00:00:00Z",
        objects: [],
        metadata: {
          person_count: 3,
        },
      };

      const matched = sortedMatchingRules([rule], event);
      expect(matched.length).toBe(1);
      expect(matched[0].id).toBe("rule-vault-max-occ");
    });

    it("generates correct alert title and informative description", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-vault-max-occ",
        name: "Locker / Vault Maximum Occupancy",
        cameraId: "cam-vault-01",
        detectionType: "vault-occupancy",
        objectClasses: ["person"],
        minConfidence: 0.8,
        minDurationSeconds: 0,
        severity: "P1",
        direction: "any",
        enabled: true,
        deleted: false,
        actions: ["alert"],
        cooldownSeconds: 60,
      };

      const title = analyticsAlertTitle(rule);
      expect(title).toBe("Critical Alert: Locker / Vault Maximum Occupancy Exceeded");

      const description = analyticsAlertDescription(rule, {
        zoneName: "Main Branch Strong Room Vault",
        person_count: 3,
        maxAllowedOccupancy: 2,
      });

      expect(description).toContain("Maximum allowable occupancy exceeded inside Main Branch Strong Room Vault");
      expect(description).toContain("3 persons present");
      expect(description).toContain("authorized limit: 2 persons");
      expect(description).toContain("dual-custody audit required");
    });
  });

  describe("Security Commander Anomaly Rule: locker-vault-max-occupancy", () => {
    let anomalyEngine: AnomalyRuleEngine;

    beforeEach(() => {
      anomalyEngine = new AnomalyRuleEngine();
    });

    it("triggers anomaly rule for ai.vault_occupancy event type", () => {
      const event: SecurityEvent = {
        id: "evt-001",
        type: "ai.vault_occupancy",
        severity: "critical",
        source: "analytics-engine",
        timestamp: new Date().toISOString(),
        metadata: {
          person_count: 3,
        },
      };

      const evalResult = anomalyEngine.evaluate(event);
      const ruleMatch = evalResult.matchedRules.find((m) => m.rule.id === "locker-vault-max-occupancy");
      expect(ruleMatch).toBeDefined();
      expect(ruleMatch?.score).toBe(0.9);
      expect(ruleMatch?.reason).toBe("Maximum allowable occupancy exceeded inside locker or vault strong room");
    });

    it("triggers anomaly rule when max_occupancy_exceeded is true", () => {
      const event: SecurityEvent = {
        id: "evt-002",
        type: "security.zone.alert",
        severity: "critical",
        source: "analytics-engine",
        timestamp: new Date().toISOString(),
        metadata: {
          max_occupancy_exceeded: true,
          person_count: 3,
        },
      };

      const evalResult = anomalyEngine.evaluate(event);
      const ruleMatch = evalResult.matchedRules.find((m) => m.rule.id === "locker-vault-max-occupancy");
      expect(ruleMatch).toBeDefined();
      expect(ruleMatch?.score).toBe(0.9);
    });

    it("triggers anomaly rule when zoneType is LOCKER or VAULT and person_count > 2", () => {
      const event: SecurityEvent = {
        id: "evt-003",
        type: "sensor.zone.occupancy",
        severity: "warning",
        source: "analytics-engine",
        timestamp: new Date().toISOString(),
        metadata: {
          zoneType: "LOCKER_ROOM",
          person_count: 3,
        },
      };

      const evalResult = anomalyEngine.evaluate(event);
      const ruleMatch = evalResult.matchedRules.find((m) => m.rule.id === "locker-vault-max-occupancy");
      expect(ruleMatch).toBeDefined();
      expect(ruleMatch?.score).toBe(0.9);
    });

    it("does not trigger anomaly rule when occupancy within allowed limit (<= 2)", () => {
      const event: SecurityEvent = {
        id: "evt-004",
        type: "sensor.zone.occupancy",
        severity: "info",
        source: "analytics-engine",
        timestamp: new Date().toISOString(),
        metadata: {
          zoneType: "STRONG_ROOM",
          person_count: 2,
        },
      };

      const evalResult = anomalyEngine.evaluate(event);
      const ruleMatch = evalResult.matchedRules.find((m) => m.rule.id === "locker-vault-max-occupancy");
      expect(ruleMatch).toBeUndefined();
    });
  });
});
