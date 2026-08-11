/**
 * Core types for unified cryptographic key management
 * 
 * This type system establishes provider-agnostic abstractions for:
 * - Key references (opaque identifiers)
 * - Security levels and capabilities
 * - Cryptographic operations
 * - Provider metadata
 * - Key lifecycle states
 */

// ============================================================================
// Security Levels
// ============================================================================

/**
 * Security level classification for key providers
 * 
 * SIMULATED: Development/testing only, no cryptographic security guarantees
 * SOFTWARE: Keys in application memory/filesystem, protected by OS
 * HARDWARE_BACKED: Keys in local HSM, TPM, or secure enclave
 * REMOTE_HARDWARE_BACKED: Keys in cloud KMS with hardware backing
 */
export type KeyProviderSecurityLevel =
  | 'SIMULATED'
  | 'SOFTWARE'
  | 'HARDWARE_BACKED'
  | 'REMOTE_HARDWARE_BACKED';

// ============================================================================
// Key Purpose
// ============================================================================

/**
 * Semantic purpose for cryptographic keys
 * Enforces separation of duties and prevents key reuse across domains
 */
export type KeyPurpose =
  | 'ROOT_CA'
  | 'INTERMEDIATE_CA'
  | 'DEVICE_CERTIFICATE'
  | 'JWT_SIGNING'
  | 'SECURE_BOOT_ATTESTATION'
  | 'CONFIG_ENCRYPTION'
  | 'RECORDING_KEK'
  | 'AUDIT_LOG_SIGNING'
  | 'BACKUP_ENCRYPTION'
  | 'API_TOKEN_SIGNING'
  | 'DATABASE_ENCRYPTION'
  | 'COMMUNICATION_ENCRYPTION';

// ============================================================================
// Key Types and Algorithms
// ============================================================================

export type KeyType = 'RSA' | 'EC' | 'AES' | 'HMAC';

export type SigningAlgorithm =
  | 'RSA_PKCS1_SHA256'
  | 'RSA_PSS_SHA256'
  | 'ECDSA_SHA256'
  | 'ECDSA_SHA384'
  | 'ECDSA_SHA512';

export type EncryptionAlgorithm =
  | 'RSA_OAEP_SHA256'
  | 'AES_256_GCM'
  | 'AES_256_CBC';

export type KeyOperation =
  | 'SIGN'
  | 'VERIFY'
  | 'ENCRYPT'
  | 'DECRYPT'
  | 'WRAP_KEY'
  | 'UNWRAP_KEY'
  | 'GENERATE_KEY'
  | 'DESTROY_KEY'
  | 'GET_PUBLIC_KEY';

// ============================================================================
// Key Reference (Opaque Identifier)
// ============================================================================

/**
 * Provider-agnostic key reference
 * Application code never handles raw keys or provider-specific handles
 */
export interface KeyReference {
  /** Semantic identifier (e.g., 'device-ca', 'jwt-signing') */
  id: string;

  /** Provider that owns this key */
  provider: string;

  /** Key purpose (enforces usage policy) */
  purpose: KeyPurpose;

  /** Key version (supports rotation) */
  version: number;

  /** Optional tenant isolation */
  tenantId?: string;
}

// ============================================================================
// Provider Capabilities
// ============================================================================

/**
 * Capabilities reported by a key provider
 * Used for startup validation and runtime operation routing
 */
export interface KeyProviderCapabilities {
  /** Security level of this provider */
  securityLevel: KeyProviderSecurityLevel;

  /** Supported cryptographic operations */
  operations: {
    sign: boolean;
    verify: boolean;
    encrypt: boolean;
    decrypt: boolean;
    generateKey: boolean;
    destroyKey: boolean;
    getPublicKey: boolean;
    wrapKey: boolean;
    unwrapKey: boolean;
  };

  /** Supported key types */
  keyTypes: {
    rsa: boolean;
    ec: boolean;
    aes: boolean;
  };

  /** Supported signing algorithms */
  signingAlgorithms: SigningAlgorithm[];

  /** Supported encryption algorithms */
  encryptionAlgorithms: EncryptionAlgorithm[];

  /** Whether private keys can be exported */
  privateKeyExportable: boolean;

  /** Hardware attestation available */
  attestedHardware?: boolean;

  /** FIPS 140-2/3 compliance mode */
  fipsMode?: boolean;

  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Cryptographic Operation Requests
// ============================================================================

export interface OperationContext {
  /** Tenant performing the operation */
  tenantId?: string;

