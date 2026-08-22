/**
 * Device Capability Profiles & Fingerprinting
 * 
 * Defines vendor-specific capability records for CP PLUS, Hikvision, Uniview, and ONVIF devices.
 */

import type {
  DeviceCapability,
  DeviceCapabilityProfile,
  DeviceCapabilityRecord,
  CapabilityImportance,
} from "../domain/device-health.types.js";

export const CAPABILITY_IMPORTANCE_MAP: Record<DeviceCapability, CapabilityImportance> = {
  DEVICE_ONLINE: "REQUIRED",
  CHANNEL_STATUS: "REQUIRED",
  STREAM_STATUS: "REQUIRED",
  RECORDING_STATUS: "REQUIRED",
  RECORDING_SEARCH: "RECOMMENDED",
  RETENTION_VERIFICATION: "REQUIRED",
  STORAGE_STATUS: "REQUIRED",
  STORAGE_CAPACITY: "RECOMMENDED",
  SMART_STATUS: "RECOMMENDED",
  DISK_TEMPERATURE: "OPTIONAL",
  DISK_BAD_SECTORS: "OPTIONAL",
  DEVICE_TEMPERATURE: "OPTIONAL",
  FAN_SPEED: "OPTIONAL",
  FIRMWARE_VERSION: "RECOMMENDED",
  DEVICE_TIME: "RECOMMENDED",
  NTP_STATUS: "RECOMMENDED",
  TIME_DRIFT: "RECOMMENDED",
  CPU_USAGE: "OPTIONAL",
  MEMORY_USAGE: "OPTIONAL",
  NETWORK_INTERFACE_STATUS: "RECOMMENDED",
};

export function createCpPlusProfile(deviceId: string, model = "CP-UNR-4K4322-V2"): DeviceCapabilityProfile {
  const now = new Date();
  const capabilities: DeviceCapabilityRecord[] = [
    {
      capability: "DEVICE_ONLINE",
      support: "SUPPORTED",
      importance: "REQUIRED",
      source: "PROBE",
      confidence: 1.0,
      discoveredAt: now,
    },
    {
      capability: "CHANNEL_STATUS",
      support: "SUPPORTED",
      importance: "REQUIRED",
      source: "PROBE",
      confidence: 0.95,
      discoveredAt: now,
    },
    {
      capability: "STREAM_STATUS",
      support: "SUPPORTED",
      importance: "REQUIRED",
      source: "PROBE",
      confidence: 0.95,
      discoveredAt: now,
    },
    {
      capability: "RECORDING_STATUS",
      support: "SUPPORTED",
      importance: "REQUIRED",
      source: "PROBE",
      confidence: 0.95,
      discoveredAt: now,
    },
    {
      capability: "RECORDING_SEARCH",
      support: "SUPPORTED",
      importance: "RECOMMENDED",
      source: "PROBE",
      confidence: 0.9,
      discoveredAt: now,
    },
    {
      capability: "RETENTION_VERIFICATION",
      support: "SUPPORTED",
      importance: "REQUIRED",
      source: "PROBE",
      confidence: 0.9,
      discoveredAt: now,
    },
    {
      capability: "STORAGE_STATUS",
      support: "SUPPORTED",
      importance: "REQUIRED",
      source: "PROBE",
      confidence: 0.95,
      discoveredAt: now,
    },
    {
      capability: "STORAGE_CAPACITY",
      support: "SUPPORTED",
      importance: "RECOMMENDED",
      source: "PROBE",
      confidence: 0.95,
      discoveredAt: now,
    },
    {
      capability: "SMART_STATUS",
      support: "PARTIAL", // Exposes basic SMART pass/fail but no vendor-specific raw attributes
      importance: "RECOMMENDED",
      source: "PROBE",
      confidence: 0.6,
      discoveredAt: now,
    },
    {
      capability: "DEVICE_TEMPERATURE",
      support: "UNKNOWN", // Might or might not be exposed depending on firmware sub-version
      importance: "OPTIONAL",
      source: "PROBE",
      confidence: 0.4,
      discoveredAt: now,
    },
    {
      capability: "FAN_SPEED",
      support: "UNSUPPORTED", // Device chassis does not expose fan RPM via Dahua CGI
      importance: "OPTIONAL",
      source: "VENDOR_PROFILE",
      confidence: 0.95,
      discoveredAt: now,
    },
    {
      capability: "FIRMWARE_VERSION",
      support: "SUPPORTED",
      importance: "RECOMMENDED",
      source: "PROBE",
      confidence: 1.0,
      discoveredAt: now,
    },
    {
      capability: "DEVICE_TIME",
      support: "SUPPORTED",
      importance: "RECOMMENDED",
      source: "PROBE",
      confidence: 1.0,
      discoveredAt: now,
    },
    {
      capability: "NTP_STATUS",
      support: "SUPPORTED",
      importance: "RECOMMENDED",
      source: "PROBE",
      confidence: 0.9,
      discoveredAt: now,
    },
    {
      capability: "TIME_DRIFT",
      support: "SUPPORTED",
      importance: "RECOMMENDED",
      source: "PROBE",
      confidence: 0.95,
      discoveredAt: now,
    },
    {
      capability: "NETWORK_INTERFACE_STATUS",
      support: "SUPPORTED",
      importance: "RECOMMENDED",
      source: "PROBE",
      confidence: 0.9,
      discoveredAt: now,
    },
  ];

  return {
    deviceId,
    manufacturer: "CP PLUS",
    model,
    firmwareVersion: "4.001.0000000.2.R",
    apiFamily: "DAHUA_CGI",
    capabilities,
    lastProbedAt: now,
  };
}

export class DeviceCapabilityRegistry {
  private profiles: Map<string, DeviceCapabilityProfile> = new Map();

  constructor() {
    // Seed sample profiles
    this.registerProfile(createCpPlusProfile("rec-aluva-01", "CP-UNR-416T2-V2"));
    this.registerProfile(createCpPlusProfile("rec-178-01", "CP-UNR-4K4322-V2"));
  }

  registerProfile(profile: DeviceCapabilityProfile) {
    this.profiles.set(profile.deviceId, profile);
  }

  getProfile(deviceId: string): DeviceCapabilityProfile | undefined {
    return this.profiles.get(deviceId);
  }

  getOrCreateProfile(deviceId: string, manufacturer = "CP PLUS", model = "Generic NVR"): DeviceCapabilityProfile {
    let profile = this.profiles.get(deviceId);
    if (!profile) {
      profile = createCpPlusProfile(deviceId, model);
      if (manufacturer !== "CP PLUS") {
        profile.manufacturer = manufacturer;
      }
      this.profiles.set(deviceId, profile);
    }
    return profile;
  }
}

export const deviceCapabilityRegistry = new DeviceCapabilityRegistry();
