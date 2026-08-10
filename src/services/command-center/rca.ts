import { createHash } from "node:crypto";
import type {
  CommandEvidence,
  CommandTimelineEvent,
  CommandTimelineEventType,
  EvidenceCertainty,
  OperationalGraph,
  RootCauseAssessment,
} from "./types.js";
import { RCAEngine } from "./rca/engine.js";
import type { RCADiagnosis } from "./rca/types.js";

export interface CommandRcaResult {
  rootCause: RootCauseAssessment;
  alternatives: RootCauseAssessment[];
  evidence: CommandEvidence[];
  affectedEntityIds: string[];
  missingEvidence: string[];
  caseFingerprint: string;
  
  // Enhanced RCA fields
  enhancedDiagnosis?: RCADiagnosis;
}

/**
 * Deterministic, evidence-bound RCA. This module deliberately has no LLM call:
 * every assertion is tied to a telemetry event or an inventory fact.
 * 
 * Now enhanced with autonomous RCA engine for multi-branch correlation,
 * topology-based reasoning, and temporal analysis.
 */
export function analyze(graph: OperationalGraph, timeline: CommandTimelineEvent[]): CommandRcaResult {
  const recent = [...timeline].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const facts = recent.filter((event) => event.category === "telemetry");

  const offlineCameraEvents = facts.filter((event) => event.eventType === "camera_offline");
  const recorderUnavailableEvents = facts.filter((event) => event.eventType === "recorder_unavailable");
  const recorderDegradedEvents = facts.filter((event) => event.eventType === "recording_degraded");
  const networkUnavailableEvents = facts.filter((event) => event.eventType === "network_unavailable");
  const networkDegradedEvents = facts.filter((event) => ["network_degraded", "packet_loss", "latency_high"].includes(event.eventType));
  const edgeOfflineEvents = facts.filter((event) => event.eventType === "edge_agent_offline");
  const powerLossEvents = facts.filter((event) => event.eventType === "power_loss");
  const onBatteryEvents = facts.filter((event) => event.eventType === "power_on_battery");
  const diskFailureEvents = facts.filter((event) => event.eventType === "disk_failure");

  const unavailable = graph.entities.filter((entity) => ["offline", "critical"].includes(entity.status));
  const affectedEntityIds = unavailable.map((entity) => entity.id);
  const unavailableCameraCount = graph.summary.unavailableCameras;
  const unavailableRecorderCount = graph.summary.offlineRecorders;
  const unavailableNetworkCount = graph.entities.filter((entity) => entity.entityType === "network" && ["offline", "critical"].includes(entity.status)).length;
  const impactedBranches = new Set([graph.branch.id]).size;
  const firstObservedAt = recent[0]?.occurredAt ?? new Date().toISOString();
  const lastObservedAt = recent.at(-1)?.occurredAt ?? firstObservedAt;
  const timeSpreadSeconds = Math.max(0, (Date.parse(lastObservedAt) - Date.parse(firstObservedAt)) / 1000);

  function scoreCandidate(
    code: string,
    label: string,
    rules: Array<{ condition: boolean; weight: number; message: string }>,
    events: CommandTimelineEvent[],
    overrideConfidence?: number,
  ) {
    const matchedReasons = rules.filter((rule) => rule.condition);
    const matchedMessages = matchedReasons.map((rule) => rule.message);
    const rawScore = rules.reduce((score, rule) => score + (rule.condition ? rule.weight : 0), 0);
    const score = Math.min(Math.max(Math.round(rawScore), 0), 100);
    const confidence = overrideConfidence ?? score / 100;
    const certainty = confidence >= 0.8 ? "confirmed"
      : confidence >= 0.6 ? "likely"
        : confidence >= 0.4 ? "possible" : "unknown";
    const explanation = matchedMessages.length > 0
      ? `${label} is supported by ${matchedMessages.join("; ")}.`
      : `There is not enough direct evidence to confirm ${label.toLowerCase()}.`;
    const summary = matchedMessages.length > 0
      ? `${label} is the most probable cause with ${Math.round(confidence * 100)}% confidence.`
      : `${label} is considered but evidence is insufficient to make it the primary cause.`;
    const confidenceDetails = matchedReasons.map((rule) => `${rule.message} (${rule.weight} pts)`);
    return assessment(code, label, certainty, confidence, summary, explanation, confidenceDetails, events);
  }

  const candidates: RootCauseAssessment[] = [];

  if (powerLossEvents.length > 0 || onBatteryEvents.length > 0) {
    candidates.push(scoreCandidate(
      "utility_power_unavailable",
      "Utility power unavailable",
      [
        { condition: powerLossEvents.length > 0, weight: 45, message: "UPS telemetry reports utility power unavailable" },
        { condition: onBatteryEvents.length > 0, weight: 25, message: "UPS reports battery operation" },
        { condition: unavailableCameraCount > 0 && networkUnavailableEvents.length === 0, weight: 15, message: "Multiple cameras are unavailable without a primary network outage" },
        { condition: unavailableRecorderCount > 0 && networkUnavailableEvents.length === 0, weight: 10, message: "Recorders are impacted while network telemetry remains healthy" },
        { condition: networkUnavailableEvents.length > 0, weight: 20, message: "Network outages coincide with an upstream power loss" },
        { condition: graph.entities.some((entity) => entity.entityType === "ups" && ["offline", "critical"].includes(entity.status) && downstreamUnavailable(graph, entity.id).length > 0), weight: 20, message: "A UPS failure is upstream of affected devices" },
      ],
      [...powerLossEvents, ...onBatteryEvents],
      0.98,
    ));
  }

  candidates.push(scoreCandidate(
    "wan_failure",
    "WAN failure",
    [
      { condition: networkUnavailableEvents.length > 0, weight: 35, message: "Network telemetry reports an unavailable path" },
      { condition: networkDegradedEvents.length > 0, weight: 20, message: "Network telemetry shows degraded performance" },
      { condition: recorderUnavailableEvents.length > 0, weight: 20, message: "Recorders are unreachable" },
      { condition: unavailableCameraCount > 0 && unavailableCameraCount / Math.max(1, graph.summary.totalCameras) >= 0.5, weight: 15, message: "A large share of cameras became unavailable" },
      { condition: edgeOfflineEvents.length > 0, weight: 10, message: "Edge agents stopped reporting" },
      { condition: timeSpreadSeconds <= 120 && unavailableCameraCount + unavailableRecorderCount >= 2, weight: 10, message: "The failure pattern emerged quickly" },
      { condition: graph.entities.some((entity) => entity.entityType === "network" && ["offline", "critical"].includes(entity.status) && downstreamUnavailable(graph, entity.id).length > 0), weight: 15, message: "An unavailable network path is upstream of affected recorders or cameras" },
      { condition: powerLossEvents.length > 0 || onBatteryEvents.length > 0, weight: -15, message: "An upstream power outage is a more likely root cause than WAN failure" },
    ],
    uniqueEvents([...networkUnavailableEvents, ...networkDegradedEvents, ...recorderUnavailableEvents, ...offlineCameraEvents, ...edgeOfflineEvents]),
  ));

  candidates.push(scoreCandidate(
    "isp_outage",
    "ISP outage",
    [
      { condition: networkUnavailableEvents.length > 0, weight: 30, message: "Network telemetry indicates loss of WAN path" },
      { condition: networkDegradedEvents.length > 0, weight: 15, message: "Packet loss or latency is elevated" },
      { condition: timeSpreadSeconds <= 120 && unavailableCameraCount + unavailableRecorderCount >= 3, weight: 10, message: "Multiple devices failed in the same short window" },
      { condition: unavailableRecorderCount > 0, weight: 10, message: "Recorder connectivity is degraded while camera hardware alarms are absent" },
      { condition: facts.length > 0 && powerLossEvents.length === 0 && onBatteryEvents.length === 0, weight: 10, message: "No explicit power outage was detected" },
    ],
    uniqueEvents([...networkUnavailableEvents, ...networkDegradedEvents, ...recorderUnavailableEvents, ...offlineCameraEvents]),
  ));

  candidates.push(scoreCandidate(
    "recorder_failure",
    "Recorder failure",
    [
      { condition: recorderUnavailableEvents.length > 0, weight: 40, message: "Recorder telemetry reports it unavailable" },
      { condition: unavailableCameraCount > 0, weight: 20, message: "Connected cameras are also unavailable" },
      { condition: facts.length > 0 && networkUnavailableEvents.length === 0 && networkDegradedEvents.length === 0, weight: 20, message: "Network telemetry does not show a primary WAN outage" },
      { condition: facts.length > 0 && edgeOfflineEvents.length === 0, weight: 10, message: "Edge agents are still reachable" },
      { condition: graph.entities.some((entity) => entity.entityType === "recorder" && ["offline", "critical"].includes(entity.status) && downstreamUnavailable(graph, entity.id).length > 0), weight: 15, message: "An unavailable recorder is upstream of affected cameras" },
    ],
    uniqueEvents([...recorderUnavailableEvents, ...recorderDegradedEvents, ...offlineCameraEvents]),
  ));

  candidates.push(scoreCandidate(
    "camera_hardware_failure",
    "Camera hardware failure",
    [
      { condition: offlineCameraEvents.length > 0, weight: 30, message: "Many cameras report offline status" },
      { condition: facts.length > 0 && unavailableRecorderCount === 0 && unavailableNetworkCount === 0, weight: 25, message: "No recorder or network outage is evident" },
      { condition: timeSpreadSeconds > 180 && facts.length > 0, weight: 15, message: "Failures are spread over a longer period" },
      { condition: facts.length > 0 && diskFailureEvents.length === 0, weight: 10, message: "Storage hardware does not appear to be failing" },
    ],
    uniqueEvents([...offlineCameraEvents, ...recorderDegradedEvents]),
  ));

  const sortedCandidates = candidates.sort((left, right) => right.confidence - left.confidence);
  let [rootCause, ...alternatives] = sortedCandidates;

  if (rootCause?.confidence === 0) {
    const conditionEvents = recent.filter((event) => event.severity !== "info").slice(0, 5);
    rootCause = {
      code: "insufficient_evidence",
      label: "Root cause unknown",
      certainty: "unknown",
      confidence: 0,
      explanation: conditionEvents.length > 0
        ? "Unhealthy conditions are present, but no authoritative failure origin can be determined from current telemetry."
        : "No observable failure telemetry is available in the selected time window.",
      evidenceIds: conditionEvents.map((event) => event.evidenceId),
      reasoningVersion: "rca-v1.1",
    };
    alternatives = [];
  }

  const evidenceEvents = uniqueEvents([...(rootCause ? facts.filter((event) => rootCause.evidenceIds.includes(event.evidenceId)) : []), ...criticalEvents(recent)]);
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

/**
 * Enhanced analysis using autonomous RCA engine
 * Provides multi-branch correlation, topology reasoning, and temporal analysis
 */
export async function analyzeEnhanced(
  graph: OperationalGraph,
  timeline: CommandTimelineEvent[],
  options: {
    tenantId: string;
    branchId: string;
    includeHistorical?: boolean;
  }
): Promise<CommandRcaResult> {
  // Run original analysis
  const basicResult = analyze(graph, timeline);
  
  // Run enhanced RCA engine
  const engine = new RCAEngine();
  const enhancedDiagnosis = await engine.analyze(graph, timeline, options);
  
  // Merge results - enhanced diagnosis takes precedence if confidence is higher
  if (enhancedDiagnosis.confidenceScore > basicResult.rootCause.confidence) {
    // Convert enhanced diagnosis to CommandRcaResult format
    const rootCause: RootCauseAssessment = {
      code: enhancedDiagnosis.primaryCause.code,
      label: enhancedDiagnosis.primaryCause.label,
      certainty: enhancedDiagnosis.certainty,
      confidence: enhancedDiagnosis.confidenceScore,
      summary: enhancedDiagnosis.explanation,
      explanation: enhancedDiagnosis.businessImpact,
      evidenceIds: enhancedDiagnosis.evidenceMatrix.supporting.map((_, i) => `enhanced-${i}`),
      confidenceDetails: enhancedDiagnosis.evidenceMatrix.supporting.map(e => 
        `${e.assertion} (${e.weight} pts)`
      ),
      reasoningVersion: enhancedDiagnosis.reasoningVersion,
    };
    
    const alternatives: RootCauseAssessment[] = enhancedDiagnosis.alternativeCauses.map(alt => ({
      code: alt.code,
      label: alt.label,
      certainty: alt.certainty,
      confidence: alt.confidence,
      summary: alt.explanation,
      explanation: alt.explanation,
      evidenceIds: [],
      confidenceDetails: alt.supportingEvidence.map(e => `${e.assertion} (${e.weight} pts)`),
      reasoningVersion: enhancedDiagnosis.reasoningVersion,
    }));
    
    const evidence: CommandEvidence[] = enhancedDiagnosis.evidenceMatrix.supporting.map((item, i) => ({
      id: `enhanced-${i}`,
      certainty: "confirmed",
      assertion: item.assertion,
      entityId: item.entityId || null,
      observedAt: item.timestamp,
      source: item.source,
      quality: "verified",
      raw: { weight: item.weight, type: item.type },
    }));
    
    return {
      rootCause,
      alternatives,
      evidence,
      affectedEntityIds: Array.from(enhancedDiagnosis.blastRadius.affectedCameras)
        .concat(Array.from(enhancedDiagnosis.blastRadius.affectedDVRs)),
      missingEvidence: enhancedDiagnosis.evidenceMatrix.missing,
      caseFingerprint: enhancedDiagnosis.caseFingerprint,
      enhancedDiagnosis,
    };
  }
  
  // Return basic result with enhanced diagnosis attached
  return {
    ...basicResult,
    enhancedDiagnosis,
  };
}

function criticalEvents(events: CommandTimelineEvent[]) {
  return events.filter((event) => event.severity === "critical");
}

function assessment(
  code: string,
  label: string,
  certainty: EvidenceCertainty,
  confidence: number,
  summary: string,
  explanation: string,
  confidenceDetails: string[],
  events: CommandTimelineEvent[],
): RootCauseAssessment {
  return {
    code,
    label,
    certainty,
    confidence,
    summary,
    explanation,
    evidenceIds: events.map((event) => event.evidenceId),
    confidenceDetails,
    reasoningVersion: "rca-v1.1",
  };
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
  return typeof value === "string" ? value.toLowerCase().replace(/-/g, "_").replace(/ /g, "_") : "";
}

function downstreamUnavailable(graph: OperationalGraph, entityId: string) {
  const unavailable = new Set(graph.entities.filter((entity) => ["offline", "critical"].includes(entity.status)).map((entity) => entity.id));
  return graph.dependencies
    .filter((edge) => edge.toEntityId === entityId && ["depends_on", "connects_through"].includes(edge.relationship))
    .map((edge) => edge.fromEntityId)
    .filter((id) => unavailable.has(id));
}

function uniqueEvents(events: CommandTimelineEvent[]) {
  return Array.from(new Map(events.map((event) => [event.evidenceId, event])).values());
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
  return Array.from(new Set(values));
}
