import type { OperationalGraph } from "./operational-kg.js";

export function analyze(graph: OperationalGraph, timeline: any[]) {
  const evidence: string[] = [];
  const impacted: string[] = [];
  let rootCause = "unknown";
  let confidence = 0.0;

  const totalCameras = (graph.cameras || []).length;
  const offlineCameras = (graph.cameras || []).filter((c: any) => (c.status ?? "unknown") === "offline");

  // Heuristic: if many cameras offline and they map to one recorder => recorder problem
  for (const [recorderId, cams] of Object.entries(graph.byRecorder || {})) {
    if (recorderId === "__no_recorder__") continue;
    if ((cams as any[]).length > 0 && (offlineCameras.length >= Math.max(1, (cams as any[]).length))) {
      rootCause = "recorder_unavailable";
      evidence.push(`recorder:${recorderId}_channels_failed`);
      impacted.push(...(cams as any[]).map(c => c.id));
      confidence = 0.75;
      break;
    }
  }

  // Power-related signals in timeline
  const powerEvent = timeline.find((t: any) => JSON.stringify(t.source).toLowerCase().includes("ups") || JSON.stringify(t.source).toLowerCase().includes("power"));
  if (powerEvent) {
    evidence.push("power_event_detected");
    if (rootCause === "unknown") {
      rootCause = "power_failure";
      confidence = Math.max(confidence, 0.8);
    } else {
      confidence = Math.min(0.95, confidence + 0.1);
    }
  }

  // If many cameras offline but no recorder grouping -> network outage
  if (rootCause === "unknown" && offlineCameras.length > Math.max(3, Math.floor(totalCameras * 0.25))) {
    rootCause = "network_outage";
    evidence.push("many_cameras_offline_without_single_recorder_failure");
    confidence = 0.6;
    impacted.push(...offlineCameras.map((c: any) => c.id));
  }

  if (rootCause === "unknown") {
    evidence.push("insufficient_evidence");
    confidence = 0.2;
  }

  return {
    rootCause,
    confidence,
    evidence,
    impactedEntities: impacted,
    timelineHead: timeline.slice(0, 10),
  };
}
