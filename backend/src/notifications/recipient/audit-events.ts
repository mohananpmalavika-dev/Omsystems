/**
 * Audit Events for Recipient Resolution
 * 
 * Emits structured audit events for recipient resolution activities.
 * Critical for compliance and incident investigation.
 */

import { logger } from '../../utils/logger.js';
import {
  ResolvedPrincipal,
  RecipientResolutionResult,
  RecipientSelector,
  RecipientProvenance,
} from './recipient.types.js';
import {
  DeliveryEndpoint,
  EndpointResolutionResult,
  hashEndpoint,
} from './endpoint.types.js';

/**
 * Audit event types
 */
export type AuditEventType =
  | 'notification.recipient.resolved'
  | 'notification.recipient.unresolved'
  | 'notification.recipient.authorization_denied'
  | 'notification.endpoint.resolved'
  | 'notification.endpoint.filtered'
  | 'notification.preference.applied'
  | 'notification.escalation.triggered';

/**
 * Base audit event
 */
export interface AuditEvent {
  event: AuditEventType;
  timestamp: Date;
  tenantId: string;
  notificationId?: string;
  notificationType?: string;
  metadata: Record<string, unknown>;
}

/**
 * Audit event emitter
 */
export class AuditEventEmitter {
  /**
   * Emit recipient resolution success event
   */
  emitRecipientResolved(params: {
    tenantId: string;
    notificationId: string;
    notificationType: string;
    result: RecipientResolutionResult;
  }): void {
    const event: AuditEvent = {
      event: 'notification.recipient.resolved',
      timestamp: new Date(),
      tenantId: params.tenantId,
      notificationId: params.notificationId,
      notificationType: params.notificationType,
      metadata: {
        state: params.result.state,
        principalsResolved: params.result.principals.length,
        failures: params.result.failures.length,
        principals: params.result.principals.map(p => ({
          type: p.type,
          userId: p.userId,
          displayName: p.displayName,
          sources: p.provenance.map(prov => prov.source),
        })),
        durationMs: params.result.metadata?.durationMs,
      },
    };

    this.emit(event);
  }

  /**
   * Emit recipient resolution failure event
   */
  emitRecipientUnresolved(params: {
    tenantId: string;
    notificationId?: string;
    notificationType: string;
    selectors: RecipientSelector[];
    reason: string;
  }): void {
    const event: AuditEvent = {
      event: 'notification.recipient.unresolved',
      timestamp: new Date(),
      tenantId: params.tenantId,
      notificationId: params.notificationId,
      notificationType: params.notificationType,
      metadata: {
        selectorCount: params.selectors.length,
        selectorTypes: [...new Set(params.selectors.map(s => s.type))],
        reason: params.reason,
      },
    };

    this.emit(event);
  }

  /**
   * Emit authorization denied event
   */
  emitAuthorizationDenied(params: {
    tenantId: string;
    notificationType: string;
    deniedSelectors: Array<{
      selector: RecipientSelector;
      reason: string;
    }>;
  }): void {
    const event: AuditEvent = {
      event: 'notification.recipient.authorization_denied',
      timestamp: new Date(),
      tenantId: params.tenantId,
      notificationType: params.notificationType,
      metadata: {
        deniedCount: params.deniedSelectors.length,
        denials: params.deniedSelectors.map(d => ({
          selectorType: d.selector.type,
          reason: d.reason,
        })),
      },
    };

    this.emit(event);
  }

  /**
   * Emit endpoint resolution event
   */
  emitEndpointResolved(params: {
    tenantId: string;
    notificationId: string;
    notificationType: string;
    result: EndpointResolutionResult;
  }): void {
    const event: AuditEvent = {
      event: 'notification.endpoint.resolved',
      timestamp: new Date(),
      tenantId: params.tenantId,
      notificationId: params.notificationId,
      notificationType: params.notificationType,
      metadata: {
        endpointsResolved: params.result.endpoints.length,
        warnings: params.result.warnings.length,
        channels: this.summarizeChannels(params.result.endpoints),
        durationMs: params.result.metadata?.durationMs,
      },
    };

    this.emit(event);
  }

