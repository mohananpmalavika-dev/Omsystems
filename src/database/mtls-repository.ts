/**
 * Authoritative PostgreSQL Repository for Mutual TLS (mTLS) Authentication
 * Zero mock data — durable persistence for certificate pins, CRL, and audit records.
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import type {
  IMtlsRepository,
  PinCertificateInput,
  TrustedCertificatePinRecord,
  RevokeCertificateInput,
  MtlsRevocationRecord,
  MtlsAuditEntry,
  MtlsMetrics,
  NodeRole,
} from "../security/mtls/mtls.types.js";

export class PostgresMtlsRepository implements IMtlsRepository {
  constructor(private readonly pool: Pool) {}

  async pinCertificate(input: PinCertificateInput): Promise<TrustedCertificatePinRecord> {
    const fingerprint = input.certFingerprint.toLowerCase();
    const query = `
      INSERT INTO mtls_certificate_pins (
        node_id, role, cert_fingerprint, common_name, allowed_sans,
        subject_dn, issuer_dn, serial_number, not_before, not_after,
        status, pinned_by, metadata, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE', $11, $12, NOW())
      ON CONFLICT (cert_fingerprint) DO UPDATE SET
        node_id = EXCLUDED.node_id,
        role = EXCLUDED.role,
        common_name = EXCLUDED.common_name,
        allowed_sans = EXCLUDED.allowed_sans,
        subject_dn = EXCLUDED.subject_dn,
        issuer_dn = EXCLUDED.issuer_dn,
        serial_number = EXCLUDED.serial_number,
        not_before = EXCLUDED.not_before,
        not_after = EXCLUDED.not_after,
        status = 'ACTIVE',
        revoked_at = NULL,
        revocation_reason = NULL,
        pinned_by = EXCLUDED.pinned_by,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      input.nodeId,
      input.role,
      fingerprint,
      input.commonName || null,
      input.allowedSans || [],
      input.subjectDn || null,
      input.issuerDn || null,
      input.serialNumber || null,
      input.notBefore ? new Date(input.notBefore) : null,
      input.notAfter ? new Date(input.notAfter) : null,
      input.pinnedBy || "security-admin",
      JSON.stringify(input.metadata || {}),
    ];

    const result = await this.pool.query(query, values);
    return this.mapPinRow(result.rows[0]);
  }

  async getPinByFingerprint(fingerprint: string): Promise<TrustedCertificatePinRecord | null> {
    const query = `SELECT * FROM mtls_certificate_pins WHERE cert_fingerprint = $1 LIMIT 1;`;
    const result = await this.pool.query(query, [fingerprint.toLowerCase()]);
    if (result.rows.length === 0) return null;
    return this.mapPinRow(result.rows[0]);
  }

  async listPins(role?: NodeRole): Promise<TrustedCertificatePinRecord[]> {
    const query = `
      SELECT * FROM mtls_certificate_pins 
      WHERE ($1::text IS NULL OR role = $1)
      ORDER BY created_at DESC;
    `;
    const result = await this.pool.query(query, [role || null]);
    return result.rows.map((row) => this.mapPinRow(row));
  }

  async deletePin(fingerprint: string): Promise<boolean> {
    const query = `DELETE FROM mtls_certificate_pins WHERE cert_fingerprint = $1 RETURNING id;`;
    const result = await this.pool.query(query, [fingerprint.toLowerCase()]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async revokeCertificate(input: RevokeCertificateInput): Promise<void> {
    const fingerprint = input.fingerprint.toLowerCase();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Upsert into CRL table
      const crlQuery = `
        INSERT INTO mtls_revoked_certificates (
          fingerprint, serial_number, issuer_dn, revocation_reason, revoked_by, revoked_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (fingerprint) DO UPDATE SET
          revocation_reason = EXCLUDED.revocation_reason,
          revoked_by = EXCLUDED.revoked_by,
          revoked_at = NOW();
      `;
      await client.query(crlQuery, [
        fingerprint,
        input.serialNumber || null,
        input.issuerDn || null,
        input.reason,
        input.revokedBy || "security-admin",
      ]);

      // 2. Mark pinned cert as REVOKED if present
      const pinUpdateQuery = `
        UPDATE mtls_certificate_pins
        SET status = 'REVOKED', revoked_at = NOW(), revocation_reason = $2, updated_at = NOW()
        WHERE cert_fingerprint = $1;
      `;
      await client.query(pinUpdateQuery, [fingerprint, input.reason]);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async isRevoked(fingerprint: string): Promise<boolean> {
    const query = `SELECT 1 FROM mtls_revoked_certificates WHERE fingerprint = $1 LIMIT 1;`;
    const result = await this.pool.query(query, [fingerprint.toLowerCase()]);
    return result.rows.length > 0;
  }

  async listRevokedCertificates(): Promise<MtlsRevocationRecord[]> {
    const query = `SELECT * FROM mtls_revoked_certificates ORDER BY revoked_at DESC;`;
    const result = await this.pool.query(query);
    return result.rows.map((row) => ({
      fingerprint: row.fingerprint,
      serialNumber: row.serial_number || undefined,
      issuerDn: row.issuer_dn || undefined,
      reason: row.revocation_reason,
      revokedBy: row.revoked_by,
      revokedAt: new Date(row.revoked_at).toISOString(),
    }));
  }

  async recordAuditLog(entry: MtlsAuditEntry): Promise<void> {
    const query = `
      INSERT INTO mtls_auth_audit_log (
        node_id, role, fingerprint, client_ip, endpoint,
        decision, rejection_reason, tls_version, cipher_suite, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW());
    `;
    await this.pool.query(query, [
      entry.nodeId || null,
      entry.role || null,
      entry.fingerprint.toLowerCase(),
      entry.clientIp || null,
      entry.endpoint || null,
      entry.decision,
      entry.rejectionReason || null,
      entry.tlsVersion || null,
      entry.cipherSuite || null,
    ]);
  }

  async getAuditLogs(filter?: {
    nodeId?: string;
    limit?: number;
    offset?: number;
  }): Promise<MtlsAuditEntry[]> {
    const limit = Math.min(filter?.limit || 100, 1000);
    const offset = Math.max(filter?.offset || 0, 0);

    const query = `
      SELECT * FROM mtls_auth_audit_log
      WHERE ($1::text IS NULL OR node_id = $1)
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3;
    `;
    const result = await this.pool.query(query, [filter?.nodeId || null, limit, offset]);
    return result.rows.map((row) => ({
      id: row.id,
      nodeId: row.node_id || undefined,
      role: row.role || undefined,
      fingerprint: row.fingerprint,
      clientIp: row.client_ip || undefined,
      endpoint: row.endpoint || undefined,
      decision: row.decision,
      rejectionReason: row.rejection_reason || undefined,
      tlsVersion: row.tls_version || undefined,
      cipherSuite: row.cipher_suite || undefined,
      timestamp: new Date(row.timestamp).toISOString(),
    }));
  }

  async getMetrics(): Promise<MtlsMetrics> {
    const pinsResult = await this.pool.query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active
      FROM mtls_certificate_pins;
    `);
    const revResult = await this.pool.query(`SELECT COUNT(*)::int AS total FROM mtls_revoked_certificates;`);
    const auditResult = await this.pool.query(`SELECT COUNT(*)::int AS total FROM mtls_auth_audit_log;`);

    return {
      totalPinned: pinsResult.rows[0]?.total || 0,
      activePins: pinsResult.rows[0]?.active || 0,
      totalRevoked: revResult.rows[0]?.total || 0,
      totalAuditLogs: auditResult.rows[0]?.total || 0,
    };
  }

  private mapPinRow(row: any): TrustedCertificatePinRecord {
    return {
      id: row.id,
      nodeId: row.node_id,
      role: row.role,
      certFingerprint: row.cert_fingerprint,
      commonName: row.common_name || undefined,
      allowedSans: Array.isArray(row.allowed_sans) ? row.allowed_sans : [],
      subjectDn: row.subject_dn || undefined,
      issuerDn: row.issuer_dn || undefined,
      serialNumber: row.serial_number || undefined,
      notBefore: row.not_before ? new Date(row.not_before).toISOString() : undefined,
      notAfter: row.not_after ? new Date(row.not_after).toISOString() : undefined,
      status: row.status,
      revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : undefined,
      revocationReason: row.revocation_reason || undefined,
      pinnedBy: row.pinned_by,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata || {},
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}

/**
 * High-performance In-Memory Repository for local testing & headless execution.
 */
