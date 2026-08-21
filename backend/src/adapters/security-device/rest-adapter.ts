/**
 * REST/HTTP API Adapter
 * 
 * Generic adapter for devices with REST/HTTP APIs.
 * Supports vendor-specific API integrations through configuration.
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
  DeviceStatus,
} from '../../types/security-device';

interface RestApiConfig {
  baseUrl?: string;
  authType?: 'none' | 'basic' | 'bearer' | 'apikey' | 'digest';
  apiKey?: string;
  apiKeyHeader?: string;
  username?: string;
  password?: string;
  timeout?: number;
  endpoints?: {
    health?: string;
    status?: string;
    events?: string;
    command?: string;
  };
}

export class RestAdapter extends BaseSecurityDeviceAdapter {
  readonly adapterName = 'REST';
  readonly adapterVersion = '1.0.0';
  readonly supportedProtocols: DeviceProtocol[] = ['REST', 'HTTP_API', 'HTTPS_API'];
  readonly supportedDeviceTypes: SecurityDeviceType[] = [
    'ACCESS_CONTROLLER',
    'DOOR_LOCK',
    'CARD_READER',
    'BIOMETRIC_READER',
    'INTRUSION_PANEL',
    'FIRE_PANEL',
    'ATM',
    'INTERCOM',
    'VISITOR_MANAGEMENT_KIOSK',
    'ENVIRONMENTAL_CONTROLLER',
  ];

  private apiConfig: RestApiConfig = {};

  protected async onInitialize(config: Record<string, any>): Promise<void> {
    this.apiConfig = config as RestApiConfig;
  }

  /**
   * Discover REST API devices
   */
  async discover(
    network: string,
    options?: DiscoveryOptions
  ): Promise<DiscoveredDevice[]> {
    this.ensureInitialized();

    // REST APIs typically don't support network discovery
    // Discovery would require a list of known endpoints
    console.log('REST adapter does not support network discovery');
    return [];
  }

  /**
   * Connect to REST API device
   */
  async connect(device: SecurityDevice): Promise<ConnectionResult> {
    this.validateDeviceConfig(device);

    try {
      const baseUrl = device.metadata?.apiBaseUrl || 
                      `http://${device.ipAddress}:${device.port || 80}`;

      const endpoint = device.metadata?.healthEndpoint || this.apiConfig.endpoints?.health || '/health';
      const response = await this.makeRequest(device, 'GET', endpoint, undefined, { timeout: 5000 });

      const connection = {
        deviceId: device.id,
        baseUrl,
        authType: device.metadata?.authType || 'none',
        connectedAt: new Date(),
      };

      this.connections.set(device.id, connection);

      return {
        success: true,
        deviceInfo: {
          manufacturer: device.manufacturer || 'Unknown',
          model: device.model || 'Unknown',
          serialNumber: device.serialNumber,
          firmwareVersion: device.firmwareVersion,
          hardwareVersion: device.hardwareVersion,
          macAddress: device.macAddress,
          supportedProtocols: ['REST'],
          metadata: response.data || {},
        },
        capabilities: device.capabilities,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: `Failed to connect to REST API: ${error}`,
      };
    }
  }

  /**
   * Make HTTP request to device
   */
  private async makeRequest(
    device: SecurityDevice,
    method: string,
    endpoint: string,
    data?: any,
    options?: { timeout?: number }
  ): Promise<{ status: number; data: any }> {
    const config = this.resolveApiConfig(device);
    const url = new URL(endpoint, normalizeApiBaseUrl(config.baseUrl ?? device.metadata?.apiBaseUrl, device));
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`unsupported_rest_protocol:${url.protocol}`);
    }

    const headers = new Headers({ accept: 'application/json, text/plain;q=0.9, */*;q=0.1' });
    this.applyAuthentication(headers, config);
    const normalizedMethod = method.toUpperCase();
    if (data !== undefined && !['GET', 'HEAD'].includes(normalizedMethod)) {
      headers.set('content-type', 'application/json');
    }

    const timeoutMs = options?.timeout ?? config.timeout ?? 10_000;
    let response: Response;
    try {
      response = await fetch(url, {
        method: normalizedMethod,
        headers,
        body: data !== undefined && !['GET', 'HEAD'].includes(normalizedMethod) ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
    } catch (error) {
      throw new Error(`rest_request_failed:${error instanceof Error ? error.message : String(error)}`);
    }

    const responseData = await readResponsePayload(response);
    if (!response.ok) {
      const detail = typeof responseData === 'string' ? responseData.slice(0, 256) : undefined;
      throw new Error(`rest_request_rejected:${response.status}${detail ? `:${detail}` : ''}`);
    }

    return { status: response.status, data: responseData };
  }

  private resolveApiConfig(device: SecurityDevice): RestApiConfig {
    const deviceConfig = device.metadata?.restApi;
    if (deviceConfig !== undefined && (typeof deviceConfig !== 'object' || Array.isArray(deviceConfig))) {
      throw new Error('invalid_rest_api_configuration');
    }
    return { ...this.apiConfig, ...(deviceConfig ?? {}) };
  }

  private applyAuthentication(headers: Headers, config: RestApiConfig): void {
    switch (config.authType ?? 'none') {
      case 'none':
        return;
      case 'basic':
        if (!config.username || config.password === undefined) throw new Error('rest_basic_credentials_unavailable');
        headers.set('authorization', `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`);
        return;
      case 'bearer':
        if (!config.apiKey) throw new Error('rest_bearer_token_unavailable');
        headers.set('authorization', `Bearer ${config.apiKey}`);
        return;
      case 'apikey':
        if (!config.apiKey) throw new Error('rest_api_key_unavailable');
        headers.set(config.apiKeyHeader || 'x-api-key', config.apiKey);
        return;
      case 'digest':
        throw new Error('rest_digest_auth_requires_vendor_adapter');
      default:
        throw new Error('unsupported_rest_authentication');
    }
  }

  /**
   * Get device health
   */
  async getHealth(
    device: SecurityDevice
  ): Promise<SecurityDeviceHealthSnapshot> {
    await this.getConnection(device);

    try {
      const startTime = Date.now();
      const endpoint = device.metadata?.healthEndpoint || this.apiConfig.endpoints?.health || '/api/health';
      
      const response = await this.makeRequest(device, 'GET', endpoint);
      const responseTimeMs = Date.now() - startTime;

      // Parse vendor-specific health response
      const healthData = this.parseHealthResponse(device, response.data);

      const healthScore = this.calculateHealthScore({
        isOnline: true,
        responseTimeMs,
        cpuUsagePercent: healthData.cpuUsagePercent,
        memoryUsagePercent: healthData.memoryUsagePercent,
        storageUsagePercent: healthData.storageUsagePercent,
        errorCount: healthData.errorCount || 0,
      });

      return this.createHealthSnapshot(device, {
        health: this.mapHealthScoreToStatus(healthScore),
        healthScore,
        isOnline: true,
        responseTimeMs,
        cpuUsagePercent: healthData.cpuUsagePercent,
        memoryUsagePercent: healthData.memoryUsagePercent,
        storageUsagePercent: healthData.storageUsagePercent,
        temperatureCelsius: healthData.temperatureCelsius,
        uptimeSeconds: healthData.uptimeSeconds,
        errorCount: healthData.errorCount || 0,
        warningCount: healthData.warningCount || 0,
      });
    } catch (error) {
      return this.createHealthSnapshot(device, {
        health: 'CRITICAL',
        healthScore: 0,
        isOnline: false,
        errorCount: 1,
        lastErrorMessage: String(error),
        lastErrorAt: new Date(),
      });
    }
  }

  /**
   * Parse vendor-specific health response
   */
  private parseHealthResponse(device: SecurityDevice, data: any): {
    cpuUsagePercent?: number;
    memoryUsagePercent?: number;
    storageUsagePercent?: number;
    temperatureCelsius?: number;
    uptimeSeconds?: number;
    errorCount?: number;
    warningCount?: number;
  } {
    // TODO: Implement vendor-specific parsing
    // Different vendors return health data in different formats
    
    return {
      cpuUsagePercent: data.cpu || data.cpuUsage || data.cpu_usage,
      memoryUsagePercent: data.memory || data.memoryUsage || data.memory_usage,
      storageUsagePercent: data.storage || data.storageUsage || data.storage_usage,
      temperatureCelsius: data.temperature || data.temp,
      uptimeSeconds: data.uptime || data.uptimeSeconds,
      errorCount: data.errors || data.errorCount || 0,
      warningCount: data.warnings || data.warningCount || 0,
    };
  }

  /**
   * Get device state
   */
  async getState(device: SecurityDevice): Promise<DeviceState> {
    await this.getConnection(device);

    try {
      const endpoint = device.metadata?.statusEndpoint || this.apiConfig.endpoints?.status || '/api/status';
      const response = await this.makeRequest(device, 'GET', endpoint);

      return {
        status: this.mapApiStatusToDeviceStatus(response.data.status),
        health: 'GOOD',
        isOnline: true,
        lastSeenAt: new Date(),
        stateData: response.data,
      };
    } catch (error) {
      return {
        status: 'OFFLINE' as DeviceStatus,
        health: 'CRITICAL',
        isOnline: false,
        lastSeenAt: device.lastSeenAt || new Date(),
        stateData: {},
      };
    }
  }

  /**
   * Map API status string to DeviceStatus
   */
  private mapApiStatusToDeviceStatus(status: string): DeviceStatus {
    const statusLower = String(status).toLowerCase();
    
    if (statusLower.includes('online') || statusLower === 'ok' || statusLower === 'active') {
      return 'ONLINE';
    }
    if (statusLower.includes('offline') || statusLower === 'down') {
      return 'OFFLINE';
    }
    if (statusLower.includes('degraded') || statusLower.includes('warning')) {
      return 'DEGRADED';
    }
    if (statusLower.includes('alarm') || statusLower.includes('alert')) {
      return 'ALARM';
    }
    if (statusLower.includes('maintenance')) {
      return 'MAINTENANCE';
    }
    
    return 'UNKNOWN';
  }

  /**
   * Get device events
   */
  async getEvents(
    device: SecurityDevice,
    since?: Date,
    limit?: number
  ): Promise<SecurityDeviceEvent[]> {
    await this.getConnection(device);

    try {
      const endpoint = device.metadata?.eventsEndpoint || this.apiConfig.endpoints?.events || '/api/events';
      const params = new URLSearchParams();
      if (since) params.set('since', since.toISOString());
      if (limit !== undefined) params.set('limit', String(limit));
      const response = await this.makeRequest(device, 'GET', `${endpoint}${params.size ? `${endpoint.includes('?') ? '&' : '?'}${params}` : ''}`);
      
      // Parse vendor-specific events
      return this.parseEventsResponse(device, response.data);
    } catch (error) {
      this.handleError(error, 'getEvents');
    }
  }

  /**
   * Parse vendor-specific events response
   */
  private parseEventsResponse(
    device: SecurityDevice,
    data: any
  ): SecurityDeviceEvent[] {
    // TODO: Implement vendor-specific event parsing
    
    const events = Array.isArray(data) ? data : data.events || [];
    
    return events.map((event: any) => ({
      id: event.id || '',
      tenantId: device.tenantId,
      branchId: device.branchId,
      deviceId: device.id,
      eventType: event.eventType || event.type || 'DEVICE_EVENT',
      severity: event.severity || 'INFO',
      category: event.category || 'OTHER',
      title: event.title || event.message || 'Device Event',
      description: event.description,
      occurredAt: new Date(event.timestamp || event.occurredAt || Date.now()),
      receivedAt: new Date(),
      processed: false,
      acknowledged: false,
      payload: event,
      metadata: {},
      createdAt: new Date(),
    }));
  }

  /**
   * Execute command on device
   */
  async executeCommand(
    device: SecurityDevice,
    command: DeviceCommand
  ): Promise<DeviceCommandResult> {
    await this.getConnection(device);

    const startTime = Date.now();

    try {
      const endpoint = device.metadata?.commandEndpoint || this.apiConfig.endpoints?.command || '/api/command';
      
      const response = await this.makeRequest(device, 'POST', endpoint, {
        command: command.command,
        parameters: command.parameters,
      });

      return {
        commandId: command.id,
        success: response.status >= 200 && response.status < 300,
        result: response.data,
        executionTimeMs: Date.now() - startTime,
        completedAt: new Date(),
      };
    } catch (error) {
      return {
        commandId: command.id,
        success: false,
        errorMessage: String(error),
        executionTimeMs: Date.now() - startTime,
        completedAt: new Date(),
      };
    }
  }

  /**
   * Get device capabilities
   */
  async getCapabilities(device: SecurityDevice): Promise<DeviceCapability[]> {
    await this.getConnection(device);

    try {
      const endpoint = device.metadata?.capabilitiesEndpoint || '/api/capabilities';
      const response = await this.makeRequest(device, 'GET', endpoint);

      // Parse capabilities from API response
      return this.parseCapabilitiesResponse(response.data);
    } catch (error) {
      // Fall back only to capabilities explicitly stored for this enrolled device.
      return device.capabilities;
    }
  }

  /**
   * Parse capabilities response
   */
  private parseCapabilitiesResponse(data: any): DeviceCapability[] {
    if (!data || !Array.isArray(data.capabilities)) return [];
    return data.capabilities.filter((cap: unknown): cap is DeviceCapability => typeof cap === 'string') as DeviceCapability[];
  }

  /**
   * Disconnect from device
   */
  protected async onDisconnect(device: SecurityDevice): Promise<void> {
    // No persistent connection to close for REST APIs
  }
}

function normalizeApiBaseUrl(configuredBaseUrl: unknown, device: SecurityDevice): string {
  if (typeof configuredBaseUrl === 'string' && configuredBaseUrl.trim()) return configuredBaseUrl.trim().replace(/\/$/, '') + '/';
  if (!device.ipAddress) throw new Error('rest_device_address_unavailable');
  return `http://${device.ipAddress}${device.port ? `:${device.port}` : ''}/`;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
