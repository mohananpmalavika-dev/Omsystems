import type { DiscoveredOnvifEndpoint } from "./onvif-discovery.js";

export interface DeviceScanTarget {
  discoveryId?: string;
  ipAddress: string;
  onvifPort?: number;
}

export function targetFromScanJob(job: {
  scope?: "branch" | "device";
  targetDiscoveryId?: string;
  targetIpAddress?: string;
  targetOnvifPort?: number;
}): DeviceScanTarget | undefined {
  if (job.scope !== "device" || !job.targetIpAddress) return undefined;
  return {
    ...(job.targetDiscoveryId ? { discoveryId: job.targetDiscoveryId } : {}),
    ipAddress: job.targetIpAddress,
    ...(job.targetOnvifPort ? { onvifPort: job.targetOnvifPort } : {}),
  };
}

export function targetedOnvifEndpoint(target: DeviceScanTarget): DiscoveredOnvifEndpoint {
  const port = target.onvifPort ?? 80;
  const protocol = port === 443 ? "https" : "http";
  const host = target.ipAddress.includes(":") && !target.ipAddress.startsWith("[")
    ? `[${target.ipAddress}]`
    : target.ipAddress;
  return {
    endpointReference: null,
    xaddrs: [`${protocol}://${host}:${port}/onvif/device_service`],
    scopes: [],
    types: [],
    remoteAddress: target.ipAddress,
  };
}
