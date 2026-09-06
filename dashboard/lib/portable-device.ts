export interface EnrolledPortableDevice {
  id: string;
  cameraId: string;
  credentialSecret: string;
  branchId?: string;
}

export function readPortableDevice(value: unknown): EnrolledPortableDevice | null {
  if (!value || typeof value !== "object") return null;
  const device = value as Record<string, unknown>;
  if (![device.id, device.cameraId, device.credentialSecret].every((part) => typeof part === "string" && part.trim().length > 0)) return null;
  return {
    id: device.id as string,
    cameraId: device.cameraId as string,
    credentialSecret: device.credentialSecret as string,
    ...(typeof device.branchId === "string" ? { branchId: device.branchId } : {}),
  };
}

export function portableDeviceHeaders(device: EnrolledPortableDevice): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-portable-device-id": device.id,
    "x-portable-device-secret": device.credentialSecret,
  };
}
