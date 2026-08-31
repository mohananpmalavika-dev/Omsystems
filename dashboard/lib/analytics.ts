"use client";

export interface AnalyticsEvent {
  category: string;
  action: string;
  label?: string;
  value?: number;
  metadata?: Record<string, unknown>;
}

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: "ms" | "bytes" | "count" | "percent";
  metadata?: Record<string, unknown>;
}

export interface AnalyticsError {
  error: Error | unknown;
  context: string;
  severity: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, unknown>;
}

type QueuedEvent = AnalyticsEvent & { timestamp: string };
type QueuedMetric = PerformanceMetric & { timestamp: string };
type QueuedError = {
  error: string;
  context: string;
  severity: AnalyticsError["severity"];
  metadata: Record<string, unknown>;
  timestamp: string;
};

const FLUSH_INTERVAL_MS = 10_000;
const MAX_ITEMS_PER_KIND = 100;
const activitySessionKey = "activitySessionId";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sensitiveKey = /password|passcode|secret|token|credential|authorization|cookie|api.?key|private.?key|query|search.?term/i;

let events: QueuedEvent[] = [];
let performance: QueuedMetric[] = [];
let errors: QueuedError[] = [];
let flushTimer: ReturnType<typeof setInterval> | undefined;
let flushInProgress = false;

function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 250);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeMetadata(item, depth + 1));
  if (!value || typeof value !== "object") return String(value).slice(0, 250);

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    output[key.slice(0, 100)] = sensitiveKey.test(key)
      ? "[redacted]"
      : sanitizeMetadata(item, depth + 1);
  }
  return output;
}

function safeMetadata(value?: Record<string, unknown>) {
  return (sanitizeMetadata(value ?? {}) as Record<string, unknown>);
}

function activeSessionId() {
  if (typeof window === "undefined") return undefined;
  const sessionId = window.sessionStorage.getItem(activitySessionKey)?.trim();
  return sessionId && uuidPattern.test(sessionId) ? sessionId : undefined;
}

function ensureTimer() {
  if (typeof window === "undefined" || flushTimer) return;
  flushTimer = setInterval(() => void flushAnalytics(), FLUSH_INTERVAL_MS);
}

function retainFailedBatch(batch: {
  events: QueuedEvent[];
  performance: QueuedMetric[];
  errors: QueuedError[];
}) {
  events = [...batch.events, ...events].slice(-MAX_ITEMS_PER_KIND);
  performance = [...batch.performance, ...performance].slice(-MAX_ITEMS_PER_KIND);
  errors = [...batch.errors, ...errors].slice(-MAX_ITEMS_PER_KIND);
}

async function flushAnalytics(useBeacon = false) {
  if (typeof window === "undefined" || flushInProgress) return;
  const sessionId = activeSessionId();
  if (!sessionId || (!events.length && !performance.length && !errors.length)) return;

  const batch = { events, performance, errors };
  events = [];
  performance = [];
  errors = [];
  flushInProgress = true;

  const payload = JSON.stringify({
    sessionId,
    timestamp: new Date().toISOString(),
    ...batch,
  });

  try {
    if (useBeacon && typeof navigator.sendBeacon === "function") {
      const queued = navigator.sendBeacon(
        "/api/v1/analytics",
        new Blob([payload], { type: "application/json" }),
      );
      if (!queued) throw new Error("browser rejected analytics beacon");
      return;
    }

    const response = await fetch("/api/v1/analytics", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
    if (!response.ok) throw new Error(`analytics ingestion failed (${response.status})`);
  } catch {
    retainFailedBatch(batch);
  } finally {
    flushInProgress = false;
  }
}

export function trackEvent(event: AnalyticsEvent) {
  events.push({
    ...event,
    category: event.category.slice(0, 50),
    action: event.action.slice(0, 100),
    label: event.label?.slice(0, 255),
    metadata: safeMetadata(event.metadata),
    timestamp: new Date().toISOString(),
  });
  events = events.slice(-MAX_ITEMS_PER_KIND);
  ensureTimer();
}

export function trackPerformance(metric: PerformanceMetric) {
  if (!Number.isFinite(metric.value)) return;
  performance.push({
    ...metric,
    name: metric.name.slice(0, 80),
    metadata: safeMetadata(metric.metadata),
    timestamp: new Date().toISOString(),
  });
  performance = performance.slice(-MAX_ITEMS_PER_KIND);
  ensureTimer();
}

export function trackError(input: AnalyticsError) {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  errors.push({
    error: message.slice(0, 2_000),
    context: input.context.slice(0, 255),
    severity: input.severity,
    metadata: safeMetadata(input.metadata),
    timestamp: new Date().toISOString(),
  });
  errors = errors.slice(-MAX_ITEMS_PER_KIND);
  ensureTimer();
}

export function trackApiCall(
  endpoint: string,
  method: string,
  durationMs: number,
  success: boolean,
  status?: number,
) {
  trackEvent({
    category: "api",
    action: `${method.toLowerCase()}.${success ? "success" : "failure"}`,
    label: endpoint,
    value: Number.isFinite(durationMs) ? durationMs : undefined,
    metadata: { status },
  });
}

export function trackSearch(query: string, resultsCount: number) {
  trackEvent({
    category: "search",
    action: "completed",
    value: Number.isFinite(resultsCount) ? resultsCount : undefined,
    metadata: { queryLength: query.length },
  });
}

export function cleanupAnalytics() {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = undefined;
  void flushAnalytics(true);
}
