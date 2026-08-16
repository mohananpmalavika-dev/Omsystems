/**
 * Recorder Session & Subdivided Operations Model
 * 
 * Encapsulates an active authenticated session against a physical recorder,
 * providing sub-operation modules (`device`, `channels`, `streams`, `recordings`, `storage`, `capabilities`)
 * while sharing authentication state, correlation IDs, and circuit breaker health.
 */

import type {
  RecorderDriver,
  ChannelStatus,
  RecordingStatus,
  DeviceTimeResult,
} from "./recorder-driver.interface.js";
import type {
  RecorderContext,
  RecorderCapabilities,
  DeviceInfo,
  StorageStatus,
  RecorderChannel,
  StreamEndpoint,
  StreamRequest,
  RecordingSearchRequest,
  RecordingSearchResult,
  RecorderProbeResult,
} from "./recorder-driver.types.js";
import { CircuitBreaker } from "./circuit-breaker.js";

export class RecorderSession {
  private circuitBreaker: CircuitBreaker;
  public readonly openedAt: number;

  constructor(
    public readonly ctx: RecorderContext,
    public readonly driver: RecorderDriver,
    circuitBreaker?: CircuitBreaker
  ) {
    this.openedAt = Date.now();
    this.circuitBreaker = circuitBreaker ?? new CircuitBreaker();
  }

  get id(): string {
    return this.ctx.recorderId;
  }

  get protocol(): string {
    return this.driver.protocol;
  }

  // 1. Device Operations
  public readonly device = {
    getInfo: async (): Promise<DeviceInfo> => {
      return this.circuitBreaker.execute(() => this.driver.getDeviceInfo(this.ctx));
    },
    getTime: async (): Promise<DeviceTimeResult> => {
      return this.circuitBreaker.execute(() => this.driver.getDeviceTime(this.ctx));
    },
  };

  // 2. Channel Operations
  public readonly channels = {
    list: async (): Promise<RecorderChannel[]> => {
      return this.circuitBreaker.execute(() => this.driver.getChannels(this.ctx));
    },
    get: async (channelId: string): Promise<RecorderChannel> => {
      return this.circuitBreaker.execute(() => this.driver.getChannel(this.ctx, channelId));
    },
    status: async (channelId: string): Promise<ChannelStatus> => {
      return this.circuitBreaker.execute(() => this.driver.getChannelStatus(this.ctx, channelId));
    },
  };

  // 3. Streaming Operations
  public readonly streams = {
    resolve: async (request: StreamRequest): Promise<StreamEndpoint> => {
      return this.circuitBreaker.execute(() => this.driver.getStreamUri(this.ctx, request));
    },
  };

  // 4. Recording Operations
  public readonly recordings = {
    status: async (channelId: string): Promise<RecordingStatus> => {
      return this.circuitBreaker.execute(() => this.driver.getRecordingStatus(this.ctx, channelId));
    },
    search: async (request: RecordingSearchRequest): Promise<RecordingSearchResult> => {
      return this.circuitBreaker.execute(() => this.driver.searchRecordings(this.ctx, request));
    },
  };

  // 5. Storage Operations
  public readonly storage = {
    list: async (): Promise<StorageStatus> => {
      return this.circuitBreaker.execute(() => this.driver.getStorageStatus(this.ctx));
    },
  };

  // 6. Capability Operations
  public readonly capabilities = {
    detect: async (): Promise<RecorderCapabilities> => {
      return this.circuitBreaker.execute(() => this.driver.getCapabilities(this.ctx));
    },
  };

  // Comprehensive Probe Snapshot
  async probe(): Promise<RecorderProbeResult> {
    return this.circuitBreaker.execute(() => this.driver.probe(this.ctx));
  }

  async close(): Promise<void> {
    // Teardown any keepalive sockets or session tokens
  }
}
