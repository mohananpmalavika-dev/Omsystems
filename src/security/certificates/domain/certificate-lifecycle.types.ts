/**
 * Certificate Lifecycle Domain Types
 * Comprehensive type definitions for certificate lifecycle management
 */

// ============================================================================
// Certificate Lifecycle State Machine
// ============================================================================

export type CertificateLifecycleState =
  | 'REQUESTED'
  | 'KEY_GENERATING'
  | 'KEY_CREATED'
  | 'CSR_CREATED'
  | 'POLICY_EVALUATING'
  | 'POLICY_APPROVED'
  | 'POLICY_REJECTED'
  | 'SUBMITTED'
  | 'PENDING_ISSUANCE'
  | 'PENDING_APPROVAL'
  | 'ISSUED'
  | 'CHAIN_VALIDATING'
  | 'CHAIN_VALIDATED'
  | 'VALIDATION_FAILED'
  | 'DEPLOYING'
  | 'DEPLOYED'
  | 'RELOADING'
  | 'RELOAD_COMPLETED'
  | 'RELOAD_FAILED'
  | 'VERIFYING'
  | 'ACTIVE'
  | 'VERIFICATION_FAILED'
  | 'RENEWAL_DUE'
  | 'RENEWING'
  | 'SUPERSEDED'
  | 'REVOKED'
  | 'REJECTED'
  | 'FAILED'
  | 'AWAITING_MANUAL_ISSUANCE'
  | 'DEPLOYMENT_FAILED';

export const ALLOWED_STATE_TRANSITIONS: Record<
  CertificateLifecycleState,
  CertificateLifecycleState[]
> = {
  REQUESTED: ['KEY_GENERATING', 'POLICY_EVALUATING', 'FAILED'],
  KEY_GENERATING: ['KEY_CREATED', 'FAILED'],
  KEY_CREATED: ['CSR_CREATED', 'FAILED'],
  CSR_CREATED: ['POLICY_EVALUATING', 'FAILED'],
  POLICY_EVALUATING: ['POLICY_APPROVED', 'POLICY_REJECTED'],
  POLICY_APPROVED: ['SUBMITTED', 'FAILED'],
  POLICY_REJECTED: ['REJECTED'],
  SUBMITTED: [
    'PENDING_ISSUANCE',
    'PENDING_APPROVAL',
    'ISSUED',
    'AWAITING_MANUAL_ISSUANCE',
    'REJECTED',
    'FAILED'
  ],
  PENDING_ISSUANCE: ['ISSUED', 'REJECTED', 'FAILED'],
  PENDING_APPROVAL: ['PENDING_ISSUANCE', 'ISSUED', 'REJECTED', 'FAILED'],
  AWAITING_MANUAL_ISSUANCE: ['ISSUED', 'FAILED'],
  ISSUED: ['CHAIN_VALIDATING', 'VALIDATION_FAILED'],
  CHAIN_VALIDATING: ['CHAIN_VALIDATED', 'VALIDATION_FAILED'],
  CHAIN_VALIDATED: ['DEPLOYING'],
  VALIDATION_FAILED: ['FAILED'],
  DEPLOYING: ['DEPLOYED', 'DEPLOYMENT_FAILED'],
  DEPLOYED: ['RELOADING', 'VERIFYING'],
  RELOADING: ['RELOAD_COMPLETED', 'RELOAD_FAILED'],
  RELOAD_COMPLETED: ['VERIFYING'],
  RELOAD_FAILED: ['FAILED'],
  VERIFYING: ['ACTIVE', 'VERIFICATION_FAILED'],
  ACTIVE: ['RENEWAL_DUE', 'RENEWING', 'REVOKED', 'SUPERSEDED'],
  VERIFICATION_FAILED: ['FAILED', 'DEPLOYING'],
  RENEWAL_DUE: ['RENEWING'],
  RENEWING: ['SUBMITTED', 'FAILED'],
  SUPERSEDED: [],
  REVOKED: [],
  REJECTED: [],
  FAILED: ['REQUESTED'],
  DEPLOYMENT_FAILED: ['DEPLOYING', 'FAILED']
};

