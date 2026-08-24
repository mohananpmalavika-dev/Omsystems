export type SupportedVendor = "hikvision" | "cp-plus" | "other";
export type CapabilitySupport = "supported" | "vendor-specific" | "unsupported" | "unverified";

export interface DeviceCapabilityProfile {
  vendor: SupportedVendor;
  modelPattern: string;
  firmwareRange: string;
  capabilities: Record<
    "reachability" | "channels" | "recordingState" | "cpu" | "memory" |
    "temperature" | "uptime" | "firmware" | "smart" | "raid" | "writeStatus",
    CapabilitySupport
  >;
}

/** Conservative baseline. Exact CP PLUS model/firmware rows are added only after lab verification. */
export const deviceCapabilityMatrix: DeviceCapabilityProfile[] = [{
  vendor: "cp-plus",
  modelPattern: "*",
  firmwareRange: "unverified",
  capabilities: {
    reachability: "supported",
    channels: "supported",
    recordingState: "unverified",
    cpu: "vendor-specific",
    memory: "vendor-specific",
    temperature: "vendor-specific",
    uptime: "vendor-specific",
    firmware: "supported",
    smart: "vendor-specific",
    raid: "vendor-specific",
    writeStatus: "vendor-specific",
  },
}];

export function findCapabilityProfile(vendor: SupportedVendor, _model: string, _firmware?: string) {
  return deviceCapabilityMatrix.find((profile) => profile.vendor === vendor);
}

export function normalizeVendor(manufacturer: string): SupportedVendor {
  const value = manufacturer.trim().toLowerCase();
  if (value.includes("hikvision")) return "hikvision";
  if (/cp[\s_-]*plus/.test(value)) return "cp-plus";
  return "other";
}

export function compatibilityNotes(vendor: SupportedVendor) {
  switch (vendor) {
    case "hikvision":
      return ["Prefer ONVIF Profile T", "Use ISAPI only for unsupported events"];
    case "cp-plus":
      return ["Confirm ONVIF profile support for the exact firmware"];
    default:
      return ["Use ONVIF capability results; do not infer features by brand"];
  }
}
