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

describe("Unregistered Vehicle in Cash Bay Rule (tmpl-25)", () => {
  let repository: NbfcRuleRepository;
  let ruleEngine: NbfcRuleEngineService;

  beforeEach(() => {
    repository = new NbfcRuleRepository(null);
    ruleEngine = new NbfcRuleEngineService(repository);
  });

  describe("Template Retrieval & Registration", () => {
    it("retrieves tmpl-25-unknown-cash-van directly and via aliases", async () => {
      const templateDirect = await repository.getTemplate("tmpl-25-unknown-cash-van");
      expect(templateDirect).toBeDefined();
      expect(templateDirect?.id).toBe("tmpl-25-unknown-cash-van");
      expect(templateDirect?.name).toBe("Unregistered Vehicle in Cash Bay");
      expect(templateDirect?.category).toBe("ANPR_LOGISTICS");
      expect(templateDirect?.detectorType).toBe("anpr");
      expect(templateDirect?.defaultSeverity).toBe("HIGH");
      expect(templateDirect?.defaultDurationMs).toBe(10000);
      expect(templateDirect?.defaultCooldownMs).toBe(120000);
      expect(templateDirect?.defaultActions).toContain("CREATE_ALERT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_SNAPSHOT");
      expect(templateDirect?.defaultActions).toContain("CAPTURE_EVIDENCE_CLIP");
      expect(templateDirect?.defaultActions).toContain("CREATE_INCIDENT");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_BRANCH_MANAGER");
      expect(templateDirect?.defaultActions).toContain("NOTIFY_SOC");
      expect(templateDirect?.suggestedSchedule).toBe("24X7");
      expect(templateDirect?.recommendedZoneTypes).toContain("CASH_VAN_AREA");
      expect(templateDirect?.recommendedZoneTypes).toContain("RESTRICTED_AREA");

      // Aliases
      const templateByName = await repository.getTemplate("Unregistered Vehicle in Cash Bay");
      expect(templateByName).toBeDefined();
      expect(templateByName?.id).toBe("tmpl-25-unknown-cash-van");

      const shortAlias = await repository.getTemplate("unknown-cash-van");
      expect(shortAlias).toBeDefined();
      expect(shortAlias?.id).toBe("tmpl-25-unknown-cash-van");

      const numAlias = await repository.getTemplate("tmpl-25");
      expect(numAlias).toBeDefined();
      expect(numAlias?.id).toBe("tmpl-25-unknown-cash-van");

      const unregAlias = await repository.getTemplate("unregistered-vehicle");
      expect(unregAlias).toBeDefined();
      expect(unregAlias?.id).toBe("tmpl-25-unknown-cash-van");

      const cashBayAlias = await repository.getTemplate("cash-bay");
      expect(cashBayAlias).toBeDefined();
      expect(cashBayAlias?.id).toBe("tmpl-25-unknown-cash-van");
    });

    it("verifies template metadata configuration for cash logistics perimeter SLA", async () => {
      const template = await repository.getTemplate("tmpl-25-unknown-cash-van");
      expect(template?.metadata).toBeDefined();
      expect(template?.metadata?.complianceTag).toBe("NBFC_CASH_LOGISTICS_PERIMETER_SLA");
      expect(template?.metadata?.targetMetrics).toEqual(["vehicle_in_bay", "plate_authorized"]);
      expect(template?.metadata?.requiresIncident).toBe(true);
      expect(template?.metadata?.securityLevel).toBe("HIGH_PERIMETER");
      expect(template?.metadata?.supportedZones).toContain("CASH_VAN_AREA");
      expect(template?.metadata?.supportedZones).toContain("RESTRICTED_AREA");
    });

    it("registers ANPR and vehicle models in Model Registry", () => {
      const models = ruleEngine.getModelRegistry();
      const anprModel = models.find((m) => m.detector === "anpr");
      const vehicleModel = models.find((m) => m.detector === "vehicle");
      const cashVanModel = models.find((m) => m.detector === "cash-van");
      const unregModel = models.find((m) => m.detector === "unregistered-vehicle");

      expect(anprModel).toBeDefined();
      expect(anprModel?.model).toBe("YOLO Vehicle + PaddleOCR Engine");
      expect(anprModel?.status).toBe("PRODUCTION_READY");

      expect(vehicleModel).toBeDefined();
      expect(vehicleModel?.model).toBe("YOLO Vehicle + PaddleOCR Engine");

      expect(cashVanModel).toBeDefined();
      expect(cashVanModel?.status).toBe("PRODUCTION_READY");

      expect(unregModel).toBeDefined();
      expect(unregModel?.status).toBe("PRODUCTION_READY");
    });
  });

  describe("Metric Resolution: vehicle_in_bay & plate_authorized", () => {
    it("resolves vehicle_in_bay across various alias formats", async () => {
      // Direct boolean
      expect(
        (ruleEngine as any).resolveMetricValue(
          { vehicle_in_bay: true },
          "vehicle_in_bay"
        )
      ).toBe(true);

      // Nested metadata unwrap
      expect(
        (ruleEngine as any).resolveMetricValue(
          { metadata: { vehicle_in_bay: true } },
          "vehicle_in_bay"
        )
      ).toBe(true);

      // CamelCase alias
      expect(
        (ruleEngine as any).resolveMetricValue(
          { vehicleInBay: true },
          "vehicle_in_bay"
        )
      ).toBe(true);

      // bay_occupied / vehicle_present
      expect(
        (ruleEngine as any).resolveMetricValue(
          { bay_occupied: true },
          "vehicle_in_bay"
        )
      ).toBe(true);

      // vehicle_count > 0
      expect(
        (ruleEngine as any).resolveMetricValue(
          { vehicle_count: 2 },
          "vehicle_in_bay"
        )
      ).toBe(true);

      // vehicles array present
      expect(
        (ruleEngine as any).resolveMetricValue(
          { vehicles: [{ plate: "KL-07-CD-5678" }] },
          "vehicle_in_bay"
        )
      ).toBe(true);

      // No vehicle present
      expect(
        (ruleEngine as any).resolveMetricValue(
          { vehicle_in_bay: false },
          "vehicle_in_bay"
        )
      ).toBe(false);
    });

    it("resolves plate_authorized across whitelist, matches, and negation flags", async () => {
      // Direct authorized
      expect(
        (ruleEngine as any).resolveMetricValue(
          { plate_authorized: true },
          "plate_authorized"
        )
      ).toBe(true);

      // Registered / whitelisted alias
      expect(
        (ruleEngine as any).resolveMetricValue(
          { whitelisted: true },
          "plate_authorized"
        )
      ).toBe(true);

      // matches array with authorized match
      expect(
        (ruleEngine as any).resolveMetricValue(
          { matches: [{ plate_authorized: true, plate: "MH-01-AB-1234" }] },
          "plate_authorized"
        )
      ).toBe(true);

      // Direct unauthorized / false
      expect(
        (ruleEngine as any).resolveMetricValue(
          { plate_authorized: false },
          "plate_authorized"
        )
      ).toBe(false);

      // Negation via unregistered: true
      expect(
        (ruleEngine as any).resolveMetricValue(
          { unregistered: true },
          "plate_authorized"
        )
      ).toBe(false);

      // Negation via unknown_vehicle: true
      expect(
        (ruleEngine as any).resolveMetricValue(
          { unknown_vehicle: true },
          "plate_authorized"
        )
      ).toBe(false);
    });
  });

  describe("Rule Evaluation & State Lifecycles", () => {
    it("handles duration threshold: goes PENDING then ACTIVE_ALERTING after 10s", async () => {
      const template = await repository.getTemplate("tmpl-25-unknown-cash-van");
      expect(template).toBeDefined();

      const rule = {
        id: "rule-unreg-van-1",
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        templateId: template!.id,
        name: template!.name,
        enabled: true,
        severity: template!.defaultSeverity,
        condition: template!.defaultCondition,
        durationMs: 10000,
        cooldownMs: 60000,
        actions: template!.defaultActions,
        schedule: { enabled: false },
        zones: ["CASH_BAY_1"],
        detectorType: template!.detectorType,
      };

      const start = new Date("2026-10-23T10:00:00.000Z");

      // Frame 1: Vehicle enters bay, unregistered (t = 0s)
      const frame1Result = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "CASH_BAY_1",
        timestamp: start,
        metrics: {
          vehicle_in_bay: true,
          plate_authorized: false,
          license_plate: "DL01XY9999",
        },
      });

      expect(frame1Result.conditionMet).toBe(true);
      expect(frame1Result.status).toBe("CONDITION_MET_PENDING_DURATION");
      expect(frame1Result.actions).toHaveLength(0);

      // Frame 2: Still in bay after 10s (t = 10s)
      const frame2Time = new Date(start.getTime() + 10000);
      const frame2Result = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "CASH_BAY_1",
        timestamp: frame2Time,
        metrics: {
          vehicle_in_bay: true,
          plate_authorized: false,
          license_plate: "DL01XY9999",
        },
      });

      expect(frame2Result.conditionMet).toBe(true);
      expect(frame2Result.status).toBe("ACTIVE_ALERTING");
      expect(frame2Result.actions).toContain("CREATE_ALERT");
      expect(frame2Result.actions).toContain("CAPTURE_EVIDENCE_CLIP");
      expect(frame2Result.actions).toContain("CREATE_INCIDENT");

      // Frame 3: Vehicle leaves bay (t = 20s)
      const frame3Time = new Date(start.getTime() + 20000);
      const frame3Result = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "CASH_BAY_1",
        timestamp: frame3Time,
        metrics: {
          vehicle_in_bay: false,
          plate_authorized: false,
        },
      });

      expect(frame3Result.conditionMet).toBe(false);
      expect(frame3Result.status).toBe("RESOLVED");
    });

    it("does not alert when vehicle is authorized (whitelisted)", async () => {
      const template = await repository.getTemplate("tmpl-25-unknown-cash-van");
      const rule = {
        id: "rule-unreg-van-2",
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        templateId: template!.id,
        name: template!.name,
        enabled: true,
        severity: template!.defaultSeverity,
        condition: template!.defaultCondition,
        durationMs: 0,
        cooldownMs: 60000,
        actions: template!.defaultActions,
        schedule: { enabled: false },
        zones: ["CASH_BAY_1"],
        detectorType: template!.detectorType,
      };

      const result = await ruleEngine.evaluateRule(rule as any, {
        tenantId: "tenant-nbfc-1",
        branchId: "branch-hub-1",
        zoneId: "CASH_BAY_1",
        timestamp: new Date(),
        metrics: {
          vehicle_in_bay: true,
          plate_authorized: true,
          license_plate: "MH-01-CV-1234",
        },
      });

      expect(result.conditionMet).toBe(false);
      expect(result.status).toBe("IDLE");
      expect(result.actions).toHaveLength(0);
    });
  });

  describe("Core Rule Engine Integration (rule-engine.ts)", () => {
    it("maps ANPR and vehicle detection types in eventDetectionTypes", () => {
      expect(eventDetectionTypes({ detectionType: "anpr" } as any)).toContain("anpr");
      expect(eventDetectionTypes({ detectionType: "ANPR" } as any)).toContain("anpr");
      expect(eventDetectionTypes({ detectionType: "vehicle" } as any)).toContain("vehicle");
      expect(eventDetectionTypes({ detectionType: "VEHICLE" } as any)).toContain("vehicle");
      expect(eventDetectionTypes({ detectionType: "cash-van" } as any)).toContain("cash-van");
      expect(eventDetectionTypes({ detectionType: "cash_van" } as any)).toContain("cash-van");
      expect(eventDetectionTypes({ detectionType: "unregistered-vehicle" } as any)).toContain(
        "unregistered-vehicle"
      );
      expect(eventDetectionTypes({ detectionType: "license-plate" } as any)).toContain("anpr");
    });

    it("matches ANPR rules when event has empty objects: []", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-cash-bay-core",
        name: "Unregistered Vehicle in Cash Bay",
        detectionType: "anpr",
        severity: "P2",
        minConfidence: 0.7,
        minDurationSeconds: 0,
        cooldownSeconds: 60,
        direction: "any",
        objectClasses: [],
        enabled: true,
        deleted: false,
        actions: ["alert"],
      };

      const event: AnalyticsEventInput = {
        eventId: "evt-cash-bay-01",
        detectionType: "anpr",
        confidence: 0.9,
        durationSeconds: 0,
        occurredAt: "2026-03-24T14:30:00Z",
        objects: [],
        metadata: {
          vehicle_in_bay: true,
          plate_authorized: false,
          plate: "KA05MN4321",
        },
      };

      const matches = sortedMatchingRules([rule], event);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe("rule-cash-bay-core");
    });

    it("cross-matches vehicle object classes (e.g. van, truck, car matches vehicle)", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-vehicle-class-core",
        name: "Cash Bay Vehicle Check",
        detectionType: "anpr",
        severity: "P2",
        minConfidence: 0.7,
        minDurationSeconds: 0,
        cooldownSeconds: 60,
        direction: "any",
        objectClasses: ["vehicle"],
        enabled: true,
        deleted: false,
        actions: ["alert"],
      };

      const eventVan: AnalyticsEventInput = {
        eventId: "evt-cash-bay-van",
        detectionType: "anpr",
        confidence: 0.9,
        durationSeconds: 0,
        occurredAt: "2026-03-24T14:30:00Z",
        objects: [{ label: "van", confidence: 0.88, box: [10, 10, 50, 50] }],
      };

      const matches = sortedMatchingRules([rule], eventVan);
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe("rule-vehicle-class-core");
    });

    it("generates specific alert title and detailed description for unregistered vehicles", () => {
      const rule: CoreAnalyticsRule = {
        id: "rule-cash-bay-van",
        name: "Unregistered Vehicle in Cash Bay",
        detectionType: "anpr",
        severity: "P2",
        minConfidence: 0.7,
        minDurationSeconds: 0,
        cooldownSeconds: 60,
        direction: "any",
        objectClasses: [],
        enabled: true,
        deleted: false,
        actions: ["alert"],
      };

      const eventMeta = {
        zoneName: "Secure Cash Bay Transfer Zone",
        plate: "KA-01-MJ-9999",
        vehicleType: "armored cash van",
      };

      const title = analyticsAlertTitle(rule, eventMeta);
      expect(title).toBe("Critical Security Alert: Unregistered Vehicle in Cash Bay Detected");

      const description = analyticsAlertDescription(rule, eventMeta);
      expect(description).toContain("Unregistered or unauthorized armored cash van");
      expect(description).toContain("Plate: KA-01-MJ-9999");
      expect(description).toContain("Secure Cash Bay Transfer Zone");
      expect(description).toContain("Immediate security verification and escort protocol required");
    });
  });

  describe("Security Commander Anomaly Rule (unregistered-vehicle-cash-bay)", () => {
    it("evaluates and triggers unregistered-vehicle-cash-bay anomaly rule", () => {
      const anomalyEngine = new AnomalyRuleEngine();

      const event1: SecurityEvent = {
        id: "sec-ev-1",
        tenantId: "tenant-1",
        branchId: "branch-1",
        timestamp: new Date(),
        type: "ai.unregistered_vehicle",
        severity: "high",
        metadata: {
          licensePlate: "KL-07-ZZ-1111",
          zone: "CASH_BAY_1",
        },
      };

      const evaluation1 = anomalyEngine.evaluate(event1);
      const match1 = evaluation1.matchedRules.find((m) => m.rule.id === "unregistered-vehicle-cash-bay");
      expect(match1).toBeDefined();
      expect(match1?.score).toBe(0.9);
      expect(match1?.reason).toContain("Unregistered or unauthorized vehicle");

      // Evaluation via metadata: vehicle_in_bay: true && plate_authorized: false
      const event2: SecurityEvent = {
        id: "sec-ev-2",
        tenantId: "tenant-1",
        branchId: "branch-1",
        timestamp: new Date(),
        type: "camera.analytics_event",
        severity: "high",
        metadata: {
          vehicle_in_bay: true,
          plate_authorized: false,
          plate: "MH-12-XX-4444",
        },
      };

      const evaluation2 = anomalyEngine.evaluate(event2);
      const match2 = evaluation2.matchedRules.find((m) => m.rule.id === "unregistered-vehicle-cash-bay");
      expect(match2).toBeDefined();
      expect(match2?.score).toBe(0.9);
    });

    it("does not trigger anomaly when vehicle is authorized in metadata", () => {
      const anomalyEngine = new AnomalyRuleEngine();

      const event: SecurityEvent = {
        id: "sec-ev-3",
        tenantId: "tenant-1",
        branchId: "branch-1",
        timestamp: new Date(),
        type: "camera.analytics_event",
        severity: "low",
        metadata: {
          vehicle_in_bay: true,
          plate_authorized: true,
          plate: "MH-12-XX-1234",
        },
      };

      const evaluation = anomalyEngine.evaluate(event);
      const match = evaluation.matchedRules.find((m) => m.rule.id === "unregistered-vehicle-cash-bay");
      expect(match).toBeUndefined();
    });
  });
});
