import {
  DeviceCapability,
  DeviceProtocol,
  SecurityDeviceEventType,
  SecurityDeviceHealthSnapshot,
} from '../../../types/security-device';

export type AxProTransport = 'HTTP' | 'HTTPS';

export interface AxProEndpointPaths {
  /** Standard ISAPI endpoint available on AX PRO firmware. */
  systemInfo?: string;
  /** Firmware/model-specific endpoint. Configure after checking the device guide. */
  capabilities?: string;
  /** Firmware/model-specific endpoint that returns zones/peripherals. */
  devices?: string;
  /** Firmware/model-specific endpoint that returns panel/peripheral health. */
  deviceStatus?: string;
  /** Firmware/model-specific event endpoint or a configured event bridge endpoint. */
  events?: string;
}

export interface AxProConnectionConfig {
  host: string;
  port: number;
  protocol: AxProTransport;
  credentialSecretId: string;
  branchId: string;
  pollingIntervalSeconds: number;
  enabled: boolean;
  timeoutMs?: number;
  allowInsecureHttp?: boolean;
  authMethod?: 'auto' | 'basic' | 'digest';
  endpointPaths?: AxProEndpointPaths;
  eventTypeMap?: Record<string, SecurityDeviceEventType>;
}

export interface AxProCredentials {
  username: string;
  password: string;
}

export type AxProRawPayload = Record<string, unknown>;

export interface AxProSystemInfo {
  deviceId?: string;
  deviceName?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  hardwareVersion?: string;
  raw: AxProRawPayload;
}

export interface AxProConnectionResult {
  success: boolean;
  responseTimeMs?: number;
  systemInfo?: AxProSystemInfo;
  capabilities?: DeviceCapability[];
  errorCode?: string;
  errorMessage?: string;
}

export interface AxProNormalizedHealth {
  isOnline: boolean;
  batteryLevelPercent?: number;
  batteryVoltage?: number;
  signalStrengthDbm?: number;
  powerStatus?: SecurityDeviceHealthSnapshot['powerStatus'];
  tamper?: boolean;
  rfStatus?: string;
  lastSeenAt?: Date;
  raw: AxProRawPayload;
}

export interface AxProEventContext {
  tenantId: string;
  branchId: string;
  deviceId: string;
}

export interface AxProEventMappingResult {
  sourceEventId: string;
  idempotencyKey: string;
  eventType: SecurityDeviceEventType;
  unmapped: boolean;
}

export interface AxProIntegrationSummary {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  adapterName: string;
  adapterVersion: string;
  protocol: DeviceProtocol;
  host: string;
  port: number;
  transport: AxProTransport;
  credentialSecretId: string;
  endpointPaths: AxProEndpointPaths;
  enabled: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'MAINTENANCE';
  lastSyncAt?: Date;
  lastErrorAt?: Date;
  lastErrorMessage?: string;
  pollingIntervalSeconds: number;
  devicesManaged: number;
  eventsProcessedToday: number;
  totalEventsProcessed: number;
  createdAt: Date;
  updatedAt: Date;
}

