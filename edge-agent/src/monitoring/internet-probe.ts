import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface InternetLinkConfig {
  id: string;
  role: "primary" | "backup";
  ispName: string;
  interfaceName?: string | undefined;
  /** Source IP used to bind reachability probes (portable across Windows/Linux). */
  sourceAddress?: string | undefined;
  targets: string[];
  /** Optional LAN gateway/modem address used to distinguish local from upstream outages. */
  gatewayAddress?: string | undefined;
  /** Route-bound endpoint returning the link's public IP as plain text or JSON. */
  publicIpEndpoint?: string | undefined;
  contractedDownMbps?: number | undefined;
  contractedUpMbps?: number | undefined;
}

export interface InternetProbeResult {
  linkId: string; role: "primary" | "backup"; ispName: string; interfaceName: string | null;
  connectivity: boolean; status: "online" | "degraded" | "offline" | "unknown";
  latencyMs: number | null; jitterMs: number | null; packetLossPercent: number;
  instantPacketLossPercent: number; availabilityPercent: number;
  probeWindowSeconds: number; probeWindowAttempts: number; consecutiveFailedPolls: number;
  lastSuccessfulAt: string | null; outageStartedAt: string | null;
  rxMbps: number | null; txMbps: number | null; bandwidthUtilizationPercent: number | null;
  contractedDownMbps: number | null; contractedUpMbps: number | null;
  routeVerified: boolean; probeBinding: "default-route" | "interface" | "source-address" | "unbound";
  probeTarget: string | null; reasonCodes: string[];
  gatewayAddress: string | null; gatewayReachable: boolean | null;
  lastMileStatus: "healthy" | "gateway_unreachable" | "upstream_suspected" | "unknown";
  publicIp: string | null; previousPublicIp: string | null;
  publicIpChanged: boolean; publicIpChangedAt: string | null;
}

interface CounterSnapshot { receivedBytes: number; sentBytes: number; sampledAt: number }

interface PathSample { sampledAt: number; attempts: number; failures: number }
interface PathState {
  samples: PathSample[]; consecutiveFailedPolls: number;
  lastSuccessfulAt: number | null; outageStartedAt: number | null;
  publicIp: string | null; previousPublicIp: string | null; publicIpChangedAt: number | null;
}

/** Maintains a bounded rolling path history across scheduled edge-agent polls. */
export class NetworkPathTracker {
  private readonly states = new Map<string, PathState>();

  constructor(private readonly windowMs = 5 * 60_000) {}

  observe(linkId: string, input: { attempts: number; failures: number; sampledAt?: number; publicIp?: string | null }) {
    const sampledAt = input.sampledAt ?? Date.now();
    const state = this.states.get(linkId) ?? {
      samples: [], consecutiveFailedPolls: 0, lastSuccessfulAt: null, outageStartedAt: null,
      publicIp: null, previousPublicIp: null, publicIpChangedAt: null,
    };
    state.samples.push({ sampledAt, attempts: input.attempts, failures: input.failures });
    state.samples = state.samples.filter((sample) => sample.sampledAt >= sampledAt - this.windowMs).slice(-240);
    const pollFailed = input.failures >= input.attempts;
    if (pollFailed) {
      state.consecutiveFailedPolls += 1;
      state.outageStartedAt ??= sampledAt;
    } else {
      state.consecutiveFailedPolls = 0;
      state.lastSuccessfulAt = sampledAt;
      state.outageStartedAt = null;
    }
    const publicIp = normalizePublicIp(input.publicIp);
    if (publicIp && state.publicIp && publicIp !== state.publicIp) {
      state.previousPublicIp = state.publicIp;
      state.publicIpChangedAt = sampledAt;
    }
    if (publicIp) state.publicIp = publicIp;
    this.states.set(linkId, state);
    const attempts = state.samples.reduce((sum, sample) => sum + sample.attempts, 0);
    const failures = state.samples.reduce((sum, sample) => sum + sample.failures, 0);
    const firstSampleAt = state.samples[0]?.sampledAt ?? sampledAt;
    return {
      packetLossPercent: attempts ? round(failures / attempts * 100) : 100,
      availabilityPercent: attempts ? round((attempts - failures) / attempts * 100) : 0,
      probeWindowSeconds: round(Math.max(0, sampledAt - firstSampleAt) / 1_000),
      probeWindowAttempts: attempts,
      consecutiveFailedPolls: state.consecutiveFailedPolls,
      lastSuccessfulAt: iso(state.lastSuccessfulAt), outageStartedAt: iso(state.outageStartedAt),
      publicIp: state.publicIp, previousPublicIp: state.previousPublicIp,
      publicIpChanged: state.publicIpChangedAt !== null && sampledAt - state.publicIpChangedAt <= this.windowMs,
      publicIpChangedAt: iso(state.publicIpChangedAt),
    };
  }
}

