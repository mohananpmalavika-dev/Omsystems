/**
 * TPM 2.0 Remote Attestation Types
 */

export const TPM_GENERATED_VALUE = 0xff544347;
export const TPM_ST_ATTEST_QUOTE = 0x8018;

export enum TpmHashAlgorithm {
  SHA1 = 'sha1',
  SHA256 = 'sha256',
  SHA384 = 'sha384',
  SHA512 = 'sha512',
}

export enum TpmSignatureScheme {
  RSASSA = 'RSASSA',
  RSAPSS = 'RSAPSS',
  ECDSA = 'ECDSA',
}

export enum TpmState {
  ABSENT = 'ABSENT',
  PRESENT = 'PRESENT',
  RESPONDING = 'RESPONDING',
  ATTESTED = 'ATTESTED',
  FAILED = 'FAILED',
  COMPROMISED = 'COMPROMISED',
  UNKNOWN = 'UNKNOWN',
}

export enum SecureBootState {
  ENABLED_REPORTED = 'ENABLED_REPORTED',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
  UNSUPPORTED = 'UNSUPPORTED',
  UNKNOWN = 'UNKNOWN',
}

export enum AttestationFailureReason {
  INVALID_TPM_MAGIC = 'INVALID_TPM_MAGIC',
  INVALID_TPM_TYPE = 'INVALID_TPM_TYPE',
  CHALLENGE_EXPIRED = 'CHALLENGE_EXPIRED',
  CHALLENGE_ALREADY_USED = 'CHALLENGE_ALREADY_USED',
  CHALLENGE_NOT_FOUND = 'CHALLENGE_NOT_FOUND',
  NONCE_MISMATCH = 'NONCE_MISMATCH',
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',
  UNTRUSTED_AK = 'UNTRUSTED_AK',
  REVOKED_AK = 'REVOKED_AK',
  PCR_SELECTION_MISMATCH = 'PCR_SELECTION_MISMATCH',
  PCR_DIGEST_MISMATCH = 'PCR_DIGEST_MISMATCH',
  PCR_POLICY_VIOLATION = 'PCR_POLICY_VIOLATION',
  SECURE_BOOT_VIOLATION = 'SECURE_BOOT_VIOLATION',
  UNSUPPORTED_TPM_ALGORITHM = 'UNSUPPORTED_TPM_ALGORITHM',
  INVALID_PAYLOAD_STRUCTURE = 'INVALID_PAYLOAD_STRUCTURE',
}

export interface PcrSelection {
  hashAlgorithm: TpmHashAlgorithm;
  pcrs: number[];
}

export interface TpmsClockInfo {
  clock: bigint;
  resetCount: number;
  restartCount: number;
  safe: boolean;
}

export interface TpmsAttestQuote {
  pcrSelect: PcrSelection;
  pcrDigest: Buffer;
}

export interface TpmsAttest {
  magic: number;
  type: number;
  qualifiedSigner: Buffer;
  extraData: Buffer; // Qualifying data / challenge nonce
  clockInfo: TpmsClockInfo;
  firmwareVersion: bigint;
  attested: {
    quote: TpmsAttestQuote;
  };
  rawBytes: Buffer;
}

export interface TpmAttestationSubmission {
  challengeId: string;
  quote: string; // base64 encoded TPMS_ATTEST
  signature: string; // base64 encoded TPM signature
  pcrValues: Record<string, string>; // PCR index -> hex string
  pcrSelection?: PcrSelection;
  akPublicKeyPem?: string;
  secureBootReported?: boolean;
  metadata?: Record<string, any>;
}

export interface TpmQuoteVerificationResult {
  valid: boolean;
  structureValid: boolean;
  nonceVerified: boolean;
  quoteSignatureVerified: boolean;
  pcrDigestVerified: boolean;
  akTrusted: boolean;
  pcrSelectionVerified: boolean;
  policyMatched: boolean;
  tpmState: TpmState;
  secureBootState: SecureBootState;
  failureReason?: AttestationFailureReason | string;
  parsedQuote?: TpmsAttest;
  evidenceId?: string;
  challengeId?: string;
}
