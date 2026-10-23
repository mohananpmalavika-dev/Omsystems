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

describe("Customer Queue Length SLA Rule", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Instantiation", () => {
    it("retrieves tmpl-05-customer-queue-length directly by ID", async () => {
      const template = await repository.getTemplate("tmpl-05-customer-queue-length");
      expect(template).toBeDefined();
      expect(template?.id).toBe("tmpl-05-customer-queue-length");
      expect(template?.name).toBe("Customer Queue Length SLA");
      expect(template?.category).toBe("CASH_OPERATIONS");
      expect(template?.detectorType).toBe("queue");
      expect(template?.defaultCondition).toEqual({
        metric: "queue_length",
        operator: "GREATER_THAN",
        value: 8,
      });
    });

    it("retrieves template using normalized target alias 'queue-length'", async () => {
      const template = await repository.getTemplate("queue-length");
      expect(template).toBeDefined();
      expect(template?.id).toBe("tmpl-05-customer-queue-length");
    });

    it("includes tmpl-05 when filtering templates by CASH_OPERATIONS category", async () => {
      const templates = await repository.listTemplates("CASH_OPERATIONS");
      const queueTemplate = templates.find((t) => t.id === "tmpl-05-customer-queue-length");
      expect(queueTemplate).toBeDefined();
      expect(queueTemplate?.name).toBe("Customer Queue Length SLA");
    });

    it("keeps default listTemplates() security-first library behavior intact", async () => {
      const templates = await repository.listTemplates();
      expect(templates.some((t) => t.id === "tmpl-05-customer-queue-length")).toBe(false);
      expect(templates.some((t) => t.id === "tmpl-11-restricted-zone-intrusion")).toBe(true);
    });

    it("successfully instantiates Customer Queue Length SLA into an active rule", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-05-customer-queue-length",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-counter-01"],
          zoneId: "zone-queue-01",
          durationMs: 120000,
        },
        "operations-lead"
      );

      expect(rule).toBeDefined();
      expect(rule.id).toBeDefined();
      expect(rule.name).toBe("Customer Queue Length SLA");
      expect(rule.category).toBe("CASH_OPERATIONS");
      expect(rule.detectorType).toBe("queue");
      expect(rule.durationMs).toBe(120000);
      expect(rule.condition).toEqual({
        metric: "queue_length",
        operator: "GREATER_THAN",
        value: 8,
      });
      expect(rule.enabled).toBe(true);
    });
  });

  describe("Rule Engine Evaluation & Metric Normalization", () => {
    it("does not trigger when queue length is within SLA (<= 8)", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-05-customer-queue-length",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-counter-01"],
          durationMs: 60000,
        }
      );

      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-counter-01",
        timestamp: new Date("2026-10-23T10:00:00Z"),
        metrics: { queue_length: 5 },
      });

      expect(result.conditionMet).toBe(false);
      expect(result.triggered).toBe(false);
      expect(result.alertRequired).toBe(false);
    });

    it("evaluates condition with camelCase currentQueueLength and enters pending duration", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-05-customer-queue-length",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-counter-01"],
          durationMs: 60000,
        }
      );

      const t0 = new Date("2026-10-23T10:00:00Z");
      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-counter-01",
        timestamp: t0,
        metrics: { currentQueueLength: 10 },
      });

      expect(result.conditionMet).toBe(true);
      expect(result.status).toBe("CONDITION_MET_PENDING_DURATION");
      expect(result.triggered).toBe(false);
    });

    it("evaluates condition with nested queues array", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-05-customer-queue-length",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-counter-01"],
          durationMs: 60000,
        }
      );

      const t0 = new Date("2026-10-23T10:00:00Z");
      const result = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-counter-01",
        timestamp: t0,
        metrics: {
          queues: [{ queueId: "q-1", currentQueueLength: 12 }],
        },
      });

      expect(result.conditionMet).toBe(true);
    });

    it("triggers alert after queue length exceeds SLA for durationMs, and respects cooldown", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-05-customer-queue-length",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-counter-01"],
          durationMs: 60000,
          cooldownMs: 300000,
        }
      );

      const t0 = new Date("2026-10-23T10:00:00Z");
      await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-counter-01",
        timestamp: t0,
        metrics: { queue_length: 11 },
      });

      // After 65 seconds (> 60s durationMs)
      const t1 = new Date("2026-10-23T10:01:05Z");
      const triggeredResult = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-counter-01",
        timestamp: t1,
        metrics: { queue_length: 12 },
      });

      expect(triggeredResult.conditionMet).toBe(true);
      expect(triggeredResult.triggered).toBe(true);
      expect(triggeredResult.isTriggered).toBe(true);
      expect(triggeredResult.status).toBe("ACTIVE_ALERTING");
      expect(triggeredResult.alertRequired).toBe(true);

      // Within cooldown window (2 minutes later < 5 minutes cooldown)
      const t2 = new Date("2026-10-23T10:03:00Z");
      const cooldownResult = await ruleEngine.evaluateRule(rule, {
        cameraId: "cam-counter-01",
        timestamp: t2,
        metrics: { queue_length: 14 },
      });

      expect(cooldownResult.conditionMet).toBe(true);
      expect(cooldownResult.status).toBe("COOLDOWN");
      expect(cooldownResult.alertRequired).toBe(false);
    });
  });

  describe("Core Rule Engine Integration & Alert Formatting", () => {
    it("maps queue detection types across aliases", () => {
      const event: AnalyticsEventInput = {
        tenantId: "tenant-01",
        cameraId: "cam-01",
        detectionType: "queue-length",
        confidence: 0.9,
        durationSeconds: 10,
        occurredAt: "2026-10-23T10:00:00Z",
        objects: [],
        metadata: { queueLength: 9 },
      };

      const types = eventDetectionTypes(event);
      expect(types).toContain("queue");
      expect(types).toContain("queue-length");
    });

    it("matches queue rules even when telemetry event has no object bounding boxes", () => {
      const coreRule: CoreAnalyticsRule = {
        id: "rule-queue-01",
        tenantId: "tenant-01",
        cameraId: "cam-01",
        name: "Customer Queue SLA",
        detectionType: "queue",
        objectClasses: ["person"],
        severity: "P2",
        confidence: 0.8,
        minConfidence: 0.7,
        minDurationSeconds: 5,
        cooldownSeconds: 120,
        enabled: true,
        direction: "any",
        createdAt: "2026-10-23T00:00:00Z",
        updatedAt: "2026-10-23T00:00:00Z",
      };

      const event: AnalyticsEventInput = {
        tenantId: "tenant-01",
        cameraId: "cam-01",
        detectionType: "queue",
        confidence: 0.95,
        durationSeconds: 10,
        occurredAt: "2026-10-23T10:00:00Z",
        objects: [],
        metadata: { queueLength: 10 },
      };

      const matches = sortedMatchingRules([coreRule], event);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe("rule-queue-01");
    });

    it("formats informative alert title and description for Customer Queue Length SLA", () => {
      const coreRule: CoreAnalyticsRule = {
        id: "rule-queue-01",
        tenantId: "tenant-01",
        cameraId: "cam-01",
        name: "Customer Queue Length SLA",
        detectionType: "queue",
        objectClasses: ["person"],
        severity: "P2",
        confidence: 0.8,
        minConfidence: 0.7,
        minDurationSeconds: 5,
        cooldownSeconds: 120,
        enabled: true,
        direction: "any",
        createdAt: "2026-10-23T00:00:00Z",
        updatedAt: "2026-10-23T00:00:00Z",
      };

      const title = analyticsAlertTitle(coreRule, { queueLength: 11 });
      const description = analyticsAlertDescription(coreRule, { queueLength: 11 });

      expect(title).toBe("Customer Queue Length SLA Breached");
      expect(description).toBe("Customer queue length (11) exceeded service SLA threshold.");
    });
  });
});
