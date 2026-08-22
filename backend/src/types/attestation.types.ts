/**
 * TPM Attestation Types
 * Remote attestation, boot integrity, and hardware trust verification
 */

// ============================================================================
// Attestation Status
// ============================================================================

export enum AttestationStatus {
  /** Cryptographically verified by TPM quote */
  VERIFIED = 'VERIFIED',
  
  /** Evidence provided but verification failed */
  FAILED = 'FAILED',
  
  /** Cannot establish trust (error, missing data) */
  UNKNOWN = 'UNKNOWN',
  
  /** Device does not support TPM attestation */
  UNSUPPORTED = 'UNSUPPORTED',
  
  /** Attestation infrastructure not configured */
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  
  /** Last attestation too old */
  STALE = 'STALE'
}

export enum AttestationAssurance {
  /** No attestation available */
  NONE = 'NONE',
  
  /** Software-reported claim (not verified) */
  SELF_REPORTED = 'SELF_REPORTED',
  
  /** Signed by device agent */
  SIGNED_AGENT = 'SIGNED_AGENT',
  
  /** Hardware TPM/TEE attestation */
  HARDWARE_ATTESTED = 'HARDWARE_ATTESTED'
}

// ============================================================================
// Attestation Challenge
// ============================================================================

export interface AttestationChallenge {
  id: string;
  tenantId: string;
  deviceId: string;
  
  /** Hash of the nonce (server stores hash, not raw nonce) */
  nonceHash: string;
  
  /** PCRs that must be included in the quote */
  requestedPcrSelection: PcrSelection;
  
  createdAt: Date;
  expiresAt: Date;
  
  /** When the challenge was consumed (one-time use) */
  usedAt?: Date;
}

export interface AttestationChallengePayload {
  version: 1;
  
  challengeId: string;
  tenantId: string;
  deviceId: string;
  
  /** Fresh nonce to prevent replay attacks */
  nonce: string;
  
  issuedAt: number;
  
  /** Policy that will be used for verification */
  policyId: string;
  
  /** Required PCR selection */
  pcrSelection: PcrSelection;
}

export interface PcrSelection {
  /** Hash algorithm used by TPM */
  hashAlgorithm: 'sha1' | 'sha256' | 'sha384' | 'sha512';
  
  /** PCR indices to include */
  pcrs: number[];
}

// ============================================================================
// Device Attestation Identity
// ============================================================================

export interface DeviceAttestationIdentity {
  id: string;
  tenantId: string;
  deviceId: string;
  
  /** Attestation Key public key (PEM format) */
  akPublicKeyPem: string;
  
  /** TPM2 name of the AK */
  akName?: string;
  
  /** Hash of EK public key for TPM provenance */
  ekPublicKeyHash?: string;
  
  /** TPM manufacturer identifier */
  tpmManufacturer?: string;
  
  /** TPM firmware version */
  tpmFirmwareVersion?: string;
  
  /** When the AK was enrolled */
  enrolledAt: Date;
  
  /** If revoked, when and why */
  revokedAt?: Date;
  revokedReason?: string;
  
  /** Trust level of this identity */
  trustLevel: IdentityTrustLevel;
}

export enum IdentityTrustLevel {
  /** AK received but not verified */
  UNVERIFIED = 'UNVERIFIED',
  
  /** AK enrolled through secure channel */
  ENROLLED = 'ENROLLED',
  
  /** TPM provenance established via EK */
  TPM_PROVEN = 'TPM_PROVEN'
}

// ============================================================================
// TPM Quote Submission
// ============================================================================

export interface TpmQuoteSubmission {
  /** Challenge ID this quote responds to */
  challengeId: string;
  
  deviceId: string;
  
  /** TPM2_Quote output (base64) */
  quote: string;
  
  /** TPM signature over the quote (base64) */
  signature: string;
  
  /** PCR selection used */
  pcrSelection: PcrSelection;
  
  /** PCR values at time of quote */
  pcrValues: Record<string, string>;
  
  /** Optional measured boot event log */
  measuredBootLog?: string;
  
  /** Self-reported secure boot state */
  secureBootState?: {
    enabled: boolean;
    mode?: 'SETUP' | 'USER' | 'AUDIT' | 'DEPLOYED';
  };
}

// ============================================================================
// Parsed TPM Quote
// ============================================================================

export interface ParsedTpmQuote {
  /** TPMS_ATTEST structure */
  magic: string;
  
  /** Qualified signer name */
  qualifiedSigner: string;
  
  /** Extra data (nonce/qualifying data) */
  extraData: Buffer;
  
  /** Clock info */
  clockInfo: {
    clock: bigint;
    resetCount: number;
    restartCount: number;
    safe: boolean;
  };
  
  /** Firmware version */
  firmwareVersion: bigint;
  
