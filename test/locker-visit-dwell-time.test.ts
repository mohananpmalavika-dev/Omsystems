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

describe("Excessive Locker Visit Dwell Time Rule (tmpl-35)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Instantiation", () => {
    it("retrieves tmpl-35-locker-dwell-time directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-35-locker-dwell-time");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-35-locker-dwell-time");
      expect(templateDirect?.name).toBe("Excessive Locker Visit Dwell Time");
      expect(templateDirect?.category).toBe("VAULT_LOCKER");
      expect(templateDirect?.detectorType).toBe("person");
      expect(templateDirect?.defaultSeverity).toBe("WARNING");
      expect(templateDirect?.defaultDurationMs).toBe(0);
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_BRANCH_MANAGER");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_SOC");

      const templateAlias = await repository.getTemplate("locker-dwell-time");
      expect(templateAlias).toBeDefined();
      expect(templateAlias?.id).toBe("tmpl-35-locker-dwell-time");
    });

    it("lists tmpl-35 under VAULT_LOCKER category", async () => {
      const vaultTemplates = await repository.listTemplates("VAULT_LOCKER");
      const found = vaultTemplates.find((t) => t.id === "tmpl-35-locker-dwell-time");
      expect(found).toBeDefined();
      expect(found?.name).toBe("Excessive Locker Visit Dwell Time");
    });

    it("includes locker-dwell detector in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const lockerModel = models.find((m) => m.detector === "locker-dwell");
      expect(lockerModel).toBeDefined();
      expect(lockerModel?.status).toBe("PRODUCTION_READY");
    });

    it("instantiates rule preserving VAULT_LOCKER category, conditions and actions", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-35-locker-dwell-time",
        "tenant-nbfc-01",
        {
          branchIds: ["branch-kollam-01"],
          cameraIds: ["cam-locker-01"],
          zoneId: "zone-locker-01",
        },
        "soc-admin"
      );

      expect(rule).toBeDefined();
      expect(rule.name).toBe("Excessive Locker Visit Dwell Time");
      expect(rule.category).toBe("VAULT_LOCKER");
      expect(rule.detectorType).toBe("person");
      expect(["WARNING", "MEDIUM"]).toContain(rule.severity);
      expect(rule.actions).toContain("CREATE_ALERT");
      expect(rule.actions).toContain("NOTIFY_BRANCH_MANAGER");
      expect(rule.actions).toContain("NOTIFY_SOC");
      expect(rule.condition).toEqual({
        metric: "locker_session_duration_seconds",
        operator: "GREATER_THAN",
        value: 900,
      });
    });
  });

  describe("Metric Resolution & Dwell Time Evaluation", () => {
    it("evaluates visit duration across diverse telemetry metric formats", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-35-locker-dwell-time",
        "tenant-nbfc-01",
        {
          cameraIds: ["cam-locker-01"],
          zoneId: "zone-locker-vault",
        }
      );

      const businessTime = new Date("2026-03-24T06:00:00Z"); // 11:30 AM IST (Business hours)

      // 1. Direct snake_case locker_session_duration_seconds (960s > 900s)
      const res1 = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-locker-01",
        zoneId: "zone-locker-vault",
        timestamp: businessTime,
        metrics: { locker_session_duration_seconds: 960 },
      });
      expect(res1.conditionMet).toBe(true);
      expect(res1.triggered).toBe(true);
      expect(res1.alertRequired).toBe(true);
      expect(res1.socNotificationRequired).toBe(true);
      expect(res1.branchManagerNotificationRequired).toBe(true);

      // Clean runtime state
      await repository.saveRuntimeState({
        ruleId: rule.id,
        entityKey: "cam-locker-01",
        currentStatus: "IDLE",
        fencingToken: 0,
      });

      // 2. camelCase lockerSessionDurationSeconds (1020s > 900s)
      const res2 = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-locker-01",
        zoneId: "zone-locker-vault",
        timestamp: businessTime,
        metrics: { lockerSessionDurationSeconds: 1020 },
      });
      expect(res2.conditionMet).toBe(true);
      expect(res2.triggered).toBe(true);

      await repository.saveRuntimeState({
        ruleId: rule.id,
        entityKey: "cam-locker-01",
        currentStatus: "IDLE",
        fencingToken: 0,
      });

      // 3. Common dwell_time_seconds alias from video analytics tracker (980s > 900s)
      const res3 = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-locker-01",
        zoneId: "zone-locker-vault",
        timestamp: businessTime,
        metrics: { dwell_time_seconds: 980 },
      });
      expect(res3.conditionMet).toBe(true);
      expect(res3.triggered).toBe(true);

      await repository.saveRuntimeState({
        ruleId: rule.id,
        entityKey: "cam-locker-01",
        currentStatus: "IDLE",
        fencingToken: 0,
      });

      // 4. sessionStartTime timestamp calculation (started 18 minutes ago)
      const eighteenMinsAgo = new Date(businessTime.getTime() - 18 * 60 * 1000).toISOString();
      const res4 = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-locker-01",
        zoneId: "zone-locker-vault",
        timestamp: businessTime,
        metrics: { sessionStartTime: eighteenMinsAgo },
      });
      expect(res4.conditionMet).toBe(true);
      expect(res4.triggered).toBe(true);
    });

    it("does not trigger when locker visit duration is within 15-minute SLA (<= 900s)", async () => {
      const rule = await repository.instantiateTemplate(
        "tmpl-35-locker-dwell-time",
        "tenant-nbfc-01",
        {
          cameraIds: ["cam-locker-01"],
          zoneId: "zone-locker-vault",
        }
      );

      const res = await ruleEngine.evaluateRule(rule, {
        tenantId: "tenant-nbfc-01",
        cameraId: "cam-locker-01",
        zoneId: "zone-locker-vault",
        timestamp: new Date("2026-03-24T06:00:00Z"),
        metrics: { locker_session_duration_seconds: 480 }, // 8 minutes
      });

      expect(res.conditionMet).toBe(false);
      expect(res.triggered).toBe(false);
      expect(res.alertRequired).toBe(false);
      expect(res.branchManagerNotificationRequired).toBe(false);
    });
  });

  describe("Core Rule Engine Integration", () => {
    const mockRule: CoreAnalyticsRule = {
      id: "rule-locker-dwell-01",
      name: "Excessive Locker Visit Dwell Time",
      enabled: true,
      detectionType: "person",
      severity: "P3",
      minConfidence: 0.8,
      minDurationSeconds: 0,
      objectClasses: [],
      direction: "any",
      schedules: [],
    };

    it("maps locker-dwell and locker-session detection types to person rules", () => {
      const event: AnalyticsEventInput = {
        cameraId: "cam-locker-01",
        detectionType: "locker-dwell",
        confidence: 0.92,
        durationSeconds: 960,
        occurredAt: new Date().toISOString(),
        objects: [],
      };

      const types = eventDetectionTypes(event);
      expect(types).toContain("locker-dwell");
      expect(types).toContain("person");
      expect(types).toContain("zone");
    });

    it("matches locker dwell events even when objects array is empty", () => {
      const event: AnalyticsEventInput = {
        cameraId: "cam-locker-01",
        detectionType: "locker-dwell",
        confidence: 0.92,
        durationSeconds: 960,
        occurredAt: new Date().toISOString(),
        objects: [],
      };

      const matched = sortedMatchingRules([mockRule], event);
      expect(matched.length).toBe(1);
      expect(matched[0].id).toBe("rule-locker-dwell-01");
    });

    it("generates clear alert title and rich explanatory description", () => {
      const title = analyticsAlertTitle(mockRule, {
        locker_session_duration_seconds: 1080, // 18 minutes
        zoneName: "Main Strong-Room Locker Vault",
      });
      expect(title).toBe("Excessive Locker Visit Dwell Time Exceeded");

      const desc = analyticsAlertDescription(mockRule, {
        locker_session_duration_seconds: 1080,
        zoneName: "Main Strong-Room Locker Vault",
      });
      expect(desc).toContain("Main Strong-Room Locker Vault");
      expect(desc).toContain("reached 18 minutes");
      expect(desc).toContain("exceeding maximum 15-minute operating threshold");
    });
  });
});
