import { randomUUID, createHash } from 'node:crypto';
import {
  DeviceCapability,
  DeviceHealth,
  DeviceStatus,
  DiscoveredDevice,
  EventSeverity,
  SecurityDeviceEvent,
  SecurityDeviceEventType,
  SecurityDeviceHealthSnapshot,
  SecurityDeviceType,
} from '../../../types/security-device';
import { AxProConnectionConfig, AxProEventContext, AxProEventMappingResult, AxProNormalizedHealth, AxProRawPayload, AxProSystemInfo } from './types';
import { isRecord } from './client';

const READ_ONLY_CAPABILITIES: DeviceCapability[] = ['HEALTH_READ', 'EVENT_READ', 'STATUS_READ', 'METRICS_READ', 'LOG_READ'];

export function mapAxProSystemInfo(payload: AxProRawPayload): AxProSystemInfo {
  return {
    deviceId: stringValue(findValue(payload, ['deviceID', 'deviceId', 'serialNumber', 'serialNo'])),
    deviceName: stringValue(findValue(payload, ['deviceName', 'name'])),
    model: stringValue(findValue(payload, ['model', 'modelName', 'deviceModel'])),
    serialNumber: stringValue(findValue(payload, ['serialNumber', 'serialNo', 'deviceSerialNumber'])),
    firmwareVersion: stringValue(findValue(payload, ['firmwareVersion', 'firmwareVer', 'version'])),
    hardwareVersion: stringValue(findValue(payload, ['hardwareVersion', 'hardwareVer'])),
    raw: payload,
  };
}

export function mapAxProHub(
  payload: AxProRawPayload,
  config: AxProConnectionConfig,
): DiscoveredDevice {
  const info = mapAxProSystemInfo(payload);
  return {
    ipAddress: config.host,
    port: config.port,
    deviceType: 'AX_PRO_HUB',
    manufacturer: 'Hikvision',
    model: info.model,
    serialNumber: info.serialNumber || info.deviceId,
    firmwareVersion: info.firmwareVersion,
    protocol: 'AX_PRO',
    capabilities: READ_ONLY_CAPABILITIES,
    metadata: {
      source: 'hikvision-ax-pro',
      axProDeviceId: info.deviceId,
      axProDeviceName: info.deviceName,
      axProConfig: sanitizeAxProConfig(config),
    },
    discoveredAt: new Date(),
    confidence: 98,
  };
}

export function mapAxProDevices(
  payload: AxProRawPayload,
  config: AxProConnectionConfig,
): DiscoveredDevice[] {
  const records = extractRecords(payload, ['device', 'peripheral', 'zone', 'item', 'output', 'input']);
  const candidates = records.length > 0 ? records : hasDeviceIdentity(payload) ? [payload] : [];

  return candidates.map((record) => {
    const sourceId = stringValue(findValue(record, ['deviceID', 'deviceId', 'zoneId', 'id', 'serialNumber', 'serialNo']));
    const type = mapAxProDeviceType(stringValue(findValue(record, ['deviceType', 'type', 'subType', 'category'])));
    return {
      ipAddress: config.host,
      port: config.port,
      deviceType: type,
      manufacturer: 'Hikvision',
      model: stringValue(findValue(record, ['model', 'modelName'])),
      serialNumber: stringValue(findValue(record, ['serialNumber', 'serialNo'])),
      firmwareVersion: stringValue(findValue(record, ['firmwareVersion', 'version'])),
      protocol: 'AX_PRO',
      capabilities: READ_ONLY_CAPABILITIES,
      metadata: {
        source: 'hikvision-ax-pro',
        axProDeviceId: sourceId,
        axProDeviceName: stringValue(findValue(record, ['name', 'deviceName', 'zoneName'])),
        axProDeviceType: stringValue(findValue(record, ['deviceType', 'type', 'subType', 'category'])),
        axProConfig: sanitizeAxProConfig(config),
        parentHost: config.host,
      },
      discoveredAt: new Date(),
      confidence: type ? 92 : 65,
    };
  });
}