  /** Attested data */
  attested: {
    quote: {
      /** PCR selection */
      pcrSelect: PcrSelection;
      
      /** Digest of selected PCRs */
      pcrDigest: Buffer;
    };
  };
}

// ============================================================================
// Attestation Verification Result
// ============================================================================

export interface SecureBootVerificationResult {
  /** Overall attestation status */
  status: AttestationStatus;
  
  /** Assurance level of this attestation */
  assurance: AttestationAssurance;
  
  /** Individual verification checks */
  quoteVerified: boolean;
  nonceVerified: boolean;
  pcrDigestVerified: boolean;
  policyVerified: boolean;
  
  /** Self-reported secure boot state */
  secureBootEnabled?: boolean;
  
  /** TPM present and accessible */
  tpmPresent?: boolean;
  tpmVersion?: string;
  
  /** When measurements were taken */
  measuredAt?: Date;
  
  /** Why verification failed or returned unknown */
  reason?: string;
  
  /** Detailed failure reasons */
  failures?: string[];
  
  /** Policy used for evaluation */
  policyId?: string;
  policyVersion?: number;
}

// ============================================================================
// Device Attestation Evidence
// ============================================================================

export interface DeviceAttestationEvidence {
  version: 1;
  
  deviceId: string;
  challengeId: string;
  
  /** Source of attestation evidence */
  source: 'TPM2' | 'TEE' | 'SOFTWARE';
  
  /** TPM quote and signature */
  quote?: {
    attestation: string;
    signature: string;
    akId: string;
  };
  
  /** Measurements */
  measurements: {
    pcrs?: Record<string, string>;
    measuredBootLog?: string;
  };
  
  /** Software claims (lower assurance) */
  claims: {
    secureBootEnabled?: boolean;
    osVersion?: string;
    kernelVersion?: string;
  };
}

// ============================================================================
// Device Attestation Record
// ============================================================================

export interface DeviceAttestation {
  id: string;
  tenantId: string;
  deviceId: string;
  
  /** Challenge that was responded to */
  challengeId: string;
  
  /** Verification result */
  status: AttestationStatus;
  assurance: AttestationAssurance;
  
  /** Individual check results */
  quoteVerified: boolean;
  nonceVerified: boolean;
  pcrDigestVerified: boolean;
  policyVerified: boolean;
  
  /** Failure reasons if any */
  failureReasons?: string[];
  
  /** PCR values at attestation time */
  pcrValues: Record<string, string>;
  
  /** Boot policy used for evaluation */
  bootPolicyId?: string;
  
  /** Secure boot state */
  secureBootEnabled?: boolean;
  
  /** When attestation was performed */
  attestedAt: Date;
}

// ============================================================================
// Boot Attestation Policy
// ============================================================================

export interface BootAttestationPolicy {
  id: string;
  tenantId: string;
  
  name: string;
  description: string;
  
  /** Platform identification */
  platformType: string;
  hardwareModel?: string;
  firmwareVersion?: string;
  operatingSystem?: string;
  osVersion?: string;
  
  /** Hash algorithm expected */
  hashAlgorithm: 'sha256' | 'sha384' | 'sha512';
  
  /** PCRs that must be present */
  requiredPcrs: number[];
  
  /** Allowed measurements per PCR */
  allowedMeasurements: BootPolicyMeasurement[];
  
  /** Event log validation rules */
  eventLogRules?: EventLogRule[];
  
  /** Policy lifecycle */
  status: PolicyStatus;
  version: number;
  
  validFrom: Date;
  validUntil?: Date;
  
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface BootPolicyMeasurement {
  /** PCR index */
  pcr: number;
  
  /** Allowed hash values for this PCR */
  values: string[];
  
  /** Description of what this PCR measures */
  description: string;
}

export interface EventLogRule {
  /** Event type to match */
  eventType: string;
  
  /** Expected digest values */
  allowedDigests?: string[];
  
  /** Required or optional */
  required: boolean;
  
  /** Description */
  description: string;
}

export enum PolicyStatus {
  /** Being created */
  DRAFT = 'DRAFT',
  
  /** Collecting measurements but not enforcing */
  OBSERVING = 'OBSERVING',
  
  /** Approved for use */
  APPROVED = 'APPROVED',
  
  /** Currently active */
  ACTIVE = 'ACTIVE',
  
  /** No longer used */
  RETIRED = 'RETIRED'
}

// ============================================================================
// Measured Boot
// ============================================================================

export interface MeasuredBootLog {
  /** TCG event log format version */
  specVersion: string;
  
  /** Platform type (UEFI, BIOS, etc.) */
  platformType: string;
  
  /** Boot events */
  events: BootEvent[];
  
  /** Final PCR state */
  finalPcrValues: Record<string, string>;
}

export interface BootEvent {
  /** PCR this event was extended to */
  pcrIndex: number;
  
