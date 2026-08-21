import type {
  AuthResult,
  DeviceCapabilities,
  DeviceCredential,
  DeviceIdentity,
  DeviceSession,
  DeviceTarget,
  MediaSource,
  ProbeResult,
  StreamProfile,
} from "../domain/device-connectivity.types.js";

export interface DeviceAdapter {
  readonly adapterType: string;
  readonly adapterVersion: string;
  probe(target: DeviceTarget): Promise<ProbeResult>;
  authenticate(target: DeviceTarget, credential: DeviceCredential): Promise<AuthResult>;
  getIdentity(session: DeviceSession): Promise<DeviceIdentity>;
  getCapabilities(session: DeviceSession): Promise<DeviceCapabilities>;
  getStreams(session: DeviceSession, channelId?: string): Promise<StreamProfile[]>;
  getLiveSource(session: DeviceSession, channelId: string, profileId: string): Promise<MediaSource>;
  getSnapshot?(session: DeviceSession, channelId: string): Promise<Buffer>;
  reboot?(session: DeviceSession): Promise<void>;
}

abstract class UnconfiguredDeviceAdapter implements DeviceAdapter {
  abstract readonly adapterType: string;
  abstract readonly adapterVersion: string;

  async probe(_target: DeviceTarget): Promise<ProbeResult> {
    return {
      matched: false,
      confidence: 0,
      protocols: [],
      evidence: [{ check: "adapter_transport", result: "not_configured", weight: 1 }],
    };
  }

  async authenticate(_target: DeviceTarget, _credential: DeviceCredential): Promise<AuthResult> {
    return {
      success: false,
      error: {
        category: "protocol",
        code: "ADAPTER_TRANSPORT_NOT_CONFIGURED",
        retryable: false,
        operatorActionRequired: true,
        message: `${this.adapterType} connectivity transport is not configured`,
        occurredAt: new Date().toISOString(),
      },
    };
  }

  async getIdentity(_session: DeviceSession): Promise<DeviceIdentity> {
    throw this.unavailable();
  }

  async getCapabilities(_session: DeviceSession): Promise<DeviceCapabilities> {
    throw this.unavailable();
  }

  async getStreams(_session: DeviceSession, _channelId?: string): Promise<StreamProfile[]> {
    throw this.unavailable();
  }

  async getLiveSource(_session: DeviceSession, _channelId: string, _profileId: string): Promise<MediaSource> {
    throw this.unavailable();
  }

  private unavailable() {
    return new Error(`${this.adapterType} connectivity transport is not configured`);
  }
}

export class CPPlusAdapter extends UnconfiguredDeviceAdapter {
  readonly adapterType = "cpplus";
  readonly adapterVersion = "unconfigured";
}

export class DahuaAdapter extends UnconfiguredDeviceAdapter {
  readonly adapterType = "dahua";
  readonly adapterVersion = "unconfigured";
}

export class HikvisionAdapter extends UnconfiguredDeviceAdapter {
  readonly adapterType = "hikvision";
  readonly adapterVersion = "unconfigured";
}

export class ONVIFAdapter extends UnconfiguredDeviceAdapter {
  readonly adapterType = "onvif";
  readonly adapterVersion = "unconfigured";
}

export class DeviceAdapterResolver {
  private static readonly adapters: DeviceAdapter[] = [];

  static registerAdapter(adapter: DeviceAdapter): void {
    this.adapters.push(adapter);
  }

  static async resolveBestAdapter(target: DeviceTarget): Promise<{ adapter: DeviceAdapter; probeResult: ProbeResult }> {
    let selected: { adapter: DeviceAdapter; probeResult: ProbeResult } | undefined;
    for (const adapter of this.adapters) {
      const probeResult = await adapter.probe(target);
      if (probeResult.matched && (!selected || probeResult.confidence > selected.probeResult.confidence)) {
        selected = { adapter, probeResult };
      }
    }
    if (!selected) throw new Error(`No verified device adapter is available for ${target.host}`);
    return selected;
  }
}
