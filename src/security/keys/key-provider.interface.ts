/**
 * KeyProvider Interface
 * 
 * Provider abstraction for cryptographic operations
 * Implementations: PKCS#11, AWS KMS, Azure Key Vault, GCP KMS, Software Development
 * 
 * Design principles:
 * - Private keys never leave the provider boundary
 * - All operations are async (supports network-based providers)
 * - Capabilities explicitly declared (no silent failures)
 * - Initialization is explicit and validates prerequisites
 * - Health checks are honest (never fake success)
 */

import {
  KeyProviderCapabilities,
  SignRequest,
  SignatureResult,
  VerifyRequest,
  VerificationResult,
  EncryptRequest,
  EncryptionResult,
  DecryptRequest,
  DecryptionResult,
  GenerateKeyRequest,
  KeyMetadata,
  PublicKeyResult,
  ProviderHealth,
  KeyReference
} from './types.js';

export interface KeyProvider {
  /**
   * Get provider name/identifier
   */
  getName(): string;

  /**
   * Initialize the provider
   * 
   * This is NOT a no-op. Real initialization must:
   * - Load cryptographic modules/libraries
   * - Establish connections to remote services
   * - Authenticate with credentials
   * - Discover and validate tokens/resources
   * - Verify required mechanisms/capabilities
   * - Locate mandatory application keys
   * - Perform lightweight health operation
   * 
   * Failure should throw with specific error code
   */
  initialize(): Promise<void>;

  /**
   * Get provider capabilities
   * 
   * Must return accurate capability information
   * Used for startup validation and operation routing
   */
  getCapabilities(): KeyProviderCapabilities;

  /**
   * Sign data with a key
   * 
   * The private key MUST NOT leave the provider
   * Returns signature bytes in the format appropriate for the algorithm
   */
  sign(request: SignRequest): Promise<SignatureResult>;

  /**
   * Verify signature
   * 
   * Can be implemented using local public key or via provider
   * Should normalize signature encoding (e.g., ECDSA DER vs raw r||s)
   */
  verify(request: VerifyRequest): Promise<VerificationResult>;

  /**
   * Encrypt data
   * 
   * For asymmetric: typically RSA-OAEP
   * For symmetric: typically AES-GCM with provider-managed IV
   * 
   * Note: Bulk data encryption should use envelope encryption
   * (generate DEK, encrypt with DEK, wrap DEK with KEK)
   */
  encrypt(request: EncryptRequest): Promise<EncryptionResult>;

  /**
   * Decrypt data
   * 
   * Inverse of encrypt operation
   * Private key material remains in provider
   */
  decrypt(request: DecryptRequest): Promise<DecryptionResult>;

  /**
   * Generate new cryptographic key
   * 
   * Key generation parameters:
   * - Purpose (determines usage policy)
   * - Algorithm (RSA, EC, AES)
   * - Size/curve
   * - Exportability
   * 
   * Returns metadata only (no private key material)
   */
  generateKey(request: GenerateKeyRequest): Promise<KeyMetadata>;

  /**
   * Get public key
   * 
   * Safe to export (public keys are not secret)
   * Returns in requested format (PEM, DER, JWK)
   */
  getPublicKey(keyRef: KeyReference, format?: 'PEM' | 'DER' | 'JWK'): Promise<PublicKeyResult>;

  /**
   * Destroy key
   * 
   * Securely delete key from provider
   * Should be irreversible
   */
  destroyKey(keyRef: KeyReference): Promise<void>;

  /**
   * Health check
   * 
   * MUST return honest status:
   * - HEALTHY: Provider is operational, verified by actual probe
   * - DEGRADED: Partial functionality, some operations may fail
   * - UNAVAILABLE: Provider cannot perform operations
   * 
   * Never return fake success
   */
  healthCheck(): Promise<ProviderHealth>;

  /**
   * Shutdown/cleanup
   * 
   * Close sessions, connections, release resources
   */
  shutdown(): Promise<void>;
}

/**
 * Optional provider capabilities for advanced features
 */
export interface KeyProviderAdvanced {
  /**
   * Wrap key for export
   * 
   * Encrypt key material with wrapping key
   * Used for key backup or migration
   */
  wrapKey?(keyRef: KeyReference, wrappingKeyRef: KeyReference): Promise<Buffer>;

  /**
   * Unwrap imported key
   * 
   * Decrypt wrapped key material and import
   */
  unwrapKey?(wrappedKey: Buffer, unwrappingKeyRef: KeyReference): Promise<KeyMetadata>;

  /**
   * Generate random bytes using provider's RNG
   * 
   * HSMs typically have high-quality hardware RNG
   */
  generateRandom?(length: number): Promise<Buffer>;

  /**
   * Get key attestation
   * 
   * Cryptographic proof that key exists in hardware
   */
  getAttestation?(keyRef: KeyReference): Promise<Buffer>;
}

/**
 * Combined interface for providers with advanced features
 */
export type KeyProviderWithAdvanced = KeyProvider & KeyProviderAdvanced;
