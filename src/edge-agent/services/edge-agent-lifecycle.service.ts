import { createHmac, createHash } from "node:crypto";
import type {
  EdgeAgentNode,
  EdgeUpgradePackage,
} from "../domain/edge-agent-lifecycle.types.js";

export class EdgeAgentLifecycleService {
  private readonly nodes = new Map<string, EdgeAgentNode>(); // gatewayId -> node
  private readonly packages = new Map<string, EdgeUpgradePackage>(); // packageId -> package

  constructor() {
  }

  private seedDefaultEdgeNodes(): void {
    const pkgV250: EdgeUpgradePackage = {
      packageId: "pkg-edge-v2-5-0",
      targetVersion: "2.5.0",
      packageUri: "https://releases.omsystems.bank/edge/windows-x64/sentinel-edge-2.5.0.msi",
      packageSha256: "9f83c18b768c78326a27e7f677d85340156d908ab97c9b0e3522f6a619ab4657",
      signature: "hmac-sig-v2-5-0",
      releaseNotes: "Enhanced ONVIF Profile T talkback, zero-copy MediaMTX relay, and hardened TLS 1.3.",
      minSupportedPreviousVersion: "2.3.0",
      createdAt: "2026-08-12T00:00:00Z",
    };
    this.packages.set(pkgV250.packageId, pkgV250);

    const node1: EdgeAgentNode = {
      gatewayId: "gw-br-034",
      branchId: "BR-034",
      hostname: "EDGE-KOCHI-01",
      ipAddress: "10.0.34.5",
      agentVersion: "2.4.1",
      serviceUptimeSeconds: 1209600, // 14 days
      cpuPercent: 18.5,
      ramPercent: 42.0,
      diskPercent: 65.2,
      appliedConfigVersion: 34,
      tlsCertExpiry: "2027-05-15T00:00:00Z",
      lastRestartAt: "2026-08-02T00:00:00Z",
      lastHeartbeatAt: new Date().toISOString(),
      healthStatus: "HEALTHY",
      upgradeState: { status: "IDLE" },
    };

    const node2: EdgeAgentNode = {
      gatewayId: "gw-br-118",
      branchId: "BR-118",
      hostname: "EDGE-TRIVANDRUM-01",
      ipAddress: "10.0.118.5",
      agentVersion: "2.4.0",
      serviceUptimeSeconds: 604800,
      cpuPercent: 24.1,
      ramPercent: 55.4,
      diskPercent: 78.1,
      appliedConfigVersion: 32,
      tlsCertExpiry: "2026-11-20T00:00:00Z",
      lastRestartAt: "2026-08-09T00:00:00Z",
      lastHeartbeatAt: new Date().toISOString(),
      healthStatus: "HEALTHY",
      upgradeState: { status: "IDLE" },
    };

    this.nodes.set(node1.gatewayId, node1);
    this.nodes.set(node2.gatewayId, node2);
  }

  /**
   * Process edge agent heartbeat and update telemetry.
   */
  async recordHeartbeat(
    heartbeat: Omit<EdgeAgentNode, "upgradeState">,
  ): Promise<EdgeAgentNode> {
    const existing = this.nodes.get(heartbeat.gatewayId);
    const updated: EdgeAgentNode = {
      ...heartbeat,
      upgradeState: existing?.upgradeState || { status: "IDLE" },
      lastHeartbeatAt: new Date().toISOString(),
    };
    this.nodes.set(heartbeat.gatewayId, updated);
    return updated;
  }

  /**
   * Trigger remote signed package upgrade.
   */
  async triggerRemoteUpgrade(
    gatewayId: string,
    packageId: string,
  ): Promise<EdgeAgentNode> {
    const node = this.nodes.get(gatewayId);
    if (!node) throw new Error(`Edge node ${gatewayId} not found`);

    const pkg = this.packages.get(packageId);
    if (!pkg) throw new Error(`Upgrade package ${packageId} not found`);

    node.upgradeState = {
      status: "UPGRADING",
      targetVersion: pkg.targetVersion,
      packageSha256: pkg.packageSha256,
      progressPercent: 50,
    };

    return node;
  }

  /**
   * Confirm upgrade success or rollback.
   */
  async confirmUpgradeResult(
    gatewayId: string,
    success: boolean,
    errorReason?: string,
  ): Promise<EdgeAgentNode> {
    const node = this.nodes.get(gatewayId);
    if (!node) throw new Error(`Edge node ${gatewayId} not found`);

    if (success && node.upgradeState.targetVersion) {
      node.agentVersion = node.upgradeState.targetVersion;
      node.upgradeState = { status: "UPGRADED", progressPercent: 100 };
    } else {
      node.upgradeState = {
        status: "ROLLBACK",
        errorReason: errorReason || "Health verification check failed post-install",
      };
    }

    return node;
  }

  getNode(gatewayId: string): EdgeAgentNode | null {
    return this.nodes.get(gatewayId) || null;
  }

  listNodes(): EdgeAgentNode[] {
    return Array.from(this.nodes.values());
  }

  listPackages(): EdgeUpgradePackage[] {
    return Array.from(this.packages.values());
  }
}
