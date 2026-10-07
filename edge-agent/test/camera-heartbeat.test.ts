import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as rtspProbe from "../src/streaming/rtsp-probe.js";
import * as packetLoss from "../src/monitoring/camera-packet-loss.js";
import * as rgbStreams from "../src/streaming/rtsp-rgb-stream.js";
import sharp from "sharp";
import {
  assessLumaFrame,
  CameraHeartbeatService,
  shouldMarkCameraDegraded,
  type CameraConfig,
  type CameraHeartbeatData,
} from "../src/monitoring/camera-heartbeat.js";

const streams = new Map<string, {
  start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; latestFrame: ReturnType<typeof vi.fn>;
}>();
beforeEach(() => {
  streams.clear();
  let sequence = 0;
  vi.spyOn(rgbStreams, "createRtspRgbStream").mockImplementation((uri,_ffmpeg,width=640,height=360) => {
    const stream = { start: vi.fn(), stop: vi.fn(), latestFrame: vi.fn(() => ({
      rgb: Buffer.alloc(width * height * 3), capturedAt: new Date(++sequence * 1_000).toISOString(),
    })) };
    streams.set(uri, stream);
    return stream;
  });
});
afterEach(() => vi.restoreAllMocks());

describe("camera frame health", () => {
  it("preserves requested helmet frame detail in the decoder and upload", async () => {
    const send=vi.fn(async()=>undefined);
    const service=new CameraHeartbeatService("http://control.example","branch","agent",undefined,
      "ffprobe","ffmpeg",undefined,undefined,undefined,send);
    service.replaceCameras([{id:"camera",name:"Camera",rtspUrl:"rtsp://camera/main",enabled:true,
      analyticsEnabled:true,analyticsResolution:{width:1280,height:720}}]);
    await (service as any).sendAllAnalyticsFrames();
    expect(rgbStreams.createRtspRgbStream).toHaveBeenCalledWith("rtsp://camera/main","ffmpeg",1280,720,expect.any(Function));
    const payload=(send.mock.calls as unknown as [[{width:number;height:number;imageBase64:string}]])[0][0];
    expect(payload).toMatchObject({width:1280,height:720});
    expect(payload).toMatchObject({imageEncoding:"jpeg"});
    const decoded=await sharp(Buffer.from(payload.imageBase64,"base64")).raw().toBuffer({resolveWithObject:true});
    expect(decoded.info).toMatchObject({width:1280,height:720,channels:3});
    expect(decoded.data.length).toBe(1280*720*3);
    expect(Buffer.from(payload.imageBase64,"base64").length).toBeLessThan(1280*720*3);
    service.replaceCameras([{id:"camera",name:"Camera",rtspUrl:"rtsp://camera/main",enabled:true,analyticsEnabled:true}]);
    await (service as any).sendAllAnalyticsFrames();
    expect(rgbStreams.createRtspRgbStream).toHaveBeenCalledTimes(2);
    service.stop();
  });
  it("keeps cloud captures fresh while local inference is busy", async () => {
    let finish!:()=>void;
    const send=vi.fn(async()=>undefined),local=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
    const service=new CameraHeartbeatService("http://control.example","branch","agent",undefined,
      "ffprobe","ffmpeg",undefined,undefined,undefined,send,local);
    service.replaceCameras([{id:"camera",name:"Camera",rtspUrl:"rtsp://camera/main",enabled:true,analyticsEnabled:true}]);
    const first=(service as any).sendAllAnalyticsFrames();
    await new Promise(resolve=>setImmediate(resolve));
    await (service as any).sendAllAnalyticsFrames();
    expect(send).toHaveBeenCalledTimes(2);
    expect(local).toHaveBeenCalledOnce();
    finish();await first;service.stop();
  });
  it("delivers later cameras immediately and keeps their next tick independent of a slow upload", async () => {
    let finish!: () => void;
    const send = vi.fn((payload: {cameraId: string}) => payload.cameraId === "slow"
      ? new Promise<void>(resolve => { finish = resolve; }) : Promise.resolve());
    const service = new CameraHeartbeatService("http://control.example", "branch", "agent", undefined,
      "ffprobe", "ffmpeg", undefined, undefined, undefined, send);
    service.replaceCameras(["slow", "one", "two", "three", "four", "five"].map(id => ({
      id, name: id, rtspUrl: `rtsp://camera/${id}`, enabled: true, analyticsEnabled: true,
    })));
    const firstTick = (service as any).sendAllAnalyticsFrames();
    expect(send).toHaveBeenCalledTimes(6);
    await new Promise(resolve => setImmediate(resolve));
    await (service as any).sendAllAnalyticsFrames();
    expect(send.mock.calls.filter(([payload]) => payload.cameraId === "slow")).toHaveLength(1);
    expect(send.mock.calls.filter(([payload]) => payload.cameraId === "five")).toHaveLength(2);
    expect(rgbStreams.createRtspRgbStream).toHaveBeenCalledTimes(6);
    finish();
    await firstTick;
    service.stop();
  });

  it("never recounts a buffered frame as a new timestamp, and preserves capture time for cloud and local inference", async () => {
    const send = vi.fn(async () => undefined), local = vi.fn(async () => undefined);
    const service = new CameraHeartbeatService("http://control.example", "branch", "agent", undefined,
      "ffprobe", "ffmpeg", undefined, undefined, undefined, send, local);
    service.replaceCameras([{id:"camera",name:"Camera",rtspUrl:"rtsp://camera/main",enabled:true,analyticsEnabled:true}]);
    (service as any).syncAnalyticsStreams();
    const capturedAt = new Date(1_000).toISOString();
    streams.get("rtsp://camera/main")!.latestFrame.mockReturnValue({rgb:Buffer.alloc(640*360*3),capturedAt});
    await (service as any).sendAllAnalyticsFrames();
    await (service as any).sendAllAnalyticsFrames();
    expect(send).toHaveBeenCalledOnce();
    expect(local).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({capturedAt}));
    expect(local).toHaveBeenCalledWith(expect.objectContaining({capturedAt}));
    service.stop();
  });

  it("does not delay a recovered source when an older in-flight upload fails", async () => {
    let reject!: (error: Error) => void;
    const send = vi.fn().mockImplementationOnce(() => new Promise((_resolve, fail) => {reject=fail;}))
      .mockResolvedValue(undefined);
    const service = new CameraHeartbeatService("http://control.example", "branch", "agent", undefined,
      "ffprobe", "ffmpeg", undefined, undefined, undefined, send);
    const camera = {id:"camera",name:"Camera",rtspUrl:"rtsp://camera/old",enabled:true,analyticsEnabled:true};
    service.replaceCameras([camera]);
    const oldTick = (service as any).sendAllAnalyticsFrames();
    service.replaceCameras([{...camera,rtspUrl:"rtsp://camera/recovered"}]);
    // The next tick notices the source replacement while the old upload runs.
    await (service as any).sendAllAnalyticsFrames();
    reject(new Error("old source upload failed"));
    await oldTick;
    await (service as any).sendAllAnalyticsFrames();
    expect(send).toHaveBeenCalledTimes(2);
    service.stop();
  });

  it("reuses the decoder for health samples and stops/replaces it with camera configuration changes", async () => {
    vi.spyOn(rtspProbe, "measureRtspStream").mockResolvedValue({reachable:true,codec:"h264",width:640,height:360,
      fps:25,bitrateKbps:1000,sampleDurationSeconds:3});
    const capture = vi.spyOn(rtspProbe, "captureRtspRgbFrame");
    vi.spyOn(packetLoss, "measureCameraPacketLoss").mockResolvedValue(null);
    const send = vi.fn(async () => undefined);
    const service = new CameraHeartbeatService("http://control.example", "branch", "agent", undefined,
      "ffprobe", "ffmpeg", undefined, undefined, undefined, send);
    vi.spyOn(service as any, "sendAllHeartbeats").mockResolvedValue(undefined);
    const camera = {id:"camera",name:"Camera",rtspUrl:"rtsp://camera/main",enabled:true,analyticsEnabled:true};
    service.replaceCameras([camera]);
    service.start();
    try {
      const first = streams.get(camera.rtspUrl)!;
      await (service as any).measureCamera(camera, Date.now());
      expect(capture).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      service.replaceCameras([{...camera}]);
      expect(first.stop).not.toHaveBeenCalled();
      expect(rgbStreams.createRtspRgbStream).toHaveBeenCalledOnce();
      service.updateCameraStream(camera.id, "rtsp://camera/recovered");
      expect(first.stop).toHaveBeenCalledOnce();
      const replacement = streams.get("rtsp://camera/recovered")!;
      service.replaceCameras([{...camera,analyticsEnabled:false}]);
      expect(replacement.stop).toHaveBeenCalledOnce();
      expect(service.getStats().analyticsCaptureStreams).toBe(0);
    } finally { service.stop(); }
  });

  it("keeps other cameras reporting when one camera upload fails", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const send = vi.fn(async (payload: {cameraId: string}) => {
      if (payload.cameraId === "failed") throw new Error("camera_not_found_for_edge_agent");
    });
    const service = new CameraHeartbeatService("http://control.example", "branch", "agent", undefined,
      "ffprobe", "ffmpeg", undefined, undefined, undefined, send);
    service.replaceCameras(["failed", "working"].map(id => ({id,name:id,rtspUrl:`rtsp://camera/${id}`,enabled:true,analyticsEnabled:true})));
    try {
      await (service as any).sendAllAnalyticsFrames();
      await (service as any).sendAllAnalyticsFrames();
      expect(send.mock.calls.map(([payload]) => payload.cameraId)).toEqual(["failed", "working", "working"]);
      expect(rgbStreams.createRtspRgbStream).toHaveBeenCalledTimes(2);
      // Health samples obey the same backoff instead of extending it repeatedly.
      await (service as any).deliverAnalyticsFrame("failed", Buffer.alloc(3), 1, 1, "edge-rtsp-health");
      expect(send).toHaveBeenCalledTimes(3);
      now.mockReturnValue(3_000);
      await (service as any).sendAllAnalyticsFrames();
      expect(send.mock.calls.map(([payload]) => payload.cameraId)).toEqual(["failed", "working", "working", "failed", "working"]);
    } finally { service.stop(); now.mockRestore(); }
  });

  it("does not upload health and scheduled frames concurrently for the same camera", async () => {
    let finish!: () => void;
    const send = vi.fn(() => new Promise<void>(resolve => {finish=resolve;}));
    const service = new CameraHeartbeatService("http://control.example", "branch", "agent", undefined,
      "ffprobe", "ffmpeg", undefined, undefined, undefined, send);
    const pending = (service as any).deliverAnalyticsFrame("camera", Buffer.alloc(3), 1, 1, "edge-rtsp-scheduled");
    await (service as any).deliverAnalyticsFrame("camera", Buffer.alloc(3), 1, 1, "edge-rtsp-health");
    expect(send).toHaveBeenCalledOnce();
    finish();
    await pending;
  });

  it("ignores a pre-recovery timeout even when reconnecting the same stream URL", async () => {
    const send = vi.fn(async (_payload: unknown) => undefined);
    const service = new CameraHeartbeatService("http://control.example", "branch", "agent", undefined,
      "ffprobe", "ffmpeg", undefined, send);
    service.replaceCameras([{ id: "same-source", name: "Reconnect", rtspUrl: "rtsp://camera/stream", enabled: true }]);
    let finish!: (data: CameraHeartbeatData) => void;
    const measure = vi.spyOn(service as any, "measureCamera")
      .mockImplementationOnce(() => new Promise<CameraHeartbeatData>(resolve => { finish = resolve; }));
    try {
      const pending = (service as any).sendAllHeartbeats();
      service.updateCameraStream("same-source", "rtsp://camera/stream");
      finish({ cameraId: "same-source", status: "offline", streamActive: false, videoLoss: true, reasonCodes: ['rtsp_unreachable'], responseTimeMs: 500, quality: "verified" });
      await pending;
      expect(send).not.toHaveBeenCalled();
    } finally { measure.mockRestore(); }
  });

  it("uses the saved recovery source on later probes and ignores an old in-flight probe", async () => {
    const send = vi.fn(async (_payload: unknown) => undefined);
    const service = new CameraHeartbeatService("http://control.example", "branch", "agent", undefined,
      "ffprobe", "ffmpeg", undefined, send);
    service.replaceCameras([{ id: "recovered", name: "Recovered", rtspUrl: "rtsp://camera/old", enabled: true }]);
    let finish!: (data: CameraHeartbeatData) => void;
    const measure = vi.spyOn(service as any, "measureCamera")
      .mockImplementationOnce(() => new Promise<CameraHeartbeatData>(resolve => { finish = resolve; }))
      .mockResolvedValueOnce({ cameraId: "recovered", status: "online", streamActive: true, videoLoss: false, reasonCodes: [], responseTimeMs: 15, quality: "verified" });
    try {
      const pending = (service as any).sendAllHeartbeats();
      // A periodic configuration sync may replace the camera object during the old probe.
      service.replaceCameras([{ id: "recovered", name: "Recovered", rtspUrl: "rtsp://camera/old", enabled: true }]);
      service.updateCameraStream("recovered", "rtsp://camera/fresh");
      finish({ cameraId: "recovered", status: "offline", streamActive: false, videoLoss: true, reasonCodes: ['rtsp_unreachable'], responseTimeMs: 500, quality: "verified" });
      await pending;
      expect(send).not.toHaveBeenCalled();
      await (service as any).sendAllHeartbeats();
      expect(measure.mock.calls[1]?.[0]).toMatchObject({ rtspUrl: "rtsp://camera/fresh" });
      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0]?.[0]).toMatchObject({ metrics: { status: "online", streamActive: true } });
    } finally { measure.mockRestore(); }
  });

  it("keeps the configured main stream for analytics head detail", async () => {
      const send = vi.fn(async () => undefined);
      const service = new CameraHeartbeatService("http://control.example", "branch", "agent", undefined,
        "ffprobe", "ffmpeg", undefined, undefined, undefined, send);
      const camera = { id: "main", name: "Main", rtspUrl: "rtsp://camera/stream?channel=6&subtype=0", enabled: true, analyticsEnabled: true };
      service.replaceCameras([camera]);
      await (service as any).sendAllAnalyticsFrames();
      expect(rgbStreams.createRtspRgbStream).toHaveBeenCalledWith(camera.rtspUrl, "ffmpeg", 640, 360, expect.any(Function));
      expect(send).toHaveBeenCalledOnce();
      service.stop();
  });

  it("keeps sampling a working camera when another stream has no fresh frame", async () => {
    const send = vi.fn(async () => undefined);
    const service = new CameraHeartbeatService("http://control.example", "branch", "agent", undefined,
      "ffprobe", "ffmpeg", undefined, undefined, undefined, send);
    service.replaceCameras(["failed", "working"].map(id => ({
      id, name: id, rtspUrl: `rtsp://camera/${id}`, enabled: true, analyticsEnabled: true,
    })));
    (service as any).syncAnalyticsStreams();
    streams.get("rtsp://camera/failed")!.latestFrame.mockReturnValue(null);
    await (service as any).sendAllAnalyticsFrames();
    await (service as any).sendAllAnalyticsFrames();
    expect(send.mock.calls).toHaveLength(2);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({cameraId: "working"}));
    expect(rgbStreams.createRtspRgbStream).toHaveBeenCalledTimes(2);
    service.stop();
  });
  it("detects a persistently identical frame only after three samples", () => {
    const frame = Buffer.alloc(64 * 36, 80);
    const one = assessLumaFrame(undefined, frame);
    const two = assessLumaFrame(one.state, frame);
    const three = assessLumaFrame(two.state, frame);
    expect(one.imageFrozen).toBe(false);
    expect(two.imageFrozen).toBe(false);
    expect(three.imageFrozen).toBe(true);
  });

  it("detects a genuinely dark decoded luminance frame", () => {
    expect(assessLumaFrame(undefined, Buffer.alloc(64 * 36, 4)).blackScreen).toBe(true);
    expect(assessLumaFrame(undefined, Buffer.alloc(64 * 36, 80)).blackScreen).toBe(false);
  });

  it("does not downgrade a healthy monochrome night stream", () => {
    // Colour loss and scene movement are retained in telemetry as evidence,
    // but neither proves a delivery or image failure. This keeps IR cameras
    // online after dark while genuine image failures still degrade them.
    expect(shouldMarkCameraDegraded({
      fps: 25,
      bitrateKbps: 1_024,
      packetLoss: 0,
    })).toBe(false);
    expect(shouldMarkCameraDegraded({
      fps: 25,
      bitrateKbps: 1_024,
      packetLoss: 0,
      blackScreen: true,
    })).toBe(true);
  });

  it("does not treat a DVR that blocks ICMP as a degraded video stream", () => {
    expect(shouldMarkCameraDegraded({
      fps: 25,
      bitrateKbps: 1_024,
      // RTSP is decoding; a recorder may simply reject ping packets.
      packetLoss: 100,
    })).toBe(false);
  });

  it("starts one local recovery after three consecutive offline heartbeats", async () => {
    const recover = vi.fn(async () => undefined);
    const service = new CameraHeartbeatService(
      "http://control.example",
      "branch-1",
      "agent-1",
      undefined,
      "ffprobe",
      "ffmpeg",
      undefined,
      undefined,
      recover,
    );
    const invokeRecovery = (service as unknown as {
      considerAutomaticRecovery(camera: CameraConfig, data: CameraHeartbeatData): void;
    }).considerAutomaticRecovery.bind(service);
    const camera: CameraConfig = {
      id: "camera-1",
      name: "Front door",
      rtspUrl: "rtsp://operator:secret@10.0.0.5/stream",
      enabled: true,
    };
    const offline: CameraHeartbeatData = {
      cameraId: camera.id,
      status: "offline",
      responseTimeMs: 20,
      streamActive: false,
      videoLoss: true,
      quality: "verified",
      reasonCodes: ["rtsp_unreachable"],
    };

    invokeRecovery(camera, offline);
    invokeRecovery(camera, offline);
    expect(recover).not.toHaveBeenCalled();
    invokeRecovery(camera, offline);
    await vi.waitFor(() => expect(recover).toHaveBeenCalledOnce());
    invokeRecovery(camera, offline);

    expect(recover).toHaveBeenCalledWith(expect.objectContaining({
      cameraId: "camera-1",
      consecutiveFailures: 3,
    }));
    expect(recover).toHaveBeenCalledOnce();
  });

  it("captures scheduled AI frames only for enabled cameras with active rules and local streams", async () => {
    const sendAnalyticsFrame = vi.fn(async () => undefined);
    const service = new CameraHeartbeatService(
      "http://control.example",
      "branch-1",
      "agent-1",
      undefined,
      "ffprobe",
      "ffmpeg",
      undefined,
      undefined,
      undefined,
      sendAnalyticsFrame,
    );
    service.replaceCameras([
      { id: "active", name: "Active AI", rtspUrl: "rtsp://camera/active", enabled: true, analyticsEnabled: true },
      { id: "no-rule", name: "No AI rule", rtspUrl: "rtsp://camera/no-rule", enabled: true, analyticsEnabled: false },
      { id: "no-secret", name: "No local secret", enabled: true, analyticsEnabled: true },
      { id: "disabled", name: "Disabled", rtspUrl: "rtsp://camera/disabled", enabled: false, analyticsEnabled: true },
    ]);

    const internals = service as unknown as {
      captureAnalyticsFrame: ReturnType<typeof vi.fn>;
      sendAllAnalyticsFrames(): Promise<void>;
    };
    internals.captureAnalyticsFrame = vi.fn(async () => undefined);
    await internals.sendAllAnalyticsFrames();

    expect(internals.captureAnalyticsFrame).toHaveBeenCalledOnce();
    expect(internals.captureAnalyticsFrame).toHaveBeenCalledWith(expect.objectContaining({ id: "active" }));
  });
});
