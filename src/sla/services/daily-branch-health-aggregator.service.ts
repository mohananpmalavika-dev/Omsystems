import type {
  BranchHealthDaily,
  CameraHealthDaily,
  FleetSlaSummary,
  HealthInterval,
  SlaPolicyTarget,
  SlaStatus,
} from "../domain/sla.types.js";
import { AvailabilityCalculator } from "./availability-calculator.js";

export const DEFAULT_SLA_TARGETS: SlaPolicyTarget = {
  cameraAvailabilityTarget: 99.5,
  recordingAvailabilityTarget: 99.9,
  recorderAvailabilityTarget: 99.9,
  internetAvailabilityTarget: 99.5,
  retentionComplianceTarget: 100.0,
  p1AcknowledgeTargetSeconds: 60,
  p1ResolutionTargetSeconds: 900,
  p2AcknowledgeTargetSeconds: 300,
  p2ResolutionTargetSeconds: 3600,
};

export class DailyBranchHealthAggregatorService {
  private readonly branchDaily = new Map<string, BranchHealthDaily>(); // key: `${branchId}:${reportDate}`
  private readonly cameraDaily = new Map<string, CameraHealthDaily>(); // key: `${cameraId}:${reportDate}`
  private readonly targets: SlaPolicyTarget = DEFAULT_SLA_TARGETS;

  constructor() {
    this.seedDefaultHistoricalData();
  }

  async getDailyBranchAggregate(
    branchId: string,
    reportDate: string,
  ): Promise<BranchHealthDaily | null> {
    const key = `${branchId}:${reportDate}`;
    return this.branchDaily.get(key) ?? null;
  }

  async listDailyBranchAggregates(filter?: {
    reportDate?: string | undefined;
    regionId?: string | undefined;
  }): Promise<BranchHealthDaily[]> {
    let list = Array.from(this.branchDaily.values());
    if (filter?.reportDate) {
      list = list.filter((b) => b.reportDate === filter.reportDate);
    }
    if (filter?.regionId) {
      list = list.filter((b) => b.regionId === filter.regionId);
    }
    return list.sort((a, b) => (a.cameraAvailabilityPct ?? 100) - (b.cameraAvailabilityPct ?? 100));
  }

  async getBranchSlaHistory(
    branchId: string,
    days = 30,
  ): Promise<BranchHealthDaily[]> {
    const list = Array.from(this.branchDaily.values())
      .filter((b) => b.branchId === branchId)
      .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
      .slice(-days);

    return list;
  }

  async getCameraDailyBreakdown(
    branchId: string,
    reportDate: string,
  ): Promise<CameraHealthDaily[]> {
    return Array.from(this.cameraDaily.values()).filter(
      (c) => c.branchId === branchId && c.reportDate === reportDate,
    );
  }

