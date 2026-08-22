import { Socket } from "node:net";
import type {
  DeviceTimeInfo,
  Evidence,
  RecorderChannelState,
  RecorderDeviceInfo,
  RecorderStorageEvidence,
  RecorderVendor,
  RetentionEvidence,
} from "../domain/recorder-driver.types.js";
import { BaseRecorderDriver } from "./base-recorder-driver.js";

/**
 * Connectivity-only legacy driver.
 *
 * Vendor telemetry must be supplied by the credential-backed recorder adapter
 * stack. These classes keep the old factory contract without manufacturing
 * device, channel, disk, recording, or retention evidence.
 */
abstract class EvidenceOnlyRecorderDriver extends BaseRecorderDriver {
  abstract readonly vendor: RecorderVendor;
  abstract readonly source: "DAHUA_API" | "HIKVISION_API" | "ONVIF";

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
        this.source,
        60,
      );
    } catch (error) {
      return this.createEvidence(
        "OFFLINE",
        { reachable: false, latencyMs: Date.now() - startedAt },
        this.source,
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
    return this.createEvidence<T>("UNKNOWN", undefined, this.source, 30, {
      confidence: 0,
      reason: `${operation} requires a credential-backed ${this.vendor} adapter`,
      errorCode: "RECORDER_ADAPTER_NOT_CONFIGURED",
    });
  }
}

export class DahuaRecorderDriver extends EvidenceOnlyRecorderDriver {
  readonly vendor: RecorderVendor = "DAHUA";
  readonly source = "DAHUA_API" as const;
}

export class HikvisionRecorderDriver extends EvidenceOnlyRecorderDriver {
  readonly vendor: RecorderVendor = "HIKVISION";
  readonly source = "HIKVISION_API" as const;
}

export class OnvifRecorderDriver extends EvidenceOnlyRecorderDriver {
  readonly vendor: RecorderVendor = "ONVIF";
  readonly source = "ONVIF" as const;
}
