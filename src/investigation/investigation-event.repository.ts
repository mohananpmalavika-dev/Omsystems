import type { Pool } from "pg";
import type { DbInvestigationEvent } from "../domain/models.js";
import type {
  CreateInvestigationEventInput,
  InvestigationSearchRequest,
} from "./investigation.types.js";

export class InvestigationEventRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Resolves related devices and cameras within the same physical zones or branch.
   */
  async resolveRelatedAssetIds(
    tenantId: string,
    cameraIds: string[] = [],
    zones: string[] = [],
  ): Promise<{ cameraIds: string[]; deviceIds: string[]; zoneIds: string[] }> {
    const targetCamIds = new Set<string>(cameraIds);
    const targetDeviceIds = new Set<string>();
    const targetZoneIds = new Set<string>(zones);

    if (cameraIds.length > 0) {
      // Find zones and devices associated with these cameras
      const camQuery = `
        SELECT c.id as camera_id, c.branch_id, c.device_inventory_id, c.zone_name
        FROM cameras c
        WHERE c.id = ANY($1)
      `;
      const camRes = await this.pool.query(camQuery, [cameraIds]);
      for (const row of camRes.rows) {
        if (row.zone_name) targetZoneIds.add(row.zone_name);
        if (row.device_inventory_id) targetDeviceIds.add(row.device_inventory_id);
      }
    }

    if (targetZoneIds.size > 0) {
      const zoneArray = Array.from(targetZoneIds);
      // Find other cameras in same zones
      const zoneCamQuery = `
        SELECT id FROM cameras WHERE zone_name = ANY($1) AND tenant_id = $2
      `;
      const zoneCamRes = await this.pool.query(zoneCamQuery, [zoneArray, tenantId]);
      for (const row of zoneCamRes.rows) {
        targetCamIds.add(row.id);
      }
    }

    return {
      cameraIds: Array.from(targetCamIds),
      deviceIds: Array.from(targetDeviceIds),
      zoneIds: Array.from(targetZoneIds),
    };
  }

  /**
   * Queries investigation events across time, types, objects, and spatial zones.
   */
  async queryEvents(request: InvestigationSearchRequest): Promise<DbInvestigationEvent[]> {
    let effectiveCameraIds = request.cameraIds || [];
    let effectiveDeviceIds: string[] = [];
    let effectiveZoneIds = request.zones || [];

    if (request.includeRelatedAssets && (effectiveCameraIds.length > 0 || effectiveZoneIds.length > 0)) {
      const expanded = await this.resolveRelatedAssetIds(
        request.tenantId,
        request.cameraIds,
        request.zones,
      );
      effectiveCameraIds = expanded.cameraIds;
      effectiveDeviceIds = expanded.deviceIds;
      effectiveZoneIds = expanded.zoneIds;
    }

    let query = `
      SELECT 
        id,
        tenant_id,
        branch_id,
        camera_id,
        device_id,
        zone_id,
        event_type,
        event_subtype,
        severity,
        start_time,
        end_time,
        source,
        object_type,
        object_id,
        confidence,
        metadata,
        incident_id,
        alert_id,
        created_at
      FROM investigation_events
      WHERE tenant_id = $1
        AND start_time <= $3::timestamptz
        AND (end_time IS NULL OR end_time >= $2::timestamptz)
    `;

    const params: any[] = [
      request.tenantId,
      request.from.toISOString(),
      request.to.toISOString(),
    ];

    if (request.branchIds && request.branchIds.length > 0) {
      query += ` AND branch_id = ANY($${params.length + 1})`;
      params.push(request.branchIds);
    }

    // Spatial filter: (camera_id OR device_id OR zone_id)
    const spatialClauses: string[] = [];
    if (effectiveCameraIds.length > 0) {
      spatialClauses.push(`camera_id = ANY($${params.length + 1})`);
      params.push(effectiveCameraIds);
    }
    if (effectiveDeviceIds.length > 0) {
      spatialClauses.push(`device_id = ANY($${params.length + 1})`);
      params.push(effectiveDeviceIds);
    }
    if (effectiveZoneIds.length > 0) {
      spatialClauses.push(`zone_id = ANY($${params.length + 1})`);
      params.push(effectiveZoneIds);
    }

    if (spatialClauses.length > 0) {
      query += ` AND (${spatialClauses.join(" OR ")})`;
    }

    if (request.eventTypes && request.eventTypes.length > 0) {
      query += ` AND event_type = ANY($${params.length + 1})`;
      params.push(request.eventTypes);
    }

    if (request.objectTypes && request.objectTypes.length > 0) {
      query += ` AND object_type = ANY($${params.length + 1})`;
      params.push(request.objectTypes);
    }

    if (request.minConfidence !== undefined) {
      query += ` AND (confidence IS NULL OR confidence >= $${params.length + 1})`;
      params.push(request.minConfidence);
    }

    if (request.alertSeverity && request.alertSeverity.length > 0) {
      query += ` AND severity = ANY($${params.length + 1})`;
      params.push(request.alertSeverity);
    }

    if (request.incidentIds && request.incidentIds.length > 0) {
      query += ` AND incident_id = ANY($${params.length + 1})`;
      params.push(request.incidentIds);
    }

    query += ` ORDER BY start_time ASC`;

    const result = await this.pool.query(query, params);
    return result.rows.map((r) => this.mapEvent(r));
  }

  /**
   * Inserts an event into investigation_events.
   */
  async insertEvent(input: CreateInvestigationEventInput): Promise<DbInvestigationEvent> {
    const id = input.id || undefined;
    const query = `
      INSERT INTO investigation_events (
        ${id ? "id," : ""}
        tenant_id,
        branch_id,
        camera_id,
        device_id,
        zone_id,
        event_type,
        event_subtype,
        severity,
        start_time,
        end_time,
        source,
        object_type,
        object_id,
        confidence,
        metadata,
        incident_id,
        alert_id,
        created_at
      ) VALUES (
        ${id ? "$1," : ""}
        $${id ? "2" : "1"},
        $${id ? "3" : "2"},
        $${id ? "4" : "3"},
        $${id ? "5" : "4"},
        $${id ? "6" : "5"},
        $${id ? "7" : "6"},
        $${id ? "8" : "7"},
        $${id ? "9" : "8"},
        $${id ? "10" : "9"}::timestamptz,
        $${id ? "11" : "10"}::timestamptz,
        $${id ? "12" : "11"},
        $${id ? "13" : "12"},
        $${id ? "14" : "13"},
        $${id ? "15" : "14"},
        $${id ? "16" : "15"}::jsonb,
        $${id ? "17" : "16"},
        $${id ? "18" : "17"},
        now()
      )
      RETURNING *
    `;

    const values: any[] = [];
    if (id) values.push(id);
    values.push(
      input.tenantId,
      input.branchId ?? null,
      input.cameraId ?? null,
      input.deviceId ?? null,
      input.zoneId ?? null,
      input.eventType,
      input.eventSubtype ?? null,
      input.severity ?? "INFO",
      input.startTime.toISOString(),
      input.endTime ? input.endTime.toISOString() : null,
      input.source ?? "sentinel-analytics",
      input.objectType ?? null,
      input.objectId ?? null,
      input.confidence ?? null,
      JSON.stringify(input.metadata || {}),
      input.incidentId ?? null,
      input.alertId ?? null,
    );

    const result = await this.pool.query(query, values);
    return this.mapEvent(result.rows[0]);
  }

  private mapEvent(row: any): DbInvestigationEvent {
    const startTimeRaw = row.start_time || row.startTime;
    const endTimeRaw = row.end_time || row.endTime;
    const createdAtRaw = row.created_at || row.createdAt || new Date().toISOString();

    return {
      id: row.id,
      tenantId: row.tenant_id || row.tenantId,
      branchId: row.branch_id || row.branchId || undefined,
      cameraId: row.camera_id || row.cameraId || undefined,
      deviceId: row.device_id || row.deviceId || undefined,
      zoneId: row.zone_id || row.zoneId || undefined,
      eventType: row.event_type || row.eventType,
      eventSubtype: row.event_subtype || row.eventSubtype || undefined,
      severity: row.severity || "INFO",
      startTime: new Date(startTimeRaw).toISOString(),
      endTime: endTimeRaw ? new Date(endTimeRaw).toISOString() : undefined,
      source: row.source ?? undefined,
      objectType: row.object_type || row.objectType || undefined,
      objectId: row.object_id || row.objectId || undefined,
      confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : undefined,
      metadata: typeof row.metadata === "object" && row.metadata !== null ? row.metadata : {},
      incidentId: row.incident_id || row.incidentId || undefined,
      alertId: row.alert_id || row.alertId || undefined,
      createdAt: new Date(createdAtRaw).toISOString(),
    };
  }
}
