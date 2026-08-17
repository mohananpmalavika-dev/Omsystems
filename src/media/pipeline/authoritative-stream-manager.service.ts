import { randomUUID } from "node:crypto";
import { DeviceAdapterFactory, type DeviceAdapter, type MediaSource } from "../device-adapters/device-adapter.types.js";

export type StreamState =
  | "starting"
  | "connecting"
  | "streaming"
  | "degraded"
  | "reconnecting"
  | "failed"
  | "stopping";

export type ConsumerType = "live" | "recording" | "analytics";

export interface StreamConsumer {
  id: string;
  type: ConsumerType;
  consumerRef: string; // e.g. "recording:rec-481" or "live:session-993"
  attachedAt: string;
  isPermanent?: boolean;
}

export interface StreamSession {
  id: string; // "stream:omsystems:cam-27:main"
  tenantId: string;
  cameraId: string;
  cameraName: string;
  branchId: string;
  channelId: string;
  profileId: string; // "main" | "sub" | "mobile"

  // Distributed Cluster Ownership & Fencing Token
  ownerNodeId: string; // "media-node-03"
  leaseGeneration: number; // 843
  leaseExpiresAt: string;

  // Stream Health & Telemetry
  state: StreamState;
  source: MediaSource;
  startedAt: string;
  lastPacketAt: string;
  lastFrameAt: string;
  lastKeyframeAt: string;
  fps: number;
  bitrateBps: number;
  reconnectCount: number;

  consumers: StreamConsumer[];
}

export class AuthoritativeStreamManagerService {
  private activeStreams = new Map<string, StreamSession>();
  private activeNodeId = "media-node-03";
  private currentGeneration = 843;

  constructor() {
    this.seedInitialStreams();
  }

  private seedInitialStreams() {
    const now = new Date();

    const stream27: StreamSession = {
      id: "stream:omsystems:cam-27:main",
      tenantId: "omsystems",
      cameraId: "cam-27",
      cameraName: "Vault Door Primary (CAM-27)",
      branchId: "BR-118",
      channelId: "17",
      profileId: "main",
      ownerNodeId: this.activeNodeId,
      leaseGeneration: this.currentGeneration,
      leaseExpiresAt: new Date(now.getTime() + 15000).toISOString(),
      state: "streaming",
      source: {
        protocol: "rtsp",
        uri: "rtsp://192.168.29.200:554/cam/realmonitor?channel=17&subtype=0",
        transport: "tcp",
        codec: "h265",
        authRef: "vault:cred:cpplus-vault",
        deviceTimestamp: now,
      },
      startedAt: new Date(now.getTime() - 86400000).toISOString(),
      lastPacketAt: now.toISOString(),
      lastFrameAt: now.toISOString(),
      lastKeyframeAt: new Date(now.getTime() - 1200).toISOString(),
      fps: 25,
      bitrateBps: 4093291,
      reconnectCount: 0,
      consumers: [
        {
          id: "cons-rec-481",
          type: "recording",
          consumerRef: "recording:rec-481",
          attachedAt: new Date(now.getTime() - 86400000).toISOString(),
          isPermanent: true,
        },
        {
          id: "cons-live-993",
          type: "live",
          consumerRef: "live:session-993",
          attachedAt: new Date(now.getTime() - 45000).toISOString(),
        },
      ],
    };

    this.activeStreams.set(stream27.id, stream27);
  }