  /** Service/component requesting operation */
  service?: string;

  /** User or system actor */
  actorId?: string;

  /** Request correlation ID */
  correlationId?: string;

  /** Operation purpose/description */
  purpose?: string;
}

export interface SignRequest {
  key: KeyReference;
  algorithm: SigningAlgorithm;
  data: Buffer;
  context?: OperationContext;
}

export interface VerifyRequest {
  key: KeyReference;
  algorithm: SigningAlgorithm;
  data: Buffer;
  signature: Buffer;
  context?: OperationContext;
}

export interface EncryptRequest {
  key: KeyReference;
  algorithm: EncryptionAlgorithm;
  plaintext: Buffer;
  context?: OperationContext;
}

export interface DecryptRequest {
  key: KeyReference;
  algorithm: EncryptionAlgorithm;
  ciphertext: Buffer;
  iv?: Buffer;
  authTag?: Buffer;
  context?: OperationContext;
}

export interface GenerateKeyRequest {
  purpose: KeyPurpose;
  algorithm: {
    type: KeyType;
    keySize?: number;
    curve?: 'P-256' | 'P-384' | 'P-521';
  };
  policy: KeyPolicy;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Cryptographic Operation Results
// ============================================================================

export interface SignatureResult {
  signature: Buffer;
  algorithm: SigningAlgorithm;
  keyId: string;
  keyVersion: number;
  provider: string;
  timestamp: Date;
}

export interface VerificationResult {
  valid: boolean;
  algorithm: SigningAlgorithm;
  keyId: string;
  keyVersion: number;
  provider: string;
  timestamp: Date;
}

export interface EncryptionResult {
  ciphertext: Buffer;
  iv: Buffer;
  authTag?: Buffer;
  algorithm: EncryptionAlgorithm;
  keyId: string;
  keyVersion: number;
  provider: string;
  timestamp: Date;
}

export interface DecryptionResult {
  plaintext: Buffer;
  algorithm: EncryptionAlgorithm;
  keyId: string;
  keyVersion: number;
  provider: string;
  timestamp: Date;
}

export interface PublicKeyResult {
  publicKey: Buffer;
  format: 'PEM' | 'DER' | 'JWK';
  keyId: string;
  algorithm: string;
}

// ============================================================================
// Key Metadata (stored in registry, not private key material)
// ============================================================================

export type KeyStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'ROTATING'
  | 'RETIRED'
  | 'REVOKED'
  | 'DESTROYED';

export interface KeyMetadata {
  id: string;
  tenantId?: string;
  provider: string;
  externalKeyId: string;
  purpose: KeyPurpose;
  algorithm: string;
  keyType: KeyType;
  keySize?: number;
  version: number;
  securityLevel: KeyProviderSecurityLevel;
  status: KeyStatus;
  policy: KeyPolicy;
  createdAt: Date;
  activatedAt?: Date;
  retiredAt?: Date;
  destroyedAt?: Date;
  rotationSchedule?: KeyRotationSchedule;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Key Policy
// ============================================================================

/**
 * Policy governing key usage
 * Enforced by KeyPolicyService before operations reach provider
 */
export interface KeyPolicy {
  /** Allowed operations for this key */
  allowedOperations: KeyOperation[];

  /** Allowed algorithms */
  allowedAlgorithms: string[];

  /** Services permitted to use this key */
  permittedServices?: string[];

  /** Tenants permitted to use this key */
  permittedTenants?: string[];

  /** Export policy */
  exportPolicy: 'NEVER' | 'PUBLIC_ONLY' | 'WRAPPED_ONLY';

  /** Whether key must be hardware-backed */
  requireHardwareBacked?: boolean;

  /** Rotation policy */
  rotationPolicy?: KeyRotationSchedule;

  /** Maximum operations before rotation */
  maxOperations?: number;

  /** Custom policy data */
  customPolicy?: Record<string, unknown>;
}

export interface KeyRotationSchedule {
  /** Rotate every N days */
  rotateEveryDays: number;

  /** Auto-retire previous version after rotation */
  autoRetirePrevious?: boolean;

