/**
 * Capacity Benchmark & SLO Performance Domain Contracts
 */

export type BenchmarkTier = "TIER_A" | "TIER_B" | "TIER_C";

export interface PerformanceSloBudget {
  healthIngestSustainedMin: number; // events/sec (>= 1000)
  healthIngestBurstMin: number; // events/sec (>= 5000)
  healthIngestApiP95Max: number; // ms (< 150)
  healthVisibilityP95Max: number; // ms (< 15000)
  branchSummaryApiP95Max: number; // ms (< 300)
  p1PopupP95Max: number; // ms (< 2000)
  websocketFanoutP95Max: number; // ms (< 1000)
  digitalTwinRcaP95Max: number; // ms (< 250)
  liveCameraStartupP95Max: number; // ms (< 5000)
  maxLostP1Alerts: number; // 0
  maxHealthErrorRatePct: number; // % (< 0.1)
}

export interface BenchmarkScenarioResult {
  scenarioId: string;
  name: string;
  throughputEventsPerSec: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  totalEvents: number;
  errorCount: number;
  errorRatePct: number;
  passedSlo: boolean;
  notes?: string | undefined;
}

export interface BenchmarkScorecard {
  tier: BenchmarkTier;
  runAt: Date;
  durationSeconds: number;
  monitoredBranches: number;
  monitoredCameras: number;
  totalMonitoredEntities: number;
  scenarios: BenchmarkScenarioResult[];
  overallPassed: boolean;
  sloBudget: PerformanceSloBudget;
  summary: {
    sustainedHealthThroughput: number;
    burstHealthThroughput: number;
    branchSummaryApiP95: number;
    p1DeliveryP95: number;
    websocketFanoutP95: number;
    digitalTwinRcaP95: number;
    alertReductionRatioPct: number;
    lostP1Alerts: number;
  };
}
