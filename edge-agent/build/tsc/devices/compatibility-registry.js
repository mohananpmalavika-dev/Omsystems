/** Conservative baseline. Exact CP PLUS model/firmware rows are added only after lab verification. */
export const deviceCapabilityMatrix = [{
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
export function findCapabilityProfile(vendor, _model, _firmware) {
    return deviceCapabilityMatrix.find((profile) => profile.vendor === vendor);
}
export function normalizeVendor(manufacturer) {
    const value = manufacturer.trim().toLowerCase();
    if (value.includes("hikvision"))
        return "hikvision";
    if (value.includes("cp plus") || value.includes("cp-plus"))
        return "cp-plus";
    return "other";
}
export function compatibilityNotes(vendor) {
    switch (vendor) {
        case "hikvision":
            return ["Prefer ONVIF Profile T", "Use ISAPI only for unsupported events"];
        case "cp-plus":
            return ["Confirm ONVIF profile support for the exact firmware"];
        default:
            return ["Use ONVIF capability results; do not infer features by brand"];
    }
}