export interface CertificateLifecycleEvent {
  id: string;
  certificateId: string;
  fromState: CertificateLifecycleState | null;
  toState: CertificateLifecycleState;
  occurredAt: Date;
  actor:
    | { type: 'USER'; userId: string; userName?: string }
    | { type: 'SERVICE'; serviceId: string; serviceName?: string }
    | { type: 'SYSTEM' };
  evidence?: {
    providerRequestId?: string;
    fingerprint?: string;
    verificationEndpoint?: string;
    result?: string;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, any>;
  };
  reason?: string;
}

// ============================================================================
// Certificate Authority Types
// ============================================================================

export type CertificateAuthorityProviderType =
  | 'ACME'
  | 'MICROSOFT_ADCS'
  | 'VAULT_PKI'
  | 'VENAFI'
  | 'INTERNAL_CA'
  | 'MANUAL';

export interface CertificateAuthorityCapabilities {
  automaticIssuance: boolean;
  automaticRenewal: boolean;
  automaticRevocation: boolean;
  supportsPolling: boolean;
  supportsWebhooks: boolean;
  supportsOCSP: boolean;
  supportsCRL: boolean;
  supportsDeviceIdentity: boolean;
  supportsSANWildcard: boolean;
  maxValidityDays?: number;
  requiresApproval: boolean;
}

export interface CertificateAuthorityHealth {
  state: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'MISCONFIGURED';
  reachable: boolean;
  authenticated: boolean;
  authorizationVerified?: boolean;
  latencyMs?: number;
  observedAt: Date;
  reason?: string;
  nextCheckAt?: Date;
}

export interface CertificateAuthorityConfiguration {
  id: string;
  tenantId?: string;
  name: string;
  description?: string;
  type: CertificateAuthorityProviderType;
  enabled: boolean;
  trustBundleId?: string;
  configuration: Record<string, any>; // Provider-specific config
  certificateProfiles: CertificateProfileMapping[];
  createdAt: Date;
  updatedAt: Date;
  lastHealthCheck?: CertificateAuthorityHealth;
}

export interface CertificateProfileMapping {
  profile: CertificateProfile;
  providerRole?: string;
  providerTemplate?: string;
  providerPolicy?: string;
  maxValidityDays?: number;
  allowedSANPatterns?: string[];
  requiredKeyUsage?: string[];
  requiredExtendedKeyUsage?: string[];
}

// ============================================================================
// Certificate Profiles and Policy
// ============================================================================

export type CertificateProfile =
  | 'DEVICE_TLS'
  | 'SERVICE_TLS'
  | 'USER_AUTH'
  | 'CODE_SIGNING'
  | 'EMAIL'
  | 'CLIENT_AUTH'
  | 'SERVER_AUTH'
  | 'INTERMEDIATE_CA'
  | 'ROOT_CA';

export interface CertificatePolicyDecision {
  allowed: boolean;
  selectedProfile?: CertificateProfile;
  selectedProviderId?: string;
  maxValidityDays?: number;
  allowedSans?: string[];
  requiredKeyUsage?: string[];
  requiredExtendedKeyUsage?: string[];
  reasons: string[];
  modificationsRequired?: {
    sans?: string[];
    validityDays?: number;
    keyUsage?: string[];
    extendedKeyUsage?: string[];
  };
}

export interface CertificateRequestContext {
  tenantId: string;
  requestedProfile: CertificateProfile;
  subject: CertificateSubject;
  subjectAlternativeNames: SubjectAlternativeName[];
  keyUsage?: string[];
  extendedKeyUsage?: string[];
  requestedValidityDays?: number;
  metadata: {
    deviceId?: string;
    serviceId?: string;
    branchId?: string;
    workloadId?: string;
    userId?: string;
    purpose?: string;
  };
  requestedBy: string;
}

export interface CertificateSubject {
  commonName: string;
  organization?: string;
  organizationalUnit?: string;
  locality?: string;
  stateOrProvince?: string;
  country?: string;
  emailAddress?: string;
}

