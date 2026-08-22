import { BaseSecurityDeviceAdapter } from '../../../adapters/security-device/base-adapter';
import {
  ConnectionResult,
  DeviceCapability,
  DeviceCommand,
  DeviceCommandResult,
  DeviceProtocol,
  DeviceState,
  DiscoveryOptions,
  DiscoveredDevice,
  SecurityDevice,
  SecurityDeviceAdapter,
  SecurityDeviceEvent,
  SecurityDeviceHealthSnapshot,
  SecurityDeviceType,
} from '../../../types/security-device';
import { AxProClient } from './client';
import { AxProError } from './errors';
import {
  axProDeviceStatusFromHealth,
  axProReadOnlyCapabilities,
  extractAxProEventRecords,
  mapAxProDevices,
  mapAxProEvent,
  mapAxProHealth,
  mapAxProHealthSnapshot,
  mapAxProHub,
  mapAxProSystemInfo,
} from './mapper';
import { AxProConnectionConfig, AxProConnectionResult, AxProCredentials, AxProEventContext } from './types';

export type AxProCredentialResolver = (credentialSecretId: string) => Promise<AxProCredentials>;

export class HikvisionAxProAdapter extends BaseSecurityDeviceAdapter implements SecurityDeviceAdapter {
  static readonly adapterName = 'HIKVISION_AX_PRO';
  static readonly adapterVersion = '1.0.0';
  private static globalCredentialResolver: AxProCredentialResolver | undefined;

  readonly adapterName = HikvisionAxProAdapter.adapterName;
  readonly adapterVersion = HikvisionAxProAdapter.adapterVersion;
  readonly supportedProtocols: DeviceProtocol[] = ['AX_PRO', 'ISAPI'];
  readonly supportedDeviceTypes: SecurityDeviceType[] = [
    'AX_PRO_HUB', 'AX_PRO_PIR', 'AX_PRO_PIRCAM', 'AX_PRO_MAGNETIC_CONTACT',
    'AX_PRO_GLASS_BREAK', 'AX_PRO_SHOCK', 'AX_PRO_SMOKE', 'AX_PRO_WATER',
    'AX_PRO_TEMPERATURE', 'AX_PRO_PANIC', 'AX_PRO_KEYPAD', 'AX_PRO_TAG_READER',
    'AX_PRO_KEYFOB', 'AX_PRO_SOUNDER', 'AX_PRO_REPEATER', 'AX_PRO_OUTPUT',
  ];

  constructor(private readonly credentialResolver?: AxProCredentialResolver) {
    super();
  }

  static setGlobalCredentialResolver(resolver: AxProCredentialResolver): void {
    HikvisionAxProAdapter.globalCredentialResolver = resolver;
  }

  protected async onInitialize(config: Record<string, any>): Promise<void> {
    const resolver = config.credentialResolver;
    if (typeof resolver === 'function') {
      HikvisionAxProAdapter.setGlobalCredentialResolver(resolver as AxProCredentialResolver);
    }
  }

  async discover(network: string, _options?: DiscoveryOptions): Promise<DiscoveredDevice[]> {
    const configured = this.config.axProConnection as AxProConnectionConfig | undefined;
    if (!configured || configured.host !== network) return [];
    return this.discoverDevices(configured);
  }

