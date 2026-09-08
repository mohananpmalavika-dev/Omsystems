export type TelemetryFreshness = "fresh" | "degraded" | "stale" | "unavailable";

export interface TelemetryFreshnessState {
  state: TelemetryFreshness;
  label: string;
  detail: string;
  ageSeconds: number | null;
}

export function getTelemetryFreshness(
  timestamp: string | null | undefined,
  nowMs = Date.now(),
): TelemetryFreshnessState {
  if (!timestamp) {
    return { state: "unavailable", label: "Telemetry unavailable", detail: "No confirmed telemetry received", ageSeconds: null };
  }

  const observedMs = Date.parse(timestamp);
  if (!Number.isFinite(observedMs)) {
    return { state: "unavailable", label: "Telemetry unavailable", detail: "Telemetry timestamp is invalid", ageSeconds: null };
  }

  if (observedMs > nowMs + 5_000) {
    return { state: "unavailable", label: "Telemetry unavailable", detail: "Telemetry timestamp is in the future", ageSeconds: null };
  }

  const ageSeconds = Math.round((nowMs - observedMs) / 1_000);
  if (ageSeconds <= 60) {
    return { state: "fresh", label: "Telemetry current", detail: `Confirmed ${ageSeconds}s ago`, ageSeconds };
  }
  if (ageSeconds <= 300) {
    return { state: "degraded", label: "Telemetry delayed", detail: `Last confirmed ${ageSeconds}s ago`, ageSeconds };
  }
  return { state: "stale", label: "Telemetry stale", detail: `Last confirmed ${ageSeconds}s ago`, ageSeconds };
}
