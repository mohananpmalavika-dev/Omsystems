import type { Pool } from "pg";
import type {
  EdgeActivation,
  EdgeAgent,
  EdgeManagedTunnel,
  EdgeCommand,
  EdgeCommandType,
  EdgeUpdateRelease,
} from "../domain/models.js";

export class EdgeOperationsRepository {
  constructor(private readonly pool: Pool) {}

  private async resolveUserUuid(userIdOrUsername?: string): Promise<string | null> {
    if (!userIdOrUsername) return null;
    const cleanId = userIdOrUsername.trim();

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)) {
      const userRes = await this.pool.query(`SELECT id::text FROM users WHERE id = $1 LIMIT 1`, [cleanId]);
      if (userRes.rows[0]?.id) return userRes.rows[0].id;
    }

    const username = cleanId.replace(/^user-/, "");
    const userRes = await this.pool.query(
      `SELECT id::text FROM users WHERE identity_subject = $1 OR lower(username) = lower($2) LIMIT 1`,
      [cleanId, username],
    );
    if (userRes.rows[0]?.id) {
      return userRes.rows[0].id;
    }

    const firstUser = await this.pool.query(`SELECT id::text FROM users ORDER BY created_at ASC LIMIT 1`);
    return firstUser.rows[0]?.id ?? null;
  }

  async ensureEdgeActivationConstraints(): Promise<void> {
    try {
      await this.pool.query(`
        ALTER TABLE edge_activation_tokens DROP CONSTRAINT IF EXISTS edge_activation_tokens_created_by_fkey;
        ALTER TABLE edge_activation_tokens ALTER COLUMN created_by DROP NOT NULL;
        ALTER TABLE edge_activation_tokens ADD CONSTRAINT edge_activation_tokens_created_by_fkey 
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
      `);
    } catch {
      // ignore
    }
  }

  async createActivation(input: {
    branchId: string; agentName: string; createdBy: string; expiresAt: string; tokenHash: string;
  }) {
    await this.ensureEdgeActivationConstraints();
    const resolvedUserId = await this.resolveUserUuid(input.createdBy);

    const result = await this.pool.query(
      `INSERT INTO edge_activation_tokens
         (tenant_id, branch_node_id, token_hash, agent_name, created_by, expires_at)
       SELECT tenant_id, id, decode($2, 'hex'), $3, $4::uuid, $5
       FROM resource_nodes WHERE id = $1 AND node_type = 'branch'
       RETURNING id::text, tenant_id::text, branch_node_id::text, agent_name,
                 expires_at, created_at, created_by::text, used_at, revoked_at`,
      [input.branchId, input.tokenHash, input.agentName, resolvedUserId, input.expiresAt],
    );
    if (!result.rows[0]) throw new Error("invalid_branch");
    return mapActivation(result.rows[0]);
  }

  async activate(input: {
    tokenHash: string; credentialHash: string; deviceUuid: string; version: string; commandPublicKey?: string;
  }): Promise<{ agent: EdgeAgent; tenantId: string }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const activation = await client.query(
        `SELECT id, tenant_id, branch_node_id, agent_name
         FROM edge_activation_tokens
         WHERE token_hash = decode($1, 'hex') AND used_at IS NULL
           AND revoked_at IS NULL AND expires_at > now()
         FOR UPDATE`,
        [input.tokenHash],
      );
      const token = activation.rows[0];
      if (!token) throw new Error("activation_invalid_or_expired");
      const inserted = await client.query(
        `INSERT INTO edge_agents
           (tenant_id, branch_node_id, name, version, status, device_uuid,
            credential_hash, credential_issued_at, command_public_key)
         VALUES ($1, $2, $3, $4, 'pending', $5, decode($6, 'hex'), now(), $7)
         RETURNING id::text, branch_node_id::text, name, version, status,
                   last_seen_at, public_media_url, device_uuid,
                   credential_issued_at, credential_revoked_at`,
        [token.tenant_id, token.branch_node_id, token.agent_name, input.version, input.deviceUuid, input.credentialHash, input.commandPublicKey ?? null],
      );
      await client.query("UPDATE edge_activation_tokens SET used_at = now() WHERE id = $1", [token.id]);
      await client.query("COMMIT");
      return { agent: mapAgent(inserted.rows[0]), tenantId: String(token.tenant_id) };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if ((error as { code?: string }).code === "23505") throw new Error("device_already_enrolled");
      throw error;
    } finally {
      client.release();
    }
  }

  async verifyCredential(id: string, credentialHash: string) {
    const result = await this.pool.query(
      `SELECT 1 FROM edge_agents
       WHERE id = $1 AND credential_hash = decode($2, 'hex')
         AND credential_revoked_at IS NULL`,
      [id, credentialHash],
    );
    return result.rowCount === 1;
  }

  async getCommandPublicKey(id: string) {
    const result = await this.pool.query(
      `SELECT command_public_key FROM edge_agents
       WHERE id = $1 AND credential_revoked_at IS NULL`,
      [id],
    );
    const value = result.rows[0]?.command_public_key;
    return typeof value === "string" && value ? value : undefined;
  }

  async revokeCredential(id: string) {
    const result = await this.pool.query(
      `UPDATE edge_agents SET credential_revoked_at = now(), status = 'offline'
       WHERE id = $1
       RETURNING id::text, branch_node_id::text, name, version, status,
                 last_seen_at, public_media_url, device_uuid,
                 credential_issued_at, credential_revoked_at`,
      [id],
    );
    return result.rows[0] ? mapAgent(result.rows[0]) : undefined;
  }

  async getManagedTunnel(branchId: string) {
    const result = await this.pool.query(
      "SELECT * FROM edge_managed_tunnels WHERE branch_node_id = $1",
      [branchId],
    );
    return result.rows[0] ? mapManagedTunnel(result.rows[0]) : undefined;
  }

  async upsertManagedTunnel(
    input: Omit<EdgeManagedTunnel, "createdAt" | "updatedAt" | "lastCheckedAt" | "revokedAt">,
  ) {
    const result = await this.pool.query(
      `INSERT INTO edge_managed_tunnels
         (tenant_id, branch_node_id, provider, provider_tunnel_id, hostname, status)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (branch_node_id) DO UPDATE SET
         provider = EXCLUDED.provider,
         provider_tunnel_id = EXCLUDED.provider_tunnel_id,
         hostname = EXCLUDED.hostname,
         status = EXCLUDED.status,
         revoked_at = CASE WHEN EXCLUDED.status = 'revoked' THEN now() ELSE NULL END,
         updated_at = now()
       RETURNING *`,
      [input.tenantId, input.branchId, input.provider, input.providerTunnelId, input.hostname, input.status],
    );
    return mapManagedTunnel(result.rows[0]);
  }

  async updateManagedTunnelStatus(branchId: string, status: EdgeManagedTunnel["status"]) {
    const result = await this.pool.query(
      `UPDATE edge_managed_tunnels SET
         status = $2, last_checked_at = now(), updated_at = now(),
         revoked_at = CASE WHEN $2 = 'revoked' THEN now() ELSE revoked_at END
       WHERE branch_node_id = $1
       RETURNING *`,
      [branchId, status],
    );
    return result.rows[0] ? mapManagedTunnel(result.rows[0]) : undefined;
  }

  async createCommand(input: {
    edgeAgentId: string; type: EdgeCommandType; payload: Record<string, unknown>; requestedBy: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO edge_commands
         (tenant_id, branch_node_id, edge_agent_id, command_type, payload, requested_by)
       SELECT tenant_id, branch_node_id, id, $2, $3::jsonb, $4
       FROM edge_agents WHERE id = $1 AND credential_revoked_at IS NULL
       RETURNING *`,
      [input.edgeAgentId, input.type, JSON.stringify(input.payload), input.requestedBy],
    );
    if (!result.rows[0]) throw new Error("edge_agent_not_found_or_revoked");
    return mapCommand(result.rows[0]);
  }

  async listCommands(branchId: string, limit = 100) {
    const result = await this.pool.query(
      `SELECT * FROM edge_commands WHERE branch_node_id = $1
       ORDER BY requested_at DESC LIMIT $2`,
      [branchId, Math.max(1, Math.min(500, limit))],
    );
    return result.rows.map(mapCommand);
  }

  async claimCommand(edgeAgentId: string) {
    const result = await this.pool.query(
      `WITH next_command AS (
         SELECT id FROM edge_commands
       WHERE edge_agent_id = $1
         AND (status = 'queued' OR (status = 'running' AND started_at < now() - interval '15 minutes'))
       ORDER BY requested_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE edge_commands command
       SET status = 'running', started_at = now()
       FROM next_command WHERE command.id = next_command.id
       RETURNING command.*`,
      [edgeAgentId],
    );
    return result.rows[0] ? mapCommand(result.rows[0]) : undefined;
  }

  async completeCommand(
    edgeAgentId: string,
    commandId: string,
    completion: { status: "succeeded" | "failed"; result?: Record<string, unknown>; error?: string },
  ) {
    const result = await this.pool.query(
      `WITH updated AS (
         UPDATE edge_commands SET status = $3, result = $4::jsonb, error = $5, completed_at = now()
         WHERE id = $1 AND edge_agent_id = $2 AND status = 'running'
         RETURNING *
       )
       SELECT * FROM updated
       UNION ALL
       SELECT * FROM edge_commands
       WHERE id = $1 AND edge_agent_id = $2 AND status = $3
         AND NOT EXISTS (SELECT 1 FROM updated)
       LIMIT 1`,
      [commandId, edgeAgentId, completion.status, JSON.stringify(completion.result ?? {}), completion.error ?? null],
    );
    return result.rows[0] ? mapCommand(result.rows[0]) : undefined;
  }

  async createRelease(input: Omit<EdgeUpdateRelease, "id" | "createdAt">) {
    const result = await this.pool.query(
      `INSERT INTO edge_update_releases
         (version, artifact_url, sha256, signature, notes, rollout_percentage, enabled, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [input.version, input.artifactUrl, input.sha256, input.signature, input.notes,
        input.rolloutPercentage, input.enabled, input.createdBy],
    );
    return mapRelease(result.rows[0]);
  }

  async getReleaseForAgent(edgeAgentId: string, currentVersion: string) {
    const result = await this.pool.query(
      `SELECT release.* FROM edge_update_releases release
       JOIN edge_agents agent ON agent.id = $1
       WHERE release.enabled = true AND release.version <> $2
       ORDER BY release.created_at DESC LIMIT 1`,
      [edgeAgentId, currentVersion],
    );
    const release = result.rows[0] ? mapRelease(result.rows[0]) : undefined;
    if (!release) return undefined;
    return rolloutBucket(edgeAgentId, release.version) < release.rolloutPercentage ? release : undefined;
  }
}

function mapActivation(row: any): EdgeActivation {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), branchId: String(row.branch_node_id),
    agentName: row.agent_name, expiresAt: iso(row.expires_at)!, createdAt: iso(row.created_at)!,
    createdBy: String(row.created_by), usedAt: iso(row.used_at), revokedAt: iso(row.revoked_at),
  };
}