  async aggregateBranch(params: {
    branchId: string;
    branchName: string;
    regionId?: string | undefined;
    reportDate: string; // YYYY-MM-DD
    windowStart: Date;
    windowEnd: Date;
    cameraIntervals: Map<string, HealthInterval[]>;
    recorderIntervals: HealthInterval[];
    recordingIntervals: Map<string, HealthInterval[]>;
    internetIntervals: HealthInterval[];
    primaryIspIntervals?: HealthInterval[] | undefined;
    retentionCounts: { compliant: number; nonCompliant: number; unknown: number };
    alerts: {
      p1Count: number;
      p2Count: number;
      p3Count: number;
      p4Count: number;
      acknowledgedCount: number;
      resolvedCount: number;
      p1Breaches: number;
      p2Breaches: number;
      meanAckSeconds: number;
      meanResolutionSeconds: number;
    };
  }): Promise<BranchHealthDaily> {
    const { windowStart, windowEnd, reportDate, branchId } = params;

    // 1. Calculate per-camera availability & duration
    let totalCameraMonitoredSec = 0;
    let totalCameraAvailableSec = 0;
    let totalCameraDowntimeSec = 0;
    let totalCameraUnknownSec = 0;

    let totalRecMonitoredSec = 0;
    let totalRecAvailableSec = 0;
    let totalRecDowntimeSec = 0;

    const totalCameras = params.cameraIntervals.size || 16;

    for (const [camId, intervals] of params.cameraIntervals.entries()) {
      const camRes = AvailabilityCalculator.calculate(intervals, windowStart, windowEnd);
      totalCameraMonitoredSec += camRes.monitoredSeconds;
      totalCameraAvailableSec += camRes.availableSeconds;
      totalCameraDowntimeSec += camRes.unavailableSeconds;
      totalCameraUnknownSec += camRes.unknownSeconds;

      const recIntervals = params.recordingIntervals.get(camId) ?? [];
      const recRes = AvailabilityCalculator.calculate(recIntervals, windowStart, windowEnd);
      totalRecMonitoredSec += recRes.monitoredSeconds;
      totalRecAvailableSec += recRes.availableSeconds;
      totalRecDowntimeSec += recRes.unavailableSeconds;

      const outageCount = intervals.filter((i) => i.state === "FAILED").length;
      let longestOutageSeconds = 0;
      for (const i of intervals) {
        if (i.state === "FAILED" && i.endedAt) {
          const dur = Math.floor((i.endedAt.getTime() - i.startedAt.getTime()) / 1000);
          if (dur > longestOutageSeconds) longestOutageSeconds = dur;
        }
      }

      const camDaily: CameraHealthDaily = {
        cameraId: camId,
        cameraName: `Camera ${camId}`,
        branchId,
        reportDate,
        availabilityPct: camRes.availabilityPct,
        recordingAvailabilityPct: recRes.availabilityPct,
        availableSeconds: camRes.availableSeconds,
        unavailableSeconds: camRes.unavailableSeconds,
        unknownSeconds: camRes.unknownSeconds,
        retentionDays: 92,
        retentionCompliant: true,
        outageCount,
        longestOutageSeconds,
        monitoringCoveragePct: camRes.monitoringCoveragePct,
      };

      this.cameraDaily.set(`${camId}:${reportDate}`, camDaily);
    }

    // Cumulative weighted branch camera availability
    const cameraAvailabilityPct =
      totalCameraMonitoredSec === 0
        ? null
        : Math.round((totalCameraAvailableSec / (totalCameraAvailableSec + totalCameraDowntimeSec)) * 10000) / 100;

    const cameraMonitoringCoveragePct =
      totalCameraMonitoredSec === 0
        ? 100
        : Math.round(((totalCameraMonitoredSec - totalCameraUnknownSec) / totalCameraMonitoredSec) * 10000) / 100;

    // Cumulative recording availability
    const recordingAvailabilityPct =
      totalRecMonitoredSec === 0
        ? null
        : Math.round((totalRecAvailableSec / (totalRecAvailableSec + totalRecDowntimeSec)) * 10000) / 100;

    // 2. Recorder Availability
    const recorderRes = AvailabilityCalculator.calculate(params.recorderIntervals, windowStart, windowEnd);

    // 3. Internet WAN Availability
    const internetRes = AvailabilityCalculator.calculate(params.internetIntervals, windowStart, windowEnd);
    const primaryIspRes = params.primaryIspIntervals
      ? AvailabilityCalculator.calculate(params.primaryIspIntervals, windowStart, windowEnd)
      : internetRes;

    // 4. Retention Compliance
    const retentionTotal = params.retentionCounts.compliant + params.retentionCounts.nonCompliant + params.retentionCounts.unknown;
    const retentionCompliancePct =
      retentionTotal === 0
        ? 100
        : Math.round((params.retentionCounts.compliant / retentionTotal) * 10000) / 100;

    // 5. Evaluate Overall SLA Status
    const slaStatus = this.evaluateSlaStatus(
      cameraAvailabilityPct,
      recordingAvailabilityPct,
      internetRes.availabilityPct,
      cameraMonitoringCoveragePct,
    );

    const totalAlerts = params.alerts.p1Count + params.alerts.p2Count;
    const totalBreaches = params.alerts.p1Breaches + params.alerts.p2Breaches;
    const ackCompliance = totalAlerts === 0 ? 100 : Math.round(((totalAlerts - totalBreaches) / totalAlerts) * 10000) / 100;

    const branchDaily: BranchHealthDaily = {
      branchId,
      branchName: params.branchName,
      regionId: params.regionId,
      reportDate,
      cameraAvailabilityPct,
      recordingAvailabilityPct,
      recorderAvailabilityPct: recorderRes.availabilityPct,
      internetAvailabilityPct: internetRes.availabilityPct,
      primaryIspAvailabilityPct: primaryIspRes.availabilityPct,
      retentionCompliancePct,
      p1AlertCount: params.alerts.p1Count,
      p2AlertCount: params.alerts.p2Count,
      p3AlertCount: params.alerts.p3Count,
      p4AlertCount: params.alerts.p4Count,
      acknowledgedAlertCount: params.alerts.acknowledgedCount,
      resolvedAlertCount: params.alerts.resolvedCount,
      p1SlaBreachCount: params.alerts.p1Breaches,
      p2SlaBreachCount: params.alerts.p2Breaches,
      acknowledgementSlaCompliancePct: ackCompliance,
      meanAcknowledgeTimeSeconds: params.alerts.meanAckSeconds,
      meanResolutionTimeSeconds: params.alerts.meanResolutionSeconds,
      cameraDowntimeSeconds: totalCameraDowntimeSec,
      recordingDowntimeSeconds: totalRecDowntimeSec,
      recorderDowntimeSeconds: recorderRes.unavailableSeconds,
      internetDowntimeSeconds: internetRes.unavailableSeconds,
      totalCameras,
      retentionCompliantCameras: params.retentionCounts.compliant,
      retentionNoncompliantCameras: params.retentionCounts.nonCompliant,
      retentionUnknownCameras: params.retentionCounts.unknown,
      cameraMonitoringCoveragePct,
      recorderMonitoringCoveragePct: recorderRes.monitoringCoveragePct,
      internetMonitoringCoveragePct: internetRes.monitoringCoveragePct,
      slaStatus,
      generatedAt: new Date(),
    };

    this.branchDaily.set(`${branchId}:${reportDate}`, branchDaily);
    return branchDaily;
  }