export class InMemoryMtlsRepository implements IMtlsRepository {
  private pins = new Map<string, TrustedCertificatePinRecord>();
  private revocations = new Map<string, MtlsRevocationRecord>();
  private auditLogs: MtlsAuditEntry[] = [];

  async pinCertificate(input: PinCertificateInput): Promise<TrustedCertificatePinRecord> {
    const fingerprint = input.certFingerprint.toLowerCase();
    const existing = this.pins.get(fingerprint);
    const now = new Date().toISOString();

    const record: TrustedCertificatePinRecord = {
      id: existing?.id || randomUUID(),
      nodeId: input.nodeId,
      role: input.role,
      certFingerprint: fingerprint,
      commonName: input.commonName,
      allowedSans: [...input.allowedSans],
      subjectDn: input.subjectDn,
      issuerDn: input.issuerDn,
      serialNumber: input.serialNumber,
      notBefore: input.notBefore ? new Date(input.notBefore).toISOString() : undefined,
      notAfter: input.notAfter ? new Date(input.notAfter).toISOString() : undefined,
      status: "ACTIVE",
      pinnedBy: input.pinnedBy || "security-admin",
      metadata: input.metadata || {},
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.pins.set(fingerprint, record);
    return record;
  }

  async getPinByFingerprint(fingerprint: string): Promise<TrustedCertificatePinRecord | null> {
    return this.pins.get(fingerprint.toLowerCase()) || null;
  }

  async listPins(role?: NodeRole): Promise<TrustedCertificatePinRecord[]> {
    const all = Array.from(this.pins.values());
    if (!role) return all;
    return all.filter((p) => p.role === role);
  }

  async deletePin(fingerprint: string): Promise<boolean> {
    return this.pins.delete(fingerprint.toLowerCase());
  }

  async revokeCertificate(input: RevokeCertificateInput): Promise<void> {
    const fingerprint = input.fingerprint.toLowerCase();
    const now = new Date().toISOString();

    this.revocations.set(fingerprint, {
      fingerprint,
      serialNumber: input.serialNumber,
      issuerDn: input.issuerDn,
      reason: input.reason,
      revokedBy: input.revokedBy,
      revokedAt: now,
    });

    const pin = this.pins.get(fingerprint);
    if (pin) {
      pin.status = "REVOKED";
      pin.revokedAt = now;
      pin.revocationReason = input.reason;
      pin.updatedAt = now;
    }
  }

  async isRevoked(fingerprint: string): Promise<boolean> {
    return this.revocations.has(fingerprint.toLowerCase());
  }

  async listRevokedCertificates(): Promise<MtlsRevocationRecord[]> {
    return Array.from(this.revocations.values());
  }

  async recordAuditLog(entry: MtlsAuditEntry): Promise<void> {
    this.auditLogs.unshift({
      id: randomUUID(),
      ...entry,
      fingerprint: entry.fingerprint.toLowerCase(),
      timestamp: entry.timestamp || new Date().toISOString(),
    });
    // Keep max 5000 in memory
    if (this.auditLogs.length > 5000) {
      this.auditLogs.length = 5000;
    }
  }

  async getAuditLogs(filter?: {
    nodeId?: string;
    limit?: number;
    offset?: number;
  }): Promise<MtlsAuditEntry[]> {
    let logs = this.auditLogs;
    if (filter?.nodeId) {
      logs = logs.filter((l) => l.nodeId === filter.nodeId);
    }
    const offset = filter?.offset || 0;
    const limit = filter?.limit || 100;
    return logs.slice(offset, offset + limit);
  }

  async getMetrics(): Promise<MtlsMetrics> {
    let active = 0;
    for (const pin of this.pins.values()) {
      if (pin.status === "ACTIVE") active++;
    }
    return {
      totalPinned: this.pins.size,
      activePins: active,
      totalRevoked: this.revocations.size,
      totalAuditLogs: this.auditLogs.length,
    };
  }
}
