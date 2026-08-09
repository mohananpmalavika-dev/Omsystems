/**
 * Alert Command Center Repository
 * Optimized queries with eager loading to eliminate N+1 problems
 */

import { Pool } from 'pg';

export interface AlertCommandCenterItem {
  // Alert fields
  id: string;
  tenantId: string;
  cameraId: string;
  ruleId: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  status: string;
  title: string;
  description: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  snapshotReference: string | null;
  clipReference: string | null;
  detectionCount: number;
  version: number;
  
  // Camera fields (joined)
  cameraName: string;
  cameraStatus: string;
  
  // Branch fields (joined)
  branchId: string;
  branchName: string;
  
  // Rule fields (joined)
  detectionType: string;
  
  // Notification fields (joined, array)
  deliveries: Notification[];
}

export interface Notification {
  id: string;
  channel: string;
  recipient: string;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  error: string | null;
}

export interface AlertCommandCenterFilters {
  tenantId: string;
  severity?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  status?: string;
  branchId?: string;
  limit?: number;
  offset?: number;
}

export class AlertCommandCenterRepository {
  constructor(private db: Pool) {}

  /**
   * Get alerts with ALL related data in a SINGLE optimized query
   * Uses LEFT JOINs and JSON aggregation to eliminate N+1 problem
   */
  async getAlertsWithDetails(filters: AlertCommandCenterFilters): Promise<AlertCommandCenterItem[]> {
    const startTime = Date.now();

    // Build WHERE clause
    const conditions: string[] = ['a.tenant_id = $1'];
    const params: any[] = [filters.tenantId];
    let paramIndex = 2;

    if (filters.severity) {
      conditions.push(`a.severity = $${paramIndex++}`);
      params.push(filters.severity);
    }

    if (filters.status) {
      conditions.push(`a.status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.branchId) {
      conditions.push(`c.branch_id = $${paramIndex++}`);
      params.push(filters.branchId);
    }

    const whereClause = conditions.join(' AND ');
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    /**
     * OPTIMIZED QUERY - Single query with JOINs and JSON aggregation
     * 
     * This replaces:
     * - 1 query for alerts
     * - N queries for cameras
     * - N queries for branches
     * - N queries for rules
     * - N queries for notifications
     * 
     * Total: 1 query instead of 4N + 1
     */
    const query = `
      SELECT
        -- Alert fields
        a.id,
        a.tenant_id AS "tenantId",
        a.camera_id AS "cameraId",
        a.rule_id AS "ruleId",
        a.severity,
        a.status,
        a.title,
        a.description,
        a.first_detected_at AS "firstDetectedAt",
        a.last_detected_at AS "lastDetectedAt",
        a.snapshot_reference AS "snapshotReference",
        a.clip_reference AS "clipReference",
        a.detection_count AS "detectionCount",
        a.version,
        
        -- Camera fields (joined)
        c.name AS "cameraName",
        c.status AS "cameraStatus",
        
        -- Branch fields (joined)
        b.id AS "branchId",
        b.name AS "branchName",
        
        -- Rule fields (joined)
        r.detection_type AS "detectionType",
        
        -- Notifications (aggregated into JSON array)
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', n.id,
              'channel', n.channel,
              'recipient', n.recipient,
              'status', n.status,
              'sentAt', n.sent_at,
              'deliveredAt', n.delivered_at,
              'error', n.error
            )
          ) FILTER (WHERE n.id IS NOT NULL),
          '[]'::json
        ) AS deliveries
        
      FROM analytics_alerts a
      
      -- Join camera (required)
      INNER JOIN cameras c ON c.id = a.camera_id
      
      -- Join branch (required)
      INNER JOIN nodes b ON b.id = c.branch_id
      
      -- Join rule (optional - may not exist for synthetic alerts)
      LEFT JOIN analytics_rules r ON r.id = a.rule_id
      
      -- Join notifications (optional - may not have been sent yet)
      LEFT JOIN alert_notifications n ON n.alert_id = a.id AND n.tenant_id = a.tenant_id
      
      WHERE ${whereClause}
      
      GROUP BY
        a.id, a.tenant_id, a.camera_id, a.rule_id, a.severity, a.status,
        a.title, a.description, a.first_detected_at, a.last_detected_at,
        a.snapshot_reference, a.clip_reference, a.detection_count, a.version,
        c.name, c.status, b.id, b.name, r.detection_type
      
      ORDER BY a.first_detected_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    try {
      const result = await this.db.query(query, params);
      const duration = Date.now() - startTime;

      console.log(`[AlertCommandCenter] Query completed in ${duration}ms, returned ${result.rows.length} alerts`);

      return result.rows.map(row => ({
        ...row,
        deliveries: row.deliveries || [],
      }));
    } catch (error) {
      console.error('[AlertCommandCenter] Query error:', error);
      throw error;
    }
  }

  /**
   * Get single alert with details (same optimization)
   */
  async getAlertWithDetails(alertId: string, tenantId: string): Promise<AlertCommandCenterItem | null> {
    const query = `
      SELECT
        -- Alert fields
        a.id,
        a.tenant_id AS "tenantId",
        a.camera_id AS "cameraId",
        a.rule_id AS "ruleId",
        a.severity,
        a.status,
        a.title,
        a.description,
        a.first_detected_at AS "firstDetectedAt",
        a.last_detected_at AS "lastDetectedAt",
        a.snapshot_reference AS "snapshotReference",
        a.clip_reference AS "clipReference",
        a.detection_count AS "detectionCount",
        a.version,
        
        -- Camera fields
        c.name AS "cameraName",
        c.status AS "cameraStatus",
        
        -- Branch fields
        b.id AS "branchId",
        b.name AS "branchName",
        
        -- Rule fields
        r.detection_type AS "detectionType",
        
        -- Notifications
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', n.id,
              'channel', n.channel,
              'recipient', n.recipient,
              'status', n.status,
              'sentAt', n.sent_at,
              'deliveredAt', n.delivered_at,
              'error', n.error
            )
          ) FILTER (WHERE n.id IS NOT NULL),
          '[]'::json
        ) AS deliveries
        
      FROM analytics_alerts a
      INNER JOIN cameras c ON c.id = a.camera_id
      INNER JOIN nodes b ON b.id = c.branch_id
      LEFT JOIN analytics_rules r ON r.id = a.rule_id
      LEFT JOIN alert_notifications n ON n.alert_id = a.id AND n.tenant_id = a.tenant_id
      
      WHERE a.id = $1 AND a.tenant_id = $2
      
      GROUP BY
        a.id, a.tenant_id, a.camera_id, a.rule_id, a.severity, a.status,
        a.title, a.description, a.first_detected_at, a.last_detected_at,
        a.snapshot_reference, a.clip_reference, a.detection_count, a.version,
        c.name, c.status, b.id, b.name, r.detection_type
    `;

    try {
      const result = await this.db.query(query, [alertId, tenantId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        ...row,
        deliveries: row.deliveries || [],
      };
    } catch (error) {
      console.error('[AlertCommandCenter] Query error:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.db.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Singleton instance
 */
let repositoryInstance: AlertCommandCenterRepository | null = null;

export function initializeAlertCommandCenterRepository(db: Pool): AlertCommandCenterRepository {
  if (!repositoryInstance) {
    repositoryInstance = new AlertCommandCenterRepository(db);
  }
  return repositoryInstance;
}

export function getAlertCommandCenterRepository(): AlertCommandCenterRepository {
  if (!repositoryInstance) {
    throw new Error('AlertCommandCenterRepository not initialized. Call initializeAlertCommandCenterRepository() first.');
  }
  return repositoryInstance;
}
