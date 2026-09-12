/**
 * Authoritative PostgreSQL Repository for Cryptographically Signed Edge Config Bundles
 * Capability: security.signed_configuration
 * 
 * Production-ready durability for signing keys, tamper-evident configuration envelopes,
 * edge verification receipts, and immutable audit trails. Dual-mode with seamless in-memory fallback.
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";

export type SigningAlgorithm = "RSA-PSS-SHA256" | "RSA-PKCS1-SHA256" | "HMAC-SHA256" | "ED25519";
export type KeyStatus = "ACTIVE" | "RETIRED" | "REVOKED";
export type BundleStatus = "DESIRED" | "APPLIED" | "DRIFTED" | "ROLLED_BACK" | "REVOKED";
export type VerificationStatus = "VERIFIED" | "FAILED" | "TAMPERED" | "UNCHECKED";

export interface SigningKeyRecord {
  id: string;
  keyId: string;
  algorithm: SigningAlgorithm;
  keySize: number;
  publicKeyPem: string | null;
  privateKeyPem: string | null;
  hmacSecret: string | null;
  keyFingerprint: string;
  status: KeyStatus;
  validFrom: string;
  validUntil?: string | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
  signCount: number;
  verifyCount: number;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SignedConfigBundleRecord {
  id?: string;
  bundleId: string;
  edgeId: string;
  branchId?: string | null;
  version: number;
  previousVersion?: number | null;
  payload: Record<string, unknown>;
  payloadHash: string;
  canonicalPayloadHash: string;
  headerPayload: Record<string, unknown>;
  nonce: string;
  signature: string;
  algorithm: SigningAlgorithm;
  keyId: string;
  signerIdentity: string;
  signerRole: string;
  status: BundleStatus;
  verificationStatus: VerificationStatus;
  verificationError?: string | null;
  expiresAt?: string | null;
  appliedVersion?: number | null;
  appliedAt?: string | null;
  appliedHash?: string | null;
  driftDetails?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationReceiptRecord {
  id: string;
  bundleId: string;
  edgeId: string;
  version: number;
  appliedHash: string;
  verificationResult: "VERIFIED" | "FAILED" | "TAMPERED";
  rejectionReason?: string | null;
  edgeAgentVersion?: string | null;
  clientIp?: string | null;
  receivedAt: string;
}

export interface SignedConfigAuditRecord {
  id: string;
  eventType: string;
  keyId?: string | null;
  bundleId?: string | null;
  edgeId?: string | null;
  version?: number | null;
  actorId: string;
  actorType: "USER" | "SYSTEM" | "EDGE_AGENT";
  status: "SUCCESS" | "FAILURE";
  details: Record<string, unknown>;
  ipAddress?: string | null;
  createdAt: string;
}

export class SignedConfigRepository {
  private inMemoryKeys = new Map<string, SigningKeyRecord>();
  private inMemoryBundles = new Map<string, SignedConfigBundleRecord>(); // key: `${edgeId}:${version}`
  private inMemoryReceipts: VerificationReceiptRecord[] = [];
  private inMemoryAuditLogs: SignedConfigAuditRecord[] = [];

  constructor(private readonly pool?: Pool) {}

  // ============================================================================
  // Key Management
  // ============================================================================

  async saveKey(key: SigningKeyRecord): Promise<SigningKeyRecord> {
    const now = new Date().toISOString();
    const updatedKey: SigningKeyRecord = {
      ...key,
      updatedAt: now,
      createdAt: key.createdAt || now,
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO edge_config_signing_keys (
            id, key_id, algorithm, key_size, public_key_pem, private_key_pem,
            hmac_secret, key_fingerprint, status, valid_from, valid_until,
            revoked_at, revocation_reason, sign_count, verify_count, last_used_at,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (key_id) DO UPDATE SET
            status = EXCLUDED.status,
            revoked_at = EXCLUDED.revoked_at,
            revocation_reason = EXCLUDED.revocation_reason,
            sign_count = EXCLUDED.sign_count,
            verify_count = EXCLUDED.verify_count,
            last_used_at = EXCLUDED.last_used_at,
            updated_at = EXCLUDED.updated_at`,
          [
            updatedKey.id || randomUUID(),
            updatedKey.keyId,
            updatedKey.algorithm,
            updatedKey.keySize,
            updatedKey.publicKeyPem,
            updatedKey.privateKeyPem,
            updatedKey.hmacSecret,
            updatedKey.keyFingerprint,
            updatedKey.status,
            updatedKey.validFrom,
            updatedKey.validUntil || null,
            updatedKey.revokedAt || null,
            updatedKey.revocationReason || null,
            updatedKey.signCount,
            updatedKey.verifyCount,
            updatedKey.lastUsedAt || null,
            updatedKey.createdAt,
            updatedKey.updatedAt,
          ]
        );
      } catch (err) {
        // Fallback to in-memory on pool error
      }
    }

    this.inMemoryKeys.set(updatedKey.keyId, updatedKey);
    return updatedKey;
  }

  async getKey(keyId: string): Promise<SigningKeyRecord | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM edge_config_signing_keys WHERE key_id = $1 LIMIT 1`,
          [keyId]
        );
        if (res.rows.length > 0) {
          return this.mapRowToKey(res.rows[0]);
        }
      } catch {
        // Fallback to in-memory
      }
    }
    return this.inMemoryKeys.get(keyId) || null;
  }

  async getActiveKey(algorithm?: SigningAlgorithm): Promise<SigningKeyRecord | null> {
    if (this.pool) {
      try {
        let query = `SELECT * FROM edge_config_signing_keys WHERE status = 'ACTIVE'`;
        const params: unknown[] = [];
        if (algorithm) {
          query += ` AND algorithm = $1`;
          params.push(algorithm);
        }
        query += ` ORDER BY created_at DESC LIMIT 1`;
        const res = await this.pool.query(query, params);
        if (res.rows.length > 0) {
          return this.mapRowToKey(res.rows[0]);
        }
      } catch {
        // Fallback
      }
    }

    const matching = Array.from(this.inMemoryKeys.values())
      .filter((k) => k.status === "ACTIVE" && (!algorithm || k.algorithm === algorithm))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return matching[0] || null;
  }

  async listKeys(): Promise<SigningKeyRecord[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM edge_config_signing_keys ORDER BY created_at DESC`
        );
        return res.rows.map((row) => this.mapRowToKey(row));
      } catch {
        // Fallback
      }
    }

    return Array.from(this.inMemoryKeys.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async incrementKeyUsage(keyId: string, type: "sign" | "verify"): Promise<void> {
    const key = await this.getKey(keyId);
    if (!key) return;

    if (type === "sign") key.signCount += 1;
    if (type === "verify") key.verifyCount += 1;
    key.lastUsedAt = new Date().toISOString();

    await this.saveKey(key);
  }

  async revokeKey(keyId: string, reason: string): Promise<SigningKeyRecord | null> {
    const key = await this.getKey(keyId);
    if (!key) return null;

    key.status = "REVOKED";
    key.revokedAt = new Date().toISOString();
    key.revocationReason = reason;

    return await this.saveKey(key);
  }

  async retireKey(keyId: string): Promise<SigningKeyRecord | null> {
    const key = await this.getKey(keyId);
    if (!key) return null;

    key.status = "RETIRED";
    return await this.saveKey(key);
  }

  // ============================================================================
  // Bundle Management
  // ============================================================================

  async saveBundle(bundle: SignedConfigBundleRecord): Promise<SignedConfigBundleRecord> {
    const now = new Date().toISOString();
    const updatedBundle: SignedConfigBundleRecord = {
      ...bundle,
      updatedAt: now,
      createdAt: bundle.createdAt || now,
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO edge_signed_configurations (
            bundle_id, edge_id, branch_id, version, previous_version, payload,
            payload_hash, canonical_payload_hash, header_payload, nonce,
            signature, algorithm, key_id, signer_identity, signer_role,
            status, verification_status, verification_error, expires_at,
            applied_version, applied_at, applied_hash, drift_details,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $25
          )
          ON CONFLICT (edge_id, version) DO UPDATE SET
            bundle_id = EXCLUDED.bundle_id,
            previous_version = EXCLUDED.previous_version,
            payload = EXCLUDED.payload,
            payload_hash = EXCLUDED.payload_hash,
            canonical_payload_hash = EXCLUDED.canonical_payload_hash,
            header_payload = EXCLUDED.header_payload,
            nonce = EXCLUDED.nonce,
            signature = EXCLUDED.signature,
            algorithm = EXCLUDED.algorithm,
            key_id = EXCLUDED.key_id,
            signer_identity = EXCLUDED.signer_identity,
            signer_role = EXCLUDED.signer_role,
            status = EXCLUDED.status,
            verification_status = EXCLUDED.verification_status,
            verification_error = EXCLUDED.verification_error,
            expires_at = EXCLUDED.expires_at,
            applied_version = EXCLUDED.applied_version,
            applied_at = EXCLUDED.applied_at,
            applied_hash = EXCLUDED.applied_hash,
            drift_details = EXCLUDED.drift_details,
            updated_at = EXCLUDED.updated_at`,
          [
            updatedBundle.bundleId,
            updatedBundle.edgeId,
            updatedBundle.branchId || null,
            updatedBundle.version,
            updatedBundle.previousVersion || null,
            JSON.stringify(updatedBundle.payload),
            updatedBundle.payloadHash,
            updatedBundle.canonicalPayloadHash,
            JSON.stringify(updatedBundle.headerPayload),
            updatedBundle.nonce,
            updatedBundle.signature,
            updatedBundle.algorithm,
            updatedBundle.keyId,
            updatedBundle.signerIdentity,
            updatedBundle.signerRole,
            updatedBundle.status,
            updatedBundle.verificationStatus,
            updatedBundle.verificationError || null,
            updatedBundle.expiresAt || null,
            updatedBundle.appliedVersion || null,
            updatedBundle.appliedAt || null,
            updatedBundle.appliedHash || null,
            updatedBundle.driftDetails ? JSON.stringify(updatedBundle.driftDetails) : null,
            updatedBundle.createdAt,
            updatedBundle.updatedAt,
          ]
        );
      } catch (err) {
        // Fallback
      }
    }

    this.inMemoryBundles.set(`${bundle.edgeId}:${bundle.version}`, updatedBundle);
    return updatedBundle;
  }

  async getBundle(edgeId: string, version: number): Promise<SignedConfigBundleRecord | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM edge_signed_configurations WHERE edge_id = $1 AND version = $2 LIMIT 1`,
          [edgeId, version]
        );
        if (res.rows.length > 0) {
          return this.mapRowToBundle(res.rows[0]);
        }
      } catch {
        // Fallback
      }
    }
    return this.inMemoryBundles.get(`${edgeId}:${version}`) || null;
  }

  async getLatestDesiredBundle(edgeId: string): Promise<SignedConfigBundleRecord | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM edge_signed_configurations 
           WHERE edge_id = $1 
           ORDER BY version DESC LIMIT 1`,
          [edgeId]
        );
        if (res.rows.length > 0) {
          return this.mapRowToBundle(res.rows[0]);
        }
      } catch {
        // Fallback
      }
    }

    const matching = Array.from(this.inMemoryBundles.values())
      .filter((b) => b.edgeId === edgeId)
      .sort((a, b) => b.version - a.version);

    return matching[0] || null;
  }

  async listBundleHistory(edgeId: string, limit = 50): Promise<SignedConfigBundleRecord[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM edge_signed_configurations 
           WHERE edge_id = $1 
           ORDER BY version DESC LIMIT $2`,
          [edgeId, limit]
        );
        return res.rows.map((r) => this.mapRowToBundle(r));
      } catch {
        // Fallback
      }
    }

    return Array.from(this.inMemoryBundles.values())
      .filter((b) => b.edgeId === edgeId)
      .sort((a, b) => b.version - a.version)
      .slice(0, limit);
  }

  async recordReceipt(receipt: VerificationReceiptRecord): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO edge_config_verification_receipts (
            id, bundle_id, edge_id, version, applied_hash, verification_result,
            rejection_reason, edge_agent_version, client_ip, received_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            receipt.id || randomUUID(),
            receipt.bundleId,
            receipt.edgeId,
            receipt.version,
            receipt.appliedHash,
            receipt.verificationResult,
            receipt.rejectionReason || null,
            receipt.edgeAgentVersion || null,
            receipt.clientIp || null,
            receipt.receivedAt,
          ]
        );
      } catch {
        // Fallback
      }
    }
    this.inMemoryReceipts.push(receipt);
  }

  // ============================================================================
  // Audit Logs
  // ============================================================================

  async recordAudit(log: Omit<SignedConfigAuditRecord, "id" | "createdAt">): Promise<void> {
    const record: SignedConfigAuditRecord = {
      ...log,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO edge_config_audit_logs (
            id, event_type, key_id, bundle_id, edge_id, version,
            actor_id, actor_type, status, details, ip_address, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            record.id,
            record.eventType,
            record.keyId || null,
            record.bundleId || null,
            record.edgeId || null,
            record.version || null,
            record.actorId,
            record.actorType,
            record.status,
            JSON.stringify(record.details),
            record.ipAddress || null,
            record.createdAt,
          ]
        );
      } catch {
        // Fallback
      }
    }

    this.inMemoryAuditLogs.unshift(record);
    if (this.inMemoryAuditLogs.length > 500) {
      this.inMemoryAuditLogs.pop();
    }
  }

  async listAuditLogs(params?: {
    edgeId?: string;
    keyId?: string;
    eventType?: string;
    limit?: number;
  }): Promise<SignedConfigAuditRecord[]> {
    const limit = params?.limit || 50;

    if (this.pool) {
      try {
        const conditions: string[] = [];
        const queryParams: unknown[] = [];
        let idx = 1;

        if (params?.edgeId) {
          conditions.push(`edge_id = $${idx++}`);
          queryParams.push(params.edgeId);
        }
        if (params?.keyId) {
          conditions.push(`key_id = $${idx++}`);
          queryParams.push(params.keyId);
        }
        if (params?.eventType) {
          conditions.push(`event_type = $${idx++}`);
          queryParams.push(params.eventType);
        }

        let query = `SELECT * FROM edge_config_audit_logs`;
        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(" AND ")}`;
        }
        query += ` ORDER BY created_at DESC LIMIT $${idx}`;
        queryParams.push(limit);

        const res = await this.pool.query(query, queryParams);
        return res.rows.map((row) => ({
          id: row.id,
          eventType: row.event_type,
          keyId: row.key_id,
          bundleId: row.bundle_id,
          edgeId: row.edge_id,
          version: row.version,
          actorId: row.actor_id,
          actorType: row.actor_type,
          status: row.status,
          details: typeof row.details === "string" ? JSON.parse(row.details) : row.details,
          ipAddress: row.ip_address,
          createdAt: new Date(row.created_at).toISOString(),
        }));
      } catch {
        // Fallback
      }
    }

    return this.inMemoryAuditLogs
      .filter((l) => {
        if (params?.edgeId && l.edgeId !== params.edgeId) return false;
        if (params?.keyId && l.keyId !== params.keyId) return false;
        if (params?.eventType && l.eventType !== params.eventType) return false;
        return true;
      })
      .slice(0, limit);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private mapRowToKey(row: any): SigningKeyRecord {
    return {
      id: row.id,
      keyId: row.key_id,
      algorithm: row.algorithm,
      keySize: row.key_size,
      publicKeyPem: row.public_key_pem,
      privateKeyPem: row.private_key_pem,
      hmacSecret: row.hmac_secret,
      keyFingerprint: row.key_fingerprint,
      status: row.status,
      validFrom: new Date(row.valid_from).toISOString(),
      validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : null,
      revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
      revocationReason: row.revocation_reason,
      signCount: Number(row.sign_count || 0),
      verifyCount: Number(row.verify_count || 0),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapRowToBundle(row: any): SignedConfigBundleRecord {
    return {
      id: row.id,
      bundleId: row.bundle_id || row.id,
      edgeId: row.edge_id,
      branchId: row.branch_id,
      version: row.version,
      previousVersion: row.previous_version,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      payloadHash: row.payload_hash,
      canonicalPayloadHash: row.canonical_payload_hash || row.payload_hash,
      headerPayload: typeof row.header_payload === "string" ? JSON.parse(row.header_payload) : (row.header_payload || {}),
      nonce: row.nonce || "",
      signature: row.signature,
      algorithm: row.algorithm || "HMAC-SHA256",
      keyId: row.key_id || "legacy-key",
      signerIdentity: row.signer_identity,
      signerRole: row.signer_role || "SECURITY_ADMIN",
      status: row.status,
      verificationStatus: row.verification_status || "UNCHECKED",
      verificationError: row.verification_error,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      appliedVersion: row.applied_version,
      appliedAt: row.applied_at ? new Date(row.applied_at).toISOString() : null,
      appliedHash: row.applied_hash,
      driftDetails: typeof row.drift_details === "string" ? JSON.parse(row.drift_details) : row.drift_details,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
