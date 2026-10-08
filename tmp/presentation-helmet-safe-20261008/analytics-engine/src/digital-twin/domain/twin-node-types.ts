/**
 * Twin Node Types
 * 
 * Canonical node types representing all infrastructure elements
 * in the Digital Twin dependency graph.
 */

/**
 * Hierarchical organization structure
 */
export type HierarchyNodeType =
  | 'ENTERPRISE'
  | 'REGION'
  | 'BRANCH';

/**
 * Network infrastructure
 */
export type NetworkNodeType =
  | 'ISP'
  | 'ROUTER'
  | 'FIREWALL'
  | 'SWITCH'
  | 'VLAN'
  | 'GATEWAY'
  | 'ACCESS_POINT'
  | 'NETWORK_SEGMENT';

/**
 * Power infrastructure
 */
export type PowerNodeType =
  | 'UPS'
  | 'PDU'
  | 'GENERATOR'
  | 'POWER_CIRCUIT';

/**
 * Video surveillance infrastructure
 */
export type VideoNodeType =
  | 'CAMERA'
  | 'NVR'
  | 'DVR'
  | 'CHANNEL'
  | 'VIDEO_ENCODER'
  | 'VIDEO_DECODER';

/**
 * Storage infrastructure
 */
export type StorageNodeType =
  | 'STORAGE_ARRAY'
  | 'DISK'
  | 'RAID_GROUP'
  | 'STORAGE_POOL'
  | 'NAS'
  | 'SAN';

/**
 * Physical security infrastructure
 */
export type SecurityNodeType =
  | 'ACCESS_CONTROLLER'
  | 'DOOR'
  | 'DOOR_LOCK'
  | 'CARD_READER'
  | 'BIOMETRIC_READER'
  | 'BARRIER'
  | 'TURNSTILE';

/**
 * Banking and financial infrastructure
 */
export type BankingNodeType =
  | 'ATM'
  | 'VAULT'
  | 'VAULT_DOOR'
  | 'CASH_COUNTER'
  | 'TELLER_STATION'
  | 'STRONG_ROOM'
  | 'CASH_VAN';

/**
 * Sensors and environmental monitoring
 */
export type SensorNodeType =
  | 'FIRE_SENSOR'
  | 'SMOKE_SENSOR'
  | 'MOTION_SENSOR'
  | 'TEMPERATURE_SENSOR'
  | 'HUMIDITY_SENSOR'
  | 'PANIC_BUTTON'
  | 'WATER_SENSOR'
  | 'GAS_SENSOR';

/**
 * Software and services
 */
export type ServiceNodeType =
  | 'SERVICE'
  | 'APPLICATION'
  | 'EDGE_AGENT'
  | 'ANALYTICS_ENGINE'
  | 'VMS_SERVER'
  | 'DATABASE'
  | 'WEB_SERVER';

/**
 * Business capabilities (abstract operational nodes)
 */
export type BusinessCapabilityType =
  | 'ATM_SURVEILLANCE'
  | 'VAULT_MONITORING'
  | 'ENTRANCE_MONITORING'
  | 'CASH_COUNTER_MONITORING'
  | 'PERIMETER_SECURITY'
  | 'PARKING_MONITORING'
  | 'LOBBY_SURVEILLANCE'
  | 'RECORDING_CAPABILITY'
  | 'EVIDENCE_CAPABILITY'
  | 'REMOTE_GUARD_CAPABILITY';

/**
 * All node types in the Digital Twin
 */
export type TwinNodeType =
  | HierarchyNodeType
  | NetworkNodeType
  | PowerNodeType
  | VideoNodeType
  | StorageNodeType
  | SecurityNodeType
  | BankingNodeType
  | SensorNodeType
  | ServiceNodeType
  | BusinessCapabilityType;

/**
 * Node lifecycle states
 */
export type TwinNodeLifecycle =
  | 'DISCOVERED'      // Discovered but not yet provisioned
  | 'PROVISIONING'    // Being provisioned
  | 'ACTIVE'          // Actively deployed and configured
  | 'DISABLED'        // Administratively disabled
  | 'MAINTENANCE'     // Under maintenance
  | 'ARCHIVED';       // No longer in use

/**
 * Operational state of a node
 */
export type TwinNodeOperationalState =
  | 'HEALTHY'         // Fully operational
  | 'DEGRADED'        // Operating but with issues
  | 'FAILED'          // Not operational
  | 'UNKNOWN';        // State cannot be determined

/**
 * Node criticality level
 */
export type TwinNodeCriticality =
  | 'CRITICAL'        // Business-critical, immediate attention required
  | 'HIGH'            // High importance, urgent attention needed
  | 'MEDIUM'          // Normal importance
  | 'LOW';            // Low priority

/**
 * Type guard functions
 */
export function isHierarchyNode(type: TwinNodeType): type is HierarchyNodeType {
  return ['ENTERPRISE', 'REGION', 'BRANCH'].includes(type);
}

export function isNetworkNode(type: TwinNodeType): type is NetworkNodeType {
  return ['ISP', 'ROUTER', 'FIREWALL', 'SWITCH', 'VLAN', 'GATEWAY', 'ACCESS_POINT', 'NETWORK_SEGMENT'].includes(type);
}

export function isPowerNode(type: TwinNodeType): type is PowerNodeType {
  return ['UPS', 'PDU', 'GENERATOR', 'POWER_CIRCUIT'].includes(type);
}

export function isVideoNode(type: TwinNodeType): type is VideoNodeType {
  return ['CAMERA', 'NVR', 'DVR', 'CHANNEL', 'VIDEO_ENCODER', 'VIDEO_DECODER'].includes(type);
}

export function isStorageNode(type: TwinNodeType): type is StorageNodeType {
  return ['STORAGE_ARRAY', 'DISK', 'RAID_GROUP', 'STORAGE_POOL', 'NAS', 'SAN'].includes(type);
}

export function isBusinessCapability(type: TwinNodeType): type is BusinessCapabilityType {
  return [
    'ATM_SURVEILLANCE',
    'VAULT_MONITORING',
    'ENTRANCE_MONITORING',
    'CASH_COUNTER_MONITORING',
    'PERIMETER_SECURITY',
    'PARKING_MONITORING',
    'LOBBY_SURVEILLANCE',
    'RECORDING_CAPABILITY',
    'EVIDENCE_CAPABILITY',
    'REMOTE_GUARD_CAPABILITY'
  ].includes(type);
}

export function isServiceNode(type: TwinNodeType): type is ServiceNodeType {
  return ['SERVICE', 'APPLICATION', 'EDGE_AGENT', 'ANALYTICS_ENGINE', 'VMS_SERVER', 'DATABASE', 'WEB_SERVER'].includes(type);
}
