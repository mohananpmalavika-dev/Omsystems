/**
 * Edge Agent Connectivity Types
 */

export type LinkState =
  | "ONLINE"
  | "DEGRADED"
  | "OFFLINE"
  | "UNKNOWN";

export type BranchConnectivityState =
  | "ONLINE"
  | "DEGRADED"
  | "FAILOVER"
  | "OFFLINE"
  | "UNKNOWN";

export type WanPath =
  | "PRIMARY"
  | "BACKUP"
  | "NONE"
  | "UNKNOWN";

export type IspRole = "PRIMARY" | "BACKUP";

export type ConnectivityEvidenceSource =
  | "EDGE_AGENT"
  | "ROUTER_SNMP"
  | "ROUTER_API"
  | "ICMP_PROBE"
  | "HTTP_PROBE";

export type VpnState =
  | "CONNECTED"
  | "DEGRADED"
  | "DISCONNECTED"
  | "UNKNOWN";

export type VpnSource =
  | "WIREGUARD"
  | "IPSEC"
  | "OPENVPN"
  | "ROUTER_API"
  | "EDGE_AGENT";

export interface IspLinkEvidence {
  interfaceId: string;
  role: IspRole;
  providerName?: string | undefined;

  state: LinkState;

  gatewayReachable?: boolean | undefined;
  internetReachable?: boolean | undefined;

  latencyMs?: number | undefined;
  jitterMs?: number | undefined;
  packetLossPct?: number | undefined;

  dnsWorking?: boolean | undefined;

  publicIp?: string | undefined;
  previousPublicIp?: string | undefined;
  publicIpChanged?: boolean | undefined;

  interfaceIp?: string | undefined;
  gatewayIp?: string | undefined;

  observedAt: Date;
  source: ConnectivityEvidenceSource;
}

export interface VpnEvidence {
  state: VpnState;
  peer?: string | undefined;
  tunnelInterface?: string | undefined;

  latencyMs?: number | undefined;
  packetLossPct?: number | undefined;

  connectedSince?: Date | undefined;
  lastHandshakeAt?: Date | undefined;

  rxBytes?: number | undefined;
  txBytes?: number | undefined;

  observedAt: Date;
  source: VpnSource;
}

export interface BranchOutageRecord {
  id: string;
  branchId: string;
  startedAt: Date;
  endedAt?: Date | undefined;
  durationSeconds?: number | undefined;
  affectedPath: "PRIMARY" | "BACKUP" | "ALL";
  previousState?: BranchConnectivityState | undefined;
  resultingState?: BranchConnectivityState | undefined;
  primaryAvailable?: boolean | undefined;
  backupAvailable?: boolean | undefined;
  failoverSuccessful?: boolean | undefined;
  reason?: string | undefined;
}

export interface BranchConnectivityHealth {
  branchId: string;
  tenantId?: string | undefined;

  state: BranchConnectivityState;
  currentPath: WanPath;

  primary: IspLinkEvidence;
  backup?: IspLinkEvidence | undefined;
  vpn?: VpnEvidence | undefined;

  failoverActive: boolean;

  lastOutage?: BranchOutageRecord | undefined;

  observedAt: Date;
  confidence: number;
}

export interface BranchNetworkConfig {
  primary: {
    interfaceName: string;
    providerName?: string | undefined;
    gatewayIp?: string | undefined;
  };
  backup?: {
    interfaceName: string;
    providerName?: string | undefined;
    gatewayIp?: string | undefined;
  } | undefined;
  probeTargets: {
    ipTargets: string[];
    dnsHostname: string;
    centralEndpoint: string;
  };
  thresholds: {
    degradedLatencyMs: number;
    criticalLatencyMs: number;
    degradedPacketLossPct: number;
    criticalPacketLossPct: number;
    consecutiveFailuresForOffline: number;
    consecutiveSuccessesForRecovery: number;
  };
}
