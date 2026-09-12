import { describe, expect, it } from "vitest";
import type { DetectionFrame } from "../src/detectors/base-detector.js";
import { CameraTamperDetector } from "../src/detectors/camera-tamper-detector.js";

function frame(value: number, timestamp: number): DetectionFrame {
  return {
    cameraId: "camera-1",
    tenantId: "tenant-1",
    timestamp: new Date(timestamp),
    imageData: Buffer.alloc(32 * 32 * 3, value),
    width: 32,
    height: 32,
  };
}

describe("core security detectors", () => {
  it("raises a debounced local optical-tamper alert after a camera blackout", async () => {
    const detector = new CameraTamperDetector();
    await detector.initialize();
    const startedAt = Date.UTC(2026, 0, 1);

    await detector.detect(frame(100, startedAt));
    await detector.detect(frame(0, startedAt + 1_000));
    await detector.detect(frame(0, startedAt + 2_000));
    const results = await detector.detect(frame(0, startedAt + 3_000));

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        detectionType: "camera-tamper",
        requiresAlert: true,
        metadata: expect.objectContaining({ tamperType: "covering" }),
      }),
    ]));
  });
});
