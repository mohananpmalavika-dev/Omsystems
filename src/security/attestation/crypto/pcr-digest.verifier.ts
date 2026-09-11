/**
 * PCR Digest Verifier
 * Recomputes PCR composite digest and validates against TPM quote
 */

import crypto from 'crypto';
import {
  TpmHashAlgorithm,
  AttestationFailureReason,
} from '../domain/attestation.types.js';

export class PcrDigestVerificationError extends Error {
  constructor(message: string, public readonly details?: Record<string, any>) {
    super(message);
    this.name = 'PcrDigestVerificationError';
  }
}

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
      throw new PcrDigestVerificationError(`Unsupported hash algorithm: ${algorithm}`);
  }
}

/**
 * Compute PCR composite digest according to TPM 2.0 specification:
 * Hash(PCR[n1] || PCR[n2] || ... || PCR[nk])
 * where n1 < n2 < ... < nk are the selected PCR indices in ascending order
 */
export function computePcrCompositeDigest(
  pcrValues: Record<string, string>,
  selection: {
    hashAlgorithm: TpmHashAlgorithm;
    pcrs: number[];
  }
): Buffer {
  const sortedPcrs = [...selection.pcrs].sort((a, b) => a - b);
  const pcrBuffers: Buffer[] = [];

  for (const index of sortedPcrs) {
    const rawValue = pcrValues[index.toString()] || pcrValues[index as any];
    if (!rawValue) {
      throw new PcrDigestVerificationError(`Missing PCR value for index ${index}`, {
        missingPcr: index,
      });
    }

    // Strip optional 0x prefix and convert to buffer
    const cleanHex = rawValue.replace(/^0x/i, '').trim();
    if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
      throw new PcrDigestVerificationError(`PCR ${index} value is not valid hex: ${rawValue}`);
    }

    pcrBuffers.push(Buffer.from(cleanHex, 'hex'));
  }

  const concatenated = Buffer.concat(pcrBuffers);
  const nodeHash = tpmHashToNodeHash(selection.hashAlgorithm);
  return crypto.createHash(nodeHash).update(concatenated).digest();
}

/**
 * Timing-safe verification of recomputed PCR composite digest against quote digest
 */
export function verifyPcrDigest(
  pcrValues: Record<string, string>,
  quotedDigest: Buffer,
  selection: { hashAlgorithm: TpmHashAlgorithm; pcrs: number[] }
): boolean {
  const computed = computePcrCompositeDigest(pcrValues, selection);

  if (computed.length !== quotedDigest.length) {
    throw new PcrDigestVerificationError(
      `PCR digest length mismatch: computed ${computed.length} bytes, quoted contains ${quotedDigest.length} bytes`,
      {
        reason: AttestationFailureReason.PCR_DIGEST_MISMATCH,
        computedLength: computed.length,
        quotedLength: quotedDigest.length,
      }
    );
  }

  const match = crypto.timingSafeEqual(computed, quotedDigest);
  if (!match) {
    throw new PcrDigestVerificationError('PCR composite digest does not match quote', {
      reason: AttestationFailureReason.PCR_DIGEST_MISMATCH,
      computedDigest: computed.toString('hex'),
      quotedDigest: quotedDigest.toString('hex'),
    });
  }

  return true;
}
