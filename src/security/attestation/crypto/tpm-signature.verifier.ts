/**
 * TPM Signature Verifier
 * Verifies TPM quote signatures using RSASSA, RSAPSS, and ECDSA with Node.js crypto
 */

import crypto from 'crypto';
import {
  TpmSignatureScheme,
  TpmHashAlgorithm,
  AttestationFailureReason,
} from '../domain/attestation.types.js';

export class SignatureVerificationError extends Error {
  constructor(message: string, public readonly details?: Record<string, any>) {
    super(message);
    this.name = 'SignatureVerificationError';
  }
}

function tpmHashToCryptoHash(tpmHash: TpmHashAlgorithm): string {
  switch (tpmHash) {
    case TpmHashAlgorithm.SHA1:
      return 'sha1';
    case TpmHashAlgorithm.SHA256:
      return 'sha256';
    case TpmHashAlgorithm.SHA384:
      return 'sha384';
    case TpmHashAlgorithm.SHA512:
      return 'sha512';
    default:
      throw new SignatureVerificationError(`Unsupported hash algorithm: ${tpmHash}`);
  }
}

export function calculatePublicKeyFingerprint(publicKeyPem: string): string {
  try {
    const keyObject = crypto.createPublicKey(publicKeyPem);
    const derBuffer = keyObject.export({
      format: 'der',
      type: 'spki',
    });
    return crypto.createHash('sha256').update(derBuffer).digest('hex');
  } catch (error) {
    throw new SignatureVerificationError(
      `Failed to calculate public key fingerprint: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function validatePublicKeyStrength(publicKeyPem: string): { valid: boolean; reason?: string } {
  try {
    const keyObject = crypto.createPublicKey(publicKeyPem);
    const details = keyObject.asymmetricKeyDetails;
    const keyType = keyObject.asymmetricKeyType;

    if (keyType === 'rsa' || keyType === 'rsa-pss') {
      const bits = details?.modulusLength;
      if (!bits || bits < 2048) {
        return {
          valid: false,
          reason: `RSA key length is too weak: ${bits || 'unknown'} bits (minimum 2048 required)`,
        };
      }
      return { valid: true };
    } else if (keyType === 'ec') {
      const curve = details?.namedCurve;
      const approvedCurves = ['prime256v1', 'secp384r1', 'secp521r1'];
      if (!curve || !approvedCurves.includes(curve)) {
        return {
          valid: false,
          reason: `EC curve is not in approved list: ${curve || 'unknown'}`,
        };
      }
      return { valid: true };
    }

    return { valid: false, reason: `Unsupported key type: ${keyType}` };
  } catch (error) {
    return {
      valid: false,
      reason: `Invalid public key format: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function verifyTpmQuoteSignature(
  quoteBytes: Buffer,
  signatureBuffer: Buffer,
  akPublicKeyPem: string,
  scheme: TpmSignatureScheme = TpmSignatureScheme.RSASSA,
  hashAlgorithm: TpmHashAlgorithm = TpmHashAlgorithm.SHA256
): boolean {
  // Validate key strength first
  const strength = validatePublicKeyStrength(akPublicKeyPem);
  if (!strength.valid) {
    throw new SignatureVerificationError(strength.reason || 'Public key strength check failed', {
      reason: AttestationFailureReason.UNTRUSTED_AK,
    });
  }

  const cryptoHash = tpmHashToCryptoHash(hashAlgorithm);

  try {
    switch (scheme) {
      case TpmSignatureScheme.RSASSA: {
        const verify = crypto.createVerify(cryptoHash);
        verify.update(quoteBytes);
        verify.end();
        return verify.verify(
          {
            key: akPublicKeyPem,
            padding: crypto.constants.RSA_PKCS1_PADDING,
          },
          signatureBuffer
        );
      }

      case TpmSignatureScheme.RSAPSS: {
        const verify = crypto.createVerify(cryptoHash);
        verify.update(quoteBytes);
        verify.end();
        return verify.verify(
          {
            key: akPublicKeyPem,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
          },
          signatureBuffer
        );
      }

      case TpmSignatureScheme.ECDSA: {
        const verify = crypto.createVerify(cryptoHash);
        verify.update(quoteBytes);
        verify.end();
        return verify.verify(akPublicKeyPem, signatureBuffer);
      }

      default:
        throw new SignatureVerificationError(`Unsupported signature scheme: ${scheme}`, {
          reason: AttestationFailureReason.UNSUPPORTED_TPM_ALGORITHM,
        });
    }
  } catch (error) {
    if (error instanceof SignatureVerificationError) throw error;
    return false;
  }
}
