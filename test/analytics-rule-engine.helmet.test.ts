import { describe, expect, it } from "vitest";
import { sortedMatchingRules } from "../src/analytics/rule-engine.js";
import type { AnalyticsEventInput } from "../src/control-plane-store.js";
import type { AnalyticsRule } from "../src/domain/models.js";

const occurredAt = "2026-09-30T00:00:00.000Z";
const event: AnalyticsEventInput = {
  tenantId: "tenant-1", cameraId: "camera-1", sourceEventId: "helmet-1",
  detectionType: "helmet-worn", occurredAt, confidence: 0.95,
  durationSeconds: 1, modelVersion: "1.0.0",
  objects: [{ label: "helmet", confidence: 0.95 }], metadata: {},
};

function rule(detectionType: "helmet" | "helmet-worn" | "no-helmet", minConfidence = 0.7): AnalyticsRule {
  return {
    id: detectionType, tenantId: "tenant-1", cameraId: "camera-1",
    name: detectionType, detectionType, enabled: true, objectClasses: ["helmet"],
    minConfidence, minDurationSeconds: 1, direction: "any", severity: "P2",
    cooldownSeconds: 60, recipients: [], recordingPolicy: "event-recording",
    preRollSeconds: 0, postRollSeconds: 0, createdAt: occurredAt, updatedAt: occurredAt,
  };
}

describe("helmet-worn rule matching", () => {
  it("prefers the dedicated rule when both it and a legacy helmet rule match", () => {
    expect(sortedMatchingRules([rule("helmet"), rule("helmet-worn")], event).map((match) => match.detectionType))
      .toEqual(["helmet-worn"]);
  });

  it("keeps a legacy helmet rule usable when it is the only matching rule", () => {
    expect(sortedMatchingRules([rule("helmet"), rule("helmet-worn", 0.99)], event).map((match) => match.detectionType))
      .toEqual(["helmet"]);
  });

  it("does not match an old no-helmet rule even if it remains enabled", () => {
    const noHelmetEvent = { ...event, detectionType: "no-helmet" };
    expect(sortedMatchingRules([rule("no-helmet")], noHelmetEvent)).toEqual([]);
  });
});
