import { describe, expect, it, vi } from "vitest";
import {
  discoverRecorderChannels,
  discoverVendorRecorderChannels,
  inferRecorderChannelCount,
  recorderAdapterVendor,
  recorderChannelIdentity,
  recorderChannelNumber,
  recorderChannelSource,
} from "../src/recorders/dvr-adapter.js";

describe("universal DVR channel adapter", () => {
  it("classifies recorder brands and builds a stable recorder-channel identity", () => {
    expect(recorderAdapterVendor("UNV / Uniview")).toBe("uniview");
    expect(recorderAdapterVendor("TVT Digital")).toBe("tvt");
    expect(recorderAdapterVendor("Tiandy Technologies")).toBe("tiandy");
    expect(recorderChannelIdentity(" dvr-serial-01 ", 4)).toBe("DVR-SERIAL-01:channel:4");
  });

  it("groups Hikvision main and sub streams into one analog camera per DVR channel", async () => {
    const uris: Record<string, string> = {
      c1main: "rtsp://192.0.2.10/Streaming/Channels/101",
      c1sub: "rtsp://192.0.2.10/Streaming/Channels/102",
      c2main: "rtsp://192.0.2.10/Streaming/Channels/201",
    };
    const probeStream = vi.fn(async () => ({
      reachable: true, codec: "h264", width: 1920, height: 1080,
    }));

    const channels = await discoverRecorderChannels({
      manufacturer: "Hikvision",
      model: "DS-7216HQHI DVR",
      credentials: { username: "operator", password: "secret" },
      profiles: [
        { token: "c1main", name: "Camera 1 Main", codec: "H264", width: 1920, height: 1080 },
        { token: "c1sub", name: "Camera 1 Sub", codec: "H264", width: 640, height: 360 },
        { token: "c2main", name: "Entrance", codec: "H264", width: 1920, height: 1080 },
      ],
      getStreamUri: async (token) => uris[token]!,
      probeStream,
    });

    expect(channels).toHaveLength(2);
    expect(channels[0]).toMatchObject({
      sourceChannel: 1,
      sourceType: "analog-dvr-channel",
      streamVerified: true,
    });
    expect(channels[0]!.profiles).toHaveLength(2);
    expect(channels[0]!.primaryStreamUri).toContain("operator:secret@");
    expect(channels[0]!.primaryStreamUri).toContain("/Streaming/Channels/102");
    expect(channels[0]!.profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "main", preferredFor: ["recording"] }),
      expect.objectContaining({ role: "sub", preferredFor: ["live", "analytics"] }),
    ]));
    expect(channels[0]!.reasonCodes).toContain("recorder_channel_substream_selected");
    expect(channels[1]).toMatchObject({ sourceChannel: 2, name: "Entrance" });
    expect(probeStream).toHaveBeenCalledTimes(2);
  });

  it("normalizes Dahua/CP PLUS channel query strings and reports failed channels honestly", async () => {
    const channels = await discoverRecorderChannels({
      manufacturer: "CP PLUS",
      model: "XVR 8 Channel",
      credentials: { username: "admin", password: "pw" },
      profiles: [
        { token: "main-3", name: "CH3 Main", codec: "H265", width: 1280, height: 720 },
      ],
      getStreamUri: async () => "rtsp://192.0.2.20/cam/realmonitor?channel=3&subtype=0",
      probeStream: async () => ({ reachable: false, codec: null, width: null, height: null, error: "no signal" }),
    });

    expect(channels[0]).toMatchObject({
      sourceChannel: 3,
      sourceType: "analog-dvr-channel",
      streamVerified: false,
      reasonCodes: expect.arrayContaining(["recorder_channel_rtsp_unreachable"]),
    });
  });

  it("identifies recorder vendors, source types and common channel URI formats", () => {
    expect(recorderAdapterVendor("Dahua Technology")).toBe("dahua");
    expect(recorderAdapterVendor("CP-PLUS")).toBe("cp-plus");
    expect(recorderAdapterVendor("CPPLUS")).toBe("cp-plus");
    expect(recorderChannelSource("Enterprise NVR")).toBe("nvr-channel");
    expect(recorderChannelNumber(
      { token: "unknown", name: "unknown" },
      "rtsp://192.0.2.1/cam/realmonitor?channel=12&subtype=0",
    )).toBe(12);
  });

  it("infers real-world recorder channel counts from labels and model numbers", () => {
    expect(inferRecorderChannelCount("XVR 8 Channel")).toBe(8);
    expect(inferRecorderChannelCount("DH-XVR1B08-I")).toBe(8);
    expect(inferRecorderChannelCount("DS-7216HQHI DVR")).toBe(16);
  });

  it("uses vendor paths only for channels not already verified through ONVIF", async () => {
    const probeStream = vi.fn(async () => ({
      reachable: true, codec: "h264", width: 1920, height: 1080,
    }));

    const channels = await discoverVendorRecorderChannels({
      manufacturer: "CP PLUS",
      model: "XVR 4 Channel",
      host: "192.0.2.20",
      credentials: { username: "admin", password: "secret" },
      existingChannels: [1, 2],
      probeStream,
    });

    expect(channels.map((channel) => channel.sourceChannel)).toEqual([3, 4]);
    expect(channels.every((channel) => channel.streamVerified)).toBe(true);
    expect(channels.every((channel) => channel.reasonCodes.includes("vendor_adapter_fallback"))).toBe(true);
    expect(channels.every((channel) => channel.profiles[0]?.role === "sub")).toBe(true);
    expect(probeStream).toHaveBeenCalledTimes(2);
  });
});
