import os from "node:os";
import net from "node:net";
import { attachCredentials } from "../devices/onvif-client.js";
import {
  vendorRtspCandidates,
  type VendorStreamFamily,
} from "../devices/vendor-stream-adapter.js";
import { probeRtsp } from "../streaming/rtsp-probe.js";
import { logger } from "../utils/logger.js";
import { createDeviceFingerprint } from "./device-fingerprint.js";
import { resolveNeighborMac, detectDefaultGatewayIps } from "./network-neighbor.js";
import {
  fingerprintHttpRecorder,
  isRouterHost,
  type HttpRecorderFingerprint,
} from "./recorder-http-fingerprint.js";

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
  recorderMaxChannels?: number;
}

export interface RtspRecorderChannel {
  sourceChannel: number;
  uri: string;
  role: "main" | "sub";
  probe: Awaited<ReturnType<typeof probeRtsp>>;
}

export interface UnverifiedRtspEndpoint {
  port: number;
  credentialsRequired: boolean;
  recorder?: HttpRecorderFingerprint;
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
    (value >= 0x64400000 && value <= 0x647fffff);
}

export function inferLocalCidrs(ifaces = os.networkInterfaces()): string[] {
  const cidrs: string[] = [];
  for (const [interfaceName, addrs] of Object.entries(ifaces)) {
    // Virtual host-only adapters (especially WSL/Hyper-V) commonly expose a
    // large private /20 even though cameras cannot exist on that network. A
    // blind scan of it adds thousands of timed-out probes and can prevent the
    // real Wi-Fi/LAN scan from completing. Routed/VPN camera networks are
    // supplied separately through the branch's configured scan networks.
    if (isVirtualHostInterface(interfaceName)) continue;
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

function isVirtualHostInterface(interfaceName: string) {
  return /(?:^|[\s(])(?:vEthernet|WSL|Hyper-V|Docker|container|VMware|VirtualBox|Tailscale|ZeroTier|Loopback|Npcap)(?:[\s)]|$)/i
    .test(interfaceName);
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

export async function discoverRtspRecorderChannels(input: {
  host: string;
  ports: number[];
  vendor: VendorStreamFamily;
  username: string;
  password: string;
  maxChannels?: number;
  batchSize?: number;
  emptyBatchLimit?: number;
  probe(uri: string): Promise<Awaited<ReturnType<typeof probeRtsp>>>;
}) {
  const maxChannels = Math.max(1, Math.min(input.maxChannels ?? 32, 64));
  const batchSize = Math.max(1, Math.min(input.batchSize ?? 4, 8));
  const emptyBatchLimit = Math.max(1, input.emptyBatchLimit ?? 2);
  const channels: RtspRecorderChannel[] = [];
  let credentialsRequired = false;
  let emptyBatchesAfterSuccess = 0;

  const probeChannel = async (sourceChannel: number): Promise<RtspRecorderChannel | undefined> => {
    const candidates = vendorRtspCandidates({
      host: input.host,
      vendor: input.vendor,
      credentials: { username: input.username, password: input.password },
      channel: sourceChannel,
      ports: input.ports,
    }).sort((left, right) => Number(right.role === "sub") - Number(left.role === "sub"));
    for (const candidate of candidates) {
      const probe = await input.probe(candidate.uri);
      if (isCredentialRejected(probe.error)) credentialsRequired = true;
      if (probe.reachable) {
        return { sourceChannel, uri: candidate.uri, role: candidate.role, probe };
      }
    }
    return undefined;
  };

  for (let first = 1; first <= maxChannels; first += batchSize) {
    const batch = Array.from(
      { length: Math.min(batchSize, maxChannels - first + 1) },
      (_, index) => first + index,
    );
    const discovered = (await Promise.all(batch.map(probeChannel)))
      .filter((channel): channel is RtspRecorderChannel => Boolean(channel));
    channels.push(...discovered);

    if (channels.length > 0) {
      emptyBatchesAfterSuccess = discovered.length === 0 ? emptyBatchesAfterSuccess + 1 : 0;
      if (emptyBatchesAfterSuccess >= emptyBatchLimit) break;
    } else if (credentialsRequired) {
      // Authentication failures are host-wide. One batch is enough to create a
      // credential activation record without hammering every possible channel.
      break;
    }
  }

  return { channels, credentialsRequired };
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
  const defaultPaths = [
    "/cam/realmonitor?channel=1&subtype=0",
    "/cam/realmonitor?channel=1&subtype=1",
    "/Streaming/Channels/101",
    "/Streaming/Channels/102",
    "/h264/ch1/main/av_stream",
    "/stream1",
    "/stream2",
    "/onvif1",
    "/live/ch0",
    "/live.sdp",
    "/stream",
  ];
  const paths = options.paths.length ? options.paths : defaultPaths;
  const ffprobePath = options.ffprobePath;
  const timeoutMs = Math.max(options.timeoutMs || 3000, 2500);
  const concurrency = Math.max(1, Math.min(options.concurrency || 4, 8));
  const username = options.username ?? "";
  const password = options.password ?? "";

  // Dedicated RTSP streaming ports only (never blast RTSP requests to pure HTTP ports like 80/8080)
  const rtspStreamingPorts = [554, 8554, 5554, 10554, 37777, 8000, 34567];
  const httpFingerprintPorts = [80, 8080, 8899];

  // Camera credentials are device-scoped secrets. Discovery must only use
  // credentials explicitly supplied by the operator or credential provider;
  // brute-forcing vendor/default passwords is unsafe on a bank network.
  const zeroTouchCreds = username ? [{ username, password }] : [];

  const candidates = new Set<string>();
  const excludedHosts = new Set(options.excludeHosts ?? []);

  // 1. Exclude host's own local network interfaces
  const localIfaces = os.networkInterfaces();
  for (const iface of Object.values(localIfaces)) {
    if (iface) {
      for (const addr of iface) {
        if (addr.address) excludedHosts.add(addr.address);
      }
    }
  }

  // 2. Automatically detect and exclude default gateway/router IP (e.g. Tenda, TP-Link router)
  const detectedGateways = await detectDefaultGatewayIps();
  for (const gw of detectedGateways) {
    excludedHosts.add(gw);
    logger.info("Excluding default network gateway/router from camera scan", { gateway: gw });
  }

  for (const host of options.hosts ?? []) candidates.add(host);
  for (const cidr of cidrList) {
    const ips = ipsFromCidr(cidr);
    for (const ip of ips) candidates.add(ip);
  }

  let submittedCount = 0;

  const hosts = [...candidates].filter((host) => !excludedHosts.has(host));

  async function scanHost(ip: string) {
    // Add small pacing delay to protect home/SOHO routers from connection saturation
    await new Promise((r) => setTimeout(r, 20));

    // Check if host is a router/gateway (e.g. Tenda, TP-Link web interface at .1 or .254)
    if (ip.endsWith(".1") || ip.endsWith(".254")) {
      const isRouter = await isRouterHost(ip, 1500);
      if (isRouter) {
        logger.info("Host identified as network router/gateway; skipping camera scan", { ip });
        return;
      }
    }

    try {
      let unverifiedEndpoint: UnverifiedRtspEndpoint | undefined;
      const storedCredentials = await options.credentialsForHost?.(ip);
      const hostCreds = storedCredentials ? [storedCredentials, ...zeroTouchCreds] : zeroTouchCreds;

      // 1. Check HTTP recorder fingerprint on web ports (with router protection)
      for (const port of httpFingerprintPorts) {
        const httpReachable = await tryTcpConnect(ip, port, 1500);
        if (!httpReachable) continue;

        const isRouter = await isRouterHost(ip, 1500);
        if (isRouter) {
          logger.info("Host identified as router/gateway web management; skipping", { ip });
          return;
        }

        const recorderFingerprint = await fingerprintHttpRecorder(ip, timeoutMs);
        if (recorderFingerprint) {
          for (const cred of hostCreds) {
            const recorder = await discoverRtspRecorderChannels({
              host: ip,
              ports: [554, 8554, 8000, 37777],
              vendor: recorderFingerprint.vendor,
              username: cred.username,
              password: cred.password,
              ...(options.recorderMaxChannels ? { maxChannels: options.recorderMaxChannels } : {}),
              probe: (uri) => probeRtsp(uri, ffprobePath, timeoutMs),
            });
            if (recorder.channels.length > 0) {
              await submitRecorderChannels(ip, port, recorderFingerprint, recorder.channels);
              return;
            }
          }
        }
      }

      // 2. Probe dedicated RTSP streaming ports
      for (const port of rtspStreamingPorts) {
        const reachable = await tryTcpConnect(ip, port, Math.max(500, Math.min(timeoutMs, 2500)));
        if (!reachable) continue;
        unverifiedEndpoint ??= { port, credentialsRequired: false };

        // Try multi-channel DVR / IP Camera candidate paths with zero-touch credentials
        for (const cred of hostCreds) {
          let foundWorkingCred = false;
          for (const path of paths) {
            let uri = `rtsp://${ip}:${port}${path}`;
            if (port === 554) uri = `rtsp://${ip}${path}`;
            const authed = cred.username ? attachCredentials(uri, { username: cred.username, password: cred.password }) : uri;
            const probe = await probeRtsp(authed, ffprobePath, timeoutMs).catch((e) => ({
              reachable: false,
              codec: null,
              width: null,
              height: null,
              error: e instanceof Error ? e.message : String(e),
            }));

            if (!probe.reachable && isCredentialRejected(probe.error)) {
              unverifiedEndpoint = {
                ...(unverifiedEndpoint ?? { port }),
                credentialsRequired: true,
              };
            }

            if (probe && probe.reachable) {
              foundWorkingCred = true;
              try {
                const macAddress = await resolveNeighborMac(ip);
                const hardwareId = createDeviceFingerprint(macAddress ? { macAddress } : {});
                const isDvr = path.includes("channel=") || path.includes("Channels/");
                const payload = {
                  edgeAgentId: agentId,
                  discoveryMethod: "configured-ip-range",
                  vendor: "other",
                  manufacturer: "unknown",
                  model: isDvr ? "DVR / NVR Multi-Channel" : "IP Camera",
                  ipAddress: ip,
                  ...(macAddress ? { macAddress } : {}),
                  ...(hardwareId ? { hardwareId } : {}),
                  onvifPort: 80,
                  rtspPort: port,
                  displayName: isDvr ? `Discovered DVR ${ip}` : `Discovered camera ${ip}`,
                  credentialsRequired: false,
                  streamVerified: true,
                  rtspValidated: true,
                  compatibility: "compatible",
                  duplicateStatus: "unique",
                  compatibilityStatus: "compatible",
                  profiles: [{ name: "main", codec: normalizeRtspDiscoveryCodec(probe.codec), width: probe.width ?? 1920, height: probe.height ?? 1080 }],
                  capabilities: { ptz: false, audio: true, events: true },
                  discoveryLayers: rtspDiscoveryLayers(true, Boolean(hardwareId)),
                };
                  const discovery = await control.submitDiscovery(branchId, payload);
                  submittedCount += 1;
                  if (persistStreamSecrets && secretsStore) {
                    await secretsStore.set(`edge://${agentId}/${discovery.id}`, authed);
                  }
                  logger.info(`RTSP discovery: verified stream at ${ip}:${port}${path} -> discovery ${discovery.id}`);

                  // If this is a multi-channel DVR, also discover additional channels automatically
                  if (path.includes("channel=1")) {
                    for (let ch = 2; ch <= 8; ch++) {
                      const chPath = path.replace("channel=1", `channel=${ch}`);
                      const chUri = authed.replace("channel=1", `channel=${ch}`);
                      const chProbe = await probeRtsp(chUri, ffprobePath, timeoutMs).catch(() => ({ reachable: false }));
                      if (chProbe.reachable) {
                        const chPayload = {
                          ...payload,
                          displayName: `Discovered DVR ${ip} - Ch ${ch}`,
                          profiles: [{ name: "main", codec: normalizeRtspDiscoveryCodec((chProbe as any).codec), width: (chProbe as any).width ?? 1920, height: (chProbe as any).height ?? 1080 }],
                        };
                        const chDiscovery = await control.submitDiscovery(branchId, chPayload);
                        submittedCount += 1;
                        if (persistStreamSecrets && secretsStore) {
                          await secretsStore.set(`edge://${agentId}/${chDiscovery.id}`, chUri);
                        }
                      }
                    }
                  }
                  return;
                } catch (submissionError) {
                  logger.error("RTSP discovery: failed to submit discovery", { error: submissionError instanceof Error ? submissionError.message : String(submissionError) });
                }
              }
            }
            if (foundWorkingCred) break;
          }
        }
        if (unverifiedEndpoint) {
          const macAddress = await resolveNeighborMac(ip);
          const hardwareId = createDeviceFingerprint(macAddress ? { macAddress } : {});
          const discovery = await control.submitDiscovery(branchId, buildUnverifiedRtspDiscoveryPayload({
            agentId,
            ipAddress: ip,
            endpoint: unverifiedEndpoint,
            ...(macAddress ? { macAddress } : {}),
            ...(hardwareId ? { hardwareId } : {}),
          }));
          submittedCount += 1;
          logger.info(`RTSP discovery: unverified device at ${ip}:${unverifiedEndpoint.port} -> discovery ${discovery.id}`, {
            credentialsRequired: unverifiedEndpoint.credentialsRequired,
          });
        }
      } catch (error) {
        logger.debug("RTSP scan host failed", { host: ip, error: error instanceof Error ? error.message : String(error) });
      }
  }

  async function submitRecorderChannels(
    ip: string,
    port: number,
    recorder: HttpRecorderFingerprint,
    channels: RtspRecorderChannel[],
  ) {
    const macAddress = await resolveNeighborMac(ip);
    const recorderFingerprint = createDeviceFingerprint(macAddress ? { macAddress } : {});
    const recorderIdentity = recorderFingerprint ?? `${ip}:${port}`;
    const recorderId = `recorder-${recorderIdentity}`.replace(/[^a-zA-Z0-9_.:-]/g, "-");
    for (const channel of channels) {
      const channelFingerprint = createDeviceFingerprint({
        ...(macAddress ? { macAddress } : {}),
        recorderChannel: channel.sourceChannel,
      });
      const discovery = await control.submitDiscovery(branchId, {
        edgeAgentId: agentId,
        discoveryMethod: "nvr-dvr-channel-discovery",
        vendor: recorder.vendor === "generic" ? "other" : recorder.vendor,
        manufacturer: recorder.manufacturer,
        model: `${recorder.model} channel`,
        ipAddress: ip,
        ...(macAddress ? { macAddress } : {}),
        ...(channelFingerprint ? { hardwareId: channelFingerprint } : {}),
        onvifPort: 80,
        rtspPort: port,
        displayName: `${recorder.manufacturer} DVR - Channel ${channel.sourceChannel}`,
        credentialsRequired: false,
        streamVerified: true,
        rtspValidated: true,
        onvifSupport: false,
        compatibility: "compatible",
        duplicateStatus: "unique",
        compatibilityStatus: "compatible",
        statusReason: "rtsp_recorder_channel_auto_discovered",
        profiles: [{
          name: channel.role,
          codec: normalizeRtspDiscoveryCodec(channel.probe.codec),
          width: Math.max(1, channel.probe.width ?? 1),
          height: Math.max(1, channel.probe.height ?? 1),
          role: channel.role,
          preferredFor: channel.role === "sub" ? ["live", "analytics"] : ["recording", "live", "analytics"],
        }],
        capabilities: { ptz: false, audio: false, events: false },
        sourceType: recorder.sourceType,
        recorderId,
        recorderChannel: channel.sourceChannel,
        existingDeviceAssociation: recorderId,
        discoveryLayers: [
          { layer: "network-discovery", status: "passed", detail: "RTSP recorder discovered on the local network" },
          { layer: "onvif-discovery", status: "failed", detail: "Recorder did not answer ONVIF WS-Discovery" },
          { layer: "onvif-authentication", status: "skipped", detail: "Vendor RTSP channel discovery was used" },
          { layer: "get-capabilities", status: "skipped", detail: "Recorder fingerprint was obtained from its web application" },
          { layer: "get-profiles", status: "fallback", detail: "Recorder channels were enumerated with vendor RTSP paths" },
          { layer: "get-stream-uri", status: "fallback", detail: "CP PLUS/Dahua-compatible channel URI generated automatically" },
          { layer: "rtsp-verification", status: "passed", detail: "ffprobe decoded the recorder channel" },
          { layer: "vendor-adapter", status: "fallback", detail: `${recorder.manufacturer} recorder adapter selected automatically` },
          { layer: "fingerprint", status: channelFingerprint ? "passed" : "failed", detail: channelFingerprint ? "MAC and recorder channel fingerprint created" : "No stable Layer-2 identifier was available" },
        ],
      });
      logger.info("RTSP recorder channel submitted", {
        ipAddress: ip,
        recorderChannel: channel.sourceChannel,
        discoveryId: discovery.id,
        status: discovery.status,
        duplicateStatus: discovery.duplicateStatus,
      });
      submittedCount += 1;
      if (persistStreamSecrets && secretsStore) {
        await secretsStore.set(`edge://${agentId}/${discovery.id}`, channel.uri);
      }
    }
    logger.info(`RTSP recorder discovery: found ${channels.length} channel(s) at ${ip}:${port}`, {
      manufacturer: recorder.manufacturer,
      recorderId,
    });
  }

  await runWithConcurrency(hosts, concurrency, scanHost);
  return submittedCount;
}

export function buildUnverifiedRtspDiscoveryPayload(input: {
  agentId: string;
  ipAddress: string;
  endpoint: UnverifiedRtspEndpoint;
  macAddress?: string;
  hardwareId?: string;
}) {
  const recorder = input.endpoint.recorder;
  return {
    edgeAgentId: input.agentId,
    // Keep the unauthenticated placeholder compatible with older control
    // planes and IP-only identities. Recorder/channel identities are created
    // only after the operator supplies valid credentials and the streams can
    // be enumerated.
    discoveryMethod: "edge-agent-reported-inventory",
    vendor: recorderVendor(recorder?.vendor),
    manufacturer: recorder?.manufacturer ?? "Unknown",
    model: recorder?.model ?? "RTSP device",
    ipAddress: input.ipAddress,
    onvifPort: 80,
    rtspPort: input.endpoint.port,
    onvifSupport: false,
    displayName: recorder
      ? `${recorder.manufacturer} recorder ${input.ipAddress}`
      : `Discovered device ${input.ipAddress}`,
    credentialsRequired: input.endpoint.credentialsRequired,
    streamVerified: false,
    rtspValidated: false,
    compatibility: "review-required",
    duplicateStatus: "unique",
    compatibilityStatus: "review-required",
    statusReason: input.endpoint.credentialsRequired
      ? (recorder ? "recorder_credentials_required" : "rtsp_credentials_rejected")
      : "rtsp_stream_unverified",
    profiles: [{ name: "unverified", codec: "unknown", width: 1, height: 1 }],
    capabilities: { ptz: false, audio: false, events: false },
  };
}

function recorderVendor(vendor: VendorStreamFamily | undefined): "hikvision" | "cp-plus" | "other" {
  if (vendor === "hikvision" || vendor === "cp-plus") return vendor;
  return "other";
}

export function normalizeRtspDiscoveryCodec(
  value: string | null | undefined,
): "H264" | "H265" | "MJPEG" | "unknown" {
  const codec = value?.trim().replace(/[.\s_-]/g, "").toUpperCase();
  if (codec === "H264" || codec === "AVC" || codec === "AVC1") return "H264";
  if (codec === "H265" || codec === "HEVC" || codec === "HEV1" || codec === "HVC1") return "H265";
  if (codec === "MJPEG" || codec === "MJPG" || codec === "JPEG") return "MJPEG";
  return "unknown";
}

function rtspDiscoveryLayers(
  streamVerified: boolean,
  fingerprinted: boolean,
  recorder?: HttpRecorderFingerprint,
) {
  return [
    { layer: "network-discovery", status: "passed", detail: "RTSP TCP endpoint discovered" },
    { layer: "onvif-discovery", status: "failed", detail: "Device was not available through WS-Discovery" },
    { layer: "onvif-authentication", status: "skipped", detail: "No ONVIF endpoint available" },
    { layer: "get-capabilities", status: "skipped", detail: "No ONVIF endpoint available" },
    { layer: "get-profiles", status: "skipped", detail: "No ONVIF endpoint available" },
    { layer: "get-stream-uri", status: "skipped", detail: "RTSP URI was discovered directly" },
    { layer: "rtsp-verification", status: streamVerified ? "passed" : "failed", detail: streamVerified ? "ffprobe verified video" : "RTSP endpoint requires review" },
    {
      layer: "vendor-adapter",
      status: recorder ? "fallback" : "skipped",
      detail: recorder
        ? `${recorder.manufacturer} recorder web application identified; login is required to enumerate its channels`
        : "Generic RTSP path scan used",
    },
    { layer: "fingerprint", status: fingerprinted ? "passed" : "failed", detail: fingerprinted ? "MAC-based fingerprint created" : "No stable Layer-2 identifier was available" },
  ] as const;
}
