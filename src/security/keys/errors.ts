/**
 * Cryptographic Key Service Errors
 * 
 * Normalized error hierarchy for key management operations
 * Distinguishes retryable from non-retryable failures
 */

import { KeyProviderErrorCode, KeyProviderError as IKeyProviderError } from './types.js';

/**
 * Base error for all key provider failures
 */
export class KeyProviderError extends Error implements IKeyProviderError {
  public readonly code: KeyProviderErrorCode;
  public readonly retryable: boolean;
  public readonly provider?: string;
  public readonly keyId?: string;
  public readonly operation?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
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
  ) {
    super(message);
    this.name = 'KeyProviderError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.provider = options?.provider;
    this.keyId = options?.keyId;
    this.operation = options?.operation;
    this.details = options?.details;

    if (options?.cause) {
      this.cause = options.cause;
    }

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, KeyProviderError.prototype);
  }
}

/**
 * Provider is not available (hardware disconnected, service unreachable)
 * Retryable: Yes (provider may become available)
 */
export class ProviderUnavailableError extends KeyProviderError {
  constructor(provider: string, message: string, cause?: Error) {
    super('PROVIDER_UNAVAILABLE', message, {
      retryable: true,
      provider,
      cause
    });
    this.name = 'ProviderUnavailableError';
    Object.setPrototypeOf(this, ProviderUnavailableError.prototype);
  }
}

/**
 * HSM token/smart card not present
 * Retryable: Eventually (requires manual intervention)
 */
export class TokenNotPresentError extends KeyProviderError {
  constructor(provider: string, message: string) {
    super('TOKEN_NOT_PRESENT', message, {
      retryable: false, // Requires physical token insertion
      provider
    });
    this.name = 'TokenNotPresentError';
    Object.setPrototypeOf(this, TokenNotPresentError.prototype);
  }
}

/**
 * Authentication with provider failed (wrong PIN, expired credentials)
 * Retryable: No (may cause lockout)
 */
export class AuthenticationFailedError extends KeyProviderError {
  constructor(provider: string, message: string, cause?: Error) {
    super('AUTHENTICATION_FAILED', message, {
      retryable: false, // Don't hammer authentication (lockout risk)
      provider,
      cause
    });
    this.name = 'AuthenticationFailedError';
    Object.setPrototypeOf(this, AuthenticationFailedError.prototype);
  }
}

/**
 * Requested key not found in provider
 * Retryable: No (key doesn't exist)
 */
export class KeyNotFoundError extends KeyProviderError {
  constructor(provider: string, keyId: string, message: string) {
    super('KEY_NOT_FOUND', message, {
      retryable: false,
      provider,
      keyId
    });
    this.name = 'KeyNotFoundError';
    Object.setPrototypeOf(this, KeyNotFoundError.prototype);
  }
}

/**
 * Algorithm not supported by provider
 * Retryable: No (provider limitation)
 */
export class UnsupportedAlgorithmError extends KeyProviderError {
  constructor(provider: string, algorithm: string, operation: string) {
    super(
      'UNSUPPORTED_ALGORITHM',
      `Provider ${provider} does not support algorithm ${algorithm} for operation ${operation}`,
      { retryable: false, provider, operation }
    );
    this.name = 'UnsupportedAlgorithmError';
    Object.setPrototypeOf(this, UnsupportedAlgorithmError.prototype);
  }
}

/**
 * Operation not supported by provider
 * Retryable: No (provider limitation)
 */
export class UnsupportedOperationError extends KeyProviderError {
  constructor(provider: string, operation: string) {
    super(
      'UNSUPPORTED_OPERATION',
      `Provider ${provider} does not support operation ${operation}`,
      { retryable: false, provider, operation }
    );
    this.name = 'UnsupportedOperationError';
    Object.setPrototypeOf(this, UnsupportedOperationError.prototype);
  }
}

/**
 * Signature verification failed
 * Retryable: No (signature is invalid)
 */
