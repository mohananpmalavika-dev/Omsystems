/**
 * Enterprise Authentication Error Types
 * 
 * Typed errors for identity and authentication operations.
 * Enables precise error handling, logging, metrics, and auditing.
 */

/**
 * Error codes for enterprise authentication
 */
export type EnterpriseAuthErrorCode =
  // Credential/token validation errors
  | 'INVALID_CREDENTIALS'
  | 'INVALID_ASSERTION'
  | 'INVALID_TOKEN'
  | 'EXPIRED_TOKEN'
  | 'MALFORMED_TOKEN'
  | 'INVALID_SIGNATURE'
  | 'TOKEN_REPLAY'
  
  // Provider errors
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_DISABLED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_MISCONFIGURED'
  | 'PROVIDER_TIMEOUT'
  
  // Identity errors
  | 'IDENTITY_NOT_FOUND'
  | 'IDENTITY_NOT_LINKED'
  | 'IDENTITY_CONFLICT'
  | 'DUPLICATE_IDENTITY'
  
  // Provisioning errors
  | 'PROVISIONING_DISABLED'
  | 'PROVISIONING_FAILED'
  | 'DOMAIN_NOT_ALLOWED'
  | 'INVALID_EMAIL_DOMAIN'
  
  // Account status errors
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_NOT_ACTIVE'
  
  // Membership errors
  | 'MEMBERSHIP_NOT_FOUND'
  | 'MEMBERSHIP_DISABLED'
  | 'MEMBERSHIP_SUSPENDED'
  | 'TENANT_MISMATCH'
  
  // Authorization errors
  | 'NO_ROLE_MAPPING'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'ROLE_MAPPING_FAILED'
  
  // Policy errors
  | 'MFA_REQUIRED'
  | 'AUTHENTICATION_TOO_OLD'
  | 'ASSURANCE_LEVEL_INSUFFICIENT'
  | 'PHISHING_RESISTANT_REQUIRED'
  | 'IP_NOT_ALLOWED'
  | 'SESSION_LIMIT_EXCEEDED'
  
  // Protocol errors
  | 'STATE_MISMATCH'
  | 'NONCE_MISMATCH'
  | 'AUDIENCE_MISMATCH'
  | 'ISSUER_MISMATCH'
  | 'DESTINATION_MISMATCH'
  | 'INRESPONSETO_MISMATCH'
  | 'ASSERTION_EXPIRED'
  | 'ASSERTION_NOT_YET_VALID'
  | 'ASSERTION_REPLAY'
  
  // LDAP errors
  | 'LDAP_CONNECTION_FAILED'
  | 'LDAP_BIND_FAILED'
  | 'LDAP_SEARCH_FAILED'
  | 'LDAP_USER_NOT_FOUND'
  | 'LDAP_AMBIGUOUS_RESULT'
  | 'LDAP_TIMEOUT'
  | 'LDAP_TLS_ERROR'
  
  // Session errors
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'SESSION_NOT_FOUND'
  | 'REFRESH_TOKEN_INVALID'
  | 'REFRESH_TOKEN_EXPIRED'
  | 'REFRESH_TOKEN_REVOKED'
  
  // Transaction errors
  | 'TRANSACTION_NOT_FOUND'
  | 'TRANSACTION_EXPIRED'
  | 'TRANSACTION_CONSUMED'
  
  // Generic errors
  | 'CONFIGURATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Base authentication error
 */
