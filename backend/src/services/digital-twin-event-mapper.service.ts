/**
 * Digital Twin Event Mapper Service
 * Maps camera, sensor, and door events to spatial alerts on floor plans
 */

import { EventEmitter } from 'events';
import spatialAlertService from './spatial-alert.service';
import deviceBindingService from './device-binding.service';
import {
  AlertType,
  AlertSeverity,
  DigitalTwinRealtimeEvent,
  ObjectStatusChangeEvent,
  AlertTriggeredEvent,
  DoorStateChangeEvent,
} from '../types/digital-twin';

export class DigitalTwinEventMapper extends EventEmitter {
  constructor() {
    super();
    this.initializeEventListeners();
  }

  private initializeEventListeners() {
    // Listen for spatial alert events
    spatialAlertService.on('alert:triggered', (alert) => {
      this.broadcastEvent({
        type: 'alert_triggered',
        floorId: alert.floorId,
        objectId: alert.twinObjectId,
        data: alert,
        timestamp: new Date(),
      });
    });

    spatialAlertService.on('alert:acknowledged', (alert) => {
      this.broadcastEvent({
        type: 'alert_triggered', // Using same type, data contains acknowledgment
        floorId: alert.floorId,
        objectId: alert.twinObjectId,
        data: alert,
        timestamp: new Date(),
      });
    });

    spatialAlertService.on('alert:resolved', (alert) => {
      this.broadcastEvent({
        type: 'alert_resolved',
        floorId: alert.floorId,
        objectId: alert.twinObjectId,
        data: alert,
        timestamp: new Date(),
      });
    });
  }

  // Map camera health change to spatial event
  async onCameraHealthChange(cameraId: string, previousStatus: string, newStatus: string): Promise<void> {
    const binding = await deviceBindingService.getBindingByDevice('camera', cameraId);
    
    if (!binding) {
      return; // Camera not in Digital Twin
    }

    // Get object and floor info
    const objectQuery = await import('../config/database').then(db => 
      db.pool.query(
        'SELECT * FROM digital_twin_objects WHERE id = $1',
        [binding.twinObjectId]
      )
    );

    if (!objectQuery.rows[0]) {
      return;
    }

    const object = objectQuery.rows[0];

    // Broadcast status change
    const statusChangeEvent: ObjectStatusChangeEvent = {
      objectId: binding.twinObjectId,
      floorId: object.floor_id,
      previousStatus,
      newStatus,
      statusColor: this.getStatusColor(newStatus),
      timestamp: new Date(),
    };

    this.broadcastEvent({
      type: 'object_status_change',
      floorId: object.floor_id,
      objectId: binding.twinObjectId,
      data: statusChangeEvent,
      timestamp: new Date(),
    });

    // Create alert if camera went offline
    if (newStatus === 'offline' && previousStatus !== 'offline') {
      await spatialAlertService.createCameraAlert(
        cameraId,
        'camera_offline',
        'high',
        `Camera ${object.name} went offline`,
        'Camera connection lost',
        { previousStatus, newStatus }
      );
    }
  }

  // Map AI detection to spatial alert
  async onAIDetection(
    cameraId: string,
    detectionType: string,
    severity: AlertSeverity,
    title: string,
    description?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const alertType = this.mapDetectionToAlertType(detectionType);
    
    const alert = await spatialAlertService.createCameraAlert(
      cameraId,
      alertType,
      severity,
      title,
      description,
      metadata
    );

    if (alert) {
      // Get nearby cameras for operator awareness
      const nearbyResult = await import('../config/database').then(db =>
        db.pool.query(
          `SELECT dto.id, dto.name, dtdb.device_id
           FROM digital_twin_objects dto
           JOIN digital_twin_device_bindings dtdb ON dto.id = dtdb.twin_object_id
           WHERE dto.floor_id = $1 
             AND dto.object_type = 'camera'
             AND dtdb.device_type = 'camera'
             AND dto.id != $2
           ORDER BY 
             POW(dto.position_x - (SELECT position_x FROM digital_twin_objects WHERE id = $2), 2) +
             POW(dto.position_y - (SELECT position_y FROM digital_twin_objects WHERE id = $2), 2)
           LIMIT 3`,
          [alert.floorId, alert.twinObjectId]
        )
      );

      const nearbyCameras = nearbyResult.rows.map(row => row.device_id);

      const alertEvent: AlertTriggeredEvent = {
        alertId: alert.id,
        floorId: alert.floorId,
        objectId: alert.twinObjectId,
        alertType: alert.alertType,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        position: alert.positionX && alert.positionY ? 
          { x: alert.positionX, y: alert.positionY } : undefined,
        autoZoom: alert.autoZoom,
        nearbyCamera: nearbyCameras,
        timestamp: new Date(),
      };

      this.broadcastEvent({
        type: 'alert_triggered',
        floorId: alert.floorId,
        objectId: alert.twinObjectId,
        data: alertEvent,
        timestamp: new Date(),
      });
    }
  }

