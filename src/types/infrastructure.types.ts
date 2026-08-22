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
  memoryTotalMb?: number;
  memoryUsedMb?: number;
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
  batteryVoltage?: number;
  batteryCurrent?: number;
  batteryTemperatureCelsius?: number;
  estimatedRuntimeMinutes?: number;
  estimatedChargeTimeMinutes?: number;
  utilityPowerAvailable: boolean;
  runningOnBattery: boolean;
  inputVoltage?: number;
  inputFrequency?: number;
  outputVoltage?: number;
  outputFrequency?: number;
  outputCurrent?: number;
  loadPercent?: number;
  loadWatts?: number;
  lastSelfTestResult?: 'passed' | 'failed' | 'warning' | 'in_progress' | 'not_available';
  lastSelfTestDate?: Date;
  lastPowerEventType?: string;
  lastPowerEventTime?: Date;
  batteryReplacementIndicator: boolean;
  predictedReplacementDays?: number;
  alarmStatus?: string[];
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

// =====================================================
// VPN & SD-WAN TYPES
// =====================================================

export interface VPNTunnel {
  id: string;
  tenantId: string;
  branchId: string;
  firewallId?: string;
  tunnelName: string;
  tunnelType: 'ipsec' | 'ssl' | 'gre' | 'wireguard' | 'openvpn';
  remoteEndpoint: string;
  remoteBranchId?: string;
  encryptionAlgorithm?: string;
  status: 'up' | 'down' | 'negotiating' | 'unknown';
}

export interface VPNTunnelMetrics {
  id: string;
  tenantId: string;
  tunnelId: string;
  observedAt: Date;
  tunnelStatus: 'up' | 'down' | 'negotiating';
  uptimeSeconds?: number;
  latencyMs?: number;
  packetLossPercent?: number;
  slaViolation: boolean;
  encryptionHealthy: boolean;
  healthScore: number;
  healthStatus: HealthStatus;
}

export interface SDWANPath {
  id: string;
  tenantId: string;
  branchId: string;
  pathName: string;
  linkId?: string;
  overlayType: 'mpls' | 'internet' | 'lte' | '5g';
  slaProfile?: string;
  activePath: boolean;
  status: 'active' | 'standby' | 'failed' | 'unknown';
}

export interface SDWANMetrics {
  id: string;
  tenantId: string;
  pathId: string;
  observedAt: Date;
  pathStatus: 'active' | 'standby' | 'failed';
  latencyMs?: number;
  jitterMs?: number;
  packetLossPercent?: number;
  slaCompliance: boolean;
  healthScore: number;
  healthStatus: HealthStatus;
}

// =====================================================
// HARDWARE TELEMETRY TYPES
// =====================================================

export interface HardwareDevice {
  id: string;
  tenantId: string;
  branchId: string;
  deviceName: string;
  deviceType: 'recorder' | 'server' | 'workstation' | 'appliance';
  ipAddress?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  cpuModel?: string;
  cpuCores?: number;
  memoryTotalGB?: number;
  gpuCount?: number;
  gpuModel?: string[];
  status: DeviceStatus;
}

export interface CPUMetrics {
  id: string;
  tenantId: string;
  deviceId: string;
  observedAt: Date;
  cpuUsagePercent?: number;
  temperatureCelsius?: number;
  frequencyMhz?: number;
  thermalThrottling: boolean;
  fanSpeedRpm?: number;
  healthScore: number;
  healthStatus: HealthStatus;
}

export interface GPUMetrics {
  id: string;
  tenantId: string;
  deviceId: string;
  gpuIndex: number;
  observedAt: Date;
  gpuName?: string;
  gpuUsagePercent?: number;
  memoryUsageMB?: number;
  memoryTotalMB?: number;
  temperatureCelsius?: number;
  powerDrawWatts?: number;
  encoderUsagePercent?: number;
  decoderUsagePercent?: number;
  thermalThrottling: boolean;
  powerThrottling: boolean;
  healthScore: number;
  healthStatus: HealthStatus;
}

export interface PowerMetrics {
  id: string;
  tenantId: string;
  branchId: string;
  deviceId?: string;
  upsId?: string;
  observedAt: Date;
  inputVoltage?: number;
  outputVoltage?: number;
  voltageFluctuationPercent?: number;
  brownoutDetected: boolean;
  overvoltageDetected: boolean;
  powerEventType: 'normal' | 'brownout' | 'overvoltage' | 'sag' | 'surge' | 'outage';
  healthScore: number;
  healthStatus: HealthStatus;
}

// =====================================================
// UNIFIED HEALTH SCORING TYPES
// =====================================================

export interface InfrastructureHealthScore {
  id: string;
  tenantId: string;
  branchId: string;
  observedAt: Date;
  overallScore: number;
  overallStatus: HealthStatus;
  powerScore: number;
  powerStatus: HealthStatus;
  networkScore: number;
  networkStatus: HealthStatus;
  computeScore: number;
  computeStatus: HealthStatus;
  storageScore: number;
  storageStatus: HealthStatus;
  coolingScore: number;
  coolingStatus: HealthStatus;
  securityScore: number;
  securityStatus: HealthStatus;
  surveillanceScore: number;
  surveillanceStatus: HealthStatus;
  componentDetails?: Record<string, any>;
  criticalIssues: number;
  warningIssues: number;
  predictedFailures: number;
}

export interface InfrastructureAvailabilityMetrics {
  id: string;
  tenantId: string;
  branchId: string;
  periodStart: Date;
  periodEnd: Date;
  periodType: 'hour' | 'day' | 'week' | 'month';
  totalUptimeSeconds: number;
  totalDowntimeSeconds: number;
  availabilityPercent: number;
  powerOutageCount: number;
  networkOutageCount: number;
  mtbfHours?: number;
  mttrHours?: number;
}

// =====================================================
// INFRASTRUCTURE ALERT TYPES
// =====================================================

export type ComponentType = 
  | 'switch' 
  | 'firewall' 
  | 'ups' 
  | 'generator' 
  | 'network_link' 
  | 'vpn' 
  | 'sdwan'
  | 'sfp' 
  | 'cpu' 
  | 'gpu' 
  | 'power' 
  | 'recorder' 
  | 'camera' 
  | 'storage' 
  | 'infrastructure';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'suppressed';

export interface InfrastructureAlert {
  id: string;
  tenantId: string;
  branchId: string;
  alertType: string;
  severity: AlertSeverity;
  componentType: ComponentType;
  componentId?: string;
  componentName?: string;
  title: string;
  description?: string;
  impact?: string;
  recommendedAction?: string;
  metrics?: Record<string, any>;
  thresholdViolated?: string;
  status: AlertStatus;
  detectedAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNotes?: string;
  autoResolved: boolean;
}

// =====================================================
// NETWORK TOPOLOGY TYPES
// =====================================================

export type TopologyDeviceType = 
  | 'switch' 
  | 'firewall' 
  | 'router' 
  | 'recorder' 
  | 'camera' 
  | 'ups' 
  | 'server' 
  | 'internet';

export type ConnectionType = 'physical' | 'logical' | 'power' | 'management';

export interface NetworkTopologyNode {
  id: string;
  tenantId: string;
  branchId: string;
  sourceDeviceType: TopologyDeviceType;
  sourceDeviceId: string;
  sourceInterface?: string;
  targetDeviceType: TopologyDeviceType;
  targetDeviceId?: string;
  targetInterface?: string;
  connectionType: ConnectionType;
  discoveredVia: 'lldp' | 'cdp' | 'arp' | 'mac_table' | 'manual' | 'snmp';
  lastSeen: Date;
}
