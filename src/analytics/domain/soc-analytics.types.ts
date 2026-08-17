/**
 * SOC Analytics & Operator Performance Domain Types
 */

export interface OperatorSlaMetrics {
  operatorId: string;
  operatorName: string;
  totalIncidentsHandled: number;
  p1Count: number;
  p2Count: number;
  mttaSeconds: number; // Mean Time to Acknowledge
  mttiSeconds: number; // Mean Time to Investigate
  mttrSeconds: number; // Mean Time to Resolve
  escalationRatePercent: number;
  falsePositiveRatePercent: number;
  sopComplianceRatePercent: number;
  slaBreachesCount: number;
}

export interface BranchPerformanceMetrics {
  branchId: string;
  region: string;
  totalIncidents: number;
  p1Count: number;
  p2Count: number;
  mttaSeconds: number;
  mttrSeconds: number;
  repeatIncidentRatePercent: number;
  unacknowledgedBreaches: number;
}

export interface SocAnalyticsDashboardSummary {
  period: string;
  totalIncidents: number;
  fleetMttaSeconds: number;
  fleetMttiSeconds: number;
  fleetMttrSeconds: number;
  slaCompliancePercent: number;
  escalationRatePercent: number;
  falsePositiveRatePercent: number;
  byShift: {
    morningShift: { incidents: number; mttaSec: number; compliance: number };
    eveningShift: { incidents: number; mttaSec: number; compliance: number };
    nightShift: { incidents: number; mttaSec: number; compliance: number };
  };
  operators: OperatorSlaMetrics[];
  branches: BranchPerformanceMetrics[];
}
