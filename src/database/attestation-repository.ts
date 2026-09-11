import type { Pool } from 'pg';

export interface AttestationChallengeRecord {
  id: string;
  tenantId: string;
  deviceId: string;
  nonce: string; // base64
  requestedPcrs: number[];
  hashAlgorithm: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt?: Date | null;
}

export interface AttestationIdentityRecord {
  id: string;
  tenantId: string;
  deviceId: string;
  akName: string;
  akPublicKeyFingerprint: string;
  akPublicKeyPem: string;
  endorsementKeyFingerprint?: string | null;
  manufacturer?: string | null;
  firmwareVersion?: string | null;
  trustLevel: 'ENROLLED' | 'VERIFIED' | 'REVOKED';
  enrolledAt: Date;
  lastAttestedAt?: Date | null;
  lastAttestationStatus?: string | null;
  revokedAt?: Date | null;
  revocationReason?: string | null;
}

export interface AttestationEvidenceRecord {
  id: string;
  tenantId: string;
  deviceId: string;
  challengeId: string;
  quote: string; // base64
  signature: string; // base64
  pcrValues: Record<string, string>;
  pcrSelection: { hashAlgorithm: string; pcrs: number[] };
  pcrDigest: string;
  structureValid: boolean;
  nonceVerified: boolean;
  signatureVerified: boolean;
  pcrDigestVerified: boolean;
  akTrusted: boolean;
  policyMatched: boolean;
  tpmState: string;
  secureBootState: string;
  failureReason?: string | null;
  receivedAt: Date;
  verifiedAt?: Date | null;
}

export interface PcrPolicyRecord {
  id: string;
  name: string;
  description?: string;
  platformType: string;
  expectedPcrs: {
    required_pcrs?: number[];
    secure_boot_pcr?: number;
    expected_values?: Record<string, string>;
  };
  hashAlgorithm: string;
  isActive: boolean;
}

export interface AttestationFleetStats {
  totalChallenges: number;
  totalSubmissions: number;
  verifiedCount: number;
  failedCount: number;
  enrolledDevices: number;
  revokedDevices: number;
  activeChallenges: number;
}

export class AttestationRepository {
  constructor(private readonly pool: Pool) {}

  async saveChallenge(challenge: AttestationChallengeRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO tpm_attestation_challenges 
        (id, tenant_id, device_id, nonce, requested_pcrs, hash_algorithm, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
        nonce = EXCLUDED.nonce,
        expires_at = EXCLUDED.expires_at`,
      [
        challenge.id,
        challenge.tenantId,
        challenge.deviceId,
        challenge.nonce,
        challenge.requestedPcrs,
        challenge.hashAlgorithm,
        challenge.createdAt,
        challenge.expiresAt,
      ]
    );
  }

  async getChallenge(challengeId: string): Promise<AttestationChallengeRecord | null> {
    const result = await this.pool.query(
      `SELECT id, tenant_id, device_id, nonce, requested_pcrs, hash_algorithm,
              created_at, expires_at, consumed_at
       FROM tpm_attestation_challenges
       WHERE id = $1`,
      [challengeId]
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      deviceId: row.device_id,
      nonce: row.nonce,
      requestedPcrs: row.requested_pcrs,
      hashAlgorithm: row.hash_algorithm,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
    };
  }

  async consumeChallenge(challengeId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE tpm_attestation_challenges
       SET consumed_at = NOW()
       WHERE id = $1 AND consumed_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [challengeId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async enrollIdentity(identity: AttestationIdentityRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO tpm_identities
        (id, tenant_id, device_id, ak_name, ak_public_key_fingerprint, ak_public_key_pem,
         endorsement_key_fingerprint, manufacturer, firmware_version, trust_level, enrolled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (tenant_id, device_id) DO UPDATE SET
        ak_name = EXCLUDED.ak_name,
        ak_public_key_fingerprint = EXCLUDED.ak_public_key_fingerprint,
        ak_public_key_pem = EXCLUDED.ak_public_key_pem,
        endorsement_key_fingerprint = EXCLUDED.endorsement_key_fingerprint,
        manufacturer = EXCLUDED.manufacturer,
        firmware_version = EXCLUDED.firmware_version,
        trust_level = EXCLUDED.trust_level,
        revoked_at = NULL,
        revocation_reason = NULL,
        updated_at = NOW()`,
      [
        identity.id,
        identity.tenantId,
        identity.deviceId,
        identity.akName,
        identity.akPublicKeyFingerprint,
        identity.akPublicKeyPem,
        identity.endorsementKeyFingerprint || null,
        identity.manufacturer || null,
        identity.firmwareVersion || null,
        identity.trustLevel,
        identity.enrolledAt,
      ]
    );
  }

