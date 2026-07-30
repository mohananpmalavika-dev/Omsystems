/**
 * Heat Map Service
 * Generates spatial heat maps for people movement, incidents, and device health
 */

import { pool } from '../config/database';
import { DigitalTwinHeatmap, HeatmapType, GenerateHeatmapRequest } from '../types/digital-twin';

export class HeatMapService {
  async generateHeatmap(request: GenerateHeatmapRequest): Promise<DigitalTwinHeatmap> {
    const gridResolution = request.gridResolution || 50;
    const gridData = await this.computeGridData(
      request.floorId,
      request.heatmapType,
      request.timePeriodStart,
      request.timePeriodEnd,
      gridResolution,
      request.sourceCameras,
      request.sourceZones
    );

    const stats = this.calculateStatistics(gridData);

    const result = await pool.query(
      `INSERT INTO digital_twin_heatmaps 
       (floor_id, heatmap_type, time_period_start, time_period_end, 
        grid_resolution, grid_data, max_intensity, avg_intensity, total_events, 
        source_cameras, source_zones, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        request.floorId,
        request.heatmapType,
        request.timePeriodStart,
        request.timePeriodEnd,
        gridResolution,
        JSON.stringify(gridData),
        stats.maxIntensity,
        stats.avgIntensity,
        stats.totalEvents,
        JSON.stringify(request.sourceCameras || []),
        JSON.stringify(request.sourceZones || []),
        JSON.stringify({}),
      ]
    );

    return this.mapHeatmap(result.rows[0]);
  }

  async getLatestHeatmap(floorId: string, heatmapType: HeatmapType): Promise<DigitalTwinHeatmap | null> {
    const result = await pool.query(
      `SELECT * FROM digital_twin_heatmaps 
       WHERE floor_id = $1 AND heatmap_type = $2 
       ORDER BY generated_at DESC 
       LIMIT 1`,
      [floorId, heatmapType]
    );

    return result.rows[0] ? this.mapHeatmap(result.rows[0]) : null;
  }

  async listHeatmaps(
    floorId: string,
    heatmapType?: HeatmapType,
    limit: number = 10
  ): Promise<DigitalTwinHeatmap[]> {
    let query = 'SELECT * FROM digital_twin_heatmaps WHERE floor_id = $1';
    const params: any[] = [floorId];

    if (heatmapType) {
      query += ' AND heatmap_type = $2';
      params.push(heatmapType);
    }

    query += ' ORDER BY generated_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows.map(this.mapHeatmap);
  }

  private async computeGridData(
    floorId: string,
    heatmapType: HeatmapType,
    startTime: Date,
    endTime: Date,
    gridResolution: number,
    sourceCameras?: string[],
    sourceZones?: string[]
  ): Promise<number[][]> {
    // Initialize grid
    const grid: number[][] = Array(gridResolution)
      .fill(0)
      .map(() => Array(gridResolution).fill(0));

    switch (heatmapType) {
      case 'people_movement':
        return this.computePeopleMovementHeatmap(
          floorId,
          startTime,
          endTime,
          grid,
          sourceCameras
        );
      case 'dwell_time':
        return this.computeDwellTimeHeatmap(floorId, startTime, endTime, grid, sourceCameras);
      case 'incidents':
        return this.computeIncidentHeatmap(floorId, startTime, endTime, grid);
      case 'device_failures':
        return this.computeDeviceFailureHeatmap(floorId, startTime, endTime, grid);
      case 'queue_density':
        return this.computeQueueDensityHeatmap(floorId, startTime, endTime, grid, sourceZones);
      case 'intrusions':
        return this.computeIntrusionHeatmap(floorId, startTime, endTime, grid);
      default:
        return grid;
    }
  }

  private async computePeopleMovementHeatmap(
    floorId: string,
    startTime: Date,
    endTime: Date,
    grid: number[][],
    sourceCameras?: string[]
  ): Promise<number[][]> {
    // Query people detection data from analytics
    let query = `
      SELECT dto.position_x, dto.position_y, COUNT(*) as detection_count
      FROM analytics_detections ad
      JOIN digital_twin_objects dto ON ad.camera_id = dto.id
      WHERE dto.floor_id = $1
        AND ad.detection_type = 'person'
        AND ad.timestamp BETWEEN $2 AND $3
    `;
    const params: any[] = [floorId, startTime, endTime];

    if (sourceCameras && sourceCameras.length > 0) {
      query += ` AND ad.camera_id = ANY($4)`;
      params.push(sourceCameras);
    }

    query += ' GROUP BY dto.position_x, dto.position_y';

    const result = await pool.query(query, params);

    // Map detections to grid cells
    result.rows.forEach((row: any) => {
      const gridX = Math.floor(row.position_x * grid.length);
      const gridY = Math.floor(row.position_y * grid[0].length);
      if (gridX >= 0 && gridX < grid.length && gridY >= 0 && gridY < grid[0].length) {
        grid[gridX][gridY] += parseInt(row.detection_count);
      }
    });

    return grid;
  }

  private async computeDwellTimeHeatmap(
    floorId: string,
    startTime: Date,
    endTime: Date,
    grid: number[][],
    sourceCameras?: string[]
  ): Promise<number[][]> {
    // Query dwell time data
    let query = `
      SELECT dto.position_x, dto.position_y, AVG(ad.dwell_time) as avg_dwell
      FROM analytics_detections ad
      JOIN digital_twin_objects dto ON ad.camera_id = dto.id
      WHERE dto.floor_id = $1
        AND ad.dwell_time IS NOT NULL
        AND ad.timestamp BETWEEN $2 AND $3
    `;
    const params: any[] = [floorId, startTime, endTime];

    if (sourceCameras && sourceCameras.length > 0) {
      query += ` AND ad.camera_id = ANY($4)`;
      params.push(sourceCameras);
    }

    query += ' GROUP BY dto.position_x, dto.position_y';

    const result = await pool.query(query, params);

    result.rows.forEach((row: any) => {
      const gridX = Math.floor(row.position_x * grid.length);
      const gridY = Math.floor(row.position_y * grid[0].length);
      if (gridX >= 0 && gridX < grid.length && gridY >= 0 && gridY < grid[0].length) {
        grid[gridX][gridY] += parseFloat(row.avg_dwell) / 60; // Convert to minutes
      }
    });

    return grid;
  }

  private async computeIncidentHeatmap(
    floorId: string,
    startTime: Date,
    endTime: Date,
    grid: number[][]
  ): Promise<number[][]> {
    // Query incident locations
    const result = await pool.query(
      `SELECT dto.position_x, dto.position_y, COUNT(*) as incident_count
       FROM digital_twin_alert_markers dtam
       LEFT JOIN digital_twin_objects dto ON dtam.twin_object_id = dto.id
       WHERE dtam.floor_id = $1
         AND dtam.triggered_at BETWEEN $2 AND $3
       GROUP BY dto.position_x, dto.position_y`,
      [floorId, startTime, endTime]
    );

    result.rows.forEach((row: any) => {
      if (row.position_x && row.position_y) {
        const gridX = Math.floor(row.position_x * grid.length);
        const gridY = Math.floor(row.position_y * grid[0].length);
        if (gridX >= 0 && gridX < grid.length && gridY >= 0 && gridY < grid[0].length) {
          grid[gridX][gridY] += parseInt(row.incident_count);
        }
      }
    });

    return grid;
  }

  private async computeDeviceFailureHeatmap(
    floorId: string,
    startTime: Date,
    endTime: Date,
    grid: number[][]
  ): Promise<number[][]> {
    // Query device offline events
    const result = await pool.query(
      `SELECT dto.position_x, dto.position_y, COUNT(*) as failure_count
       FROM digital_twin_alert_markers dtam
       JOIN digital_twin_objects dto ON dtam.twin_object_id = dto.id
       WHERE dtam.floor_id = $1
         AND dtam.alert_type = 'camera_offline'
         AND dtam.triggered_at BETWEEN $2 AND $3
       GROUP BY dto.position_x, dto.position_y`,
      [floorId, startTime, endTime]
    );

    result.rows.forEach((row: any) => {
      const gridX = Math.floor(row.position_x * grid.length);
      const gridY = Math.floor(row.position_y * grid[0].length);
      if (gridX >= 0 && gridX < grid.length && gridY >= 0 && gridY < grid[0].length) {
        grid[gridX][gridY] += parseInt(row.failure_count);
      }
    });

    return grid;
  }

  private async computeQueueDensityHeatmap(
    floorId: string,
    startTime: Date,
    endTime: Date,
    grid: number[][],
    sourceZones?: string[]
  ): Promise<number[][]> {
    // For zones marked as queue areas, compute density
    if (!sourceZones || sourceZones.length === 0) {
      return grid;
    }

    const result = await pool.query(
      `SELECT dtz.vertices, COUNT(ad.id) as queue_count
       FROM digital_twin_zones dtz
       JOIN analytics_detections ad ON ad.zone_id = dtz.id
       WHERE dtz.floor_id = $1
         AND dtz.id = ANY($2)
         AND ad.timestamp BETWEEN $3 AND $4
       GROUP BY dtz.id, dtz.vertices`,
      [floorId, sourceZones, startTime, endTime]
    );

    result.rows.forEach((row: any) => {
      const vertices = row.vertices;
      if (vertices && vertices.length > 0) {
        // Fill zone area with queue density
        const minX = Math.min(...vertices.map((v: any) => v.x));
        const maxX = Math.max(...vertices.map((v: any) => v.x));
        const minY = Math.min(...vertices.map((v: any) => v.y));
        const maxY = Math.max(...vertices.map((v: any) => v.y));

        const startX = Math.floor(minX * grid.length);
        const endX = Math.ceil(maxX * grid.length);
        const startY = Math.floor(minY * grid[0].length);
        const endY = Math.ceil(maxY * grid[0].length);

        for (let x = startX; x < endX && x < grid.length; x++) {
          for (let y = startY; y < endY && y < grid[0].length; y++) {
            grid[x][y] += parseInt(row.queue_count);
          }
        }
      }
    });

    return grid;
  }

  private async computeIntrusionHeatmap(
    floorId: string,
    startTime: Date,
    endTime: Date,
    grid: number[][]
  ): Promise<number[][]> {
    // Query intrusion alerts
    const result = await pool.query(
      `SELECT dto.position_x, dto.position_y, COUNT(*) as intrusion_count
       FROM digital_twin_alert_markers dtam
       LEFT JOIN digital_twin_objects dto ON dtam.twin_object_id = dto.id
       WHERE dtam.floor_id = $1
         AND dtam.alert_type = 'intrusion'
         AND dtam.triggered_at BETWEEN $2 AND $3
       GROUP BY dto.position_x, dto.position_y`,
      [floorId, startTime, endTime]
    );

    result.rows.forEach((row: any) => {
      if (row.position_x && row.position_y) {
        const gridX = Math.floor(row.position_x * grid.length);
        const gridY = Math.floor(row.position_y * grid[0].length);
        if (gridX >= 0 && gridX < grid.length && gridY >= 0 && gridY < grid[0].length) {
          grid[gridX][gridY] += parseInt(row.intrusion_count);
        }
      }
    });

    return grid;
  }

  private calculateStatistics(grid: number[][]): {
    maxIntensity: number;
    avgIntensity: number;
    totalEvents: number;
  } {
    let maxIntensity = 0;
    let totalIntensity = 0;
    let totalEvents = 0;
    let cellCount = 0;

    for (let x = 0; x < grid.length; x++) {
      for (let y = 0; y < grid[x].length; y++) {
        const value = grid[x][y];
        if (value > 0) {
          maxIntensity = Math.max(maxIntensity, value);
          totalIntensity += value;
          totalEvents += value;
          cellCount++;
        }
      }
    }

    return {
      maxIntensity,
      avgIntensity: cellCount > 0 ? totalIntensity / cellCount : 0,
      totalEvents,
    };
  }

  private mapHeatmap(row: any): DigitalTwinHeatmap {
    return {
      id: row.id,
      floorId: row.floor_id,
      heatmapType: row.heatmap_type,
      timePeriodStart: row.time_period_start,
      timePeriodEnd: row.time_period_end,
      gridResolution: row.grid_resolution,
      gridData: row.grid_data,
      maxIntensity: parseFloat(row.max_intensity),
      avgIntensity: parseFloat(row.avg_intensity),
      totalEvents: row.total_events,
      sourceCameras: row.source_cameras,
      sourceZones: row.source_zones,
      metadata: row.metadata,
      generatedAt: row.generated_at,
    };
  }
}

export default new HeatMapService();