export interface SubjectAlternativeName {
  type: 'DNS' | 'IP' | 'URI' | 'EMAIL';
  value: string;
}

// ============================================================================
// Certificate Signing Request (CSR)
// ============================================================================

export interface CertificateSigningRequestRecord {
  id: string;
  tenantId: string;
  certificateId: string;
  keyId: string;
  keyProvider: string;
  subject: CertificateSubject;
  subjectAlternativeNames: SubjectAlternativeName[];
  keyUsage: string[];
  extendedKeyUsage: string[];
  csrPem: string;
  csrSha256: string;
  algorithm: KeyAlgorithm;
  createdAt: Date;
  createdBy: string;
  verificationResult?: CSRVerificationResult;
}

export interface CSRVerificationResult {
  valid: boolean;
  signatureValid: boolean;
  subjectMatches: boolean;
  sansMatch: boolean;
  algorithmAllowed: boolean;
  errors: string[];
  verifiedAt: Date;
}

// ============================================================================
// Certificate Issuance
// ============================================================================

export interface SubmitCertificateRequest {
  tenantId: string;
  requestId: string;
  certificateId: string;
  csrPem: string;
  csrSha256: string;
  certificateProfile: CertificateProfile;
  requestedValidityDays?: number;
  metadata: {
    deviceId?: string;
    serviceId?: string;
    branchId?: string;
    workloadId?: string;
  };
  idempotencyKey: string;
}

export type CertificateRequestSubmission =
  | {
      state: 'ISSUED';
      providerRequestId: string;
      certificate: IssuedCertificate;
    }
  | {
      state: 'PENDING';
      providerRequestId: string;
      retryAfter?: Date;
      estimatedCompletionTime?: Date;
    }
  | {
      state: 'PENDING_APPROVAL';
      providerRequestId: string;
      approvalUrl?: string;
      instructions?: string;
    }
  | {
      state: 'MANUAL_ACTION_REQUIRED';
      providerRequestId: string;
      instructions?: string;
      downloadUrl?: string;
    }
  | {
      state: 'REJECTED';
      providerRequestId?: string;
      reason: string;
      errorCode?: string;
    };

export interface CertificateRequestStatusRequest {
  providerRequestId: string;
  certificateId: string;
}

export type CertificateRequestStatus =
  | {
      state: 'PENDING' | 'PENDING_APPROVAL';
      retryAfter?: Date;
    }
  | {
      state: 'ISSUED';
      certificate: IssuedCertificate;
    }
  | {
      state: 'REJECTED';
      reason: string;
    }
  | {
      state: 'FAILED';
      reason: string;
      retryable: boolean;
    };

export interface RetrieveCertificateRequest {
  providerRequestId: string;
  certificateId: string;
}

export interface IssuedCertificate {
  certificatePem: string;
  chainPem?: string[];
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  fingerprintSha256: string;
  issuer: string;
  providerRequestId: string;
  issuedAt: Date;
  metadata?: Record<string, any>;
}

// ============================================================================
// Certificate Validation
// ============================================================================

export interface CertificateValidationRequest {
  certificateId: string;
  certificatePem: string;
  chainPem?: string[];
  expectedCsrPublicKey?: string;
  expectedSans?: SubjectAlternativeName[];
  requiredKeyUsage?: string[];
  requiredExtendedKeyUsage?: string[];
  allowedIssuers?: string[];
  minimumKeySize?: number;
  allowedAlgorithms?: string[];
}

export interface CertificateValidationResult {
  valid: boolean;
  checks: {
    parsing: EvidenceCheck;
    chain: EvidenceCheck;
    validity: EvidenceCheck;
    identity: EvidenceCheck;
    keyUsage: EvidenceCheck;
    extendedKeyUsage: EvidenceCheck;
    algorithm: EvidenceCheck;
    keyStrength: EvidenceCheck;
    csrMatch: EvidenceCheck;
    issuer: EvidenceCheck;
  };
  certificate?: ParsedCertificate;
  validatedAt: Date;
}

export type EvidenceState = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE';

export interface EvidenceCheck {
  state: EvidenceState;
  message?: string;
  details?: any;
}