  async getIdentity(deviceId: string, tenantId?: string): Promise<AttestationIdentityRecord | null> {
    let query = `
      SELECT id, tenant_id, device_id, ak_name, ak_public_key_fingerprint, ak_public_key_pem,
             endorsement_key_fingerprint, manufacturer, firmware_version, trust_level,
             enrolled_at, last_attested_at, last_attestation_status, revoked_at, revocation_reason
      FROM tpm_identities
      WHERE device_id = $1
    `;
    const params: any[] = [deviceId];

    if (tenantId) {
      query += ` AND tenant_id = $2`;
      params.push(tenantId);
    }

    const result = await this.pool.query(query, params);
    if (result.rows.length === 0) return null;
    const row = result.rows[0];

    return {
      id: row.id,
      tenantId: row.tenant_id,
      deviceId: row.device_id,
      akName: row.ak_name,
      akPublicKeyFingerprint: row.ak_public_key_fingerprint,
      akPublicKeyPem: row.ak_public_key_pem,
      endorsementKeyFingerprint: row.endorsement_key_fingerprint,
      manufacturer: row.manufacturer,
      firmwareVersion: row.firmware_version,
      trustLevel: row.trust_level,
      enrolledAt: new Date(row.enrolled_at),
      lastAttestedAt: row.last_attested_at ? new Date(row.last_attested_at) : null,
      lastAttestationStatus: row.last_attestation_status,
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      revocationReason: row.revocation_reason,
    };
  }

  async getIdentityByFingerprint(fingerprint: string): Promise<AttestationIdentityRecord | null> {
    const result = await this.pool.query(
      `SELECT id, tenant_id, device_id, ak_name, ak_public_key_fingerprint, ak_public_key_pem,
              endorsement_key_fingerprint, manufacturer, firmware_version, trust_level,
              enrolled_at, last_attested_at, last_attestation_status, revoked_at, revocation_reason
       FROM tpm_identities
       WHERE ak_public_key_fingerprint = $1`,
      [fingerprint]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];

    return {
      id: row.id,
      tenantId: row.tenant_id,
      deviceId: row.device_id,
      akName: row.ak_name,
      akPublicKeyFingerprint: row.ak_public_key_fingerprint,
      akPublicKeyPem: row.ak_public_key_pem,
      endorsementKeyFingerprint: row.endorsement_key_fingerprint,
      manufacturer: row.manufacturer,
      firmwareVersion: row.firmware_version,
      trustLevel: row.trust_level,
      enrolledAt: new Date(row.enrolled_at),
      lastAttestedAt: row.last_attested_at ? new Date(row.last_attested_at) : null,
      lastAttestationStatus: row.last_attestation_status,
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      revocationReason: row.revocation_reason,
    };
  }

  async revokeIdentity(deviceId: string, reason: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE tpm_identities
       SET trust_level = 'REVOKED',
           revoked_at = NOW(),
           revocation_reason = $2,
           updated_at = NOW()
       WHERE device_id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [deviceId, reason]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async updateIdentityStatus(deviceId: string, status: string, lastAttestedAt: Date): Promise<void> {
    await this.pool.query(
      `UPDATE tpm_identities
       SET last_attestation_status = $2,
           last_attested_at = $3,
           updated_at = NOW()
       WHERE device_id = $1`,
      [deviceId, status, lastAttestedAt]
    );
  }

  async saveEvidence(evidence: AttestationEvidenceRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO tpm_attestation_evidence
        (id, tenant_id, device_id, challenge_id, quote, signature, pcr_values, pcr_selection,
         pcr_digest, structure_valid, nonce_verified, signature_verified, pcr_digest_verified,
         ak_trusted, policy_matched, tpm_state, secure_boot_state, failure_reason, received_at, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        evidence.id,
        evidence.tenantId,
        evidence.deviceId,
        evidence.challengeId,
        evidence.quote,
        evidence.signature,
        JSON.stringify(evidence.pcrValues),
        JSON.stringify(evidence.pcrSelection),
        evidence.pcrDigest,
        evidence.structureValid,
        evidence.nonceVerified,
        evidence.signatureVerified,
        evidence.pcrDigestVerified,
        evidence.akTrusted,
        evidence.policyMatched,
        evidence.tpmState,
        evidence.secureBootState,
        evidence.failureReason || null,
        evidence.receivedAt,
        evidence.verifiedAt || null,
      ]
    );
  }

  async getLatestEvidence(deviceId: string): Promise<AttestationEvidenceRecord | null> {
    const result = await this.pool.query(
      `SELECT id, tenant_id, device_id, challenge_id, quote, signature, pcr_values, pcr_selection,
              pcr_digest, structure_valid, nonce_verified, signature_verified, pcr_digest_verified,
              ak_trusted, policy_matched, tpm_state, secure_boot_state, failure_reason, received_at, verified_at
       FROM tpm_attestation_evidence
       WHERE device_id = $1
       ORDER BY received_at DESC
       LIMIT 1`,
      [deviceId]
    );

    if (result.rows.length === 0) return null;
    return this.mapEvidenceRow(result.rows[0]);
  }

