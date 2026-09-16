import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

export interface RoiBox {
  x1: number; // 0.0 - 1.0
  y1: number; // 0.0 - 1.0
  x2: number; // 0.0 - 1.0
  y2: number; // 0.0 - 1.0
}

export interface MotionSearchQuery {
  tenantId: string;
  cameraId: string;
  from: Date;
  to: Date;
  roi: RoiBox;
  minIntensity?: number;
}

export interface MotionHitInterval {
  id: string;
  segmentId: string;
  timestampStart: Date;
  timestampEnd: Date;
  intensityScore: number;
  hitCount: number;
}

export interface IndexMotionGridInput {
  tenantId: string;
  cameraId: string;
  segmentId: string;
  timestampStart: Date;
  timestampEnd: Date;
  gridWidth?: number;
  gridHeight?: number;
  motionBitmask: Buffer;
  intensityScore?: number;
}

export class SmartMotionSearchService {
  constructor(private readonly pool?: Pool) {}

  /**
   * Generates a bitmask Buffer for a given normalized bounding box
   */
  public generateRoiBitmask(roi: RoiBox, gridWidth = 16, gridHeight = 16): Buffer {
    const totalBits = gridWidth * gridHeight;
    const numBytes = Math.ceil(totalBits / 8);
    const buffer = Buffer.alloc(numBytes, 0);

    const minX = Math.max(0, Math.min(gridWidth - 1, Math.floor(roi.x1 * gridWidth)));
    const maxX = Math.max(0, Math.min(gridWidth - 1, Math.floor(roi.x2 * gridWidth)));
    const minY = Math.max(0, Math.min(gridHeight - 1, Math.floor(roi.y1 * gridHeight)));
    const maxY = Math.max(0, Math.min(gridHeight - 1, Math.floor(roi.y2 * gridHeight)));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const bitIndex = y * gridWidth + x;
        const byteIndex = Math.floor(bitIndex / 8);
        const bitOffset = bitIndex % 8;
        const currentByte = buffer[byteIndex] ?? 0;
        buffer[byteIndex] = currentByte | (1 << bitOffset);
      }
    }

    return buffer;
  }

  /**
   * Checks if two bitmasks overlap (logical AND is non-zero)
   */
  public hasBitmaskOverlap(maskA: Buffer, maskB: Buffer): boolean {
    const len = Math.min(maskA.length, maskB.length);
    for (let i = 0; i < len; i++) {
      const a = maskA[i] ?? 0;
      const b = maskB[i] ?? 0;
      if ((a & b) !== 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Stores a motion grid slice in PostgreSQL
   */
  async indexMotionGrid(input: IndexMotionGridInput): Promise<string> {
    const id = randomUUID();
    const gridWidth = input.gridWidth ?? 16;
    const gridHeight = input.gridHeight ?? 16;
    const intensity = input.intensityScore ?? 1.0;

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO recording_motion_grid 
         (id, segment_id, camera_id, tenant_id, timestamp_start, timestamp_end, grid_width, grid_height, motion_bitmask, intensity_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          input.segmentId,
          input.cameraId,
          input.tenantId,
          input.timestampStart,
          input.timestampEnd,
          gridWidth,
          gridHeight,
          input.motionBitmask,
          intensity,
        ]
      );
    }

    return id;
  }

  /**
   * Finds all motion hits intersecting the user's ROI within the specified time range
   */
  async searchRoiMotion(query: MotionSearchQuery): Promise<MotionHitInterval[]> {
    const searchMask = this.generateRoiBitmask(query.roi, 16, 16);

    if (!this.pool) {
      return [];
    }

    const res = await this.pool.query(
      `SELECT id, segment_id, timestamp_start, timestamp_end, motion_bitmask, intensity_score
       FROM recording_motion_grid
       WHERE tenant_id = $1
         AND camera_id = $2
         AND timestamp_end >= $3
         AND timestamp_start <= $4
       ORDER BY timestamp_start ASC`,
      [query.tenantId, query.cameraId, query.from, query.to]
    );

    const hits: MotionHitInterval[] = [];

    for (const row of res.rows) {
      const storedMask: Buffer = Buffer.isBuffer(row.motion_bitmask)
        ? row.motion_bitmask
        : Buffer.from(row.motion_bitmask);

      if (this.hasBitmaskOverlap(storedMask, searchMask)) {
        hits.push({
          id: row.id,
          segmentId: row.segment_id,
          timestampStart: new Date(row.timestamp_start),
          timestampEnd: new Date(row.timestamp_end),
          intensityScore: Number(row.intensity_score ?? 1.0),
          hitCount: 1,
        });
      }
    }

    return hits;
  }
}
