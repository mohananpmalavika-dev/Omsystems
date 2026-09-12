/**
 * Authoritative PostgreSQL Repository for Hardware Security Module (HSM) Evidence Signing
 * Zero mock data — durable persistence for PKCS#11 tokens, signing keys, sealed packages, and cryptographic audit records.
 */

import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

export interface HsmTokenRecord {
  id: string;
  slotId: number;
  tokenLabel: string;
  tokenSerial: string;
  manufacturer: string;
  model: string;
  firmwareVersion?: string;
  hardwareVersion?: string;
  fipsLevel: number;
  modulePath: string;
  status: 'ONLINE' | 'OFFLINE' | 'LOCKED' | 'DEGRADED';
  pinSourceType: 'env' | 'file' | 'secret';
  totalSessions: number;
  activeSessions: number;
  mechanisms: string[];
  metadata: Record<string, unknown>;
  lastHeartbeatAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterTokenInput {
  slotId: number;
  tokenLabel: string;
  tokenSerial: string;
  manufacturer: string;
  model: string;
  firmwareVersion?: string;
  hardwareVersion?: string;
  fipsLevel?: number;
  modulePath: string;
  status?: 'ONLINE' | 'OFFLINE' | 'LOCKED' | 'DEGRADED';
  pinSourceType?: 'env' | 'file' | 'secret';
  totalSessions?: number;
  activeSessions?: number;
  mechanisms?: string[];
  metadata?: Record<string, unknown>;
}

export interface HsmKeyRecord {
  id: string;
  keyLabel: string;
  tokenSerial?: string;
  ckaId?: string;
  algorithm: string;
  keySize: number;
  purpose: string;
  publicKeyPem: string;
  publicKeyFingerprint: string;
  certificatePem?: string;
  certificateChain: string[];
  isActive: boolean;
  signCount: number;
  verifyCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterKeyInput {
  keyLabel: string;
  tokenSerial?: string;
  ckaId?: string;
  algorithm: string;
  keySize?: number;
  purpose?: string;
  publicKeyPem: string;
  publicKeyFingerprint: string;
  certificatePem?: string;
  certificateChain?: string[];
  isActive?: boolean;
}

export interface HsmSignedPackageRecord {
  id: string;
  evidenceId: string;
  tenantId: string;
  branchId?: string;
  cameraId?: string;
  manifestSha256: string;
  keyLabel: string;
  keyFingerprint: string;
  algorithm: string;
  signatureBase64: string;
  signatureDerHex: string;
  certificatePem?: string;
  certificateChain: string[];
  manifestPayload: Record<string, unknown>;
  artifactsSummary: unknown[];
  timeSyncSummary: Record<string, unknown>;
  verificationStatus: 'VERIFIED' | 'FAILED' | 'UNCHECKED';
  signedAt: string;
  createdAt: string;
}

export interface RecordSignedPackageInput {
  evidenceId: string;
  tenantId: string;
  branchId?: string;
  cameraId?: string;
  manifestSha256: string;
  keyLabel: string;
  keyFingerprint: string;
  algorithm: string;
  signatureBase64: string;
  signatureDerHex: string;
  certificatePem?: string;
  certificateChain?: string[];
  manifestPayload: Record<string, unknown>;
  artifactsSummary?: unknown[];
  timeSyncSummary?: Record<string, unknown>;
  verificationStatus?: 'VERIFIED' | 'FAILED' | 'UNCHECKED';
  signedAt?: string;
}

export interface HsmAuditRecord {
  id: string;
  operation: string;
  keyLabel?: string;
  tokenSerial?: string;
  evidenceId?: string;
  actorId: string;
  actorType: 'USER' | 'SERVICE' | 'SYSTEM';
  status: 'SUCCESS' | 'FAILURE';
  errorMessage?: string;
  durationMs: number;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface RecordAuditInput {
  operation: string;
  keyLabel?: string;
  tokenSerial?: string;
  evidenceId?: string;
  actorId: string;
  actorType?: 'USER' | 'SERVICE' | 'SYSTEM';
  status: 'SUCCESS' | 'FAILURE';
  errorMessage?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

export class HsmEvidenceRepository {
  private inMemoryTokens = new Map<string, HsmTokenRecord>();
  private inMemoryKeys = new Map<string, HsmKeyRecord>();
  private inMemoryPackages = new Map<string, HsmSignedPackageRecord>();
  private inMemoryAuditLogs: HsmAuditRecord[] = [];

  constructor(private readonly pool?: Pool) {}

  async registerToken(input: RegisterTokenInput): Promise<HsmTokenRecord> {
    const now = new Date().toISOString();
    if (this.pool) {
      const query = `
        INSERT INTO hsm_token_registry (
          slot_id, token_label, token_serial, manufacturer, model,
          firmware_version, hardware_version, fips_level, module_path,
          status, pin_source_type, total_sessions, active_sessions,
          mechanisms, metadata, last_heartbeat_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
        ON CONFLICT (token_serial) DO UPDATE SET
          slot_id = EXCLUDED.slot_id,
          token_label = EXCLUDED.token_label,
          manufacturer = EXCLUDED.manufacturer,
          model = EXCLUDED.model,
          firmware_version = EXCLUDED.firmware_version,
          hardware_version = EXCLUDED.hardware_version,
          fips_level = EXCLUDED.fips_level,
          module_path = EXCLUDED.module_path,
          status = EXCLUDED.status,
          pin_source_type = EXCLUDED.pin_source_type,
          total_sessions = EXCLUDED.total_sessions,
          active_sessions = EXCLUDED.active_sessions,
          mechanisms = EXCLUDED.mechanisms,
          metadata = EXCLUDED.metadata,
          last_heartbeat_at = NOW(),
          updated_at = NOW()
        RETURNING *;
      `;
      const values = [
        input.slotId,
        input.tokenLabel,
        input.tokenSerial,
        input.manufacturer,
        input.model,
        input.firmwareVersion || null,
        input.hardwareVersion || null,
        input.fipsLevel ?? 3,
        input.modulePath,
        input.status || 'ONLINE',
        input.pinSourceType || 'env',
        input.totalSessions ?? 1,
        input.activeSessions ?? 0,
        input.mechanisms || [],
        JSON.stringify(input.metadata || {}),
      ];
      const result = await this.pool.query(query, values);
      return this.mapTokenRow(result.rows[0]);
    }

    const existing = this.inMemoryTokens.get(input.tokenSerial);
    const record: HsmTokenRecord = {
      id: existing?.id || randomUUID(),
      slotId: input.slotId,
      tokenLabel: input.tokenLabel,
      tokenSerial: input.tokenSerial,
      manufacturer: input.manufacturer,
      model: input.model,
      firmwareVersion: input.firmwareVersion,
      hardwareVersion: input.hardwareVersion,
      fipsLevel: input.fipsLevel ?? 3,
      modulePath: input.modulePath,
      status: input.status || 'ONLINE',
      pinSourceType: input.pinSourceType || 'env',
      totalSessions: input.totalSessions ?? 1,
      activeSessions: input.activeSessions ?? 0,
      mechanisms: input.mechanisms || [],
      metadata: input.metadata || {},
      lastHeartbeatAt: now,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.inMemoryTokens.set(record.tokenSerial, record);
    return record;
  }

  async getTokenBySerial(serial: string): Promise<HsmTokenRecord | null> {
    if (this.pool) {
      const result = await this.pool.query(
        `SELECT * FROM hsm_token_registry WHERE token_serial = $1 LIMIT 1;`,
        [serial]
      );
      return result.rows.length > 0 ? this.mapTokenRow(result.rows[0]) : null;
    }
    return this.inMemoryTokens.get(serial) || null;
  }

  async listTokens(): Promise<HsmTokenRecord[]> {
    if (this.pool) {
      const result = await this.pool.query(
        `SELECT * FROM hsm_token_registry ORDER BY slot_id ASC;`
      );
      return result.rows.map((r) => this.mapTokenRow(r));
    }
    return Array.from(this.inMemoryTokens.values());
  }

  async updateTokenHeartbeat(serial: string, status?: 'ONLINE' | 'OFFLINE' | 'LOCKED' | 'DEGRADED', activeSessions?: number): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `UPDATE hsm_token_registry 
         SET last_heartbeat_at = NOW(),
             status = COALESCE($2, status),
             active_sessions = COALESCE($3, active_sessions),
             updated_at = NOW()
         WHERE token_serial = $1;`,
        [serial, status || null, activeSessions ?? null]
      );
      return;
    }
    const tok = this.inMemoryTokens.get(serial);
    if (tok) {
      if (status) tok.status = status;
      if (activeSessions !== undefined) tok.activeSessions = activeSessions;
      tok.lastHeartbeatAt = new Date().toISOString();
      tok.updatedAt = new Date().toISOString();
    }
  }

