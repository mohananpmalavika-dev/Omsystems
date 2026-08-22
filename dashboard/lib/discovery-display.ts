export type DiscoveryIdentity = {
  displayName?: string | null;
  manufacturer?: string | null;
  vendor?: string | null;
  model?: string | null;
  ipAddress?: string | null;
  sourceType?: "ip-camera" | "analog-dvr-channel" | "nvr-channel" | string | null;
  recorderId?: string | null;
  recorderChannel?: number | null;
};

const placeholderModelPattern = /^(?:unknown|camera|network camera|ip camera)(?:\s+\d{1,3}(?:\.\d{1,3}){3})?$/i;
const recorderPattern = /\b(?:dvr|nvr|xvr|uvr|recorder)\b/i;

export function discoveryModelLabel(device: DiscoveryIdentity): string {
  const model = device.model?.trim();
  return model && !placeholderModelPattern.test(model)
    ? model
    : "Will be identified after login";
}

export function discoveryDeviceTypeLabel(device: DiscoveryIdentity): string {
  if (device.sourceType === "analog-dvr-channel") return "Analog camera via DVR";
  if (device.sourceType === "nvr-channel" || (device.recorderId && device.recorderChannel)) {
    return "IP camera via DVR/NVR";
  }

  const identity = [device.displayName, device.manufacturer, device.vendor, device.model]
    .filter(Boolean)
    .join(" ");
  if (device.recorderId || recorderPattern.test(identity)) return "DVR/NVR recorder";

  return discoveryModelLabel(device) === "Will be identified after login"
    ? "Camera or DVR (confirmation pending)"
    : "Individual IP camera";
}
