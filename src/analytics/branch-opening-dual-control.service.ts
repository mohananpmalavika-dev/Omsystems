import type { AnalyticsEventInput } from "../control-plane-store.js";
import type { Camera } from "../domain/models.js";
import type { NbfcRuleEngineService } from "./nbfc-rule-engine.service.js";
import type { NbfcRuleRepository } from "./nbfc-rule-repository.js";

export const OPENING_RULE_TEMPLATE_ID = "tmpl-27-opening-staff-count";
export const COUNTING_DETECTION_TYPES = new Set([
  "person",
  "person-counting",
  "occupancy-counting",
  "shutter-opened",
  "shutter-state",
  "door-opened",
  "door-state",
  "grill-opened",
  "barrier-opened",
  "line-crossing",
  "tripwire",
  "footfall",
  "entry",
  "ingress",
  "motion",
]);

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
  requiredStaff: number;
  openingTrigger?: string | undefined;
}

function numericMetadata(metadata: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  }
  return undefined;
}

export function observedStaffCount(event: AnalyticsEventInput): number | undefined {
  const declared = numericMetadata(
    event.metadata,
    "staffCount",
    "staff_count",
    "personCount",
    "person_count",
    "occupancy",
    "entryCount",
    "entries",
    "count"
  );
  if (declared !== undefined) return declared;
  const personObjects = event.objects?.filter((object) => object.label?.toLowerCase() === "person")?.length;
  if (personObjects !== undefined && personObjects > 0) return personObjects;
  if (COUNTING_DETECTION_TYPES.has(event.detectionType)) {
    return personObjects ?? 0;
  }
  return undefined;
}

/**
 * Checks whether the event indicates that the shutter, grill, or door has opened or is open.
 */
export function isShutterOrDoorOpening(event: AnalyticsEventInput): boolean {
  const dt = (event.detectionType || "").toLowerCase();
  if (
    dt === "shutter-opened" ||
    dt === "door-opened" ||
    dt === "grill-opened" ||
    dt === "barrier-opened" ||
    dt === "gate-opened"
  ) {
    return true;
  }

  const meta = event.metadata || {};
  const shutterState = String(meta.shutterState || meta.shutter_state || "").toLowerCase();
  const doorState = String(meta.doorState || meta.door_state || "").toLowerCase();
  const grillState = String(meta.grillState || meta.grill_state || "").toLowerCase();
  const barrierState = String(meta.barrierState || meta.gateState || "").toLowerCase();

  if (
    shutterState === "open" ||
    doorState === "open" ||
    grillState === "open" ||
    barrierState === "open" ||
    meta.shutterOpened === true ||
    meta.shutter_opened === true ||
    meta.doorOpened === true ||
    meta.door_opened === true ||
    meta.grillOpened === true ||
    meta.grill_opened === true ||
    meta.isOpen === true ||
    meta.is_open === true
  ) {
    return true;
  }

  return false;
}

/**
 * Checks whether the event indicates a person entering inside / ingress into the branch.
 * ("avar open cheyuth inside pokuvanel")
 */
export function isEnteringInside(event: AnalyticsEventInput): boolean {
  const meta = event.metadata || {};
  const direction = String(meta.direction || "").toLowerCase();
  const action = String(meta.action || "").toLowerCase();

  const INGRESS_DIRECTIONS = new Set([
    "entry",
    "enter",
    "ingress",
    "inbound",
    "inside",
    "a-to-b",
    "a_to_b",
    "into-branch",
    "cross-in",
    "in",
  ]);

  if (INGRESS_DIRECTIONS.has(direction) || INGRESS_DIRECTIONS.has(action)) {
    return true;
  }

  if (
    meta.entered === true ||
    meta.isInside === true ||
    meta.inside === true ||
    meta.is_inside === true ||
    meta.goingInside === true ||
    meta.going_inside === true
  ) {
    return true;
  }

  const entries = numericMetadata(meta, "entries", "entryCount", "entry_count");
  if (entries !== undefined && entries > 0) {
    return true;
  }

  const dt = (event.detectionType || "").toLowerCase();
  if (["line-crossing", "tripwire", "footfall", "door-ingress"].includes(dt)) {
    const EXCLUSION_DIRECTIONS = new Set(["exit", "leave", "b-to-a", "b_to_a", "outbound", "out"]);
    if (!EXCLUSION_DIRECTIONS.has(direction)) {
      return true;
    }
  }

  return false;
}

