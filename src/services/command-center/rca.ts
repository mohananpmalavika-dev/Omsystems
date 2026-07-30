import { createHash } from "node:crypto";
import type {
  CommandEvidence,
  CommandTimelineEvent,
  EvidenceCertainty,
  OperationalGraph,
  RootCauseAssessment,
} from "./types.js";

export interface CommandRcaResult {
  rootCause: RootCauseAssessment;
  alternatives: RootCauseAssessment[];
  evidence: CommandEvidence[];
  affectedEntityIds: string[];
  missingEvidence: string[];
  caseFingerprint: string;
}

/**
 * Deterministic, evidence-bound RCA. This module deliberately has no LLM call:
 * every assertion is tied to a telemetry event or an inventory fact.
 */
export function analyze(graph: OperationalGraph, timeline: CommandTimelineEvent[]): CommandRcaResult {
  const recent = [...timeline].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const facts = recent.filter((event) => event.category === "telemetry");
  const explicitPowerFailure = facts.find((event) =>
    event.entityType === "ups" && event.raw.metrics != null
    && metric(event, "utilityPowerAvailable") === false);
  const upsOnBattery = facts.find((event) => event.entityType === "ups" && metric(event, "onBattery") === true);
  const offlineNetwork = facts.find((event) =>
    event.entityType === "network" && (
      metric(event, "connectivity") === false || metric(event, "reachable") === false
      || normalized(metric(event, "status")) === "offline"
    ));
  const offlineRecorder = facts.find((event) =>
    event.entityType === "recorder" && (
      metric(event, "reachable") === false || normalized(metric(event, "status")) === "offline"
      || normalized(metric(event, "recordingStatus")) === "not_recording"
    ));

  const unavailable = graph.entities.filter((entity) => ["offline", "critical"].includes(entity.status));
  const affectedEntityIds = unavailable.map((entity) => entity.id);
  const candidates: RootCauseAssessment[] = [];
  const selectedEvents: CommandTimelineEvent[] = [];

  if (explicitPowerFailure) {
    selectedEvents.push(explicitPowerFailure);
    if (upsOnBattery && upsOnBattery.id !== explicitPowerFailure.id) selectedEvents.push(upsOnBattery);
    candidates.push(assessment(
      "utility_power_unavailable",
      "Utility power unavailable",
      "confirmed",
      0.98,
      "UPS telemetry explicitly reports utility power as unavailable.",
      selectedEvents,
    ));
  } else if (upsOnBattery) {
    selectedEvents.push(upsOnBattery);
    candidates.push(assessment(
      "upstream_power_interruption",
      "Upstream power interruption",
      "likely",
      0.78,
      "The UPS reports battery operation, which is consistent with an upstream power interruption; utility input state was not explicitly reported.",
      [upsOnBattery],
    ));
  }

  if (offlineNetwork) {
    const downstream = downstreamUnavailable(graph, `network:${offlineNetwork.entityId ?? ""}`);
    const causal = candidates.length === 0;
    candidates.push(assessment(
      "network_path_unavailable",
      "Network path unavailable",
      causal ? "likely" : "possible",
      causal ? 0.82 : 0.55,
      downstream.length > 0
        ? `Network telemetry reports an unavailable path and ${downstream.length} dependent entities are unavailable.`
        : "Network telemetry reports an unavailable path; dependency evidence is not sufficient to prove downstream causation.",
      [offlineNetwork],
    ));
    if (causal) selectedEvents.push(offlineNetwork);
  }

  if (offlineRecorder) {
    const recorderGraphId = `recorder:${offlineRecorder.entityId ?? ""}`;
    const mappedCameras = graph.dependencies
      .filter((edge) => edge.toEntityId === recorderGraphId && edge.relationship === "records_to")
      .map((edge) => edge.fromEntityId);
    const unavailableMapped = mappedCameras.filter((id) => unavailable.some((entity) => entity.id === id));
    const causal = candidates.length === 0;
    candidates.push(assessment(
      "recorder_unavailable",
      "Recorder unavailable",
      mappedCameras.length > 0 ? "likely" : "possible",
      mappedCameras.length > 0 ? 0.86 : 0.62,
      mappedCameras.length > 0
        ? `Recorder telemetry reports it unavailable; ${unavailableMapped.length} of ${mappedCameras.length} mapped cameras are also unavailable.`
        : "Recorder telemetry reports it unavailable, but camera-to-recorder mapping is missing, so downstream impact cannot be proven.",
      [offlineRecorder],
    ));
    if (causal) selectedEvents.push(offlineRecorder);
  }

  if (candidates.length === 0) {
    const conditionEvents = recent.filter((event) => event.severity !== "info").slice(0, 5);
    selectedEvents.push(...conditionEvents);
    candidates.push({
      code: "insufficient_evidence",
      label: "Root cause unknown",
      certainty: "unknown",
      confidence: 0,
      explanation: conditionEvents.length > 0
        ? "Unhealthy conditions are present, but no authoritative power, network, or recorder signal establishes a causal origin."
        : "No authoritative failure telemetry is available for this branch in the selected time window.",
      evidenceIds: conditionEvents.map((event) => event.evidenceId),
    });
  }

  const [rootCause, ...alternatives] = candidates;
  const evidenceEvents = uniqueEvents([
    ...selectedEvents,
    ...recent.filter((event) => rootCause!.evidenceIds.includes(event.evidenceId)),
  ]);
  const evidence = evidenceEvents.map(toEvidence);
  const missingEvidence = missing(graph, facts, rootCause!.certainty);
  const fingerprint = createHash("sha256")
    .update(`${graph.branch.id}|${rootCause!.code}|${affectedEntityIds.sort().join(",")}`)
    .digest("hex")
    .slice(0, 24);
  return {
    rootCause: rootCause!,
    alternatives,
    evidence,
    affectedEntityIds,
    missingEvidence,
    caseFingerprint: fingerprint,
  };
}

