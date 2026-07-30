/**
 * Floor State Service
 * Provides consolidated floor state including objects, zones, alerts, and device statuses
 */

import { pool } from '../config/database';
import { FloorStateResponse } from '../types/digital-twin';
import twinObjectService from './twin-object.service';
import zoneService from './zone.service';
import spatialAlertService from './spatial-alert.service';
import deviceBindingService from './device-binding.service';

export class FloorStateService {
  async getFloorState(floorId: string): Promise<FloorStateResponse> {
    // Get all objects on the floor
    const objects = await twinObjectService.listObjects(floorId);

    // Get device bindings and current statuses
    const objectsWithStatus = await Promise.all(
      objects.map(async (obj) => {
        const binding = await deviceBindingService.getBindingByObject(obj.id);
        
        let currentStatus = null;
        if (binding) {
          currentStatus = await deviceBindingService.getDeviceStatus(binding);
        }

        return {
          ...obj,
          deviceBinding: binding,
          currentStatus,
        };
      })
    );

    // Get zones
    const zones = await zoneService.listZones(floorId);

    // Get active alerts
    const alerts = await spatialAlertService.listActiveAlerts(floorId);

    // Get camera views (if implemented)
    const cameraViews = await this.getCameraViews(floorId);

    return {
      floorId,
      objects: objectsWithStatus,
      zones,
      alerts,
      cameraViews,
      timestamp: new Date(),
    };
  }

  async getCameraViews(floorId: string): Promise<any[]> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_camera_views WHERE floor_id = $1',
      [floorId]
    );

    return result.rows.map(row => ({
      id: row.id,
      twinObjectId: row.twin_object_id,
      floorId: row.floor_id,
      coveragePolygon: row.coverage_polygon,
      blindSpots: row.blind_spots,
      coveragePercentage: row.coverage_percentage ? parseFloat(row.coverage_percentage) : undefined,
      overlappingCameras: row.overlapping_cameras,
      detectionQuality: row.detection_quality,
      identificationQuality: row.identification_quality,
      lastCalculated: row.last_calculated,
      metadata: row.metadata,
    }));
  }

  async getMultiFloorState(buildingId: string): Promise<Record<string, FloorStateResponse>> {
    // Get all floors in building
    const floorsResult = await pool.query(
      'SELECT id FROM digital_twin_floors WHERE building_id = $1 ORDER BY floor_number',
      [buildingId]
    );

    const states: Record<string, FloorStateResponse> = {};

    for (const floor of floorsResult.rows) {
      states[floor.id] = await this.getFloorState(floor.id);
    }

    return states;
  }
}

export default new FloorStateService();
