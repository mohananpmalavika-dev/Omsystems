/**
 * MFA Rate Limiting Factory
 * 
 * Factory for creating and wiring together all MFA rate limiting components.
 * Provides a single entry point for initialization.
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import { logger } from '../../../utils/logger.js';

// Services
import { RedisRateLimitStore } from '../abuse/stores/redis-rate-limit.store.js';
import { IpResolver } from '../normalization/ip-resolver.js';
import { LimiterIdentityService } from '../normalization/limiter-identity.service.js';
import { MfaAbuseProtectionService } from '../abuse/mfa-abuse-protection.service.js';
import { MfaSecurityEventRepository } from '../repositories/mfa-security-event.repository.js';
import { MfaLockoutPolicyService } from '../abuse/mfa-lockout-policy.service.js';

// Configuration
import {
  MfaRateLimitConfig,
  loadMfaRateLimitConfig,
  validateMfaRateLimitConfig,
  getMfaRateLimitConfigForEnv,
} from './mfa-rate-limit.config.js';

export interface MfaRateLimitServices {
  /** Redis rate limit store */
  rateLimitStore: RedisRateLimitStore;
  
  /** IP resolver for trusted proxy handling */
  ipResolver: IpResolver;
  
  /** Identity service for HMAC hashing */
  identityService: LimiterIdentityService;
  
  /** Core abuse protection service */
  abuseProtection: MfaAbuseProtectionService;
  
  /** Security event repository */
  securityEventRepo: MfaSecurityEventRepository;
  
  /** Lockout policy service */
  lockoutPolicy: MfaLockoutPolicyService;
  
  /** Redis client (for health checks, etc.) */
  redis: Redis;
  
  /** Configuration used */
  config: MfaRateLimitConfig;
}

/**
 * Create MFA rate limiting services
 */
export async function createMfaRateLimitServices(
  pool: Pool,
  configOverrides?: Partial<MfaRateLimitConfig>
): Promise<MfaRateLimitServices> {
  try {
    // Load configuration
    const baseConfig = loadMfaRateLimitConfig();
    const envConfig = getMfaRateLimitConfigForEnv(
      (process.env.NODE_ENV as any) || 'development'
    );
    
    const config: MfaRateLimitConfig = {
      ...baseConfig,
      ...envConfig,
      ...configOverrides,
    };
    
    // Validate configuration
    validateMfaRateLimitConfig(config);
    
    logger.info('Initializing MFA rate limiting services', {
      redisUrl: config.redisUrl.replace(/:[^:@]+@/, ':***@'), // Mask password
      trustedProxies: config.trustedProxies.length,
      requireRedis: config.requireRedis,
      failClosed: config.failClosed,
    });
    
    // Create Redis client
    const redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times) => {
        if (times > 10) {
          logger.error('Redis connection failed after 10 retries');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
    });
    
    // Wait for Redis connection
    await redis.ping();
    logger.info('Redis connected successfully');
    
    // Create rate limit store
    const rateLimitStore = new RedisRateLimitStore(redis);
    
    // Create IP resolver
    const ipResolver = new IpResolver({
      trustedProxies: config.trustedProxies,
      trustAllProxies: process.env.NODE_ENV === 'development' && process.env.TRUST_ALL_PROXIES === 'true',
    });
    
    // Create identity service
    const identityService = new LimiterIdentityService(
      {
        hmacSecret: config.hmacSecret,
      },
      ipResolver
    );
    
    // Create security event repository
    const securityEventRepo = new MfaSecurityEventRepository(pool);
    
    // Create abuse protection service
    const abuseProtection = new MfaAbuseProtectionService(
      rateLimitStore,
      identityService,
      {
        policy: config.policy,
        requireRedis: config.requireRedis,
        failClosed: config.failClosed,
      }
    );
    
    // Create lockout policy service
    const lockoutPolicy = new MfaLockoutPolicyService(
      securityEventRepo,
      abuseProtection,
      config.policy
    );
    
    logger.info('MFA rate limiting services initialized successfully');
    
    return {
      rateLimitStore,
      ipResolver,
      identityService,
      abuseProtection,
      securityEventRepo,
      lockoutPolicy,
      redis,
      config,
    };
  } catch (error) {
    logger.error('Failed to initialize MFA rate limiting services', { error });
    throw error;
  }
}

/**
 * Create MFA rate limiting services with graceful degradation
 * 
 * If Redis is unavailable, returns null and logs warning.
 * Suitable for optional rate limiting in development.
 */
export async function createMfaRateLimitServicesOptional(
  pool: Pool,
  configOverrides?: Partial<MfaRateLimitConfig>
): Promise<MfaRateLimitServices | null> {
  try {
    return await createMfaRateLimitServices(pool, configOverrides);
  } catch (error) {
    logger.warn('MFA rate limiting services unavailable - degrading gracefully', { error });
    return null;
  }
}

/**
 * Shutdown MFA rate limiting services
 */
export async function shutdownMfaRateLimitServices(
  services: MfaRateLimitServices
): Promise<void> {
  try {
    logger.info('Shutting down MFA rate limiting services');
    
    // Close Redis connection
    await services.rateLimitStore.close();
    await services.redis.quit();
    
    logger.info('MFA rate limiting services shut down successfully');
  } catch (error) {
    logger.error('Error shutting down MFA rate limiting services', { error });
    throw error;
  }
}

/**
 * Health check for MFA rate limiting services
 */
export async function checkMfaRateLimitHealth(
  services: MfaRateLimitServices
): Promise<{
  healthy: boolean;
  redis: boolean;
  details?: string;
}> {
  try {
    const redisHealthy = await services.rateLimitStore.isHealthy();
    
    return {
      healthy: redisHealthy,
      redis: redisHealthy,
    };
  } catch (error) {
    return {
      healthy: false,
      redis: false,
      details: error instanceof Error ? error.message : String(error),
    };
  }
}
