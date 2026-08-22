/**
 * Device Evidence Store & Freshness Evaluator
 * 
 * Stores raw and normalized evidence items observed from devices,
 * and determines evidence freshness based on capability-specific TTL policies.
 */

import type {
  DeviceCapability,
  DeviceEvidence,
  EvidenceStatus,
} from "../domain/device-health.types.js";

export const DEFAULT_FRESHNESS_TTL_SECONDS: Record<DeviceCapability, number> = {
  DEVICE_ONLINE: 60, // 1 minute
  CHANNEL_STATUS: 120, // 2 minutes
  STREAM_STATUS: 120, // 2 minutes
  RECORDING_STATUS: 180, // 3 minutes
  RECORDING_SEARCH: 86400, // 24 hours
  RETENTION_VERIFICATION: 86400, // 24 hours
  STORAGE_STATUS: 300, // 5 minutes
  STORAGE_CAPACITY: 300, // 5 minutes
  SMART_STATUS: 3600, // 1 hour
  DISK_TEMPERATURE: 300, // 5 minutes
  DISK_BAD_SECTORS: 3600, // 1 hour
  DEVICE_TEMPERATURE: 300, // 5 minutes
  FAN_SPEED: 300, // 5 minutes
  FIRMWARE_VERSION: 86400, // 24 hours
  DEVICE_TIME: 600, // 10 minutes
  NTP_STATUS: 600, // 10 minutes
  TIME_DRIFT: 600, // 10 minutes
  CPU_USAGE: 120, // 2 minutes
  MEMORY_USAGE: 120, // 2 minutes
  NETWORK_INTERFACE_STATUS: 300, // 5 minutes
};

export class DeviceEvidenceStore {
  private evidenceMap: Map<string, DeviceEvidence> = new Map(); // key: `${deviceId}:${capability}`

  put(evidence: DeviceEvidence) {
    const key = `${evidence.deviceId}:${evidence.capability}`;
    this.evidenceMap.set(key, evidence);
  }

  putBatch(evidenceList: DeviceEvidence[]) {
    for (const ev of evidenceList) {
      this.put(ev);
    }
  }

  get(deviceId: string, capability: DeviceCapability, now = new Date()): DeviceEvidence | undefined {
    const key = `${deviceId}:${capability}`;
    const evidence = this.evidenceMap.get(key);
    if (!evidence) return undefined;

    // Evaluate freshness
    const ttl = DEFAULT_FRESHNESS_TTL_SECONDS[capability] || 300;
    const ageSeconds = (now.getTime() - evidence.observedAt.getTime()) / 1000;

    if (evidence.status === "AVAILABLE" && ageSeconds > ttl) {
      return {
        ...evidence,
        status: "STALE",
        errorMessage: `Evidence stale — last verified ${Math.floor(ageSeconds / 60)} minutes ago`,
      };
    }

    return evidence;
  }

  getAllForDevice(deviceId: string, now = new Date()): DeviceEvidence[] {
    const list: DeviceEvidence[] = [];
    for (const evidence of this.evidenceMap.values()) {
      if (evidence.deviceId === deviceId) {
        list.push(this.get(deviceId, evidence.capability, now) || evidence);
      }
    }
    return list;
  }

  clear() {
    this.evidenceMap.clear();
  }
}

export const deviceEvidenceStore = new DeviceEvidenceStore();