  async listEvidenceHistory(deviceId: string, limit: number = 20): Promise<AttestationEvidenceRecord[]> {
    const result = await this.pool.query(
      `SELECT id, tenant_id, device_id, challenge_id, quote, signature, pcr_values, pcr_selection,
              pcr_digest, structure_valid, nonce_verified, signature_verified, pcr_digest_verified,
              ak_trusted, policy_matched, tpm_state, secure_boot_state, failure_reason, received_at, verified_at
       FROM tpm_attestation_evidence
       WHERE device_id = $1
       ORDER BY received_at DESC
       LIMIT $2`,
      [deviceId, limit]
    );

    return result.rows.map(row => this.mapEvidenceRow(row));
  }

  async getBaselinePolicy(platformType: string = 'linux_standard'): Promise<PcrPolicyRecord | null> {
    const result = await this.pool.query(
      `SELECT id, name, description, platform_type, expected_pcrs, hash_algorithm, is_active
       FROM tpm_pcr_policies
       WHERE (platform_type = $1 OR platform_type = 'linux_standard') AND is_active = TRUE
       ORDER BY CASE WHEN platform_type = $1 THEN 0 ELSE 1 END, created_at DESC
       LIMIT 1`,
      [platformType]
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      platformType: row.platform_type,
      expectedPcrs: typeof row.expected_pcrs === 'string' ? JSON.parse(row.expected_pcrs) : row.expected_pcrs,
      hashAlgorithm: row.hash_algorithm,
      isActive: row.is_active,
    };
  }

  async logAuditEvent(
    tenantId: string,
    deviceId: string,
    eventType: string,
    details: Record<string, any>
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO tpm_attestation_audit_log (tenant_id, device_id, event_type, details)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, deviceId, eventType, JSON.stringify(details)]
    );
  }

  async getFleetStats(tenantId?: string): Promise<AttestationFleetStats> {
    const whereTenant = tenantId ? `WHERE tenant_id = $1` : '';
    const params = tenantId ? [tenantId] : [];

    const [challengesRes, evidenceRes, identitiesRes] = await Promise.all([
      this.pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE consumed_at IS NULL AND expires_at > NOW()) AS active
         FROM tpm_attestation_challenges ${whereTenant}`,
        params
      ),
      this.pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE tpm_state = 'ATTESTED') AS verified,
                COUNT(*) FILTER (WHERE tpm_state != 'ATTESTED') AS failed
         FROM tpm_attestation_evidence ${whereTenant}`,
        params
      ),
      this.pool.query(
        `SELECT COUNT(*) FILTER (WHERE revoked_at IS NULL) AS enrolled,
                COUNT(*) FILTER (WHERE revoked_at IS NOT NULL) AS revoked
         FROM tpm_identities ${whereTenant}`,
        params
      ),
    ]);

    return {
      totalChallenges: parseInt(challengesRes.rows[0]?.total || '0', 10),
      activeChallenges: parseInt(challengesRes.rows[0]?.active || '0', 10),
      totalSubmissions: parseInt(evidenceRes.rows[0]?.total || '0', 10),
      verifiedCount: parseInt(evidenceRes.rows[0]?.verified || '0', 10),
      failedCount: parseInt(evidenceRes.rows[0]?.failed || '0', 10),
      enrolledDevices: parseInt(identitiesRes.rows[0]?.enrolled || '0', 10),
      revokedDevices: parseInt(identitiesRes.rows[0]?.revoked || '0', 10),
    };
  }

  private mapEvidenceRow(row: any): AttestationEvidenceRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      deviceId: row.device_id,
      challengeId: row.challenge_id,
      quote: row.quote,
      signature: row.signature,
      pcrValues: typeof row.pcr_values === 'string' ? JSON.parse(row.pcr_values) : row.pcr_values,
      pcrSelection: typeof row.pcr_selection === 'string' ? JSON.parse(row.pcr_selection) : row.pcr_selection,
      pcrDigest: row.pcr_digest,
      structureValid: Boolean(row.structure_valid),
      nonceVerified: Boolean(row.nonce_verified),
      signatureVerified: Boolean(row.signature_verified),
      pcrDigestVerified: Boolean(row.pcr_digest_verified),
      akTrusted: Boolean(row.ak_trusted),
      policyMatched: Boolean(row.policy_matched),
      tpmState: row.tpm_state,
      secureBootState: row.secure_boot_state,
      failureReason: row.failure_reason,
      receivedAt: new Date(row.received_at),
      verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
    };
  }
}