export class NetworkCounterSampler {
  private previous = new Map<string, CounterSnapshot>();

  async sample(interfaceName?: string) {
    const key = interfaceName ?? "all";
    const current = await readNetworkCounters(interfaceName);
    if (!current) return null;
    const now = Date.now();
    const previous = this.previous.get(key);
    this.previous.set(key, { ...current, sampledAt: now });
    if (!previous || now <= previous.sampledAt) return null;
    const seconds = (now - previous.sampledAt) / 1000;
    return {
      rxMbps: Math.max(0, (current.receivedBytes - previous.receivedBytes) * 8 / seconds / 1_000_000),
      txMbps: Math.max(0, (current.sentBytes - previous.sentBytes) * 8 / seconds / 1_000_000),
    };
  }
}

export async function probeInternetLink(
  link: InternetLinkConfig,
  options: {
    timeoutMs: number; attempts: number; counterSampler: NetworkCounterSampler;
    fetcher?: typeof fetch; boundProber?: BoundProber; pathTracker?: NetworkPathTracker;
    gatewayProber?: GatewayProber; publicIpResolver?: PublicIpResolver; now?: () => number;
  },
): Promise<InternetProbeResult> {
  const fetcher = options.fetcher ?? fetch;
  const binding = link.sourceAddress ?? link.interfaceName;
  const probeBinding = link.sourceAddress ? "source-address" as const
    : link.interfaceName ? "interface" as const
      : link.role === "primary" ? "default-route" as const : "unbound" as const;
  const latencies: number[] = [];
  let failures = 0;
  let bindingProbeUnavailable = false;
  let successfulTarget: string | null = null;
  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    const target = link.targets[attempt % link.targets.length];
    if (!target) { failures += 1; continue; }
    const started = performance.now();
    try {
      if (binding) {
        await (options.boundProber ?? probeBoundTarget)(target, binding, options.timeoutMs);
      } else {
        await fetcher(target, {
          method: "GET", headers: { range: "bytes=0-0", "cache-control": "no-cache" },
          signal: AbortSignal.timeout(options.timeoutMs), redirect: "manual",
        });
      }
      latencies.push(performance.now() - started);
      successfulTarget ??= target;
    } catch (error) {
      if (binding && isCommandUnavailable(error)) bindingProbeUnavailable = true;
      failures += 1;
    }
  }
  const routeVerified = probeBinding !== "unbound" && !bindingProbeUnavailable;
  const instantPacketLossPercent = Math.round((failures / options.attempts) * 10_000) / 100;
  const latencyMs = latencies.length ? round(average(latencies)) : null;
  const jitterMs = latencies.length > 1 ? round(average(latencies.slice(1).map((value, index) => Math.abs(value - latencies[index]!)))) : 0;
  const counters = await options.counterSampler.sample(link.interfaceName).catch(() => null);
  const downUtilization = counters && link.contractedDownMbps ? counters.rxMbps / link.contractedDownMbps * 100 : null;
  const upUtilization = counters && link.contractedUpMbps ? counters.txMbps / link.contractedUpMbps * 100 : null;
  const utilization = downUtilization === null && upUtilization === null ? null : round(Math.min(100, Math.max(downUtilization ?? 0, upUtilization ?? 0)));
  const connectivity = latencies.length > 0;
  const gatewayReachable = link.gatewayAddress ? await (options.gatewayProber ?? probeGateway)(
    link.gatewayAddress, link.sourceAddress ?? link.interfaceName, options.timeoutMs,
  ).then(() => true).catch(() => false) : null;
  const publicIp = link.publicIpEndpoint && connectivity
    ? await (options.publicIpResolver ?? resolvePublicIp)(link.publicIpEndpoint, binding, options.timeoutMs, fetcher).catch(() => null)
    : null;
  const rolling = (options.pathTracker ?? new NetworkPathTracker()).observe(link.id, {
    attempts: options.attempts, failures, sampledAt: options.now?.() ?? Date.now(), publicIp,
  });
  const packetLossPercent = rolling.packetLossPercent;
  const degraded = connectivity && (packetLossPercent >= 2 || (latencyMs ?? 0) >= 150 || (jitterMs ?? 0) >= 30 || (utilization ?? 0) >= 80);
  const reasonCodes: string[] = [];
  if (!connectivity) reasonCodes.push("internet_probe_failed");
  if (packetLossPercent >= 2) reasonCodes.push("internet_packet_loss_high");
  if ((latencyMs ?? 0) >= 150) reasonCodes.push("internet_latency_high");
  if ((jitterMs ?? 0) >= 30) reasonCodes.push("internet_jitter_high");
  if ((utilization ?? 0) >= 80) reasonCodes.push("internet_bandwidth_high");
  if (!counters) reasonCodes.push("bandwidth_utilization_unavailable");
  if (!routeVerified) reasonCodes.push("backup_route_binding_not_configured");
  if (bindingProbeUnavailable) reasonCodes.push("link_binding_probe_unavailable");
  if (gatewayReachable === false) reasonCodes.push("isp_gateway_unreachable");
  if (!connectivity && gatewayReachable === true && rolling.consecutiveFailedPolls >= 2) reasonCodes.push("last_mile_outage_suspected");
  if (!link.gatewayAddress) reasonCodes.push("gateway_health_unconfigured");
  if (link.publicIpEndpoint && !rolling.publicIp) reasonCodes.push("public_ip_probe_unavailable");
  if (!link.publicIpEndpoint) reasonCodes.push("public_ip_monitoring_unconfigured");
  if (rolling.publicIpChanged) reasonCodes.push("public_ip_changed");
  const lastMileStatus = gatewayReachable === false ? "gateway_unreachable" as const
    : !connectivity && gatewayReachable === true && rolling.consecutiveFailedPolls >= 2 ? "upstream_suspected" as const
      : connectivity && gatewayReachable === true ? "healthy" as const : "unknown" as const;
  return {
    linkId: link.id, role: link.role, ispName: link.ispName,
    interfaceName: link.interfaceName ?? null, connectivity,
    status: !routeVerified ? "unknown" : !connectivity ? "offline" : degraded ? "degraded" : "online",
    latencyMs, jitterMs, packetLossPercent, instantPacketLossPercent,
    availabilityPercent: rolling.availabilityPercent, probeWindowSeconds: rolling.probeWindowSeconds,
    probeWindowAttempts: rolling.probeWindowAttempts, consecutiveFailedPolls: rolling.consecutiveFailedPolls,
    lastSuccessfulAt: rolling.lastSuccessfulAt, outageStartedAt: rolling.outageStartedAt,
    rxMbps: counters ? round(counters.rxMbps) : null, txMbps: counters ? round(counters.txMbps) : null,
    bandwidthUtilizationPercent: utilization,
    contractedDownMbps: link.contractedDownMbps ?? null, contractedUpMbps: link.contractedUpMbps ?? null,
    routeVerified, probeBinding,
    probeTarget: successfulTarget,
    gatewayAddress: link.gatewayAddress ?? null, gatewayReachable, lastMileStatus,
    publicIp: rolling.publicIp, previousPublicIp: rolling.previousPublicIp,
    publicIpChanged: rolling.publicIpChanged, publicIpChangedAt: rolling.publicIpChangedAt,
    reasonCodes: reasonCodes.length ? reasonCodes : ["internet_link_healthy"],
  };
}

