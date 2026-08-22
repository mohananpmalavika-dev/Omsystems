export type HealthState = "HEALTHY" | "UNHEALTHY" | "DEGRADED" | "WARNING" | "CRITICAL" | "OFFLINE" | "UNKNOWN" | "STALE" | "MAINTENANCE";

export interface BranchHealthProjection {
  branchId: string;
  branchCode: string;
  branchName: string;
  overallState: HealthState;

  internet: {
    state: HealthState;
    latencyMs?: number;
    provider?: string;
    lastVerifiedAt: string;
  };

  recorder: {
    healthy: number;
    unhealthy: number;
    unknown: number;
  };

  cameras: {
    total: number;
    healthy: number;
    unhealthy: number;
    unknown: number;
  };

  storage: {
    warning: number;
    critical: number;
  };

  recording: {
    compliant: number;
    nonCompliant: number;
  };

  retention: {
    minimumDays?: number;
    targetDays?: number;
    compliant: boolean | null;
  };

  alerts: {
    p1: number;
    p2: number;
    unacknowledged: number;
  };

  lastObservedAt: string;
}

export interface BranchDrilldownDetail {
  projection: BranchHealthProjection;
  devices: Array<{
    id: string;
    name: string;
    type: "RECORDER" | "CAMERA" | "ROUTER" | "SWITCH" | "STORAGE";
    state: HealthState;
    details: Record<string, unknown>;
  }>;
  activeAlerts: Array<{
    id: string;
    severity: "P1" | "P2" | "P3" | "P4";
    title: string;
    occurredAt: string;
  }>;
  rootCause?: {
    entityId: string;
    entityType: string;
    reason: string;
  };
}

export class BranchMosaicService {
  private readonly branchProjections = new Map<string, BranchHealthProjection>();


  /**
   * Returns all 400 branch health projections in a single request.
   */
  async getMosaicProjections(tenantId?: string): Promise<{
    branches: BranchHealthProjection[];
    summary: {
      totalBranches: number;
      healthyBranches: number;
      unhealthyBranches: number;
      unknownBranches: number;
      activeP1Alerts: number;
      activeP2Alerts: number;
    };
    queryDurationMs: number;
  }> {
    const start = performance.now();
    const branches = Array.from(this.branchProjections.values());

    const summary = {
      totalBranches: branches.length,
      healthyBranches: branches.filter((b) => b.overallState === "HEALTHY").length,
      unhealthyBranches: branches.filter((b) => b.overallState === "UNHEALTHY").length,
      unknownBranches: branches.filter((b) => b.overallState === "UNKNOWN" || b.overallState === "STALE").length,
      activeP1Alerts: branches.reduce((acc, b) => acc + b.alerts.p1, 0),
      activeP2Alerts: branches.reduce((acc, b) => acc + b.alerts.p2, 0),
    };

    const duration = performance.now() - start;

    return {
      branches,
      summary,
      queryDurationMs: Number(duration.toFixed(2)),
    };
  }

  /**
   * One-click drilldown into a single branch.
   */
  async getBranchDrilldown(branchId: string): Promise<BranchDrilldownDetail | undefined> {
    const projection = this.branchProjections.get(branchId);
    if (!projection) return undefined;
    return {
      projection,
      devices: [],
      activeAlerts: [],
    };
  }
}

export const branchMosaicService = new BranchMosaicService();
