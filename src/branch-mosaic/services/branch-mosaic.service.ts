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

  constructor() {
    this.init400Branches();
  }

  private init400Branches(): void {
    const now = new Date().toISOString();
    for (let i = 1; i <= 400; i++) {
      const code = `BR-${String(i).padStart(3, "0")}`;
      const isBr88 = code === "BR-088";
      const isUnhealthy = isBr88 || i === 150 || i === 220;

      const projection: BranchHealthProjection = {
        branchId: code,
        branchCode: code,
        branchName: isBr88 ? "Branch 088 (Aluva Industrial)" : `Branch ${String(i).padStart(3, "0")}`,
        overallState: isUnhealthy ? "UNHEALTHY" : "HEALTHY",
        internet: {
          state: isBr88 ? "CRITICAL" : "HEALTHY",
          latencyMs: isBr88 ? 320 : 15 + (i % 20),
          provider: "Tata Communications",
          lastVerifiedAt: now,
        },
        recorder: {
          healthy: isUnhealthy ? 0 : 1,
          unhealthy: isUnhealthy ? 1 : 0,
          unknown: 0,
        },
        cameras: {
          total: 16,
          healthy: isUnhealthy ? 12 : 16,
          unhealthy: isUnhealthy ? 4 : 0,
          unknown: 0,
        },
        storage: {
          warning: 0,
          critical: 0,
        },
        recording: {
          compliant: isUnhealthy ? 12 : 16,
          nonCompliant: isUnhealthy ? 4 : 0,
        },
        retention: {
          minimumDays: 90,
          targetDays: 90,
          compliant: !isUnhealthy,
        },
        alerts: {
          p1: isBr88 ? 1 : 0,
          p2: isUnhealthy ? 1 : 0,
          unacknowledged: isUnhealthy ? 1 : 0,
        },
        lastObservedAt: now,
      };

      this.branchProjections.set(code, projection);
    }
  }


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
    const isBr88 = branchId === "BR-088";
    return {
      projection,
      devices: [
        {
          id: `DVR-${branchId}-01`,
          name: "Main Recorder (CP PLUS 16CH)",
          type: "RECORDER",
          state: isBr88 ? "UNHEALTHY" : "HEALTHY",
          details: { channelCount: 16, vendor: "CP_PLUS" },
        },
        {
          id: `CAM-${branchId}-01`,
          name: "Entrance Main",
          type: "CAMERA",
          state: "HEALTHY",
          details: { resolution: "4K", fps: 25 },
        },
        {
          id: `CAM-${branchId}-02`,
          name: "Lobby Cash Counter",
          type: "CAMERA",
          state: "HEALTHY",
          details: { resolution: "1080p", fps: 25 },
        },
      ],
      activeAlerts: isBr88
        ? [
            {
              id: `ALT-${branchId}-01`,
              severity: "P1",
              title: "Primary WAN interface carrier loss",
              occurredAt: projection.lastObservedAt,
            },
          ]
        : [],
      rootCause: isBr88
        ? {
            entityId: `WAN-${branchId}-01`,
            entityType: "INTERNET",
            reason: "Primary fiber link down, packet loss 100%",
          }
        : undefined,
    };
  }
}

export const branchMosaicService = new BranchMosaicService();