export interface ParsedCertificate {
  serialNumber: string;
  issuer: string;
  subject: string;
  subjectAlternativeNames: SubjectAlternativeName[];
  notBefore: Date;
  notAfter: Date;
  publicKeyAlgorithm: string;
  publicKeySize: number;
  signatureAlgorithm: string;
  keyUsage: string[];
  extendedKeyUsage: string[];
  fingerprintSha256: string;
  fingerprintSha1: string;
}

// ============================================================================
// Key Management
// ============================================================================

export type KeyProvider =
  | 'SOFTWARE'
  | 'PKCS11'
  | 'TPM'
  | 'AWS_KMS'
  | 'AZURE_KEY_VAULT'
  | 'GCP_KMS'
  | 'VAULT_TRANSIT';

export interface KeyAlgorithm {
  family: 'RSA' | 'EC' | 'ED25519';
  size?: number; // For RSA
  curve?: string; // For EC
}

export interface GenerateCertificateKeyRequest {
  tenantId: string;
  certificateId: string;
  algorithm: KeyAlgorithm;
  provider: KeyProvider;
  exportable: boolean;
  label?: string;
  metadata?: Record<string, any>;
}

export interface GeneratedKeyReference {
  keyId: string;
  provider: KeyProvider;
  exportable: boolean;
  algorithm: KeyAlgorithm;
  publicKeyPem: string;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface CreateCsrRequest {
  keyId: string;
  subject: CertificateSubject;
  subjectAlternativeNames: SubjectAlternativeName[];
  keyUsage?: string[];
  extendedKeyUsage?: string[];
}

export interface GeneratedCsr {
  csrPem: string;
  csrSha256: string;
  publicKeyPem: string;
  algorithm: KeyAlgorithm;
  createdAt: Date;
}

// ============================================================================
// Certificate Deployment
// ============================================================================

export type CertificateTargetType =
  | 'NGINX'
  | 'KUBERNETES_SECRET'
  | 'RECORDER'
  | 'CAMERA'
  | 'EDGE_AGENT'
  | 'LOAD_BALANCER'
  | 'WINDOWS_CERT_STORE'
  | 'JAVA_KEYSTORE'
  | 'FILE_SYSTEM';

export interface CertificateTarget {
  type: CertificateTargetType;
  id: string;
  name: string;
  endpoint?: string;
  configuration: Record<string, any>;
}

export interface DeployCertificateRequest {
  certificateId: string;
  target: CertificateTarget;
  certificatePem: string;
  privateKeyPem?: string;
  chainPem?: string[];
  reload: boolean;
  verifyAfterDeployment: boolean;
  rollbackOnFailure: boolean;
}

export type CertificateDeploymentResult =
  | {
      state: 'DEPLOYED';
      deployedAt: Date;
      deploymentId: string;
      reloadRequired: boolean;
    }
  | {
      state: 'DEPLOYED_RELOAD_PENDING';
      deployedAt: Date;
      deploymentId: string;
    }
  | {
      state: 'FAILED';
      reason: string;
      errorCode?: string;
      rollbackPerformed?: boolean;
    };

export interface RollbackCertificateRequest {
  certificateId: string;
  deploymentId: string;
  target: CertificateTarget;
}

export interface ReloadResult {
  state:
    | 'RELOADED'
    | 'RESTART_REQUIRED'
    | 'REBOOT_REQUIRED'
    | 'FAILED'
    | 'NOT_REQUIRED';
  observedAt: Date;
  reason?: string;
  serviceName?: string;
}

// ============================================================================
// Certificate Verification
// ============================================================================

export interface DeploymentVerificationRequest {
  certificateId: string;
  deploymentId: string;
  target: CertificateTarget;
  expectedFingerprint: string;
  expectedSerialNumber: string;
  expectedSans?: SubjectAlternativeName[];
}

export interface DeploymentVerificationResult {
  state:
    | 'VERIFIED'
    | 'MISMATCH'
    | 'UNREACHABLE'
    | 'TLS_ERROR'
    | 'TIMEOUT'
    | 'UNKNOWN';
  expectedFingerprint: string;
  observedFingerprint?: string;
  expectedSerialNumber: string;
  observedSerialNumber?: string;
  verifiedAt: Date | null;
  reason?: string;
  tlsVersion?: string;
  cipherSuite?: string;
  certificateChainValid?: boolean;
}

export interface CertificateVerificationFreshness {
  certificateId: string;
  lastVerifiedAt: Date | null;
  staleSince?: Date;
  freshnessState: 'FRESH' | 'STALE' | 'EXPIRED' | 'NEVER_VERIFIED';
  freshnessThresholdMs: number;
}

// ============================================================================
// Certificate Renewal
// ============================================================================

export interface CertificateRenewalPolicy {
  renewBeforeDays: number;
  rotatePrivateKey: boolean;
  retryPolicy: {
    initialDelaySeconds: number;
    maxDelaySeconds: number;
    maxAttempts: number;
  };
  failureEscalationDays: number[];
  revokeSupersededCertificate: boolean;
  maintainBlueGreen: boolean;
  verificationRequiredBeforeActivation: boolean;
}

export interface RenewalAttempt {
  id: string;
  certificateId: string;
  attemptNumber: number;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  state: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';
  newCertificateId?: string;
  error?: string;
  nextRetryAt?: Date;
}

export interface RenewalWindow {
  certificateId: string;
  notAfter: Date;
  renewalDueDate: Date;
  warningDate: Date;
  criticalDate: Date;
  emergencyDate: Date;
  state: 'NOT_DUE' | 'WARNING' | 'CRITICAL' | 'EMERGENCY' | 'EXPIRED';
}

// ============================================================================
// Certificate Revocation
// ============================================================================

export type RevocationReason =
  | 'unspecified'
  | 'keyCompromise'
  | 'caCompromise'
  | 'affiliationChanged'
  | 'superseded'
  | 'cessationOfOperation'
  | 'certificateHold'
  | 'removeFromCRL'
  | 'privilegeWithdrawn'
  | 'aaCompromise';

export interface RevokeCertificateRequest {
  certificateId: string;
  reason: RevocationReason;
  actor: string;
  comments?: string;
}

export interface RevocationResult {
  success: boolean;
  revokedAt?: Date;
  reason?: RevocationReason;
  providerRevocationId?: string;
  error?: string;
}

export interface RevocationStatusRequest {
  certificateId: string;
  serialNumber: string;
  issuer: string;
}

export interface RevocationStatusResult {
  state: 'GOOD' | 'REVOKED' | 'UNKNOWN';
  available: boolean;
  source: 'OCSP' | 'CRL' | 'CA_API' | 'UNAVAILABLE';
  checkedAt: Date | null;
  thisUpdate?: Date;
  nextUpdate?: Date;
  revocationTime?: Date;
  revocationReason?: RevocationReason;
  reason?: string;
}

export interface OCSPRequest {
  certificatePem: string;
  issuerPem: string;
  responderUrl?: string;
}

export interface CRLInfo {
  distributionPoint: string;
  crlPem?: string;
  downloadedAt?: Date;
  nextUpdate?: Date;
  revokedSerials: Set<string>;
}

// ============================================================================
// Managed Certificate Record
// ============================================================================

export interface ManagedCertificate {
  id: string;
  tenantId: string;
  name: string;
  targetType: string;
  targetId: string;
  profile: CertificateProfile;
  keyId: string;
  keyProvider: KeyProvider;
  providerId: string;
  providerRequestId?: string;
  csrId?: string;
  serialNumber?: string;
  fingerprintSha256?: string;
  subject?: CertificateSubject;
  sans: SubjectAlternativeName[];
  notBefore?: Date;
  notAfter?: Date;
  state: CertificateLifecycleState;
  certificatePem?: string;
  chainPem?: string[];
  issuedAt?: Date;
  deployedAt?: Date;
  verifiedAt?: Date;
  renewalDueAt?: Date;
  renewalPolicy?: CertificateRenewalPolicy;
  previousCertificateId?: string;
  replacementCertificateId?: string;
  deployments: CertificateDeploymentRecord[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface CertificateDeploymentRecord {
  id: string;
  target: CertificateTarget;
  deployedAt: Date;
  state: 'ACTIVE' | 'PENDING_RELOAD' | 'FAILED' | 'SUPERSEDED';
  verificationState?: DeploymentVerificationResult;
  lastVerifiedAt?: Date;
  reloadResult?: ReloadResult;
}

// ============================================================================
// Certificate Health and Monitoring
// ============================================================================

export interface CertificateHealth {
  certificateId: string;
  lifecycleState: CertificateLifecycleState;
  overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'FAILED' | 'UNKNOWN';
  expiry: {
    state: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'EXPIRED';
    notAfter: Date | null;
    daysRemaining: number | null;
  };
  deployment: {
    state: 'VERIFIED' | 'STALE' | 'MISMATCH' | 'UNREACHABLE' | 'UNKNOWN';
    verifiedAt: Date | null;
    daysSinceVerification: number | null;
  };
  revocation: RevocationStatusResult | null;
  renewal: {
    state: 'NOT_DUE' | 'DUE' | 'IN_PROGRESS' | 'FAILED';
    nextRenewalDate?: Date;
    failedAttempts?: number;
  };
  issues: string[];
  checkedAt: Date;
}

// ============================================================================
// Error Types
// ============================================================================

export class CertificateLifecycleError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'CertificateLifecycleError';
  }
}

export class CertificateAuthorityUnavailableError extends CertificateLifecycleError {
  constructor(message: string, details?: any) {
    super(message, 'CA_UNAVAILABLE', true, details);
    this.name = 'CertificateAuthorityUnavailableError';
  }
}

export class CertificateRequestRejectedError extends CertificateLifecycleError {
  constructor(message: string, details?: any) {
    super(message, 'REQUEST_REJECTED', false, details);
    this.name = 'CertificateRequestRejectedError';
  }
}

export class CertificateValidationError extends CertificateLifecycleError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_FAILED', false, details);
    this.name = 'CertificateValidationError';
  }
}

