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
    this.seed400BranchProjections();
  }

  /**
   * Pre-seeds and maintains 400 branches for instant sub-millisecond retrieval.
   */
  seed400BranchProjections(count: number = 400) {
    const now = new Date().toISOString();
    for (let i = 1; i <= count; i++) {
      const branchId = `BR-${i.toString().padStart(3, "0")}`;
      const isCritical = i === 88; // Branch 88 simulated outage
      const isDegraded = i === 118; // Branch 118 storage/gap warning

      const projection: BranchHealthProjection = {
        branchId,
        branchCode: `BR${i}`,
        branchName: `Branch ${i} - ${i % 2 === 0 ? "South" : "North"} Zone`,
        overallState: isCritical ? "UNHEALTHY" : isDegraded ? "UNHEALTHY" : "HEALTHY",
        internet: {
          state: isCritical ? "UNHEALTHY" : "HEALTHY",
          latencyMs: isCritical ? undefined : 18 + (i % 10),
          provider: i % 2 === 0 ? "Airtel Enterprise" : "Tata Communications",
          lastVerifiedAt: now,
        },
        recorder: {
          healthy: isCritical ? 0 : 2,
          unhealthy: isCritical ? 2 : 0,
          unknown: 0,
        },
        cameras: {
          total: 16,
          healthy: isCritical ? 0 : isDegraded ? 14 : 16,
          unhealthy: isCritical ? 0 : isDegraded ? 2 : 0,
          unknown: isCritical ? 16 : 0,
        },
        storage: {
          warning: isDegraded ? 1 : 0,
          critical: 0,
        },
        recording: {
          compliant: isCritical ? 0 : isDegraded ? 14 : 16,
          nonCompliant: isCritical ? 16 : isDegraded ? 2 : 0,
        },
        retention: {
          minimumDays: isCritical ? undefined : isDegraded ? 74.5 : 92.5,
          targetDays: 90,
          compliant: isCritical ? null : isDegraded ? false : true,
        },
        alerts: {
          p1: isCritical ? 1 : 0,
          p2: isDegraded ? 1 : 0,
          unacknowledged: isCritical ? 1 : isDegraded ? 1 : 0,
        },
        lastObservedAt: now,
      };

      this.branchProjections.set(branchId, projection);
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

    return {
      projection,
      devices: [
        {
          id: `${branchId}-DVR-01`,
          name: "Main Branch DVR-01 (CP PLUS)",
          type: "RECORDER",
          state: projection.recorder.unhealthy > 0 ? "UNHEALTHY" : "HEALTHY",
          details: { model: "CP-UNR-4K4322-V2", firmware: "4.120.0000000.2.R", storage: "2 x 4TB Purple" },
        },
        {
          id: `${branchId}-CAM-01`,
          name: "Main Entrance",
          type: "CAMERA",
          state: projection.overallState === "UNHEALTHY" ? "UNKNOWN" : "HEALTHY",
          details: { channel: 1, resolution: "1080p", fps: 25, recording: true },
        },
        {
          id: `${branchId}-CAM-02`,
          name: "Cash Counter",
          type: "CAMERA",
          state: projection.overallState === "UNHEALTHY" ? "UNKNOWN" : "HEALTHY",
          details: { channel: 2, resolution: "1080p", fps: 25, recording: true },
        },
      ],
      activeAlerts:
        projection.alerts.p1 > 0
          ? [
              {
                id: `alert-${branchId}-01`,
                severity: "P1",
                title: "Branch Internet Connectivity Outage",
                occurredAt: projection.lastObservedAt,
              },
            ]
          : [],
      rootCause:
        projection.branchId === "BR-088"
          ? {
              entityId: "WAN-BR88",
              entityType: "INTERNET",
              reason: "Primary Airtel WAN connection dropped, LTE backup failed handshake",
            }
          : undefined,
    };
  }
}

export const branchMosaicService = new BranchMosaicService();
