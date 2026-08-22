/**
 * PCR Digest Verifier
 * Recomputes PCR composite digest and validates against TPM quote
 */

import crypto from 'crypto';
import {
  TpmHashAlgorithm,
  PcrValue,
  TpmsAttest,
  AttestationFailureReason,
} from '../domain/attestation.types';
import { PcrDigestVerificationError } from '../domain/attestation-errors';

/**
 * Convert TPM hash algorithm to Node.js hash name
 */
function tpmHashToNodeHash(algorithm: TpmHashAlgorithm): string {
  switch (algorithm) {
    case TpmHashAlgorithm.SHA1:
      return 'sha1';
    case TpmHashAlgorithm.SHA256:
      return 'sha256';
    case TpmHashAlgorithm.SHA384:
      return 'sha384';
    case TpmHashAlgorithm.SHA512:
      return 'sha512';
    default:
      throw new PcrDigestVerificationError(
        `Unsupported hash algorithm: ${algorithm}`,
        { algorithm }
      );
  }
}

/**
 * Compute PCR composite digest according to TPM 2.0 specification
 * 
 * The PCR digest in a TPM quote is computed as:
 * Hash(PCR[n1] || PCR[n2] || ... || PCR[nk])
 * 
 * where n1, n2, ..., nk are the selected PCR indices in ascending order
 * 
 * @param pcrValues - Array of PCR values
 * @param selection - PCR selection (indices and hash algorithm)
 * @returns The computed PCR composite digest
 */
export function computePcrCompositeDigest(
  pcrValues: PcrValue[],
  selection: {
    hashAlgorithm: TpmHashAlgorithm;
    pcrs: number[];
  }
): Buffer {
  // Sort PCRs by index
  const sortedPcrIndices = [...selection.pcrs].sort((a, b) => a - b);
  
  // Build PCR value map for quick lookup
  const pcrMap = new Map<number, string>();
  for (const pcr of pcrValues) {
    pcrMap.set(pcr.index, pcr.value);
  }
  
  // Validate all requested PCRs are present
  const missingPcrs: number[] = [];
  for (const index of sortedPcrIndices) {
    if (!pcrMap.has(index)) {
      missingPcrs.push(index);
    }
  }
  
  if (missingPcrs.length > 0) {
    throw new PcrDigestVerificationError(
      `Missing PCR values for indices: ${missingPcrs.join(', ')}`,
      { missingPcrs }
    );
  }
  
  // Concatenate PCR values in order
  const pcrBuffers: Buffer[] = [];
  for (const index of sortedPcrIndices) {
    const pcrValue = pcrMap.get(index)!;
    
    // Convert hex string to buffer
    try {
      const pcrBuffer = Buffer.from(pcrValue, 'hex');
      pcrBuffers.push(pcrBuffer);
    } catch (error) {
      throw new PcrDigestVerificationError(
        `Invalid PCR value format for PCR ${index}: ${pcrValue}`,
        { pcrIndex: index, pcrValue, error }
      );
    }
  }
  
  // Concatenate all PCR values
  const pcrConcat = Buffer.concat(pcrBuffers);
  
  // Hash the concatenated PCR values
  const hashAlgorithm = tpmHashToNodeHash(selection.hashAlgorithm);
  const digest = crypto
    .createHash(hashAlgorithm)
    .update(pcrConcat)
    .digest();
  
  return digest;
}

/**
 * Verify PCR digest matches the digest in TPM quote
 * 
 * @param pcrValues - Submitted PCR values
 * @param parsedQuote - Parsed TPMS_ATTEST structure
 * @returns true if PCR digest matches
 */
export function verifyPcrDigest(
  pcrValues: PcrValue[],
  parsedQuote: TpmsAttest
): boolean {
  const selection = parsedQuote.attested.quote.pcrSelect;
  const quotePcrDigest = parsedQuote.attested.quote.pcrDigest;
  
  // Recompute PCR digest from submitted values
  const computedDigest = computePcrCompositeDigest(pcrValues, selection);
  
  // Compare digests using timing-safe comparison
  if (computedDigest.length !== quotePcrDigest.length) {
    throw new PcrDigestVerificationError(
      `PCR digest length mismatch: computed ${computedDigest.length} bytes, quote contains ${quotePcrDigest.length} bytes`,
      {
        reason: AttestationFailureReason.PCR_DIGEST_MISMATCH,
        computedLength: computedDigest.length,
        quoteLength: quotePcrDigest.length,
      }
    );
  }
  
  // Timing-safe comparison
  const match = crypto.timingSafeEqual(computedDigest, quotePcrDigest);
  
  if (!match) {
    throw new PcrDigestVerificationError(
      'PCR digest does not match TPM quote',
      {
        reason: AttestationFailureReason.PCR_DIGEST_MISMATCH,
        computedDigest: computedDigest.toString('hex'),
        quoteDigest: quotePcrDigest.toString('hex'),
      }
    );
  }
  
  return true;
}

