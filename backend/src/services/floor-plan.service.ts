/**
 * Floor Plan Service
 * Manages floor plan uploads, versioning, and transformations
 */

import { pool } from '../config/database';
import {
  DigitalTwinFloorPlan,
  UploadFloorPlanRequest,
  FloorPlanFileType,
} from '../types/digital-twin';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class FloorPlanService {
  private uploadDir = process.env.FLOOR_PLAN_UPLOAD_DIR || './uploads/floor-plans';

  constructor() {
    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFloorPlan(
    request: UploadFloorPlanRequest,
    fileBuffer: Buffer,
    originalFilename: string,
    userId: string
  ): Promise<DigitalTwinFloorPlan> {
    // Get current version
    const versionResult = await pool.query(
      'SELECT COALESCE(MAX(version), 0) as max_version FROM digital_twin_floor_plans WHERE floor_id = $1',
      [request.floorId]
    );
    const nextVersion = versionResult.rows[0].max_version + 1;

    // Generate unique filename
    const fileExtension = path.extname(originalFilename);
    const filename = `${request.floorId}_v${nextVersion}_${uuidv4()}${fileExtension}`;
    const filePath = path.join(this.uploadDir, filename);

    // Save file
    fs.writeFileSync(filePath, fileBuffer);

    // Get file stats
    const stats = fs.statSync(filePath);

    // Deactivate previous versions
    await pool.query(
      'UPDATE digital_twin_floor_plans SET is_active = false WHERE floor_id = $1',
      [request.floorId]
    );

    // Insert new floor plan
    const result = await pool.query(
      `INSERT INTO digital_twin_floor_plans 
       (floor_id, version, file_url, file_type, file_size_bytes, 
        scale_meters_per_pixel, origin_x, origin_y, rotation_degrees, 
        is_active, metadata, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        request.floorId,
        nextVersion,
        `/floor-plans/${filename}`,
        request.fileType,
        stats.size,
        request.scaleMetersPerPixel,
        request.originX || 0,
        request.originY || 0,
        request.rotationDegrees || 0,
        true,
        JSON.stringify(request.metadata || {}),
        userId,
      ]
    );

    return this.mapFloorPlan(result.rows[0]);
  }

  async getFloorPlan(planId: string): Promise<DigitalTwinFloorPlan | null> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_floor_plans WHERE id = $1',
      [planId]
    );
    
    return result.rows[0] ? this.mapFloorPlan(result.rows[0]) : null;
  }

  async getActiveFloorPlan(floorId: string): Promise<DigitalTwinFloorPlan | null> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_floor_plans WHERE floor_id = $1 AND is_active = true LIMIT 1',
      [floorId]
    );
    
    return result.rows[0] ? this.mapFloorPlan(result.rows[0]) : null;
  }

  async listFloorPlanVersions(floorId: string): Promise<DigitalTwinFloorPlan[]> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_floor_plans WHERE floor_id = $1 ORDER BY version DESC',
      [floorId]
    );
    
    return result.rows.map(this.mapFloorPlan);
  }

  async updateFloorPlanTransform(
    planId: string,
    transform: {
      scaleMetersPerPixel?: number;
      originX?: number;
      originY?: number;
      rotationDegrees?: number;
      widthPixels?: number;
      heightPixels?: number;
    },
    userId: string
  ): Promise<DigitalTwinFloorPlan> {
    const result = await pool.query(
      `UPDATE digital_twin_floor_plans 
       SET scale_meters_per_pixel = COALESCE($1, scale_meters_per_pixel),
           origin_x = COALESCE($2, origin_x),
           origin_y = COALESCE($3, origin_y),
           rotation_degrees = COALESCE($4, rotation_degrees),
           width_pixels = COALESCE($5, width_pixels),
           height_pixels = COALESCE($6, height_pixels)
       WHERE id = $7
       RETURNING *`,
      [
        transform.scaleMetersPerPixel,
        transform.originX,
        transform.originY,
        transform.rotationDegrees,
        transform.widthPixels,
        transform.heightPixels,
        planId,
      ]
    );

    return this.mapFloorPlan(result.rows[0]);
  }

  async activateFloorPlanVersion(
    planId: string,
    floorId: string,
    userId: string
  ): Promise<DigitalTwinFloorPlan> {
    // Deactivate all versions
    await pool.query(
      'UPDATE digital_twin_floor_plans SET is_active = false WHERE floor_id = $1',
      [floorId]
    );

    // Activate specified version
    const result = await pool.query(
      'UPDATE digital_twin_floor_plans SET is_active = true WHERE id = $1 RETURNING *',
      [planId]
    );

    return this.mapFloorPlan(result.rows[0]);
  }

  async deleteFloorPlan(planId: string, userId: string): Promise<void> {
    const plan = await this.getFloorPlan(planId);
    
    if (plan) {
      // Delete file from filesystem
      const filePath = path.join(this.uploadDir, path.basename(plan.fileUrl));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Delete from database
      await pool.query('DELETE FROM digital_twin_floor_plans WHERE id = $1', [planId]);
    }
  }

  // Convert pixel coordinates to normalized coordinates
  pixelToNormalized(
    pixelX: number,
    pixelY: number,
    imageWidth: number,
    imageHeight: number
  ): { x: number; y: number } {
    return {
      x: pixelX / imageWidth,
      y: pixelY / imageHeight,
    };
  }

  // Convert normalized coordinates to pixel coordinates
  normalizedToPixel(
    normalizedX: number,
    normalizedY: number,
    imageWidth: number,
    imageHeight: number
  ): { x: number; y: number } {
    return {
      x: normalizedX * imageWidth,
      y: normalizedY * imageHeight,
    };
  }

  // Convert normalized coordinates to real-world meters
  normalizedToMeters(
    normalizedX: number,
    normalizedY: number,
    imageWidth: number,
    imageHeight: number,
    scaleMetersPerPixel: number
  ): { x: number; y: number } {
    const pixel = this.normalizedToPixel(normalizedX, normalizedY, imageWidth, imageHeight);
    return {
      x: pixel.x * scaleMetersPerPixel,
      y: pixel.y * scaleMetersPerPixel,
    };
  }

  private mapFloorPlan(row: any): DigitalTwinFloorPlan {
    return {
      id: row.id,
      floorId: row.floor_id,
      version: row.version,
      fileUrl: row.file_url,
      fileType: row.file_type,
      fileSizeBytes: row.file_size_bytes,
      widthPixels: row.width_pixels,
      heightPixels: row.height_pixels,
      scaleMetersPerPixel: row.scale_meters_per_pixel ? parseFloat(row.scale_meters_per_pixel) : undefined,
      originX: parseFloat(row.origin_x),
      originY: parseFloat(row.origin_y),
      rotationDegrees: parseFloat(row.rotation_degrees),
      isActive: row.is_active,
      metadata: row.metadata,
      uploadedBy: row.uploaded_by,
      uploadedAt: row.uploaded_at,
    };
  }
}

export default new FloorPlanService();
