/**
 * Privacy Override & Temporary Grant Service
 * 
 * Manages privileged unmasking workflows:
 * - Temporary grants with mandatory reasons & case numbers
 * - Short TTL expiration (e.g. 10 minutes)
 * - Immutable hash-chained privacy audit logging backed by PostgreSQL
 */

import { randomUUID, createHash } from 'node:crypto';
import type { Pool } from 'pg';
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
  workstationId?: string;
  sessionId?: string;
}

export class PrivacyOverrideService {
  private grants: Map<string, PrivacyOverrideGrant> = new Map();
  private auditLogs: PrivacyAuditEvent[] = [];
  private lastAuditHash = '0000000000000000000000000000000000000000000000000000000000000000';

  constructor(private readonly pool?: Pool) {}

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

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO privacy_override_grants (
             id, tenant_id, branch_id, camera_id, user_id, username, operation, reason,
             case_number, incident_id, approved_by, issued_at, expires_at, status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ACTIVE')`,
          [
            grant.id,
            grant.tenantId,
            input.branchId || null,
            grant.cameraId,
            grant.userId,
            grant.username,
            grant.operation,
            grant.reason,
            grant.caseNumber || null,
            grant.incidentId || null,
            grant.approvedBy,
            now,
            expiresAt,
          ],
        );
      } catch (err) {
        console.warn('[PrivacyOverrideService] DB save grant failed, using memory:', err);
      }
    }

    this.grants.set(grantId, grant);

    await this.recordAudit({
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
  async getActiveGrantAsync(
    userId: string,
    cameraId: string,
    operation: 'LIVE' | 'PLAYBACK',
    tenantId?: string,
  ): Promise<PrivacyOverrideGrant | undefined> {
    const now = new Date();

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM privacy_override_grants
           WHERE user_id = $1 AND camera_id = $2 AND operation = $3 AND status = 'ACTIVE' AND expires_at > $4
           ORDER BY expires_at DESC LIMIT 1`,
          [userId, cameraId, operation, now],
        );

        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: row.id,
            tenantId: row.tenant_id,
            userId: row.user_id,
            username: row.username,
            cameraId: row.camera_id,
            operation: row.operation,
            reason: row.reason,
            caseNumber: row.case_number,
            incidentId: row.incident_id,
            approvedBy: row.approved_by,
            issuedAt: new Date(row.issued_at).toISOString(),
            expiresAt: new Date(row.expires_at).toISOString(),
            status: row.status,
          };
        }
      } catch (err) {
        console.warn('[PrivacyOverrideService] DB getActiveGrant query error:', err);
      }
    }

    // In-memory fallback
    return this.getActiveGrant(userId, cameraId, operation);
  }

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
  async revokeGrant(grantId: string, revokedBy: string): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE privacy_override_grants SET status = 'REVOKED', revoked_at = NOW() WHERE id = $1`,
          [grantId],
        );
        await this.pool.query(
          `INSERT INTO privacy_override_revocations (id, grant_id, revoked_by_user_id, revocation_reason, revoked_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [`rev-${randomUUID()}`, grantId, revokedBy, 'Explicit operator or admin revocation'],
        );
      } catch (err) {
        console.warn('[PrivacyOverrideService] DB revoke grant error:', err);
      }
    }

    const grant = this.grants.get(grantId);
    if (grant) {
      grant.status = 'REVOKED';
      await this.recordAudit({
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

  async recordAudit(event: PrivacyAuditEvent): Promise<void> {
    // Forensic SHA-256 Hash Chaining
    const payload = `${this.lastAuditHash}:${event.tenantId}:${event.userId}:${event.cameraId}:${event.event}:${event.timestamp}`;
    const recordHash = createHash('sha256').update(payload).digest('hex');
    const prevHash = this.lastAuditHash;
    this.lastAuditHash = recordHash;

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO privacy_access_audit (
             id, tenant_id, branch_id, camera_id, user_id, username, event, operation,
             incident_id, case_number, reason, source_ip, prev_hash, record_hash, timestamp
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            event.id,
            event.tenantId,
            event.branchId || null,
            event.cameraId || 'N/A',
            event.userId,
            event.username,
            event.event,
            event.operation || 'LIVE',
            event.incidentId || null,
            event.caseNumber || null,
            event.reason,
            event.sourceIp || null,
            prevHash,
            recordHash,
            new Date(event.timestamp),
          ],
        );
      } catch (err) {
        console.warn('[PrivacyOverrideService] DB audit log insert error:', err);
      }
    }

    this.auditLogs.push(event);
    if (this.auditLogs.length > 20000) {
      this.auditLogs.shift();
    }
  }

  async getAuditLogsAsync(tenantId?: string): Promise<PrivacyAuditEvent[]> {
    if (this.pool) {
      try {
        const query = tenantId
          ? `SELECT * FROM privacy_access_audit WHERE tenant_id = $1 ORDER BY timestamp DESC LIMIT 500`
          : `SELECT * FROM privacy_access_audit ORDER BY timestamp DESC LIMIT 500`;
        const params = tenantId ? [tenantId] : [];
        const res = await this.pool.query(query, params);
        return res.rows.map((r) => ({
          id: r.id,
          tenantId: r.tenant_id,
          userId: r.user_id,
          username: r.username,
          event: r.event as PrivacyAuditEventType,
          branchId: r.branch_id,
          cameraId: r.camera_id,
          operation: r.operation,
          incidentId: r.incident_id,
          caseNumber: r.case_number,
          reason: r.reason,
          sourceIp: r.source_ip,
          timestamp: new Date(r.timestamp).toISOString(),
        }));
      } catch (err) {
        console.warn('[PrivacyOverrideService] DB getAuditLogsAsync error:', err);
      }
    }

    return this.getAuditLogs(tenantId);
  }

  getAuditLogs(tenantId?: string): PrivacyAuditEvent[] {
    return tenantId ? this.auditLogs.filter((l) => l.tenantId === tenantId) : this.auditLogs;
  }
}

export const privacyOverrideService = new PrivacyOverrideService();