/**
 * Validate PCR selection matches expected
 * 
 * @param submittedSelection - PCR selection from quote
 * @param expectedPcrs - Expected PCR indices
 * @returns true if selection matches
 */
export function validatePcrSelection(
  submittedSelection: {
    hashAlgorithm: TpmHashAlgorithm;
    pcrs: number[];
  },
  expectedPcrs: number[]
): boolean {
  // Sort both arrays for comparison
  const submittedPcrs = [...submittedSelection.pcrs].sort((a, b) => a - b);
  const expected = [...expectedPcrs].sort((a, b) => a - b);
  
  // Check length
  if (submittedPcrs.length !== expected.length) {
    throw new PcrDigestVerificationError(
      `PCR selection mismatch: expected ${expected.length} PCRs, got ${submittedPcrs.length}`,
      {
        reason: AttestationFailureReason.PCR_SELECTION_MISMATCH,
        expected,
        submitted: submittedPcrs,
      }
    );
  }
  
  // Check each PCR
  for (let i = 0; i < expected.length; i++) {
    if (submittedPcrs[i] !== expected[i]) {
      throw new PcrDigestVerificationError(
        `PCR selection mismatch: expected PCRs ${expected.join(',')}, got ${submittedPcrs.join(',')}`,
        {
          reason: AttestationFailureReason.PCR_SELECTION_MISMATCH,
          expected,
          submitted: submittedPcrs,
        }
      );
    }
  }
  
  return true;
}

/**
 * Validate PCR values format
 * 
 * @param pcrValues - PCR values to validate
 * @param hashAlgorithm - Expected hash algorithm
 * @returns Array of validation errors (empty if valid)
 */
export function validatePcrValuesFormat(
  pcrValues: PcrValue[],
  hashAlgorithm: TpmHashAlgorithm
): string[] {
  const errors: string[] = [];
  
  // Expected digest lengths
  const expectedLengths: Record<TpmHashAlgorithm, number> = {
    [TpmHashAlgorithm.SHA1]: 40, // 20 bytes * 2 hex chars
    [TpmHashAlgorithm.SHA256]: 64, // 32 bytes * 2 hex chars
    [TpmHashAlgorithm.SHA384]: 96, // 48 bytes * 2 hex chars
    [TpmHashAlgorithm.SHA512]: 128, // 64 bytes * 2 hex chars
  };
  
  const expectedLength = expectedLengths[hashAlgorithm];
  
  for (const pcr of pcrValues) {
    // Validate PCR index
    if (pcr.index < 0 || pcr.index > 23) {
      errors.push(`Invalid PCR index: ${pcr.index} (must be 0-23)`);
    }
    
    // Validate hex format
    if (!/^[0-9a-fA-F]+$/.test(pcr.value)) {
      errors.push(`PCR ${pcr.index} value is not valid hex: ${pcr.value}`);
    }
    
    // Validate length
    if (pcr.value.length !== expectedLength) {
      errors.push(
        `PCR ${pcr.index} value has wrong length: ${pcr.value.length} (expected ${expectedLength} for ${hashAlgorithm})`
      );
    }
  }
  
  // Check for duplicates
  const indices = pcrValues.map(p => p.index);
  const uniqueIndices = new Set(indices);
  if (indices.length !== uniqueIndices.size) {
    errors.push('Duplicate PCR indices found');
  }
  
  return errors;
}

/**
 * Get expected PCR digest size for hash algorithm
 */
export function getExpectedDigestSize(algorithm: TpmHashAlgorithm): number {
  switch (algorithm) {
    case TpmHashAlgorithm.SHA1:
      return 20;
    case TpmHashAlgorithm.SHA256:
      return 32;
    case TpmHashAlgorithm.SHA384:
      return 48;
    case TpmHashAlgorithm.SHA512:
      return 64;
    default:
      throw new Error(`Unknown hash algorithm: ${algorithm}`);
  }
}
