import { describe, expect, it } from "vitest";
import type { DetectionFrame, InferenceObject } from "../src/detectors/base-detector.js";
import { SmokeFireDetector } from "../src/detectors/smoke-fire-detector.js";
import { HelmetDetector } from "../src/detectors/helmet-detector.js";
import { FaceDetector } from "../src/detectors/face-detector.js";
import { ANPRDetector } from "../src/detectors/anpr-detector.js";

const object = (label: string, confidence: number, boundingBox = { x: 0.1, y: 0.1, width: 0.4, height: 0.4 }): InferenceObject => ({
  label, confidence, boundingBox,
});

function frame(detections: InferenceObject[] = []): DetectionFrame {
  return {
    cameraId: "camera-1", tenantId: "tenant-1", timestamp: new Date("2026-07-30T10:00:00.000Z"),
    imageData: Buffer.alloc(100 * 100 * 3, 127), width: 100, height: 100,
    metadata: { inferenceMode: "local-onnx", detections },
  };
}

describe("local specialty model adapters", () => {
  it("produces fire and smoke events without external detections", async () => {
    const detector = new SmokeFireDetector({ run: async () => [object("fire", 0.93)] });
    await detector.initialize();
    const results = await detector.detect(frame());
    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ detectionType: "fire", requiresAlert: true })]));
    expect(detector.getHealth().status).toBe("healthy");
  });

  it("combines local head inference with tracked rider objects for no-helmet detection", async () => {
    const detector = new HelmetDetector({
      run: async () => [object("head", 0.94, { x: 0.18, y: 0.11, width: 0.12, height: 0.1 })],
    });
    await detector.initialize();
    const results = await detector.detect(frame([
      object("person", 0.95, { x: 0.1, y: 0.1, width: 0.4, height: 0.8 }),
      object("motorcycle", 0.91, { x: 0.1, y: 0.45, width: 0.5, height: 0.45 }),
    ]));
    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ detectionType: "no-helmet", requiresAlert: true })]));
    expect(detector.getHealth().status).toBe("healthy");
  });

  it("runs local face detection and embedding watchlist matching", async () => {
    const detector = new FaceDetector(
      { recognitionEnabled: true, detectionConfidence: 0.5 },
      {
        detection: { run: async () => [object("face", 0.96)] },
        embedding: { run: async () => [1, 0] },
      },
    );
    await detector.loadWatchlist("tenant-1", "watchlist-1", [{ id: "person-1", embedding: [1, 0] }]);
    await detector.initialize();
    const results = await detector.detect(frame());
    expect(results.map((result) => result.detectionType)).toEqual(["face", "face-recognition"]);
    expect(detector.getHealth().status).toBe("healthy");
  });

  it("runs local plate detection and CTC recognition", async () => {
    const detector = new ANPRDetector({}, {
      detection: { run: async () => [object("license-plate", 0.96, { x: 0.2, y: 0.6, width: 0.5, height: 0.15 })] },
      recognition: { run: async () => ({ text: "DL01CA1234", confidence: 0.95, characters: [] }) },
    });
    await detector.initialize();
    const results = await detector.detect(frame());
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ detectionType: "anpr", metadata: expect.objectContaining({ plates: ["DL01CA1234"] }) }),
    ]));
    expect(detector.getHealth().status).toBe("healthy");
  });
});