  /** Grace period before retiring old key */
  gracePeriodDays?: number;
}

// ============================================================================
// Provider State and Health
// ============================================================================

export type ProviderState =
  | 'UNINITIALIZED'
  | 'LOADING_MODULE'
  | 'DISCOVERING_TOKEN'
  | 'AUTHENTICATING'
  | 'VALIDATING_CAPABILITIES'
  | 'VERIFYING_KEYS'
  | 'READY'
  | 'DEGRADED'
  | 'UNAVAILABLE';

export type ProviderHealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';

export interface ProviderHealth {
  status: ProviderHealthStatus;
  state: ProviderState;
  checkedAt: Date;
  reason?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Error Types
// ============================================================================

export type KeyProviderErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'TOKEN_NOT_PRESENT'
  | 'AUTHENTICATION_FAILED'
  | 'KEY_NOT_FOUND'
  | 'UNSUPPORTED_ALGORITHM'
  | 'UNSUPPORTED_OPERATION'
  | 'INVALID_SIGNATURE'
  | 'SESSION_EXHAUSTED'
  | 'DEVICE_ERROR'
  | 'PERMISSION_DENIED'
  | 'INVALID_INPUT'
  | 'KEY_POLICY_VIOLATION'
  | 'PRODUCTION_SAFETY_VIOLATION'
  | 'MODULE_LOAD_FAILED'
  | 'INITIALIZATION_FAILED';

export interface KeyProviderError extends Error {
  code: KeyProviderErrorCode;
  retryable: boolean;
  provider?: string;
  keyId?: string;
  operation?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Audit Records
// ============================================================================

export interface KeyAuditRecord {
  id: string;
  timestamp: Date;
  operation: KeyOperation;
  keyId: string;
  keyVersion: number;
  provider: string;
  tenantId?: string;
  service?: string;
  actorId?: string;
  correlationId?: string;
  success: boolean;
  errorCode?: KeyProviderErrorCode;
  durationMs: number;
  securityLevel: KeyProviderSecurityLevel;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface KeyServiceConfig {
  provider: KeyProviderConfig;
  requirements: KeyProviderRequirements;
  audit?: KeyAuditConfig;
}

export interface KeyProviderRequirements {
  hardwareBacked: boolean;
  privateKeyExportable: boolean;
  requiredOperations: KeyOperation[];
  requiredAlgorithms: string[];
  fipsMode?: boolean;
}

export interface KeyAuditConfig {
  enabled: boolean;
  storage: 'database' | 'file' | 'syslog';
  retentionDays: number;
}

export type KeyProviderConfig =
  | SoftwareDevelopmentProviderConfig
  | PKCS11ProviderConfig
  | AWSKMSProviderConfig
  | AzureKeyVaultProviderConfig
  | GCPKMSProviderConfig;

export interface SoftwareDevelopmentProviderConfig {
  type: 'software-development';
  keyStoragePath?: string;
}

export interface PKCS11ProviderConfig {
  type: 'pkcs11';
  libraryPath: string;
  tokenLabel?: string;
  slotId?: number;
  pinSource: PinSource;
  sessionPoolSize: number;
  loginMode: 'USER' | 'SO';
  requiredMechanisms: string[];
  requiredKeys?: RequiredKeyConfig[];
  timeout?: number;
}

export interface AWSKMSProviderConfig {
  type: 'aws-kms';
  region: string;
  endpoint?: string;
  keyAliases?: Record<KeyPurpose, string>;
}

export interface AzureKeyVaultProviderConfig {
  type: 'azure-keyvault';
  vaultUrl: string;
  tenantId?: string;
  keyAliases?: Record<KeyPurpose, string>;
}

export interface GCPKMSProviderConfig {
  type: 'gcp-kms';
  projectId: string;
  locationId: string;
  keyRingId: string;
  keyAliases?: Record<KeyPurpose, string>;
}

export type PinSource =
  | { type: 'env'; variable: string }
  | { type: 'file'; path: string }
  | { type: 'secret'; reference: string };

export interface RequiredKeyConfig {
  id: string;
  label?: string;
  purpose: KeyPurpose;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isKeyProviderError(error: unknown): error is KeyProviderError {
  return (
    error instanceof Error &&
    'code' in error &&
    'retryable' in error
  );
}

export function createKeyProviderError(
  code: KeyProviderErrorCode,
  message: string,
  options?: {
    retryable?: boolean;
    provider?: string;
    keyId?: string;
    operation?: string;
    details?: Record<string, unknown>;
    cause?: Error;
  }
): KeyProviderError {
  const error = new Error(message) as KeyProviderError;
  error.code = code;
  error.retryable = options?.retryable ?? false;
  error.provider = options?.provider;
  error.keyId = options?.keyId;
  error.operation = options?.operation;
  error.details = options?.details;
  if (options?.cause) {
    error.cause = options.cause;
  }
  return error;
}