  async testConnection(device: SecurityDevice): Promise<boolean>;
  async testConnection(config: AxProConnectionConfig): Promise<AxProConnectionResult>;
  async testConnection(input: SecurityDevice | AxProConnectionConfig): Promise<boolean | AxProConnectionResult> {
    if ('type' in input && 'id' in input) {
      const result = await this.testConnection(this.configFromDevice(input));
      return result.success;
    }

    const config = input;
    const startedAt = Date.now();
    try {
      const client = await this.createClient(config);
      const response = await client.getSystemInfo();
      let capabilities: DeviceCapability[] = axProReadOnlyCapabilities();
      if (config.endpointPaths?.capabilities) {
        await client.getCapabilities();
      }
      return {
        success: true,
        responseTimeMs: Date.now() - startedAt || response.responseTimeMs,
        systemInfo: mapAxProSystemInfo(response.data),
        capabilities,
      };
    } catch (error) {
      return {
        success: false,
        responseTimeMs: Date.now() - startedAt,
        errorCode: error instanceof AxProError ? error.code : 'AXPRO_UNKNOWN_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async discoverDevices(config: AxProConnectionConfig): Promise<DiscoveredDevice[]> {
    const client = await this.createClient(config);
    const systemInfo = await client.getSystemInfo();
    const discovered = [mapAxProHub(systemInfo.data, config)];
    if (config.endpointPaths?.devices) {
      const response = await client.getDeviceList();
      discovered.push(...mapAxProDevices(response.data, config));
    }
    return deduplicateDevices(discovered);
  }

  async connect(device: SecurityDevice): Promise<ConnectionResult> {
    try {
      this.validateDeviceConfig(device);
      const config = this.configFromDevice(device);
      const result = await this.testConnection(config);
      if (!result.success || !result.systemInfo) {
        return { success: false, errorMessage: result.errorMessage };
      }
      const client = await this.createClient(config);
      this.connections.set(device.id, client);
      return {
        success: true,
        capabilities: result.capabilities,
        deviceInfo: {
          manufacturer: 'Hikvision',
          model: result.systemInfo.model || device.model || 'AX PRO',
          serialNumber: result.systemInfo.serialNumber,
          firmwareVersion: result.systemInfo.firmwareVersion,
          hardwareVersion: result.systemInfo.hardwareVersion,
          supportedProtocols: this.supportedProtocols,
          metadata: { source: 'hikvision-ax-pro', systemInfo: result.systemInfo.raw },
        },
      };
    } catch (error) {
      return { success: false, errorMessage: error instanceof Error ? error.message : String(error) };
    }
  }

  async getHealth(device: SecurityDevice): Promise<SecurityDeviceHealthSnapshot> {
    const client = await this.getTypedConnection(device);
    const startedAt = Date.now();
    const response = device.metadata?.axProConfig?.endpointPaths?.deviceStatus
      ? await client.getDeviceStatus(device.metadata?.axProDeviceId)
      : await client.getSystemInfo();
    return mapAxProHealthSnapshot(device, response.data, Date.now() - startedAt || response.responseTimeMs);
  }

  async getState(device: SecurityDevice): Promise<DeviceState> {
    const health = await this.getHealth(device);
    return {
      status: axProDeviceStatusFromHealth(health),
      health: health.health,
      isOnline: health.isOnline,
      lastSeenAt: health.capturedAt,
      stateData: health.metadata,
    };
  }

  async getEvents(device: SecurityDevice, since?: Date, limit?: number): Promise<SecurityDeviceEvent[]> {
    const client = await this.getTypedConnection(device);
    const config = this.configFromDevice(device);
    const response = await client.getEvents(since, limit);
    const context: AxProEventContext = {
      tenantId: device.tenantId,
      branchId: device.branchId,
      deviceId: device.id,
    };
    return extractAxProEventRecords(response.data).map((event) => mapAxProEvent(event, context, config));
  }

  async executeCommand(device: SecurityDevice, command: DeviceCommand): Promise<DeviceCommandResult> {
    return {
      commandId: command.id,
      success: false,
      errorMessage: `AX PRO command ${command.command} is not enabled in the read-only integration phase`,
      executionTimeMs: 0,
      completedAt: new Date(),
    };
  }

  async getCapabilities(_device: SecurityDevice): Promise<DeviceCapability[]> {
    return axProReadOnlyCapabilities();
  }

  private async getTypedConnection(device: SecurityDevice): Promise<AxProClient> {
    const connection = await this.getConnection(device);
    if (!(connection instanceof AxProClient)) throw new AxProError('AXPRO_CONNECTION_INVALID', 'AX PRO connection is invalid');
    return connection;
  }

  private async createClient(config: AxProConnectionConfig): Promise<AxProClient> {
    const resolver = this.credentialResolver || HikvisionAxProAdapter.globalCredentialResolver;
    if (!resolver) throw new AxProError('AXPRO_CREDENTIAL_RESOLVER_NOT_CONFIGURED', 'No credential vault resolver is configured for AX PRO');
    const credentials = await resolver(config.credentialSecretId);
    return new AxProClient(config, credentials);
  }

  private configFromDevice(device: SecurityDevice): AxProConnectionConfig {
    const raw = device.metadata?.axProConfig;
    if (!raw || typeof raw !== 'object') {
      throw new AxProError('AXPRO_CONFIG_MISSING', `Device ${device.id} does not contain AX PRO connection metadata`);
    }
    return {
      ...(raw as AxProConnectionConfig),
      host: (raw as AxProConnectionConfig).host || device.ipAddress || '',
      port: (raw as AxProConnectionConfig).port || device.port || 443,
      branchId: device.branchId,
      credentialSecretId: device.credentialRefId || (raw as AxProConnectionConfig).credentialSecretId || '',
    };
  }
}

function deduplicateDevices(devices: DiscoveredDevice[]): DiscoveredDevice[] {
  const seen = new Set<string>();
  return devices.filter((device) => {
    const key = `${device.metadata?.axProDeviceId || ''}:${device.deviceType || ''}:${device.ipAddress}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export { HikvisionAxProAdapter as AxProAdapter };
