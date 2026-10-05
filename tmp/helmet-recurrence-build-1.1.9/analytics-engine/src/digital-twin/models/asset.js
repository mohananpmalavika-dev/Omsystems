/**
 * Digital Twin Asset Models
 *
 * Core types for representing physical and logical infrastructure assets
 * in the surveillance system digital twin.
 */
/**
 * Asset creation helpers
 */
export function createAsset(type, name, metadata, options) {
    const now = new Date();
    return {
        id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        name,
        parentId: options?.parentId,
        status: options?.status || 'unknown',
        metadata,
        health: {
            score: 100,
            issues: []
        },
        security: {
            score: 100,
            vulnerabilities: 0,
            configurationIssues: 0
        },
        criticality: options?.criticality || 'medium',
        createdAt: now,
        updatedAt: now
    };
}
/**
 * Type guards
 */
export function isCameraAsset(asset) {
    return asset.type === 'camera';
}
export function isNetworkAsset(asset) {
    return ['gateway', 'switch', 'vlan', 'network'].includes(asset.type);
}
export function isStorageAsset(asset) {
    return asset.type === 'storage';
}
export function isRecorderAsset(asset) {
    return ['dvr', 'nvr', 'recorder'].includes(asset.type);
}
