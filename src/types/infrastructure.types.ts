/**
 * Infrastructure Monitoring Types
 * Type definitions for enterprise infrastructure monitoring
 */

export type DeviceStatus = 'online' | 'offline' | 'degraded' | 'unknown';
export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';
export type ManagementProtocol = 'snmp_v2c' | 'snmp_v3' | 'ssh' | 'api' | 'telnet';

// =====================================================
// SWITCH TYPES
// =====================================================

export interface NetworkSwitch {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  ipAddress: string;
  macAddress?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  managementProtocol: ManagementProtocol;
  snmpCommunity?: string;
  snmpVersion?: string;
  portCount: number;
  poeEnabled: boolean;
  poeBudgetWatts?: number;
  stackMember: boolean;
  stackPriority?: number;
  status: DeviceStatus;
  location?: string;
  notes?: string;
}

export interface SwitchHealthMetrics {
  id: string;
  tenantId: string;
  switchId: string;
  observedAt: Date;
  cpuUsagePercent?: number;
  memoryUsagePercent?: number;
  temperatureCelsius?: number;
  fanStatus?: 'ok' | 'warning' | 'failed' | 'unknown';
  fanRpm?: number;
  powerSupplyStatus?: 'ok' | 'redundant' | 'failed' | 'unknown';
  uptimeSeconds?: number;
  poePowerUsageWatts?: number;
  poePowerAvailableWatts?: number;
  poeUtilizationPercent?: number;
  totalPorts: number;
  portsUp: number;
  portsDown: number;
  portErrorsTotal?: number;
  healthScore: number;
  healthStatus: HealthStatus;
}

export interface SwitchPortMetrics {
  id: string;
  tenantId: string;
  switchId: string;
  portNumber: number;
  portName?: string;
  observedAt: Date;
  adminStatus?: 'up' | 'down' | 'testing';
  operStatus?: 'up' | 'down' | 'testing' | 'unknown' | 'dormant' | 'notPresent' | 'lowerLayerDown';
  speedMbps?: number;
  duplex?: 'full' | 'half' | 'auto' | 'unknown';
  vlanId?: number;
  poeEnabled: boolean;
  poePowerWatts?: number;
  poeDeviceDetected: boolean;
  connectedDeviceType?: string;
  connectedDeviceMac?: string;
  rxBytes?: number;
  txBytes?: number;
  rxErrors?: number;
  txErrors?: number;
  utilizationPercent?: number;
}

// =====================================================
// FIREWALL TYPES
// =====================================================

export interface Firewall {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  ipAddress: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  managementProtocol: ManagementProtocol;
  highAvailability: boolean;
  haRole?: 'active' | 'passive' | 'standalone';
  licenseExpiryDate?: Date;
  status: DeviceStatus;
}

export interface FirewallHealthMetrics {
  id: string;
  tenantId: string;
  firewallId: string;
  observedAt: Date;
  cpuUsagePercent?: number;
  memoryUsagePercent?: number;
  sessionCount?: number;
  sessionUtilizationPercent?: number;
  threatsBlockedTotal?: number;
  threatsBlockedLastHour?: number;
  ipsStatus?: 'enabled' | 'disabled' | 'bypassed';
  avStatus?: 'enabled' | 'disabled' | 'outdated';
  vpnTunnelsTotal?: number;
  vpnTunnelsUp?: number;
  vpnTunnelsDown?: number;
  haSyncStatus?: 'in_sync' | 'out_of_sync' | 'na';
  healthScore: number;
  healthStatus: HealthStatus;
}

// =====================================================
// UPS TYPES
// =====================================================

export interface UPSDevice {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  ipAddress?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  capacityVA?: number;
  capacityWatts?: number;
  batteryType?: string;
  batteryInstallationDate?: Date;
  managementProtocol: ManagementProtocol;
  status: 'online' | 'on_battery' | 'offline' | 'unknown';
}

export interface UPSHealthMetrics {
  id: string;
  tenantId: string;
  upsId: string;
  observedAt: Date;
  batteryHealthPercent?: number;
  batteryAgeDays?: number;
  estimatedRuntimeMinutes?: number;
  utilityPowerAvailable: boolean;
  runningOnBattery: boolean;
  inputVoltage?: number;
  outputVoltage?: number;
  loadPercent?: number;
  loadWatts?: number;
  lastSelfTestResult?: 'passed' | 'failed' | 'warning' | 'in_progress' | 'not_available';
  batteryReplacementIndicator: boolean;
  predictedReplacementDays?: number;
  healthScore: number;
  healthStatus: HealthStatus;
}

// =====================================================
// GENERATOR TYPES
// =====================================================

export interface Generator {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  capacityKVA?: number;
  fuelType?: 'diesel' | 'natural_gas' | 'propane' | 'gasoline' | 'dual_fuel';
  fuelTankCapacityLiters?: number;
  nextServiceDate?: Date;
  status: 'standby' | 'running' | 'offline' | 'fault' | 'unknown';
}

export interface GeneratorHealthMetrics {
  id: string;
  tenantId: string;
  generatorId: string;
  observedAt: Date;
  running: boolean;
  fuelLevelPercent?: number;
  estimatedRuntimeHours?: number;
  engineRuntimeHours?: number;
  engineTemperatureCelsius?: number;
  oilPressureBar?: number;
  batteryVoltage?: number;
  outputPowerKW?: number;
  loadPercent?: number;
  maintenanceDue: boolean;
  maintenanceDueDays?: number;
  healthScore: number;
  healthStatus: HealthStatus;
}

// =====================================================
// NETWORK & OPTICAL TYPES
// =====================================================

export interface NetworkLink {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  linkType: 'wan' | 'mpls' | 'broadband' | 'fiber' | 'lte' | '5g' | 'satellite' | 'vpn';
  provider?: string;
  bandwidthMbps?: number;
  primaryLink: boolean;
  status: 'up' | 'down' | 'degraded' | 'unknown';
}

export interface NetworkLinkMetrics {
  id: string;
  tenantId: string;
  linkId: string;
  observedAt: Date;
  linkStatus: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  jitterMs?: number;
  packetLossPercent?: number;
  bandwidthUtilizationPercent?: number;
  availabilityPercent?: number;
  healthScore: number;
  healthStatus: HealthStatus;
}

export interface SFPModule {
  id: string;
  tenantId: string;
  switchId: string;
  portNumber: number;
  moduleType: 'sfp' | 'sfp_plus' | 'qsfp' | 'qsfp28' | 'qsfp_dd';
  vendor?: string;
  partNumber?: string;
  serialNumber?: string;
  status: 'present' | 'absent' | 'faulty' | 'unknown';
}

export interface SFPOpticalMetrics {
  id: string;
  tenantId: string;
  sfpId: string;
  observedAt: Date;
  temperatureCelsius?: number;
  voltage?: number;
  txPowerDbm?: number;
  rxPowerDbm?: number;
  opticalLossDb?: number;
  healthScore: number;
  healthStatus: HealthStatus;
}
