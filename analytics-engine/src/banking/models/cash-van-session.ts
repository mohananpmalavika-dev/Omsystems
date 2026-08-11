/**
 * Cash Van Session Models
 * 
 * Persistent workflow state for cash van operations.
 * Each session tracks a single cash van arrival through completion.
 */

import { BoundingBox } from '../../types.js';

/**
 * Cash van workflow states
 */
export type CashVanState =
  | 'expected'           // Visit is scheduled
  | 'vehicle_detected'   // Vehicle observed in arrival zone
  | 'vehicle_verified'   // Plate matched to authorized vehicle
  | 'personnel_verification' // Checking personnel count and identities
  | 'escort_verified'    // Required guards confirmed
  | 'unloading'          // Active cash transfer
  | 'secure_zone_entry'  // Cash entered secure area
  | 'transfer_complete'  // Cash handoff completed
  | 'departed'           // Vehicle left premises
  | 'violation'          // Critical violation detected
  | 'expired';           // Session timed out without completion

/**
 * Overall workflow assessment
 */
export type WorkflowAssessment =
  | 'compliant'            // All rules passed
  | 'non_compliant'        // Critical violations
  | 'suspicious'           // Medium violations
  | 'in_progress'          // Still active
  | 'insufficient_evidence'; // Cannot verify

/**
 * Alert severity levels
 */
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Main cash van session entity
 */
export interface CashVanSession {
  id: string;
  tenantId: string;
  branchId: string;
  monitorId: string;

  // Scheduling
  scheduledVisitId?: string;

  // Vehicle tracking
  vehicleTrackId?: string;
  plate?: string;
  vehicleClass?: string;

  // State
  state: CashVanState;
  assessment: WorkflowAssessment;

  // Timestamps
  startedAt: Date;
  lastUpdatedAt: Date;
  vehicleArrivedAt?: Date;
  unloadingStartedAt?: Date;
  transferCompletedAt?: Date;
  departedAt?: Date;
  expiresAt?: Date;

  // Observations
  vehicle?: ObservedVehicle;
  personnel: ObservedPerson[];
  transferObjects: ObservedObject[];
  violations: CashVanViolation[];
  accessEvents: SessionAccessEvent[];

  // Evidence availability
  evidenceAvailability: EvidenceAvailability;

  // Confidence scores
  vehicleVerificationConfidence?: number;
  personnelVerificationConfidence?: number;
  overallConfidence: number;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Observed vehicle details
 */
export interface ObservedVehicle {
  trackId: string;
  plate?: string;
  plateConfidence?: number;
  vehicleClass: string;
  authorized: boolean;
  stationary: boolean;
  arrivedAt: Date;
  lastSeenAt: Date;
  lastZoneId?: string;
  confidence: number;
}

/**
 * Observed person in the session
 */
export interface ObservedPerson {
  trackId: string;
  identityId?: string;
  identityConfidence?: number;
  identityType?: 'employee' | 'guard' | 'cash_van_crew' | 'contractor' | 'customer' | 'unknown';
  roles?: string[];
  firstName?: string;
  lastName?: string;
  
  // Tracking
  firstSeenAt: Date;
  lastSeenAt: Date;
  currentZoneId?: string;
  zoneHistory: ZoneVisit[];
  
  // Spatial relationship
  initialVehicleDistanceMeters?: number;
  associatedWithVehicle: boolean;
  
  confidence: number;
}

/**
 * Zone visit record
 */
export interface ZoneVisit {
  zoneId: string;
  enteredAt: Date;
  exitedAt?: Date;
}

/**
 * Observed transfer object (bags, cases)
 */
export interface ObservedObject {
  trackId: string;
  objectType: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  currentZoneId?: string;
  zoneHistory: ZoneVisit[];
  carriedBy?: string; // personTrackId
  unattendedSince?: Date;
  confidence: number;
}

/**
 * Violation record
 */
export interface CashVanViolation {
  id: string;
  sessionId: string;
  ruleCode: string;
  ruleName: string;
  severity: AlertSeverity;
  status: 'active' | 'resolved' | 'false_positive';
  
  description: string;
  details: Record<string, any>;
  
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNote?: string;
  
  evidence: EvidenceReference[];
  confidence: number;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Access control event associated with session
 */
export interface SessionAccessEvent {
  eventId: string;
  doorId: string;
  zoneId?: string;
  type: 'granted' | 'denied';
  credentialId?: string;
  identityId?: string;
  accessType: string;
  timestamp: Date;
  correlatedWithPersonTrackId?: string;
}

/**
 * Evidence reference for explainability
 */
export interface EvidenceReference {
  type: 'video_frame' | 'video_clip' | 'detection' | 'track' | 'anpr' | 'identity_match' | 'access_event' | 'zone_event';
  id: string;
  cameraId?: string;
  timestamp?: Date;
  confidence?: number;
  metadata?: Record<string, any>;
}

/**
 * Tracks what evidence sources are available
 */
export interface EvidenceAvailability {
  vehicleDetection: boolean;
  anpr: boolean;
  personTracking: boolean;
  faceRecognition: boolean;
  accessControl: boolean;
  transferObjectDetection: boolean;
  lastCheckedAt: Date;
}

/**
 * Expected/scheduled cash van visit
 */
export interface CashVanVisit {
  id: string;
  tenantId: string;
  branchId: string;
  