export function mapAxProHealth(
  payload: AxProRawPayload,
  fallbackOnline = true,
): AxProNormalizedHealth {
  const online = booleanValue(findValue(payload, ['online', 'isOnline', 'connected', 'communicationStatus']), fallbackOnline) ?? fallbackOnline;
  const batteryLevelPercent = numberValue(findValue(payload, ['batteryLevel', 'batteryPercent', 'batteryPercentage']));
  const batteryVoltage = numberValue(findValue(payload, ['batteryVoltage', 'voltage']));
  const signalStrengthDbm = numberValue(findValue(payload, ['signalStrength', 'rssi', 'signalStrengthDbm']));
  const acPower = booleanValue(findValue(payload, ['acPower', 'mainsPower', 'externalPower']), undefined);
  const tamper = booleanValue(findValue(payload, ['tamper', 'tampered', 'lidOpen']), undefined);
  const lastSeenValue = findValue(payload, ['lastSeen', 'lastSeenAt', 'lastCommunication']);
  const lastSeenAt = dateValue(lastSeenValue);

  return {
    isOnline: online,
    batteryLevelPercent,
    batteryVoltage,
    signalStrengthDbm,
    powerStatus: acPower === undefined ? undefined : acPower ? 'AC' : 'BATTERY',
    tamper,
    rfStatus: stringValue(findValue(payload, ['rfStatus', 'radioStatus', 'communicationStatus'])),
    lastSeenAt,
    raw: payload,
  };
}

export function mapAxProHealthSnapshot(
  device: { id: string; tenantId: string; branchId: string },
  payload: AxProRawPayload,
  responseTimeMs: number,
): SecurityDeviceHealthSnapshot {
  const normalized = mapAxProHealth(payload);
  const healthScore = calculateHealthScore(normalized);
  return {
    id: '',
    deviceId: device.id,
    tenantId: device.tenantId,
    branchId: device.branchId,
    health: healthFromScore(healthScore),
    healthScore,
    isOnline: normalized.isOnline,
    responseTimeMs,
    signalStrengthDbm: normalized.signalStrengthDbm,
    powerStatus: normalized.powerStatus,
    batteryLevelPercent: normalized.batteryLevelPercent,
    batteryVoltage: normalized.batteryVoltage,
    errorCount: normalized.tamper ? 1 : 0,
    warningCount: normalized.tamper ? 1 : 0,
    lastErrorMessage: normalized.tamper ? 'AX PRO tamper state reported by device' : undefined,
    metadata: {
      source: 'hikvision-ax-pro',
      tamper: normalized.tamper,
      rfStatus: normalized.rfStatus,
      lastSeenAt: normalized.lastSeenAt?.toISOString(),
      raw: normalized.raw,
    },
    capturedAt: new Date(),
    createdAt: new Date(),
  };
}

export function mapAxProEvent(
  payload: AxProRawPayload,
  context: AxProEventContext,
  config: AxProConnectionConfig,
): SecurityDeviceEvent {
  const sourceEventId = getSourceEventId(payload);
  const mapping = resolveEventType(payload, config.eventTypeMap);
  const occurredAt = dateValue(findValue(payload, ['occurredAt', 'eventTime', 'timestamp', 'time'])) || new Date();
  const eventType = mapping.eventType;
  const severity = eventSeverity(eventType);
  const title = mapping.unmapped
    ? 'Hikvision AX PRO event (unmapped)'
    : `Hikvision AX PRO ${eventType.replaceAll('_', ' ').toLowerCase()}`;

  return {
    id: randomUUID(),
    tenantId: context.tenantId,
    branchId: context.branchId,
    deviceId: context.deviceId,
    eventType,
    severity,
    category: eventCategory(eventType),
    title,
    description: mapping.unmapped
      ? 'The AX PRO event was retained for review because no approved vendor mapping exists.'
      : undefined,
    occurredAt,
    receivedAt: new Date(),
    processed: false,
    acknowledged: false,
    payload,
    normalizedPayload: {
      source: 'hikvision-ax-pro',
      sourceEventId,
      eventType,
      unmapped: mapping.unmapped,
    },
    metadata: {
      source: 'hikvision-ax-pro',
      sourceEventId,
      idempotencyKey: `HIKVISION_AX_PRO:${context.deviceId}:${sourceEventId}`,
      rawEventType: stringValue(findValue(payload, ['eventType', 'type', 'alarmType', 'eventCode'])),
      zone: stringValue(findValue(payload, ['zone', 'zoneId', 'zoneName'])),
    },
    createdAt: new Date(),
  };
}

export function extractAxProEventRecords(payload: AxProRawPayload): AxProRawPayload[] {
  const records = extractRecords(payload, ['event', 'alert', 'eventNotificationAlert', 'item']);
  if (records.length > 0) return records;
  return hasEventIdentity(payload) ? [payload] : [];
}

