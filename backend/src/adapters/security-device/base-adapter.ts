/**
 * Base Security Device Adapter
 * 
 * Abstract base class for all security device adapters.
 * Implements common functionality and defines the adapter interface.
 */

import {
  SecurityDevice,
  SecurityDeviceAdapter,
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

export abstract class BaseSecurityDeviceAdapter implements SecurityDeviceAdapter {
  abstract readonly adapterName: string;
  abstract readonly adapterVersion: string;
  abstract readonly supportedProtocols: DeviceProtocol[];
  abstract readonly supportedDeviceTypes: SecurityDeviceType[];

  protected config: Record<string, any> = {};
  protected initialized: boolean = false;
  protected connections: Map<string, any> = new Map();

  /**
   * Initialize the adapter with configuration
   */
  async initialize(config: Record<string, any>): Promise<void> {
    this.config = config;
    this.initialized = true;
    await this.onInitialize(config);
  }

  /**
   * Hook for adapter-specific initialization
   */
  protected async onInitialize(config: Record<string, any>): Promise<void> {
    // Override in subclass if needed
  }

  /**
   * Discover devices on the network
   */
  abstract discover(
    network: string,
    options?: DiscoveryOptions
  ): Promise<DiscoveredDevice[]>;

  /**
   * Connect to a device
   */
  abstract connect(device: SecurityDevice): Promise<ConnectionResult>;

  /**
   * Disconnect from a device
   */
  async disconnect(device: SecurityDevice): Promise<void> {
    this.connections.delete(device.id);
    await this.onDisconnect(device);
  }

  /**
   * Hook for adapter-specific disconnect logic
   */
  protected async onDisconnect(device: SecurityDevice): Promise<void> {
    // Override in subclass
  }

  /**
   * Get device health
   */
  abstract getHealth(
    device: SecurityDevice
  ): Promise<SecurityDeviceHealthSnapshot>;

  /**
   * Get current device state
   */
  abstract getState(device: SecurityDevice): Promise<DeviceState>;

  /**
   * Get device events since timestamp
   */
  abstract getEvents(
    device: SecurityDevice,
    since?: Date,
    limit?: number
  ): Promise<SecurityDeviceEvent[]>;

  /**
   * Execute a command on the device
   */
  abstract executeCommand(
    device: SecurityDevice,
    command: DeviceCommand
  ): Promise<DeviceCommandResult>;

  /**
   * Test device connectivity
   */
  async testConnection(device: SecurityDevice): Promise<boolean> {
    try {
      const state = await this.getState(device);
      return state.isOnline;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get device capabilities
   */
  abstract getCapabilities(device: SecurityDevice): Promise<DeviceCapability[]>;

  /**
   * Validate device configuration
   */
  protected validateDeviceConfig(device: SecurityDevice): void {
    if (!device.ipAddress && !device.metadata?.uri) {
      throw new Error(`Device ${device.id} missing IP address or URI`);
    }

    if (!this.supportedProtocols.includes(device.protocol)) {
      throw new Error(
        `Protocol ${device.protocol} not supported by ${this.adapterName}`
      );
    }

    if (!this.supportedDeviceTypes.includes(device.type)) {
      throw new Error(
        `Device type ${device.type} not supported by ${this.adapterName}`
      );
    }
  }

  /**
   * Get connection for device (create if needed)
   */
  protected async getConnection(device: SecurityDevice): Promise<any> {
    if (!this.connections.has(device.id)) {
      const result = await this.connect(device);
      if (!result.success) {
        throw new Error(
          result.errorMessage || 'Failed to connect to device'
        );
      }
    }
    return this.connections.get(device.id);
  }

  /**
   * Handle errors consistently
   */
  protected handleError(error: any, context: string): never {
    const message = error?.message || String(error);
    throw new Error(`${this.adapterName} ${context}: ${message}`);
  }

  /**
   * Check if adapter is initialized
   */
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`${this.adapterName} adapter not initialized`);
    }
  }

  /**
   * Create health snapshot from device data
   */
  protected createHealthSnapshot(
    device: SecurityDevice,
    data: Partial<SecurityDeviceHealthSnapshot>
  ): SecurityDeviceHealthSnapshot {
    return {
      id: '', // Will be set by service
      deviceId: device.id,
      tenantId: device.tenantId,
      branchId: device.branchId,
      health: data.health || 'UNKNOWN',
      healthScore: data.healthScore || 0,
      isOnline: data.isOnline ?? false,
      responseTimeMs: data.responseTimeMs,
      packetLossPercent: data.packetLossPercent,
      signalStrengthDbm: data.signalStrengthDbm,
      cpuUsagePercent: data.cpuUsagePercent,
      memoryUsagePercent: data.memoryUsagePercent,
      storageUsagePercent: data.storageUsagePercent,
      temperatureCelsius: data.temperatureCelsius,
      powerStatus: data.powerStatus,
      batteryLevelPercent: data.batteryLevelPercent,
      batteryVoltage: data.batteryVoltage,
      upsRuntimeMinutes: data.upsRuntimeMinutes,
      errorCount: data.errorCount || 0,
      warningCount: data.warningCount || 0,
      lastErrorMessage: data.lastErrorMessage,
      lastErrorAt: data.lastErrorAt,
      uptimeSeconds: data.uptimeSeconds,
      lastRebootAt: data.lastRebootAt,
      lastMaintenanceAt: data.lastMaintenanceAt,
      nextMaintenanceDue: data.nextMaintenanceDue,
      metadata: data.metadata || {},
      capturedAt: new Date(),
      createdAt: new Date(),
    };
  }

  /**
   * Calculate health score from metrics
   */
  protected calculateHealthScore(metrics: {
    isOnline: boolean;
    responseTimeMs?: number;
    packetLossPercent?: number;
    cpuUsagePercent?: number;
    memoryUsagePercent?: number;
    storageUsagePercent?: number;
    errorCount?: number;
  }): number {
    if (!metrics.isOnline) return 0;

    let score = 100;

    // Response time penalty
    if (metrics.responseTimeMs) {
      if (metrics.responseTimeMs > 5000) score -= 30;
      else if (metrics.responseTimeMs > 2000) score -= 15;
      else if (metrics.responseTimeMs > 1000) score -= 5;
    }

    // Packet loss penalty
    if (metrics.packetLossPercent) {
      if (metrics.packetLossPercent > 10) score -= 30;
      else if (metrics.packetLossPercent > 5) score -= 15;
      else if (metrics.packetLossPercent > 1) score -= 5;
    }

    // Resource usage penalties
    if (metrics.cpuUsagePercent && metrics.cpuUsagePercent > 90) score -= 10;
    if (metrics.memoryUsagePercent && metrics.memoryUsagePercent > 90)
      score -= 10;
    if (metrics.storageUsagePercent && metrics.storageUsagePercent > 90)
      score -= 10;

    // Error count penalty
    if (metrics.errorCount && metrics.errorCount > 0) {
      score -= Math.min(metrics.errorCount * 5, 20);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Map health score to health status
   */
  protected mapHealthScoreToStatus(
    score: number
  ): SecurityDeviceHealthSnapshot['health'] {
    if (score >= 90) return 'EXCELLENT';
    if (score >= 70) return 'GOOD';
    if (score >= 50) return 'FAIR';
    if (score >= 30) return 'POOR';
    return 'CRITICAL';
  }

  /**
   * Parse IP network range
   */
  protected parseNetworkRange(network: string): {
    baseIp: string;
    startIp: number;
    endIp: number;
  } {
    // Support CIDR notation (192.168.1.0/24)
    const cidrMatch = network.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
    if (cidrMatch) {
      const [, baseIp, bits] = cidrMatch;
      const hostBits = 32 - parseInt(bits);
      const numHosts = Math.pow(2, hostBits) - 2; // Exclude network and broadcast
      return {
        baseIp: baseIp.split('.').slice(0, 3).join('.'),
        startIp: 1,
        endIp: Math.min(numHosts, 254),
      };
    }

    // Support range notation (192.168.1.1-254)
    const rangeMatch = network.match(/^(\d+\.\d+\.\d+\.)(\d+)-(\d+)$/);
    if (rangeMatch) {
      const [, baseIp, start, end] = rangeMatch;
      return {
        baseIp,
        startIp: parseInt(start),
        endIp: parseInt(end),
      };
    }

    // Default: assume /24 network
    const parts = network.split('.');
    if (parts.length === 4) {
      return {
        baseIp: parts.slice(0, 3).join('.'),
        startIp: 1,
        endIp: 254,
      };
    }

    throw new Error(`Invalid network range format: ${network}`);
  }

  /**
   * Sleep utility for discovery delays
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
