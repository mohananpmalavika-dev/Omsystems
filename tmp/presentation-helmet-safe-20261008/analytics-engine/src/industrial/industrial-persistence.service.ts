/**
 * Industrial Analytics Persistence Service
 * Handles database storage for industrial zones, configuration, and violation events
 */

import type { Pool } from "pg";
import type { Zone } from "../tracking/scene-state.js";
import type { IndustrialConfig } from "./rules/types.js";

export interface IndustrialZone extends Zone {
  tenantId: string;
  cameraId: string;
  zoneType: "restricted" | "equipment-only" | "pedestrian-only" | "hazard" | "monitoring";
  enabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export interface IndustrialViolation {
  id?: string;
  tenantId: string;
  cameraId: string;
  violationType: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  equipmentType?: string;
  zoneId?: string;
  personTrackId?: string;
  equipmentTrackId?: string;
  snapshot?: string;
  metadata?: Record<string, unknown>;
  occurredAt: Date;
  resolvedAt?: Date;
  reviewStatus?: "unreviewed" | "confirmed" | "rejected";
  reviewedBy?: string;
  reviewNotes?: string;
}

export interface CameraIndustrialConfig extends IndustrialConfig {
  tenantId: string;
  cameraId: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
  updatedAt?: Date;
  updatedBy?: string;
}

export class IndustrialPersistenceService {
  constructor(private db: Pool) {}

  /**
   * Initialize database tables (call once on service startup)
   */
  async initializeTables(): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");

      // Industrial zones table
      await client.query(`
        CREATE TABLE IF NOT EXISTS industrial_zones (
          id TEXT PRIMARY KEY,
          tenant_id UUID NOT NULL,
          camera_id UUID NOT NULL,
          name TEXT NOT NULL,
          zone_type TEXT NOT NULL DEFAULT 'monitoring'
            CHECK (zone_type IN ('restricted', 'equipment-only', 'pedestrian-only', 'hazard', 'monitoring')),
          polygon JSONB NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT true,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_by TEXT,
          
          CONSTRAINT industrial_zones_camera_fkey 
            FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
        );
        
        CREATE INDEX IF NOT EXISTS industrial_zones_tenant_camera_idx 
          ON industrial_zones(tenant_id, camera_id) WHERE enabled = true;
        
        CREATE INDEX IF NOT EXISTS industrial_zones_type_idx 
          ON industrial_zones(zone_type) WHERE enabled = true;
      `);

      // Industrial configuration table
      await client.query(`
        CREATE TABLE IF NOT EXISTS industrial_camera_config (
          camera_id UUID PRIMARY KEY,
          tenant_id UUID NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT true,
          min_person_equipment_distance INTEGER NOT NULL DEFAULT 150,
          enforce_zone_restrictions BOOLEAN NOT NULL DEFAULT true,
          idle_time_threshold INTEGER NOT NULL DEFAULT 300,
          stationary_time_threshold INTEGER NOT NULL DEFAULT 60,
          metadata JSONB DEFAULT '{}',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_by TEXT,
          
          CONSTRAINT industrial_config_camera_fkey 
            FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
        );
        
        CREATE INDEX IF NOT EXISTS industrial_config_tenant_idx 
          ON industrial_camera_config(tenant_id) WHERE enabled = true;
      `);

      // Industrial violations table
      await client.query(`
        CREATE TABLE IF NOT EXISTS industrial_violations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          camera_id UUID NOT NULL,
          violation_type TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'medium'
            CHECK (severity IN ('low', 'medium', 'high', 'critical')),
          description TEXT NOT NULL,
          equipment_type TEXT,
          zone_id TEXT,
          person_track_id TEXT,
          equipment_track_id TEXT,
          snapshot_reference TEXT,
          metadata JSONB DEFAULT '{}',
          occurred_at TIMESTAMPTZ NOT NULL,
          resolved_at TIMESTAMPTZ,
          review_status TEXT NOT NULL DEFAULT 'unreviewed'
            CHECK (review_status IN ('unreviewed', 'confirmed', 'rejected')),
          reviewed_by TEXT,
          review_notes TEXT,
          reviewed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          
          CONSTRAINT industrial_violations_camera_fkey 
            FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE,
          CONSTRAINT industrial_violations_zone_fkey 
            FOREIGN KEY (zone_id) REFERENCES industrial_zones(id) ON DELETE SET NULL
        );
        
        CREATE INDEX IF NOT EXISTS industrial_violations_camera_time_idx 
          ON industrial_violations(camera_id, occurred_at DESC);
        
        CREATE INDEX IF NOT EXISTS industrial_violations_tenant_time_idx 
          ON industrial_violations(tenant_id, occurred_at DESC);
        
        CREATE INDEX IF NOT EXISTS industrial_violations_severity_idx 
          ON industrial_violations(severity, occurred_at DESC) 
          WHERE review_status = 'unreviewed';
        
        CREATE INDEX IF NOT EXISTS industrial_violations_type_idx 
          ON industrial_violations(violation_type, occurred_at DESC);
      `);

