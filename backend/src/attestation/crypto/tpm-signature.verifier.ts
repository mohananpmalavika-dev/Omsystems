/**
 * TPM Signature Verifier
 * Verifies TPM quote signatures using various signature schemes
 * Supports RSASSA, RSAPSS, and ECDSA
 */

import crypto from 'crypto';
import {
  TpmSignatureScheme,
  TpmHashAlgorithm,
  AttestationFailureReason,
} from '../domain/attestation.types';
import { SignatureVerificationError } from '../domain/attestation-errors';

/**
 * Signature scheme detection from signature format
 * In a production system, this would come from TPM signature structure
 */
export interface TpmSignatureInfo {
  scheme: TpmSignatureScheme;
  hashAlgorithm: TpmHashAlgorithm;
  signatureBytes: Buffer;
}

/**
 * Parse TPM signature structure
 * 
 * Note: This is a simplified version. Real TPM signatures include:
 * - TPMT_SIGNATURE structure with scheme and parameters
 * - For now, we assume RSA signature with SHA256
 * 
 * Production implementation should parse full TPMT_SIGNATURE
 */
export function parseTpmSignature(signatureBuffer: Buffer): TpmSignatureInfo {
  // For now, assume RSASSA with SHA256
  // In production, parse TPMT_SIGNATURE structure:
  // - sigAlg (2 bytes)
  // - signature parameters based on algorithm
  
  return {
    scheme: TpmSignatureScheme.RSASSA,
    hashAlgorithm: TpmHashAlgorithm.SHA256,
    signatureBytes: signatureBuffer,
  };
}

/**
 * Convert TPM hash algorithm to Node.js crypto algorithm name
 */
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
      throw new SignatureVerificationError(
        `Unsupported hash algorithm: ${tpmHash}`,
        { algorithm: tpmHash }
      );
  }
}

/**
 * Verify RSASSA signature
 */
function verifyRsassaSignature(
  message: Buffer,
  signature: Buffer,
  publicKeyPem: string,
  hashAlgorithm: TpmHashAlgorithm
): boolean {
  try {
    const verify = crypto.createVerify(tpmHashToCryptoHash(hashAlgorithm));
    verify.update(message);
    verify.end();
    
    return verify.verify(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      signature
    );
  } catch (error) {
    throw new SignatureVerificationError(
      `RSASSA verification failed: ${error instanceof Error ? error.message : String(error)}`,
      { error }
    );
  }
}

/**
 * Verify RSAPSS signature
 */
function verifyRsaPssSignature(
  message: Buffer,
  signature: Buffer,
  publicKeyPem: string,
  hashAlgorithm: TpmHashAlgorithm
): boolean {
  try {
    const hashAlg = tpmHashToCryptoHash(hashAlgorithm);
    const verify = crypto.createVerify(hashAlg);
    verify.update(message);
    verify.end();
    
    return verify.verify(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      },
      signature
    );
  } catch (error) {
    throw new SignatureVerificationError(
      `RSAPSS verification failed: ${error instanceof Error ? error.message : String(error)}`,
      { error }
    );
  }
}

/**
 * Verify ECDSA signature
 */
function verifyEcdsaSignature(
  message: Buffer,
  signature: Buffer,
  publicKeyPem: string,
  hashAlgorithm: TpmHashAlgorithm
): boolean {
  try {
    const verify = crypto.createVerify(tpmHashToCryptoHash(hashAlgorithm));
    verify.update(message);
    verify.end();
    
    return verify.verify(publicKeyPem, signature);
  } catch (error) {
    throw new SignatureVerificationError(
      `ECDSA verification failed: ${error instanceof Error ? error.message : String(error)}`,
      { error }
    );
  }
}

/**
 * Verify TPM quote signature
 * 
 * @param quoteBytes - The TPMS_ATTEST structure bytes (what was signed)
 * @param signatureBuffer - The TPM signature
 * @param akPublicKeyPem - Attestation Key public key in PEM format
 * @returns true if signature is valid
 */
