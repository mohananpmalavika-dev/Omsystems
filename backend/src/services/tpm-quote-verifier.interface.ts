/**
 * TPM Quote Verifier Interface
 * Abstracts TPM quote parsing and cryptographic verification
 */

import {
  ParsedTpmQuote,
  PcrSelection
} from '../types/attestation.types';

/**
 * Interface for TPM quote verification implementations
 */
export interface TpmQuoteVerifier {
  /**
   * Parse TPM quote from base64 encoded data
   */
  parse(quote: string): Promise<ParsedTpmQuote>;

  /**
   * Verify TPM quote signature using AK public key
   */
  verifySignature(input: {
    quote: string;
    signature: string;
    akPublicKeyPem: string;
  }): Promise<boolean>;

  /**
   * Verify PCR digest in quote matches submitted PCR values
   */
  verifyPcrDigest(input: {
    quote: ParsedTpmQuote;
    pcrValues: Record<string, string>;
    selection: PcrSelection;
  }): Promise<boolean>;

  /**
   * Extract nonce/extra data from quote
   */
  extractExtraData(quote: string): Promise<Buffer>;

  /**
   * Extract PCR digest from quote
   */
  extractPcrDigest(quote: ParsedTpmQuote): Buffer;
}

/**
 * Verification error types
 */
export class QuoteVerificationError extends Error {
  constructor(
    message: string,
    public code: QuoteVerificationErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'QuoteVerificationError';
  }
}

export enum QuoteVerificationErrorCode {
  INVALID_QUOTE_FORMAT = 'INVALID_QUOTE_FORMAT',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',
  PCR_DIGEST_MISMATCH = 'PCR_DIGEST_MISMATCH',
  UNSUPPORTED_ALGORITHM = 'UNSUPPORTED_ALGORITHM',
  PARSING_ERROR = 'PARSING_ERROR'
}
