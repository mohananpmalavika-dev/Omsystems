/**
 * Core Types & Data Contracts for Crowd Density & Queue Length Detection (analytics.crowd)
 */

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ZoneType =
  | 'branch_hall'
  | 'waiting_lounge'
  | 'atm_vestibule'
  | 'teller_area'
  | 'kiosk_zone'
  | 'entrance_foyer'
  | 'corridor';

export type DensityLevel =
  | 'empty'
  | 'sparse'
  | 'normal'
  | 'crowded'
  | 'overcrowded'
  | 'dangerous';

export type TrendDirection =
  | 'increasing'
  | 'decreasing'
  | 'stable';

export type CounterType =
  | 'cash_deposit'
  | 'cash_withdrawal'
  | 'general_teller'
  | 'forex_remittance'
  | 'loan_desk'
  | 'account_services'
  | 'customer_support';

export type CrowdIncidentType =
  | 'crowd_density_exceeded'
  | 'queue_length_exceeded'
  | 'wait_time_sla_breach'
  | 'unattended_counter_with_queue'
  | 'stampede_risk_bottleneck';

export type IncidentSeverity = 'P1' | 'P2' | 'P3';

export type IncidentReviewStatus = 'pending' | 'acknowledged' | 'resolved' | 'false_positive';

export interface CrowdZoneRecord {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  camera_id: string | null;
  zone_name: string;
  zone_type: ZoneType;
  polygon: Point[];
  area_sqm: number;
  nominal_capacity: number;
  warning_capacity: number;
  max_capacity: number;
  enabled: boolean;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CounterQueueRecord {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  camera_id: string | null;
  counter_number: string;
  counter_name: string;
  counter_type: CounterType;
  queue_polygon: Point[];
  service_station_polygon: Point[];
  max_queue_length_threshold: number;
  max_wait_time_seconds_threshold: number;
  alert_severity: IncidentSeverity;
  enabled: boolean;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CrowdDensitySnapshotRecord {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  zone_id: string;
  camera_id: string | null;
  person_count: number;
  density_level: DensityLevel;
  occupancy_percentage: number;
  density_per_sqm: number;
  average_speed: number;
  is_bottleneck: boolean;
  heat_intensity: number;
  trend: TrendDirection;
  snapshot_metadata: Record<string, any>;
  timestamp: Date;
  created_at: Date;
}

export interface CounterQueueSnapshotRecord {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  queue_id: string;
  camera_id: string | null;
  current_queue_length: number;
  served_person_count: number;
  avg_wait_time_seconds: number;
  max_wait_time_seconds: number;
  is_counter_attended: boolean;
  threshold_exceeded: boolean;
  bottleneck_detected: boolean;
  participant_track_ids: string[];
  snapshot_metadata: Record<string, any>;
  timestamp: Date;
  created_at: Date;
}

export interface CrowdQueueIncidentRecord {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  camera_id: string | null;
  incident_type: CrowdIncidentType;
  severity: IncidentSeverity;
  entity_type: 'zone' | 'counter_queue';
  entity_id: string;
  entity_name: string;
  trigger_value: number;
  threshold_value: number;
  confidence: number;
  explanation: string;
  snapshot_url: string | null;
  review_status: IncidentReviewStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  resolution_notes: string | null;
  metadata: Record<string, any>;
  occurred_at: Date;
  created_at: Date;
}

export interface CrowdQueueConfigRecord {
  tenant_id: string;
  branch_id: string | null;
  default_queue_threshold: number;
  default_wait_time_threshold_seconds: number;
  density_warning_percentage: number;
  density_critical_percentage: number;
  bottleneck_speed_threshold: number;
  sla_target_compliance_percentage: number;
  alert_cooldown_seconds: number;
  auto_recommend_extra_counters: boolean;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface TrackedPerson {
  trackId: string;
  boundingBox: BoundingBox;
  confidence?: number;
  velocity?: { x: number; y: number };
}

export interface FrameAnalysisInput {
  tenantId: string;
  branchId?: string;
  cameraId?: string;
  timestamp?: Date | number;
  persons: TrackedPerson[];
  snapshotUrl?: string;
}

export interface ZoneDensityResult {
  zoneId: string;
  zoneName: string;
  zoneType: ZoneType;
  personCount: number;
  densityLevel: DensityLevel;
  occupancyPercentage: number;
  densityPerSqm: number;
  averageSpeed: number;
  isBottleneck: boolean;
  heatIntensity: number;
  trend: TrendDirection;
  participantTrackIds: string[];
  centroid: Point;
  requiresAlert: boolean;
  alertSeverity?: IncidentSeverity;
}

export interface QueuePersonState {
  trackId: string;
  enteredQueueAt: number;
  lastObservedAt: number;
  currentWaitSeconds: number;
  distanceToCounter: number;
}

export interface QueueMetricResult {
  queueId: string;
  counterNumber: string;
  counterName: string;
  counterType: CounterType;
  currentQueueLength: number;
  servedPersonCount: number;
  avgWaitTimeSeconds: number;
  maxWaitTimeSeconds: number;
  isCounterAttended: boolean;
  thresholdExceeded: boolean;
  bottleneckDetected: boolean;
  participantTrackIds: string[];
  waitingPersons: Array<{
    trackId: string;
    waitSeconds: number;
    distanceToCounter: number;
  }>;
  requiresAlert: boolean;
  incidentType?: CrowdIncidentType;
  alertSeverity?: IncidentSeverity;
}

export interface CounterRecommendation {
  id: string;
  type: 'open_counter' | 'rebalance_queue' | 'staff_alert';
  priority: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  recommendedCounterNumber?: string;
  sourceQueueId?: string;
  triggeredAt: Date;
}

export interface CrowdKPIStats {
  activeZonesCount: number;
  activeQueuesCount: number;
  totalHallOccupancy: number;
  peakOccupancyToday: number;
  averageWaitTimeSeconds: number;
  maxWaitTimeSecondsToday: number;
  overallDensityLevel: DensityLevel;
  slaComplianceRate: number; // percentage, e.g. 96.5%
  openIncidentsCount: {
    total: number;
    p1: number;
    p2: number;
    p3: number;
  };
}

export interface FrameAnalysisResult {
  timestamp: Date;
  tenantId: string;
  branchId?: string;
  cameraId?: string;
  totalPersonsDetected: number;
  zones: ZoneDensityResult[];
  queues: QueueMetricResult[];
  incidents: CrowdQueueIncidentRecord[];
  recommendations: CounterRecommendation[];
}
