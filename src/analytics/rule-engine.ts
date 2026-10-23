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
  const matches = rules
    .filter((rule) => rule.enabled && !["no-helmet", "person-counting", "occupancy-counting"].includes(rule.detectionType) && detectionTypes.has(rule.detectionType))
    .filter(rule=>!["shutter-opened","shutter-closed"].includes(event.detectionType) ||
      isConfirmedShutterTransition(event) && event.metadata?.shutterRuleId===rule.id)
    .filter((rule) => event.confidence >= rule.minConfidence)
    .filter((rule) => event.durationSeconds >= rule.minDurationSeconds)
    .filter((rule) => objectClassesMatch(rule, event))
    .filter((rule) => directionMatches(rule, event))
    .filter((rule) => zoneMatches(rule, event))
    .filter((rule) => isWithinSchedule(rule, event.occurredAt));
  // Older cameras may still have the generic helmet rule alongside the
  // dedicated indoor helmet-worn rule. They describe the same observation;
  // prefer the dedicated rule so a single person creates a single alarm.
  const hasHelmetWornRule = matches.some((rule) => rule.detectionType === "helmet-worn");
  return matches
    .filter((rule) => !hasHelmetWornRule || rule.detectionType !== "helmet")
    .sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);
}

export function eventDetectionTypes(event: AnalyticsEventInput): string[] {
  const types = [event.detectionType];
  if(event.detectionType==="shutter-opened"||event.detectionType==="shutter-closed")types.push("shutter-state");
  if (["helmet", "helmet-worn", "face-cover", "face_cover", "mask", "face-concealment", "helmet-face-cover"].includes(event.detectionType)) {
    types.push("helmet", "helmet-worn", "face-cover", "face_cover", "helmet-face-cover");
  }
  if (event.detectionType === "dual-control-verification" || event.detectionType === "dual-control-violation") {
    types.push("dual-control-verification", "dual-control-violation");
  }
  if (["queue", "queue-length", "queue_length", "queue_length_exceeded", "customer-queue-length", "queue-depth"].includes(event.detectionType)) {
    types.push("queue", "queue-length", "queue_length", "customer-queue-length");
  }
  if (["safe-door", "safe-door-open", "safe-door-opened", "safe_door_open", "door-open", "door_open", "door-state", "door_state", "vault-door-opened", "locker-door-opened"].includes(event.detectionType)) {
    types.push("safe-door", "door-state", "door-open", "zone");
  }
  if (["recording", "recording-failure", "recording_failure", "recording-gap", "recording_gap", "continuous-recording-failure", "stream-failure", "stream-failed"].includes(event.detectionType)) {
    types.push("recording", "recording-failure", "recording_failure", "recording-gap", "recording_gap", "RECORDING_FAILURE");
  }
  if (["locker-dwell", "locker-dwell-time", "locker-session", "locker_session", "locker_dwell", "dwell-time", "dwell_time"].includes(event.detectionType)) {
    types.push("locker-dwell", "locker-session", "person", "zone", "loitering");
  }
  if (["cash-handover", "handover", "pouch-handover", "cash-counter-object", "cash-counter-handover", "tray-handover", "teller-handover"].includes(event.detectionType)) {
    types.push("cash-handover", "handover", "cash-counter-object", "object");
  }
  if (["health", "camera-health", "camera-offline", "camera_offline", "device-offline", "device_offline", "offline"].includes(event.detectionType)) {
    types.push("health", "camera-health", "camera-offline", "camera_offline", "device-offline");
  }
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

export function isConfirmedShutterTransition(event: AnalyticsEventInput) {
  const opened = event.detectionType === "shutter-opened";
  const closed = event.detectionType === "shutter-closed";
  return (opened || closed) && event.metadata?.transitionConfirmed === true &&
    typeof event.metadata?.shutterRuleId === "string" &&
    event.metadata?.shutterState === (opened ? "open" : "closed") &&
    event.metadata?.previousShutterState === (opened ? "closed" : "open");
}

export function isTerminalAlertStatus(status: AnalyticsAlertStatus) {
  return status === "resolved" || status === "false_alarm" || status === "suppressed";
}

export function analyticsAlertTitle(rule: AnalyticsRule, metadata?: Record<string, unknown>) {
  if (rule.detectionType === "person" && rule.schedule && rule.schedule.start > rule.schedule.end) {
    return "Person Detected after office hour";
  }
  if (rule.detectionType === "dual-control-verification" || rule.detectionType === "dual-control-violation") {
    if (metadata?.violation === "BRANCH_OPENING_MINIMUM_STAFF") {
      return "Branch Opening Dual-Control Violation";
    }
    return "Dual control violation detected";
  }
  if (rule.detectionType === "queue" || rule.detectionType === "queue-length" || rule.detectionType === "queue_length") {
    return "Customer Queue Length SLA Breached";
  }
  if (rule.detectionType === "helmet-worn" || rule.detectionType === "helmet" || rule.detectionType === "face-cover") {
    const isMask = metadata?.faceCover === true || metadata?.maskDetected === true || metadata?.threatType === "mask";
    return isMask ? "Face Cover / Mask Detected Inside Facility" : "Security Alert: Helmet / Face Cover Detected";
  }
  if (
    rule.detectionType === "safe-door" ||
    rule.detectionType === "safe-door-open" ||
    rule.name.toLowerCase().includes("safe / locker door") ||
    rule.name.toLowerCase().includes("safe door")
  ) {
    return "Safe / Locker Door Opened - Continuous Surveillance Active";
  }
  if (
    rule.detectionType === "recording" ||
    rule.detectionType === "recording-failure" ||
    rule.detectionType === "RECORDING_FAILURE" ||
    rule.detectionType === "recording-gap" ||
    rule.name.toLowerCase().includes("recording failure") ||
    rule.name.toLowerCase().includes("continuous recording")
  ) {
    return "Critical Alert: Continuous Recording Failure Detected";
  }
  if (
    rule.detectionType === "locker-dwell" ||
    rule.detectionType === "locker-session" ||
    rule.name.toLowerCase().includes("locker visit") ||
    rule.name.toLowerCase().includes("locker dwell")
  ) {
    return "Excessive Locker Visit Dwell Time Exceeded";
  }
  if (
    rule.detectionType === "cash-handover" ||
    rule.name.toLowerCase().includes("cash counter handover") ||
    rule.name.toLowerCase().includes("handover event")
  ) {
    return "Cash Counter Handover Event Recorded";
  }
  if (
    rule.detectionType === "health" ||
    rule.detectionType === "camera-offline" ||
    rule.name.toLowerCase().includes("camera offline")
  ) {
    return "Critical Alert: Camera Offline in Business Hours";
  }
  if(rule.detectionType==="shutter-state")return metadata?.shutterState==="open"?"Shutter opened":"Shutter closed";
  if(rule.detectionType==="shutter-opened")return "Shutter opened";
  if(rule.detectionType==="shutter-closed")return "Shutter closed";
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
  if(rule.detectionType==="shutter-state")return `Shutter confirmed ${metadata?.shutterState==="open"?"open":"closed"} for rule "${rule.name}".`;
  if (rule.detectionType === "face-recognition") {
    const identity = faceIdentity(metadata);
    const name = identity && typeof identity === "object" && !Array.isArray(identity)
      ? (identity as Record<string, unknown>).personName : undefined;
    return typeof name === "string" && name.trim()
      ? `${name.trim()} was recognised by this camera.`
      : "A known identity was recognised by this camera.";
  }
  if (rule.detectionType === "unknown-person") return "An unrecognised face was detected in this configured camera area.";
  if (rule.detectionType === "dual-control-verification" || rule.detectionType === "dual-control-violation") {
    if (metadata?.violation === "BRANCH_OPENING_MINIMUM_STAFF") {
      const count = metadata.staffCount ?? 1;
      const required = metadata.requiredStaff ?? 2;
      return `Branch opening dual-custody enforcement failure: ${count} person(s) opened/entered the branch during opening window when minimum ${required} authorized persons are required.`;
    }
    return "Single person detected in vault area. Dual control policy requires minimum 2 authorized persons.";
  }
  if (rule.detectionType === "queue" || rule.detectionType === "queue-length" || rule.detectionType === "queue_length") {
    const queueLen = metadata?.queueLength ?? metadata?.currentQueueLength ?? metadata?.current_queue_length ?? metadata?.length ?? metadata?.personCount;
    if (typeof queueLen === "number") {
      return `Customer queue length (${queueLen}) exceeded service SLA threshold.`;
    }
    if (typeof metadata?.explanation === "string") {
      return metadata.explanation;
    }
    return `Customer queue length SLA breached for rule "${rule.name}".`;
  }
  if (rule.detectionType === "helmet-worn" || rule.detectionType === "helmet" || rule.detectionType === "face-cover") {
    const detail = metadata?.threatType || (metadata?.maskDetected ? "face mask" : (metadata?.helmetDetected ? "motorcycle helmet" : "identity concealment gear"));
    return `Person detected inside facility wearing ${detail} in violation of branch/ATM security policy.`;
  }
  if (
    rule.detectionType === "safe-door" ||
    rule.detectionType === "safe-door-open" ||
    rule.name.toLowerCase().includes("safe / locker door") ||
    rule.name.toLowerCase().includes("safe door")
  ) {
    const doorName = (metadata?.doorName as string) || (metadata?.sensorName as string) || "Safe / strong-room door";
    return `${doorName} opened. Forensic high-priority continuous recording and SOC surveillance activated for rule "${rule.name}".`;
  }
  if (
    rule.detectionType === "recording" ||
    rule.detectionType === "recording-failure" ||
    rule.detectionType === "RECORDING_FAILURE" ||
    rule.detectionType === "recording-gap" ||
    rule.name.toLowerCase().includes("recording failure") ||
    rule.name.toLowerCase().includes("continuous recording")
  ) {
    const gapSec = metadata?.gapSeconds ?? metadata?.recordingGapSeconds ?? metadata?.recording_gap_seconds ?? metadata?.gapDuration ?? metadata?.gapDurationSeconds ?? metadata?.durationSeconds;
    const gapInfo = typeof gapSec === "number" ? ` (${gapSec}s gap exceeds SLA threshold)` : "";
    const cameraName = (metadata?.cameraName as string) || (metadata?.cameraId as string) || "Camera stream";
    return `${cameraName} video segment write stream failed${gapInfo}. Continuous recording interrupted in violation of NBFC compliance policy.`;
  }
  if (
    rule.detectionType === "locker-dwell" ||
    rule.detectionType === "locker-session" ||
    rule.name.toLowerCase().includes("locker visit") ||
    rule.name.toLowerCase().includes("locker dwell")
  ) {
    const dwellSec = metadata?.locker_session_duration_seconds ?? metadata?.lockerSessionDurationSeconds ?? metadata?.dwellSeconds ?? metadata?.dwellTimeSeconds ?? metadata?.dwell_time_seconds ?? metadata?.durationSeconds;
    const dwellMins = typeof dwellSec === "number" ? Math.round(dwellSec / 60) : 15;
    const zoneName = (metadata?.zoneName as string) || (metadata?.areaName as string) || "Locker / strong-room area";
    return `Customer session inside ${zoneName} reached ${dwellMins} minutes (exceeding maximum 15-minute operating threshold).`;
  }
  if (
    rule.detectionType === "cash-handover" ||
    rule.name.toLowerCase().includes("cash counter handover") ||
    rule.name.toLowerCase().includes("handover event")
  ) {
    const counterName = (metadata?.counterName as string) || (metadata?.zoneName as string) || "Teller Cash Tray";
    const itemType = (metadata?.objectClass as string) || (metadata?.itemType as string) || "Package / Cash Pouch";
    return `${itemType} placement detected at ${counterName} for transaction audit correlation.`;
  }
  if (
    rule.detectionType === "health" ||
    rule.detectionType === "camera-offline" ||
    rule.name.toLowerCase().includes("camera offline")
  ) {
    const cameraName = (metadata?.cameraName as string) || (metadata?.cameraId as string) || "Security CCTV camera";
    const duration = metadata?.offline_duration_seconds ?? metadata?.offlineDurationSeconds ?? metadata?.durationSeconds ?? metadata?.downtimeSeconds;
    const durInfo = typeof duration === "number" ? ` for ${Math.round(duration)}s` : "";
    return `${cameraName} dropped offline${durInfo} during active business hours. Continuous surveillance interrupted in violation of NBFC security SLA.`;
  }
  return `Rule \"${rule.name}\" matched.`;
}

function faceIdentity(metadata?: Record<string, unknown>) {
  const source = metadata?.identityMatch ?? metadata?.faceMatch;
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  const value = source as Record<string, unknown>;
  const candidate = value.candidate;
  const candidateName = candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>).name : undefined;
  const similarity = [
    value.similarity,
    value.similarityScore,
    value.score,
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? (candidate as Record<string, unknown>).similarity
      : undefined,
  ].find((score): score is number => typeof score === "number" && Number.isFinite(score));
  return {
    ...value,
    // A candidate label alone is model output, not a verified identity.  Only
    // emit recognition rules after the source explicitly marks a match and it
    // clears the service's production confidence floor.
    matched: value.matched === true && similarity !== undefined && similarity >= 0.82,
    personName: typeof value.personName === "string" ? value.personName : candidateName,
  };
}

