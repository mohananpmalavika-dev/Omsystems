import { describe, expect, it } from "vitest";
import { normalizeCameraStreamProfiles } from "../lib/camera-stream-profiles";
import type { Camera } from "../lib/types";

const camera: Camera = {
  id: "camera-1",
  name: "Lobby",
  branchId: "branch-1",
  vendor: "cp-plus",
  model: "DVR channel",
  status: "online",
  channel: 1,
  capabilities: { ptz: false, audio: false, events: true },
};

describe("camera stream profile normalization", () => {
  it("converts control-plane profiles into scheduler profiles", () => {
    const normalized = normalizeCameraStreamProfiles({
      ...camera,
      profiles: [{
        name: "substream",
        role: "sub",
        codec: "H264",
        width: 640,
        height: 360,
        frameRate: 12,
        bitrateKbps: 384,
      }],
    });

    expect(normalized.streamProfiles).toEqual([{
      type: "SUB",
      codec: "H264",
      width: 640,
      height: 360,
      fps: 12,
      estimatedBitrateKbps: 384,
    }]);
  });

  it("preserves an already-normalized capability response", () => {
    const streamProfiles: NonNullable<Camera["streamProfiles"]> = [{
      type: "MAIN",
      codec: "H265",
      width: 1920,
      height: 1080,
      fps: 25,
      estimatedBitrateKbps: 2_048,
    }];

    expect(normalizeCameraStreamProfiles({ ...camera, streamProfiles })).toMatchObject({
      streamProfiles,
    });
  });
});
