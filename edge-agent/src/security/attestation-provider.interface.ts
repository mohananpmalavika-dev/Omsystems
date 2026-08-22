/**
 * Attestation Provider Interface
 * Abstracts platform-specific TPM/TEE attestation implementations
 */

export interface AttestationIdentity {
  akPublicKeyPem: string;
  akName?: string;
  ekPublicKeyHash?: string;
  tpmManufacturer?: string;
  tpmFirmwareVersion?: string;
}

export interface AttestationChallenge {
  challengeId: string;
  nonce: string;
  expiresAt: string;
  pcrSelection: {
    hashAlgorithm: string;
    pcrs: number[];
  };
}

export interface TpmQuoteEvidence {
  quote: string;
  signature: string;
  pcrSelection: {
    hashAlgorithm: string;
    pcrs: number[];
  };
  pcrValues: Record<string, string>;
  secureBootState?: {
    enabled: boolean;
    mode?: string;
  };
}

export interface AttestationProvider {
  /**
   * Check if attestation is supported on this platform
   */
  isSupported(): Promise<boolean>;

  /**
   * Get attestation identity (AK public key)
   */
  getIdentity(): Promise<AttestationIdentity>;

  /**
   * Generate TPM quote for challenge
   */
  quote(challenge: AttestationChallenge): Promise<TpmQuoteEvidence>;

  /**
   * Get measured boot log (optional)
   */
  getMeasuredBootLog?(): Promise<Buffer | null>;

  /**
   * Get secure boot state
   */
  getSecureBootState(): Promise<{ enabled: boolean; mode?: string } | null>;
}

export class AttestationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AttestationError';
  }
}
