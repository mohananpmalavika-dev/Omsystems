import type {
  ApiFamily,
  CapabilityEvidence,
  ProbeEvidence,
  RecorderCapabilities,
  RecorderCapability,
  SupportState,
} from "../types/recorder-profile.types.js";

export class CapabilityDetector {
  detect(evidence: ProbeEvidence[]): RecorderCapabilities {
    return {
      deviceInfo: this.resolve("deviceInfo", evidence),
      channels: this.resolve("channels", evidence),
      liveStream: this.resolve("liveStream", evidence),
      recordingStatus: this.resolve("recordingStatus", evidence),
      playbackSearch: this.resolve("playbackSearch", evidence),
      storageStatus: this.resolve("storageStatus", evidence),
      smartTelemetry: this.resolve("smartTelemetry", evidence),
      deviceTime: this.resolve("deviceTime", evidence),
      events: this.resolve("events", evidence),
      ptz: this.resolve("ptz", evidence),
    };
  }

  private resolve(
    capability: keyof RecorderCapabilities,
    evidenceList: ProbeEvidence[],
  ): RecorderCapability {
    const matchingEvidence: CapabilityEvidence[] = [];
    let preferredApi: ApiFamily | undefined = undefined;

    for (const e of evidenceList) {
      const state = e.capabilities?.[capability];
      if (state) {
        matchingEvidence.push({
          source: e.apiFamily,
          probe: e.probeId,
          state,
          confidence: e.confidence,
          latencyMs: e.latencyMs,
          statusCode: e.statusCode,
          reason: e.reason,
          observedAt: e.observedAt,
          metadata: e.metadata,
        });

        if (e.preferredApiFor?.includes(capability) && !preferredApi && e.outcome === "MATCH") {
          if (e.apiFamily !== "HTTP") {
            preferredApi = e.apiFamily;
          }
        }
      }
    }

    if (!matchingEvidence.length) {
      return {
        state: "UNKNOWN",
        confidence: 0,
        evidence: [],
      };
    }

    // Determine aggregate state & confidence
    const supportedList = matchingEvidence.filter((e) => e.state === "SUPPORTED");
    const partialList = matchingEvidence.filter((e) => e.state === "PARTIAL");

    let finalState: SupportState = "UNKNOWN";
    let finalConfidence = 0;

    if (supportedList.length > 0) {
      finalState = "SUPPORTED";
      finalConfidence = Math.max(...supportedList.map((e) => e.confidence));
      if (!preferredApi) {
        const top = supportedList.sort((a, b) => b.confidence - a.confidence)[0];
        if (top && top.source !== "HTTP") preferredApi = top.source;
      }
    } else if (partialList.length > 0) {
      finalState = "PARTIAL";
      finalConfidence = Math.max(...partialList.map((e) => e.confidence));
      if (!preferredApi) {
        const top = partialList.sort((a, b) => b.confidence - a.confidence)[0];
        if (top && top.source !== "HTTP") preferredApi = top.source;
      }
    } else if (matchingEvidence.some((e) => e.state === "UNSUPPORTED")) {
      finalState = "UNSUPPORTED";
      finalConfidence = 0.8;
    }

    return {
      state: finalState,
      confidence: Number(finalConfidence.toFixed(2)),
      preferredApi,
      evidence: matchingEvidence,
    };
  }
}
