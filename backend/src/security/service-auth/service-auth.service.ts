/**
 * Service Authentication Service
 * 
 * Handles authentication of service-to-service requests using JWT.
 * Validates issuer, audience, signature, expiry, and produces ServicePrincipal.
 */

import jwt from 'jsonwebtoken';
import {
  ServicePrincipal,
  ServiceJwtClaims,
  ServiceAuthConfig,
  JwtVerificationConfig,
  IServiceAuthService,
  ServiceAuthError,
  ServiceCapability,
  ServiceId,
  isServiceId,
  isServiceCapability,
} from './service-auth.types.js';
import { logger } from '../../utils/logger.js';

export class ServiceAuthService implements IServiceAuthService {
  private readonly config: ServiceAuthConfig;

  constructor(config: ServiceAuthConfig) {
    this.config = config;
    
    // Validate configuration on startup
    this.validateConfig();
  }

  /**
   * Authenticate service request
   * 
   * Extracts JWT from Authorization header, validates it, and produces ServicePrincipal.
   * 
   * Authorization header format:
   *   Bearer <jwt>
   * 
   * Throws ServiceAuthError on any authentication failure.
   */
  async authenticate(
    headers: Record<string, string | string[] | undefined>
  ): Promise<ServicePrincipal> {
    // Extract authorization header
    const authHeader = this.extractAuthHeader(headers);
    
    if (!authHeader) {
      throw new ServiceAuthError(
        'Missing Authorization header',
        'MISSING_AUTH_HEADER',
        401
      );
    }

    // Parse Bearer token
    const token = this.extractBearerToken(authHeader);
    
    if (!token) {
      throw new ServiceAuthError(
        'Invalid Authorization header format. Expected: Bearer <token>',
        'INVALID_AUTH_HEADER_FORMAT',
        401
      );
    }

    // Verify JWT and extract claims
    const claims = await this.verifyJwt(token);

    // Validate claims structure
    this.validateClaims(claims);

    // Build service principal
    const principal = this.buildPrincipal(claims);

    logger.debug('Service authenticated', {
      serviceId: principal.serviceId,
      credentialId: principal.credentialId,
      capabilities: principal.capabilities,
      tenantId: principal.tenantId,
    });

    return principal;
  }

  /**
   * Verify JWT signature and claims
   * 
   * Validates:
   * - Signature using configured public key
   * - Issuer matches expected value
   * - Audience matches expected value
   * - Token is not expired (with clock tolerance)
   * - Token is not used before iat (with clock tolerance)
   * - Token lifetime is within configured maximum
   */
  async verifyJwt(token: string): Promise<ServiceJwtClaims> {
    const jwtConfig = this.config.jwt;

    try {
      // Verify and decode JWT
      const decoded = jwt.verify(token, jwtConfig.verificationKey, {
        algorithms: [jwtConfig.algorithm as jwt.Algorithm],
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
        clockTolerance: jwtConfig.clockToleranceSeconds,
        complete: false,
      }) as jwt.JwtPayload;

      // Extract claims
      const claims: ServiceJwtClaims = {
        iss: decoded.iss as string,
        sub: decoded.sub as ServiceId,
        aud: decoded.aud as string,
        scope: decoded.scope as ServiceCapability[],
        tid: decoded.tid as string | undefined,
        iat: decoded.iat as number,
        exp: decoded.exp as number,
        jti: decoded.jti as string,
        cid: decoded.cid as string,
      };

      // Additional validation
      this.validateTokenLifetime(claims);

      return claims;
    } catch (error) {
      // Map JWT library errors to ServiceAuthError
      if (error instanceof jwt.TokenExpiredError) {
        throw new ServiceAuthError(
          'JWT token has expired',
          'TOKEN_EXPIRED',
          401,
          { expiredAt: error.expiredAt }
        );
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new ServiceAuthError(
          `JWT verification failed: ${error.message}`,
          'INVALID_TOKEN',
          401
        );
      }

      if (error instanceof jwt.NotBeforeError) {
        throw new ServiceAuthError(
          'JWT token used before valid time',
          'TOKEN_NOT_YET_VALID',
          401,
          { notBefore: error.date }
        );
      }

      // Re-throw ServiceAuthError as-is
      if (error instanceof ServiceAuthError) {
        throw error;
      }

      // Unknown error
      logger.error('Unexpected JWT verification error', { error });
      throw new ServiceAuthError(
        'JWT verification failed',
        'VERIFICATION_ERROR',
        401
      );
    }
  }

