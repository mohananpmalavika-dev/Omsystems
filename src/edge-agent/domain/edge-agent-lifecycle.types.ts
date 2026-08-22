/**
 * Edge Gateway & Agent Lifecycle Domain Types
 */

export interface EdgeAgentNode {
  gatewayId: string;
  branchId: string;
  hostname: string;
  ipAddress: string;
  agentVersion: string;
  serviceUptimeSeconds: number;
  cpuPercent: number;
  ramPercent: number;
  diskPercent: number;
  appliedConfigVersion: number;
  tlsCertExpiry: string;
  lastRestartAt: string;
  lastHeartbeatAt: string;
  healthStatus: "HEALTHY" | "DEGRADED" | "OVERLOADED" | "OFFLINE";
  upgradeState: {
    status: "IDLE" | "DOWNLOADING" | "UPGRADING" | "UPGRADED" | "FAILED" | "ROLLBACK";
    targetVersion?: string;
    packageSha256?: string;
    progressPercent?: number;
    errorReason?: string;
  };
}

export interface EdgeUpgradePackage {
  packageId: string;
  targetVersion: string;
  packageUri: string;
  packageSha256: string;
  signature: string;
  releaseNotes: string;
  minSupportedPreviousVersion: string;
  createdAt: string;
}
