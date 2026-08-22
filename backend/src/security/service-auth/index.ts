/**
 * Service Authentication Module
 * 
 * Zero-trust service-to-service authentication and authorization.
 * 
 * Features:
 * - JWT-based workload identity
 * - Capability-based authorization
 * - Replay protection
 * - Idempotency enforcement
 * - Multi-dimensional rate limiting
 * - Audit logging
 */

// Types and interfaces
export * from './service-auth.types.js';

// Core services
export { ServiceAuthService, createServiceAuthService } from './service-auth.service.js';
export { ServiceAuthorizationService, createServiceAuthorizationService } from './service-authorization.service.js';
export { ReplayProtectionService, RedisReplayProtectionService, createReplayProtectionService } from './replay-protection.service.js';
export { NotificationIdempotencyService, computeRequestHash, createNotificationIdempotencyService } from './notification-idempotency.service.js';
export { NotificationRatePolicyService, RedisRatePolicyService, createNotificationRatePolicyService } from './notification-rate-policy.service.js';
export { InternalNotificationService, createInternalNotificationService } from './internal-notification.service.js';

// Middleware
export {
  createServiceAuthMiddleware,
  createCapabilityMiddleware,
  createServiceAuthErrorHandler,
  getServicePrincipal,
  isService,
  hasCapability,
} from './service-auth.middleware.js';
