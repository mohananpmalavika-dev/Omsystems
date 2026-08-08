import { createHash } from "node:crypto";

export interface DeviceFingerprintInput {
  onvifEndpointReference?: string | null;
  onvifUuid?: string | null;
  serialNumber?: string | null;
  macAddress?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  recorderSerialNumber?: string | null;
  recorderChannel?: number | null;
}

export function createDeviceFingerprint(input: DeviceFingerprintInput) {
  const claims: string[] = [];
  const onvifUuid = normalizeOnvifUuid(input.onvifUuid ?? input.onvifEndpointReference);
  if (onvifUuid) claims.push(`onvif:${onvifUuid}`);
  if (onvifUuid && input.recorderChannel && input.recorderChannel > 0) {
    claims.push(`onvif-channel:${onvifUuid}:${input.recorderChannel}`);
  }
  const macAddress = input.macAddress?.replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (macAddress?.length === 12) {
    claims.push(`mac:${macAddress}`);
    if (input.recorderChannel && input.recorderChannel > 0) {
      claims.push(`mac-channel:${macAddress}:${input.recorderChannel}`);
    }
  }
  const recorderSerial = clean(input.recorderSerialNumber)?.toUpperCase();
  if (recorderSerial && input.recorderChannel && input.recorderChannel > 0) {
    claims.push(`recorder:${recorderSerial}:channel:${input.recorderChannel}`);
  }
  const serialNumber = clean(input.serialNumber)?.toUpperCase();
  if (serialNumber && serialNumber !== "UNKNOWN") {
    claims.push(
      `serial:${clean(input.manufacturer)?.toLowerCase() ?? "unknown"}:` +
      `${clean(input.model)?.toLowerCase() ?? "unknown"}:${serialNumber}`,
    );
  }
  if (!claims.length) return undefined;
  return `sha256:${createHash("sha256").update(claims.sort().join("|")).digest("hex")}`;
}

function normalizeOnvifUuid(value: string | null | undefined) {
  const normalized = clean(value);
  if (!normalized) return undefined;
  const uuid = normalized.match(/(?:^|:)uuid:([0-9a-f-]{16,})$/i)?.[1]
    ?? normalized.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)?.[1];
  return uuid?.toLowerCase();
}

function clean(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}
