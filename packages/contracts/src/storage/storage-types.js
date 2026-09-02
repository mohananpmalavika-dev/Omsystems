/**
 * Canonical Storage Types for Sentinel Grid
 *
 * Provides authoritative storage contracts across recording engines, retention
 * services, evidence pipelines, and control APIs.
 */
export const DEFAULT_STORAGE_CAPACITY_POLICY = {
    warningPercent: 80,
    criticalPercent: 90,
    stopWritePercent: 95,
    reserveBytes: 5 * 1024 * 1024 * 1024, // 5GB
    minimumFreeBytes: 1 * 1024 * 1024 * 1024, // 1GB
};