function objectClassesMatch(rule: AnalyticsRule, event: AnalyticsEventInput) {
  if (rule.objectClasses.length === 0) return true;
  if (["queue", "queue-length", "queue_length", "shutter-state", "shutter-opened", "shutter-closed", "dual-control-verification", "dual-control-violation", "helmet", "helmet-worn", "face-cover", "face_cover", "mask", "safe-door", "safe-door-open", "safe-door-opened", "safe_door_open", "door-open", "door_open", "door-state", "door_state", "recording", "recording-failure", "recording_failure", "recording-gap", "recording_gap", "RECORDING_FAILURE", "locker-dwell", "locker-session", "locker-dwell-time", "cash-handover", "handover", "cash-counter-object", "cash-counter-handover", "pouch-handover", "tray-handover", "health", "camera-health", "camera-offline", "camera_offline", "device-offline", "offline"].includes(event.detectionType) && event.objects.length === 0) {
    return true;
  }
  return event.objects.some((object) => {
    const objLabel = object.label.toLowerCase();
    return rule.objectClasses.some((label) => {
      const ruleLabel = label.toLowerCase();
      if (objLabel === ruleLabel) return object.confidence >= rule.minConfidence;
      if (
        (ruleLabel === "helmet" || ruleLabel === "face_cover" || ruleLabel === "mask" || ruleLabel === "face-cover") &&
        (objLabel === "helmet" || objLabel === "face_cover" || objLabel === "face-cover" || objLabel === "mask" || objLabel === "face_concealment" || objLabel === "headwear")
      ) {
        return object.confidence >= rule.minConfidence;
      }
      if (
        (ruleLabel === "package" || ruleLabel === "cash_pouch" || ruleLabel === "pouch" || ruleLabel === "bag" || ruleLabel === "cash_tray" || ruleLabel === "tray" || ruleLabel === "cash") &&
        (objLabel === "package" || objLabel === "cash_pouch" || objLabel === "pouch" || objLabel === "bag" || objLabel === "cash_tray" || objLabel === "tray" || objLabel === "cash" || objLabel === "box" || objLabel === "envelope")
      ) {
        return object.confidence >= rule.minConfidence;
      }
      return false;
    });
  });
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
  const dayMatches = (rule.schedule.days as any[]).some(
    (d) => d === day || (typeof d === "string" && d.toLowerCase() === (parts.weekday ?? "").toLowerCase())
  );
  if (!dayMatches) return false;
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
