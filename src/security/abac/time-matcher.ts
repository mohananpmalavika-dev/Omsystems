/**
 * Time of Day & Day-of-Week Contextual Access Evaluator
 * Supports timezone conversion, overnight shifts crossing midnight, and day-of-week filters.
 */

import type { ContextualTimeRule, DayOfWeek } from "./abac.types.js";

const DAY_MAP: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * Normalizes day representation to 0 (Sun) - 6 (Sat)
 */
export function normalizeDayOfWeek(day: number | DayOfWeek): number {
  if (typeof day === "number") {
    // If user provided 1-7 where 7=Sun or 1=Mon, or standard 0-6:
    return day >= 0 && day <= 6 ? day : day % 7;
  }
  const upper = day.toUpperCase().slice(0, 3);
  return DAY_MAP[upper] ?? 0;
}

/**
 * Formats a Date in a specific timezone to HH:MM (24-hour) and returns the day of week (0-6)
 */
export function getLocalTimeDetails(
  date: Date,
  timezone: string = "UTC",
): { hhmm: string; dayOfWeek: number; dayName: string } {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

    const parts = formatter.formatToParts(date);
    let hour = "00";
    let minute = "00";
    let weekdayStr = "Sun";

    for (const part of parts) {
      if (part.type === "hour") hour = part.value;
      if (part.type === "minute") minute = part.value;
      if (part.type === "weekday") weekdayStr = part.value;
    }

    // In 24-hour mode, some runtimes may return "24" for midnight
    if (hour === "24") hour = "00";

    const hhmm = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    const dayName = weekdayStr.toUpperCase().slice(0, 3);
    const dayOfWeek = DAY_MAP[dayName] ?? date.getUTCDay();

    return { hhmm, dayOfWeek, dayName: DAY_NAMES[dayOfWeek] ?? dayName };
  } catch {
    // Fallback to UTC if timezone is invalid
    const hour = date.getUTCHours().toString().padStart(2, "0");
    const min = date.getUTCMinutes().toString().padStart(2, "0");
    const dayOfWeek = date.getUTCDay();
    return {
      hhmm: `${hour}:${min}`,
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek] ?? "SUN",
    };
  }
}

/**
 * Evaluates contextual access based on time of day, day of week, and timezone.
 */
export function evaluateTimeAccess(
  requestDate: Date,
  rule?: ContextualTimeRule,
): {
  passed: boolean;
  currentTime?: string;
  allowedWindow?: string;
  timezone?: string;
  reason?: string;
} {
  if (!rule) {
    return { passed: true };
  }

  const tz = rule.timezone || "UTC";
  const { hhmm, dayOfWeek, dayName } = getLocalTimeDetails(requestDate, tz);

  // 1. Day of week check
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    const allowedDays = rule.daysOfWeek.map(normalizeDayOfWeek);
    if (!allowedDays.includes(dayOfWeek)) {
      const allowedNames = allowedDays.map((d) => DAY_NAMES[d]).join(", ");
      return {
        passed: false,
        currentTime: `${dayName} ${hhmm}`,
        allowedWindow: `Days: [${allowedNames}], Hours: ${rule.startTime}-${rule.endTime} ${tz}`,
        timezone: tz,
        reason: `Request day (${dayName}) is outside allowed days of week [${allowedNames}]`,
      };
    }
  }

  // 2. Time window check
  const start = rule.startTime.padStart(5, "0");
  const end = rule.endTime.padStart(5, "0");
  const isOvernight = rule.allowOvernight ?? start > end;

  let inWindow = false;
  if (!isOvernight) {
    // Standard window: e.g. 09:00 -> 18:00
    inWindow = hhmm >= start && hhmm <= end;
  } else {
    // Overnight window: e.g. 22:00 -> 06:00
    inWindow = hhmm >= start || hhmm <= end;
  }

  if (!inWindow) {
    return {
      passed: false,
      currentTime: `${dayName} ${hhmm}`,
      allowedWindow: `${start}–${end} ${tz}`,
      timezone: tz,
      reason: `Current time (${hhmm} ${tz}) is outside allowed window (${start}–${end} ${tz})`,
    };
  }

  return {
    passed: true,
    currentTime: `${dayName} ${hhmm}`,
    allowedWindow: `${start}–${end} ${tz}`,
    timezone: tz,
  };
}