type BoundProber = (target: string, binding: string, timeoutMs: number) => Promise<void>;
type GatewayProber = (address: string, binding: string | undefined, timeoutMs: number) => Promise<void>;
type PublicIpResolver = (endpoint: string, binding: string | undefined, timeoutMs: number, fetcher: typeof fetch) => Promise<string | null>;

/** curl binds the socket before connecting, so a backup probe cannot silently
 * traverse the primary default route. `sourceAddress` is recommended on Windows. */
async function probeBoundTarget(target: string, binding: string, timeoutMs: number) {
  await execFileAsync("curl", ["--silent", "--show-error", "--output", process.platform === "win32" ? "NUL" : "/dev/null", "--interface", binding, "--max-time", String(Math.max(1, Math.ceil(timeoutMs / 1000))), target], {
    timeout: timeoutMs + 1_000,
    windowsHide: true,
  });
}

async function probeGateway(address: string, binding: string | undefined, timeoutMs: number) {
  const timeoutSeconds = String(Math.max(1, Math.ceil(timeoutMs / 1_000)));
  const args = process.platform === "win32"
    ? ["-n", "1", "-w", String(timeoutMs), ...(binding && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(binding) ? ["-S", binding] : []), address]
    : ["-c", "1", "-W", timeoutSeconds, ...(binding ? ["-I", binding] : []), address];
  await execFileAsync("ping", args, { timeout: timeoutMs + 1_000, windowsHide: true });
}

