/**
 * Canonical Identity & Access Management (IAM) Domain Types
 * 
 * Provides unified definitions for:
 * - Banking-grade RBAC permissions
 * - ABAC resource scopes (ALL_BRANCHES, REGION, BRANCH, CAMERA_GROUP)
 * - Standardized Identity Provider configurations and Authentication Results
 */

export const BankingPermissions = {
  // Cameras & Recorders
  CAMERA_LIVE_VIEW: 'camera.live.view',
  CAMERA_PLAYBACK_VIEW: 'camera.playback.view',
  CAMERA_PTZ_CONTROL: 'camera.ptz.control',
  CAMERA_CONFIGURE: 'camera.configure',
  CAMERA_CREDENTIALS_READ: 'camera.credentials.read',
  RECORDER_VIEW: 'recorder.view',
  RECORDER_CONFIGURE: 'recorder.configure',
  RECORDER_CREDENTIALS_READ: 'recorder.credentials.read',

  // Portable & Software Cameras
  PORTABLE_CAMERA_CREATE: 'portable_camera.create',
  PORTABLE_CAMERA_ENROLL: 'portable_camera.enroll',
  PORTABLE_CAMERA_START: 'portable_camera.start',
  PORTABLE_CAMERA_STOP: 'portable_camera.stop',
  PORTABLE_CAMERA_VIEW: 'portable_camera.view',
  PORTABLE_CAMERA_RECORD: 'portable_camera.record',
  PORTABLE_CAMERA_CONFIGURE: 'portable_camera.configure',
  PORTABLE_CAMERA_REVOKE: 'portable_camera.revoke',
  PORTABLE_CAMERA_LOCATION_VIEW: 'portable_camera.location.view',
  PORTABLE_CAMERA_AUDIO_VIEW: 'portable_camera.audio.view',

  // NBFC AI Analytics & Rule Engine
  AI_RULE_VIEW: 'ai_rule.view',
  AI_RULE_CREATE: 'ai_rule.create',
  AI_RULE_EDIT: 'ai_rule.edit',
  AI_RULE_APPROVE: 'ai_rule.approve',
  AI_RULE_ACTIVATE: 'ai_rule.activate',
  AI_RULE_DISABLE: 'ai_rule.disable',
  AI_RULE_DELETE: 'ai_rule.delete',
  AI_RULE_TEST: 'ai_rule.test',
  AI_ZONE_MANAGE: 'ai_zone.manage',

  // Alerts & Incidents
  ALERT_VIEW: 'alert.view',
  ALERT_ACKNOWLEDGE: 'alert.acknowledge',
  ALERT_ASSIGN: 'alert.assign',
  ALERT_ESCALATE: 'alert.escalate',
  INCIDENT_VIEW: 'incident.view',
  INCIDENT_CREATE: 'incident.create',
  INCIDENT_CLOSE: 'incident.close',
  INCIDENT_REOPEN: 'incident.reopen',

  // Evidence & Forensic Packages
  EVIDENCE_VIEW: 'evidence.view',
  EVIDENCE_EXPORT: 'evidence.export',
  EVIDENCE_UNLOCK: 'evidence.unlock',
  EVIDENCE_DELETE: 'evidence.delete',
  EVIDENCE_ORIGINAL_VIEW: 'evidence.original.view',
  EVIDENCE_REDACTED_EXPORT: 'evidence.redacted.export',
  EVIDENCE_UNREDACTED_EXPORT: 'evidence.unredacted.export',
  EVIDENCE_VERIFY: 'evidence.verify',
  EVIDENCE_LEGAL_HOLD_CREATE: 'evidence.legal_hold.create',
  EVIDENCE_LEGAL_HOLD_RELEASE: 'evidence.legal_hold.release',

  // Retention Policies
  RETENTION_VIEW: 'retention.view',
  RETENTION_CONFIGURE: 'retention.configure',
  RETENTION_OVERRIDE: 'retention.override',

  // Privacy & Redaction Governance
  PRIVACY_POLICY_VIEW: 'privacy.policy.view',
  PRIVACY_POLICY_MANAGE: 'privacy.policy.manage',
  PRIVACY_ZONE_VIEW: 'privacy.zone.view',
  PRIVACY_ZONE_MANAGE: 'privacy.zone.manage',
  PRIVACY_OVERRIDE_REQUEST: 'privacy.override.request',
  PRIVACY_OVERRIDE_APPROVE: 'privacy.override.approve',
  VIDEO_UNMASKED_LIVE: 'video.unmasked.live',
  VIDEO_UNMASKED_PLAYBACK: 'video.unmasked.playback',
  AUDIO_LIVE_LISTEN: 'audio.live.listen',
  AUDIO_PLAYBACK_LISTEN: 'audio.playback.listen',

  // Administration & Audit
  BRANCH_VIEW: 'branch.view',
  BRANCH_CONFIGURE: 'branch.configure',
  HEALTH_VIEW: 'health.view',
  HEALTH_MANAGE: 'health.manage',
  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',
  ROLE_VIEW: 'role.view',
  ROLE_MANAGE: 'role.manage',
  IDENTITY_PROVIDER_VIEW: 'identity_provider.view',
  IDENTITY_PROVIDER_MANAGE: 'identity_provider.manage',
  AUDIT_READ: 'audit.read',
  AUDIT_EXPORT: 'audit.export',
  SYSTEM_CONFIGURE: 'system.configure',
} as const;

export type BankingPermission = typeof BankingPermissions[keyof typeof BankingPermissions];

export type ResourceScopeType = 'ALL_BRANCHES' | 'REGION' | 'BRANCH' | 'CAMERA_GROUP';

export interface ResourceScope {
  type: ResourceScopeType;
  regionId?: string;
  branchId?: string;
  cameraGroupId?: string;
  allowedCameraIds?: string[];
}

export type IdentityProviderType = 'LOCAL' | 'LDAP' | 'SAML' | 'OIDC' | 'AZURE_AD';

export interface NormalizedIdentityProfile {
  providerType: IdentityProviderType;
  providerId: string;
  externalSubject: string;
  email: string;
  username: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  groups: string[];
  attributes: Record<string, any>;
}

export interface SecurityPrincipal {
  userId: string;
  tenantId: string;
  username: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  scope: ResourceScope;
  authMethod: IdentityProviderType;
  sessionId: string;
  issuedAt: Date;
  expiresAt: Date;
}