export function branchOpeningLocalDate(timestamp: Date, timezone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(timestamp).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Enforces Branch Opening Two-Person Dual-Control Rule:
 *
 * 1. The camera is located outside looking at the entrance (shutter, grill, door).
 * 2. If a person arrives outside and stands without opening the shutter or door (and without entering),
 *    no alert is raised and no failure is recorded.
 * 3. When the shutter, grill, or door opens, or when personnel enter inside:
 *    - Fewer than the applicable required count (default 2) triggers a dual-custody violation alert immediately.
 *    - Two or more people opening / entering together passes as a compliant opening for the local day.
 */
export async function evaluateBranchOpeningDualControl(
  repository: NbfcRuleRepository,
  engine: NbfcRuleEngineService,
  event: AnalyticsEventInput,
  camera: Pick<Camera, "id" | "branchId">,
  sourceEventId?: string,
): Promise<BranchOpeningViolation[]> {
  const timestamp = new Date(event.occurredAt);
  if (Number.isNaN(timestamp.getTime())) return [];

  const rules = await repository.listRules({
    tenantId: event.tenantId, branchId: camera.branchId, cameraId: camera.id,
  });
  const candidates = rules.filter((rule) =>
    rule.templateId === OPENING_RULE_TEMPLATE_ID && rule.enabled && rule.state === "ACTIVE");
  const rule = candidates.find((candidate) => candidate.branchIds.includes(camera.branchId))
    || candidates.find((candidate) => candidate.branchIds.length === 0);
  if (!rule || !engine.isWithinSchedule(rule.schedule, timestamp)) return [];

  const localDate = branchOpeningLocalDate(timestamp, rule.schedule?.timezone || "Asia/Kolkata");
  const requiredStaff = Number(rule.metadata?.requiredOpeningStaff ?? rule.condition?.value ?? 2);

  const isOpening = isShutterOrDoorOpening(event);
  const isEntering = isEnteringInside(event);
  if (isOpening) {
    await repository.recordBranchShutterOpened(rule.id, camera.branchId, localDate, event.occurredAt, camera.id);
  }
  const shutterAlreadyOpen = await repository.isBranchShutterOpen(rule.id, camera.branchId, localDate);

  const requireShutterOrDoorOpen = rule.metadata?.requireShutterOrDoorOpen !== false;

  // If shutter/door is closed and person is not entering inside:
  // (e.g. Standing outside without opening shutter or door)
  // MUST NOT ALERT!
  const meta = event.metadata || {};
  const shutterState = String(meta.shutterState || meta.shutter_state || "").toLowerCase();
  const doorState = String(meta.doorState || meta.door_state || "").toLowerCase();
  const isExplicitlyClosed = (shutterState === "closed" || doorState === "closed" || meta.isOpen === false) && !isEntering;

  if (isExplicitlyClosed) {
    return [];
  }

  if (requireShutterOrDoorOpen && !isOpening && !isEntering && !shutterAlreadyOpen) {
    // Person is outside, shutter/grill/door has not been opened and they are not entering inside.
    // "outside oral vann shutter or grill or door open aakathe ninnal alert varanda"
    return [];
  }

  const personCount = observedStaffCount(event);
  if (personCount === undefined || personCount === 0) return [];

  const openingTrigger = isOpening
    ? "SHUTTER_DOOR_OPENED"
    : isEntering
    ? "ENTRY_INGRESS"
    : "BRANCH_STAFF_OBSERVED";

  const { state } = await repository.claimBranchOpeningCheck({
    ruleId: rule.id,
    branchId: camera.branchId,
    localDate,
    cameraId: camera.id,
    personCount,
    requiredStaff,
    openingTrigger,
    occurredAt: event.occurredAt,
    sourceEventId,
    snapshotReference: event.snapshotReference,
    clipReference: event.clipReference,
    personBoundingBox: event.objects?.find((object) => object.label?.toLowerCase() === "person")?.boundingBox,
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
    requiredStaff: Number(metrics.requiredStaff ?? requiredStaff),
    openingTrigger: typeof metrics.openingTrigger === "string" ? metrics.openingTrigger : openingTrigger,
  }];
}
