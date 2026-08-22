/**
 * Privacy & Redaction Subsystem Domain Types
 * 
 * Defines domain models for:
 * - PrivacyPolicy with versioning and hierarchical scoping
 * - Static Privacy Zones (normalized coordinates 0.0 - 1.0)
 * - Dynamic Redaction Rules (face, person, license plate blur, audio removal)
 * - Privileged Unmasking & Temporary Privacy Override Grants
 * - Privacy Decisions (UNMASKED, MASKED, DENIED)
 * - Privacy Audit Events
 */

export interface NormalizedCoordinate {
  x: number; // 0.0 to 1.0
  y: number; // 0.0 to 1.0
}

export type PrivacyZoneShape = 'polygon' | 'rectangle';
export type PrivacyZoneMode = 'solid' | 'pixelate' | 'blur';
export type PrivacyZoneAppliesTo = 'live' | 'playback' | 'export' | 'all';

export interface PrivacyZone {
  id: string;
  cameraId: string;
  name: string;
  shape: PrivacyZoneShape;
  coordinates: NormalizedCoordinate[];
  mode: PrivacyZoneMode;
  appliesTo: PrivacyZoneAppliesTo;
  mandatory?: boolean;
  overrideAllowed?: boolean;
  enabled: boolean;
}

export type RedactionLevel = 'NONE' | 'BLUR' | 'PIXELATE' | 'SOLID_BLACK';

export interface DynamicRedactionConfig {
  faceBlur: RedactionLevel;
  personBlur: RedactionLevel;
  licensePlateBlur: RedactionLevel;
}

export interface AudioPrivacyConfig {
  liveMute: boolean;
  playbackMute: boolean;
  exportAction: 'PASS_THROUGH' | 'MUTE' | 'REMOVE_TRACK';
}

export interface UnmaskingPolicy {
  requirePermission: boolean;
  requireReason: boolean;
  requireCaseNumber: boolean;
  requireApproval: boolean;
  maxSessionMinutes: number;
}

export interface PrivacyScope {
  tenantId?: string;
  regionIds?: string[];
  branchIds?: string[];
  cameraIds?: string[];
  cameraGroups?: string[];
  tags?: string[];
}

export interface PrivacyPolicy {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  scope: PrivacyScope;
  staticZones: PrivacyZone[];
  dynamicRedaction: DynamicRedactionConfig;
  audio: AudioPrivacyConfig;
  unmaskingPolicy: UnmaskingPolicy;
  version: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PrivacyDecisionMode = 'UNMASKED' | 'MASKED' | 'DENIED';

export interface PrivacyDecision {
  allow: boolean;
  mode: PrivacyDecisionMode;
  transformations: {
    staticZones: boolean;
    faceBlur: boolean;
    personBlur: boolean;
    plateBlur: boolean;
    muteAudio: boolean;
    removeAudioTrack: boolean;
  };
  zonesToApply: PrivacyZone[];
  watermarkText?: string;
  grantId?: string;
  auditRequired: boolean;
  policyId: string;
  policyVersion: number;
  reason?: string;
}

export interface PrivacyOverrideGrant {
  id: string;
  tenantId: string;
  userId: string;
  username: string;
  cameraId: string;
  operation: 'LIVE' | 'PLAYBACK';
  reason: string;
  caseNumber?: string;
  incidentId?: string;
  approvedBy?: string;
  issuedAt: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
}

export type PrivacyAuditEventType =
  | 'PRIVACY_MASKED_VIEW'
  | 'PRIVACY_UNMASK_REQUESTED'
  | 'PRIVACY_UNMASK_APPROVED'
  | 'PRIVACY_UNMASK_DENIED'
  | 'PRIVACY_UNMASKED_LIVE_VIEW'
  | 'PRIVACY_UNMASKED_PLAYBACK'
  | 'PRIVACY_REDACTED_EXPORT'
  | 'PRIVACY_UNREDACTED_EXPORT'
  | 'PRIVACY_POLICY_CREATED'
  | 'PRIVACY_POLICY_UPDATED'
  | 'PRIVACY_ZONE_CREATED'
  | 'PRIVACY_ZONE_DELETED';

export interface PrivacyAuditEvent {
  id: string;
  tenantId: string;
  userId: string;
  username: string;
  event: PrivacyAuditEventType;
  branchId?: string;
  cameraId?: string;
  operation?: 'LIVE' | 'PLAYBACK' | 'EXPORT';
  incidentId?: string;
  caseNumber?: string;
  reason?: string;
  policyId?: string;
  policyVersion?: number;
  sourceIp?: string;
  timestamp: string;
}
