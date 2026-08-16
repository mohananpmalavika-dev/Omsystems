/**
 * Digital Twin Infrastructure Health & Dependency Domain Contracts
 */

export type TwinNodeType =
  | "BRANCH"
  | "ROUTER"
  | "SWITCH"
  | "RECORDER"
  | "CAMERA"
  | "STORAGE"
  | "ISP"
  | "VPN"
  | "SERVICE";

export type TwinRelationshipType =
  | "CONTAINS"
  | "CONNECTS_TO"
  | "DEPENDS_ON"
  | "RECORDS"
  | "STORES_ON"
  | "POWERED_BY"
  | "USES_NETWORK"
  | "ROUTES_THROUGH";

export type TwinHealthState =
  | "HEALTHY"
  | "WARNING"
  | "CRITICAL"
  | "OFFLINE"
  | "UNKNOWN";

export type TwinHealthOrigin =
  | "OBSERVED"
  | "INFERRED"
  | "DEPENDENCY";

export interface TwinNode {
  id: string;
  tenantId: string;
  branchId: string;
  type: TwinNodeType;
  name: string;

  health: TwinHealthState;
  healthOrigin: TwinHealthOrigin;
  rootCauseNodeId?: string | undefined;
  healthReason?: string | undefined;

  lastObservedAt: Date;
  firstFailureAt?: Date | undefined;

  metadata: Record<string, unknown>;
}

export interface TwinRelationship {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  type: TwinRelationshipType;
  criticality: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  metadata?: Record<string, unknown> | undefined;
}

export type TwinObservationMetric =
  | "NETWORK_REACHABLE"
  | "STREAM_AVAILABLE"
  | "VIDEO_DECODABLE"
  | "RECORDING_ACTIVE"
  | "RECORDER_ONLINE"
  | "DISK_HEALTH"
  | "RETENTION_DAYS"
  | "INTERNET_REACHABLE"
  | "PACKET_LOSS"
  | "LATENCY"
  | "CLOCK_OFFSET";

export interface TwinObservation {
  id: string;
  tenantId: string;
  branchId: string;
  nodeId: string;
  metric: TwinObservationMetric;
  value: unknown;
  observedAt: Date;
  source: string;
  confidence?: number | undefined;
}

export interface InfrastructureIncident {
  id: string;
  tenantId: string;
  branchId: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  severity: "P1" | "P2" | "P3" | "P4";

  rootCauseNodeId: string;
  rootCauseNodeName: string;
  rootCauseNodeType: TwinNodeType;
  rootCauseReason: string;

  impactedNodeIds: string[];
  impactedRecordersCount: number;
  impactedCamerasCount: number;
  impactedServices: string[];
  suppressedAlertsCount: number;

  startedAt: Date;
  resolvedAt?: Date | undefined;
  durationSeconds?: number | undefined;
  acknowledgedBy?: string | undefined;
}

export interface BranchHealthProjection {
  branchId: string;
  status: TwinHealthState;
  summary: string;
  primaryRootCause?: {
    nodeId: string;
    nodeName: string;
    nodeType: TwinNodeType;
    reason: string;
    startedAt: Date;
    durationSeconds: number;
  } | undefined;
  impacts: {
    recorders: number;
    cameras: number;
    storage: number;
    services: string[];
  };
  suppressedAlertsCount: number;
  lastUpdatedAt: Date;
}
