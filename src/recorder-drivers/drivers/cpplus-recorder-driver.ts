import { Socket } from "node:net";
import type {
  DeviceTimeInfo,
  Evidence,
  RecorderChannelState,
  RecorderDeviceInfo,
  RecorderDriverConfig,
  RecorderStorageEvidence,
  RecorderVendor,
  RetentionEvidence,
} from "../domain/recorder-driver.types.js";
import { BaseRecorderDriver } from "./base-recorder-driver.js";

export class CpPlusRecorderDriver extends BaseRecorderDriver {
  readonly vendor: RecorderVendor = "CP_PLUS";

  constructor(config: RecorderDriverConfig) {
    super(config);
  }

  async probeConnectivity(): Promise<Evidence<{ reachable: boolean; latencyMs: number }>> {
    const startedAt = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new Socket();
        const finish = (error?: Error) => {
          socket.destroy();
          error ? reject(error) : resolve();
        };
        socket.setTimeout(5_000, () => finish(new Error("connect_timeout")));
        socket.once("error", finish);
        socket.connect(this.config.port, this.config.host, () => finish());
      });
      return this.createEvidence(
        "HEALTHY",
        { reachable: true, latencyMs: Date.now() - startedAt },
        "CP_PLUS_API",
        60,
      );
    } catch (error) {
      return this.createEvidence(
        "OFFLINE",
        { reachable: false, latencyMs: Date.now() - startedAt },
        "CP_PLUS_API",
        30,
        {
          confidence: 1,
          reason: error instanceof Error ? error.message : "connect_failed",
          errorCode: "RECORDER_UNREACHABLE",
        },
      );
    }
  }

  async getDeviceInfo(): Promise<Evidence<RecorderDeviceInfo>> {
    return this.unavailable("device information");
  }

  async getDeviceTime(): Promise<Evidence<DeviceTimeInfo>> {
    return this.unavailable("device time");
  }

  async getChannels(): Promise<Evidence<RecorderChannelState[]>> {
    return this.unavailable("channel inventory");
  }

  async getRecordingState(): Promise<Evidence<{ recording: boolean; recordingChannels: number; totalChannels: number }>> {
    return this.unavailable("recording state");
  }

  async getStorage(): Promise<Evidence<RecorderStorageEvidence[]>> {
    return this.unavailable("storage telemetry");
  }

  async getRetentionEvidence(
    _channelId?: string,
    _targetDays?: number,
  ): Promise<Evidence<RetentionEvidence>> {
    return this.unavailable("retention evidence");
  }

  private unavailable<T>(operation: string): Evidence<T> {
    return this.createEvidence<T>("UNKNOWN", undefined, "CP_PLUS_API", 30, {
      confidence: 0,
      reason: `${operation} requires a credential-backed CP PLUS/Dahua CGI adapter`,
      errorCode: "RECORDER_ADAPTER_NOT_CONFIGURED",
    });
  }
}
