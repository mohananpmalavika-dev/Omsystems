/**
 * Attestation Cryptography Utilities
 * Nonce generation, hashing, and timing-safe comparisons
 */

import crypto from 'crypto';

/**
 * Generate a cryptographically secure random nonce
 */
export function createNonce(lengthBytes: number = 32): string {
  return crypto.randomBytes(lengthBytes).toString('base64url');
}

/**
 * Hash a nonce for storage
 * We store hashes rather than raw nonces
 */
export function hashNonce(nonce: string): string {
  return crypto
    .createHash('sha256')
    .update(nonce)
    .digest('hex');
}

/**
 * Timing-safe comparison of hex strings
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Verify challenge nonce matches what was attested
 */
export function verifyChallengeNonce(
  attestedNonce: Buffer,
  expectedNonceHash: string
): boolean {
  const attestedNonceHash = crypto
    .createHash('sha256')
    .update(attestedNonce)
    .digest('hex');
  
  return timingSafeEqual(attestedNonceHash, expectedNonceHash);
}

/**
 * Calculate PCR composite digest
 * This reconstructs what should be in the TPM quote
 */
export function calculatePcrCompositeDigest(
  pcrValues: Record<string, string>,
  selection: { hashAlgorithm: string; pcrs: number[] }
): Buffer {
  // Sort PCRs by index
  const sortedPcrs = selection.pcrs.sort((a, b) => a - b);
  
  // Concatenate PCR values in order
  const pcrConcat = sortedPcrs
    .map(index => {
      const value = pcrValues[index.toString()];
      if (!value) {
        throw new Error(`Missing PCR ${index} value`);
      }
      return Buffer.from(value, 'hex');
    })
    .reduce((acc, buf) => Buffer.concat([acc, buf]), Buffer.alloc(0));
  
  // Hash the concatenated PCRs
  const hashAlgo = selection.hashAlgorithm === 'sha1' ? 'sha1' : 'sha256';
  return crypto
    .createHash(hashAlgo)
    .update(pcrConcat)
    .digest();
}

/**
 * Generate canonical attestation challenge payload
 */
export function createChallengePayload(challenge: {
  challengeId: string;
  tenantId: string;
  deviceId: string;
  nonce: string;
  issuedAt: number;
  policyId: string;
  pcrSelection: any;
}): string {
  // Create canonical JSON (sorted keys)
  const canonical = JSON.stringify(
    {
      version: 1,
      challengeId: challenge.challengeId,
      tenantId: challenge.tenantId,
      deviceId: challenge.deviceId,
      nonce: challenge.nonce,
      issuedAt: challenge.issuedAt,
      policyId: challenge.policyId,
      pcrSelection: challenge.pcrSelection
    },
    Object.keys({}).sort()
  );
  
  return canonical;
}

/**
 * Hash challenge payload for qualifying data
 */
export function hashChallengePayload(payload: string): Buffer {
  return crypto
    .createHash('sha256')
    .update(payload)
    .digest();
}

/**
 * Validate PCR selection matches expected
 */
export function validatePcrSelection(
  submitted: { hashAlgorithm: string; pcrs: number[] },
  expected: number[]
): boolean {
  const submittedPcrs = [...submitted.pcrs].sort((a, b) => a - b);
  const expectedPcrs = [...expected].sort((a, b) => a - b);
  
  if (submittedPcrs.length !== expectedPcrs.length) {
    return false;
  }
  
  return submittedPcrs.every((pcr, idx) => pcr === expectedPcrs[idx]);
}

/**
 * Check if attestation is fresh
 */
export function isAttestationFresh(
  attestedAt: Date,
  maxAgeSeconds: number
): boolean {
  const now = new Date();
  const ageSeconds = (now.getTime() - attestedAt.getTime()) / 1000;
  return ageSeconds <= maxAgeSeconds;
}

/**
 * Generate attestation ID
 */
export function generateAttestationId(): string {
  return `att_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Generate challenge ID
 */
export function generateChallengeId(): string {
  return `chal_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Generate identity ID
 */
export function generateIdentityId(): string {
  return `ident_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Extract PCR digest from TPM quote
 * This is a simplified version - real implementation needs full TPM2 parsing
 */
export function extractPcrDigestFromQuote(quote: Buffer): Buffer | null {
  try {
    // This is placeholder - real implementation needs TPM2 structure parsing
    // Would use tpm2-tss or similar library
    // For now, return null to indicate not implemented
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Parse extra data (nonce) from TPM quote
 */
export function extractExtraDataFromQuote(quote: Buffer): Buffer | null {
  try {
    // Placeholder - needs TPM2 structure parsing
    return null;
  } catch (error) {
    return null;
  }
}
