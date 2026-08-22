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
  return rules
    .filter((rule) => rule.enabled && rule.detectionType === event.detectionType)
    .filter((rule) => event.confidence >= rule.minConfidence)
    .filter((rule) => event.durationSeconds >= rule.minDurationSeconds)
    .filter((rule) => objectClassesMatch(rule, event))
    .filter((rule) => directionMatches(rule, event))
    .filter((rule) => zoneMatches(rule, event))
    .filter((rule) => isWithinSchedule(rule, event.occurredAt))
    .sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);
}

export function isTerminalAlertStatus(status: AnalyticsAlertStatus) {
  return status === "resolved" || status === "false_alarm" || status === "suppressed";
}

export function analyticsAlertTitle(rule: AnalyticsRule) {
  const label = rule.detectionType.replaceAll("-", " ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} detected`;
}

function objectClassesMatch(rule: AnalyticsRule, event: AnalyticsEventInput) {
  if (rule.objectClasses.length === 0) return true;
  const detected = new Set(event.objects.map((object) => object.label.toLowerCase()));
  return rule.objectClasses.some((label) => detected.has(label.toLowerCase()));
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