export class InvalidSignatureError extends KeyProviderError {
  constructor(keyId: string, message: string = 'Signature verification failed') {
    super('INVALID_SIGNATURE', message, {
      retryable: false,
      keyId
    });
    this.name = 'InvalidSignatureError';
    Object.setPrototypeOf(this, InvalidSignatureError.prototype);
  }
}

/**
 * Session pool exhausted (all sessions in use)
 * Retryable: Yes (sessions may become available)
 */
export class SessionExhaustedError extends KeyProviderError {
  constructor(provider: string, message: string = 'No available sessions') {
    super('SESSION_EXHAUSTED', message, {
      retryable: true,
      provider
    });
    this.name = 'SessionExhaustedError';
    Object.setPrototypeOf(this, SessionExhaustedError.prototype);
  }
}

/**
 * Hardware device error (HSM malfunction)
 * Retryable: Depends (may need hardware intervention)
 */
export class DeviceError extends KeyProviderError {
  constructor(provider: string, message: string, cause?: Error) {
    super('DEVICE_ERROR', message, {
      retryable: false, // Hardware issue unlikely to resolve without intervention
      provider,
      cause
    });
    this.name = 'DeviceError';
    Object.setPrototypeOf(this, DeviceError.prototype);
  }
}

/**
 * Permission denied (policy violation, ACL)
 * Retryable: No (authorization required)
 */
export class PermissionDeniedError extends KeyProviderError {
  constructor(
    operation: string,
    keyId: string,
    message: string = `Permission denied for operation ${operation} on key ${keyId}`
  ) {
    super('PERMISSION_DENIED', message, {
      retryable: false,
      operation,
      keyId
    });
    this.name = 'PermissionDeniedError';
    Object.setPrototypeOf(this, PermissionDeniedError.prototype);
  }
}

/**
 * Invalid input data
 * Retryable: No (caller error)
 */
export class InvalidInputError extends KeyProviderError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('INVALID_INPUT', message, {
      retryable: false,
      details
    });
    this.name = 'InvalidInputError';
    Object.setPrototypeOf(this, InvalidInputError.prototype);
  }
}

/**
 * Key policy violation
 * Retryable: No (policy enforcement)
 */
export class KeyPolicyViolationError extends KeyProviderError {
  constructor(keyId: string, message: string, details?: Record<string, unknown>) {
    super('KEY_POLICY_VIOLATION', message, {
      retryable: false,
      keyId,
      details
    });
    this.name = 'KeyPolicyViolationError';
    Object.setPrototypeOf(this, KeyPolicyViolationError.prototype);
  }
}

/**
 * Production safety violation
 * Retryable: No (configuration error)
 */
export class ProductionSafetyViolationError extends KeyProviderError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('PRODUCTION_SAFETY_VIOLATION', message, {
      retryable: false,
      details
    });
    this.name = 'ProductionSafetyViolationError';
    Object.setPrototypeOf(this, ProductionSafetyViolationError.prototype);
  }
}

/**
 * Module load failed (PKCS#11 library, SDK)
 * Retryable: No (deployment issue)
 */
export class ModuleLoadFailedError extends KeyProviderError {
  constructor(provider: string, modulePath: string, cause?: Error) {
    super('MODULE_LOAD_FAILED', `Failed to load module: ${modulePath}`, {
      retryable: false,
      provider,
      details: { modulePath },
      cause
    });
    this.name = 'ModuleLoadFailedError';
    Object.setPrototypeOf(this, ModuleLoadFailedError.prototype);
  }
}

/**
 * Provider initialization failed
 * Retryable: No (startup issue)
 */
export class InitializationFailedError extends KeyProviderError {
  constructor(provider: string, message: string, cause?: Error) {
    super('INITIALIZATION_FAILED', message, {
      retryable: false,
      provider,
      cause
    });
    this.name = 'InitializationFailedError';
    Object.setPrototypeOf(this, InitializationFailedError.prototype);
  }
}

/**
 * Production startup error (blocks application startup)
 */
export class ProductionStartupError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
    public readonly provider?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ProductionStartupError';
    Object.setPrototypeOf(this, ProductionStartupError.prototype);
  }
}
