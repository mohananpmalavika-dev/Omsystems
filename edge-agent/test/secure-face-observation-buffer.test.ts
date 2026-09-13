import { describe, expect, it } from "vitest";
import { SecureFaceObservationBuffer } from "../src/ai/secure-face-observation-buffer.js";

const observation = {
  edgeEventId: "5f5e16d5-869e-4a0e-9f2a-79f3bfa84c28",
  embedding: Array.from({ length: 512 }, (_, index) => index === 0 ? 1 : 0),
  livenessScore: 0.98,
  faceBbox: { x: 1, y: 2, width: 80, height: 80 },
  modelName: "test-recognizer",
  modelVersion: "1",
};

describe("SecureFaceObservationBuffer", () => {
  it("does not release one-frame identity observations", () => {
    const buffer = new SecureFaceObservationBuffer(3);
    expect(buffer.accept("camera-1", observation)).toBeNull();
    expect(buffer.accept("camera-1", observation)).toBeNull();
    expect(buffer.accept("camera-1", observation)).toMatchObject({ observationCount: 3, livenessScore: 0.98 });
  });
});
