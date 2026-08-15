export const PROVISIONING_STAGE_IDS = [
  "branch-registration",
  "edge-enrollment",
  "network-inventory",
  "device-discovery",
  "credential-resolution",
  "stream-verification",
  "channel-import",
  "time-verification",
  "storage-verification",
  "recording-verification",
  "analytics",
  "digital-twin",
  "health-baseline",
  "activation",
] as const;

export type ProvisioningStageId = typeof PROVISIONING_STAGE_IDS[number];