function assessment(
  code: string,
  label: string,
  certainty: EvidenceCertainty,
  confidence: number,
  explanation: string,
  events: CommandTimelineEvent[],
): RootCauseAssessment {
  return { code, label, certainty, confidence, explanation, evidenceIds: events.map((event) => event.evidenceId) };
}

function toEvidence(event: CommandTimelineEvent): CommandEvidence {
  const quality = event.source.includes(":verified") ? "verified"
    : event.source.includes(":estimated") ? "estimated"
      : event.source.includes(":unsupported") ? "unsupported"
        : event.source.includes(":unavailable") ? "unavailable" : "system";
  return {
    id: event.evidenceId,
    certainty: "confirmed",
    assertion: `${event.title}: ${event.detail}`,
    entityId: event.entityId,
    observedAt: event.occurredAt,
    source: event.source,
    quality,
    raw: event.raw,
  };
}

function metric(event: CommandTimelineEvent, name: string): unknown {
  const metrics = event.raw.metrics;
  return metrics && typeof metrics === "object" ? (metrics as Record<string, unknown>)[name] : undefined;
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_") : "";
}

function downstreamUnavailable(graph: OperationalGraph, entityId: string) {
  const unavailable = new Set(graph.entities.filter((entity) => ["offline", "critical"].includes(entity.status)).map((entity) => entity.id));
  return graph.dependencies
    .filter((edge) => edge.toEntityId === entityId && ["depends_on", "connects_through"].includes(edge.relationship))
    .map((edge) => edge.fromEntityId)
    .filter((id) => unavailable.has(id));
}

function uniqueEvents(events: CommandTimelineEvent[]) {
  return [...new Map(events.map((event) => [event.evidenceId, event])).values()];
}

function missing(graph: OperationalGraph, events: CommandTimelineEvent[], certainty: EvidenceCertainty) {
  const types = new Set(events.map((event) => event.entityType));
  const values: string[] = [];
  if (!types.has("ups")) values.push("UPS input and battery telemetry");
  if (!types.has("network")) values.push("primary and backup network path telemetry");
  if (!types.has("recorder")) values.push("recorder reachability and recording-state telemetry");
  if (graph.summary.totalCameras > 0 && !graph.dependencies.some((edge) => edge.relationship === "records_to")) {
    values.push("camera-to-recorder channel mapping");
  }
  if (certainty === "unknown") values.push("a time-correlated upstream failure signal");
  return [...new Set(values)];
}
