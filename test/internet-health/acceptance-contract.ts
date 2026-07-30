export interface InternetEdgeAcceptanceTarget {
  expectedBranches: number;
  minimumDurationHours: number;
  expectedFailoverBranches: number;
  minimumPathWindowSeconds: number;
}

export interface InternetEdgeAcceptanceSample {
  branchId: string;
  observedAt: string;
  links: Array<{
    role: "primary" | "backup";
    status: "online" | "degraded" | "offline" | "unknown";
    connectivity: boolean;
    routeVerified: boolean;
    probeWindowSeconds: number;
    probeWindowAttempts: number;
    gatewayReachable: boolean | null;
    lastMileStatus: "healthy" | "gateway_unreachable" | "upstream_suspected" | "unknown";
    publicIp: string | null;
  }>;
  edge: {
    cpuUsedPercent: number | null;
    memoryUsedPercent: number | null;
    diskUsedPercent: number | null;
    diskFreeBytes: number | null;
    uptimeSeconds: number | null;
  };
}

export interface InternetEdgeAcceptanceCheck {
  name: "branch_inventory" | "sustained_duration" | "route_binding" | "rolling_path" | "gateway_health" | "public_ip" | "edge_resources" | "failover_recovery";
  passed: boolean;
  details: string;
}

/** Evaluates captured field evidence; it does not generate or simulate evidence. */
export function verifyInternetEdgeAcceptance(
  samples: InternetEdgeAcceptanceSample[],
  target: InternetEdgeAcceptanceTarget,
): InternetEdgeAcceptanceCheck[] {
  const byBranch = new Map<string, InternetEdgeAcceptanceSample[]>();
  for (const sample of samples) {
    const timestamp = Date.parse(sample.observedAt);
    if (!sample.branchId || !Number.isFinite(timestamp)) continue;
    const branch = byBranch.get(sample.branchId) ?? [];
    branch.push(sample);
    byBranch.set(sample.branchId, branch);
  }
  for (const branch of byBranch.values()) branch.sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
  const latest = [...byBranch.values()].flatMap((branch) => branch.at(-1) ?? []);
  const durationPassing = [...byBranch.values()].filter((branch) => {
    const first = Date.parse(branch[0]?.observedAt ?? "");
    const last = Date.parse(branch.at(-1)?.observedAt ?? "");
    return Number.isFinite(first) && Number.isFinite(last) && last - first >= target.minimumDurationHours * 3_600_000;
  });
  const routePassing = latest.filter((sample) => hasBothLinks(sample)
    && sample.links.every((link) => link.routeVerified));
  const rollingPassing = latest.filter((sample) => sample.links.every((link) =>
    link.probeWindowSeconds >= target.minimumPathWindowSeconds && link.probeWindowAttempts > 1));
  const gatewayPassing = latest.filter((sample) => sample.links.every((link) =>
    typeof link.gatewayReachable === "boolean" && link.lastMileStatus !== "unknown"));
  const publicIpPassing = latest.filter((sample) => sample.links.every((link) => Boolean(link.publicIp)));
  const edgePassing = latest.filter((sample) => [
    sample.edge.cpuUsedPercent, sample.edge.memoryUsedPercent, sample.edge.diskUsedPercent,
    sample.edge.diskFreeBytes, sample.edge.uptimeSeconds,
  ].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0));
  const failoverPassing = [...byBranch.values()].filter(hasFailoverAndRecovery);
  return [
    check("branch_inventory", byBranch.size >= target.expectedBranches, `expected at least ${target.expectedBranches}; observed ${byBranch.size}`),
    check("sustained_duration", durationPassing.length >= target.expectedBranches, `${durationPassing.length}/${byBranch.size} branch(es) captured for at least ${target.minimumDurationHours}h`),
    check("route_binding", routePassing.length >= target.expectedBranches, `${routePassing.length}/${byBranch.size} branch(es) have verified primary and backup routes`),
    check("rolling_path", rollingPassing.length >= target.expectedBranches, `${rollingPassing.length}/${byBranch.size} branch(es) meet the ${target.minimumPathWindowSeconds}s rolling path window`),
    check("gateway_health", gatewayPassing.length >= target.expectedBranches, `${gatewayPassing.length}/${byBranch.size} branch(es) expose gateway/last-mile evidence`),
    check("public_ip", publicIpPassing.length >= target.expectedBranches, `${publicIpPassing.length}/${byBranch.size} branch(es) expose both route-specific public IPs`),
    check("edge_resources", edgePassing.length >= target.expectedBranches, `${edgePassing.length}/${byBranch.size} branch(es) expose CPU, memory, disk, free-space, and uptime`),
    check("failover_recovery", failoverPassing.length >= target.expectedFailoverBranches, `expected ${target.expectedFailoverBranches}; observed ${failoverPassing.length} branch(es) with primary-online → backup-active → primary-recovered evidence`),
  ];
}

function hasBothLinks(sample: InternetEdgeAcceptanceSample) {
  return sample.links.some((link) => link.role === "primary") && sample.links.some((link) => link.role === "backup");
}

function hasFailoverAndRecovery(samples: InternetEdgeAcceptanceSample[]) {
  let onlineSeen = false;
  let failoverSeen = false;
  for (const sample of samples) {
    const primary = sample.links.find((link) => link.role === "primary");
    const backup = sample.links.find((link) => link.role === "backup");
    if (!primary || !backup) continue;
    if (primary.connectivity && primary.status !== "offline") {
      if (failoverSeen) return true;
      onlineSeen = true;
    } else if (onlineSeen && backup.connectivity && backup.routeVerified && backup.status !== "offline") {
      failoverSeen = true;
    }
  }
  return false;
}

function check(name: InternetEdgeAcceptanceCheck["name"], passed: boolean, details: string): InternetEdgeAcceptanceCheck {
  return { name, passed, details };
}
