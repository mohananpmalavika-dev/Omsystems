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
    const result = await this.pool.query<TelemetryRow>(
      `SELECT DISTINCT ON (device_type, device_id)
         tenant_id::text, branch_id::text, edge_agent_id::text, device_type,
         device_id, observed_at, received_at, source, quality, idempotency_key,
         metrics, reason_codes
       FROM operational_health_telemetry
       WHERE tenant_id = $1
         AND ($2::uuid[] IS NULL OR branch_id = ANY($2::uuid[]))
       ORDER BY device_type, device_id, observed_at DESC, received_at DESC`,
      [tenantId, branchIds?.length ? branchIds : null],
    );
    return result.rows.map(mapTelemetry);
  }

  async listHistory(tenantId: string, branchId: string, from: string, to: string, limit = 1000) {
    const result = await this.pool.query<TelemetryRow>(
      `SELECT tenant_id::text,branch_id::text,edge_agent_id::text,device_type,
              device_id,observed_at,received_at,source,quality,idempotency_key,
              metrics,reason_codes
       FROM operational_health_telemetry
       WHERE tenant_id=$1 AND branch_id=$2
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