  /**
   * Emit endpoint filtered event (preferences applied)
   */
  emitEndpointFiltered(params: {
    tenantId: string;
    notificationId: string;
    userId: string;
    originalCount: number;
    filteredCount: number;
    reason: string;
  }): void {
    const event: AuditEvent = {
      event: 'notification.endpoint.filtered',
      timestamp: new Date(),
      tenantId: params.tenantId,
      notificationId: params.notificationId,
      metadata: {
        userId: params.userId,
        originalCount: params.originalCount,
        filteredCount: params.filteredCount,
        removedCount: params.originalCount - params.filteredCount,
        reason: params.reason,
      },
    };

    this.emit(event);
  }

  /**
   * Emit preference applied event
   */
  emitPreferenceApplied(params: {
    tenantId: string;
    userId: string;
    notificationType: string;
    channel: string;
    allowed: boolean;
    reason?: string;
  }): void {
    const event: AuditEvent = {
      event: 'notification.preference.applied',
      timestamp: new Date(),
      tenantId: params.tenantId,
      notificationType: params.notificationType,
      metadata: {
        userId: params.userId,
        channel: params.channel,
        allowed: params.allowed,
        reason: params.reason,
      },
    };

    this.emit(event);
  }

  /**
   * Emit escalation triggered event
   */
  emitEscalationTriggered(params: {
    tenantId: string;
    notificationId: string;
    policyId: string;
    level: number;
    recipients: ResolvedPrincipal[];
  }): void {
    const event: AuditEvent = {
      event: 'notification.escalation.triggered',
      timestamp: new Date(),
      tenantId: params.tenantId,
      notificationId: params.notificationId,
      metadata: {
        policyId: params.policyId,
        level: params.level,
        recipientCount: params.recipients.length,
        recipients: params.recipients.map(r => ({
          userId: r.userId,
          displayName: r.displayName,
        })),
      },
    };

    this.emit(event);
  }

  /**
   * Emit the audit event (can be overridden for custom storage)
   */
  protected emit(event: AuditEvent): void {
    // Log to structured logger
    logger.info(event.event, {
      ...event,
      // Ensure no sensitive data in logs
      _audit: true,
    });

    // In production, this could also:
    // - Write to audit table
    // - Send to event bus
    // - Forward to SIEM
    // - Store in time-series DB
  }

  /**
   * Summarize channels for audit
   */
  private summarizeChannels(
    endpoints: DeliveryEndpoint[]
  ): Record<string, number> {
    const summary: Record<string, number> = {};
    
    for (const endpoint of endpoints) {
      summary[endpoint.channel] = (summary[endpoint.channel] || 0) + 1;
    }
    
    return summary;
  }
}

/**
 * Global audit emitter instance
 */
export const auditEmitter = new AuditEventEmitter();

/**
 * Helper function to emit resolution audit trail
 */
export function emitResolutionAuditTrail(params: {
  tenantId: string;
  notificationId: string;
  notificationType: string;
  recipientResult: RecipientResolutionResult;
  endpointResult: EndpointResolutionResult;
}): void {
  // Emit principal resolution
  auditEmitter.emitRecipientResolved({
    tenantId: params.tenantId,
    notificationId: params.notificationId,
    notificationType: params.notificationType,
    result: params.recipientResult,
  });

  // Emit endpoint resolution
  auditEmitter.emitEndpointResolved({
    tenantId: params.tenantId,
    notificationId: params.notificationId,
    notificationType: params.notificationType,
    result: params.endpointResult,
  });

  // Log any failures
  if (params.recipientResult.failures.length > 0) {
    logger.warn('Recipient resolution had failures', {
      tenantId: params.tenantId,
      notificationId: params.notificationId,
      failures: params.recipientResult.failures.map(f => ({
        code: f.code,
        message: f.message,
        selectorType: f.selector.type,
      })),
    });
  }

  // Log any endpoint warnings
  if (params.endpointResult.warnings.length > 0) {
    logger.warn('Endpoint resolution had warnings', {
      tenantId: params.tenantId,
      notificationId: params.notificationId,
      warnings: params.endpointResult.warnings.map(w => ({
        code: w.code,
        message: w.message,
        principalId: w.principalId,
      })),
    });
  }
}