  // =====================================================
  // Private Helper Methods
  // =====================================================

  private validateConfig(): void {
    const { jwt } = this.config;

    if (!jwt.issuer) {
      throw new Error('JWT issuer must be configured');
    }

    if (!jwt.audience) {
      throw new Error('JWT audience must be configured');
    }

    if (!jwt.verificationKey) {
      throw new Error('JWT verification key must be configured');
    }

    if (!jwt.algorithm) {
      throw new Error('JWT algorithm must be configured');
    }

    const validAlgorithms = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'HS256', 'HS384', 'HS512'];
    if (!validAlgorithms.includes(jwt.algorithm)) {
      throw new Error(`Invalid JWT algorithm: ${jwt.algorithm}. Must be one of: ${validAlgorithms.join(', ')}`);
    }

    if (jwt.clockToleranceSeconds < 0) {
      throw new Error('JWT clock tolerance must be non-negative');
    }

    if (jwt.maxLifetimeSeconds <= 0) {
      throw new Error('JWT max lifetime must be positive');
    }

    logger.info('Service auth config validated', {
      issuer: jwt.issuer,
      audience: jwt.audience,
      algorithm: jwt.algorithm,
      clockTolerance: jwt.clockToleranceSeconds,
      maxLifetime: jwt.maxLifetimeSeconds,
      replayProtection: this.config.replayProtectionEnabled,
      mtlsRequired: this.config.mtlsRequired,
    });
  }

  private extractAuthHeader(
    headers: Record<string, string | string[] | undefined>
  ): string | null {
    // Check lowercase (standard)
    let authHeader = headers['authorization'];
    
    // Check capitalized (some clients)
    if (!authHeader) {
      authHeader = headers['Authorization'];
    }

    if (!authHeader) {
      return null;
    }

    // Handle array (shouldn't happen, but be defensive)
    if (Array.isArray(authHeader)) {
      authHeader = authHeader[0];
    }

    return authHeader || null;
  }

  private extractBearerToken(authHeader: string): string | null {
    const parts = authHeader.split(' ');

    if (parts.length !== 2) {
      return null;
    }

    const [scheme, token] = parts;

    if (scheme.toLowerCase() !== 'bearer') {
      return null;
    }

    return token;
  }

  private validateClaims(claims: ServiceJwtClaims): void {
    // Validate required claims presence
    if (!claims.sub) {
      throw new ServiceAuthError(
        'JWT missing required claim: sub',
        'MISSING_CLAIM_SUB',
        401
      );
    }

    if (!claims.jti) {
      throw new ServiceAuthError(
        'JWT missing required claim: jti',
        'MISSING_CLAIM_JTI',
        401
      );
    }

    if (!claims.cid) {
      throw new ServiceAuthError(
        'JWT missing required claim: cid',
        'MISSING_CLAIM_CID',
        401
      );
    }

    if (!claims.scope || !Array.isArray(claims.scope)) {
      throw new ServiceAuthError(
        'JWT missing or invalid claim: scope',
        'MISSING_CLAIM_SCOPE',
        401
      );
    }

    // Validate service ID
    if (!isServiceId(claims.sub)) {
      throw new ServiceAuthError(
        `Unknown service ID: ${claims.sub}`,
        'UNKNOWN_SERVICE',
        401,
        { serviceId: claims.sub }
      );
    }

    // Validate capabilities
    for (const capability of claims.scope) {
      if (!isServiceCapability(capability)) {
        throw new ServiceAuthError(
          `Invalid capability in scope: ${capability}`,
          'INVALID_CAPABILITY',
          401,
          { capability }
        );
      }
    }

    // Validate tenant ID format if present
    if (claims.tid && typeof claims.tid !== 'string') {
      throw new ServiceAuthError(
        'JWT claim tid must be a string',
        'INVALID_CLAIM_TID',
        401
      );
    }
  }

  private validateTokenLifetime(claims: ServiceJwtClaims): void {
    const lifetime = claims.exp - claims.iat;
    const maxLifetime = this.config.jwt.maxLifetimeSeconds;

    if (lifetime > maxLifetime) {
      throw new ServiceAuthError(
        `JWT lifetime (${lifetime}s) exceeds maximum allowed (${maxLifetime}s)`,
        'TOKEN_LIFETIME_EXCEEDED',
        401,
        {
          lifetime,
          maxLifetime,
          issuedAt: claims.iat,
          expiresAt: claims.exp,
        }
      );
    }

    // Additional check: token should not be valid for more than max lifetime from now
    const now = Math.floor(Date.now() / 1000);
    const remainingLifetime = claims.exp - now;

    if (remainingLifetime > maxLifetime) {
      throw new ServiceAuthError(
        `JWT remaining lifetime (${remainingLifetime}s) exceeds maximum allowed (${maxLifetime}s)`,
        'TOKEN_LIFETIME_EXCEEDED',
        401,
        {
          remainingLifetime,
          maxLifetime,
        }
      );
    }
  }

  private buildPrincipal(claims: ServiceJwtClaims): ServicePrincipal {
    return {
      type: 'service',
      serviceId: claims.sub,
      capabilities: claims.scope,
      tenantId: claims.tid,
      credentialId: claims.cid,
      authenticatedAt: new Date(),
      jti: claims.jti,
      issuedAt: new Date(claims.iat * 1000),
      expiresAt: new Date(claims.exp * 1000),
    };
  }
}

