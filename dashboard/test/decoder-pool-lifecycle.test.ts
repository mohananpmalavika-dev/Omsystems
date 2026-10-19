import { describe, expect, it, vi } from "vitest";
import { DecoderPool } from "../lib/video/decoder-pool";
import type { StreamProfile } from "../lib/video/types";

describe("wall decoder reservations", () => {
  it("keeps the active player attached while its scheduled profile changes", async () => {
    const pool = new DecoderPool();
    const main: StreamProfile = { cameraId: "camera-a", streamType: "MAIN", codec: "H264", width: 1920, height: 1080, fps: 25, estimatedBitrateKbps: 2048 };
    const sub: StreamProfile = { ...main, streamType: "SUB", width: 640, height: 360, fps: 15, estimatedBitrateKbps: 512 };
    const pause = vi.fn();
    const video = { pause, srcObject: null } as unknown as HTMLVideoElement;
    const handle = await pool.acquire("camera-a", main);
    pool.attachVideoElement("camera-a", video);
    expect(await pool.acquire("camera-a", sub)).toBe(handle);
    expect(pool.getHandle("camera-a")?.videoElement).toBe(video);
    expect(pool.getHandle("camera-a")?.streamProfile).toBe(sub);
    expect(pause).not.toHaveBeenCalled();
    await pool.release("camera-a");
    expect(pause).toHaveBeenCalledOnce();
    expect(pool.getActiveCount()).toBe(0);
  });
});
