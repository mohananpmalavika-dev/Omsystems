/**
 * Notification System Exports
 * 
 * Main entry point for the unified notification subsystem
 */

// Core services
export { NotificationService } from './notification.service.js';
export { NotificationRepository } from './notification.repository.js';
export { NotificationWorker } from './notification-worker.js';
export { NotificationWorkerRunner } from './notification-worker-runner.js';
export { ProviderRegistry } from './provider-registry.js';

// Advanced services
export { RecipientResolverService } from './recipient-resolver.service.js';
export { NotificationPolicyService } from './notification-policy.service.js';
export { NotificationMonitoringService } from './monitoring.service.js';

// Types
export * from './notification.types.js';
export * from './notification.errors.js';

// Providers
export { SmtpEmailProvider } from './providers/smtp-email.provider.js';
export { InAppProvider } from './providers/in-app.provider.js';
export { WebhookProvider } from './providers/webhook.provider.js';
export { MockProvider } from './providers/mock.provider.js';

// Routes
export { registerInternalNotificationsRoute } from './routes/internal-notifications.route.js';
export { registerProviderCallbackRoutes } from './routes/provider-callbacks.route.js';
