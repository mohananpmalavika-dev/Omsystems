/**
 * Generic RTSP Fallback Driver
 * 
 * Used when a recorder or camera does not support proprietary APIs or ONVIF,
 * but exposes standard RTSP video streams.
 */

import type {
  RecorderDriver,
  ProbeOptions,
  ChannelStatus,
  RecordingStatus,
  DeviceTimeResult,
} from "../../core/recorder-driver.interface.js";
import type {
  RecorderContext,
  RecorderProtocol,
  RecorderCapabilities,
  DeviceInfo,
  StorageStatus,
  RecorderChannel,
  StreamEndpoint,
  StreamRequest,
  RecordingSearchRequest,
  RecordingSearchResult,
  RecorderProbeResult,
} from "../../core/recorder-driver.types.js";

export class GenericRecorderDriver implements RecorderDriver {
  readonly protocol: RecorderProtocol = "generic-rtsp";
  readonly version = "1.0.0";

  async probe(ctx: RecorderContext, options?: ProbeOptions): Promise<RecorderProbeResult> {
    const startTime = Date.now();
    const channels = await this.getChannels(ctx);
    const capabilities = await this.getCapabilities(ctx);

    return {
      recorderId: ctx.recorderId,
      reachable: true,
      status: "HEALTHY",
      identity: {
        manufacturer: "Generic RTSP Device",
        model: "Generic NVR/Streamer",
        deviceType: "UNKNOWN",
        channelCapacity: 16,
      },
      capabilities,
      channels,
      probeDurationMs: Date.now() - startTime,
      probedAt: new Date(),
      reasonCodes: ["generic_rtsp_fallback_mode"],
    };
  }

  async getDeviceInfo(ctx: RecorderContext): Promise<DeviceInfo> {
    return {
      manufacturer: "Generic RTSP Device",
      model: "Generic Streamer",
      deviceType: "UNKNOWN",
      channelCapacity: 16,
    };
  }

  async getCapabilities(ctx: RecorderContext): Promise<RecorderCapabilities> {
    return {
      recordingSearch: { supported: false, source: "unknown", confidence: 0.1 },
      storageHealth: { supported: false, source: "unknown", confidence: 0.1 },
      smartHealth: { supported: false, source: "unknown", confidence: 0.1 },
      channelStatus: { supported: true, source: "generic", confidence: 0.5 },
      liveStream: { supported: true, source: "generic", confidence: 0.95 },
      subStream: { supported: true, source: "generic", confidence: 0.9 },
      ptz: { supported: false, source: "unknown", confidence: 0.1 },
      deviceTime: { supported: false, source: "unknown", confidence: 0.1 },
      timeSync: { supported: false, source: "unknown", confidence: 0.1 },
    };
  }

  async getChannels(ctx: RecorderContext): Promise<RecorderChannel[]> {
    const channels: RecorderChannel[] = [];
    for (let i = 1; i <= 16; i++) {
      channels.push({
        channelId: `ch-${i}`,
        channelNumber: i,
        name: `CAM${String(i).padStart(2, "0")}`,
        sourceType: "IP",
        connectionState: "ONLINE",
        recordingState: "UNKNOWN",
        streamAvailable: true,
        videoLoss: false,
        tamperingDetected: false,
        ptzSupported: false,
        lastSeen: new Date(),
      });
    }
    return channels;
  }

  async getChannel(ctx: RecorderContext, channelId: string): Promise<RecorderChannel> {
    const channels = await this.getChannels(ctx);
    const found = channels.find((c) => c.channelId === channelId);
    if (!found) throw new Error(`Channel ${channelId} not found`);
    return found;
  }

  async getStreamUri(ctx: RecorderContext, request: StreamRequest): Promise<StreamEndpoint> {
    const subtype = request.streamType === "SUB" ? 1 : 0;
    const port = ctx.endpoint.port === 80 ? 554 : ctx.endpoint.port;
    const uri = `rtsp://${ctx.endpoint.host}:${port}/live/ch${request.channelNumber}_${subtype}`;

    return {
      uri,
      protocol: "RTSP",
      streamType: request.streamType,
      codec: "H264",
      width: request.streamType === "MAIN" ? 1920 : 640,
      height: request.streamType === "MAIN" ? 1080 : 360,
      fps: request.streamType === "MAIN" ? 25 : 10,
      bitrateKbps: request.streamType === "MAIN" ? 3500 : 450,
      transport: "RTSP",
    };
  }

  async getChannelStatus(ctx: RecorderContext, channelId: string): Promise<ChannelStatus> {
    return {
      channelId,
      state: "HEALTHY",
      connected: true,
      hasSignal: true,
      recording: false,
      observedAt: new Date(),
    };
  }

  async getRecordingStatus(ctx: RecorderContext, channelId: string): Promise<RecordingStatus> {
    return {
      channelId,
      state: "UNKNOWN",
      activelyWriting: false,
      configEnabled: false,
      observedAt: new Date(),
    };
  }

  async searchRecordings(
    ctx: RecorderContext,
    request: RecordingSearchRequest
  ): Promise<RecordingSearchResult> {
    return {
      channelId: `ch-${request.channelNumber}`,
      channelNumber: request.channelNumber,
      searchRange: { from: request.from, to: request.to },
      segments: [],
      totalSegments: 0,
      coverageHours: 0,
      hasGaps: true,
      searchedAt: new Date(),
    };
  }

  async getStorageStatus(ctx: RecorderContext): Promise<StorageStatus> {
    return {
      state: "UNKNOWN",
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      usagePercent: 0,
      disks: { total: 0, healthy: 0, warning: 0, failed: 0, unknown: 0 },
      volumes: [],
      observedAt: new Date(),
    };
  }

  async getDeviceTime(ctx: RecorderContext): Promise<DeviceTimeResult> {
    return {
      deviceTime: new Date(),
      systemTime: new Date(),
      driftSeconds: 0,
      observedAt: new Date(),
    };
  }
}