  /** Event type code */
  eventType: string;
  
  /** Event type name */
  eventName: string;
  
  /** Digest of the event data */
  digest: string;
  
  /** Event data (varies by type) */
  eventData: any;
  
  /** Event sequence number */
  eventNum: number;
}

// ============================================================================
// Attestation Statistics
// ============================================================================

export interface AttestationStatistics {
  /** Total devices with attestation identity */
  totalEnrolledDevices: number;
  
  /** Recent attestation status breakdown */
  statusBreakdown: Record<AttestationStatus, number>;
  
  /** Attestations by assurance level */
  assuranceBreakdown: Record<AttestationAssurance, number>;
  
  /** Failed attestations in last 24h */
  recentFailures: number;
  
  /** Stale attestations (need refresh) */
  staleAttestations: number;
  
  /** Average attestation age */
  averageAttestationAgeSeconds: number;
  
  /** Policy compliance rate */
  policyComplianceRate: number;
}

// ============================================================================
// Attestation Configuration
// ============================================================================

export interface AttestationConfig {
  /** Maximum age before attestation is stale */
  maxAttestationAgeSeconds: number;
  
  /** Challenge expiration time */
  challengeExpirationSeconds: number;
  
  /** Challenge nonce length */
  nonceLengthBytes: number;
  
  /** Automatic re-attestation interval */
  reAttestationIntervalSeconds?: number;
  
  /** Attestation required for sensitive operations */
  requiredForOperations: string[];
  
  /** Fail-closed or fail-open on verification errors */
  failureMode: 'CLOSED' | 'OPEN';
}

// ============================================================================
// Attestation Events
// ============================================================================

export interface AttestationEvent {
  id: string;
  tenantId: string;
  deviceId: string;
  
  eventType: AttestationEventType;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  
  status: AttestationStatus;
  
  message: string;
  details?: any;
  
  timestamp: Date;
  
  /** Alert generated */
  alertId?: string;
}

export enum AttestationEventType {
  IDENTITY_ENROLLED = 'IDENTITY_ENROLLED',
  IDENTITY_REVOKED = 'IDENTITY_REVOKED',
  
  ATTESTATION_SUCCESS = 'ATTESTATION_SUCCESS',
  ATTESTATION_FAILED = 'ATTESTATION_FAILED',
  ATTESTATION_STALE = 'ATTESTATION_STALE',
  
  QUOTE_SIGNATURE_INVALID = 'QUOTE_SIGNATURE_INVALID',
  NONCE_MISMATCH = 'NONCE_MISMATCH',
  PCR_DIGEST_MISMATCH = 'PCR_DIGEST_MISMATCH',
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  
  BOOT_STATE_CHANGED = 'BOOT_STATE_CHANGED',
  PCR_VALUE_CHANGED = 'PCR_VALUE_CHANGED',
  
  FIRMWARE_UPDATE_DETECTED = 'FIRMWARE_UPDATE_DETECTED',
  UNEXPECTED_REBOOT = 'UNEXPECTED_REBOOT',
  
  POLICY_UPDATED = 'POLICY_UPDATED',
  CHALLENGE_EXPIRED = 'CHALLENGE_EXPIRED'
}

// ============================================================================
// Attestation API Types
// ============================================================================

export interface CreateChallengeRequest {
  deviceId: string;
  
  /** Optional: specify PCRs to include */
  pcrSelection?: PcrSelection;
}

export interface CreateChallengeResponse {
  challengeId: string;
  nonce: string;
  expiresAt: string;
  pcrSelection: PcrSelection;
}

export interface SubmitQuoteRequest {
  challengeId: string;
  deviceId: string;
  quote: string;
  signature: string;
  pcrSelection: PcrSelection;
  pcrValues: Record<string, string>;
  measuredBootLog?: string;
  secureBootState?: {
    enabled: boolean;
  };
}

export interface SubmitQuoteResponse {
  attestationId: string;
  status: AttestationStatus;
  verified: boolean;
  result: SecureBootVerificationResult;
}

export interface EnrollIdentityRequest {
  deviceId: string;
  akPublicKeyPem: string;
  akName?: string;
  tpmInfo?: {
    manufacturer: string;
    firmwareVersion: string;
    ekPublicKeyHash?: string;
  };
}

export interface EnrollIdentityResponse {
  identityId: string;
  enrolled: boolean;
  trustLevel: IdentityTrustLevel;
}

export interface AttestationStatusResponse {
  deviceId: string;
  status: AttestationStatus;
  assurance: AttestationAssurance;
  lastAttestation?: {
    attestedAt: string;
    ageSeconds: number;
    result: SecureBootVerificationResult;
  };
  identity?: {
    enrolled: boolean;
    trustLevel: IdentityTrustLevel;
    enrolledAt: string;
  };
}