  // Map door state change to spatial event
  async onDoorStateChange(
    doorId: string,
    previousState: string,
    newState: string,
    authorizedUser?: string
  ): Promise<void> {
    const binding = await deviceBindingService.getBindingByDevice('access_control', doorId);
    
    if (!binding) {
      return; // Door not in Digital Twin
    }

    const objectQuery = await import('../config/database').then(db =>
      db.pool.query(
        'SELECT * FROM digital_twin_objects WHERE id = $1',
        [binding.twinObjectId]
      )
    );

    if (!objectQuery.rows[0]) {
      return;
    }

    const object = objectQuery.rows[0];

    const doorEvent: DoorStateChangeEvent = {
      doorObjectId: binding.twinObjectId,
      floorId: object.floor_id,
      previousState,
      newState,
      authorizedUser,
      timestamp: new Date(),
    };

    this.broadcastEvent({
      type: 'door_state_change',
      floorId: object.floor_id,
      objectId: binding.twinObjectId,
      data: doorEvent,
      timestamp: new Date(),
    });

    // Create alert for forced door
    if (newState === 'forced' || newState === 'tampered') {
      await spatialAlertService.createDoorAlert(
        doorId,
        'door_forced',
        'critical',
        `Door ${object.name} forced open`,
        'Unauthorized door access detected',
        { previousState, newState, authorizedUser }
      );
    }

    // Create alert for held open door
    if (newState === 'held_open') {
      await spatialAlertService.createDoorAlert(
        doorId,
        'door_forced',
        'medium',
        `Door ${object.name} held open`,
        'Door has been open for extended period',
        { previousState, newState, authorizedUser }
      );
    }
  }

  // Map sensor trigger to spatial event
  async onSensorTrigger(
    sensorId: string,
    sensorType: string,
    severity: AlertSeverity,
    title: string,
    description?: string
  ): Promise<void> {
    const binding = await deviceBindingService.getBindingByDevice('sensor', sensorId);
    
    if (!binding) {
      return;
    }

    const objectQuery = await import('../config/database').then(db =>
      db.pool.query(
        'SELECT * FROM digital_twin_objects WHERE id = $1',
        [binding.twinObjectId]
      )
    );

    if (!objectQuery.rows[0]) {
      return;
    }

    const object = objectQuery.rows[0];
    const alertType = this.mapSensorToAlertType(sensorType);

    this.broadcastEvent({
      type: 'sensor_triggered',
      floorId: object.floor_id,
      objectId: binding.twinObjectId,
      data: { sensorType, title, description },
      timestamp: new Date(),
    });

    // Create spatial alert
    await import('../config/database').then(async (db) => {
      await spatialAlertService.createAlertMarker({
        floorId: object.floor_id,
        twinObjectId: binding.twinObjectId,
        alertType,
        severity,
        title,
        description,
        metadata: { sensorId, sensorType },
      });
    });
  }

  private mapDetectionToAlertType(detectionType: string): AlertType {
    const mapping: Record<string, AlertType> = {
      intrusion: 'intrusion',
      loitering: 'intrusion',
      perimeter_breach: 'intrusion',
      restricted_area: 'unauthorized_access',
      fire_detected: 'fire',
      smoke_detected: 'fire',
      panic_button: 'panic',
      weapon_detected: 'intrusion',
      crowd_density: 'intrusion',
    };

    return mapping[detectionType] || 'intrusion';
  }

  private mapSensorToAlertType(sensorType: string): AlertType {
    const mapping: Record<string, AlertType> = {
      fire_sensor: 'fire',
      smoke_sensor: 'fire',
      panic_button: 'panic',
      motion_sensor: 'intrusion',
      door_sensor: 'door_forced',
      glass_break: 'intrusion',
      temperature: 'fire',
    };

    return mapping[sensorType] || 'sensor_triggered';
  }

  private getStatusColor(status: string): string {
    const colorMap: Record<string, string> = {
      online: '#22c55e',
      offline: '#ef4444',
      recording: '#22c55e',
      not_recording: '#eab308',
      degraded: '#f97316',
      open: '#3b82f6',
      closed: '#22c55e',
      forced: '#ef4444',
      held_open: '#f97316',
      triggered: '#f97316',
      normal: '#22c55e',
      unknown: '#6b7280',
    };

    return colorMap[status] || '#6b7280';
  }

  private broadcastEvent(event: DigitalTwinRealtimeEvent) {
    // Emit to WebSocket handler
    this.emit('digital-twin:event', event);
  }

  // Integrate with existing camera health monitoring
  integrateWithCameraHealth() {
    // This would be called from camera health service
    // Example: cameraHealthService.on('health:change', (cameraId, prev, curr) => ...)
  }

  // Integrate with analytics engine
  integrateWithAnalytics() {
    // This would be called from analytics engine
    // Example: analyticsEngine.on('detection', (detection) => ...)
  }

  // Integrate with access control
  integrateWithAccessControl() {
    // This would be called from access control service
    // Example: accessControlService.on('door:state:change', (doorId, prev, curr) => ...)
  }
}

export default new DigitalTwinEventMapper();
