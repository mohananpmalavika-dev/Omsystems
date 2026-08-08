import { describe, expect, it, vi } from "vitest";
import { recoverCamera } from "../src/recovery/camera-recovery.js";

const reachable = { reachable: true, codec: "h264", width: 1920, height: 1080 };
const unreachable = { reachable: false, codec: null, width: null, height: null, error: "connection refused" };

describe("edge camera recovery", () => {
  it("recovers when the edge agent can open a new RTSP connection", async () => {
    const probe = vi.fn(async () => reachable);
    const createOnvifClient = vi.fn();

    const result = await recoverCamera({
      cameraId: "camera-1",
      rtspUrl: "rtsp://operator:secret@10.20.30.40:554/stream",
    }, { ffprobePath: "ffprobe", timeoutMs: 500 }, { probeRtsp: probe, createOnvifClient });

    expect(result).toMatchObject({ recovered: true, status: "recovered" });
    expect(result.steps).toEqual([expect.objectContaining({ step: "rtsp_reconnect", status: "succeeded" })]);
    expect(createOnvifClient).not.toHaveBeenCalled();
  });

  it("refreshes the RTSP source through authenticated ONVIF after reconnect fails", async () => {
    const client = {
      ping: vi.fn(async () => undefined),
      inspect: vi.fn(async () => deviceDetails),
      getStreamUri: vi.fn(async () => "rtsp://10.20.30.40:554/fresh"),
      reboot: vi.fn(async () => "rebooted"),
    };
    const probe = vi.fn()
      .mockResolvedValueOnce(unreachable)
      .mockResolvedValueOnce(reachable);

    const result = await recoverCamera({
      cameraId: "camera-1",
      rtspUrl: "rtsp://operator:secret@10.20.30.40:554/stream",
      onvifDeviceServiceUrls: ["http://10.20.30.40/onvif/device_service"],
    }, { ffprobePath: "ffprobe", timeoutMs: 500 }, {
      probeRtsp: probe,
      createOnvifClient: vi.fn(() => client),
    });

    expect(result).toMatchObject({ recovered: true, status: "recovered" });
    expect(result.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ step: "onvif_ping", status: "succeeded" }),
      expect.objectContaining({ step: "stream_refresh", status: "succeeded" }),
    ]));
    expect(probe.mock.calls[1]?.[0]).toBe("rtsp://operator:secret@10.20.30.40:554/fresh");
    expect(client.reboot).not.toHaveBeenCalled();
  });

  it("uses ONVIF SystemReboot only after reconnect and source refresh fail", async () => {
    const client = {
      ping: vi.fn(async () => undefined),
      inspect: vi.fn(async () => deviceDetails),
      getStreamUri: vi.fn(async () => "rtsp://10.20.30.40:554/fresh"),
      reboot: vi.fn(async () => "reboot requested"),
    };
    const probe = vi.fn()
      .mockResolvedValueOnce(unreachable)
      .mockResolvedValueOnce(unreachable)
      .mockResolvedValueOnce(reachable);
    const wait = vi.fn(async () => undefined);

    const result = await recoverCamera({
      cameraId: "camera-1",
      rtspUrl: "rtsp://operator:secret@10.20.30.40:554/stream",
      onvifDeviceServiceUrls: ["http://10.20.30.40/onvif/device_service"],
    }, { ffprobePath: "ffprobe", timeoutMs: 500 }, {
      probeRtsp: probe,
      createOnvifClient: vi.fn(() => client),
      wait,
      rebootWaitMs: 0,
    });

    expect(result).toMatchObject({ recovered: true, status: "recovered" });
    expect(client.reboot).toHaveBeenCalledOnce();
    expect(wait).toHaveBeenCalledWith(0);
    expect(result.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ step: "soft_reboot", status: "succeeded" }),
    ]));
  });
});

const deviceDetails = {
  manufacturer: "Test",
  model: "Camera",
  firmwareVersion: "1.0",
  serialNumber: "serial-1",
  mediaServiceUrl: "http://10.20.30.40/onvif/media_service",
  profiles: [{ token: "main", name: "Main", codec: "H264" as const, width: 1920, height: 1080 }],
  capabilities: { ptz: false, audio: false, events: false },
  services: ["DeviceManagement", "Media"],
  capabilityTests: [],
};
