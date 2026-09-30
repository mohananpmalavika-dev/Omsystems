import type { AnalyticsEventInput } from "../control-plane-store.js";
import type { Camera } from "../domain/models.js";
import type { NbfcRuleEngineService } from "./nbfc-rule-engine.service.js";
import type { NbfcRuleRepository } from "./nbfc-rule-repository.js";

export const OPENING_RULE_TEMPLATE_ID = "tmpl-27-opening-staff-count";
const COUNTING_DETECTION_TYPES = new Set(["person", "person-counting", "occupancy-counting"]);

export interface BranchOpeningViolation {
  ruleId: string;
  ruleName: string;
  branchId: string;
  cameraId: string;
  localDate: string;
  occurredAt: string;
  snapshotReference?: string | undefined;
  clipReference?: string | undefined;
  personBoundingBox?: { x: number; y: number; width: number; height: number } | undefined;
  staffCount: number;
  requiredStaff: 2;
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
  const declared = numericMetadata(event.metadata, "staffCount", "staff_count", "personCount", "person_count", "occupancy");
  if (declared !== undefined) return declared;
  return event.objects.filter((object) => object.label.toLowerCase() === "person").length;
}

export function branchOpeningLocalDate(timestamp: Date, timezone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(timestamp).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Decide the opening once, from the first frame with at least one person. */
export async function evaluateBranchOpeningDualControl(
  repository: NbfcRuleRepository,
  engine: NbfcRuleEngineService,
  event: AnalyticsEventInput,
  camera: Pick<Camera, "id" | "branchId">,
  sourceEventId?: string,
): Promise<BranchOpeningViolation[]> {
  const personCount = observedStaffCount(event);
  if (personCount === undefined || personCount === 0) return [];
  const timestamp = new Date(event.occurredAt);
  if (Number.isNaN(timestamp.getTime())) return [];

  const rules = await repository.listRules({
    tenantId: event.tenantId, branchId: camera.branchId, cameraId: camera.id, detectorType: "person",
  });
  const candidates = rules.filter((rule) =>
    rule.templateId === OPENING_RULE_TEMPLATE_ID && rule.enabled && rule.state === "ACTIVE");
  const rule = candidates.find((candidate) => candidate.branchIds.includes(camera.branchId))
    || candidates.find((candidate) => candidate.branchIds.length === 0);
  if (!rule || !engine.isWithinSchedule(rule.schedule, timestamp)) return [];

  const localDate = branchOpeningLocalDate(timestamp, rule.schedule?.timezone || "Asia/Kolkata");
  const { state } = await repository.claimBranchOpeningCheck({
    ruleId: rule.id, branchId: camera.branchId, localDate,
    cameraId: camera.id, personCount, occurredAt: event.occurredAt,
    sourceEventId,
    snapshotReference: event.snapshotReference, clipReference: event.clipReference,
    personBoundingBox: event.objects.find((object) => object.label.toLowerCase() === "person")?.boundingBox,
  });
  const metrics = state.currentMetrics || {};
  // Retry an unfinished alert dispatch with the same deterministic source ID.
  // A completed failure and a successful opening are ignored for the day.
  if (metrics.outcome !== "FAILED" || metrics.alertEmitted === true) return [];
  return [{
    ruleId: rule.id,
    ruleName: rule.name,
    branchId: camera.branchId,
    cameraId: String(metrics.cameraId || camera.id),
    localDate,
    occurredAt: state.firstConditionMetAt || event.occurredAt,
    snapshotReference: typeof metrics.snapshotReference === "string" ? metrics.snapshotReference : undefined,
    clipReference: typeof metrics.clipReference === "string" ? metrics.clipReference : undefined,
    personBoundingBox: metrics.personBoundingBox as BranchOpeningViolation["personBoundingBox"],
    staffCount: Number(metrics.personCount ?? personCount),
    requiredStaff: 2,
  }];
}
