/**
 * Camera Field-of-View Service
 * Calculates camera coverage areas and blind spots
 */

import { pool } from '../config/database';
import { NormalizedPosition, DigitalTwinCameraView } from '../types/digital-twin';

export class CameraFOVService {
  // Calculate field-of-view polygon for a camera
  async calculateCameraView(
    cameraObjectId: string,
    floorId: string
  ): Promise<DigitalTwinCameraView> {
    // Get camera object details
    const cameraResult = await pool.query(
      'SELECT * FROM digital_twin_objects WHERE id = $1',
      [cameraObjectId]
    );

    if (!cameraResult.rows[0]) {
      throw new Error('Camera object not found');
    }

    const camera = cameraResult.rows[0];
    const fieldOfView = camera.field_of_view || 90; // degrees
    const viewingDistance = camera.viewing_distance || 20; // meters
    const rotation = camera.rotation || 0; // degrees

    // Calculate FOV polygon
    const coveragePolygon = this.calculateFOVPolygon(
      { x: camera.position_x, y: camera.position_y },
      rotation,
      fieldOfView,
      viewingDistance
    );

    // Check for obstacles and calculate blind spots
    const blindSpots = await this.calculateBlindSpots(
      floorId,
      coveragePolygon
    );

    // Find overlapping cameras
    const overlappingCameras = await this.findOverlappingCameras(
      floorId,
      cameraObjectId,
      coveragePolygon
    );

    // Calculate coverage quality based on distance
    const detectionQuality = this.calculateDetectionQuality(viewingDistance);
    const identificationQuality = this.calculateIdentificationQuality(viewingDistance);

    // Calculate coverage percentage
    const coveragePercentage = this.calculateCoveragePercentage(
      coveragePolygon,
      blindSpots
    );

    // Save to database
    const existing = await pool.query(
      'SELECT id FROM digital_twin_camera_views WHERE twin_object_id = $1',
      [cameraObjectId]
    );

    let result;
    if (existing.rows[0]) {
      result = await pool.query(
        `UPDATE digital_twin_camera_views 
         SET coverage_polygon = $1,
             blind_spots = $2,
             coverage_percentage = $3,
             overlapping_cameras = $4,
             detection_quality = $5,
             identification_quality = $6,
             last_calculated = CURRENT_TIMESTAMP
         WHERE twin_object_id = $7
         RETURNING *`,
        [
          JSON.stringify(coveragePolygon),
          JSON.stringify(blindSpots),
          coveragePercentage,
          JSON.stringify(overlappingCameras),
          detectionQuality,
          identificationQuality,
          cameraObjectId,
        ]
      );
    } else {
      result = await pool.query(
        `INSERT INTO digital_twin_camera_views 
         (twin_object_id, floor_id, coverage_polygon, blind_spots, coverage_percentage,
          overlapping_cameras, detection_quality, identification_quality, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          cameraObjectId,
          floorId,
          JSON.stringify(coveragePolygon),
          JSON.stringify(blindSpots),
          coveragePercentage,
          JSON.stringify(overlappingCameras),
          detectionQuality,
          identificationQuality,
          JSON.stringify({}),
        ]
      );
    }

    return this.mapCameraView(result.rows[0]);
  }

  // Calculate FOV polygon based on camera position and parameters
  private calculateFOVPolygon(
    position: NormalizedPosition,
    rotation: number,
    fov: number,
    distance: number
  ): NormalizedPosition[] {
    const polygon: NormalizedPosition[] = [];

    // Camera position is the apex
    polygon.push(position);

    // Calculate viewing distance in normalized coordinates
    // Assuming 0.01 meters per normalized unit (adjust based on floor plan scale)
    const normalizedDistance = distance * 0.001;

    // Convert rotation to radians
    const rotationRad = (rotation * Math.PI) / 180;
    const fovRad = (fov * Math.PI) / 180;

    // Calculate left and right edges of FOV
    const startAngle = rotationRad - fovRad / 2;
    const endAngle = rotationRad + fovRad / 2;

    // Generate arc points
    const steps = 20; // Number of points along the arc
    for (let i = 0; i <= steps; i++) {
      const angle = startAngle + (endAngle - startAngle) * (i / steps);
      const x = position.x + Math.cos(angle) * normalizedDistance;
      const y = position.y + Math.sin(angle) * normalizedDistance;
      polygon.push({ x, y });
    }

    // Close the polygon
    polygon.push(position);

    return polygon;
  }

  // Calculate blind spots based on obstacles
  private async calculateBlindSpots(
    floorId: string,
    coveragePolygon: NormalizedPosition[]
  ): Promise<NormalizedPosition[][]> {
    // Get zones that might obstruct view (walls, columns, etc.)
    const obstacleResult = await pool.query(
      `SELECT vertices FROM digital_twin_zones 
       WHERE floor_id = $1 AND zone_type = 'obstacle'`,
      [floorId]
    );

    const blindSpots: NormalizedPosition[][] = [];

    // For each obstacle, calculate shadow/blind spot
    obstacleResult.rows.forEach((row: any) => {
      const obstacle = row.vertices;
      // Calculate blind spot polygon behind obstacle
      // Simplified: just return the obstacle polygon for now
      blindSpots.push(obstacle);
    });

    return blindSpots;
  }

  // Find cameras with overlapping coverage
  private async findOverlappingCameras(
    floorId: string,
    excludeCameraId: string,
    coveragePolygon: NormalizedPosition[]
  ): Promise<string[]> {
    const result = await pool.query(
      `SELECT dtcv.twin_object_id, dtcv.coverage_polygon
       FROM digital_twin_camera_views dtcv
       JOIN digital_twin_objects dto ON dtcv.twin_object_id = dto.id
       WHERE dto.floor_id = $1 
         AND dtcv.twin_object_id != $2
         AND dto.object_type = 'camera'`,
      [floorId, excludeCameraId]
    );

    const overlapping: string[] = [];

    result.rows.forEach((row: any) => {
      const otherPolygon = row.coverage_polygon;
      if (this.polygonsOverlap(coveragePolygon, otherPolygon)) {
        overlapping.push(row.twin_object_id);
      }
    });

    return overlapping;
  }

  // Check if two polygons overlap
  private polygonsOverlap(poly1: NormalizedPosition[], poly2: NormalizedPosition[]): boolean {
    // Simplified overlap detection: check if any point of poly1 is inside poly2
    for (const point of poly1) {
      if (this.pointInPolygon(point, poly2)) {
        return true;
      }
    }

    // Check if any point of poly2 is inside poly1
    for (const point of poly2) {
      if (this.pointInPolygon(point, poly1)) {
        return true;
      }
    }

    return false;
  }

  // Point-in-polygon test (ray casting algorithm)
  private pointInPolygon(point: NormalizedPosition, polygon: NormalizedPosition[]): boolean {
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }

  // Calculate detection quality based on distance
  private calculateDetectionQuality(distance: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (distance <= 10) return 'excellent';
    if (distance <= 20) return 'good';
    if (distance <= 30) return 'fair';
    return 'poor';
  }

  // Calculate identification quality based on distance
  private calculateIdentificationQuality(distance: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (distance <= 5) return 'excellent';
    if (distance <= 10) return 'good';
    if (distance <= 15) return 'fair';
    return 'poor';
  }

  // Calculate coverage percentage
  private calculateCoveragePercentage(
    coveragePolygon: NormalizedPosition[],
    blindSpots: NormalizedPosition[][]
  ): number {
    const coverageArea = this.calculatePolygonArea(coveragePolygon);
    let blindSpotArea = 0;

    blindSpots.forEach(spot => {
      blindSpotArea += this.calculatePolygonArea(spot);
    });

    const effectiveCoverage = Math.max(0, coverageArea - blindSpotArea);
    return (effectiveCoverage / coverageArea) * 100;
  }

  // Calculate polygon area using Shoelace formula
  private calculatePolygonArea(polygon: NormalizedPosition[]): number {
    let area = 0;
    
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      area += polygon[i].x * polygon[j].y;
      area -= polygon[j].x * polygon[i].y;
    }
    
    return Math.abs(area / 2);
  }

  // Generate coverage report for entire floor
  async generateFloorCoverageReport(floorId: string): Promise<{
    totalArea: number;
    coveredArea: number;
    coveragePercentage: number;
    blindSpots: NormalizedPosition[][];
    recommendations: string[];
  }> {
    // Get all cameras on floor
    const cameras = await pool.query(
      `SELECT id FROM digital_twin_objects 
       WHERE floor_id = $1 AND object_type = 'camera'`,
      [floorId]
    );

    // Calculate coverage for each camera
    const coverageAreas: NormalizedPosition[][] = [];
    const allBlindSpots: NormalizedPosition[][] = [];

    for (const camera of cameras.rows) {
      const view = await this.calculateCameraView(camera.id, floorId);
      coverageAreas.push(view.coveragePolygon);
      allBlindSpots.push(...view.blindSpots);
    }

    // Calculate total coverage (union of all coverage areas)
    const totalArea = 1.0; // Normalized floor area
    let coveredArea = 0;

    // Simplified: sum all coverage areas (should use polygon union)
    coverageAreas.forEach(area => {
      coveredArea += this.calculatePolygonArea(area);
    });

    const coveragePercentage = Math.min(100, (coveredArea / totalArea) * 100);

    // Generate recommendations
    const recommendations: string[] = [];
    if (coveragePercentage < 70) {
      recommendations.push('Add more cameras to increase coverage');
    }
    if (allBlindSpots.length > 5) {
      recommendations.push('Review camera positions to reduce blind spots');
    }
    if (cameras.rows.length < 3) {
      recommendations.push('Consider adding cameras for redundancy');
    }

    return {
      totalArea,
      coveredArea,
      coveragePercentage,
      blindSpots: allBlindSpots,
      recommendations,
    };
  }

  private mapCameraView(row: any): DigitalTwinCameraView {
    return {
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
    };
  }
}

export default new CameraFOVService();
