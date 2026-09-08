import { describe, expect, it, vi } from "vitest";

vi.mock("../src/database/pool.js", () => ({
  pool: { query: vi.fn() },
}));
vi.mock("../src/recording-index/recording-index.service.js", () => ({
  recordingIndexService: { findRecording: vi.fn() },
}));

import { PlaybackEngine } from "../src/recording/playback-engine.js";

function createPool(rows: unknown[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows }) } as any;
}

describe("synchronized playback production safeguards", () => {
  it("returns the cameras and master needed to load a saved playback group", async () => {
    const pool = createPool([{
      id: "group-1",
      name: "Lobby investigation",
      description: "Review all lobby angles",
      layout: "grid",
      camera_ids: ["camera-1", "camera-2"],
      master_camera_id: "camera-1",
      camera_count: 2,
      created_at: "2026-01-01T00:00:00.000Z",
    }]);
    const engine = new PlaybackEngine(pool);

    const groups = await engine.listPlaybackGroups("tenant-1", "user-1");

    expect(groups).toEqual([expect.objectContaining({
      cameraIds: ["camera-1", "camera-2"],
      masterCameraId: "camera-1",
    })]);
    expect(pool.query.mock.calls[0][0]).toContain("pg.camera_ids");
  });

  it("rejects a saved group that is not owned by the tenant", async () => {
    const pool = createPool([]);
    const engine = new PlaybackEngine(pool);

    await expect(engine.getSynchronizedPlayback({
      tenantId: "tenant-1",
      groupId: "group-1",
      cameraIds: [],
      fromTime: "2026-01-01T00:00:00.000Z",
      toTime: "2026-01-01T01:00:00.000Z",
    })).rejects.toThrow("playback_group_not_found");
  });
});