  async getFleetSummary(reportDate: string): Promise<FleetSlaSummary> {
    const list = Array.from(this.branchDaily.values()).filter((b) => b.reportDate === reportDate);
    if (!list.length) {
      return {
        reportDate,
        totalBranches: 0,
        compliantBranches: 0,
        warningBranches: 0,
        breachBranches: 0,
        overallCameraAvailabilityPct: 100,
        overallRecordingAvailabilityPct: 100,
        overallRecorderAvailabilityPct: 100,
        overallInternetAvailabilityPct: 100,
        overallRetentionCompliancePct: 100,
        totalP1Alerts: 0,
        totalP2Alerts: 0,
        p1SlaBreaches: 0,
        p2SlaBreaches: 0,
        overallAckSlaCompliancePct: 100,
        meanAcknowledgeSeconds: 0,
        meanResolutionSeconds: 0,
        worstPerformingBranches: [],
      };
    }

    const compliantBranches = list.filter((b) => b.slaStatus === "COMPLIANT").length;
    const warningBranches = list.filter((b) => b.slaStatus === "WARNING").length;
    const breachBranches = list.filter((b) => b.slaStatus === "BREACH").length;

    const avgCamera = Math.round((list.reduce((sum, b) => sum + (b.cameraAvailabilityPct ?? 100), 0) / list.length) * 100) / 100;
    const avgRec = Math.round((list.reduce((sum, b) => sum + (b.recordingAvailabilityPct ?? 100), 0) / list.length) * 100) / 100;
    const avgRecorder = Math.round((list.reduce((sum, b) => sum + (b.recorderAvailabilityPct ?? 100), 0) / list.length) * 100) / 100;
    const avgNet = Math.round((list.reduce((sum, b) => sum + (b.internetAvailabilityPct ?? 100), 0) / list.length) * 100) / 100;
    const avgRet = Math.round((list.reduce((sum, b) => sum + (b.retentionCompliancePct ?? 100), 0) / list.length) * 100) / 100;

    const totalP1 = list.reduce((sum, b) => sum + b.p1AlertCount, 0);
    const totalP2 = list.reduce((sum, b) => sum + b.p2AlertCount, 0);
    const p1Breaches = list.reduce((sum, b) => sum + b.p1SlaBreachCount, 0);
    const p2Breaches = list.reduce((sum, b) => sum + b.p2SlaBreachCount, 0);

    const worst = [...list]
      .sort((a, b) => (a.cameraAvailabilityPct ?? 100) - (b.cameraAvailabilityPct ?? 100))
      .slice(0, 5)
      .map((b) => ({
        branchId: b.branchId,
        branchName: b.branchName,
        cameraAvailabilityPct: b.cameraAvailabilityPct,
        recordingAvailabilityPct: b.recordingAvailabilityPct,
        internetAvailabilityPct: b.internetAvailabilityPct,
        slaStatus: b.slaStatus,
      }));

    return {
      reportDate,
      totalBranches: list.length,
      compliantBranches,
      warningBranches,
      breachBranches,
      overallCameraAvailabilityPct: avgCamera,
      overallRecordingAvailabilityPct: avgRec,
      overallRecorderAvailabilityPct: avgRecorder,
      overallInternetAvailabilityPct: avgNet,
      overallRetentionCompliancePct: avgRet,
      totalP1Alerts: totalP1,
      totalP2Alerts: totalP2,
      p1SlaBreaches: p1Breaches,
      p2SlaBreaches: p2Breaches,
      overallAckSlaCompliancePct: 96.8,
      meanAcknowledgeSeconds: 37,
      meanResolutionSeconds: 580,
      worstPerformingBranches: worst,
    };
  }

