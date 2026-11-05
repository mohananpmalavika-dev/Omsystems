import { describe, expect, it } from "vitest";
import { AnalyticsPipeline } from "../src/analytics-pipeline.js";
import type { DetectionFrame } from "../src/detectors/base-detector.js";
import type { AnalyticsRule } from "../src/analytics-pipeline.js";

function makeVaultFrame(
  overrides: Partial<DetectionFrame> = {},
): DetectionFrame {
  return {
    cameraId: "ca035670-aeee-481e-b47c-3eea98344fc6", // Bettaih Channel 1 (Designated Vault Camera)
    tenantId: "omsystems",
    timestamp: new Date("2026-11-05T10:15:32.000Z"),
    imageData: Buffer.alloc(100),
    width: 640,
    height: 480,
    metadata: {
      cameraName: "LOCKER BETTAIH",
      branchName: "Bettaih",
      channel: 1,
    },
    ...overrides,
  };
}

const dualControlRule: AnalyticsRule = {
  id: "rule-vault-dual-control",
  cameraId: "ca035670-aeee-481e-b47c-3eea98344fc6",
  detectionType: "dual-control-verification",
  enabled: true,
  name: "Dual Control Verification",
};

describe("Dual Control Vault Verification & False Alarm Mitigation", () => {
  it("satisfies dual custody when two persons are detected standing in vault", async () => {
    const pipeline = new AnalyticsPipeline();
    await pipeline.initialize();
    const frame = makeVaultFrame({
      metadata: {
        detections: [
          { label: "person", confidence: 0.95, boundingBox: { x: 0.2, y: 0.1, width: 0.15, height: 0.8 } },
          { label: "person", confidence: 0.92, boundingBox: { x: 0.5, y: 0.15, width: 0.15, height: 0.75 } },
        ],
      },
    });

    const events = await pipeline.processFrame(frame, [dualControlRule]);
    const vaultAlerts = events.filter((e) => e.detectionType === "dual-control-verification");
    expect(vaultAlerts).toHaveLength(0);
  });

  it("prevents false alarms during sustained locker work when 1 person crouches after 2 persons entered", async () => {
    const pipeline = new AnalyticsPipeline();
    await pipeline.initialize();
    const t0 = new Date("2026-11-05T10:00:00.000Z");

    // Frame 1 (t=0): Two persons enter the locker room together
    const frame1 = makeVaultFrame({
      timestamp: t0,
      metadata: {
        detections: [
          { label: "person", confidence: 0.95, boundingBox: { x: 0.2, y: 0.1, width: 0.15, height: 0.8 } },
          { label: "person", confidence: 0.92, boundingBox: { x: 0.5, y: 0.15, width: 0.15, height: 0.75 } },
        ],
      },
    });
    await pipeline.processFrame(frame1, [dualControlRule]);

    // Frame 2 (t=3 minutes): One person crouches down to access safe/locker drawers (only 1 person bounding box visible)
    const t1 = new Date(t0.getTime() + 180_000); // 3 minutes later
    const frame2 = makeVaultFrame({
      timestamp: t1,
      metadata: {
        detections: [
          { label: "person", confidence: 0.91, boundingBox: { x: 0.45, y: 0.15, width: 0.14, height: 0.78 } },
        ],
      },
    });

    const eventsAt3Min = await pipeline.processFrame(frame2, [dualControlRule]);
    const alertsAt3Min = eventsAt3Min.filter((e) => e.detectionType === "dual-control-verification");
    expect(alertsAt3Min).toHaveLength(0);

    // Frame 3 (t=7 minutes): Still inspecting lockers, one person on floor
    const t2 = new Date(t0.getTime() + 420_000); // 7 minutes later
    const frame3 = makeVaultFrame({
      timestamp: t2,
      metadata: {
        detections: [
          { label: "person", confidence: 0.91, boundingBox: { x: 0.45, y: 0.15, width: 0.14, height: 0.78 } },
        ],
      },
    });

    const eventsAt7Min = await pipeline.processFrame(frame3, [dualControlRule]);
    const alertsAt7Min = eventsAt7Min.filter((e) => e.detectionType === "dual-control-verification");
    expect(alertsAt7Min).toHaveLength(0);
  });

  it("recognizes merged wide bounding box when two bodies stand/bend closely together", async () => {
    const pipeline = new AnalyticsPipeline();
    await pipeline.initialize();
    // Exact bounding box from production telemetry of incident 8c9e4660-cac4-4728-90b4-aefd45b564de:
    // {"x": 0.3637, "y": 0.1411, "width": 0.2344, "height": 0.8557}
    const frame = makeVaultFrame({
      metadata: {
        detections: [
          {
            label: "person",
            confidence: 0.93,
            boundingBox: { x: 0.3637, y: 0.1411, width: 0.2344, height: 0.8557 },
          },
        ],
      },
    });

    const events = await pipeline.processFrame(frame, [dualControlRule]);
    const alerts = events.filter((e) => e.detectionType === "dual-control-verification");
    expect(alerts).toHaveLength(0);
  });

  it("recognizes secondary candidate person or detached face when second person is crouching", async () => {
    const pipeline = new AnalyticsPipeline();
    await pipeline.initialize();
    // Standing person + detached crouching face
    const frame = makeVaultFrame({
      metadata: {
        detections: [
          { label: "person", confidence: 0.92, boundingBox: { x: 0.4, y: 0.1, width: 0.14, height: 0.8 } },
          // Crouching person detected as secondary low-IoU object candidate
          { label: "person", confidence: 0.45, boundingBox: { x: 0.1, y: 0.5, width: 0.2, height: 0.3 } },
        ],
      },
    });

    const events = await pipeline.processFrame(frame, [dualControlRule]);
    const alerts = events.filter((e) => e.detectionType === "dual-control-verification");
    expect(alerts).toHaveLength(0);
  });

  it("raises single person in vault violation when an unauthorized lone person enters an empty vault", async () => {
    const pipeline = new AnalyticsPipeline();
    await pipeline.initialize();
    const t0 = new Date("2026-11-05T14:00:00.000Z");

    const allEmittedAlerts: any[] = [];

    // Frame 1: First detected (t=0)
    const frame1 = makeVaultFrame({
      timestamp: t0,
      metadata: {
        detections: [
          { label: "person", confidence: 0.94, boundingBox: { x: 0.4, y: 0.15, width: 0.14, height: 0.75 } },
        ],
      },
    });
    const events1 = await pipeline.processFrame(frame1, [dualControlRule]);
    allEmittedAlerts.push(...events1.filter(e => e.detectionType === "dual-control-verification"));
    expect(allEmittedAlerts).toHaveLength(0);

    // Dwell persistence frames (4s, 8s, 12s, 16s)
    for (let sec = 4; sec <= 16; sec += 4) {
      const frameN = makeVaultFrame({
        timestamp: new Date(t0.getTime() + sec * 1000),
        metadata: {
          detections: [
            { label: "person", confidence: 0.94, boundingBox: { x: 0.4, y: 0.15, width: 0.14, height: 0.75 } },
          ],
        },
      });
      const eventsN = await pipeline.processFrame(frameN, [dualControlRule]);
      allEmittedAlerts.push(...eventsN.filter(e => e.detectionType === "dual-control-verification"));
    }

    // At t=16s (> 15s confirmation & >= 4 frames), violation alert MUST fire
    expect(allEmittedAlerts).toHaveLength(1);
    expect(allEmittedAlerts[0]?.metadata?.violation).toBe("SINGLE_PERSON_IN_VAULT");
    expect(allEmittedAlerts[0]?.metadata?.actualPersons).toBe(1);
    expect(allEmittedAlerts[0]?.metadata?.requiredPersons).toBe(2);
  });

  it("resets dual custody session after vault is vacated continuously for > 20s", async () => {
    const pipeline = new AnalyticsPipeline();
    await pipeline.initialize();
    const t0 = new Date("2026-11-05T15:00:00.000Z");

    // 1. Two persons enter (dual custody active)
    await pipeline.processFrame(makeVaultFrame({
      timestamp: t0,
      metadata: {
        detections: [
          { label: "person", confidence: 0.95, boundingBox: { x: 0.2, y: 0.1, width: 0.15, height: 0.8 } },
          { label: "person", confidence: 0.92, boundingBox: { x: 0.5, y: 0.15, width: 0.15, height: 0.75 } },
        ],
      },
    }), [dualControlRule]);

    // 2. Both persons leave (vault empty for 25 seconds)
    await pipeline.processFrame(makeVaultFrame({
      timestamp: new Date(t0.getTime() + 10_000),
      metadata: { detections: [] },
    }), [dualControlRule]);

    await pipeline.processFrame(makeVaultFrame({
      timestamp: new Date(t0.getTime() + 35_000), // 25s empty
      metadata: { detections: [] },
    }), [dualControlRule]);

    // 3. New lone intruder enters after vault was vacated
    const tIntruder = new Date(t0.getTime() + 40_000);
    const intruderAlerts: any[] = [];
    for (let sec = 0; sec <= 16; sec += 4) {
      const frameIntruder = makeVaultFrame({
        timestamp: new Date(tIntruder.getTime() + sec * 1000),
        metadata: {
          detections: [
            { label: "person", confidence: 0.93, boundingBox: { x: 0.4, y: 0.15, width: 0.14, height: 0.75 } },
          ],
        },
      });
      const events = await pipeline.processFrame(frameIntruder, [dualControlRule]);
      intruderAlerts.push(...events.filter(e => e.detectionType === "dual-control-verification"));
    }

    expect(intruderAlerts).toHaveLength(1);
    expect(intruderAlerts[0]?.metadata?.violation).toBe("SINGLE_PERSON_IN_VAULT");
  });
});
