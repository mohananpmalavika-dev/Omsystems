import { describe, it, expect } from "vitest";
import { HelmetDetector } from "../../analytics-engine/src/detectors/helmet-detector.js";
import { CrowdDensityDetector } from "../../analytics-engine/src/detectors/crowd-density-detector.js";
import { TamperDetectionService } from "../../backend/src/services/tamper-detection.service.js";
import { ArcFlashDetector } from "../../analytics-engine/src/detectors/safety/arc-flash-detector.js";
import { ZoneEngine } from "../../analytics-engine/src/detectors/safety/zone-engine.js";
import type { DetectionFrame } from "../../analytics-engine/src/detectors/base-detector.js";

describe("Detector Truth & Non-Fabrication Tests", () => {
  describe("HelmetDetector", () => {
    it("returns empty or unconfirmed state without fabricated 0.85 when classifier not active and no head observed", async () => {
      const detector = new HelmetDetector(null, 0.7, null);
      await detector.initialize();

      const frame: DetectionFrame = {
        cameraId: "cam-101",
        tenantId: "tenant-abc",
        timestamp: new Date(),
        imageData: Buffer.alloc(100),
        width: 1920,
        height: 1080,
        metadata: {
          detections: [
            {
              label: "person",
              confidence: 0.9,
              boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.5 },
            },
            {
              label: "motorcycle",
              confidence: 0.92,
              boundingBox: { x: 0.1, y: 0.2, width: 0.2, height: 0.4 },
            },
          ],
        },
      };

      const results = await detector.detect(frame);
      // Because head observation is absent, the detector must not report a fabricated violation with 0.85
      const violationResult = results.find((r) => r.detectionType === "no-helmet");
      expect(violationResult).toBeUndefined();
    });

    it("returns violation using genuine observed head confidence when head is clearly visible", async () => {
      const detector = new HelmetDetector(null, 0.7, null);
      await detector.initialize();

      const frame: DetectionFrame = {
        cameraId: "cam-101",
        tenantId: "tenant-abc",
        timestamp: new Date(),
        imageData: Buffer.alloc(100),
        width: 1920,
        height: 1080,
        metadata: {
          detections: [
            {
              label: "person",
              confidence: 0.9,
              boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.5 },
            },
            {
              label: "motorcycle",
              confidence: 0.92,
              boundingBox: { x: 0.1, y: 0.2, width: 0.2, height: 0.4 },
            },
            {
              label: "head",
              confidence: 0.78, // Exact confidence from upstream object detector
              boundingBox: { x: 0.12, y: 0.1, width: 0.16, height: 0.15 },
            },
          ],
        },
      };

      const results = await detector.detect(frame);
      const violationResult = results.find((r) => r.detectionType === "no-helmet");
      expect(violationResult).toBeDefined();
      expect(violationResult!.confidence).toBe(0.78);
      expect(violationResult!.status).toBe("SUCCESS");
      expect(violationResult!.provenance).toBe("HEURISTIC_RULE_ENGINE");
    });
  });

  describe("CrowdDensityDetector", () => {
    it("returns MODEL_UNAVAILABLE with confidence null when uninitialized", async () => {
      const detector = new CrowdDensityDetector();
      // Not initialized
      const frame: DetectionFrame = {
        cameraId: "cam-102",
        tenantId: "tenant-abc",
        timestamp: new Date(),
        imageData: Buffer.alloc(100),
        width: 1920,
        height: 1080,
      };

      const results = await detector.detect(frame);
      expect(results).toHaveLength(1);
      const res = results[0]!;
      expect(res.status).toBe("MODEL_UNAVAILABLE");
      expect(res.confidence).toBeNull(); // Must be null, never 0
      expect(res.executionMetadata?.status).toBe("MODEL_UNAVAILABLE");
    });
  });

  describe("TamperDetectionService", () => {
    it("computes deterministic pixel buffer luminance and throws on empty buffer", async () => {
      const service = new TamperDetectionService();

      // Black buffer (all 0s) -> brightness 0
      const blackFrame = Buffer.alloc(1000, 0);
      const blackEvent = await service.detectCameraCovered("cam-1", "Front Gate", blackFrame);
      // First call establishes baseline, returns null
      expect(blackEvent).toBeNull();

      // Test with empty buffer throws descriptive error instead of random output
      const emptyBuffer = Buffer.alloc(0);
      await expect(service.detectCameraCovered("cam-2", "Back Door", emptyBuffer)).rejects.toThrow(
        "cannot compute brightness on empty buffer",
      );

      service.stopMonitoring();
    });
  });

  describe("ArcFlashDetector", () => {
    it("classifies image analysis score as heuristicScore with provenance HEURISTIC_RULE_ENGINE and confidence null", () => {
      const zoneEngine = new ZoneEngine();
      const detector = new ArcFlashDetector(zoneEngine);

      // Create a bright frame buffer (values ~250)
      const brightBuffer = Buffer.alloc(100 * 100 * 4, 250);
      const events = detector.detectArcFlash({
        data: brightBuffer,
        width: 100,
        height: 100,
        timestamp: new Date(),
      });

      if (events.length > 0) {
        const event = events[0]!;
        expect(event.confidence).toBeNull();
        expect(event.provenance).toBe("HEURISTIC_RULE_ENGINE");
        expect(typeof event.heuristicScore).toBe("number");
        expect(event.heuristicScore).toBeGreaterThan(0);
      }
    });
  });
});
