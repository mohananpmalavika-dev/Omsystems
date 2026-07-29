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
  contractedDownMbps?: number | undefined;
  contractedUpMbps?: number | undefined;
}

export interface InternetProbeResult {
  linkId: string; role: "primary" | "backup"; ispName: string; interfaceName: string | null;
  connectivity: boolean; status: "online" | "degraded" | "offline" | "unknown";
  latencyMs: number | null; jitterMs: number | null; packetLossPercent: number;
  rxMbps: number | null; txMbps: number | null; bandwidthUtilizationPercent: number | null;
  contractedDownMbps: number | null; contractedUpMbps: number | null;
  routeVerified: boolean; probeBinding: "default-route" | "interface" | "source-address" | "unbound";
  probeTarget: string | null; reasonCodes: string[];
}

interface CounterSnapshot { receivedBytes: number; sentBytes: number; sampledAt: number }

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
  options: { timeoutMs: number; attempts: number; counterSampler: NetworkCounterSampler; fetcher?: typeof fetch; boundProber?: BoundProber },
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
  const packetLossPercent = Math.round((failures / options.attempts) * 10_000) / 100;
  const latencyMs = latencies.length ? round(average(latencies)) : null;
  const jitterMs = latencies.length > 1 ? round(average(latencies.slice(1).map((value, index) => Math.abs(value - latencies[index]!)))) : 0;
  const counters = await options.counterSampler.sample(link.interfaceName).catch(() => null);
  const downUtilization = counters && link.contractedDownMbps ? counters.rxMbps / link.contractedDownMbps * 100 : null;
  const upUtilization = counters && link.contractedUpMbps ? counters.txMbps / link.contractedUpMbps * 100 : null;
  const utilization = downUtilization === null && upUtilization === null ? null : round(Math.min(100, Math.max(downUtilization ?? 0, upUtilization ?? 0)));
  const connectivity = latencies.length > 0;
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
  return {
    linkId: link.id, role: link.role, ispName: link.ispName,
    interfaceName: link.interfaceName ?? null, connectivity,
    status: !routeVerified ? "unknown" : !connectivity ? "offline" : degraded ? "degraded" : "online",
    latencyMs, jitterMs, packetLossPercent,
    rxMbps: counters ? round(counters.rxMbps) : null, txMbps: counters ? round(counters.txMbps) : null,
    bandwidthUtilizationPercent: utilization,
    contractedDownMbps: link.contractedDownMbps ?? null, contractedUpMbps: link.contractedUpMbps ?? null,
    routeVerified, probeBinding,
    probeTarget: successfulTarget, reasonCodes: reasonCodes.length ? reasonCodes : ["internet_link_healthy"],
  };
}

type BoundProber = (target: string, binding: string, timeoutMs: number) => Promise<void>;

/** curl binds the socket before connecting, so a backup probe cannot silently
 * traverse the primary default route. `sourceAddress` is recommended on Windows. */
async function probeBoundTarget(target: string, binding: string, timeoutMs: number) {
  await execFileAsync("curl", ["--silent", "--show-error", "--output", process.platform === "win32" ? "NUL" : "/dev/null", "--interface", binding, "--max-time", String(Math.max(1, Math.ceil(timeoutMs / 1000))), target], {
    timeout: timeoutMs + 1_000,
    windowsHide: true,
  });
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
