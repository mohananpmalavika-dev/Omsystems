/**
 * TPM Attestation Domain Types
 * Cryptographically sound type definitions for remote attestation
 */

/**
 * TPM state represents the trustworthiness of the TPM itself
 * This is separate from platform/secure boot state
 */
export enum TpmState {
  /** TPM hardware not present on device */
  ABSENT = 'ABSENT',
  
  /** TPM detected but not yet responding */
  PRESENT = 'PRESENT',
  
  /** TPM responding to basic queries */
  RESPONDING = 'RESPONDING',
  
  /** TPM has provided cryptographically verified attestation evidence */
  ATTESTED = 'ATTESTED',
  
  /** TPM attestation failed cryptographic verification */
  FAILED = 'FAILED',
  
  /** TPM state cannot be determined */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Secure boot state represents platform boot integrity
 * This is derived from TPM evidence and policy evaluation
 */
export enum SecureBootState {
  /** Device reports secure boot enabled (not yet cryptographically verified) */
  ENABLED_REPORTED = 'ENABLED_REPORTED',
  
  /** Secure boot verified via TPM attestation and policy match */
  VERIFIED = 'VERIFIED',
  
  /** Secure boot verification failed (TPM attested but policy mismatch) */
  FAILED = 'FAILED',
  
  /** Secure boot state unknown (no TPM evidence or policy) */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Evidence freshness classification
 */
export enum AttestationFreshness {
  /** Evidence received within 5 minutes */
  FRESH = 'FRESH',
  
  /** Evidence between 5-30 minutes old */
  ACCEPTABLE = 'ACCEPTABLE',
  
  /** Evidence between 30-120 minutes old */
  STALE = 'STALE',
  
  /** Evidence older than 120 minutes */
  EXPIRED = 'EXPIRED',
}

/**
 * Specific reasons for attestation failure
 * Distinguishes cryptographic failures from policy failures
 */
export enum AttestationFailureReason {
  // Cryptographic failures
  NONCE_MISMATCH = 'NONCE_MISMATCH',
  QUOTE_SIGNATURE_INVALID = 'QUOTE_SIGNATURE_INVALID',
  QUOTE_PARSE_FAILED = 'QUOTE_PARSE_FAILED',
  PCR_DIGEST_MISMATCH = 'PCR_DIGEST_MISMATCH',
  PCR_SELECTION_MISMATCH = 'PCR_SELECTION_MISMATCH',
  INVALID_TPM_MAGIC = 'INVALID_TPM_MAGIC',
  INVALID_TPM_TYPE = 'INVALID_TPM_TYPE',
  UNSUPPORTED_TPM_ALGORITHM = 'UNSUPPORTED_TPM_ALGORITHM',
  
  // Trust failures
  AK_UNTRUSTED = 'AK_UNTRUSTED',
  AK_REVOKED = 'AK_REVOKED',
  AK_MISMATCH = 'AK_MISMATCH',
  AK_NOT_ENROLLED = 'AK_NOT_ENROLLED',
  
  // Protocol failures
  CHALLENGE_EXPIRED = 'CHALLENGE_EXPIRED',
  CHALLENGE_REPLAYED = 'CHALLENGE_REPLAYED',
  CHALLENGE_DEVICE_MISMATCH = 'CHALLENGE_DEVICE_MISMATCH',
  CHALLENGE_ALREADY_USED = 'CHALLENGE_ALREADY_USED',
  CHALLENGE_NOT_FOUND = 'CHALLENGE_NOT_FOUND',
  
  // Policy failures
  POLICY_MISMATCH = 'POLICY_MISMATCH',
  EVENT_LOG_MISMATCH = 'EVENT_LOG_MISMATCH',
  
  // Availability
  ATTESTATION_UNAVAILABLE = 'ATTESTATION_UNAVAILABLE',
  TPM_UNAVAILABLE = 'TPM_UNAVAILABLE',
}

/**
 * TPM signature schemes
 */
export enum TpmSignatureScheme {
  RSASSA = 'RSASSA',
  RSAPSS = 'RSAPSS',
  ECDSA = 'ECDSA',
  UNKNOWN = 'UNKNOWN',
}

/**
 * TPM hash algorithms
 */
export enum TpmHashAlgorithm {
  SHA1 = 'sha1',
  SHA256 = 'sha256',
  SHA384 = 'sha384',
  SHA512 = 'sha512',
}

/**
 * TPM quote structure type
 */
export const TPM_ST_ATTEST_QUOTE = 0x8018;
export const TPM_GENERATED_VALUE = 0xff544347; // 0xFF 'TCG'

/**
 * Attestation challenge issued by control plane
 * Contains cryptographic nonce and PCR selection
 */
export interface AttestationChallenge {
  /** Unique challenge identifier */
  id: string;
  
  /** Tenant owning the device */
  tenantId: string;
  
  /** Device being challenged */
  deviceId: string;
  
