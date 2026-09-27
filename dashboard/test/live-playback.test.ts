import { describe, expect, it, vi } from "vitest";
import { isSnapshotSource, playLiveVideo } from "../lib/live-playback";

describe("live playback sources", () => {
  it.each([
    "https://relay.example/hls/camera/index.m3u8",
    "https://media.example/relay/camera/index.m3u8",
    "/v1/edge-media/camera/hls/index.m3u8?token=snapshot",
  ])("plays relayed HLS as video: %s", (url) => {
    expect(isSnapshotSource(url)).toBe(false);
  });
  it.each(["/api/media/snapshot-relay?cameraId=1", "/v1/cameras/1/snapshot", "/frame.jpg?token=t"])(
    "recognizes explicit snapshot endpoint: %s", (url) => expect(isSnapshotSource(url)).toBe(true),
  );
});

describe("live autoplay", () => {
  it("retries blocked audio autoplay with muted video", async () => {
    const play = vi.fn().mockRejectedValueOnce(new DOMException("User gesture required", "NotAllowedError")).mockResolvedValueOnce(undefined);
    const video = { play, muted: false } as unknown as HTMLVideoElement;
    const onMuted = vi.fn();
    await playLiveVideo(video, () => true, onMuted);
    expect(video.muted).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
    expect(onMuted).toHaveBeenCalledOnce();
  });

  it("does not restart a disposed stream after an autoplay rejection", async () => {
    const play = vi.fn().mockRejectedValue(new DOMException("Blocked", "NotAllowedError"));
    const video = { play, muted: false } as unknown as HTMLVideoElement;
    await playLiveVideo(video, () => false, vi.fn());
    expect(video.muted).toBe(false);
    expect(play).toHaveBeenCalledOnce();
  });
});