export class EnterpriseAuthError extends Error {
  constructor(
    public readonly code: EnterpriseAuthErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'EnterpriseAuthError';
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to safe error response (no sensitive details)
   */
  toSafeResponse(): SafeErrorResponse {
    return {
      error: this.getSafeErrorCode(),
      message: this.getSafeMessage(),
    };
  }

  /**
   * Get safe error code for external responses
   */
  private getSafeErrorCode(): string {
    // Map internal codes to safe external codes
    const sensitiveCodeMap: Record<string, string> = {
      'PROVIDER_MISCONFIGURED': 'AUTHENTICATION_FAILED',
      'PROVISIONING_DISABLED': 'AUTHENTICATION_FAILED',
      'NO_ROLE_MAPPING': 'AUTHENTICATION_FAILED',
      'IDENTITY_NOT_LINKED': 'AUTHENTICATION_FAILED',
      'INTERNAL_ERROR': 'AUTHENTICATION_FAILED',
    };

    return sensitiveCodeMap[this.code] || this.code;
  }

  /**
   * Get safe message for external responses (no internal details)
   */
  private getSafeMessage(): string {
    const safeMessages: Partial<Record<EnterpriseAuthErrorCode, string>> = {
      'INVALID_CREDENTIALS': 'Invalid username or password',
      'PROVIDER_NOT_FOUND': 'Authentication provider not found',
      'PROVIDER_DISABLED': 'Authentication provider is disabled',
      'PROVIDER_UNAVAILABLE': 'Authentication service temporarily unavailable',
      'ACCOUNT_DISABLED': 'Account has been disabled',
      'ACCOUNT_LOCKED': 'Account has been locked',
      'ACCOUNT_SUSPENDED': 'Account has been suspended',
      'MFA_REQUIRED': 'Multi-factor authentication is required',
      'SESSION_EXPIRED': 'Your session has expired',
      'SESSION_REVOKED': 'Your session has been revoked',
    };

    return safeMessages[this.code] || 'Authentication failed';
  }
}

/**
 * Safe error response for external clients
 */
export interface SafeErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Invalid credentials error
 */
export class InvalidCredentialsError extends EnterpriseAuthError {
  constructor(message = 'Invalid credentials', details?: Record<string, unknown>) {
    super('INVALID_CREDENTIALS', message, details);
    this.name = 'InvalidCredentialsError';
  }
}

/**
 * Invalid token error
 */
export class InvalidTokenError extends EnterpriseAuthError {
  constructor(
    reason: string,
    public readonly tokenType?: 'ACCESS' | 'REFRESH' | 'ID' | 'ASSERTION',
    details?: Record<string, unknown>,
  ) {
    super('INVALID_TOKEN', `Invalid ${tokenType || 'token'}: ${reason}`, details);
    this.name = 'InvalidTokenError';
  }
}

/**
 * Provider error
 */
export class IdentityProviderError extends EnterpriseAuthError {
  constructor(
    code: Extract<EnterpriseAuthErrorCode, 
      'PROVIDER_NOT_FOUND' | 'PROVIDER_DISABLED' | 'PROVIDER_UNAVAILABLE' | 
      'PROVIDER_MISCONFIGURED' | 'PROVIDER_TIMEOUT'>,
    message: string,
    public readonly providerId?: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, { ...details, providerId });
    this.name = 'IdentityProviderError';
  }
}

/**
 * Provisioning error
 */
export class ProvisioningError extends EnterpriseAuthError {
  constructor(
    code: Extract<EnterpriseAuthErrorCode,
      'PROVISIONING_DISABLED' | 'PROVISIONING_FAILED' | 
      'DOMAIN_NOT_ALLOWED' | 'INVALID_EMAIL_DOMAIN'>,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, details);
    this.name = 'ProvisioningError';
  }
}

/**
 * Account status error
 */
export class AccountStatusError extends EnterpriseAuthError {
  constructor(
    code: Extract<EnterpriseAuthErrorCode,
      'ACCOUNT_DISABLED' | 'ACCOUNT_LOCKED' | 'ACCOUNT_SUSPENDED' | 'ACCOUNT_NOT_ACTIVE'>,
    message: string,
    public readonly userId?: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, { ...details, userId });
    this.name = 'AccountStatusError';
  }
}

/**
 * Membership error
 */
