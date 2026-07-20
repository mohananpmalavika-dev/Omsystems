import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { buildPlaybackTimeline } from "../src/recording/playback-timeline.js";
import { calculateRecordingStorage } from "../src/recording/storage-calculator.js";

const admin = { "x-user-id": "user-global-admin" };
const engineKey = "r".repeat(40);

describe("recording and storage module", () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("calculates the documented 20-camera storage requirement", () => {
    const result = calculateRecordingStorage({
      cameraCount: 20, bitrateMbps: 2, recordingHoursPerDay: 24,
      retentionDays: 180, metadataAndIndexPercent: 15,
      safetyReservePercent: 0, raidUsablePercent: 75, backupCopies: 1,
    });
    expect(result.rawVideoTb).toBe(77.76);
    expect(result.primaryUsableTb).toBe(89.424);
    expect(result.primaryRawCapacityTb).toBe(119.232);
    expect(result.backupCapacityTb).toBe(89.424);
  });

  it("builds a playback timeline and identifies recording gaps", () => {
    const timeline = buildPlaybackTimeline([
      segment("2026-07-21T00:00:00.000Z", "2026-07-21T00:01:00.000Z", "one"),
      segment("2026-07-21T00:02:00.000Z", "2026-07-21T00:03:00.000Z", "two"),
    ], "2026-07-21T00:00:00.000Z", "2026-07-21T00:03:00.000Z");
    expect(timeline.coveragePercent).toBe(66.67);
    expect(timeline.gaps).toEqual([{
      from: "2026-07-21T00:01:00.000Z",
      to: "2026-07-21T00:02:00.000Z",
      durationSeconds: 60,
    }]);
  });

  it("protects old evidence from retention cleanup until its legal hold is released", async () => {
    const app = await buildApp({ recordingEngineSharedKey: engineKey });
    apps.push(app);
    const configured = await app.inject({
      method: "PUT", url: "/v1/cameras/cam-001/recording", headers: admin,
      payload: { mode: "continuous", enabled: true, retentionDays: 180 },
    });
    expect(configured.statusCode).toBe(200);
    expect(configured.json().segmentDurationSeconds).toBe(60);
    expect(configured.json().status).toBe("idle");
    const jobId = configured.json().id as string;

    const started = await app.inject({
      method: "POST", url: "/internal/recording/health",
      headers: { "x-recording-engine-key": engineKey },
      payload: {
        tenantId: "omsystems", cameraId: "cam-001",
        storageNodeExternalId: "recorder-1", eventType: "recording_started",
        severity: "info", message: "Recording process started",
      },
    });
    expect(started.statusCode).toBe(201);
    const active = await app.inject({
      method: "GET", url: "/v1/cameras/cam-001/recording", headers: admin,
    });
    expect(active.json().status).toBe("recording");

    const indexed = await app.inject({
      method: "POST", url: "/internal/recording/segments",
      headers: { "x-recording-engine-key": engineKey },
      payload: {
        tenantId: "omsystems", cameraId: "cam-001", jobId,
        startedAt: "2020-01-01T00:00:00.000Z",
        endedAt: "2020-01-01T00:01:00.000Z",
        storagePath: "camera/2020/01/01/00/00-00-00.mp4",
        sizeBytes: 1_000, storageNodeExternalId: "recorder-1",
        storageTier: "hot",
      },
    });
    expect(indexed.statusCode).toBe(201);

    const held = await app.inject({
      method: "POST", url: "/v1/cameras/cam-001/recording/legal-holds",
      headers: admin,
      payload: {
        fromAt: "2019-12-31T23:59:00.000Z",
        toAt: "2020-01-01T00:02:00.000Z",
        reason: "Open investigation",
      },
    });
    expect(held.statusCode).toBe(201);

    const beforeRelease = await retentionCandidates(app);
    expect(beforeRelease.json().data).toHaveLength(0);

    const released = await app.inject({
      method: "DELETE",
      url: `/v1/cameras/cam-001/recording/legal-holds/${held.json().id}`,
      headers: admin,
    });
    expect(released.statusCode).toBe(200);
    const afterRelease = await retentionCandidates(app);
    expect(afterRelease.json().data).toHaveLength(1);
  });

  it("enforces camera recording scope and internal engine authentication", async () => {
    const app = await buildApp({ recordingEngineSharedKey: engineKey });
    apps.push(app);
    const scopedDeny = await app.inject({
      method: "GET", url: "/v1/cameras/cam-002/recording",
      headers: { "x-user-id": "user-branch-manager" },
    });
    expect(scopedDeny.statusCode).toBe(403);
    const internalDeny = await app.inject({
      method: "POST", url: "/internal/recording/health",
      payload: {
        tenantId: "omsystems", eventType: "test", severity: "info",
        message: "test",
      },
    });
    expect(internalDeny.statusCode).toBe(401);
  });
});

async function retentionCandidates(app: FastifyInstance) {
  return app.inject({
    method: "GET",
    url: "/internal/recording/retention-candidates" +
      "?tenantId=omsystems&storageNodeExternalId=recorder-1",
    headers: { "x-recording-engine-key": engineKey },
  });
}

function segment(startedAt: string, endedAt: string, id: string) {
  return {
    id, cameraId: "camera", jobId: "job", startedAt, endedAt,
    storagePath: `${id}.mp4`, sizeBytes: 1,
    storageNodeExternalId: "recorder", storageTier: "hot" as const,
    status: "ready" as const, createdAt: startedAt,
  };
}
