/**
 * MQTT security-device adapter.
 *
 * MQTT is transport-only: a real broker client, topic policy, and message
 * schema must be configured before this adapter can report state or execute
 * commands. This adapter deliberately fails closed until those dependencies
 * are supplied instead of claiming subscriptions or device health.
 */

import { BaseSecurityDeviceAdapter } from './base-adapter';
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

interface MqttConfig {
  brokerUrl?: string;
  clientId?: string;
  username?: string;
  password?: string;
  qos?: 0 | 1 | 2;
  topicPrefix?: string;
}

export class MqttAdapter extends BaseSecurityDeviceAdapter {
  readonly adapterName = 'MQTT';
  readonly adapterVersion = '1.0.0';
  readonly supportedProtocols: DeviceProtocol[] = ['MQTT'];
  readonly supportedDeviceTypes: SecurityDeviceType[] = [
    'PANIC_BUTTON',
    'DOOR_CONTACT',
    'WINDOW_CONTACT',
    'MOTION_SENSOR',
    'PIR_SENSOR',
    'TEMPERATURE_SENSOR',
    'HUMIDITY_SENSOR',
    'WATER_LEAK_SENSOR',
    'FLOOD_SENSOR',
    'GAS_DETECTOR',
    'ENVIRONMENTAL_CONTROLLER',
  ];

  private mqttConfig: MqttConfig = {};

  protected async onInitialize(config: Record<string, any>): Promise<void> {
    this.mqttConfig = config as MqttConfig;
  }

  async discover(
    _network: string,
    _options?: DiscoveryOptions
  ): Promise<DiscoveredDevice[]> {
    this.ensureInitialized();
    throw new Error(
      'MQTT discovery is unavailable until a broker client and discovery-topic policy are configured'
    );
  }

  async connect(device: SecurityDevice): Promise<ConnectionResult> {
    this.validateDeviceConfig(device);
    return {
      success: false,
      errorMessage: this.unavailableMessage(),
    };
  }

  async getHealth(device: SecurityDevice): Promise<SecurityDeviceHealthSnapshot> {
    return this.createHealthSnapshot(device, {
      health: 'UNKNOWN',
      healthScore: 0,
      isOnline: false,
      errorCount: 1,
      lastErrorMessage: this.unavailableMessage(),
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
    throw new Error(this.unavailableMessage());
  }

  async executeCommand(
    _device: SecurityDevice,
    command: DeviceCommand
  ): Promise<DeviceCommandResult> {
    return {
      commandId: command.id,
      success: false,
      errorMessage: this.unavailableMessage(),
      executionTimeMs: 0,
      completedAt: new Date(),
    };
  }

  async getCapabilities(_device: SecurityDevice): Promise<DeviceCapability[]> {
    throw new Error(this.unavailableMessage());
  }

  protected async onDisconnect(device: SecurityDevice): Promise<void> {
    this.connections.delete(device.id);
  }

  async shutdown(): Promise<void> {
    this.mqttConfig = {};
    this.connections.clear();
  }

  private unavailableMessage(): string {
    return this.mqttConfig.brokerUrl
      ? 'MQTT broker client is not installed/configured for this adapter'
      : 'MQTT broker URL is not configured';
  }
}