export function verifyTpmQuoteSignature(
  quoteBytes: Buffer,
  signatureBuffer: Buffer,
  akPublicKeyPem: string
): boolean {
  // Parse signature to determine scheme
  const signatureInfo = parseTpmSignature(signatureBuffer);
  
  // Verify based on signature scheme
  switch (signatureInfo.scheme) {
    case TpmSignatureScheme.RSASSA:
      return verifyRsassaSignature(
        quoteBytes,
        signatureInfo.signatureBytes,
        akPublicKeyPem,
        signatureInfo.hashAlgorithm
      );
    
    case TpmSignatureScheme.RSAPSS:
      return verifyRsaPssSignature(
        quoteBytes,
        signatureInfo.signatureBytes,
        akPublicKeyPem,
        signatureInfo.hashAlgorithm
      );
    
    case TpmSignatureScheme.ECDSA:
      return verifyEcdsaSignature(
        quoteBytes,
        signatureInfo.signatureBytes,
        akPublicKeyPem,
        signatureInfo.hashAlgorithm
      );
    
    default:
      throw new SignatureVerificationError(
        `Unsupported signature scheme: ${signatureInfo.scheme}`,
        {
          reason: AttestationFailureReason.UNSUPPORTED_TPM_ALGORITHM,
          scheme: signatureInfo.scheme,
        }
      );
  }
}

/**
 * Extract public key fingerprint (SHA256)
 */
export function calculatePublicKeyFingerprint(publicKeyPem: string): string {
  // Extract the key object
  const keyObject = crypto.createPublicKey(publicKeyPem);
  
  // Export as DER format (binary)
  const derBuffer = keyObject.export({
    format: 'der',
    type: 'spki',
  });
  
  // Calculate SHA256 hash
  return crypto
    .createHash('sha256')
    .update(derBuffer)
    .digest('hex');
}

/**
 * Validate public key format
 */
export function validatePublicKeyFormat(publicKeyPem: string): boolean {
  try {
    crypto.createPublicKey(publicKeyPem);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract key algorithm from public key
 */
export function getPublicKeyAlgorithm(publicKeyPem: string): {
  type: 'rsa' | 'ec' | 'unknown';
  bits?: number;
  curve?: string;
} {
  try {
    const keyObject = crypto.createPublicKey(publicKeyPem);
    const keyDetails = keyObject.asymmetricKeyDetails;
    
    if (!keyDetails) {
      return { type: 'unknown' };
    }
    
    const keyType = keyObject.asymmetricKeyType;
    
    if (keyType === 'rsa' || keyType === 'rsa-pss') {
      return {
        type: 'rsa',
        bits: keyDetails.modulusLength,
      };
    } else if (keyType === 'ec') {
      return {
        type: 'ec',
        curve: keyDetails.namedCurve,
      };
    }
    
    return { type: 'unknown' };
  } catch {
    return { type: 'unknown' };
  }
}

/**
 * Validate public key meets minimum security requirements
 */
export function validatePublicKeyStrength(publicKeyPem: string): {
  valid: boolean;
  reason?: string;
} {
  const keyInfo = getPublicKeyAlgorithm(publicKeyPem);
  
  if (keyInfo.type === 'rsa') {
    // RSA keys should be at least 2048 bits
    if (!keyInfo.bits || keyInfo.bits < 2048) {
      return {
        valid: false,
        reason: `RSA key too weak: ${keyInfo.bits} bits (minimum 2048)`,
      };
    }
    return { valid: true };
  } else if (keyInfo.type === 'ec') {
    // ECC curves - validate against known secure curves
    const secureCurves = ['prime256v1', 'secp384r1', 'secp521r1'];
    if (!keyInfo.curve || !secureCurves.includes(keyInfo.curve)) {
      return {
        valid: false,
        reason: `Unsupported or weak EC curve: ${keyInfo.curve}`,
      };
    }
    return { valid: true };
  }
  
  return {
    valid: false,
    reason: 'Unknown key type',
  };
}