export function sanitizeAxProConfig(config: AxProConnectionConfig): Record<string, unknown> {
  return {
    host: config.host,
    port: config.port,
    protocol: config.protocol,
    credentialSecretId: config.credentialSecretId,
    branchId: config.branchId,
    pollingIntervalSeconds: config.pollingIntervalSeconds,
    enabled: config.enabled,
    timeoutMs: config.timeoutMs,
    allowInsecureHttp: config.allowInsecureHttp,
    authMethod: config.authMethod,
    endpointPaths: config.endpointPaths,
    eventTypeMap: config.eventTypeMap,
  };
}

export function axProReadOnlyCapabilities(): DeviceCapability[] {
  return [...READ_ONLY_CAPABILITIES];
}

export function resolveEventType(
  payload: AxProRawPayload,
  eventTypeMap?: Record<string, SecurityDeviceEventType>,
): AxProEventMappingResult {
  const rawType = stringValue(findValue(payload, ['eventType', 'type', 'alarmType', 'eventCode', 'status'])) || 'unknown';
  const normalizedKey = normalize(rawType);
  const explicit = eventTypeMap?.[rawType] || eventTypeMap?.[normalizedKey];
  const eventType = explicit || semanticEventType(normalizedKey);
  const unmapped = !eventType;
  const resolved = eventType || 'AX_PRO_EVENT_UNMAPPED';
  const sourceEventId = getSourceEventId(payload);
  return {
    sourceEventId,
    idempotencyKey: `HIKVISION_AX_PRO:${sourceEventId}`,
    eventType: resolved,
    unmapped,
  };
}

function semanticEventType(value: string): SecurityDeviceEventType | undefined {
  if (value.includes('panic') || value.includes('duress')) return 'PANIC_BUTTON_PRESSED';
  if (value.includes('tamper') || value.includes('lidopen')) return 'DEVICE_TAMPER';
  if (value.includes('lowbattery') || value.includes('battery')) return 'DEVICE_LOW_BATTERY';
  if (value.includes('powerloss') || value.includes('acloss')) return 'DEVICE_POWER_LOSS';
  if (value.includes('communicationfailure') || value.includes('offline')) return 'DEVICE_COMMUNICATION_FAILURE';
  if (value.includes('online') || value.includes('restored')) return 'DEVICE_ONLINE';
  if (value.includes('motion') || value.includes('pir')) return 'MOTION_DETECTED';
  if (value.includes('glassbreak')) return 'GLASS_BREAK_DETECTED';
  if (value.includes('shock') || value.includes('vibration')) return 'VIBRATION_DETECTED';
  if (value.includes('smoke') || value.includes('fire')) return 'SMOKE_DETECTED';
  if (value.includes('water') || value.includes('flood')) return 'WATER_LEAK_DETECTED';
  if (value.includes('dooropen') || value.includes('zonealarm')) return 'DOOR_OPENED';
  if (value.includes('doorclose')) return 'DOOR_CLOSED';
  if (value.includes('alarmclear') || value.includes('restore')) return 'ALARM_CLEARED';
  if (value.includes('armed')) return 'ALARM_ARMED';
  if (value.includes('disarmed')) return 'ALARM_DISARMED';
  return undefined;
}

function eventCategory(eventType: SecurityDeviceEventType): SecurityDeviceEvent['category'] {
  if (eventType.includes('SMOKE') || eventType.includes('FIRE')) return 'FIRE';
  if (eventType.includes('POWER') || eventType.includes('BATTERY')) return 'POWER';
  if (eventType.includes('NETWORK') || eventType.includes('COMMUNICATION')) return 'NETWORK';
  if (eventType.includes('ACCESS') || eventType.includes('DOOR')) return 'ACCESS';
  if (eventType.includes('ALARM') || eventType.includes('PANIC') || eventType.includes('TAMPER')) return 'ALARM';
  return 'OTHER';
}

function eventSeverity(eventType: SecurityDeviceEventType): EventSeverity {
  if (eventType === 'PANIC_BUTTON_PRESSED' || eventType === 'SMOKE_DETECTED' || eventType === 'WATER_LEAK_DETECTED') return 'P1';
  if (eventType === 'DEVICE_TAMPER' || eventType === 'GLASS_BREAK_DETECTED' || eventType === 'ALARM_TRIGGERED') return 'P2';
  if (eventType === 'AX_PRO_EVENT_UNMAPPED') return 'INFO';
  return 'P3';
}