export class MembershipError extends EnterpriseAuthError {
  constructor(
    code: Extract<EnterpriseAuthErrorCode,
      'MEMBERSHIP_NOT_FOUND' | 'MEMBERSHIP_DISABLED' | 'MEMBERSHIP_SUSPENDED' | 'TENANT_MISMATCH'>,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, details);
    this.name = 'MembershipError';
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends EnterpriseAuthError {
  constructor(
    code: Extract<EnterpriseAuthErrorCode,
      'NO_ROLE_MAPPING' | 'INSUFFICIENT_PERMISSIONS' | 'ROLE_MAPPING_FAILED'>,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Authentication policy error
 */
export class AuthenticationPolicyError extends EnterpriseAuthError {
  constructor(
    code: Extract<EnterpriseAuthErrorCode,
      'MFA_REQUIRED' | 'AUTHENTICATION_TOO_OLD' | 'ASSURANCE_LEVEL_INSUFFICIENT' |
      'PHISHING_RESISTANT_REQUIRED' | 'IP_NOT_ALLOWED' | 'SESSION_LIMIT_EXCEEDED'>,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, details);
    this.name = 'AuthenticationPolicyError';
  }
}

/**
 * Protocol validation error
 */
export class ProtocolValidationError extends EnterpriseAuthError {
  constructor(
    code: Extract<EnterpriseAuthErrorCode,
      'INVALID_SIGNATURE' | 'STATE_MISMATCH' | 'NONCE_MISMATCH' | 'AUDIENCE_MISMATCH' | 
      'ISSUER_MISMATCH' | 'DESTINATION_MISMATCH' | 'INRESPONSETO_MISMATCH' |
      'ASSERTION_EXPIRED' | 'ASSERTION_NOT_YET_VALID' | 'ASSERTION_REPLAY'>,
    message: string,
    public readonly protocol: 'OIDC' | 'SAML' | 'OAUTH2',
    details?: Record<string, unknown>,
  ) {
    super(code, message, { ...details, protocol });
    this.name = 'ProtocolValidationError';
  }
}

/**
 * LDAP error
 */
export class LDAPError extends EnterpriseAuthError {
  constructor(
    code: Extract<EnterpriseAuthErrorCode,
      'LDAP_CONNECTION_FAILED' | 'LDAP_BIND_FAILED' | 'LDAP_SEARCH_FAILED' |
      'LDAP_USER_NOT_FOUND' | 'LDAP_AMBIGUOUS_RESULT' | 'LDAP_TIMEOUT' | 'LDAP_TLS_ERROR'>,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, details);
    this.name = 'LDAPError';
  }
}

/**
 * Session error
 */
export class SessionError extends EnterpriseAuthError {
  constructor(
    code: Extract<EnterpriseAuthErrorCode,
      'SESSION_EXPIRED' | 'SESSION_REVOKED' | 'SESSION_NOT_FOUND' |
      'REFRESH_TOKEN_INVALID' | 'REFRESH_TOKEN_EXPIRED' | 'REFRESH_TOKEN_REVOKED'>,
    message: string,
    public readonly sessionId?: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, { ...details, sessionId });
    this.name = 'SessionError';
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends EnterpriseAuthError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFIGURATION_ERROR', message, details);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error logger helper
 */
export class AuthErrorLogger {
  /**
   * Log authentication error with appropriate level
   */
  static logError(error: EnterpriseAuthError, context?: Record<string, unknown>): void {
    const logData = {
      errorCode: error.code,
      errorName: error.name,
      message: error.message,
      details: error.details,
      context,
      stack: error.stack,
    };

    // Determine log level based on error type
    const level = this.getLogLevel(error.code);

    // In production, integrate with your logging system
    if (level === 'error') {
      console.error('[AUTH_ERROR]', logData);
    } else if (level === 'warn') {
      console.warn('[AUTH_WARN]', logData);
    } else {
      console.info('[AUTH_INFO]', logData);
    }
  }

  /**
   * Determine appropriate log level for error code
   */
  private static getLogLevel(code: EnterpriseAuthErrorCode): 'error' | 'warn' | 'info' {
    // Expected authentication failures (log as info/warn)
    const expectedFailures: EnterpriseAuthErrorCode[] = [
      'INVALID_CREDENTIALS',
      'ACCOUNT_DISABLED',
      'ACCOUNT_LOCKED',
      'SESSION_EXPIRED',
      'MFA_REQUIRED',
    ];

    // Configuration/system errors (log as error)
    const systemErrors: EnterpriseAuthErrorCode[] = [
      'PROVIDER_MISCONFIGURED',
      'PROVIDER_UNAVAILABLE',
      'CONFIGURATION_ERROR',
      'INTERNAL_ERROR',
      'LDAP_CONNECTION_FAILED',
      'LDAP_TIMEOUT',
    ];

    if (systemErrors.includes(code)) {
      return 'error';
    } else if (expectedFailures.includes(code)) {
      return 'info';
    } else {
      return 'warn';
    }
  }
}
