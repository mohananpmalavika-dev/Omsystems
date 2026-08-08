import os from "node:os";
import net from "node:net";
import { attachCredentials } from "../devices/onvif-client.js";
import { probeRtsp } from "../streaming/rtsp-probe.js";
import { logger } from "../utils/logger.js";
import { createDeviceFingerprint } from "./device-fingerprint.js";
import { resolveNeighborMac } from "./network-neighbor.js";

export interface RtspScanOptions {
  cidr?: string; // single CIDR like 192.168.1.0/24 or empty to infer
  cidrs?: string[];
  hosts?: string[];
  ports: number[];
  paths: string[];
  ffprobePath: string;
  timeoutMs: number;
  concurrency: number;
  username: string;
  password: string;
  credentialsForHost?: (host: string) => Promise<{ username: string; password: string } | undefined>;
  excludeHosts?: string[];
}

function ipv4ToNumber(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined;
  }
  return octets.reduce((value, octet) => ((value << 8) | octet) >>> 0, 0);
}

function numberToIpv4(value: number) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

function isPrivateCameraNetwork(address: string) {
  const value = ipv4ToNumber(address);
  if (value === undefined) return false;
  return (value >= 0x0a000000 && value <= 0x0affffff) ||
    (value >= 0xac100000 && value <= 0xac1fffff) ||
    (value >= 0xc0a80000 && value <= 0xc0a8ffff) ||
    (value >= 0xa9fe0000 && value <= 0xa9feffff) ||
    (value >= 0x64400000 && value <= 0x647fffff);
}

export function inferLocalCidrs(ifaces = os.networkInterfaces()): string[] {
  const cidrs: string[] = [];
  for (const addrs of Object.values(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== "IPv4" || addr.internal || !isPrivateCameraNetwork(addr.address)) continue;
      const octets = addr.address.split(".");
      if (octets.length !== 4) continue;
      const detectedPrefix = Number(addr.cidr?.split("/")[1]);
      if (Number.isInteger(detectedPrefix) && detectedPrefix >= 20 && detectedPrefix <= 30) {
        const value = ipv4ToNumber(addr.address);
        if (value === undefined) continue;
        const mask = detectedPrefix === 0 ? 0 : (0xffffffff << (32 - detectedPrefix)) >>> 0;
        cidrs.push(`${numberToIpv4(value & mask)}/${detectedPrefix}`);
      } else {
        cidrs.push(`${octets.slice(0, 3).join(".")}.0/24`);
      }
    }
  }
  return [...new Set(cidrs)];
}

export function ipsFromCidr(cidr: string): string[] {
  if (!cidr) return [];
  const [base, prefixPart] = cidr.split("/");
  const baseValue = ipv4ToNumber(base ?? "");
  if (baseValue === undefined) return [];
  if (prefixPart === undefined) return [numberToIpv4(baseValue)];

  const prefix = Number(prefixPart);
  if (!Number.isInteger(prefix) || prefix < 20 || prefix > 32) return [];
  const hostBits = 32 - prefix;
  const addressCount = 2 ** hostBits;
  const mask = prefix === 0 ? 0 : (0xffffffff << hostBits) >>> 0;
  const network = baseValue & mask;
  const firstOffset = prefix <= 30 ? 1 : 0;
  const lastOffset = prefix <= 30 ? addressCount - 1 : addressCount;
  const ips: string[] = [];
  for (let offset = firstOffset; offset < lastOffset; offset++) {
    ips.push(numberToIpv4((network + offset) >>> 0));
  }
  return ips;
}

export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
) {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      if (item === undefined) return;
      await task(item);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    () => worker(),
  ));
}

function tryTcpConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const onDone = (result: boolean) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("error", () => onDone(false));
    socket.once("timeout", () => onDone(false));
    socket.connect(port, host, () => onDone(true));
  });
}