function mapAxProDeviceType(value?: string): SecurityDeviceType | undefined {
  const type = normalize(value || '');
  if (type.includes('pircamera') || type.includes('pircam')) return 'AX_PRO_PIRCAM';
  if (type.includes('pir')) return 'AX_PRO_PIR';
  if (type.includes('magnetic') || type.includes('contact') || type.includes('door')) return 'AX_PRO_MAGNETIC_CONTACT';
  if (type.includes('glass')) return 'AX_PRO_GLASS_BREAK';
  if (type.includes('shock') || type.includes('vibration')) return 'AX_PRO_SHOCK';
  if (type.includes('smoke')) return 'AX_PRO_SMOKE';
  if (type.includes('water') || type.includes('flood')) return 'AX_PRO_WATER';
  if (type.includes('temperature') || type.includes('heat')) return 'AX_PRO_TEMPERATURE';
  if (type.includes('panic')) return 'AX_PRO_PANIC';
  if (type.includes('keypad')) return 'AX_PRO_KEYPAD';
  if (type.includes('tag')) return 'AX_PRO_TAG_READER';
  if (type.includes('keyfob') || type.includes('key') && type.includes('fob')) return 'AX_PRO_KEYFOB';
  if (type.includes('sounder') || type.includes('siren')) return 'AX_PRO_SOUNDER';
  if (type.includes('repeater')) return 'AX_PRO_REPEATER';
  if (type.includes('output')) return 'AX_PRO_OUTPUT';
  if (type.includes('panel') || type.includes('hub') || type.includes('axpro')) return 'AX_PRO_HUB';
  return undefined;
}

function extractRecords(value: unknown, keys: string[]): AxProRawPayload[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];

  const wanted = new Set(keys.map(normalize));
  for (const [key, child] of Object.entries(value)) {
    if (wanted.has(normalize(key))) {
      if (Array.isArray(child)) return child.filter(isRecord);
      if (isRecord(child)) {
        const nested = extractRecords(child, keys);
        return nested.length > 0 ? nested : [child];
      }
    }
  }
  for (const child of Object.values(value)) {
    const nested = extractRecords(child, keys);
    if (nested.length > 0) return nested;
  }
  return [];
}

function findValue(value: unknown, keys: string[]): unknown {
  if (!isRecord(value)) return undefined;
  const wanted = new Set(keys.map(normalize));
  for (const [key, child] of Object.entries(value)) {
    if (wanted.has(normalize(key))) return child;
  }
  for (const child of Object.values(value)) {
    const found = findValue(child, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function hasDeviceIdentity(value: AxProRawPayload): boolean {
  return Boolean(findValue(value, ['deviceID', 'deviceId', 'zoneId', 'serialNumber', 'serialNo']));
}

function hasEventIdentity(value: AxProRawPayload): boolean {
  return Boolean(findValue(value, ['eventType', 'alarmType', 'eventCode', 'occurredAt', 'eventTime']));
}

function getSourceEventId(payload: AxProRawPayload): string {
  const value = stringValue(findValue(payload, ['eventId', 'eventID', 'alarmId', 'serialNo', 'sequence', 'id']));
  if (value) return value;
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);
}

function normalize(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function booleanValue(value: unknown, fallback: boolean | undefined): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    if (['true', 'online', 'connected', 'normal', 'ac'].includes(value.toLowerCase())) return true;
    if (['false', 'offline', 'disconnected', 'alarm', 'battery'].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function dateValue(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function calculateHealthScore(health: AxProNormalizedHealth): number {
  if (!health.isOnline) return 0;
  let score = 100;
  if (health.tamper) score -= 20;
  if (health.batteryLevelPercent !== undefined && health.batteryLevelPercent < 20) score -= 25;
  else if (health.batteryLevelPercent !== undefined && health.batteryLevelPercent < 40) score -= 10;
  if (health.signalStrengthDbm !== undefined && health.signalStrengthDbm < -90) score -= 20;
  else if (health.signalStrengthDbm !== undefined && health.signalStrengthDbm < -75) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function healthFromScore(score: number): DeviceHealth {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 70) return 'GOOD';
  if (score >= 50) return 'FAIR';
  if (score >= 30) return 'POOR';
  return 'CRITICAL';
}

export function axProDeviceStatusFromHealth(health: SecurityDeviceHealthSnapshot): DeviceStatus {
  if (!health.isOnline) return 'OFFLINE';
  if (health.health === 'CRITICAL' || health.health === 'POOR') return 'DEGRADED';
  return 'ONLINE';
}
