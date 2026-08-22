/**
 * Remote CCTV Infrastructure Operations & Technician Dispatch Minimization Domain Types
 */

export type DegradationSignalType =
  | 'RTSP_STREAM_FROZEN'
  | 'HIGH_PACKET_LOSS'
  | 'BITRATE_COLLAPSE'
  | 'POE_VOLTAGE_DROP'
  | 'DISK_WRITE_LATENCY_SPIKE'
  | 'SMART_BAD_SECTORS'
  | 'NTP_CLOCK_DRIFT'
  | 'ONVIF_AUTH_FAILURE'
  | 'PHYSICAL_LINK_DOWN'
  | 'OPTICAL_OCCLUSION_OR_DIRT';

export interface InfrastructureDegradationSignal {
  signalId: string;
  branchId: string;
  componentId: string;
  componentType: 'CAMERA' | 'POE_SWITCH' | 'STORAGE_DISK' | 'RECORDER' | 'NETWORK_ROUTER';
  signalType: DegradationSignalType;
  severity: 'WARNING' | 'CRITICAL';
  metrics: Record<string, number | string | boolean>;
  detectedAt: string;
}

export type RootCauseCategory =
  | 'CAMERA_FIRMWARE_LOCKUP'
  | 'ENCODER_BITRATE_SATURATION'
  | 'HDD_BAD_BLOCKS_DEGRADATION'
  | 'EXPIRED_ONVIF_CREDENTIALS'
  | 'NTP_DAEMON_DESYNCHRONIZATION'
  | 'LOCAL_SWITCH_POWER_OR_UPLINK_FAILURE'
  | 'PHYSICAL_CABLE_SEVERED'
  | 'HARDWARE_SENSOR_FAILURE'
  | 'DIRTY_LENS_OR_FOGGING';

export interface RootCauseDiagnosis {
  diagnosisId: string;
  branchId: string;
  componentId: string;
  componentName: string;
  category: RootCauseCategory;
  confidenceScore: number;
  narrative: string;
  canRemediateRemotely: boolean;
  recommendedAction: string;
  diagnosedAt: string;
}

export type RemediationActionType =
  | 'REMOTE_POE_POWER_CYCLE'
  | 'STREAM_RENEGOTIATE_OR_TRANSCODE'
  | 'STORAGE_TARGET_FAILOVER'
  | 'ONVIF_REAUTH_AND_CONFIG_PUSH'
  | 'FORCE_NTP_CLOCK_RESYNC'
  | 'RESTART_LOCAL_MEDIA_PIPELINE';

export interface RemoteRemediationResult {
  actionId: string;
  branchId: string;
  componentId: string;
  actionType: RemediationActionType;
  success: boolean;
  executionDurationMs: number;
  verifiedHealthStatus: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  resolutionSummary: string;
  dispatchedTechnicianNeeded: boolean;
  executedAt: string;
}

export interface SurgicalWorkOrder {
  workOrderId: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  physicalLocationInBranch: string; // e.g. "Ceiling above Cash Counter #2, Main Banking Hall"
  faultyComponentId: string;
  faultyComponentName: string;
  modelNumber: string;
  macAddress?: string;
  ipAddress?: string;
  requiredSpareParts: string[];
  diagnosticChecklist: string[];
  priority: 'EMERGENCY_P1' | 'HIGH' | 'NORMAL';
  estimatedRepairMinutes: number;
  reason: string;
  createdAt: string;
}

export interface FleetRoiMetrics {
  totalBranchesMonitored: number;
  totalIncidentsDetected: number;
  resolvedRemotelyCount: number;
  remoteResolutionRatePct: number;
  physicalTruckRollsAvoided: number;
  technicianCostPerVisitDollars: number;
  totalCostSavingsDollars: number;
  averageRemoteMttrSeconds: number;
  traditionalMttrHours: number;
  uptimeSlaPct: number;
}