  /** Cryptographically secure random nonce (base64) */
  nonce: string;
  
  /** PCR indices requested in attestation */
  requestedPcrs: number[];
  
  /** Hash algorithm for PCR digest */
  hashAlgorithm: TpmHashAlgorithm;
  
  /** When challenge was created */
  createdAt: Date;
  
  /** When challenge expires */
  expiresAt: Date;
  
  /** When challenge was consumed (null if not yet used) */
  consumedAt: Date | null;
}

/**
 * PCR value in attestation evidence
 */
export interface PcrValue {
  /** PCR index (0-23 typically) */
  index: number;
  
  /** Hash algorithm */
  algorithm: string;
  
  /** PCR value (hex) */
  value: string;
}

/**
 * TPM attestation submission from edge agent
 */
export interface TpmAttestationSubmission {
  /** Challenge ID this evidence responds to */
  challengeId: string;
  
  /** TPM quote (base64 encoded TPMS_ATTEST structure) */
  quote: string;
  
  /** Quote signature (base64) */
  signature: string;
  
  /** PCR values at time of quote */
  pcrValues: PcrValue[];
  
  /** Attestation Key public key (PEM format) */
  akPublicKey: string;
  
  /** Optional AK certificate if available */
  akCertificate?: string;
  
  /** Optional AK certificate chain */
  akCertificateChain?: string[];
  
  /** Optional measured boot event log (base64) */
  eventLog?: string;
  
  /** TPM metadata */
  metadata: {
    tpmManufacturer?: string;
    tpmVersion?: string;
    firmwareVersion?: string;
  };
}

/**
 * Parsed TPMS_ATTEST structure
 */
export interface TpmsAttest {
  /** TPM generated magic (should be TPM_GENERATED_VALUE) */
  magic: number;
  
  /** Attestation type (should be TPM_ST_ATTEST_QUOTE) */
  type: number;
  
  /** Qualified name of signing key */
  qualifiedSigner: Buffer;
  
  /** External data (nonce) embedded in quote */
  extraData: Buffer;
  
  /** TPM clock info */
  clockInfo: {
    clock: bigint;
    resetCount: number;
    restartCount: number;
    safe: boolean;
  };
  
  /** TPM firmware version */
  firmwareVersion: bigint;
  
  /** Quote-specific attestation data */
  attested: {
    quote: {
      /** PCR selection */
      pcrSelect: {
        hashAlgorithm: TpmHashAlgorithm;
        pcrs: number[];
      };
      
      /** PCR composite digest */
      pcrDigest: Buffer;
    };
  };
  
  /** Raw quote bytes */
  rawBytes: Buffer;
}

/**
 * TPM quote verification result
 */
export interface TpmQuoteVerificationResult {
  /** Overall verification status */
  valid: boolean;
  
  /** Individual verification checks */
  nonceVerified: boolean | null;
  quoteSignatureVerified: boolean | null;
  pcrDigestVerified: boolean | null;
  akTrusted: boolean | null;
  pcrSelectionVerified: boolean | null;
  structureValid: boolean | null;
  
  /** Failure reason if not valid */
  failureReason?: AttestationFailureReason;
  
  /** Parsed quote structure (if parse succeeded) */
  parsedQuote?: TpmsAttest;
}

/**
 * PCR policy violation
 */
export interface PcrPolicyViolation {
  /** PCR index that violated policy */
  pcr: number;
  
  /** Expected policy identifier */
  expectedPolicy: string;
  
  /** Actual PCR digest received */
  actualDigest: string;
  
  /** Expected digest(s) from policy */
  expectedDigests: string[];
  
  /** Description of violation */
  description: string;
}

/**
 * PCR policy evaluation result
 */
export interface PcrPolicyEvaluationResult {
  /** Whether platform state matches policy */
  matched: boolean;
  
  /** Policy that was evaluated */
  policyId: string;
  
  /** List of violations (if any) */
  violations: PcrPolicyViolation[];
  
  /** Confidence in evaluation (0-1) */
  confidence: number;
}

/**
 * Complete attestation result
 */
export interface AttestationResult {
  /** TPM trust state */
  tpmState: TpmState;
  
  /** Secure boot/platform state */
  secureBootState: SecureBootState;
  
  /** When attestation was verified (null if not verified) */
  verifiedAt: Date | null;
  
  /** Evidence freshness classification */
  freshness?: AttestationFreshness;
  
  /** Individual verification checks */
  nonceVerified: boolean | null;
  quoteSignatureVerified: boolean | null;
  pcrDigestVerified: boolean | null;
  akTrusted: boolean | null;
  policyMatched: boolean | null;
  
  /** Failure reason if attestation failed */
  failureReason?: AttestationFailureReason;
  
  /** Policy violations if applicable */
  policyViolations?: PcrPolicyViolation[];
  
  /** Reference to stored evidence */
  evidenceId?: string;
  