  /**
   * Acquire a stream for a consumer (Recording, Live View, or Analytics).
   * Guarantees 1 single upstream RTSP connection to the camera.
   */
  async acquireStream(input: {
    tenantId?: string;
    branchId: string;
    cameraId: string;
    cameraName?: string;
    channelId?: string;
    profileId?: "main" | "sub" | "mobile";
    consumer: {
      type: ConsumerType;
      consumerRef: string;
      isPermanent?: boolean;
    };
    deviceManufacturer?: string;
    deviceIp?: string;
  }): Promise<{ stream: StreamSession; consumerId: string; wasExisting: boolean }> {
    const tenantId = input.tenantId || "omsystems";
    const profileId = input.profileId || "main";
    const streamId = `stream:${tenantId}:${input.cameraId}:${profileId}`;

    let stream = this.activeStreams.get(streamId);
    let wasExisting = true;

    if (!stream || stream.state === "failed" || stream.state === "stopping") {
      wasExisting = false;
      this.currentGeneration++;
      const now = new Date();

      // Resolve device adapter to obtain clean vendor-neutral MediaSource
      const adapter: DeviceAdapter = DeviceAdapterFactory.resolveAdapter(
        input.deviceManufacturer || "CP PLUS",
        input.deviceIp || "192.168.29.200",
      );

      const source = await adapter.getLiveSource(input.channelId || "1", profileId);

      stream = {
        id: streamId,
        tenantId,
        cameraId: input.cameraId,
        cameraName: input.cameraName || `Camera ${input.cameraId}`,
        branchId: input.branchId,
        channelId: input.channelId || "1",
        profileId,
        ownerNodeId: this.activeNodeId,
        leaseGeneration: this.currentGeneration,
        leaseExpiresAt: new Date(now.getTime() + 15000).toISOString(),
        state: "streaming",
        source,
        startedAt: now.toISOString(),
        lastPacketAt: now.toISOString(),
        lastFrameAt: now.toISOString(),
        lastKeyframeAt: now.toISOString(),
        fps: profileId === "main" ? 25 : profileId === "sub" ? 20 : 15,
        bitrateBps: profileId === "main" ? 4096000 : profileId === "sub" ? 1024000 : 384000,
        reconnectCount: 0,
        consumers: [],
      };

      this.activeStreams.set(streamId, stream);
    }

    const consumerId = `cons-${randomUUID().slice(0, 8)}`;
    stream.consumers.push({
      id: consumerId,
      type: input.consumer.type,
      consumerRef: input.consumer.consumerRef,
      attachedAt: new Date().toISOString(),
      isPermanent: input.consumer.isPermanent,
    });

    return { stream, consumerId, wasExisting };
  }

  /**
   * Release a stream consumer. If 0 consumers remain and no permanent recording, tears down RTSP.
   */
  async releaseStream(cameraId: string, profileId = "main", consumerId: string): Promise<boolean> {
    const streamId = `stream:omsystems:${cameraId}:${profileId}`;
    const stream = this.activeStreams.get(streamId);
    if (!stream) return false;

    stream.consumers = stream.consumers.filter((c) => c.id !== consumerId && c.consumerRef !== consumerId);

    const hasPermanent = stream.consumers.some((c) => c.isPermanent);
    if (stream.consumers.length === 0 && !hasPermanent) {
      stream.state = "stopping";
      this.activeStreams.delete(streamId);
    }

    return true;
  }

  getStream(cameraId: string, profileId = "main"): StreamSession | undefined {
    return this.activeStreams.get(`stream:omsystems:${cameraId}:${profileId}`);
  }

  listAllActiveStreams(): StreamSession[] {
    return [...this.activeStreams.values()];
  }

  /**
   * Simulate a media node failover (Chaos Kill Media Gateway Node)
   */
  simulateNodeFailover(targetNodeId = "media-node-01") {
    this.activeNodeId = targetNodeId;
    this.currentGeneration += 1;
    const now = new Date();

    for (const stream of this.activeStreams.values()) {
      stream.ownerNodeId = targetNodeId;
      stream.leaseGeneration = this.currentGeneration;
      stream.leaseExpiresAt = new Date(now.getTime() + 15000).toISOString();
      stream.reconnectCount += 1;
      stream.state = "streaming";
      stream.lastPacketAt = now.toISOString();
    }

    return {
      success: true,
      newNodeId: targetNodeId,
      newGeneration: this.currentGeneration,
      streamsMigratedCount: this.activeStreams.size,
    };
  }
}
