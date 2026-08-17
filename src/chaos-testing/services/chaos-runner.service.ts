import { randomUUID } from "node:crypto";
import type {
  ChaosExperimentConfig,
  ChaosExperimentReport,
  ChaosMatrixSummary,
  ChaosScenarioType,
} from "../domain/chaos-engine.types.js";
import { faultInjectorService, FaultInjectorService } from "../engine/fault-injector.service.js";
import { resiliencyAssessorService, ResiliencyAssessorService } from "../engine/resiliency-assessor.service.js";

export class ChaosRunnerService {
  private readonly injector: FaultInjectorService;
  private readonly assessor: ResiliencyAssessorService;
  private readonly reports = new Map<string, ChaosExperimentReport>();
  private readonly matrixRuns = new Map<string, ChaosMatrixSummary>();

  constructor() {
    this.injector = faultInjectorService;
    this.assessor = resiliencyAssessorService;
  }

  /**
   * Runs a single chaos experiment and asserts all 6 recovery guarantees.
   */
  async runExperiment(config: ChaosExperimentConfig): Promise<ChaosExperimentReport> {
    const rawReport = await this.injector.executeScenario(config);
    const assessment = this.assessor.assessExperiment(rawReport);

    const finalizedReport: ChaosExperimentReport = {
      ...rawReport,
      status: assessment.passed ? "PASSED" : "FAILED",
    };

    this.reports.set(finalizedReport.experimentId, finalizedReport);
    return finalizedReport;
  }

  /**
   * Runs the full automated 13-scenario chaos test matrix.
   */
  async runFullChaosMatrix(branchId = "BR-118"): Promise<ChaosMatrixSummary> {
    const scenarios: ChaosScenarioType[] = [
      "KILL_RECORDING_SERVICE",
      "KILL_REDIS",
      "KILL_POSTGRES",
      "DISCONNECT_CAMERA",
      "CHANGE_CAMERA_PASSWORD",
      "REBOOT_NVR",
      "FILL_DISK",
      "REMOVE_STORAGE",
      "ADD_PACKET_LOSS",
      "ADD_LATENCY",
      "DISCONNECT_BRANCH_WAN",
      "CORRUPT_SEGMENT",
      "KILL_MEDIA_SERVER",
    ];

    const reports: ChaosExperimentReport[] = [];
    let totalLostSeconds = 0;
    let maxLostSeconds = 0;
    let p1Alerts = 0;
    let incidents = 0;
    let scoreSum = 0;

    for (const scenario of scenarios) {
      const targetId = this.getDefaultTargetForScenario(scenario, branchId);
      const config: ChaosExperimentConfig = {
        scenario,
        targetId,
        branchId,
        durationSeconds: 5,
        parameters: this.getDefaultParametersForScenario(scenario),
      };

      const report = await this.runExperiment(config);
      reports.push(report);

      totalLostSeconds += report.assertions.secondsLost;
      if (report.assertions.secondsLost > maxLostSeconds) {
        maxLostSeconds = report.assertions.secondsLost;
      }
      if (report.assertions.alertSeverity === "P1") {
        p1Alerts++;
      }
      if (report.assertions.wasIncidentRecorded) {
        incidents++;
      }
      scoreSum += report.resilienceScore;
    }

    const passedCount = reports.filter((r) => r.status === "PASSED").length;
    const failedCount = reports.length - passedCount;
    const overallResilienceScore = Math.round(scoreSum / reports.length);

    const matrixSummary: ChaosMatrixSummary = {
      matrixRunId: `matrix-run-${randomUUID().slice(0, 8)}`,
      executedAt: new Date().toISOString(),
      totalScenarios: scenarios.length,
      passedCount,
      failedCount,
      overallResilienceScore,
      totalDowntimeSeconds: Number(totalLostSeconds.toFixed(2)),
      maxDowntimeSeconds: Number(maxLostSeconds.toFixed(2)),
      p1AlertsTriggeredCount: p1Alerts,
      incidentsCreatedCount: incidents,
      reports,
    };

    this.matrixRuns.set(matrixSummary.matrixRunId, matrixSummary);
    return matrixSummary;
  }

  getReport(experimentId: string): ChaosExperimentReport | null {
    return this.reports.get(experimentId) || null;
  }

