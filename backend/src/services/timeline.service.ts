/**
 * Timeline Service
 * Historical state replay and incident reconstruction
 */

import { pool } from '../config/database';
import { TimelineFrame, TimelineEvent } from '../types/digital-twin';

export class TimelineService {
  // Create scene version snapshot
  async createSceneSnapshot(
    floorId: string,
    relatedIncidentId?: string,
    eventSummary?: string
  ): Promise<void> {
    // Get current floor state
    const objectsResult = await pool.query(
      `SELECT id, position_x, position_y, rotation, object_type, name FROM digital_twin_objects WHERE floor_id = $1`,
      [floorId]
    );

    // Get current alerts
    const alertsResult = await pool.query(
      `SELECT id, twin_object_id, alert_type, severity, title, triggered_at 
       FROM digital_twin_alert_markers 
       WHERE floor_id = $1 AND resolved_at IS NULL`,
      [floorId]
    );

    // Get device statuses
    const deviceStates = await this.getCurrentDeviceStates(floorId);

    const objectStates = objectsResult.rows.map(obj => ({
      objectId: obj.id,
      position: { x: parseFloat(obj.position_x), y: parseFloat(obj.position_y) },
      rotation: parseFloat(obj.rotation),
      status: deviceStates[obj.id]?.status || 'unknown',
      statusColor: deviceStates[obj.id]?.statusColor || '#6b7280',
      metadata: {},
    }));

    const activeAlerts = alertsResult.rows.map(alert => ({
      objectId: alert.twin_object_id,
      position: objectStates.find(o => o.objectId === alert.twin_object_id)?.position || { x: 0, y: 0 },
      alertType: alert.alert_type,
      severity: alert.severity,
      title: alert.title,
      triggeredAt: alert.triggered_at,
    }));

    await pool.query(
      `INSERT INTO digital_twin_scene_versions 
       (floor_id, snapshot_time, object_states, active_alerts, door_states, 
        sensor_states, camera_states, event_summary, related_incident_id)
       VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4, $5, $6, $7, $8)`,
      [
        floorId,
        JSON.stringify(objectStates),
        JSON.stringify(activeAlerts),
        JSON.stringify(deviceStates.doors || {}),
        JSON.stringify(deviceStates.sensors || {}),
        JSON.stringify(deviceStates.cameras || {}),
        eventSummary,
        relatedIncidentId,
      ]
    );
  }

  // Get timeline frames for playback
  async getTimelineFrames(
    floorId: string,
    startTime: Date,
    endTime: Date,
    intervalSeconds: number = 60
  ): Promise<TimelineFrame[]> {
    const frames: TimelineFrame[] = [];
    
    // Get scene snapshots in time range
    const snapshotsResult = await pool.query(
      `SELECT * FROM digital_twin_scene_versions 
       WHERE floor_id = $1 
         AND snapshot_time BETWEEN $2 AND $3 
       ORDER BY snapshot_time`,
      [floorId, startTime, endTime]
    );

    // Get events in time range
    const eventsResult = await pool.query(
      `SELECT 
         dtam.id,
         dtam.alert_type as event_type,
         dtam.title as description,
         dtam.severity,
         dtam.twin_object_id as object_id,
         dtam.triggered_at as timestamp,
         dtam.metadata
       FROM digital_twin_alert_markers dtam
       WHERE dtam.floor_id = $1 
         AND dtam.triggered_at BETWEEN $2 AND $3
       ORDER BY dtam.triggered_at`,
      [floorId, startTime, endTime]
    );

    const events: TimelineEvent[] = eventsResult.rows.map(row => ({
      timestamp: row.timestamp,
      eventType: row.event_type,
      objectId: row.object_id,
      description: row.description,
      severity: row.severity,
      metadata: row.metadata,
    }));

    // Build frames from snapshots
    for (const snapshot of snapshotsResult.rows) {
      const frame: TimelineFrame = {
        timestamp: snapshot.snapshot_time,
        objectStates: snapshot.object_states,
        alerts: snapshot.active_alerts,
        doorStates: snapshot.door_states,
        sensorStates: snapshot.sensor_states,
        cameraStates: snapshot.camera_states,
        events: events.filter(e => 
          e.timestamp <= snapshot.snapshot_time &&
          e.timestamp > new Date(snapshot.snapshot_time.getTime() - intervalSeconds * 1000)
        ),
      };
      frames.push(frame);
    }

    return frames;
  }

