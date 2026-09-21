import type { AnalyticsEventInput } from "../control-plane-store.js";
import type { Camera } from "../domain/models.js";
import type { NbfcRuleEngineService, RuleEvaluationResult } from "./nbfc-rule-engine.service.js";
import type { NbfcRuleRepository } from "./nbfc-rule-repository.js";

const OPENING_RULE_TEMPLATE_ID = "tmpl-27-opening-staff-count";
const COUNTING_DETECTION_TYPES = new Set([
  "person",
  "person-counting",
  "occupancy-counting",
  "crowd-density",
]);

export interface BranchOpeningViolation {
  ruleId: string;
  ruleName: string;
  branchId: string;
  cameraId: string;
  staffCount: number;
  requiredStaff: number;
  evaluation: RuleEvaluationResult;
}

function numericMetadata(metadata: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  }
  return undefined;
}

export function observedStaffCount(event: AnalyticsEventInput): number | undefined {
  if (!COUNTING_DETECTION_TYPES.has(event.detectionType)) return undefined;
  const declared = numericMetadata(
    event.metadata,
    "staffCount",
    "staff_count",
    "personCount",
    "person_count",
    "occupancy",
  );
  if (declared !== undefined) return declared;
  return event.objects.filter((object) => object.label.toLowerCase() === "person").length;
}

/**
 * Evaluates the branch-scoped two-person opening policy from an authoritative
 * camera count. It never operates a lock or door; a triggered result is handed
 * back to the analytics ingestion route to create the normal P1 alert,
 * evidence and incident workflow.
 */
export async function evaluateBranchOpeningDualControl(
  repository: NbfcRuleRepository,
  engine: NbfcRuleEngineService,
  event: AnalyticsEventInput,
  camera: Pick<Camera, "id" | "branchId">,
): Promise<BranchOpeningViolation[]> {
  const staffCount = observedStaffCount(event);
  if (staffCount === undefined) return [];

  const rules = await repository.listRules({
    tenantId: event.tenantId,
    branchId: camera.branchId,
    cameraId: camera.id,
    detectorType: "person",
  });
  const openingRules = rules.filter((rule) =>
    rule.templateId === OPENING_RULE_TEMPLATE_ID &&
    rule.enabled &&
    rule.state === "ACTIVE" &&
    (rule.branchIds.length === 0 || rule.branchIds.includes(camera.branchId)) &&
    (rule.cameraIds.length === 0 || rule.cameraIds.includes(camera.id))
  );

  const violations: BranchOpeningViolation[] = [];
  for (const rule of openingRules) {
    const result = await engine.evaluateRule(rule, {
      tenantId: event.tenantId,
      branchId: camera.branchId,
      cameraId: camera.id,
      entityKey: `${camera.branchId}:${camera.id}:branch-opening`,
      timestamp: new Date(event.occurredAt),
      metrics: {
        ...(event.metadata || {}),
        opening_window_active: true,
        person_count: staffCount,
        staff_count: staffCount,
      },
      objects: event.objects,
    });
    if (!result.triggered || result.isShadow) continue;

    const configuredThreshold = rule.condition.conditions?.find((condition) =>
      "metric" in condition && condition.metric === "staff_count"
    );
    const requiredStaff = configuredThreshold && "value" in configuredThreshold
      ? Number(configuredThreshold.value) || 2
      : rule.condition.metric === "staff_count"
        ? Number(rule.condition.value) || 2
        : 2;

    violations.push({
      ruleId: rule.id,
      ruleName: rule.name,
      branchId: camera.branchId,
      cameraId: camera.id,
      staffCount,
      requiredStaff,
      evaluation: result,
    });
  }
  return violations;
}

export { OPENING_RULE_TEMPLATE_ID };
