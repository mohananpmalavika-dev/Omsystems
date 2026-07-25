/**
 * Geospatial Map Service
 * Location-based visualization and analytics for multi-branch operations
 */

import { Pool } from 'pg';

export interface BranchMapMarker {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  state: string;
  region: string;
  healthStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
  healthScore: number;
  cameras: {
    total: number;
    online: number;
    offline: number;
  };
  alerts: {
    critical: number;
    warning: number;
  };
  lastUpdated: Date;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface ClusterInfo {
  id: string;
  latitude: number;
  longitude: number;
  branchCount: number;
  branches: string[];
  avgHealthScore: number;
  criticalCount: number;
  warningCount: number;
  healthyCount: number;
}

export interface HeatmapPoint {
  latitude: number;
  longitude: number;
  intensity: number; // 0-1
  metric: string;
}

export class GeospatialMapService {
  constructor(private pool: Pool) {}

  /**
   * Get all branch markers for map display
   */
  async getBranchMarkers(
    tenantId: string,
    filters?: {
      bounds?: MapBounds;
      healthStatus?: string[];
      region?: string;
      minHealthScore?: number;
      hasAlerts?: boolean;
    }
  ): Promise<BranchMapMarker[]> {
    const conditions: string[] = ['b.tenant_id = $1'];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    // Add geolocation filter
    conditions.push('b.latitude IS NOT NULL AND b.longitude IS NOT NULL');

    // Filter by map bounds
    if (filters?.bounds) {
      conditions.push(`b.latitude BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
      conditions.push(`b.longitude BETWEEN $${paramIndex + 2} AND $${paramIndex + 3}`);
      params.push(filters.bounds.south, filters.bounds.north, filters.bounds.west, filters.bounds.east);
      paramIndex += 4;
    }

    // Filter by health status
    if (filters?.healthStatus && filters.healthStatus.length > 0) {
      conditions.push(`b.health_status = ANY($${paramIndex})`);
      params.push(filters.healthStatus);
      paramIndex++;
    }

    // Filter by region
    if (filters?.region) {
      conditions.push(`b.region = $${paramIndex}`);
      params.push(filters.region);
      paramIndex++;
    }

    // Filter by minimum health score
    if (filters?.minHealthScore !== undefined) {
      conditions.push(`b.health_score >= $${paramIndex}`);
      params.push(filters.minHealthScore);
      paramIndex++;
    }

    const query = `
      SELECT 
        b.id,
        b.name,
        b.code,
        b.latitude,
        b.longitude,
        b.address_line1,
        b.address_line2,
        b.city,
        b.state,
        b.region,
        b.health_status,
        b.health_score,
        b.last_health_check,
        COUNT(DISTINCT c.id) as total_cameras,
        COUNT(DISTINCT c.id) FILTER (WHERE c.online_status = 'online') as online_cameras,
        COUNT(DISTINCT c.id) FILTER (WHERE c.online_status = 'offline') as offline_cameras,
        COUNT(DISTINCT oa.id) FILTER (WHERE oa.severity = 'critical' AND oa.status = 'active') as critical_alerts,
        COUNT(DISTINCT oa.id) FILTER (WHERE oa.severity = 'warning' AND oa.status = 'active') as warning_alerts
      FROM branches b
      LEFT JOIN cameras c ON c.branch_id = b.id AND c.status = 'active'
      LEFT JOIN operational_alerts oa ON oa.branch_id = b.id
      WHERE ${conditions.join(' AND ')}
        AND b.status = 'active'
      GROUP BY b.id, b.name, b.code, b.latitude, b.longitude, 
               b.address_line1, b.address_line2, b.city, b.state, b.region,
               b.health_status, b.health_score, b.last_health_check
    `;

    let finalQuery = query;
    if (filters?.hasAlerts) {
      finalQuery = `
        WITH branch_data AS (${query})
        SELECT * FROM branch_data
        WHERE critical_alerts > 0 OR warning_alerts > 0
      `;
    }

    const result = await this.pool.query(finalQuery, params);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      code: row.code,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      address: [row.address_line1, row.address_line2].filter(Boolean).join(', '),
      city: row.city || '',
      state: row.state || '',
      region: row.region || '',
      healthStatus: row.health_status || 'unknown',
      healthScore: parseFloat(row.health_score) || 0,
      cameras: {
        total: parseInt(row.total_cameras) || 0,
        online: parseInt(row.online_cameras) || 0,
        offline: parseInt(row.offline_cameras) || 0
      },
      alerts: {
        critical: parseInt(row.critical_alerts) || 0,
        warning: parseInt(row.warning_alerts) || 0
      },
      lastUpdated: row.last_health_check || new Date()
    }));
  }

  /**
   * Get clustered branch locations for high zoom levels
   */
  async getClusteredBranches(
    tenantId: string,
    bounds: MapBounds,
    clusterRadius: number = 0.5 // degrees
  ): Promise<ClusterInfo[]> {
    const query = `
      WITH branch_locations AS (
        SELECT 
          b.id,
          b.name,
          b.latitude,
          b.longitude,
          b.health_status,
          b.health_score
        FROM branches b
        WHERE b.tenant_id = $1
          AND b.latitude IS NOT NULL 
          AND b.longitude IS NOT NULL
          AND b.latitude BETWEEN $2 AND $3
          AND b.longitude BETWEEN $4 AND $5
          AND b.status = 'active'
      ),
      clusters AS (
        SELECT 
          -- Create cluster ID based on rounded coordinates
          CONCAT(
            FLOOR(latitude / $6)::TEXT, '_',
            FLOOR(longitude / $6)::TEXT
          ) as cluster_id,
          AVG(latitude) as cluster_lat,
          AVG(longitude) as cluster_lng,
          COUNT(*) as branch_count,
          ARRAY_AGG(id) as branch_ids,
          AVG(health_score) as avg_health_score,
          COUNT(*) FILTER (WHERE health_status = 'critical') as critical_count,
          COUNT(*) FILTER (WHERE health_status = 'warning') as warning_count,
          COUNT(*) FILTER (WHERE health_status = 'healthy') as healthy_count
        FROM branch_locations
        GROUP BY cluster_id
      )
      SELECT * FROM clusters
      WHERE branch_count >= 2
      ORDER BY branch_count DESC
    `;

    const result = await this.pool.query(query, [
      tenantId,
      bounds.south,
      bounds.north,
      bounds.west,
      bounds.east,
      clusterRadius
    ]);

    return result.rows.map(row => ({
      id: row.cluster_id,
      latitude: parseFloat(row.cluster_lat),
      longitude: parseFloat(row.cluster_lng),
      branchCount: parseInt(row.branch_count),
      branches: row.branch_ids,
      avgHealthScore: Math.round(parseFloat(row.avg_health_score) || 0),
      criticalCount: parseInt(row.critical_count) || 0,
      warningCount: parseInt(row.warning_count) || 0,
      healthyCount: parseInt(row.healthy_count) || 0
    }));
  }

  /**
   * Generate heatmap data based on metric
   */
  async getHeatmapData(
    tenantId: string,
    metric: 'incidents' | 'alerts' | 'cameras_offline' | 'health_score',
    bounds?: MapBounds,
    days: number = 30
  ): Promise<HeatmapPoint[]> {
    let query = '';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    const boundsFilter = bounds
      ? `AND b.latitude BETWEEN $${paramIndex} AND $${paramIndex + 1}
         AND b.longitude BETWEEN $${paramIndex + 2} AND $${paramIndex + 3}`
      : '';
    
    if (bounds) {
      params.push(bounds.south, bounds.north, bounds.west, bounds.east);
      paramIndex += 4;
    }

    switch (metric) {
      case 'incidents':
        query = `
          SELECT 
            b.latitude,
            b.longitude,
            COUNT(i.id)::float as value
          FROM branches b
          LEFT JOIN incidents i ON i.branch_node_id = b.id
            AND i.occurred_at >= NOW() - INTERVAL '${days} days'
          WHERE b.tenant_id = $1
            AND b.latitude IS NOT NULL 
            AND b.longitude IS NOT NULL
            AND b.status = 'active'
            ${boundsFilter}
          GROUP BY b.id, b.latitude, b.longitude
          HAVING COUNT(i.id) > 0
        `;
        break;

      case 'alerts':
        query = `
          SELECT 
            b.latitude,
            b.longitude,
            COUNT(oa.id)::float as value
          FROM branches b
          LEFT JOIN operational_alerts oa ON oa.branch_id = b.id
            AND oa.status = 'active'
            AND oa.severity IN ('critical', 'warning')
          WHERE b.tenant_id = $1
            AND b.latitude IS NOT NULL 
            AND b.longitude IS NOT NULL
            AND b.status = 'active'
            ${boundsFilter}
          GROUP BY b.id, b.latitude, b.longitude
          HAVING COUNT(oa.id) > 0
        `;
        break;

      case 'cameras_offline':
        query = `
          SELECT 
            b.latitude,
            b.longitude,
            COUNT(c.id) FILTER (WHERE c.online_status = 'offline')::float as value
          FROM branches b
          LEFT JOIN cameras c ON c.branch_id = b.id AND c.status = 'active'
          WHERE b.tenant_id = $1
            AND b.latitude IS NOT NULL 
            AND b.longitude IS NOT NULL
            AND b.status = 'active'
            ${boundsFilter}
          GROUP BY b.id, b.latitude, b.longitude
          HAVING COUNT(c.id) FILTER (WHERE c.online_status = 'offline') > 0
        `;
        break;

      case 'health_score':
        query = `
          SELECT 
            b.latitude,
            b.longitude,
            (100 - COALESCE(b.health_score, 100))::float as value
          FROM branches b
          WHERE b.tenant_id = $1
            AND b.latitude IS NOT NULL 
            AND b.longitude IS NOT NULL
            AND b.status = 'active'
            ${boundsFilter}
        `;
        break;
    }

    const result = await this.pool.query(query, params);

    // Find max value for normalization
    const maxValue = Math.max(...result.rows.map(row => parseFloat(row.value) || 0), 1);

    return result.rows.map(row => ({
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      intensity: Math.min((parseFloat(row.value) || 0) / maxValue, 1),
      metric
    }));
  }

  /**
   * Get regional statistics for map visualization
   */
  async getRegionalStatistics(tenantId: string) {
    const query = `
      SELECT 
        b.region,
        b.state,
        COUNT(DISTINCT b.id) as total_branches,
        COUNT(DISTINCT b.id) FILTER (WHERE b.health_status = 'healthy') as healthy_branches,
        COUNT(DISTINCT b.id) FILTER (WHERE b.health_status = 'warning') as warning_branches,
        COUNT(DISTINCT b.id) FILTER (WHERE b.health_status = 'critical') as critical_branches,
        AVG(b.health_score) as avg_health_score,
        COUNT(DISTINCT c.id) as total_cameras,
        COUNT(DISTINCT c.id) FILTER (WHERE c.online_status = 'online') as online_cameras,
        COUNT(DISTINCT oa.id) FILTER (WHERE oa.severity = 'critical' AND oa.status = 'active') as critical_alerts,
        AVG(b.latitude) as center_lat,
        AVG(b.longitude) as center_lng
      FROM branches b
      LEFT JOIN cameras c ON c.branch_id = b.id AND c.status = 'active'
      LEFT JOIN operational_alerts oa ON oa.branch_id = b.id
      WHERE b.tenant_id = $1
        AND b.status = 'active'
        AND b.latitude IS NOT NULL
        AND b.longitude IS NOT NULL
      GROUP BY b.region, b.state
      ORDER BY total_branches DESC
    `;

    const result = await this.pool.query(query, [tenantId]);

    return result.rows.map(row => ({
      region: row.region || 'Unknown',
      state: row.state || '',
      totalBranches: parseInt(row.total_branches) || 0,
      healthyBranches: parseInt(row.healthy_branches) || 0,
      warningBranches: parseInt(row.warning_branches) || 0,
      criticalBranches: parseInt(row.critical_branches) || 0,
      avgHealthScore: Math.round(parseFloat(row.avg_health_score) || 0),
      totalCameras: parseInt(row.total_cameras) || 0,
      onlineCameras: parseInt(row.online_cameras) || 0,
      criticalAlerts: parseInt(row.critical_alerts) || 0,
      centerLatitude: parseFloat(row.center_lat) || 0,
      centerLongitude: parseFloat(row.center_lng) || 0
    }));
  }

  /**
   * Get nearby branches for a given location
   */
  async getNearbyBranches(
    tenantId: string,
    latitude: number,
    longitude: number,
    radiusKm: number = 50,
    limit: number = 10
  ): Promise<BranchMapMarker[]> {
    const query = `
      SELECT 
        b.id,
        b.name,
        b.code,
        b.latitude,
        b.longitude,
        b.address_line1,
        b.address_line2,
        b.city,
        b.state,
        b.region,
        b.health_status,
        b.health_score,
        b.last_health_check,
        COUNT(DISTINCT c.id) as total_cameras,
        COUNT(DISTINCT c.id) FILTER (WHERE c.online_status = 'online') as online_cameras,
        COUNT(DISTINCT c.id) FILTER (WHERE c.online_status = 'offline') as offline_cameras,
        COUNT(DISTINCT oa.id) FILTER (WHERE oa.severity = 'critical' AND oa.status = 'active') as critical_alerts,
        COUNT(DISTINCT oa.id) FILTER (WHERE oa.severity = 'warning' AND oa.status = 'active') as warning_alerts,
        -- Haversine distance formula
        (
          6371 * acos(
            cos(radians($2)) * cos(radians(b.latitude)) *
            cos(radians(b.longitude) - radians($3)) +
            sin(radians($2)) * sin(radians(b.latitude))
          )
        ) as distance_km
      FROM branches b
      LEFT JOIN cameras c ON c.branch_id = b.id AND c.status = 'active'
      LEFT JOIN operational_alerts oa ON oa.branch_id = b.id
      WHERE b.tenant_id = $1
        AND b.status = 'active'
        AND b.latitude IS NOT NULL 
        AND b.longitude IS NOT NULL
      GROUP BY b.id, b.name, b.code, b.latitude, b.longitude, 
               b.address_line1, b.address_line2, b.city, b.state, b.region,
               b.health_status, b.health_score, b.last_health_check
      HAVING (
        6371 * acos(
          cos(radians($2)) * cos(radians(b.latitude)) *
          cos(radians(b.longitude) - radians($3)) +
          sin(radians($2)) * sin(radians(b.latitude))
        )
      ) <= $4
      ORDER BY distance_km
      LIMIT $5
    `;

    const result = await this.pool.query(query, [tenantId, latitude, longitude, radiusKm, limit]);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      code: row.code,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      address: [row.address_line1, row.address_line2].filter(Boolean).join(', '),
      city: row.city || '',
      state: row.state || '',
      region: row.region || '',
      healthStatus: row.health_status || 'unknown',
      healthScore: parseFloat(row.health_score) || 0,
      cameras: {
        total: parseInt(row.total_cameras) || 0,
        online: parseInt(row.online_cameras) || 0,
        offline: parseInt(row.offline_cameras) || 0
      },
      alerts: {
        critical: parseInt(row.critical_alerts) || 0,
        warning: parseInt(row.warning_alerts) || 0
      },
      lastUpdated: row.last_health_check || new Date()
    }));
  }

  /**
   * Get map summary statistics
   */
  async getMapSummary(tenantId: string, bounds?: MapBounds) {
    const boundsFilter = bounds
      ? `AND b.latitude BETWEEN $2 AND $3 AND b.longitude BETWEEN $4 AND $5`
      : '';
    
    const params: any[] = [tenantId];
    if (bounds) {
      params.push(bounds.south, bounds.north, bounds.west, bounds.east);
    }

    const query = `
      SELECT 
        COUNT(DISTINCT b.id) as total_branches,
        COUNT(DISTINCT b.id) FILTER (WHERE b.health_status = 'critical') as critical_branches,
        COUNT(DISTINCT b.id) FILTER (WHERE b.health_status = 'warning') as warning_branches,
        COUNT(DISTINCT b.id) FILTER (WHERE b.health_status = 'healthy') as healthy_branches,
        COUNT(DISTINCT c.id) as total_cameras,
        COUNT(DISTINCT c.id) FILTER (WHERE c.online_status = 'offline') as offline_cameras,
        COUNT(DISTINCT oa.id) FILTER (WHERE oa.severity = 'critical' AND oa.status = 'active') as critical_alerts,
        COUNT(DISTINCT i.id) FILTER (WHERE i.occurred_at >= NOW() - INTERVAL '24 hours') as incidents_24h
      FROM branches b
      LEFT JOIN cameras c ON c.branch_id = b.id AND c.status = 'active'
      LEFT JOIN operational_alerts oa ON oa.branch_id = b.id
      LEFT JOIN incidents i ON i.branch_node_id = b.id
      WHERE b.tenant_id = $1
        AND b.status = 'active'
        AND b.latitude IS NOT NULL 
        AND b.longitude IS NOT NULL
        ${boundsFilter}
    `;

    const result = await this.pool.query(query, params);
    const row = result.rows[0];

    return {
      totalBranches: parseInt(row.total_branches) || 0,
      criticalBranches: parseInt(row.critical_branches) || 0,
      warningBranches: parseInt(row.warning_branches) || 0,
      healthyBranches: parseInt(row.healthy_branches) || 0,
      totalCameras: parseInt(row.total_cameras) || 0,
      offlineCameras: parseInt(row.offline_cameras) || 0,
      criticalAlerts: parseInt(row.critical_alerts) || 0,
      incidents24h: parseInt(row.incidents_24h) || 0
    };
  }
}