function mapAgent(row: any): EdgeAgent {
  return {
    id: String(row.id), branchId: String(row.branch_node_id), name: row.name, version: row.version,
    status: row.status, lastSeenAt: iso(row.last_seen_at),
    ...(row.public_media_url ? { publicMediaUrl: row.public_media_url } : {}),
    ...(row.device_uuid ? { deviceUuid: row.device_uuid } : {}),
    credentialStatus: row.credential_revoked_at ? "revoked" : row.credential_issued_at ? "active" : "not-enrolled",
    ...(row.credential_issued_at ? { credentialIssuedAt: iso(row.credential_issued_at)! } : {}),
    ...(row.credential_revoked_at ? { credentialRevokedAt: iso(row.credential_revoked_at)! } : {}),
  };
}

function mapManagedTunnel(row: any): EdgeManagedTunnel {
  return {
    branchId: String(row.branch_node_id),
    tenantId: String(row.tenant_id),
    provider: "cloudflare",
    providerTunnelId: String(row.provider_tunnel_id),
    hostname: String(row.hostname),
    status: row.status,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    lastCheckedAt: iso(row.last_checked_at),
    revokedAt: iso(row.revoked_at),
  };
}

function mapCommand(row: any): EdgeCommand {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), branchId: String(row.branch_node_id),
    edgeAgentId: String(row.edge_agent_id), type: row.command_type, status: row.status,
    payload: object(row.payload), result: row.result == null ? null : object(row.result), error: row.error,
    requestedBy: String(row.requested_by), requestedAt: iso(row.requested_at)!,
    startedAt: iso(row.started_at), completedAt: iso(row.completed_at),
  };
}

function mapRelease(row: any): EdgeUpdateRelease {
  return {
    id: String(row.id), version: row.version, artifactUrl: row.artifact_url, sha256: row.sha256,
    signature: row.signature, notes: row.notes, rolloutPercentage: row.rollout_percentage,
    enabled: row.enabled, createdBy: String(row.created_by), createdAt: iso(row.created_at)!,
  };
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

function iso(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function rolloutBucket(agentId: string, version: string) {
  let hash = 2166136261;
  for (const char of `${agentId}:${version}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 100;
}
