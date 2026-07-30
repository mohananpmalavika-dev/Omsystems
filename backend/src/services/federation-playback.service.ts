/**
 * Federation Playback Service
 * Provides seamless cross-server video playback with unified timeline
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { getFederationManager } from './federation-manager.service.js';

export interface PlaybackSegment {
  serverId: string;
  serverName: string;
  serverUrl: string;
  cameraId: string;
  cameraName: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  storageNodeId: string;
  segmentPath: string;
  streamUrl: string;
  sizeBytes: number;
}

export interface CrossServerTimeline {
  cameraId: string;
  timeRange: {
    from: Date;
    to: Date;
  };
  segments: PlaybackSegment[];
  totalDuration: number;
  gaps: Array<{
    from: Date;
    to: Date;
    duration: number;
    reason: string;
  }>;
}

export interface MultiCameraPlayback {
  cameras: Array<{
    cameraId: string;
    cameraName: string;
    serverId: string;
    timeline: CrossServerTimeline;
  }>;
  synchronizedStartTime: Date;
  totalDuration: number;
}

export class FederationPlaybackService {
  private pool: Pool;
  private federationManager: ReturnType<typeof getFederationManager>;

  constructor(pool: Pool) {
    this.pool = pool;
    this.federationManager = getFederationManager(pool);
  }

  /**
   * Build cross-server playback timeline for a camera
   */
  async buildCrossServerTimeline(
    tenantId: string,
    cameraId: string,
    timeRange: { from: Date; to: Date }
  ): Promise<CrossServerTimeline> {
    try {
      // Find which server(s) have recordings for this camera
      const segments = await this.findRecordingSegments(
        tenantId,
        cameraId,
        timeRange
      );

      if (segments.length === 0) {
        return {
          cameraId,
          timeRange,
          segments: [],
          totalDuration: 0,
          gaps: [{
            from: timeRange.from,
            to: timeRange.to,
            duration: timeRange.to.getTime() - timeRange.from.getTime(),
            reason: 'No recordings found'
          }]
        };
      }

      // Sort segments by time
      segments.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

      // Calculate total duration
      const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);

      // Identify gaps in coverage
      const gaps = this.identifyGaps(segments, timeRange);

      logger.info('Cross-server timeline built', {
        cameraId,
        segments: segments.length,
        gaps: gaps.length,
        totalDuration
      });

      return {
        cameraId,
        timeRange,
        segments,
        totalDuration,
        gaps
      };

    } catch (error) {
      logger.error('Failed to build cross-server timeline', {
        cameraId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Build synchronized multi-camera playback
   */
  async buildMultiCameraPlayback(
    tenantId: string,
    cameraIds: string[],
    timeRange: { from: Date; to: Date }
  ): Promise<MultiCameraPlayback> {
    try {
      // Build timeline for each camera
      const cameraTimelines = await Promise.all(
        cameraIds.map(async (cameraId) => {
          const timeline = await this.buildCrossServerTimeline(
            tenantId,
            cameraId,
            timeRange
          );

          // Get camera details
          const cameraInfo = await this.getCameraInfo(cameraId);

          return {
            cameraId,
            cameraName: cameraInfo?.name || cameraId,
            serverId: cameraInfo?.serverId || 'unknown',
            timeline
          };
        })
      );

      // Find the earliest start time and latest end time
      const allSegments = cameraTimelines.flatMap(ct => ct.timeline.segments);
      const synchronizedStartTime = timeRange.from;
      
      const totalDuration = timeRange.to.getTime() - timeRange.from.getTime();

      logger.info('Multi-camera playback built', {
        cameras: cameraIds.length,
        totalDuration
      });

      return {
        cameras: cameraTimelines,
        synchronizedStartTime,
        totalDuration
      };

    } catch (error) {
      logger.error('Failed to build multi-camera playback', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get playback stream URL for a segment
   */
  async getStreamUrl(
    serverId: string,
    cameraId: string,
    segmentPath: string,
    token: string
  ): Promise<string> {
    const server = await this.federationManager.getServerById(serverId);
    
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    // Build stream URL with federation token
    const streamUrl = new URL(`/v1/playback/stream`, server.baseUrl);
    streamUrl.searchParams.set('camera', cameraId);
    streamUrl.searchParams.set('segment', segmentPath);
    streamUrl.searchParams.set('token', token);

    return streamUrl.toString();
  }

  /**
   * Find recording segments across all servers
   */
  private async findRecordingSegments(
    tenantId: string,
    cameraId: string,
    timeRange: { from: Date; to: Date }
  ): Promise<PlaybackSegment[]> {
    // Query local database for recording metadata
    // In a real implementation, this would query each federated server
    const result = await this.pool.query(
      `SELECT 
        'local'::text as server_id,
        'Local Server' as server_name,
        rs.id::text as segment_id,
        rs.camera_id::text,
        rs.started_at,
        rs.ended_at,
        EXTRACT(EPOCH FROM (rs.ended_at - rs.started_at)) as duration,
        rs.storage_node_external_id,
        rs.storage_path,
        rs.size_bytes
       FROM recording_segments rs
       WHERE rs.camera_id = $1::uuid
         AND rs.started_at < $3
         AND rs.ended_at > $2
         AND rs.status = 'ready'
       ORDER BY rs.started_at`,
      [cameraId, timeRange.from, timeRange.to]
    );

    return result.rows.map(row => ({
      serverId: row.server_id,
      serverName: row.server_name,
      serverUrl: 'http://localhost:8080', // Placeholder
      cameraId: row.camera_id,
      cameraName: '',
      startTime: row.started_at,
      endTime: row.ended_at,
      duration: parseFloat(row.duration) * 1000, // Convert to ms
      storageNodeId: row.storage_node_external_id,
      segmentPath: row.storage_path,
      streamUrl: '',
      sizeBytes: parseInt(row.size_bytes) || 0
    }));
  }

  /**
   * Identify gaps in recording coverage
   */
  private identifyGaps(
    segments: PlaybackSegment[],
    timeRange: { from: Date; to: Date }
  ): Array<{ from: Date; to: Date; duration: number; reason: string }> {
    const gaps: Array<{ from: Date; to: Date; duration: number; reason: string }> = [];

    // Check gap before first segment
    if (segments.length > 0 && segments[0].startTime > timeRange.from) {
      gaps.push({
        from: timeRange.from,
        to: segments[0].startTime,
        duration: segments[0].startTime.getTime() - timeRange.from.getTime(),
        reason: 'No recording before first segment'
      });
    }

    // Check gaps between segments
    for (let i = 0; i < segments.length - 1; i++) {
      const currentEnd = segments[i].endTime;
      const nextStart = segments[i + 1].startTime;

      if (nextStart.getTime() - currentEnd.getTime() > 1000) { // More than 1 second gap
        gaps.push({
          from: currentEnd,
          to: nextStart,
          duration: nextStart.getTime() - currentEnd.getTime(),
          reason: 'Gap between segments'
        });
      }
    }

    // Check gap after last segment
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment.endTime < timeRange.to) {
      gaps.push({
        from: lastSegment.endTime,
        to: timeRange.to,
        duration: timeRange.to.getTime() - lastSegment.endTime.getTime(),
        reason: 'No recording after last segment'
      });
    }

    return gaps;
  }

  /**
   * Get camera information
   */
  private async getCameraInfo(cameraId: string): Promise<any | null> {
    const result = await this.pool.query(
      `SELECT 
        c.id::text,
        rn.name,
        'local'::text as server_id
       FROM cameras c
       JOIN resource_nodes rn ON rn.id = c.resource_node_id
       WHERE c.id = $1::uuid`,
      [cameraId]
    );

    return result.rows[0] || null;
  }
}

// Singleton instance
let federationPlaybackService: FederationPlaybackService | null = null;

export function getFederationPlaybackService(pool: Pool): FederationPlaybackService {
  if (!federationPlaybackService) {
    federationPlaybackService = new FederationPlaybackService(pool);
  }
  return federationPlaybackService;
}
