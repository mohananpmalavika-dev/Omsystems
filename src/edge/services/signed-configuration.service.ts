/**
 * Signed Configuration Engine
 * 
 * Flow:
 * Desired Configuration -> Version -> Approval -> Signature -> Branch Gateway -> Apply -> Verify -> Actual State
 * 
 * Computes authoritative drift status:
 * - If actualVersion < desiredVersion or actualPayloadHash !== desiredPayloadHash -> DRIFTED
 * - All changes versioned, signed, audited, and reversible.
 */

import { createHash, createHmac } from "node:crypto";
import type { Pool } from "pg";

export type ConfigDriftStatus = "IN_SYNC" | "DRIFTED" | "PENDING_APPLY" | "ROLLED_BACK";

export interface SignedConfigRecord {
  edgeId: string;
  branchId?: string;
  version: number;
  payload: Record<string, unknown>;
  payloadHash: string;
  signature: string;
  signerIdentity: string;
  status: "DESIRED" | "APPLIED" | "DRIFTED" | "ROLLED_BACK";
  appliedVersion?: number;
  appliedAt?: Date;
  driftDetails?: Record<string, unknown>;
}

export class SignedConfigurationService {
  private readonly hmacSecret = process.env.EDGE_CONFIG_SIGNING_SECRET || "kryptovision-edge-config-root-secret-2026";

  constructor(private readonly pool?: Pool) {}

  signConfiguration(params: {
    edgeId: string;
    branchId?: string;
    version: number;
    payload: Record<string, unknown>;
    signerIdentity: string;
  }): SignedConfigRecord {
    const payloadStr = JSON.stringify(params.payload);
    const payloadHash = createHash("sha256").update(payloadStr).digest("hex");
    const signature = createHmac("sha256", this.hmacSecret)
      .update(`${params.edgeId}:${params.version}:${payloadHash}:${params.signerIdentity}`)
      .digest("hex");

    return {
      edgeId: params.edgeId,
      branchId: params.branchId,
      version: params.version,
      payload: params.payload,
      payloadHash,
      signature,
      signerIdentity: params.signerIdentity,
      status: "DESIRED",
    };
  }

  verifyConfigurationSignature(config: SignedConfigRecord): boolean {
    const payloadStr = JSON.stringify(config.payload);
    const computedHash = createHash("sha256").update(payloadStr).digest("hex");
    if (computedHash !== config.payloadHash) {
      return false;
    }

    const expectedSignature = createHmac("sha256", this.hmacSecret)
      .update(`${config.edgeId}:${config.version}:${computedHash}:${config.signerIdentity}`)
      .digest("hex");

    return expectedSignature === config.signature;
  }

  detectDrift(desired: SignedConfigRecord, actualState: {
    appliedVersion: number;
    actualPayloadHash?: string;
  }): {
    status: ConfigDriftStatus;
    isDrifted: boolean;
    driftReason?: string;
  } {
    if (actualState.appliedVersion < desired.version) {
      return {
        status: "DRIFTED",
        isDrifted: true,
        driftReason: `Edge gateway is running version v${actualState.appliedVersion}, but target desired configuration is v${desired.version}`,
      };
    }

    if (actualState.actualPayloadHash && actualState.actualPayloadHash !== desired.payloadHash) {
      return {
        status: "DRIFTED",
        isDrifted: true,
        driftReason: "Actual hardware configuration hash differs from signed desired payload hash",
      };
    }

    return {
      status: "IN_SYNC",
      isDrifted: false,
    };
  }

  async saveDesiredConfiguration(config: SignedConfigRecord): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO edge_signed_configurations (
          edge_id, branch_id, version, payload, payload_hash, signature, signer_identity, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (edge_id, version) DO UPDATE 
        SET payload = EXCLUDED.payload, payload_hash = EXCLUDED.payload_hash, signature = EXCLUDED.signature`,
        [
          config.edgeId,
          config.branchId || null,
          config.version,
          JSON.stringify(config.payload),
          config.payloadHash,
          config.signature,
          config.signerIdentity,
          config.status,
        ]
      );
    }
  }
}

export const signedConfigurationService = new SignedConfigurationService();
