import type { Pool } from "pg";
import type { OperationalHealthPolicy, OperationalTelemetryEnvelope } from "../operational-health/types.js";

type TelemetryRow = {
  tenant_id: string;
  branch_id: string;
  edge_agent_id: string;
  device_type: OperationalTelemetryEnvelope["deviceType"];
  device_id: string;
  observed_at: Date;
  received_at: Date;
  source: OperationalTelemetryEnvelope["source"];
  quality: OperationalTelemetryEnvelope["quality"];
  idempotency_key: string;
  metrics: OperationalTelemetryEnvelope["metrics"];
  reason_codes: string[];
};

export class OperationalHealthRepository {
  constructor(private readonly pool: Pool) {}

  async ingest(envelope: OperationalTelemetryEnvelope) {
    const result = await this.pool.query(
      `INSERT INTO operational_health_telemetry
        (tenant_id, branch_id, edge_agent_id, device_type, device_id,
         observed_at, received_at, source, quality, idempotency_key, metrics, reason_codes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [envelope.tenantId, envelope.branchId, envelope.edgeAgentId,
       envelope.deviceType, envelope.deviceId, envelope.observedAt,
       envelope.receivedAt, envelope.source, envelope.quality,
       envelope.idempotencyKey, envelope.metrics, envelope.reasonCodes],
    );
    return { accepted: true, duplicate: result.rowCount === 0 };
  }

  async listLatest(tenantId: string, branchIds?: string[]) {
    try {
      const result = await this.pool.query<TelemetryRow>(
        `SELECT tenant_id::text, branch_id::text, edge_agent_id::text, device_type,
                device_id, observed_at, received_at, source, quality, idempotency_key,
                metrics, reason_codes
         FROM operational_health_latest
         WHERE tenant_id = $1
           AND NOT (device_type = 'disk' AND idempotency_key LIKE 'auto-storage:%')
           AND (device_type <> 'disk' OR NOT EXISTS (
             SELECT 1 FROM retired_storage_inventory retired
             WHERE retired.tenant_id = operational_health_latest.tenant_id
               AND retired.branch_id = operational_health_latest.branch_id
               AND retired.device_id = operational_health_latest.device_id
           ))
           AND ($2::uuid[] IS NULL OR branch_id = ANY($2::uuid[]))
         ORDER BY tenant_id, branch_id, device_type, device_id`,
        [tenantId, branchIds?.length ? branchIds : null],
      );
      return result.rows.map(mapTelemetry);
    } catch {
      const result = await this.pool.query<TelemetryRow>(
        `SELECT DISTINCT ON (t.tenant_id, t.branch_id, t.device_type, t.device_id)
           t.tenant_id::text, t.branch_id::text, t.edge_agent_id::text, t.device_type,
           t.device_id, t.observed_at, t.received_at, t.source, t.quality, t.idempotency_key,
           t.metrics, t.reason_codes
         FROM operational_health_telemetry t
         WHERE t.tenant_id = $1
           AND NOT (t.device_type = 'disk' AND t.idempotency_key LIKE 'auto-storage:%')
           AND (t.device_type <> 'disk' OR NOT EXISTS (
             SELECT 1 FROM retired_storage_inventory retired
             WHERE retired.tenant_id = t.tenant_id
               AND retired.branch_id = t.branch_id
               AND retired.device_id = t.device_id
           ))
           AND ($2::uuid[] IS NULL OR t.branch_id = ANY($2::uuid[]))
         ORDER BY t.tenant_id, t.branch_id, t.device_type, t.device_id, t.observed_at DESC, t.received_at DESC`,
        [tenantId, branchIds?.length ? branchIds : null],
      );
      return result.rows.map(mapTelemetry);
    }
  }

  async listRetiredDisks(tenantId: string, branchIds?: string[]) {
    try {
      const result = await this.pool.query<TelemetryRow>(
        `SELECT latest.tenant_id::text, latest.branch_id::text, latest.edge_agent_id::text,
                latest.device_type, latest.device_id, latest.observed_at, latest.received_at,
                latest.source, latest.quality, latest.idempotency_key, latest.metrics, latest.reason_codes
         FROM operational_health_latest latest
         INNER JOIN retired_storage_inventory retired
           ON retired.tenant_id = latest.tenant_id
          AND retired.branch_id = latest.branch_id
          AND retired.device_id = latest.device_id
         WHERE latest.tenant_id = $1
           AND latest.device_type = 'disk'
           AND latest.idempotency_key NOT LIKE 'auto-storage:%'
           AND latest.received_at > retired.retired_at
           AND ($2::uuid[] IS NULL OR latest.branch_id = ANY($2::uuid[]))
         ORDER BY latest.branch_id, latest.device_id`,
        [tenantId, branchIds?.length ? branchIds : null],
      );
      return result.rows.map(mapTelemetry);
    } catch {
      const result = await this.pool.query<TelemetryRow>(
        `SELECT DISTINCT ON (t.tenant_id, t.branch_id, t.device_type, t.device_id)
           t.tenant_id::text, t.branch_id::text, t.edge_agent_id::text, t.device_type,
           t.device_id, t.observed_at, t.received_at, t.source, t.quality, t.idempotency_key,
           t.metrics, t.reason_codes
         FROM operational_health_telemetry t
         INNER JOIN retired_storage_inventory retired
           ON retired.tenant_id = t.tenant_id
          AND retired.branch_id = t.branch_id
          AND retired.device_id = t.device_id
         WHERE t.tenant_id = $1
           AND t.device_type = 'disk'
           AND t.idempotency_key NOT LIKE 'auto-storage:%'
           AND t.received_at > retired.retired_at
           AND ($2::uuid[] IS NULL OR t.branch_id = ANY($2::uuid[]))
         ORDER BY t.tenant_id, t.branch_id, t.device_type, t.device_id, t.observed_at DESC, t.received_at DESC`,
        [tenantId, branchIds?.length ? branchIds : null],
      );
      return result.rows.map(mapTelemetry);
    }
  }

  async retireDisk(tenantId: string, branchId: string, deviceId: string, retiredBy: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const registry = await client.query<{ id: string; lifecycle_state: string }>(
        `SELECT id::text, lifecycle_state FROM device_inventory
         WHERE tenant_id = $1 AND branch = $2 AND device_id = $3
           AND device_type = 'storage-device' AND lifecycle_state <> 'decommissioned'
         FOR UPDATE`,
        [tenantId, branchId, deviceId],
      );
      const registryState = registry.rows[0]?.lifecycle_state ?? null;
      await client.query(
        `INSERT INTO retired_storage_inventory
           (tenant_id, branch_id, device_id, retired_by, retired_at, registry_lifecycle_state)
         VALUES (
           $1, $2, $3, $4,
           GREATEST(
             now(),
             COALESCE((
               SELECT MAX(received_at) FROM operational_health_latest
               WHERE tenant_id = $1 AND branch_id = $2 AND device_type = 'disk' AND device_id = $3
             ), 'epoch'::timestamptz)
           ), $5
         )
         ON CONFLICT (tenant_id, branch_id, device_id)
         DO UPDATE SET retired_by = EXCLUDED.retired_by,
                       retired_at = EXCLUDED.retired_at,
                       registry_lifecycle_state = EXCLUDED.registry_lifecycle_state`,
        [tenantId, branchId, deviceId, retiredBy, registryState],
      );
      if (registry.rows.length) {
        await client.query(
          `UPDATE device_inventory SET lifecycle_state = 'decommissioned', updated_at = now()
           WHERE id = ANY($1::uuid[])`,
          [registry.rows.map((row) => row.id)],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async restoreDisk(tenantId: string, branchId: string, deviceId: string, _restoredBy: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const retired = await client.query<{ registry_lifecycle_state: string | null }>(
        `DELETE FROM retired_storage_inventory
         WHERE tenant_id = $1 AND branch_id = $2 AND device_id = $3
         RETURNING registry_lifecycle_state`,
        [tenantId, branchId, deviceId],
      );
      const registryState = retired.rows[0]?.registry_lifecycle_state;
      if (registryState) {
        await client.query(
          `UPDATE device_inventory SET lifecycle_state = $4, updated_at = now()
           WHERE tenant_id = $1 AND branch = $2 AND device_id = $3
             AND device_type = 'storage-device' AND lifecycle_state = 'decommissioned'`,
          [tenantId, branchId, deviceId, registryState],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listHistory(tenantId: string, branchId: string, from: string, to: string, limit = 1000) {
    const result = await this.pool.query<TelemetryRow>(
      `SELECT tenant_id::text,branch_id::text,edge_agent_id::text,device_type,
              device_id,observed_at,received_at,source,quality,idempotency_key,
              metrics,reason_codes
       FROM operational_health_telemetry
       WHERE tenant_id=$1 AND branch_id=$2
         AND NOT (device_type = 'disk' AND idempotency_key LIKE 'auto-storage:%')
         AND observed_at >= $3::timestamptz AND observed_at <= $4::timestamptz
       ORDER BY observed_at DESC,received_at DESC
       LIMIT $5`,
      [tenantId, branchId, from, to, limit],
    );
    return result.rows.map(mapTelemetry).reverse();
  }

  async getPolicy(tenantId: string, branchId?: string) {
    const result = await this.pool.query<{ policy: OperationalHealthPolicy }>(
      `SELECT policy FROM operational_health_policies
       WHERE tenant_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
       ORDER BY branch_id NULLS LAST LIMIT 1`,
      [tenantId, branchId ?? null],
    );
    return result.rows[0]?.policy;
  }

  async upsertPolicy(tenantId: string, branchId: string | undefined, policy: OperationalHealthPolicy) {
    await this.pool.query(
      `INSERT INTO operational_health_policies (tenant_id, branch_id, policy, updated_at)
       VALUES ($1,$2,$3,now())
       ON CONFLICT (tenant_id, branch_id) DO UPDATE SET policy=EXCLUDED.policy, updated_at=now()`,
      [tenantId, branchId ?? null, policy],
    );
    return policy;
  }
}

function mapTelemetry(row: TelemetryRow): OperationalTelemetryEnvelope {
  return {
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    edgeAgentId: row.edge_agent_id,
    deviceType: row.device_type,
    deviceId: row.device_id,
    observedAt: row.observed_at.toISOString(),
    receivedAt: row.received_at.toISOString(),
    source: row.source,
    quality: row.quality,
    idempotencyKey: row.idempotency_key,
    metrics: row.metrics,
    reasonCodes: row.reason_codes ?? [],
  };
}
