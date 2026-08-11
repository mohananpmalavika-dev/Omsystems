/**
 * TPM Attestation Error Classes
 * Specific error types for attestation failures
 */

import { AttestationFailureReason } from './attestation.types';

/**
 * Base class for all attestation errors
 */
export class AttestationError extends Error {
  constructor(
    message: string,
    public readonly reason: AttestationFailureReason,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AttestationError';
    Object.setPrototypeOf(this, AttestationError.prototype);
  }
}

/**
 * Cryptographic verification failure
 */
export class CryptographicVerificationError extends AttestationError {
  constructor(
    reason: AttestationFailureReason,
    message: string,
    details?: Record<string, any>
  ) {
    super(message, reason, details);
    this.name = 'CryptographicVerificationError';
    Object.setPrototypeOf(this, CryptographicVerificationError.prototype);
  }
}

/**
 * Challenge protocol violation
 */
export class ChallengeProtocolError extends AttestationError {
  constructor(
    reason: AttestationFailureReason,
    message: string,
    details?: Record<string, any>
  ) {
    super(message, reason, details);
    this.name = 'ChallengeProtocolError';
    Object.setPrototypeOf(this, ChallengeProtocolError.prototype);
  }
}

/**
 * Attestation key trust failure
 */
export class AttestationKeyTrustError extends AttestationError {
  constructor(
    reason: AttestationFailureReason,
    message: string,
    details?: Record<string, any>
  ) {
    super(message, reason, details);
    this.name = 'AttestationKeyTrustError';
    Object.setPrototypeOf(this, AttestationKeyTrustError.prototype);
  }
}

/**
 * PCR policy evaluation failure
 */
export class PcrPolicyError extends AttestationError {
  constructor(
    reason: AttestationFailureReason,
    message: string,
    details?: Record<string, any>
  ) {
    super(message, reason, details);
    this.name = 'PcrPolicyError';
    Object.setPrototypeOf(this, PcrPolicyError.prototype);
  }
}

/**
 * TPM operation not supported on this platform
 */
export class UnsupportedSecurityOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedSecurityOperationError';
    Object.setPrototypeOf(this, UnsupportedSecurityOperationError.prototype);
  }
}

/**
 * TPM quote parsing failure
 */
export class TpmQuoteParseError extends CryptographicVerificationError {
  constructor(message: string, details?: Record<string, any>) {
    super(AttestationFailureReason.QUOTE_PARSE_FAILED, message, details);
    this.name = 'TpmQuoteParseError';
    Object.setPrototypeOf(this, TpmQuoteParseError.prototype);
  }
}

/**
 * Nonce verification failure
 */
export class NonceVerificationError extends CryptographicVerificationError {
  constructor(message: string, details?: Record<string, any>) {
    super(AttestationFailureReason.NONCE_MISMATCH, message, details);
    this.name = 'NonceVerificationError';
    Object.setPrototypeOf(this, NonceVerificationError.prototype);
  }
}

/**
 * Signature verification failure
 */
export class SignatureVerificationError extends CryptographicVerificationError {
  constructor(message: string, details?: Record<string, any>) {
    super(AttestationFailureReason.QUOTE_SIGNATURE_INVALID, message, details);
    this.name = 'SignatureVerificationError';
    Object.setPrototypeOf(this, SignatureVerificationError.prototype);
  }
}

/**
 * PCR digest mismatch
 */
export class PcrDigestVerificationError extends CryptographicVerificationError {
  constructor(message: string, details?: Record<string, any>) {
    super(AttestationFailureReason.PCR_DIGEST_MISMATCH, message, details);
    this.name = 'PcrDigestVerificationError';
    Object.setPrototypeOf(this, PcrDigestVerificationError.prototype);
  }
}
