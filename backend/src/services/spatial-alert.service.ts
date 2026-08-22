/**
 * Spatial Alert Service
 * Manages alert markers on floor plans and spatial alert notifications
 */

import { pool } from '../config/database';
import {
  DigitalTwinAlertMarker,
  CreateAlertMarkerRequest,
  AlertType,
  AlertSeverity,
} from '../types/digital-twin';
import { EventEmitter } from 'events';

export class SpatialAlertService extends EventEmitter {
  async createAlertMarker(request: CreateAlertMarkerRequest): Promise<DigitalTwinAlertMarker> {
    const result = await pool.query(
      `INSERT INTO digital_twin_alert_markers 
       (floor_id, twin_object_id, alert_type, severity, title, description, 
        position_x, position_y, triggered_at, incident_id, pulse_effect, auto_zoom, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        request.floorId,
        request.twinObjectId,
        request.alertType,
        request.severity,
        request.title,
        request.description,
        request.positionX,
        request.positionY,
        new Date(),
        request.incidentId,
        request.pulseEffect !== false,
        request.autoZoom !== false,
        JSON.stringify(request.metadata || {}),
      ]
    );

    const alert = this.mapAlert(result.rows[0]);
    
    // Emit real-time event
    this.emit('alert:triggered', alert);
    
    return alert;
  }

  async getAlertMarker(alertId: string): Promise<DigitalTwinAlertMarker | null> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_alert_markers WHERE id = $1',
      [alertId]
    );
    
    return result.rows[0] ? this.mapAlert(result.rows[0]) : null;
  }

  async listActiveAlerts(floorId: string): Promise<DigitalTwinAlertMarker[]> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_alert_markers WHERE floor_id = $1 AND resolved_at IS NULL ORDER BY triggered_at DESC',
      [floorId]
    );
    
    return result.rows.map(this.mapAlert);
  }

  async listAlertHistory(
    floorId: string,
    limit: number = 100
  ): Promise<DigitalTwinAlertMarker[]> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_alert_markers WHERE floor_id = $1 ORDER BY triggered_at DESC LIMIT $2',
      [floorId, limit]
    );
    
    return result.rows.map(this.mapAlert);
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<DigitalTwinAlertMarker> {
    const result = await pool.query(
      `UPDATE digital_twin_alert_markers 
       SET acknowledged_at = CURRENT_TIMESTAMP,
           acknowledged_by = $1
       WHERE id = $2
       RETURNING *`,
      [userId, alertId]
    );

    const alert = this.mapAlert(result.rows[0]);
    this.emit('alert:acknowledged', alert);
    
    return alert;
  }

  async resolveAlert(alertId: string, userId: string): Promise<DigitalTwinAlertMarker> {
    const result = await pool.query(
      `UPDATE digital_twin_alert_markers 
       SET resolved_at = CURRENT_TIMESTAMP,
           resolved_by = $1
       WHERE id = $2
       RETURNING *`,
      [userId, alertId]
    );

    const alert = this.mapAlert(result.rows[0]);
    this.emit('alert:resolved', alert);
    
    return alert;
  }

  async deleteAlertMarker(alertId: string): Promise<void> {
    await pool.query('DELETE FROM digital_twin_alert_markers WHERE id = $1', [alertId]);
  }

  async getAlertsByIncident(incidentId: string): Promise<DigitalTwinAlertMarker[]> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_alert_markers WHERE incident_id = $1 ORDER BY triggered_at',
      [incidentId]
    );
    
    return result.rows.map(this.mapAlert);
  }

  async getAlertsBySeverity(
    floorId: string,
    severity: AlertSeverity
  ): Promise<DigitalTwinAlertMarker[]> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_alert_markers WHERE floor_id = $1 AND severity = $2 AND resolved_at IS NULL',
      [floorId, severity]
    );
    
    return result.rows.map(this.mapAlert);
  }

  async getAlertsByType(
    floorId: string,
    alertType: AlertType
  ): Promise<DigitalTwinAlertMarker[]> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_alert_markers WHERE floor_id = $1 AND alert_type = $2 AND resolved_at IS NULL',
      [floorId, alertType]
    );
    
    return result.rows.map(this.mapAlert);
  }

  // Create alert from camera event
  async createCameraAlert(
    cameraId: string,
    alertType: AlertType,
    severity: AlertSeverity,
    title: string,
    description?: string,
    metadata?: Record<string, any>
  ): Promise<DigitalTwinAlertMarker | null> {
    // Find twin object for this camera
    const objectResult = await pool.query(
      `SELECT dto.*, dtdb.device_id 
       FROM digital_twin_objects dto
       JOIN digital_twin_device_bindings dtdb ON dto.id = dtdb.twin_object_id
       WHERE dtdb.device_id = $1 AND dtdb.device_type = 'camera'
       LIMIT 1`,
      [cameraId]
    );

    if (!objectResult.rows[0]) {
      return null; // Camera not in Digital Twin
    }

    const object = objectResult.rows[0];

    return this.createAlertMarker({
      floorId: object.floor_id,
      twinObjectId: object.id,
      alertType,
      severity,
      title,
      description,
      metadata,
    });
  }

  // Create alert from door event
  async createDoorAlert(
    doorId: string,
    alertType: AlertType,
    severity: AlertSeverity,
    title: string,
    description?: string,
    metadata?: Record<string, any>
  ): Promise<DigitalTwinAlertMarker | null> {
    // Find twin object for this door
    const objectResult = await pool.query(
      `SELECT dto.*, dtdb.device_id 
       FROM digital_twin_objects dto
       JOIN digital_twin_device_bindings dtdb ON dto.id = dtdb.twin_object_id
       WHERE dtdb.device_id = $1 AND dto.object_type = 'door'
       LIMIT 1`,
      [doorId]
    );

    if (!objectResult.rows[0]) {
      return null;
    }

    const object = objectResult.rows[0];

    return this.createAlertMarker({
      floorId: object.floor_id,
      twinObjectId: object.id,
      alertType,
      severity,
      title,
      description,
      metadata,
    });
  }

  private mapAlert(row: any): DigitalTwinAlertMarker {
    return {
      id: row.id,
      floorId: row.floor_id,
      twinObjectId: row.twin_object_id,
      alertType: row.alert_type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      positionX: row.position_x ? parseFloat(row.position_x) : undefined,
      positionY: row.position_y ? parseFloat(row.position_y) : undefined,
      triggeredAt: row.triggered_at,
      acknowledgedAt: row.acknowledged_at,
      resolvedAt: row.resolved_at,
      acknowledgedBy: row.acknowledged_by,
      resolvedBy: row.resolved_by,
      incidentId: row.incident_id,
      pulseEffect: row.pulse_effect,
      autoZoom: row.auto_zoom,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }
}

export default new SpatialAlertService();
