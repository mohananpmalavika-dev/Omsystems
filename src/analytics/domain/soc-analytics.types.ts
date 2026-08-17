/**
 * SOC Analytics & Operator Performance Domain Types (Genetec Mission Control Parity)
 * Multi-dimensional SLA, MTTA/MTTI/MTTR, escalation, and compliance metrics.
 */

export type ShiftType = 'MORNING' | 'EVENING' | 'NIGHT';

export type AlertCategoryType =
  | 'VAULT_INTRUSION'
  | 'LINE_CROSSING'
  | 'CROWD_LOITERING'
  | 'CAMERA_TAMPER'
  | 'ANPR_BLACKLIST'
  | 'CASH_VAN_DELAY'
  | 'RECORDER_OFFLINE'
  | 'CAMERA_OFFLINE'
  | 'UNAUTHORIZED_ACCESS';

export interface BaseSlaMetrics {
  totalIncidents: number;
  p1Count: number;
  p2Count: number;
  p3Count: number;
  mttaSeconds: number; // Mean Time to Acknowledge
  mttiSeconds: number; // Mean Time to Investigate
  mttrSeconds: number; // Mean Time to Resolve
  escalationRatePercent: number;
  falsePositiveRatePercent: number;
  repeatIncidentRatePercent: number;
  unacknowledgedSlaBreaches: number;
  slaCompliancePercent: number;
  sopComplianceRatePercent: number;
}

export interface OperatorSlaMetrics extends BaseSlaMetrics {
  operatorId: string;
  operatorName: string;
  role: 'SOC_OPERATOR' | 'SOC_SUPERVISOR' | 'CHIEF_SECURITY_OFFICER';
  totalIncidentsHandled: number;
  averageHandlingTimeSeconds: number;
}

export interface BranchPerformanceMetrics extends BaseSlaMetrics {
  branchId: string;
  branchName: string;
  regionId: string;
  stateId: string;
}

export interface RegionPerformanceMetrics extends BaseSlaMetrics {
  regionId: string;
  regionName: string;
  stateId: string;
  totalBranches: number;
}

export interface ShiftPerformanceMetrics extends BaseSlaMetrics {
  shift: ShiftType;
  shiftName: string;
  startTime: string;
  endTime: string;
  activeOperatorsCount: number;
}

export interface AlertTypePerformanceMetrics extends BaseSlaMetrics {
  alertType: AlertCategoryType;
  alertTypeName: string;
  requiresQrtDispatch: boolean;
}

export interface IncidentLifecycleRecord {
  incidentId: string;
  priority: 'P1' | 'P2' | 'P3';
  alertType: AlertCategoryType;
  branchId: string;
  regionId: string;
  stateId: string;
  operatorId: string;
  shift: ShiftType;
  triggeredAt: Date;
  acknowledgedAt?: Date;
  investigationStartedAt?: Date;
  resolvedAt?: Date;
  isEscalated: boolean;
  isFalsePositive: boolean;
  isRepeatIncident: boolean;
  isSlaBreached: boolean;
  isSopCompliant: boolean;
}

export interface SocAnalyticsDashboardSummary {
  period: string;
  generatedAt: Date;
  fleetSummary: BaseSlaMetrics;
  byBranch: BranchPerformanceMetrics[];
  byRegion: RegionPerformanceMetrics[];
  byOperator: OperatorSlaMetrics[];
  byShift: ShiftPerformanceMetrics[];
  byAlertType: AlertTypePerformanceMetrics[];
}

export interface SocAnalyticsFilter {
  branchId?: string;
  regionId?: string;
  operatorId?: string;
  shift?: ShiftType;
  alertType?: AlertCategoryType;
  priority?: 'P1' | 'P2' | 'P3';
  startDate?: string;
  endDate?: string;
}