      await client.query("COMMIT");
      console.log("✅ Industrial analytics persistence tables initialized");
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("❌ Failed to initialize industrial analytics tables:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Zone Management
  // ============================================================================

  async saveZone(zone: IndustrialZone): Promise<IndustrialZone> {
    const result = await this.db.query(
      `
      INSERT INTO industrial_zones (
        id, tenant_id, camera_id, name, zone_type, polygon, 
        enabled, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        zone_type = EXCLUDED.zone_type,
        polygon = EXCLUDED.polygon,
        enabled = EXCLUDED.enabled,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *
      `,
      [
        zone.id,
        zone.tenantId,
        zone.cameraId,
        zone.name,
        zone.zoneType,
        JSON.stringify(zone.polygon),
        zone.enabled,
        JSON.stringify(zone.metadata || {}),
        zone.createdBy || null,
      ],
    );

    return this.mapZoneFromDb(result.rows[0]);
  }

  async getZonesByCamera(
    tenantId: string,
    cameraId: string,
  ): Promise<IndustrialZone[]> {
    const result = await this.db.query(
      `
      SELECT * FROM industrial_zones 
      WHERE tenant_id = $1 AND camera_id = $2 AND enabled = true
      ORDER BY created_at DESC
      `,
      [tenantId, cameraId],
    );

    return result.rows.map((row) => this.mapZoneFromDb(row));
  }

  async getZoneById(
    tenantId: string,
    zoneId: string,
  ): Promise<IndustrialZone | null> {
    const result = await this.db.query(
      `
      SELECT * FROM industrial_zones 
      WHERE id = $1 AND tenant_id = $2
      `,
      [zoneId, tenantId],
    );

    return result.rows.length > 0 ? this.mapZoneFromDb(result.rows[0]) : null;
  }

  async deleteZone(tenantId: string, zoneId: string): Promise<boolean> {
    const result = await this.db.query(
      `
      UPDATE industrial_zones 
      SET enabled = false, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
      RETURNING id
      `,
      [zoneId, tenantId],
    );

    return result.rowCount > 0;
  }

  async hardDeleteZone(tenantId: string, zoneId: string): Promise<boolean> {
    const result = await this.db.query(
      `
      DELETE FROM industrial_zones 
      WHERE id = $1 AND tenant_id = $2
      RETURNING id
      `,
      [zoneId, tenantId],
    );

    return result.rowCount > 0;
  }

  private mapZoneFromDb(row: any): IndustrialZone {
    const zoneTypes: Record<IndustrialZone["zoneType"], Zone["type"]> = {
      restricted: "restricted_zone",
      "equipment-only": "equipment_only",
      "pedestrian-only": "pedestrian_only",
      hazard: "hazard_zone",
      monitoring: "safe_zone",
    };
    return {
      id: row.id,
      tenantId: row.tenant_id,
      cameraId: row.camera_id,
      name: row.name,
      zoneType: row.zone_type,
      type: zoneTypes[row.zone_type as IndustrialZone["zoneType"]] ?? "safe_zone",
      polygon: row.polygon,
      enabled: row.enabled,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
    };
  }

  // ============================================================================
  // Configuration Management
  // ============================================================================

  async saveConfig(config: CameraIndustrialConfig): Promise<CameraIndustrialConfig> {
    const result = await this.db.query(
      `
      INSERT INTO industrial_camera_config (
        camera_id, tenant_id, enabled,
        min_person_equipment_distance, enforce_zone_restrictions,
        idle_time_threshold, stationary_time_threshold,
        metadata, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (camera_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        min_person_equipment_distance = EXCLUDED.min_person_equipment_distance,
        enforce_zone_restrictions = EXCLUDED.enforce_zone_restrictions,
        idle_time_threshold = EXCLUDED.idle_time_threshold,
        stationary_time_threshold = EXCLUDED.stationary_time_threshold,
        metadata = EXCLUDED.metadata,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
      RETURNING *
      `,
      [
        config.cameraId,
        config.tenantId,
        config.enabled,
        config.minPersonEquipmentDistance,
        config.enforceZoneRestrictions,
        config.idleTimeThreshold,
        config.stationaryTimeThreshold,
        JSON.stringify(config.metadata || {}),
        config.updatedBy || null,
      ],
    );

    return this.mapConfigFromDb(result.rows[0]);
  }

  async getConfig(
    tenantId: string,
    cameraId: string,
  ): Promise<CameraIndustrialConfig | null> {
    const result = await this.db.query(
      `
      SELECT * FROM industrial_camera_config 
      WHERE camera_id = $1 AND tenant_id = $2
      `,
      [cameraId, tenantId],
    );

    return result.rows.length > 0 ? this.mapConfigFromDb(result.rows[0]) : null;
  }

  async getDefaultConfig(): Promise<CameraIndustrialConfig> {
    return {
      tenantId: "",
      cameraId: "",
      enabled: true,
      minPersonEquipmentDistance: 150,
      enforceZoneRestrictions: true,
      idleTimeThreshold: 300,
      stationaryTimeThreshold: 60,
    };
  }

  private mapConfigFromDb(row: any): CameraIndustrialConfig {
    return {
      tenantId: row.tenant_id,
      cameraId: row.camera_id,
      enabled: row.enabled,
      minPersonEquipmentDistance: row.min_person_equipment_distance,
      enforceZoneRestrictions: row.enforce_zone_restrictions,
      idleTimeThreshold: row.idle_time_threshold,
      stationaryTimeThreshold: row.stationary_time_threshold,
      metadata: row.metadata,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  // ============================================================================
  // Violation Management
  // ============================================================================

  async saveViolation(violation: IndustrialViolation): Promise<IndustrialViolation> {
    const result = await this.db.query(
      `
      INSERT INTO industrial_violations (
        tenant_id, camera_id, violation_type, severity, description,
        equipment_type, zone_id, person_track_id, equipment_track_id,
        snapshot_reference, metadata, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
      `,
      [
        violation.tenantId,
        violation.cameraId,
        violation.violationType,
        violation.severity,
        violation.description,
        violation.equipmentType || null,
        violation.zoneId || null,
        violation.personTrackId || null,
        violation.equipmentTrackId || null,
        violation.snapshot || null,
        JSON.stringify(violation.metadata || {}),
        violation.occurredAt,
      ],
    );

    return this.mapViolationFromDb(result.rows[0]);
  }

  async getViolations(
    tenantId: string,
    filters: {
      cameraId?: string;
      severity?: string;
      violationType?: string;
      reviewStatus?: string;
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ violations: IndustrialViolation[]; total: number }> {
    const conditions: string[] = ["tenant_id = $1"];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters.cameraId) {
      conditions.push(`camera_id = $${paramIndex++}`);
      params.push(filters.cameraId);
    }

    if (filters.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      params.push(filters.severity);
    }

    if (filters.violationType) {
      conditions.push(`violation_type = $${paramIndex++}`);
      params.push(filters.violationType);
    }

    if (filters.reviewStatus) {
      conditions.push(`review_status = $${paramIndex++}`);
      params.push(filters.reviewStatus);
    }

    if (filters.fromDate) {
      conditions.push(`occurred_at >= $${paramIndex++}`);
      params.push(filters.fromDate);
    }

    if (filters.toDate) {
      conditions.push(`occurred_at <= $${paramIndex++}`);
      params.push(filters.toDate);
    }

    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM industrial_violations WHERE ${conditions.join(" AND ")}`,
      params,
    );

    const result = await this.db.query(
      `
      SELECT * FROM industrial_violations 
      WHERE ${conditions.join(" AND ")}
      ORDER BY occurred_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `,
      [...params, limit, offset],
    );

    return {
      violations: result.rows.map((row) => this.mapViolationFromDb(row)),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  async reviewViolation(
    tenantId: string,
    violationId: string,
    reviewStatus: "confirmed" | "rejected",
    reviewedBy: string,
    reviewNotes?: string,
  ): Promise<IndustrialViolation | null> {
    const result = await this.db.query(
      `
      UPDATE industrial_violations 
      SET 
        review_status = $1,
        reviewed_by = $2,
        review_notes = $3,
        reviewed_at = NOW()
      WHERE id = $4 AND tenant_id = $5
      RETURNING *
      `,
      [reviewStatus, reviewedBy, reviewNotes || null, violationId, tenantId],
    );

    return result.rows.length > 0 ? this.mapViolationFromDb(result.rows[0]) : null;
  }

  async resolveViolation(
    tenantId: string,
    violationId: string,
  ): Promise<IndustrialViolation | null> {
    const result = await this.db.query(
      `
      UPDATE industrial_violations 
      SET resolved_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND resolved_at IS NULL
      RETURNING *
      `,
      [violationId, tenantId],
    );

    return result.rows.length > 0 ? this.mapViolationFromDb(result.rows[0]) : null;
  }

  private mapViolationFromDb(row: any): IndustrialViolation {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      cameraId: row.camera_id,
      violationType: row.violation_type,
      severity: row.severity,
      description: row.description,
      equipmentType: row.equipment_type,
      zoneId: row.zone_id,
      personTrackId: row.person_track_id,
      equipmentTrackId: row.equipment_track_id,
      snapshot: row.snapshot_reference,
      metadata: row.metadata,
      occurredAt: row.occurred_at,
      resolvedAt: row.resolved_at,
      reviewStatus: row.review_status,
      reviewedBy: row.reviewed_by,
      reviewNotes: row.review_notes,
    };
  }
}
