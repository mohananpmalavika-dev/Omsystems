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

describe("Cash Counter Handover Event Rule (tmpl-22)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Instantiation", () => {
    it("retrieves tmpl-22-cash-counter-object directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-22-cash-counter-object");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-22-cash-counter-object");
      expect(templateDirect?.name).toBe("Cash Counter Handover Event");
      expect(templateDirect?.category).toBe("CASH_OPERATIONS");
      expect(templateDirect?.detectorType).toBe("object");
      expect(templateDirect?.defaultSeverity).toBe("INFO");
      expect(templateDirect?.defaultDurationMs).toBe(0);
      expect(templateDirect?.defaultActions).toContain("AUDIT_EVENT");

      const templateAlias1 = await repository.getTemplate("cash-counter-object");
      expect(templateAlias1).toBeDefined();
      expect(templateAlias1?.id).toBe("tmpl-22-cash-counter-object");

      const templateAlias2 = await repository.getTemplate("cash-counter-handover");
      expect(templateAlias2).toBeDefined();
      expect(templateAlias2?.id).toBe("tmpl-22-cash-counter-object");
    });

    it("lists tmpl-22 under CASH_OPERATIONS category", async () => {
      const cashTemplates = await repository.listTemplates("CASH_OPERATIONS");
      const found = cashTemplates.find((t) => t.id === "tmpl-22-cash-counter-object");
      expect(found).toBeDefined();
      expect(found?.name).toBe("Cash Counter Handover Event");
    });

    it("includes object and cash-handover detectors in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const objModel = models.find((m) => m.detector === "object");
      const handoverModel = models.find((m) => m.detector === "cash-handover");

      expect(objModel).toBeDefined();
      expect(objModel?.status).toBe("PRODUCTION_READY");
      expect(handoverModel).toBeDefined();
      expect(handoverModel?.status).toBe("PRODUCTION_READY");
    });

    it("instantiates rule preserving CASH_OPERATIONS category and AUDIT_EVENT action", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-22-cash-counter-object",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-counter-01"],
          zoneId: "zone-teller-tray-01",
        },
        "soc-admin"
      );

      expect(rule).toBeDefined();
      expect(rule.name).toBe("Cash Counter Handover Event");
      expect(rule.category).toBe("CASH_OPERATIONS");
      expect(rule.detectorType).toBe("object");
      expect(rule.severity).toBe("INFO");
      expect(rule.actions).toEqual(["AUDIT_EVENT"]);
      expect(rule.condition).toEqual({
        metric: "handover_event",
        operator: "EQUALS",
        value: true,
      });
    });
  });

  describe("Metric Resolution & Telemetry Ingestion", () => {
    it("evaluates handover events across multiple telemetry payload formats", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-22-cash-counter-object",
        "tenant-nbfc-01",
        {
          cameraIds: ["cam-counter-01"],
          zoneId: "zone-teller-tray-01",
        }
      );

      const businessTime = new Date("2026-03-24T06:00:00Z"); // 11:30 AM IST (Business hours)

      // 1. Direct snake_case handover_event
      const res1 = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-counter-01",
        zoneId: "zone-teller-tray-01",
        timestamp: businessTime,
        metrics: { handover_event: true },
      });
      expect(res1.conditionMet).toBe(true);
      expect(res1.triggered).toBe(true);
      expect(res1.alertRequired).toBe(false); // INFO level audit event doesn't trigger alarm flood
      expect(res1.auditEventRequired).toBe(true);

      // Clean runtime state
      await repository.saveRuntimeState({
        ruleId: rule.id,
        entityKey: "cam-counter-01",
        currentStatus: "IDLE",
        fencingToken: 0,
      });

      // 2. camelCase cashHandover
      const res2 = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-counter-01",
        zoneId: "zone-teller-tray-01",
        timestamp: businessTime,
        metrics: { cashHandover: true },
      });
      expect(res2.conditionMet).toBe(true);
      expect(res2.triggered).toBe(true);
      expect(res2.auditEventRequired).toBe(true);

      await repository.saveRuntimeState({
        ruleId: rule.id,
        entityKey: "cam-counter-01",
        currentStatus: "IDLE",
        fencingToken: 0,
      });

      // 3. Tray object detection alias: cash_pouch_detected
      const res3 = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-counter-01",
        zoneId: "zone-teller-tray-01",
        timestamp: businessTime,
        metrics: { cash_pouch_detected: true },
      });
      expect(res3.conditionMet).toBe(true);
      expect(res3.triggered).toBe(true);
      expect(res3.auditEventRequired).toBe(true);

      await repository.saveRuntimeState({
        ruleId: rule.id,
        entityKey: "cam-counter-01",
        currentStatus: "IDLE",
        fencingToken: 0,
      });

      // 4. Numeric handover_count > 0
      const res4 = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-counter-01",
        zoneId: "zone-teller-tray-01",
        timestamp: businessTime,
        metrics: { handover_count: 1 },
      });
      expect(res4.conditionMet).toBe(true);
      expect(res4.triggered).toBe(true);
      expect(res4.auditEventRequired).toBe(true);
    });

    it("does not trigger when no handover event has occurred", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-22-cash-counter-object",
        "tenant-nbfc-01",
        {
          cameraIds: ["cam-counter-01"],
          zoneId: "zone-teller-tray-01",
        }
      );

      const res = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-counter-01",
        zoneId: "zone-teller-tray-01",
        timestamp: new Date("2026-03-24T06:00:00Z"),
        metrics: { handover_event: false },
      });

      expect(res.conditionMet).toBe(false);
      expect(res.triggered).toBe(false);
      expect(res.auditEventRequired).toBe(false);
    });
  });

  describe("Core Rule Engine Integration", () => {
    const mockRule: CoreAnalyticsRule = {
      id: "rule-cash-handover-01",
      name: "Cash Counter Handover Event",
      enabled: true,
      detectionType: "object",
      severity: "P5",
      minConfidence: 0.7,
      minDurationSeconds: 0,
      objectClasses: ["cash_pouch"],
      direction: "any",
      schedules: [],
    };

    it("maps cash-handover and pouch-handover detection types to object rules", () => {
      const event: AnalyticsEventInput = {
        cameraId: "cam-counter-01",
        detectionType: "cash-handover",
        confidence: 0.88,
        durationSeconds: 1,
        occurredAt: new Date().toISOString(),
        objects: [],
      };

      const types = eventDetectionTypes(event);
      expect(types).toContain("cash-handover");
      expect(types).toContain("object");
    });

    it("matches objectClasses with pouch / bag / cash_pouch equivalence", () => {
      const event: AnalyticsEventInput = {
        cameraId: "cam-counter-01",
        detectionType: "object",
        confidence: 0.85,
        durationSeconds: 1,
        occurredAt: new Date().toISOString(),
        objects: [
          {
            label: "pouch",
            confidence: 0.85,
            box: { top: 100, left: 100, width: 50, height: 50 },
          },
        ],
      };

      const matched = sortedMatchingRules([mockRule], event);
      expect(matched.length).toBe(1);
      expect(matched[0].id).toBe("rule-cash-handover-01");
    });

    it("matches cash-handover events with empty objects array (sensor-driven)", () => {
      const event: AnalyticsEventInput = {
        cameraId: "cam-counter-01",
        detectionType: "cash-handover",
        confidence: 0.9,
        durationSeconds: 1,
        occurredAt: new Date().toISOString(),
        objects: [],
      };

      const matched = sortedMatchingRules([mockRule], event);
      expect(matched.length).toBe(1);
      expect(matched[0].id).toBe("rule-cash-handover-01");
    });

    it("generates informative audit title and transaction correlation description", () => {
      const title = analyticsAlertTitle(mockRule, {
        counterName: "Teller Counter 2 Tray",
      });
      expect(title).toBe("Cash Counter Handover Event Recorded");

      const desc = analyticsAlertDescription(mockRule, {
        counterName: "Teller Counter 2 Tray",
        itemType: "Cash Pouch",
      });
      expect(desc).toContain("Teller Counter 2 Tray");
      expect(desc).toContain("Cash Pouch placement detected");
      expect(desc).toContain("transaction audit correlation");
    });
  });
});
