import { describe, expect, it, vi } from "vitest";
import { fingerprintHttpRecorder } from "../src/discovery/recorder-http-fingerprint.js";
import {
  buildUnverifiedRtspDiscoveryPayload,
  discoverRtspRecorderChannels,
} from "../src/discovery/rtsp-network-scan.js";

describe("automatic RTSP recorder discovery", () => {
  it("recognizes the CP PLUS DVR web application without a configured endpoint", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      "<!doctype html><html><head><title>CPPLUS DVR - Web View</title></head><body></body></html>",
      { status: 200, headers: { Server: "embedded-web" } },
    )) as unknown as typeof fetch;

    await expect(fingerprintHttpRecorder("192.168.29.171", 1_000, fetchImpl)).resolves.toEqual({
      vendor: "cp-plus",
      manufacturer: "CP PLUS",
      model: "CPPLUS DVR - Web View",
      sourceType: "analog-dvr-channel",
    });
    expect(fetchImpl).toHaveBeenCalledWith("http://192.168.29.171/", expect.objectContaining({ method: "GET" }));
  });

  it("does not classify a CP PLUS IP-camera page as a recorder", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      "<html><head><title>CPPLUS IPC - Web View</title></head></html>",
      { status: 200 },
    )) as unknown as typeof fetch;

    await expect(fingerprintHttpRecorder("192.168.29.43", 1_000, fetchImpl)).resolves.toBeUndefined();
  });

  it("enumerates every available CP PLUS DVR channel using the substream path", async () => {
    const probe = vi.fn(async (uri: string) => {
      const channel = Number(new URL(uri).searchParams.get("channel"));
      return channel <= 10
        ? { reachable: true, codec: "h264", width: 640, height: 360 }
        : { reachable: false, codec: null, width: null, height: null, error: "404 channel not found" };
    });

    const result = await discoverRtspRecorderChannels({
      host: "192.168.29.171",
      ports: [554],
      vendor: "cp-plus",
      username: "admin",
      password: "secret",
      maxChannels: 32,
      batchSize: 4,
      emptyBatchLimit: 1,
      probe,
    });

    expect(result.credentialsRequired).toBe(false);
    expect(result.channels.map((channel) => channel.sourceChannel)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.channels.every((channel) => channel.role === "sub")).toBe(true);
    expect(result.channels[0]?.uri).toContain("/cam/realmonitor?channel=1&subtype=1");
  });

  it("returns one credential activation signal instead of creating fake channels", async () => {
    const probe = vi.fn(async () => ({
      reachable: false,
      codec: null,
      width: null,
      height: null,
      error: "401 Unauthorized",
    }));

    const result = await discoverRtspRecorderChannels({
      host: "192.168.29.171",
      ports: [554],
      vendor: "cp-plus",
      username: "",
      password: "",
      maxChannels: 32,
      probe,
    });

    expect(result.channels).toEqual([]);
    expect(result.credentialsRequired).toBe(true);
    expect(probe).toHaveBeenCalledTimes(8);
  });

  it("reports the identified CP PLUS DVR when its login is rejected", () => {
    expect(buildUnverifiedRtspDiscoveryPayload({
      agentId: "edge-1",
      ipAddress: "192.168.29.171",
      macAddress: "00:11:22:33:44:55",
      hardwareId: "mac-001122334455",
      endpoint: {
        port: 554,
        credentialsRequired: true,
        recorder: {
          vendor: "cp-plus",
          manufacturer: "CP PLUS",
          model: "CPPLUS DVR - Web View",
          sourceType: "analog-dvr-channel",
        },
      },
    })).toMatchObject({
      vendor: "cp-plus",
      manufacturer: "CP PLUS",
      model: "CPPLUS DVR - Web View",
      ipAddress: "192.168.29.171",
      rtspPort: 554,
      credentialsRequired: true,
      streamVerified: false,
      statusReason: "recorder_credentials_required",
      recorderId: "recorder-mac-001122334455",
    });
  });
});
