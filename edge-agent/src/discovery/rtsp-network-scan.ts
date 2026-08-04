import os from "node:os";
import net from "node:net";
import { attachCredentials } from "../devices/onvif-client.js";
import { probeRtsp } from "../streaming/rtsp-probe.js";
import { logger } from "../utils/logger.js";

export interface RtspScanOptions {
  cidr?: string; // single CIDR like 192.168.1.0/24 or empty to infer
  ports: number[];
  paths: string[];
  ffprobePath: string;
  timeoutMs: number;
  concurrency: number;
  username: string;
  password: string;
}

function inferLocalCidrs(): string[] {
  const ifaces = os.networkInterfaces();
  const cidrs: string[] = [];
  for (const addrs of Object.values(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      const octets = addr.address.split(".");
      if (octets.length !== 4) continue;
      // Use a conservative /24 for local networks
      cidrs.push(`${octets.slice(0, 3).join(".")}.0/24`);
    }
  }
  return cidrs;
}

function ipsFromCidr(cidr: string): string[] {
  // Support single IP or /24 CIDR. Keep simple and safe.
  if (!cidr) return [];
  const [base, prefixPart] = cidr.split("/");
  if (prefixPart !== undefined && base) {
    const prefix = Number(prefixPart);
    if (Number.isFinite(prefix) && prefix === 24) {
      const octets = base.split(".");
      if (octets.length === 4) {
        const basePrefix = octets.slice(0, 3).join(".");
        const ips: string[] = [];
        for (let i = 1; i < 255; i++) ips.push(`${basePrefix}.${i}`);
        return ips;
      }
    }
    // Fallback: treat as single host
    return [base];
  }
  return [cidr];
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

export async function discoverRtspDevices(
  branchId: string,
  agentId: string,
  options: RtspScanOptions,
  control: { submitDiscovery(branchId: string, payload: any): Promise<any> },
  secretsStore: { set(key: string, value: string): Promise<void> | void } | undefined,
  persistStreamSecrets = true,
): Promise<number> {
  const cidrList = options.cidr && options.cidr.trim() ? [options.cidr.trim()] : inferLocalCidrs();
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

  const candidates: string[] = [];
  for (const cidr of cidrList) {
    const ips = ipsFromCidr(cidr);
    for (const ip of ips) candidates.push(ip);
  }

  // Limit total concurrency
  let inFlight = 0;
  const queue: (() => Promise<void>)[] = [];
  const submitTasks: Promise<void>[] = [];
  let submittedCount = 0;

  async function worker(task: () => Promise<void>) {
    inFlight++;
    try { await task(); } catch (error) { logger.debug("RTSP scan worker error", { error: error instanceof Error ? error.message : String(error) }); }
    inFlight--;
    if (queue.length > 0) {
      const next = queue.shift()!;
      submitTasks.push(worker(next));
    }
  }

  for (const ip of candidates) {
    const task = async () => {
      try {
        for (const port of ports) {
          const reachable = await tryTcpConnect(ip, port, Math.max(500, Math.min(timeoutMs, 3000)));
          if (!reachable) continue;
          // Try candidate paths
          for (const path of paths) {
            let uri = `rtsp://${ip}:${port}${path}`;
            // omit port if 554
            if (port === 554) uri = `rtsp://${ip}${path}`;
            const authed = username ? attachCredentials(uri, { username, password }) : uri;
            const probe = await probeRtsp(authed, ffprobePath, timeoutMs).catch((e) => ({
            reachable: false,
            codec: null,
            width: null,
            height: null,
            error: e instanceof Error ? e.message : String(e),
          }));
            if (probe && probe.reachable) {
              try {
                const payload = {
                  edgeAgentId: agentId,
                  discoveryMethod: "rtsp-network-scan",
                  vendor: "other",
                  manufacturer: "unknown",
                  model: "IP Camera",
                  ipAddress: ip,
                  rtspPort: port,
                  displayName: `Discovered camera ${ip}`,
                  credentialsRequired: Boolean(username && !probe.reachable),
                  streamVerified: true,
                  rtspValidated: true,
                  compatibility: probe.reachable ? "compatible" : "review-required",
                  duplicateStatus: "unique",
                  compatibilityStatus: probe.reachable ? "compatible" : "review-required",
                  profiles: [{ name: "auto", codec: probe.codec ?? "unknown", width: probe.width ?? 1, height: probe.height ?? 1 }],
                  capabilities: { ptz: false, audio: false, events: false },
                };
                const discovery = await control.submitDiscovery(branchId, payload);
                submittedCount += 1;
                if (persistStreamSecrets && secretsStore && probe.reachable) {
                  const primaryUri = authed;
                  await secretsStore.set(`edge://${agentId}/${discovery.id}`, primaryUri);
                }
                logger.info(`RTSP discovery: found stream ${authed} -> discovery ${discovery.id}`);
                // Once we find a working path on this host, skip remaining ports/paths
                return;
              } catch (submissionError) {
                logger.error("RTSP discovery: failed to submit discovery", { error: submissionError instanceof Error ? submissionError.message : String(submissionError) });
              }
            }
          }
        }
      } catch (error) {
        logger.debug("RTSP scan host failed", { host: ip, error: error instanceof Error ? error.message : String(error) });
      }
    };
    if (inFlight < concurrency) submitTasks.push(worker(task)); else queue.push(task);
  }

  await Promise.all(submitTasks);
  return submittedCount;
}
