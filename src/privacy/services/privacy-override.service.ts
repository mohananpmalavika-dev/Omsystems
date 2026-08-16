/**
 * Privacy Override & Temporary Grant Service
 * 
 * Manages privileged unmasking workflows:
 * - Temporary grants with mandatory reasons & case numbers
 * - Short TTL expiration (e.g. 10 minutes)
 * - Immutable privacy audit logging
 */

import { randomUUID } from 'node:crypto';
import type {
  PrivacyAuditEvent,
  PrivacyAuditEventType,
  PrivacyOverrideGrant,
} from '../domain/privacy.types.js';

export interface RequestUnmaskInput {
  tenantId: string;
  userId: string;
  username: string;
  cameraId: string;
  branchId?: string;
  operation: 'LIVE' | 'PLAYBACK';
  reason: string;
  caseNumber?: string;
  incidentId?: string;
  durationMinutes?: number;
  approvedBy?: string;
  sourceIp?: string;
}

export class PrivacyOverrideService {
  private grants: Map<string, PrivacyOverrideGrant> = new Map();
  private auditLogs: PrivacyAuditEvent[] = [];

  /**
   * Requests a temporary unmasked viewing grant
   */
  async requestUnmask(input: RequestUnmaskInput): Promise<PrivacyOverrideGrant> {
    if (!input.reason || input.reason.trim().length < 5) {
      throw new Error('Mandatory investigation reason (minimum 5 characters) required for unmasking');
    }

    const duration = Math.min(input.durationMinutes || 10, 60); // Max 60 minutes
    const now = new Date();
    const expiresAt = new Date(now.getTime() + duration * 60 * 1000);
    const grantId = `GRANT-${randomUUID().substring(0, 8).toUpperCase()}`;

    const grant: PrivacyOverrideGrant = {
      id: grantId,
      tenantId: input.tenantId,
      userId: input.userId,
      username: input.username,
      cameraId: input.cameraId,
      operation: input.operation,
      reason: input.reason,
      caseNumber: input.caseNumber,
      incidentId: input.incidentId,
      approvedBy: input.approvedBy || input.userId,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'ACTIVE',
    };

    this.grants.set(grantId, grant);

    this.recordAudit({
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      username: input.username,
      event: 'PRIVACY_UNMASK_APPROVED',
      branchId: input.branchId,
      cameraId: input.cameraId,
      operation: input.operation,
      incidentId: input.incidentId,
      caseNumber: input.caseNumber,
      reason: input.reason,
      sourceIp: input.sourceIp,
      timestamp: now.toISOString(),
    });

    return grant;
  }

  /**
   * Checks if an active unmask grant exists for user & camera
   */
  getActiveGrant(userId: string, cameraId: string, operation: 'LIVE' | 'PLAYBACK'): PrivacyOverrideGrant | undefined {
    const now = Date.now();
    for (const grant of this.grants.values()) {
      if (grant.userId === userId && grant.cameraId === cameraId && grant.operation === operation && grant.status === 'ACTIVE') {
        if (new Date(grant.expiresAt).getTime() > now) {
          return grant;
        } else {
          grant.status = 'EXPIRED';
        }
      }
    }
    return undefined;
  }

  /**
   * Explicitly revokes a grant
   */
  revokeGrant(grantId: string, revokedBy: string): void {
    const grant = this.grants.get(grantId);
    if (grant) {
      grant.status = 'REVOKED';
      this.recordAudit({
        id: randomUUID(),
        tenantId: grant.tenantId,
        userId: revokedBy,
        username: revokedBy,
        event: 'PRIVACY_UNMASK_DENIED',
        cameraId: grant.cameraId,
        reason: `Grant ${grantId} explicitly revoked`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  recordAudit(event: PrivacyAuditEvent): void {
    this.auditLogs.push(event);
    if (this.auditLogs.length > 20000) {
      this.auditLogs.shift();
    }
  }

  getAuditLogs(tenantId?: string): PrivacyAuditEvent[] {
    return tenantId ? this.auditLogs.filter((l) => l.tenantId === tenantId) : this.auditLogs;
  }
}

export const privacyOverrideService = new PrivacyOverrideService();