/**
 * Factory function for creating ServiceAuthService with environment-based config
 */
export function createServiceAuthService(): ServiceAuthService {
  const config: ServiceAuthConfig = {
    jwt: {
      issuer: process.env.SERVICE_JWT_ISSUER || 'sentinel-workload-identity',
      audience: process.env.SERVICE_JWT_AUDIENCE || 'sentinel-backend',
      verificationKey: process.env.SERVICE_JWT_PUBLIC_KEY || process.env.SERVICE_JWT_SECRET || '',
      algorithm: process.env.SERVICE_JWT_ALGORITHM || 'RS256',
      clockToleranceSeconds: parseInt(process.env.SERVICE_JWT_CLOCK_TOLERANCE || '30', 10),
      maxLifetimeSeconds: parseInt(process.env.SERVICE_JWT_MAX_LIFETIME || '600', 10), // 10 minutes default
    },
    replayProtectionEnabled: process.env.SERVICE_REPLAY_PROTECTION_ENABLED !== 'false',
    replayCacheTtlSeconds: parseInt(process.env.SERVICE_REPLAY_CACHE_TTL || '900', 10), // 15 minutes
    mtlsRequired: process.env.SERVICE_MTLS_REQUIRED === 'true',
    verifyIdentityMatch: process.env.SERVICE_VERIFY_IDENTITY_MATCH === 'true',
  };

  // Warn if using symmetric key in production
  if (config.jwt.algorithm.startsWith('HS') && process.env.NODE_ENV === 'production') {
    logger.warn('Using symmetric JWT algorithm (HS*) in production. Consider using asymmetric algorithms (RS*, ES*) for better security.');
  }

  // Error if no verification key configured
  if (!config.jwt.verificationKey) {
    throw new Error(
      'Service JWT verification key must be configured via SERVICE_JWT_PUBLIC_KEY or SERVICE_JWT_SECRET environment variable'
    );
  }

  return new ServiceAuthService(config);
}