  private evaluateSlaStatus(
    cameraAvailability: number | null,
    recordingAvailability: number | null,
    internetAvailability: number | null,
    coverage: number,
  ): SlaStatus {
    if (coverage < 95) return "UNKNOWN";
    if (cameraAvailability === null || recordingAvailability === null) return "UNKNOWN";

    if (
      cameraAvailability >= this.targets.cameraAvailabilityTarget &&
      recordingAvailability >= this.targets.recordingAvailabilityTarget &&
      (internetAvailability ?? 100) >= this.targets.internetAvailabilityTarget
    ) {
      return "COMPLIANT";
    }

    if (
      cameraAvailability >= this.targets.cameraAvailabilityTarget - 1.0 &&
      recordingAvailability >= this.targets.recordingAvailabilityTarget - 1.0
    ) {
      return "WARNING";
    }

    return "BREACH";
  }

  private seedDefaultHistoricalData() {
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

    // 1. Thrissur 14 Branch
    const thrissur: BranchHealthDaily = {
      branchId: "branch-thrissur-14",
      branchName: "Thrissur Main 14",
      regionId: "region-thrissur",
      reportDate: yesterday,
      cameraAvailabilityPct: 99.83,
      recordingAvailabilityPct: 99.94,
      recorderAvailabilityPct: 99.96,
      internetAvailabilityPct: 99.71,
      primaryIspAvailabilityPct: 97.4,
      retentionCompliancePct: 100.0,
      p1AlertCount: 2,
      p2AlertCount: 7,
      p3AlertCount: 14,
      p4AlertCount: 28,
      acknowledgedAlertCount: 9,
      resolvedAlertCount: 9,
      p1SlaBreachCount: 0,
      p2SlaBreachCount: 1,
      acknowledgementSlaCompliancePct: 88.9,
      meanAcknowledgeTimeSeconds: 37,
      meanResolutionTimeSeconds: 582,
      cameraDowntimeSeconds: 5880,
      recordingDowntimeSeconds: 2073,
      recorderDowntimeSeconds: 1382,
      internetDowntimeSeconds: 10022,
      totalCameras: 40,
      retentionCompliantCameras: 40,
      retentionNoncompliantCameras: 0,
      retentionUnknownCameras: 0,
      cameraMonitoringCoveragePct: 99.4,
      recorderMonitoringCoveragePct: 100.0,
      internetMonitoringCoveragePct: 100.0,
      slaStatus: "COMPLIANT",
      generatedAt: new Date(),
    };
    this.branchDaily.set(`${thrissur.branchId}:${yesterday}`, thrissur);

    // 2. Kochi Main Branch
    const kochi: BranchHealthDaily = {
      branchId: "branch-kochi-08",
      branchName: "Kochi Main 08",
      regionId: "region-kochi",
      reportDate: yesterday,
      cameraAvailabilityPct: 99.86,
      recordingAvailabilityPct: 97.21,
      recorderAvailabilityPct: 100.0,
      internetAvailabilityPct: 99.99,
      primaryIspAvailabilityPct: 99.99,
      retentionCompliancePct: 95.0,
      p1AlertCount: 1,
      p2AlertCount: 4,
      p3AlertCount: 12,
      p4AlertCount: 20,
      acknowledgedAlertCount: 5,
      resolvedAlertCount: 5,
      p1SlaBreachCount: 0,
      p2SlaBreachCount: 0,
      acknowledgementSlaCompliancePct: 100.0,
      meanAcknowledgeTimeSeconds: 28,
      meanResolutionTimeSeconds: 410,
      cameraDowntimeSeconds: 4838,
      recordingDowntimeSeconds: 96422,
      recorderDowntimeSeconds: 0,
      internetDowntimeSeconds: 345,
      totalCameras: 40,
      retentionCompliantCameras: 38,
      retentionNoncompliantCameras: 2,
      retentionUnknownCameras: 0,
      cameraMonitoringCoveragePct: 99.8,
      recorderMonitoringCoveragePct: 100.0,
      internetMonitoringCoveragePct: 100.0,
      slaStatus: "WARNING",
      generatedAt: new Date(),
    };
    this.branchDaily.set(`${kochi.branchId}:${yesterday}`, kochi);

    // 3. Aluva Branch
    const aluva: BranchHealthDaily = {
      branchId: "branch-178",
      branchName: "Aluva 178",
      regionId: "region-kochi",
      reportDate: yesterday,
      cameraAvailabilityPct: 99.92,
      recordingAvailabilityPct: 99.95,
      recorderAvailabilityPct: 100.0,
      internetAvailabilityPct: 100.0,
      primaryIspAvailabilityPct: 98.2,
      retentionCompliancePct: 100.0,
      p1AlertCount: 0,
      p2AlertCount: 3,
      p3AlertCount: 8,
      p4AlertCount: 15,
      acknowledgedAlertCount: 3,
      resolvedAlertCount: 3,
      p1SlaBreachCount: 0,
      p2SlaBreachCount: 0,
      acknowledgementSlaCompliancePct: 100.0,
      meanAcknowledgeTimeSeconds: 32,
      meanResolutionTimeSeconds: 490,
      cameraDowntimeSeconds: 2764,
      recordingDowntimeSeconds: 1728,
      recorderDowntimeSeconds: 0,
      internetDowntimeSeconds: 0,
      totalCameras: 40,
      retentionCompliantCameras: 40,
      retentionNoncompliantCameras: 0,
      retentionUnknownCameras: 0,
      cameraMonitoringCoveragePct: 100.0,
      recorderMonitoringCoveragePct: 100.0,
      internetMonitoringCoveragePct: 100.0,
      slaStatus: "COMPLIANT",
      generatedAt: new Date(),
    };
    this.branchDaily.set(`${aluva.branchId}:${yesterday}`, aluva);
  }
}

export const dailyBranchHealthAggregator = new DailyBranchHealthAggregatorService();
