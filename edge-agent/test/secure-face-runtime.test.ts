import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SecureFaceRuntime } from "../src/ai/secure-face-runtime.js";

describe("SecureFaceRuntime End-to-End ONNX Test", () => {
  it("initializes successfully with audited manifest and verified ONNX models", async () => {
    const manifestPath = fileURLToPath(new URL("../models/secure-face/manifest.json", import.meta.url));
    const runtime = new SecureFaceRuntime({
      manifestPath,
      minLivenessScore: 0.95,
      executionProviders: ["cpu"],
    });

    await runtime.initialize();
    const status = runtime.status();
    expect(status.available).toBe(true);
    expect(status.reason).toBeNull();
    expect(status.artifacts).toHaveLength(3);
    expect(status.artifacts.map((a) => a.id).sort()).toEqual(["detector", "liveness", "recognizer"]);

    // Test RGB frame observation (640x480 RGB = 640 * 480 * 3 bytes)
    const frameWidth = 640;
    const frameHeight = 480;
    const dummyRgb = Buffer.alloc(frameWidth * frameHeight * 3, 128);

    const observation = await runtime.observeRgbFrame(dummyRgb, frameWidth, frameHeight);
    expect(observation).not.toBeNull();
    if (observation) {
      expect(observation.livenessScore).toBeGreaterThanOrEqual(0.95);
      expect(observation.embedding).toHaveLength(512);
      expect(observation.faceBbox.width).toBeGreaterThanOrEqual(40);
      expect(observation.faceBbox.height).toBeGreaterThanOrEqual(40);
      expect(observation.modelName).toBe("approved-512d-recognizer");
    }
  });

  it("fails closed when manifest is invalid or checksum mismatches", async () => {
    const runtime = new SecureFaceRuntime({
      manifestPath: fileURLToPath(new URL("../models/secure-face/manifest.example.json", import.meta.url)),
      minLivenessScore: 0.95,
    });
    await expect(runtime.initialize()).rejects.toThrow();
  });
});