  listReports(limit = 50): ChaosExperimentReport[] {
    return Array.from(this.reports.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  getLatestMatrixSummary(): ChaosMatrixSummary | null {
    const list = Array.from(this.matrixRuns.values());
    if (list.length === 0) return null;
    return list[list.length - 1] || null;
  }

  getSupportedScenarios(): Array<{
    scenario: ChaosScenarioType;
    name: string;
    description: string;
    targetType: string;
  }> {
    return [
      {
        scenario: "KILL_RECORDING_SERVICE",
        name: "Kill Recording Service",
        description: "Simulates recorder worker SIGKILL / process crash and validates supervisor auto-restart & ring buffer drain.",
        targetType: "SERVICE",
      },
      {
        scenario: "KILL_REDIS",
        name: "Kill Redis Broker",
        description: "Simulates Redis cache & PubSub outage and validates in-memory queue fallback with zero event loss.",
        targetType: "DATABASE",
      },
      {
        scenario: "KILL_POSTGRES",
        name: "Kill PostgreSQL Control Plane",
        description: "Simulates primary database disconnection and validates read-only replica + SQLite outbox spooling.",
        targetType: "DATABASE",
      },
      {
        scenario: "DISCONNECT_CAMERA",
        name: "Disconnect Camera",
        description: "Simulates RTSP stream loss / PoE drop and validates P1 video loss alarm generation and work order ticket creation.",
        targetType: "CAMERA",
      },
      {
        scenario: "CHANGE_CAMERA_PASSWORD",
        name: "Change Camera Password",
        description: "Simulates HTTP 401 Unauthorized credential drift and validates automated key reconciliation from secret vault.",
        targetType: "CAMERA",
      },
      {
        scenario: "REBOOT_NVR",
        name: "Reboot Hardware NVR",
        description: "Simulates 60s NVR power cycle and validates seamless direct recording takeover by Sentinel Edge Gateway.",
        targetType: "RECORDER",
      },
      {
        scenario: "FILL_DISK",
        name: "Fill Disk (100% Full)",
        description: "Simulates ENOSPC storage condition and validates automated FIFO purge & secondary disk redirection.",
        targetType: "STORAGE",
      },
      {
        scenario: "REMOVE_STORAGE",
        name: "Remove Storage Target",
        description: "Simulates NAS/S3 volume unmount and validates dynamic write failover to hot-standby storage pool.",
        targetType: "STORAGE",
      },
      {
        scenario: "ADD_PACKET_LOSS",
        name: "Add Packet Loss (30%)",
        description: "Simulates network packet drop and validates dynamic Adaptive Bitrate (ABR) step-down without video loss.",
        targetType: "NETWORK",
      },
      {
        scenario: "ADD_LATENCY",
        name: "Add Network Latency (1500ms)",
        description: "Simulates high WAN delay and validates dynamic jitter buffer expansion to prevent playback underrun.",
        targetType: "NETWORK",
      },
      {
        scenario: "DISCONNECT_BRANCH_WAN",
        name: "Disconnect Branch WAN Uplink",
        description: "Simulates total branch internet isolation and validates autonomous local edge recording & SQLite spooling.",
        targetType: "BRANCH",
      },
      {
        scenario: "CORRUPT_SEGMENT",
        name: "Corrupt Video Segment",
        description: "Simulates damaged MP4 container and validates forensic index reconstruction & keyframe playback fallback.",
        targetType: "MEDIA",
      },
      {
        scenario: "KILL_MEDIA_SERVER",
        name: "Kill WebRTC Media Server",
        description: "Simulates live streaming gateway crash and validates instant client rebalancing to standby media server in <2s.",
        targetType: "SERVICE",
      },
    ];
  }

  private getDefaultTargetForScenario(scenario: ChaosScenarioType, branchId: string): string {
    switch (scenario) {
      case "KILL_RECORDING_SERVICE":
        return `recorder-worker-${branchId}`;
      case "KILL_REDIS":
        return "redis-cluster-primary";
      case "KILL_POSTGRES":
        return "postgres-control-plane-primary";
      case "DISCONNECT_CAMERA":
      case "CHANGE_CAMERA_PASSWORD":
        return `CAM-${branchId}-VAULT-01`;
      case "REBOOT_NVR":
        return `NVR-${branchId}-CORE-01`;
      case "FILL_DISK":
      case "REMOVE_STORAGE":
        return `/dev/sda1-nvr-pool-${branchId}`;
      case "ADD_PACKET_LOSS":
      case "ADD_LATENCY":
        return `net-if-wan-${branchId}`;
      case "DISCONNECT_BRANCH_WAN":
        return `branch-wan-uplink-${branchId}`;
      case "CORRUPT_SEGMENT":
        return `seg-${branchId}-vault-clip-001`;
      case "KILL_MEDIA_SERVER":
        return "webrtc-media-gateway-01";
    }
  }

  private getDefaultParametersForScenario(scenario: ChaosScenarioType): Record<string, unknown> {
    switch (scenario) {
      case "ADD_PACKET_LOSS":
        return { packetLossPercent: 30 };
      case "ADD_LATENCY":
        return { latencyMs: 1500 };
      case "FILL_DISK":
        return { diskUsagePercent: 100 };
      default:
        return {};
    }
  }
}

export const chaosRunnerService = new ChaosRunnerService();
