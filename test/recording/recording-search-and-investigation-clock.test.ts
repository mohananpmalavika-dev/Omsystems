import { describe, it, expect } from "vitest";
import { AuthoritativeRecordingSearchService } from "../../src/recording/services/authoritative-recording-search.service.js";
import { InvestigationClockService } from "../../src/recording/services/investigation-clock.service.js";

describe("Recording Search Index & Synchronized Multi-Camera Playback", () => {
  it("queries authoritative recording search for multiple cameras", async () => {
    const searchService = new AuthoritativeRecordingSearchService();
    const from = new Date(Date.now() - 3600_000);
    const to = new Date();

    const result = await searchService.findRecording({
      tenantId: "tenant-bank-01",
      cameraIds: ["cam-vault-1", "cam-entrance-2"],
      from,
      to,
    });

    expect(result.tenantId).toBe("tenant-bank-01");
    expect(result.cameras.length).toBe(2);
    expect(result.totalSegments).toBeGreaterThanOrEqual(2);
  });

  it("coordinates synchronized multi-camera playback with clock drift compensation", () => {
    const clock = new InvestigationClockService();
    const from = new Date("2026-09-12T10:00:00.000Z");
    const to = new Date("2026-09-12T11:00:00.000Z");

    const session = clock.createSession({
      sessionId: "investigation-session-1",
      layout: 4,
      from,
      to,
      cameras: [
        { cameraId: "cam-vault", clockOffsetMs: 0 },
        { cameraId: "cam-teller-1", clockOffsetMs: 2500 }, // device is 2.5s fast
        { cameraId: "cam-gate", clockOffsetMs: -1200 }, // device is 1.2s slow
      ],
    });

    expect(session.layout).toBe(4);
    expect(session.masterTime.toISOString()).toBe(from.toISOString());
    expect(session.tracks.length).toBe(3);

    // Seek master time forward by 10 seconds
    const target = new Date("2026-09-12T10:00:10.000Z");
    const updated = clock.seekTo("investigation-session-1", target);
    expect(updated.masterTime.toISOString()).toBe(target.toISOString());

    // Camera 2 should have its device timestamp adjusted by +2500ms
    const tellerTrack = updated.tracks.find((t) => t.cameraId === "cam-teller-1");
    expect(tellerTrack?.currentAlignedTimestamp.toISOString()).toBe(target.toISOString());
    expect(tellerTrack?.currentDeviceTimestamp.getTime()).toBe(target.getTime() + 2500);

    // Frame stepping forward (25fps = 40ms)
    const stepForward = clock.stepFrame("investigation-session-1", "FORWARD", 25);
    expect(stepForward.masterTime.getTime()).toBe(target.getTime() + 40);

    // Speed change
    const fastForward = clock.setPlaybackRate("investigation-session-1", 4.0);
    expect(fastForward.playbackRate).toBe(4.0);
    expect(fastForward.isPlaying).toBe(true);
  });
});
