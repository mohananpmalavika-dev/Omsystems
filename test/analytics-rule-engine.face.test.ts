import { describe, expect, it } from "vitest";
import { eventDetectionTypes } from "../src/analytics/rule-engine.js";
import type { AnalyticsEventInput } from "../src/control-plane-store.js";

function faceEvent(metadata: Record<string, unknown>): AnalyticsEventInput {
  return {
    tenantId: "omsystems",
    cameraId: "cam-001",
    sourceEventId: "face-event",
    detectionType: "face-recognition",
    occurredAt: "2026-09-09T00:00:00.000Z",
    confidence: 0.99,
    durationSeconds: 0,
    modelVersion: "face-model",
    objects: [],
    metadata,
  };
}

describe("face-recognition rule classification", () => {
  it("does not treat an unverified candidate label as a recognised person", () => {
    expect(eventDetectionTypes(faceEvent({
      faceMatch: { matched: false, candidate: { name: "Unverified candidate", similarity: 0.99 } },
    }))).toContain("unknown-person");
  });

  it("requires an explicit, high-confidence match before triggering recognition", () => {
    expect(eventDetectionTypes(faceEvent({
      identityMatch: { matched: true, personName: "Approved Person", similarity: 0.82 },
    }))).toContain("face-recognition");
    expect(eventDetectionTypes(faceEvent({
      identityMatch: { matched: true, personName: "Low confidence", similarity: 0.81 },
    }))).toContain("unknown-person");
  });
});