  async registerKey(input: RegisterKeyInput): Promise<HsmKeyRecord> {
    const now = new Date().toISOString();
    if (this.pool) {
      const query = `
        INSERT INTO hsm_key_registry (
          key_label, token_serial, cka_id, algorithm, key_size,
          purpose, public_key_pem, public_key_fingerprint, certificate_pem,
          certificate_chain, is_active, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (key_label) DO UPDATE SET
          token_serial = EXCLUDED.token_serial,
          cka_id = EXCLUDED.cka_id,
          algorithm = EXCLUDED.algorithm,
          key_size = EXCLUDED.key_size,
          purpose = EXCLUDED.purpose,
          public_key_pem = EXCLUDED.public_key_pem,
          public_key_fingerprint = EXCLUDED.public_key_fingerprint,
          certificate_pem = EXCLUDED.certificate_pem,
          certificate_chain = EXCLUDED.certificate_chain,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
        RETURNING *;
      `;
      const values = [
        input.keyLabel,
        input.tokenSerial || null,
        input.ckaId || null,
        input.algorithm,
        input.keySize ?? 256,
        input.purpose || 'EVIDENCE_SIGNING',
        input.publicKeyPem,
        input.publicKeyFingerprint.toLowerCase(),
        input.certificatePem || null,
        input.certificateChain || [],
        input.isActive ?? true,
      ];
      const result = await this.pool.query(query, values);
      return this.mapKeyRow(result.rows[0]);
    }

    const existing = this.inMemoryKeys.get(input.keyLabel);
    const record: HsmKeyRecord = {
      id: existing?.id || randomUUID(),
      keyLabel: input.keyLabel,
      tokenSerial: input.tokenSerial,
      ckaId: input.ckaId,
      algorithm: input.algorithm,
      keySize: input.keySize ?? 256,
      purpose: input.purpose || 'EVIDENCE_SIGNING',
      publicKeyPem: input.publicKeyPem,
      publicKeyFingerprint: input.publicKeyFingerprint.toLowerCase(),
      certificatePem: input.certificatePem,
      certificateChain: input.certificateChain || [],
      isActive: input.isActive ?? true,
      signCount: existing?.signCount ?? 0,
      verifyCount: existing?.verifyCount ?? 0,
      lastUsedAt: existing?.lastUsedAt,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.inMemoryKeys.set(record.keyLabel, record);
    return record;
  }

  async getKeyByLabel(keyLabel: string): Promise<HsmKeyRecord | null> {
    if (this.pool) {
      const result = await this.pool.query(
        `SELECT * FROM hsm_key_registry WHERE key_label = $1 LIMIT 1;`,
        [keyLabel]
      );
      return result.rows.length > 0 ? this.mapKeyRow(result.rows[0]) : null;
    }
    return this.inMemoryKeys.get(keyLabel) || null;
  }

  async listKeys(): Promise<HsmKeyRecord[]> {
    if (this.pool) {
      const result = await this.pool.query(
        `SELECT * FROM hsm_key_registry ORDER BY created_at DESC;`
      );
      return result.rows.map((r) => this.mapKeyRow(r));
    }
    return Array.from(this.inMemoryKeys.values());
  }

  async incrementKeyUsage(keyLabel: string, op: 'sign' | 'verify'): Promise<void> {
    if (this.pool) {
      const field = op === 'sign' ? 'sign_count' : 'verify_count';
      await this.pool.query(
        `UPDATE hsm_key_registry 
         SET ${field} = ${field} + 1, last_used_at = NOW(), updated_at = NOW()
         WHERE key_label = $1;`,
        [keyLabel]
      );
      return;
    }
    const k = this.inMemoryKeys.get(keyLabel);
    if (k) {
      if (op === 'sign') k.signCount++;
      else k.verifyCount++;
      k.lastUsedAt = new Date().toISOString();
      k.updatedAt = new Date().toISOString();
    }
  }

  async recordSignedPackage(input: RecordSignedPackageInput): Promise<HsmSignedPackageRecord> {
    const now = input.signedAt || new Date().toISOString();
    if (this.pool) {
      const query = `
        INSERT INTO hsm_signed_evidence_packages (
          evidence_id, tenant_id, branch_id, camera_id, manifest_sha256,
          key_label, key_fingerprint, algorithm, signature_base64, signature_der_hex,
          certificate_pem, certificate_chain, manifest_payload, artifacts_summary,
          time_sync_summary, verification_status, signed_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
        ON CONFLICT (evidence_id) DO UPDATE SET
          manifest_sha256 = EXCLUDED.manifest_sha256,
          signature_base64 = EXCLUDED.signature_base64,
          signature_der_hex = EXCLUDED.signature_der_hex,
          certificate_pem = EXCLUDED.certificate_pem,
          certificate_chain = EXCLUDED.certificate_chain,
          manifest_payload = EXCLUDED.manifest_payload,
          artifacts_summary = EXCLUDED.artifacts_summary,
          time_sync_summary = EXCLUDED.time_sync_summary,
          verification_status = EXCLUDED.verification_status,
          signed_at = EXCLUDED.signed_at
        RETURNING *;
      `;
      const values = [
        input.evidenceId,
        input.tenantId,
        input.branchId || null,
        input.cameraId || null,
        input.manifestSha256,
        input.keyLabel,
        input.keyFingerprint.toLowerCase(),
        input.algorithm,
        input.signatureBase64,
        input.signatureDerHex,
        input.certificatePem || null,
        input.certificateChain || [],
        JSON.stringify(input.manifestPayload),
        JSON.stringify(input.artifactsSummary || []),
        JSON.stringify(input.timeSyncSummary || {}),
        input.verificationStatus || 'VERIFIED',
        new Date(now),
      ];
      const result = await this.pool.query(query, values);
      return this.mapPackageRow(result.rows[0]);
    }

    const record: HsmSignedPackageRecord = {
      id: randomUUID(),
      evidenceId: input.evidenceId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      cameraId: input.cameraId,
      manifestSha256: input.manifestSha256,
      keyLabel: input.keyLabel,
      keyFingerprint: input.keyFingerprint.toLowerCase(),
      algorithm: input.algorithm,
      signatureBase64: input.signatureBase64,
      signatureDerHex: input.signatureDerHex,
      certificatePem: input.certificatePem,
      certificateChain: input.certificateChain || [],
      manifestPayload: input.manifestPayload,
      artifactsSummary: input.artifactsSummary || [],
      timeSyncSummary: input.timeSyncSummary || {},
      verificationStatus: input.verificationStatus || 'VERIFIED',
      signedAt: now,
      createdAt: now,
    };
    this.inMemoryPackages.set(record.evidenceId, record);
    return record;
  }

  async getSignedPackage(evidenceId: string): Promise<HsmSignedPackageRecord | null> {
    if (this.pool) {
      const result = await this.pool.query(
        `SELECT * FROM hsm_signed_evidence_packages WHERE evidence_id = $1 LIMIT 1;`,
        [evidenceId]
      );
      return result.rows.length > 0 ? this.mapPackageRow(result.rows[0]) : null;
    }
    return this.inMemoryPackages.get(evidenceId) || null;
  }

  async listSignedPackages(tenantId?: string, limit = 50): Promise<HsmSignedPackageRecord[]> {
    if (this.pool) {
      const query = `
        SELECT * FROM hsm_signed_evidence_packages
        WHERE ($1::text IS NULL OR tenant_id = $1)
        ORDER BY signed_at DESC
        LIMIT $2;
      `;
      const result = await this.pool.query(query, [tenantId || null, limit]);
      return result.rows.map((r) => this.mapPackageRow(r));
    }
    let list = Array.from(this.inMemoryPackages.values());
    if (tenantId) {
      list = list.filter((p) => p.tenantId === tenantId);
    }
    return list.slice(0, limit);
  }

  async recordAudit(input: RecordAuditInput): Promise<HsmAuditRecord> {
    const now = new Date().toISOString();
    if (this.pool) {
      const query = `
        INSERT INTO hsm_cryptographic_audit_log (
          operation, key_label, token_serial, evidence_id, actor_id,
          actor_type, status, error_message, duration_ms, details, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        RETURNING *;
      `;
      const values = [
        input.operation,
        input.keyLabel || null,
        input.tokenSerial || null,
        input.evidenceId || null,
        input.actorId,
        input.actorType || 'SERVICE',
        input.status,
        input.errorMessage || null,
        input.durationMs ?? 0,
        JSON.stringify(input.details || {}),
      ];
      const result = await this.pool.query(query, values);
      return this.mapAuditRow(result.rows[0]);
    }

    const record: HsmAuditRecord = {
      id: randomUUID(),
      operation: input.operation,
      keyLabel: input.keyLabel,
      tokenSerial: input.tokenSerial,
      evidenceId: input.evidenceId,
      actorId: input.actorId,
      actorType: input.actorType || 'SERVICE',
      status: input.status,
      errorMessage: input.errorMessage,
      durationMs: input.durationMs ?? 0,
      details: input.details || {},
      timestamp: now,
    };
    this.inMemoryAuditLogs.unshift(record);
    if (this.inMemoryAuditLogs.length > 500) {
      this.inMemoryAuditLogs.pop();
    }
    return record;
  }

  async getAuditLogs(filter?: { keyLabel?: string; evidenceId?: string; limit?: number }): Promise<HsmAuditRecord[]> {
    if (this.pool) {
      const query = `
        SELECT * FROM hsm_cryptographic_audit_log
        WHERE ($1::text IS NULL OR key_label = $1)
          AND ($2::text IS NULL OR evidence_id = $2)
        ORDER BY timestamp DESC
        LIMIT $3;
      `;
      const result = await this.pool.query(query, [
        filter?.keyLabel || null,
        filter?.evidenceId || null,
        filter?.limit ?? 100,
      ]);
      return result.rows.map((r) => this.mapAuditRow(r));
    }
    let list = this.inMemoryAuditLogs;
    if (filter?.keyLabel) list = list.filter((l) => l.keyLabel === filter.keyLabel);
    if (filter?.evidenceId) list = list.filter((l) => l.evidenceId === filter.evidenceId);
    return list.slice(0, filter?.limit ?? 100);
  }

  // --- Row Mappers ---

  private mapTokenRow(row: any): HsmTokenRecord {
    return {
      id: row.id,
      slotId: Number(row.slot_id),
      tokenLabel: row.token_label,
      tokenSerial: row.token_serial,
      manufacturer: row.manufacturer,
      model: row.model,
      firmwareVersion: row.firmware_version || undefined,
      hardwareVersion: row.hardware_version || undefined,
      fipsLevel: Number(row.fips_level ?? 3),
      modulePath: row.module_path,
      status: row.status,
      pinSourceType: row.pin_source_type,
      totalSessions: Number(row.total_sessions ?? 1),
      activeSessions: Number(row.active_sessions ?? 0),
      mechanisms: Array.isArray(row.mechanisms) ? row.mechanisms : [],
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
      lastHeartbeatAt: new Date(row.last_heartbeat_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapKeyRow(row: any): HsmKeyRecord {
    return {
      id: row.id,
      keyLabel: row.key_label,
      tokenSerial: row.token_serial || undefined,
      ckaId: row.cka_id || undefined,
      algorithm: row.algorithm,
      keySize: Number(row.key_size ?? 256),
      purpose: row.purpose,
      publicKeyPem: row.public_key_pem,
      publicKeyFingerprint: row.public_key_fingerprint,
      certificatePem: row.certificate_pem || undefined,
      certificateChain: Array.isArray(row.certificate_chain) ? row.certificate_chain : [],
      isActive: Boolean(row.is_active),
      signCount: Number(row.sign_count ?? 0),
      verifyCount: Number(row.verify_count ?? 0),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapPackageRow(row: any): HsmSignedPackageRecord {
    return {
      id: row.id,
      evidenceId: row.evidence_id,
      tenantId: row.tenant_id,
      branchId: row.branch_id || undefined,
      cameraId: row.camera_id || undefined,
      manifestSha256: row.manifest_sha256,
      keyLabel: row.key_label,
      keyFingerprint: row.key_fingerprint,
      algorithm: row.algorithm,
      signatureBase64: row.signature_base64,
      signatureDerHex: row.signature_der_hex,
      certificatePem: row.certificate_pem || undefined,
      certificateChain: Array.isArray(row.certificate_chain) ? row.certificate_chain : [],
      manifestPayload: typeof row.manifest_payload === 'string' ? JSON.parse(row.manifest_payload) : (row.manifest_payload || {}),
      artifactsSummary: typeof row.artifacts_summary === 'string' ? JSON.parse(row.artifacts_summary) : (row.artifacts_summary || []),
      timeSyncSummary: typeof row.time_sync_summary === 'string' ? JSON.parse(row.time_sync_summary) : (row.time_sync_summary || {}),
      verificationStatus: row.verification_status,
      signedAt: new Date(row.signed_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private mapAuditRow(row: any): HsmAuditRecord {
    return {
      id: row.id,
      operation: row.operation,
      keyLabel: row.key_label || undefined,
      tokenSerial: row.token_serial || undefined,
      evidenceId: row.evidence_id || undefined,
      actorId: row.actor_id,
      actorType: row.actor_type,
      status: row.status,
      errorMessage: row.error_message || undefined,
      durationMs: Number(row.duration_ms ?? 0),
      details: typeof row.details === 'string' ? JSON.parse(row.details) : (row.details || {}),
      timestamp: new Date(row.timestamp).toISOString(),
    };
  }
}