  // Vehicle details
  expectedPlate?: string;
  expectedPlateRegex?: string;
  providerId?: string;
  providerName?: string;
  
  // Schedule
  expectedArrivalStart: Date;
  expectedArrivalEnd: Date;
  
  // Expected personnel
  expectedPersonnel?: ExpectedPersonnel[];
  
  // Status
  status: 'scheduled' | 'arrived' | 'completed' | 'missed' | 'cancelled';
  
  // Linked session
  sessionId?: string;
  
  // Metadata
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Expected personnel for a visit
 */
export interface ExpectedPersonnel {
  identityId?: string;
  role: 'cash_guard' | 'cash_handler' | 'driver';
  firstName?: string;
  lastName?: string;
  required: boolean;
}

/**
 * Cash van monitor configuration
 */
export interface CashVanMonitorConfig {
  id: string;
  tenantId: string;
  branchId: string;
  
  name: string;
  description?: string;
  enabled: boolean;
  
  // Zones
  arrivalZoneId: string;
  unloadingZoneId: string;
  secureEntryZoneId?: string;
  approvedRouteZones?: string[];
  
  // Vehicle rules
  allowedVehicles: CashVanVehicleRule[];
  
  // Schedule rules
  scheduleRules: ScheduleRule[];
  
  // Personnel rules
  personnelRules: PersonnelRules;
  
  // Unloading rules
  unloadingRules: UnloadingRules;
  
  // Access rules
  accessRules: AccessRules;
  
  // Session lifecycle
  sessionTimeoutMinutes: number;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Vehicle authorization rule
 */
export interface CashVanVehicleRule {
  id: string;
  plate?: string;
  plateRegex?: string;
  providerId?: string;
  vehicleClass?: 'van' | 'truck';
  enabled: boolean;
}

/**
 * Schedule rule
 */
export interface ScheduleRule {
  id: string;
  daysOfWeek: number[]; // 0-6, 0=Sunday
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  toleranceMinutes: number;
  enabled: boolean;
}

/**
 * Personnel verification rules
 */
export interface PersonnelRules {
  minimumPersonnel: number;
  minimumGuards: number;
  maximumPersonnel?: number;
  requireIdentityVerification: boolean;
  minimumIdentityConfidence: number;
  minimumTrackAgeMs: number;
  allowedRoles: string[];
}

/**
 * Unloading process rules
 */
export interface UnloadingRules {
  maxDurationSeconds: number;
  minimumPersonnelNearby: number;
  maxEscortDistanceMeters: number;
  requireGuardEscort: boolean;
  requireSecureZoneCompletion: boolean;
  transferObjectClasses: string[];
}

/**
 * Access control rules
 */
export interface AccessRules {
  requireAccessCorrelation: boolean;
  accessCorrelationWindowMs: number;
  allowedDoorIds: string[];
  requireAuthorizedIdentity: boolean;
}

/**
 * Personnel authorization data
 */
export interface PersonnelAuthorization {
  identityId: string;
  tenantId: string;
  organizationId?: string;
  
  firstName: string;
  lastName: string;
  employeeId?: string;
  
  roles: BankingRole[];
  
  validFrom: Date;
  validUntil?: Date;
  active: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Banking-specific roles
 */
export type BankingRole =
  | 'cash_guard'
  | 'cash_handler'
  | 'branch_manager'
  | 'vault_operator'
  | 'security_officer'
  | 'cash_van_driver';

/**
 * Session creation input
 */
export interface CreateCashVanSessionInput {
  tenantId: string;
  branchId: string;
  monitorId: string;
  vehicleTrackId?: string;
  scheduledVisitId?: string;
  state?: CashVanState;
  startedAt?: Date;
}

/**
 * Session update input
 */
export interface UpdateCashVanSessionInput {
  state?: CashVanState;
  assessment?: WorkflowAssessment;
  vehicle?: Partial<ObservedVehicle>;
  addPersonnel?: ObservedPerson;
  updatePersonnel?: Partial<ObservedPerson> & { trackId: string };
  addObject?: ObservedObject;
  addViolation?: Omit<CashVanViolation, 'id' | 'sessionId' | 'createdAt' | 'updatedAt'>;
  addAccessEvent?: SessionAccessEvent;
  evidenceAvailability?: Partial<EvidenceAvailability>;
  overallConfidence?: number;
}
