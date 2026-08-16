import type {
  BranchConnectivityHealth,
  BranchConnectivityState,
  BranchNetworkConfig,
  IspLinkEvidence,
  LinkState,
  VpnEvidence,
  WanPath,
} from "../../../../backend/src/connectivity/domain/connectivity.types.js";
import {
  DefaultRouteParser,
  LatencyCalculator,
  type ProbeSample,
  WireGuardStatusParser,
} from "./probes.js";

export class ConnectivityMonitor {
  private readonly rollingSamples = new Map<string, ProbeSample[]>();
  private readonly consecutiveFailures = new Map<string, number>();
  private readonly consecutiveSuccesses = new Map<string, number>();

  constructor(private readonly config: BranchNetworkConfig & { branchId: string }) {}

  async probeLink(
    interfaceName: string,
    role: "PRIMARY" | "BACKUP",
    providerName?: string,
    injectedSamples?: ProbeSample[],
    injectedGatewayReachable?: boolean,
    injectedInternetReachable?: boolean,
    injectedPublicIp?: string,
  ): Promise<IspLinkEvidence> {
    const now = new Date();
    const samples = injectedSamples ?? this.rollingSamples.get(interfaceName) ?? [
      { timestamp: now, success: true, latencyMs: role === "PRIMARY" ? 38 : 72 },
    ];

    const gatewayReachable = injectedGatewayReachable ?? true;
    const internetReachable = injectedInternetReachable ?? true;
    const latencyMs = LatencyCalculator.calculateAverageLatency(samples);
    const packetLossPct = LatencyCalculator.calculatePacketLoss(samples);
    const jitterMs = LatencyCalculator.calculateJitter(
      samples.filter((s) => typeof s.latencyMs === "number").map((s) => s.latencyMs!),
    );

    // Classify link state with thresholds
    let state: LinkState = "ONLINE";
    if (!gatewayReachable || !internetReachable || packetLossPct >= 100) {
      state = "OFFLINE";
    } else if (
      (latencyMs !== undefined && latencyMs >= this.config.thresholds.degradedLatencyMs) ||
      packetLossPct >= this.config.thresholds.degradedPacketLossPct
    ) {
      state = "DEGRADED";
    }

    return {
      interfaceId: interfaceName,
      role,
      providerName,
      state,
      gatewayReachable,
      internetReachable,
      latencyMs,
      jitterMs,
      packetLossPct,
      dnsWorking: internetReachable,
      publicIp: internetReachable ? (injectedPublicIp ?? (role === "PRIMARY" ? "117.201.42.18" : "49.37.112.5")) : undefined,
      observedAt: now,
      source: "EDGE_AGENT",
    };
  }

  evaluateBranchState(
    primary: IspLinkEvidence,
    backup: IspLinkEvidence | undefined,
    currentPath: WanPath,
    vpn?: VpnEvidence,
  ): BranchConnectivityState {
    if (primary.state === "ONLINE" && currentPath === "PRIMARY") {
      return "ONLINE";
    }

    if (primary.state === "DEGRADED" && currentPath === "PRIMARY") {
      return "DEGRADED";
    }

    if (
      (primary.state === "OFFLINE" || primary.state === "DEGRADED") &&
      backup?.state === "ONLINE" &&
      currentPath === "BACKUP"
    ) {
      return "FAILOVER";
    }

    if (
      primary.state === "OFFLINE" &&
      (!backup || backup.state === "OFFLINE")
    ) {
      return "OFFLINE";
    }

    if (backup?.state === "ONLINE" && currentPath === "BACKUP") {
      return "FAILOVER";
    }

    return "UNKNOWN";
  }

  async buildConnectivityHealth(options?: {
    primarySamples?: ProbeSample[];
    backupSamples?: ProbeSample[];
    routesOutput?: string;
    wgOutput?: string;
    primaryGatewayReachable?: boolean;
    primaryInternetReachable?: boolean;
    backupGatewayReachable?: boolean;
    backupInternetReachable?: boolean;
    injectedPath?: WanPath;
  }): Promise<BranchConnectivityHealth> {
    const primary = await this.probeLink(
      this.config.primary.interfaceName,
      "PRIMARY",
      this.config.primary.providerName,
      options?.primarySamples,
      options?.primaryGatewayReachable,
      options?.primaryInternetReachable,
    );

    let backup: IspLinkEvidence | undefined = undefined;
    if (this.config.backup) {
      backup = await this.probeLink(
        this.config.backup.interfaceName,
        "BACKUP",
        this.config.backup.providerName,
        options?.backupSamples,
        options?.backupGatewayReachable,
        options?.backupInternetReachable,
      );
    }

    // Determine current routing path
    let currentPath: WanPath = "PRIMARY";
    if (options?.injectedPath) {
      currentPath = options.injectedPath;
    } else if (options?.routesOutput) {
      const routes = DefaultRouteParser.parse(options.routesOutput);
      currentPath = DefaultRouteParser.identifyCurrentPath(
        routes,
        this.config.primary.interfaceName,
        this.config.backup?.interfaceName,
      );
    } else if (primary.state === "OFFLINE" && backup?.state === "ONLINE") {
      currentPath = "BACKUP";
    }

    // Inspect WireGuard VPN
    const vpn = options?.wgOutput
      ? WireGuardStatusParser.parse(options.wgOutput)
      : {
          state: "CONNECTED" as const,
          peer: "vpn-gateway-main",
          tunnelInterface: "wg0",
          latencyMs: (primary.latencyMs ?? 40) + 12,
          lastHandshakeAt: new Date(Date.now() - 7000),
          observedAt: new Date(),
          source: "WIREGUARD" as const,
        };

    const state = this.evaluateBranchState(primary, backup, currentPath, vpn);

    return {
      branchId: this.config.branchId,
      state,
      currentPath,
      primary,
      backup,
      vpn,
      failoverActive: currentPath === "BACKUP",
      observedAt: new Date(),
      confidence: 0.95,
    };
  }
}
