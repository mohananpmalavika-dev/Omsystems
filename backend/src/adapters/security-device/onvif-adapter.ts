/**
 * Generic ONVIF security-device adapter.
 *
 * Discovery is backed by the real WS-Discovery provider. Device operations
 * intentionally report unavailable until a credential-backed ONVIF client is
 * supplied; returning fabricated online/command-success responses is unsafe.
 * Recorder integrations should use the credential-aware recorder ONVIF
 * adapter, which performs the SOAP calls and evidence mapping.
 */

import { BaseSecurityDeviceAdapter } from './base-adapter';
import { OnvifDiscoveryProvider } from '../../provisioning/discovery/onvif-discovery.provider';
import {
  SecurityDevice,
  SecurityDeviceHealthSnapshot,
  SecurityDeviceEvent,
  DeviceCommand,
  DeviceCommandResult,
  DeviceState,
  DeviceCapability,
  DiscoveryOptions,
  DiscoveredDevice,
  ConnectionResult,
  DeviceProtocol,
  SecurityDeviceType,
} from '../../types/security-device';

export class OnvifAdapter extends BaseSecurityDeviceAdapter {
  readonly adapterName = 'ONVIF';
  readonly adapterVersion = '1.0.0';
  readonly supportedProtocols: DeviceProtocol[] = ['ONVIF', 'RTSP'];
  readonly supportedDeviceTypes: SecurityDeviceType[] = [
    'CAMERA',
    'NVR',
    'DVR',
    'VIDEO_ENCODER',
    'VIDEO_DECODER',
  ];

  async discover(
    network: string,
    options?: DiscoveryOptions
  ): Promise<DiscoveredDevice[]> {
    this.ensureInitialized();
    if (!network.trim()) {
      throw new Error('ONVIF discovery requires a network context');
    }

    const cameras = await new OnvifDiscoveryProvider().discover({
      tenantId: String(this.config.tenantId ?? ''),
      branchId: String(this.config.branchId ?? ''),
      approvedSubnets: [network],
      scanPorts: [80, 443],
      timeoutSeconds: options?.timeoutSeconds ?? 30,
    });

    return cameras.map((camera) => {
      let port: number | undefined;
      const serviceUrl = camera.serviceUrls?.[0];
      if (serviceUrl) {
        try {
          const parsed = new URL(serviceUrl);
          port = parsed.port
            ? Number(parsed.port)
            : parsed.protocol === 'https:'
              ? 443
              : 80;
        } catch {
          port = undefined;
        }
      }

      return {
        ipAddress: camera.ipAddress,
        port,
        deviceType: 'CAMERA',
        manufacturer: camera.vendor,
        model: camera.model,
        serialNumber: camera.serialNumber,
        protocol: 'ONVIF',
        metadata: {
          endpointReference: camera.endpointReference,
          serviceUrls: camera.serviceUrls,
          scopes: camera.scopes,
          discoveryNetwork: network,
        },
        discoveredAt: camera.discoveredAt,
        confidence: camera.vendor || camera.model ? 90 : 70,
      } satisfies DiscoveredDevice;
    });
  }

  async connect(device: SecurityDevice): Promise<ConnectionResult> {
    this.validateDeviceConfig(device);
    return {
      success: false,
      errorMessage:
        'Credential-backed ONVIF SOAP operations are not configured for the generic security-device adapter; use the recorder ONVIF integration',
    };
  }

  async getHealth(device: SecurityDevice): Promise<SecurityDeviceHealthSnapshot> {
    const message =
      'ONVIF health query is unavailable without a credential-backed client';
    return this.createHealthSnapshot(device, {
      health: 'UNKNOWN',
      healthScore: 0,
      isOnline: false,
      errorCount: 1,
      lastErrorMessage: message,
      lastErrorAt: new Date(),
    });
  }

  async getState(device: SecurityDevice): Promise<DeviceState> {
    return {
      status: 'UNKNOWN',
      health: 'UNKNOWN',
      isOnline: false,
      lastSeenAt: device.lastSeenAt ?? new Date(0),
      stateData: {},
    };
  }

  async getEvents(
    _device: SecurityDevice,
    _since?: Date,
    _limit?: number
  ): Promise<SecurityDeviceEvent[]> {
    throw new Error(
      'ONVIF event subscription is unavailable without a credential-backed client'
    );
  }

  async executeCommand(
    _device: SecurityDevice,
    command: DeviceCommand
  ): Promise<DeviceCommandResult> {
    return {
      commandId: command.id,
      success: false,
      errorMessage:
        'ONVIF command execution is unavailable without a credential-backed client',
      executionTimeMs: 0,
      completedAt: new Date(),
    };
  }

  async getCapabilities(_device: SecurityDevice): Promise<DeviceCapability[]> {
    throw new Error(
      'ONVIF capabilities are unavailable without a credential-backed client'
    );
  }

  protected async onDisconnect(device: SecurityDevice): Promise<void> {
    this.connections.delete(device.id);
  }
}
