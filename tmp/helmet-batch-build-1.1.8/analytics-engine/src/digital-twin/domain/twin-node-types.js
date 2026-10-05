/**
 * Twin Node Types
 *
 * Canonical node types representing all infrastructure elements
 * in the Digital Twin dependency graph.
 */
/**
 * Type guard functions
 */
export function isHierarchyNode(type) {
    return ['ENTERPRISE', 'REGION', 'BRANCH'].includes(type);
}
export function isNetworkNode(type) {
    return ['ISP', 'ROUTER', 'FIREWALL', 'SWITCH', 'VLAN', 'GATEWAY', 'ACCESS_POINT', 'NETWORK_SEGMENT'].includes(type);
}
export function isPowerNode(type) {
    return ['UPS', 'PDU', 'GENERATOR', 'POWER_CIRCUIT'].includes(type);
}
export function isVideoNode(type) {
    return ['CAMERA', 'NVR', 'DVR', 'CHANNEL', 'VIDEO_ENCODER', 'VIDEO_DECODER'].includes(type);
}
export function isStorageNode(type) {
    return ['STORAGE_ARRAY', 'DISK', 'RAID_GROUP', 'STORAGE_POOL', 'NAS', 'SAN'].includes(type);
}
export function isBusinessCapability(type) {
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
export function isServiceNode(type) {
    return ['SERVICE', 'APPLICATION', 'EDGE_AGENT', 'ANALYTICS_ENGINE', 'VMS_SERVER', 'DATABASE', 'WEB_SERVER'].includes(type);
}
