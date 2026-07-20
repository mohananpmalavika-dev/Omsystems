export type SupportedVendor = "hikvision" | "cp-plus" | "other";

export function normalizeVendor(manufacturer: string): SupportedVendor {
  const value = manufacturer.trim().toLowerCase();
  if (value.includes("hikvision")) return "hikvision";
  if (value.includes("cp plus") || value.includes("cp-plus")) return "cp-plus";
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