  // Get timeline for specific incident
  async getIncidentTimeline(incidentId: string): Promise<{
    frames: TimelineFrame[];
    events: TimelineEvent[];
    summary: string;
  }> {
    // Get incident details
    const incidentResult = await pool.query(
      'SELECT floor_id, created_at FROM incidents WHERE id = $1',
      [incidentId]
    );

    if (!incidentResult.rows[0]) {
      throw new Error('Incident not found');
    }

    const incident = incidentResult.rows[0];
    const incidentTime = incident.created_at;
    
    // Get timeline around incident (15 minutes before and after)
    const startTime = new Date(incidentTime.getTime() - 15 * 60 * 1000);
    const endTime = new Date(incidentTime.getTime() + 15 * 60 * 1000);

    const frames = await this.getTimelineFrames(incident.floor_id, startTime, endTime, 30);

    // Get all events related to incident
    const eventsResult = await pool.query(
      `SELECT 
         dtam.alert_type as event_type,
         dtam.title as description,
         dtam.severity,
         dtam.twin_object_id as object_id,
         dtam.triggered_at as timestamp,
         dtam.metadata
       FROM digital_twin_alert_markers dtam
       WHERE dtam.incident_id = $1
       ORDER BY dtam.triggered_at`,
      [incidentId]
    );

    const events: TimelineEvent[] = eventsResult.rows.map(row => ({
      timestamp: row.timestamp,
      eventType: row.event_type,
      objectId: row.object_id,
      description: row.description,
      severity: row.severity,
      metadata: row.metadata,
    }));

    const summary = this.generateIncidentSummary(events);

    return { frames, events, summary };
  }

  // Get events by time range
  async getEventsByTimeRange(
    floorId: string,
    startTime: Date,
    endTime: Date,
    eventTypes?: string[]
  ): Promise<TimelineEvent[]> {
    let query = `
      SELECT 
        dtam.alert_type as event_type,
        dtam.title as description,
        dtam.severity,
        dtam.twin_object_id as object_id,
        dtam.triggered_at as timestamp,
        dtam.metadata
      FROM digital_twin_alert_markers dtam
      WHERE dtam.floor_id = $1 
        AND dtam.triggered_at BETWEEN $2 AND $3
    `;
    const params: any[] = [floorId, startTime, endTime];

    if (eventTypes && eventTypes.length > 0) {
      query += ' AND dtam.alert_type = ANY($4)';
      params.push(eventTypes);
    }

    query += ' ORDER BY dtam.triggered_at';

    const result = await pool.query(query, params);

    return result.rows.map(row => ({
      timestamp: row.timestamp,
      eventType: row.event_type,
      objectId: row.object_id,
      description: row.description,
      severity: row.severity,
      metadata: row.metadata,
    }));
  }

  // Schedule periodic snapshots
  async schedulePeriodicSnapshots(floorId: string, intervalMinutes: number = 5): Promise<void> {
    // This would be called by a cron job or scheduler
    await this.createSceneSnapshot(floorId);
  }

  private async getCurrentDeviceStates(floorId: string): Promise<any> {
    const result = await pool.query(
      `SELECT 
         dto.id,
         dto.object_type,
         dtdb.device_type,
         dtdb.device_id,
         dtdb.device_table
       FROM digital_twin_objects dto
       LEFT JOIN digital_twin_device_bindings dtdb ON dto.id = dtdb.twin_object_id
       WHERE dto.floor_id = $1`,
      [floorId]
    );

    const states: any = {
      doors: {},
      sensors: {},
      cameras: {},
    };

    for (const row of result.rows) {
      if (!row.device_id) continue;

      let status = 'unknown';
      let statusColor = '#6b7280';

      // Query device status from appropriate table
      if (row.device_table) {
        try {
          const deviceResult = await pool.query(
            `SELECT status, health_status, is_online FROM ${row.device_table} WHERE id = $1`,
            [row.device_id]
          );

          if (deviceResult.rows[0]) {
            status = deviceResult.rows[0].health_status || deviceResult.rows[0].status || 'unknown';
            statusColor = this.getStatusColor(status);
          }
        } catch (error) {
          console.error(`Error querying device status:`, error);
        }
      }

      states[row.id] = { status, statusColor };

      // Categorize by type
      if (row.object_type === 'door') {
        states.doors[row.id] = { status, lastChanged: new Date() };
      } else if (row.object_type.includes('sensor')) {
        states.sensors[row.id] = { status, lastTriggered: new Date() };
      } else if (row.object_type === 'camera') {
        states.cameras[row.id] = { status, isRecording: status === 'recording' };
      }
    }

    return states;
  }

  private getStatusColor(status: string): string {
    const colorMap: Record<string, string> = {
      online: '#22c55e',
      offline: '#ef4444',
      recording: '#22c55e',
      degraded: '#f97316',
      open: '#3b82f6',
      closed: '#22c55e',
      forced: '#ef4444',
      normal: '#22c55e',
      triggered: '#f97316',
    };
    return colorMap[status] || '#6b7280';
  }

  private generateIncidentSummary(events: TimelineEvent[]): string {
    if (events.length === 0) {
      return 'No events recorded';
    }

    const eventTypes = [...new Set(events.map(e => e.eventType))];
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    
    const duration = Math.round(
      (lastEvent.timestamp.getTime() - firstEvent.timestamp.getTime()) / 1000
    );

    return `Incident involved ${events.length} event(s) across ${eventTypes.length} type(s). Duration: ${duration}s. Types: ${eventTypes.join(', ')}`;
  }
}

export default new TimelineService();
