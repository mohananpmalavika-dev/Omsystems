import type { CameraApprovalInput, CameraDiscoveryInput } from "./control-plane-store.js";
import type { CameraSourceType, DeviceIdentityClaimType } from "./domain/models.js";

export interface DeviceIdentityClaim {
  type: DeviceIdentityClaimType;
  value: string;
}

export interface DeviceIdentityObservation {
  deviceType: CameraSourceType;
  hardwareSerial?: string;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  macAddress?: string;
  ipAddress?: string;
  onvifUuid?: string;
  dvrSerialNumber?: string;
  channel?: number;
  certificateRef?: string;
  certificateFingerprint?: string;
  credentialRef?: string;
  agentId?: string;
  hardwareId?: string;
}

function nonEmpty(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function normalizeMacAddress(value: string | undefined) {
  const normalized = value?.replace(/[^0-9a-f]/gi, "").toLowerCase();
  return normalized?.length === 12 ? normalized : undefined;
}

export function normalizeOnvifUuid(
  explicitUuid: string | undefined,
  endpointReference?: string,
) {
  const explicit = nonEmpty(explicitUuid);
  if (explicit) return explicit.replace(/^(?:urn:)?uuid:/i, "").toLowerCase();
  const endpoint = nonEmpty(endpointReference);
  if (!endpoint) return undefined;
  const uuid = endpoint.match(/(?:^|:)uuid:([0-9a-f-]{16,})$/i)?.[1]
    ?? endpoint.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)?.[1];
  return uuid?.toLowerCase();
}

export function normalizeCertificateFingerprint(value: string | undefined) {
  const normalized = value?.replace(/[^0-9a-f]/gi, "").toLowerCase();
  return normalized || undefined;
}

export function observationFromDiscovery(input: CameraDiscoveryInput): DeviceIdentityObservation {
  return {
    deviceType: input.sourceType ?? "ip-camera",
    hardwareSerial: nonEmpty(input.serialNumber),
    manufacturer: nonEmpty(input.manufacturer) ?? input.vendor,
    model: nonEmpty(input.model),
    firmwareVersion: nonEmpty(input.firmwareVersion),
    macAddress: nonEmpty(input.macAddress),
    ipAddress: nonEmpty(input.ipAddress),
    onvifUuid: normalizeOnvifUuid(input.onvifUuid, input.onvifEndpointReference),
    dvrSerialNumber: nonEmpty(input.recorderSerialNumber),
    channel: input.recorderChannel,
    certificateRef: nonEmpty(input.certificateRef),
    certificateFingerprint: normalizeCertificateFingerprint(input.certificateFingerprint),
    agentId: input.edgeAgentId,
    hardwareId: nonEmpty(input.hardwareId),
  };
}

export function observationFromApproval(input: CameraApprovalInput): DeviceIdentityObservation {
  const deviceType = input.sourceType ?? "ip-camera";
  return {
    deviceType,
    hardwareSerial: nonEmpty(input.serialNumber),
    manufacturer: nonEmpty(input.manufacturer),
    model: nonEmpty(input.model),
    macAddress: nonEmpty(input.macAddress),
    ipAddress: nonEmpty(input.ipAddress),
    onvifUuid: normalizeOnvifUuid(input.onvifUuid),
    dvrSerialNumber: nonEmpty(input.recorderSerialNumber),
    channel: deviceType === "ip-camera" ? undefined : input.recorderChannel ?? input.channel,
    certificateRef: nonEmpty(input.certificateRef),
    certificateFingerprint: normalizeCertificateFingerprint(input.certificateFingerprint),
    credentialRef: nonEmpty(input.connectionSecretRef),
  };
}

export function identityClaims(observation: DeviceIdentityObservation): DeviceIdentityClaim[] {
  const claims: DeviceIdentityClaim[] = [];
  const channelSuffix = observation.deviceType !== "ip-camera" && observation.channel && observation.channel > 0
    ? `|channel|${observation.channel}`
    : "";
  const recorderSerial = nonEmpty(observation.dvrSerialNumber)?.toUpperCase();
  if (recorderSerial && observation.channel && observation.channel > 0) {
    claims.push({
      type: "recorder-channel",
      value: `${recorderSerial}|channel|${observation.channel}`,
    });
  }
  if (observation.onvifUuid) {
    claims.push({ type: "onvif-uuid", value: `${observation.onvifUuid.toLowerCase()}${channelSuffix}` });
  }
  const macAddress = normalizeMacAddress(observation.macAddress);
  if (macAddress) claims.push({ type: "mac-address", value: `${macAddress}${channelSuffix}` });
  const serial = nonEmpty(observation.hardwareSerial)?.toUpperCase();
  if (serial) {
    claims.push({
      type: "hardware-serial",
      value: `${(nonEmpty(observation.manufacturer) ?? "unknown").toLowerCase()}|${(nonEmpty(observation.model) ?? "unknown").toLowerCase()}|${serial}${channelSuffix}`,
    });
  }
  const hardwareId = nonEmpty(observation.hardwareId);
  if (hardwareId) claims.push({ type: "hardware-id", value: hardwareId.toLowerCase() });
  return claims;
}