  /** Challenge that was satisfied */
  challengeId?: string;
}

/**
 * Device attestation identity (enrolled AK)
 */
export interface DeviceAttestationIdentity {
  /** Unique identity ID */
  id: string;
  
  /** Tenant ID */
  tenantId: string;
  
  /** Device ID */
  deviceId: string;
  
  /** TPM AK name (hex) */
  akName: string;
  
  /** AK public key fingerprint (SHA256) */
  akPublicKeyFingerprint: string;
  
  /** AK public key (PEM) */
  akPublicKeyPem: string;
  
  /** Optional endorsement key fingerprint */
  endorsementKeyFingerprint?: string;
  
  /** TPM manufacturer */
  manufacturer?: string;
  
  /** Device model */
  model?: string;
  
  /** When AK was enrolled */
  enrolledAt: Date;
  
  /** When AK was revoked (null if active) */
  revokedAt: Date | null;
  
  /** Reason for revocation */
  revocationReason?: string;
}

/**
 * Attestation identity enrollment status
 */
export enum AttestationIdentityStatus {
  UNKNOWN = 'UNKNOWN',
  ENROLLED = 'ENROLLED',
  REVOKED = 'REVOKED',
}

/**
 * TPM attestation evidence record (immutable)
 */
export interface TpmAttestationEvidenceRecord {
  /** Unique evidence ID */
  id: string;
  
  /** Tenant ID */
  tenantId: string;
  
  /** Device ID */
  deviceId: string;
  
  /** Challenge ID this evidence responds to */
  challengeId: string;
  
  /** TPM quote (binary) */
  quote: Buffer;
  
  /** Quote signature (binary) */
  signature: Buffer;
  
  /** PCR values at time of quote */
  pcrValues: Record<number, string>;
  
  /** AK fingerprint used */
  akFingerprint: string;
  
  /** Optional event log */
  eventLog?: Buffer;
  
  /** TPM metadata */
  metadata: {
    tpmManufacturer?: string;
    tpmVersion?: string;
    firmwareVersion?: string;
  };
  
  /** When evidence was received */
  receivedAt: Date;
  
  /** Verification status */
  verificationStatus: 'PENDING' | 'VERIFIED' | 'FAILED' | 'UNKNOWN';
  
  /** When verification completed */
  verifiedAt?: Date;
  
  /** Verification failure reason */
  failureReason?: AttestationFailureReason;
  
  /** Policy evaluation result */
  policyEvaluationResult?: PcrPolicyEvaluationResult;
}

/**
 * PCR policy definition
 */
export interface PcrPolicy {
  /** Unique policy ID */
  id: string;
  
  /** Tenant ID */
  tenantId: string;
  
  /** Policy name */
  name: string;
  
  /** Platform identifier */
  platform: string;
  
  /** Optional device model filter */
  deviceModel?: string;
  
  /** Optional firmware version filter */
  firmwareVersion?: string;
  
  /** Allowed PCR measurements */
  allowedMeasurements: Array<{
    /** PCR index */
    pcr: number;
    
    /** Hash algorithm */
    algorithm: TpmHashAlgorithm;
    
    /** Allowed digest values */
    digests: string[];
    
    /** Description of what this PCR measures */
    description: string;
  }>;
  
  /** Policy valid from */
  validFrom: Date;
  
  /** Policy valid until (null for no expiration) */
  validUntil: Date | null;
  
  /** Policy status */
  status: 'ACTIVE' | 'REVOKED';
  
  /** Created timestamp */
  createdAt: Date;
  
  /** Updated timestamp */
  updatedAt: Date;
}

/**
 * Attestation statistics
 */
export interface AttestationStatistics {
  /** Total challenges issued */
  totalChallenges: number;
  
  /** Total evidence submissions */
  totalSubmissions: number;
  
  /** Verified attestations */
  verified: number;
  
  /** Failed attestations */
  failed: number;
  
  /** Pending attestations */
  pending: number;
  
  /** Expired challenges */
  expiredChallenges: number;
  
  /** Devices with enrolled AKs */
  enrolledDevices: number;
  
  /** Devices with revoked AKs */
  revokedDevices: number;
  
  /** Average verification time (ms) */
  averageVerificationTimeMs: number;
}

/**
 * Attestation configuration
 */
export interface AttestationConfiguration {
  /** Challenge expiration time (seconds) */
  challengeExpirationSeconds: number;
  
  /** Maximum evidence age for FRESH classification (seconds) */
  freshThresholdSeconds: number;
  
  /** Maximum evidence age for ACCEPTABLE classification (seconds) */
  acceptableThresholdSeconds: number;
  
  /** Maximum evidence age for STALE classification (seconds) */
  staleThresholdSeconds: number;
  
  /** Default PCRs to request in challenges */
  defaultPcrSelection: number[];
  
  /** Default hash algorithm */
  defaultHashAlgorithm: TpmHashAlgorithm;
  
  /** Rate limit: max challenges per device per hour */
  maxChallengesPerDevicePerHour: number;
}
