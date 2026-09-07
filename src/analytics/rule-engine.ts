import type {
  AnalyticsAlertStatus,
  AnalyticsRule,
} from "../domain/models.js";
import type { AnalyticsEventInput } from "../control-plane-store.js";

const severityOrder = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 } as const;

export function sortedMatchingRules(
  rules: readonly AnalyticsRule[],
  event: AnalyticsEventInput,
): AnalyticsRule[] {
  const detectionTypes = new Set(eventDetectionTypes(event));
  return rules
    .filter((rule) => rule.enabled && detectionTypes.has(rule.detectionType))
    .filter((rule) => event.confidence >= rule.minConfidence)
    .filter((rule) => event.durationSeconds >= rule.minDurationSeconds)
    .filter((rule) => objectClassesMatch(rule, event))
    .filter((rule) => directionMatches(rule, event))
    .filter((rule) => zoneMatches(rule, event))
    .filter((rule) => isWithinSchedule(rule, event.occurredAt))
    .sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);
}

export function eventDetectionTypes(event: AnalyticsEventInput): string[] {
  const types = [event.detectionType];
  if (event.detectionType === "anpr" && Array.isArray(event.metadata?.matches)) {
    const hasAlertingMatch = event.metadata.matches.some((value) =>
      value !== null && typeof value === "object" && !Array.isArray(value) &&
      (value as Record<string, unknown>).alertOnMatch !== false
    );
    if (hasAlertingMatch) types.push("watchlist-match");
  }
  if (["face", "face-detection", "face-recognition"].includes(event.detectionType)) {
    const identity = faceIdentity(event.metadata);
    const matched = identity !== null && typeof identity === "object" && !Array.isArray(identity) &&
      (identity as Record<string, unknown>).matched === true;
    types.push(matched ? "face-recognition" : "unknown-person");
  }
  return types;
}

export function isTerminalAlertStatus(status: AnalyticsAlertStatus) {
  return status === "resolved" || status === "false_alarm" || status === "suppressed";
}

export function analyticsAlertTitle(rule: AnalyticsRule, metadata?: Record<string, unknown>) {
  if (rule.detectionType === "face-recognition") {
    const identity = faceIdentity(metadata);
    const name = identity && typeof identity === "object" && !Array.isArray(identity)
      ? (identity as Record<string, unknown>).personName : undefined;
    return typeof name === "string" && name.trim()
      ? `${name.trim()} recognised`
      : "Known person recognised";
  }
  if (rule.detectionType === "unknown-person") return "Outsider detected";
  const label = rule.detectionType.replaceAll("-", " ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} detected`;
}

export function analyticsAlertDescription(rule: AnalyticsRule, metadata?: Record<string, unknown>) {
  if (rule.detectionType === "face-recognition") {
    const identity = faceIdentity(metadata);
    const name = identity && typeof identity === "object" && !Array.isArray(identity)
      ? (identity as Record<string, unknown>).personName : undefined;
    return typeof name === "string" && name.trim()
      ? `${name.trim()} was recognised by this camera.`
      : "A known identity was recognised by this camera.";
  }
  if (rule.detectionType === "unknown-person") return "An unrecognised face was detected in this configured camera area.";
  return `Rule \"${rule.name}\" matched.`;
}

function faceIdentity(metadata?: Record<string, unknown>) {
  const source = metadata?.identityMatch ?? metadata?.faceMatch;
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  const value = source as Record<string, unknown>;
  const candidate = value.candidate;
  const candidateName = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>).name : undefined;
  return {
    ...value,
    matched: value.matched === true || Boolean(candidateName),
    personName: typeof value.personName === "string" ? value.personName : candidateName,
  };
}

function objectClassesMatch(rule: AnalyticsRule, event: AnalyticsEventInput) {
  if (rule.objectClasses.length === 0) return true;
  return event.objects.some((object) =>
    rule.objectClasses.some((label) =>
      object.label.toLowerCase() === label.toLowerCase() && object.confidence >= rule.minConfidence,
    ),
  );
}

function directionMatches(rule: AnalyticsRule, event: AnalyticsEventInput) {
  if (rule.direction === "any") return true;
  return event.metadata?.direction === rule.direction;
}

function zoneMatches(rule: AnalyticsRule, event: AnalyticsEventInput) {
  if (!rule.zone) return true;
  const eventZoneId = event.metadata?.zoneId;
  return eventZoneId === undefined || eventZoneId === rule.zone.id;
}

function isWithinSchedule(rule: AnalyticsRule, value: string) {
  if (!rule.schedule) return true;
  const instant = new Date(value);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: rule.schedule.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    .indexOf(parts.weekday ?? "");
  if (!rule.schedule.days.includes(day)) return false;
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const start = minutes(rule.schedule.start);
  const end = minutes(rule.schedule.end);
  return start <= end
    ? minute >= start && minute < end
    : minute >= start || minute < end;
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour! * 60 + minute!;
}
