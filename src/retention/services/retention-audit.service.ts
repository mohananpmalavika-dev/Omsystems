/**
 * Retention Audit Trail Service
 * 
 * Records an immutable audit log of all retention transitions, policy changes,
 * and compliance verifications for regulatory banking auditability.
 */

import type { RetentionAuditEvent } from "../domain/retention.types.js";

export class RetentionAuditService {
  private auditLogs: RetentionAuditEvent[] = [];

  recordEvent(event: Omit<RetentionAuditEvent, "id" | "occurredAt">): RetentionAuditEvent {
    const log: RetentionAuditEvent = {
      ...event,
      id: `audit-ret-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      occurredAt: new Date(),
    };
    this.auditLogs.unshift(log);
    return log;
  }

  getAuditLogs(tenantId: string, limit = 100): RetentionAuditEvent[] {
    return this.auditLogs.filter((l) => l.tenantId === tenantId).slice(0, limit);
  }

  getByEntity(entityId: string): RetentionAuditEvent[] {
    return this.auditLogs.filter((l) => l.entityId === entityId);
  }
}

export const retentionAuditService = new RetentionAuditService();
