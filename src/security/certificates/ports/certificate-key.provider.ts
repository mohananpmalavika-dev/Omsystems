/**
 * Certificate Key Provider Interface
 * Pluggable abstraction for key generation and storage
 */

import {
  GenerateCertificateKeyRequest,
  GeneratedKeyReference,
  CreateCsrRequest,
  GeneratedCsr,
  KeyProvider,
  KeyAlgorithm
} from '../domain/certificate-lifecycle.types.js';

/**
 * Certificate Key Provider Interface
 * 
 * Abstracts key generation and storage across different backends:
 * - Software (in-memory or file-based)
 * - PKCS#11 HSM
 * - TPM
 * - Cloud KMS (AWS, Azure, GCP)
 * - Vault Transit
 * 
 * Key principle: Private keys should stay in their security boundary.
 * The provider manages key references, not raw key material (when possible).
 */
export interface CertificateKeyProvider {
  /**
   * Provider type identifier
   */
  readonly providerType: KeyProvider;

  /**
   * Generate a new key pair for certificate use
   * 
   * @param request - Key generation request with algorithm and parameters
   * @returns Key reference (not the private key itself when using HSM/KMS)
   * 
   * Implementation notes:
   * - MUST generate cryptographically secure keys
   * - SHOULD keep private key in secure storage
   * - MUST return public key in PEM format
   * - For HSM/KMS: private key NEVER leaves the device
   * - For software: key may be exportable based on request.exportable
   */
  generateKey(
    request: GenerateCertificateKeyRequest
  ): Promise<GeneratedKeyReference>;

  /**
   * Create a Certificate Signing Request using a previously generated key
   * 
   * @param request - CSR creation request with key reference and subject
   * @returns Generated CSR in PEM format with SHA-256 hash
   * 
   * Implementation notes:
   * - MUST use the specified key to sign the CSR
   * - MUST include all requested subject attributes
   * - MUST include all requested SANs
   * - MUST include requested key usage extensions
   * - CSR signature MUST be verifiable
   */
  createCsr(request: CreateCsrRequest): Promise<GeneratedCsr>;

  /**
   * Sign arbitrary data with a key (optional operation)
   * 
   * @param keyReference - Key ID to use for signing
   * @param payload - Data to sign
   * @returns Signature bytes
   * 
   * Implementation notes:
   * - Only required for advanced use cases
   * - Used for challenge-response protocols
   * - MUST use appropriate signature algorithm for key type
   */
  sign?(keyReference: string, payload: Buffer): Promise<Buffer>;

  /**
   * Export a private key (if exportable)
   * 
   * @param keyReference - Key ID to export
   * @param format - Export format (PEM, DER, PKCS8, etc.)
   * @returns Exported key bytes
   * 
   * Implementation notes:
   * - Only allowed if key was created with exportable=true
   * - MUST throw error for non-exportable keys
   * - HSM/TPM keys are typically non-exportable
   * - SHOULD encrypt exported keys
   */
  exportKey?(
    keyReference: string,
    format: 'PEM' | 'DER' | 'PKCS8'
  ): Promise<Buffer>;

  /**
   * Get public key for a key reference
   * 
   * @param keyReference - Key ID
   * @returns Public key in PEM format
   * 
   * Implementation notes:
   * - MUST work for all key types
   * - Public key can always be exported safely
   */
  getPublicKey(keyReference: string): Promise<string>;

  /**
   * Get key metadata
   * 
   * @param keyReference - Key ID
   * @returns Key metadata including algorithm, creation time, etc.
   */
  getKeyMetadata(keyReference: string): Promise<GeneratedKeyReference>;

  /**
   * Delete a key
   * 
   * @param keyReference - Key ID to delete
   * 
   * Implementation notes:
   * - MUST be irreversible
   * - SHOULD verify key is not in use
   * - For HSM: may require special permissions
   */
  destroyKey(keyReference: string): Promise<void>;

  /**
   * List all keys managed by this provider
   * 
   * @param filters - Optional filters (tenant, algorithm, etc.)
   * @returns Array of key references
   */
  listKeys(filters?: KeyListFilters): Promise<GeneratedKeyReference[]>;

  /**
   * Initialize the provider
   * 
   * @param config - Provider-specific configuration
   * 
   * Implementation notes:
   * - For PKCS#11: establish HSM connection
   * - For Cloud KMS: authenticate with cloud provider
   * - For TPM: verify TPM availability
   */
  initialize(config: Record<string, any>): Promise<void>;

  /**
   * Cleanup and close connections
   */
  shutdown(): Promise<void>;
}

export interface KeyListFilters {
  tenantId?: string;
  algorithm?: KeyAlgorithm;
  exportable?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
}

/**
 * Key provider factory
 */
export interface CertificateKeyProviderFactory {
  /**
   * Create a key provider instance
   */
  createProvider(
    type: KeyProvider,
    config: Record<string, any>
  ): Promise<CertificateKeyProvider>;

  /**
   * Get list of supported provider types
   */
  getSupportedTypes(): KeyProvider[];
}
