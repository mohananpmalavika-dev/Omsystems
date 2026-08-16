import type {
  Evidence,
  EvidenceSource,
  HealthState,
  RecorderDriver,
  RecorderDriverConfig,
  RecorderHealthObservation,
  RecorderVendor,
} from "../domain/recorder-driver.types.js";

export abstract class BaseRecorderDriver implements RecorderDriver {
  abstract readonly vendor: RecorderVendor;

  constructor(readonly config: RecorderDriverConfig) {}

  protected createEvidence<T>(
    state: HealthState,
    value: T | undefined,
    source: EvidenceSource,
    ttlSeconds: number = 120,
    options?: { confidence?: number; reason?: string; errorCode?: string },
  ): Evidence<T> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    return {
      state,
      value,
      source,
      observedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      confidence: options?.confidence ?? (state === "HEALTHY" ? 1.0 : state === "UNKNOWN" ? 0.0 : 0.8),
      reason: options?.reason,
      errorCode: options?.errorCode,
    };
  }

  abstract probeConnectivity(): Promise<Evidence<{ reachable: boolean; latencyMs: number }>>;
  abstract getDeviceInfo(): Promise<Evidence<any>>;
  abstract getDeviceTime(): Promise<Evidence<any>>;
  abstract getChannels(): Promise<Evidence<any>>;
  abstract getRecordingState(channelId?: string): Promise<Evidence<any>>;
  abstract getStorage(): Promise<Evidence<any>>;
  abstract getRetentionEvidence(channelId?: string, targetDays?: number): Promise<Evidence<any>>;

  async buildAuthoritativeObservation(targetRetentionDays: number = 90): Promise<RecorderHealthObservation> {
    const [conn, channels, storage, recState, retEvidence, devTime, info] = await Promise.all([
      this.probeConnectivity(),
      this.getChannels(),
      this.getStorage(),
      this.getRecordingState(),
      this.getRetentionEvidence(undefined, targetRetentionDays),
      this.getDeviceTime(),
      this.getDeviceInfo(),
    ]);

    const channelList = channels.value ?? [];
    const onlineCount = channelList.filter((c: any) => c.connected).length;
    const totalCount = channelList.length > 0 ? channelList.length : (info.value?.channelCount ?? 0);

    const recordingVal = recState.value ?? {
      expectedChannels: totalCount,
      recordingChannels: 0,
      isAllRecording: false,
    };
    const expectedChannels = totalCount || recordingVal.expectedChannels;
    const recordingChannels = recordingVal.recordingChannels;
    const isAllRecording = recordingChannels >= expectedChannels && expectedChannels > 0;

    const retentionVal = retEvidence.value ?? {
      minimumDays: 0,
      targetDays: targetRetentionDays,
      isCompliant: false,
    };

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 120 * 1000);

    return {
      recorderId: this.config.recorderId,
      branchId: this.config.branchId,
      vendor: this.vendor,
      model: info.value?.model ?? "CP-UNR-4K",
      firmwareVersion: info.value?.firmwareVersion,
      connectivity: conn,
      channels: {
        ...channels,
        value: {
          total: totalCount,
          online: onlineCount,
          offline: totalCount - onlineCount,
          channelDetails: channelList,
        },
      },
      disks: storage,
      recording: {
        ...recState,
        value: {
          expectedChannels,
          recordingChannels,
          isAllRecording,
        },
      },
      retention: {
        ...retEvidence,
        value: {
          minimumDays: retentionVal.retentionDaysObserved ?? 0,
          targetDays: targetRetentionDays,
          isCompliant: (retentionVal.retentionDaysObserved ?? 0) >= targetRetentionDays,
        },
      },
      deviceTime: devTime,
      observedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }
}