async function resolvePublicIp(endpoint: string, binding: string | undefined, timeoutMs: number, fetcher: typeof fetch) {
  let text: string;
  if (binding) {
    const { stdout } = await execFileAsync("curl", ["--silent", "--show-error", "--interface", binding, "--max-time", String(Math.max(1, Math.ceil(timeoutMs / 1_000))), endpoint], { timeout: timeoutMs + 1_000, windowsHide: true });
    text = stdout;
  } else {
    const response = await fetcher(endpoint, { method: "GET", headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(timeoutMs) });
    text = await response.text();
  }
  try {
    const json = JSON.parse(text) as { ip?: unknown; address?: unknown };
    return normalizePublicIp(typeof json.ip === "string" ? json.ip : typeof json.address === "string" ? json.address : null);
  } catch {
    return normalizePublicIp(text);
  }
}

function isCommandUnavailable(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

async function readNetworkCounters(interfaceName?: string): Promise<Omit<CounterSnapshot, "sampledAt"> | null> {
  if (process.platform === "linux") {
    const text = await readFile("/proc/net/dev", "utf8");
    const rows = text.split(/\r?\n/).slice(2).flatMap((line) => {
      const [name, values] = line.split(":");
      if (!name || !values || (interfaceName && name.trim() !== interfaceName)) return [];
      const fields = values.trim().split(/\s+/).map(Number);
      return [{ receivedBytes: fields[0] ?? 0, sentBytes: fields[8] ?? 0 }];
    });
    return rows.length ? rows.reduce((sum, row) => ({ receivedBytes: sum.receivedBytes + row.receivedBytes, sentBytes: sum.sentBytes + row.sentBytes }), { receivedBytes: 0, sentBytes: 0 }) : null;
  }
  if (process.platform === "win32") {
    if (interfaceName) {
      const escapedName = interfaceName.replace(/'/g, "''");
      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-Command",
        `Get-NetAdapterStatistics -Name '${escapedName}' | Select-Object -First 1 ReceivedBytes,SentBytes | ConvertTo-Json -Compress`,
      ], { timeout: 3000, windowsHide: true });
      const values = JSON.parse(stdout) as { ReceivedBytes?: unknown; SentBytes?: unknown };
      const receivedBytes = Number(values.ReceivedBytes);
      const sentBytes = Number(values.SentBytes);
      return Number.isFinite(receivedBytes) && Number.isFinite(sentBytes) ? { receivedBytes, sentBytes } : null;
    }
    const { stdout } = await execFileAsync("netstat", ["-e"], { timeout: 3000 });
    const match = stdout.match(/Bytes\s+(\d+)\s+(\d+)/i);
    return match ? { receivedBytes: Number(match[1]), sentBytes: Number(match[2]) } : null;
  }
  return null;
}

function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function round(value: number) { return Math.round(value * 100) / 100; }
function iso(value: number | null) { return value === null ? null : new Date(value).toISOString(); }
function normalizePublicIp(value: string | null | undefined) {
  const candidate = value?.trim();
  return candidate && /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]+)$/i.test(candidate) ? candidate : null;
}
