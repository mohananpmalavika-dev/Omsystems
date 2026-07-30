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
