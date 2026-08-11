/**
 * Recipient Resolution Module
 * 
 * Complete recipient resolution system with:
 * - Discriminated recipient selectors
 * - Tenant-scoped principal resolution
 * - Verified endpoint resolution
 * - Authorization and preference filtering
 * - Audit trail and provenance tracking
 */

// Core types
export * from './recipient.types.js';
export * from './endpoint.types.js';

// Services
export { RecipientResolver } from './recipient-resolver.service.js';
export { EndpointResolver } from './endpoint-resolver.service.js';
export { RecipientPolicyService } from './recipient-policy.service.js';

// Service interfaces (for dependency injection)
export type {
  IUserRepository,
  IMembershipRepository,
  IBranchRepository,
  IIncidentRepository,
  IOnCallService,
  IEscalationPolicyService,
} from './recipient-resolver.service.js';

export type {
  IUserRepository as IEndpointUserRepository,
  IPushDeviceRepository,
  INotificationPreferenceRepository,
} from './endpoint-resolver.service.js';

export type {
  INotificationPreferenceRepository as IPolicyPreferenceRepository,
  PolicyContext,
  AuthorizationRequest,
  AuthorizationResult,
  PreferenceFilterRequest,
} from './recipient-policy.service.js';

// Repository implementations
export { UserRepository } from './repositories/user.repository.js';
export { MembershipRepository } from './repositories/membership.repository.js';
export { BranchRepository } from './repositories/branch.repository.js';
export { IncidentRepository } from './repositories/incident.repository.js';
export { PushDeviceRepository } from './repositories/push-device.repository.js';
export { NotificationPreferenceRepository } from './repositories/notification-preference.repository.js';

// Service implementations
export { OnCallService } from './services/on-call.service.js';
export { EscalationPolicyService } from './services/escalation-policy.service.js';

// Audit events
export {
  AuditEventEmitter,
  auditEmitter,
  emitResolutionAuditTrail,
} from './audit-events.js';
export type {
  AuditEventType,
  AuditEvent,
} from './audit-events.js';