function isCredentialRejected(error?: string) {
  return Boolean(error && /401|403|auth|credential|password|unauthori|forbidden/i.test(error));
}

export async function discoverRtspDevices(
  branchId: string,
  agentId: string,
  options: RtspScanOptions,
  control: { submitDiscovery(branchId: string, payload: any): Promise<any> },
  secretsStore: { set(key: string, value: string): Promise<void> | void } | undefined,
  persistStreamSecrets = true,
): Promise<number> {
  const configuredCidrs = options.cidrs?.filter(Boolean).map((cidr) => cidr.trim())
    ?? (options.cidr && options.cidr.trim() ? [options.cidr.trim()] : []);
  const cidrList = [...new Set([...inferLocalCidrs(), ...configuredCidrs])];
  if (cidrList.length === 0) {
    logger.info("RTSP scan: no local network addresses found to scan");
    return 0;
  }
  const ports = options.ports;
  const paths = options.paths.length ? options.paths : ["/", "/stream", "/h264", "/live.sdp", "/mpeg4", "/Streaming/Channels/101"];
  const ffprobePath = options.ffprobePath;
  const timeoutMs = options.timeoutMs;
  const concurrency = Math.max(1, options.concurrency || 25);
  const username = options.username ?? "";
  const password = options.password ?? "";

  const candidates = new Set<string>();
  const excludedHosts = new Set(options.excludeHosts ?? []);
  for (const host of options.hosts ?? []) candidates.add(host);
  for (const cidr of cidrList) {
    const ips = ipsFromCidr(cidr);
    for (const ip of ips) candidates.add(ip);
  }

  let submittedCount = 0;

  const hosts = [...candidates].filter((host) => !excludedHosts.has(host));

  async function scanHost(ip: string) {
      try {
        let unverifiedEndpoint: { port: number; credentialsRequired: boolean } | undefined;
        for (const port of ports) {
          const reachable = await tryTcpConnect(ip, port, Math.max(500, Math.min(timeoutMs, 3000)));
          if (!reachable) continue;
          unverifiedEndpoint ??= { port, credentialsRequired: false };
          // Try candidate paths
          for (const path of paths) {
            let uri = `rtsp://${ip}:${port}${path}`;
            // omit port if 554
            if (port === 554) uri = `rtsp://${ip}${path}`;
            const storedCredentials = await options.credentialsForHost?.(ip);
            const effectiveUsername = storedCredentials?.username ?? username;
            const effectivePassword = storedCredentials?.password ?? password;
            const authed = effectiveUsername ? attachCredentials(uri, { username: effectiveUsername, password: effectivePassword }) : uri;
            const probe = await probeRtsp(authed, ffprobePath, timeoutMs).catch((e) => ({
            reachable: false,
            codec: null,
            width: null,
            height: null,
              error: e instanceof Error ? e.message : String(e),
            }));
            if (!probe.reachable && isCredentialRejected(probe.error)) {
              unverifiedEndpoint = { port, credentialsRequired: true };
            }
            if (probe && probe.reachable) {
              try {
                const macAddress = await resolveNeighborMac(ip);
                const hardwareId = createDeviceFingerprint(macAddress ? { macAddress } : {});
                const payload = {
                  edgeAgentId: agentId,
                  discoveryMethod: "rtsp-network-scan",
                  vendor: "other",
                  manufacturer: "unknown",
                  model: "IP Camera",
                  ipAddress: ip,
                  ...(macAddress ? { macAddress } : {}),
                  ...(hardwareId ? { hardwareId } : {}),
                  onvifPort: 80,
                  rtspPort: port,
                  displayName: `Discovered camera ${ip}`,
                  credentialsRequired: false,
                  streamVerified: true,
                  rtspValidated: true,
                  compatibility: probe.reachable ? "compatible" : "review-required",
                  duplicateStatus: "unique",
                  compatibilityStatus: probe.reachable ? "compatible" : "review-required",
                  profiles: [{ name: "auto", codec: probe.codec ?? "unknown", width: probe.width ?? 1, height: probe.height ?? 1 }],
                  capabilities: { ptz: false, audio: false, events: false },
                  discoveryLayers: rtspDiscoveryLayers(true, Boolean(hardwareId)),
                };
                const discovery = await control.submitDiscovery(branchId, payload);
                submittedCount += 1;
                if (persistStreamSecrets && secretsStore && probe.reachable) {
                  const primaryUri = authed;
                  await secretsStore.set(`edge://${agentId}/${discovery.id}`, primaryUri);
                }
                logger.info(`RTSP discovery: found stream at ${ip}:${port} -> discovery ${discovery.id}`);
                // Once we find a working path on this host, skip remaining ports/paths
                return;
              } catch (submissionError) {
                logger.error("RTSP discovery: failed to submit discovery", { error: submissionError instanceof Error ? submissionError.message : String(submissionError) });
              }
            }
          }
        }
        if (unverifiedEndpoint) {
          const macAddress = await resolveNeighborMac(ip);
          const hardwareId = createDeviceFingerprint(macAddress ? { macAddress } : {});
          const discovery = await control.submitDiscovery(branchId, {
            edgeAgentId: agentId,
            discoveryMethod: "rtsp-network-scan",
            vendor: "other",
            manufacturer: "Unknown",
            model: "RTSP device",
            ipAddress: ip,
            ...(macAddress ? { macAddress } : {}),
            ...(hardwareId ? { hardwareId } : {}),
            onvifPort: 80,
            rtspPort: unverifiedEndpoint.port,
            displayName: `Discovered device ${ip}`,
            credentialsRequired: unverifiedEndpoint.credentialsRequired,
            streamVerified: false,
            rtspValidated: false,
            compatibility: "review-required",
            duplicateStatus: "unique",
            compatibilityStatus: "review-required",
            statusReason: unverifiedEndpoint.credentialsRequired
              ? "rtsp_credentials_rejected"
              : "rtsp_stream_unverified",
            profiles: [{ name: "unverified", codec: "unknown", width: 1, height: 1 }],
            capabilities: { ptz: false, audio: false, events: false },
            discoveryLayers: rtspDiscoveryLayers(false, Boolean(hardwareId)),
          });
          submittedCount += 1;
          logger.info(`RTSP discovery: unverified device at ${ip}:${unverifiedEndpoint.port} -> discovery ${discovery.id}`, {
            credentialsRequired: unverifiedEndpoint.credentialsRequired,
          });
        }
      } catch (error) {
        logger.debug("RTSP scan host failed", { host: ip, error: error instanceof Error ? error.message : String(error) });
      }
  }

  await runWithConcurrency(hosts, concurrency, scanHost);
  return submittedCount;
}

function rtspDiscoveryLayers(streamVerified: boolean, fingerprinted: boolean) {
  return [
    { layer: "network-discovery", status: "passed", detail: "RTSP TCP endpoint discovered" },
    { layer: "onvif-discovery", status: "failed", detail: "Device was not available through WS-Discovery" },
    { layer: "onvif-authentication", status: "skipped", detail: "No ONVIF endpoint available" },
    { layer: "get-capabilities", status: "skipped", detail: "No ONVIF endpoint available" },
    { layer: "get-profiles", status: "skipped", detail: "No ONVIF endpoint available" },
    { layer: "get-stream-uri", status: "skipped", detail: "RTSP URI was discovered directly" },
    { layer: "rtsp-verification", status: streamVerified ? "passed" : "failed", detail: streamVerified ? "ffprobe verified video" : "RTSP endpoint requires review" },
    { layer: "vendor-adapter", status: "skipped", detail: "Generic RTSP path scan used" },
    { layer: "fingerprint", status: fingerprinted ? "passed" : "failed", detail: fingerprinted ? "MAC-based fingerprint created" : "No stable Layer-2 identifier was available" },
  ] as const;
}
