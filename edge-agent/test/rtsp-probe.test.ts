import { describe, expect, it } from "vitest";
import { parseFrameRate, parseRtspStreamMetrics } from "../src/streaming/rtsp-probe.js";

describe("RTSP stream metric parsing", () => {
  it("uses received frames and video packet bytes for measured FPS and bitrate", () => {
    const result = parseRtspStreamMetrics({
      streams: [{ codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "25/1", nb_read_frames: "75" }],
      packets: [
        { pts_time: "100", size: "100000" },
        { pts_time: "102", size: "200000" },
      ],
    });
    expect(result).toMatchObject({
      reachable: true, codec: "h264", width: 1920, height: 1080,
      fps: 37.5, bitrateKbps: 1200, sampleDurationSeconds: 2,
    });
  });

  it("does not invent bitrate when the received packet sample is absent", () => {
    const result = parseRtspStreamMetrics({
      streams: [{ codec_name: "h265", width: 1280, height: 720, avg_frame_rate: "30000/1001" }],
    });
    expect(result).toMatchObject({ fps: 29.97, bitrateKbps: null, sampleDurationSeconds: null });
  });

  it("rejects invalid frame-rate ratios", () => {
    expect(parseFrameRate("0/1")).toBeNull();
    expect(parseFrameRate("25/0")).toBeNull();
  });
});