export class CertificateDeploymentError extends CertificateLifecycleError {
  constructor(message: string, retryable: boolean, details?: any) {
    super(message, 'DEPLOYMENT_FAILED', retryable, details);
    this.name = 'CertificateDeploymentError';
  }
}

export class CertificateVerificationError extends CertificateLifecycleError {
  constructor(message: string, details?: any) {
    super(message, 'VERIFICATION_FAILED', true, details);
    this.name = 'CertificateVerificationError';
  }
}

export class CertificateRevocationError extends CertificateLifecycleError {
  constructor(message: string, retryable: boolean, details?: any) {
    super(message, 'REVOCATION_FAILED', retryable, details);
    this.name = 'CertificateRevocationError';
  }
}

export class CertificatePolicyViolationError extends CertificateLifecycleError {
  constructor(message: string, details?: any) {
    super(message, 'POLICY_VIOLATION', false, details);
    this.name = 'CertificatePolicyViolationError';
  }
}

export interface CAProviderError {
  code:
    | 'AUTHENTICATION_FAILED'
    | 'AUTHORIZATION_FAILED'
    | 'RATE_LIMITED'
    | 'REQUEST_REJECTED'
    | 'PENDING_APPROVAL'
    | 'NETWORK_ERROR'
    | 'PROVIDER_UNAVAILABLE'
    | 'INVALID_RESPONSE'
    | 'TIMEOUT'
    | 'INVALID_CONFIG';
  message: string;
  retryable: boolean;
  retryAfter?: Date;
  providerCode?: string;
  providerMessage?: string;
}

// ============================================================================
// Job and Worker Types
// ============================================================================

export type CertificateJobType =
  | 'ISSUANCE'
  | 'RENEWAL'
  | 'DEPLOYMENT'
  | 'VERIFICATION'
  | 'REVOCATION'
  | 'MONITORING';

export interface CertificateJob {
  id: string;
  type: CertificateJobType;
  certificateId: string;
  state: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: Date;
  error?: string;
  payload: Record<string, any>;
  result?: Record<string, any>;
}
