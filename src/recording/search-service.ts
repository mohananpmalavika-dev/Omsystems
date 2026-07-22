import type { Pool } from "pg";
import type { RecordingSegment } from "../domain/models.js";

export interface SearchFilters {
  cameraId?: string;
  cameraIds?: string[];
  branchId?: string;
  from: string;
  to: string;
  eventType?: string;
  objectClass?: string;
  hasMotion?: boolean;
  hasAIEvents?: boolean;
  minDuration?: number;
  zoneId?: string;
  minConfidence?: number;
  recordingType?: "continuous" | "motion" | "scheduled" | "event" | "manual";
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  type: "motion" | "alert" | "bookmark" | "incident" | "gap" | "legal-hold" | "detection";
  severity?: "info" | "warning" | "critical";
  title: string;
  description?: string;
  referenceId?: string;
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  segments: RecordingSegment[];
  events: TimelineEvent[];
  gaps: Array<{ startTime: string; endTime: string; reason?: string }>;
  timeline: TimelineSegment[];
  total: number;
  recordedSeconds: number;
  requestedSeconds: number;
  coveragePercent: number;
}

export interface TimelineSegment {
  startTime: string;
  endTime: string;
  type: "recording" | "gap";
  status?: "ready" | "moving" | "error";
  hasMotion?: boolean;
  hasEvents?: boolean;
  segmentId?: string;
}

export interface MotionSearchResult {
  id: string;
  cameraId: string;
  segmentId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  confidence: number;
  motionAreaPercent?: number;
  zoneName?: string;
  thumbnail?: string;
}

export interface ObjectSearchResult {
  id: string;
  cameraId: string;
  segmentId?: string;
  detectedAt: string;
  objectClass: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  attributes?: Record<string, unknown>;
  thumbnail?: string;
}

export class RecordingSearchService {
  constructor(private readonly pool: Pool) {}

  /**
   * Search recordings with comprehensive filters
   */
  async searchRecordings(
    tenantId: string,
    filters: SearchFilters,
    options: { limit?: number; offset?: number } = {},
  ): Promise<SearchResult> {
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    // Build the WHERE clause dynamically
    const conditions: string[] = ["rsi.tenant_id = $1"];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    // Time range (required)
    conditions.push(`rsi.started_at >= $${paramIndex}::timestamptz`);
    params.push(filters.from);
    paramIndex++;

    conditions.push(`rsi.ended_at <= $${paramIndex}::timestamptz`);
    params.push(filters.to);
    paramIndex++;

    // Camera filters
    if (filters.cameraId) {
      conditions.push(`rsi.camera_id = $${paramIndex}`);
      params.push(filters.cameraId);
      paramIndex++;
    } else if (filters.cameraIds && filters.cameraIds.length > 0) {
      conditions.push(`rsi.camera_id = ANY($${paramIndex}::uuid[])`);
      params.push(filters.cameraIds);
      paramIndex++;
    } else if (filters.branchId) {
      // Filter by branch - join through cameras
      conditions.push(
        `EXISTS (SELECT 1 FROM cameras c WHERE c.id = rsi.camera_id AND c.branch_id = $${paramIndex})`,
      );
      params.push(filters.branchId);
      paramIndex++;
    }

    // Motion filter
    if (filters.hasMotion !== undefined) {
      conditions.push(`rsi.has_motion = $${paramIndex}`);
      params.push(filters.hasMotion);
      paramIndex++;
    }

    // AI events filter
    if (filters.hasAIEvents !== undefined) {
      conditions.push(`rsi.has_ai_events = $${paramIndex}`);
      params.push(filters.hasAIEvents);
      paramIndex++;
    }

    // Duration filter
    if (filters.minDuration) {
      conditions.push(`rsi.duration_seconds >= $${paramIndex}`);
      params.push(filters.minDuration);
      paramIndex++;
    }

    // Recording type filter
    if (filters.recordingType) {
      conditions.push(`rsi.recording_type = $${paramIndex}`);
      params.push(filters.recordingType);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");

    // Count total matching records
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total,
              SUM(rsi.duration_seconds) as recorded_seconds
       FROM recording_search_index rsi
       WHERE ${whereClause}`,
      params,
    );

    const total = parseInt(countResult.rows[0].total, 10);
    const recordedSeconds = parseInt(countResult.rows[0].recorded_seconds || "0", 10);

    // Get matching segments with details
    const segmentsResult = await this.pool.query(
      `SELECT rs.*, rsi.has_motion, rsi.has_ai_events, rsi.event_count, rsi.object_count
       FROM recording_search_index rsi
       JOIN recording_segments rs ON rs.id = rsi.segment_id
       WHERE ${whereClause}
       ORDER BY rsi.started_at ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );

    const segments = segmentsResult.rows.map(mapSegment);

    // Calculate gaps
    const gaps = this.calculateGaps(segments, filters.from, filters.to);

    // Build timeline
    const timeline = this.buildTimeline(segments, gaps);

    // Calculate coverage
    const requestedMs =
      new Date(filters.to).getTime() - new Date(filters.from).getTime();
    const requestedSeconds = Math.round(requestedMs / 1000);
    const coveragePercent =
      requestedSeconds > 0
        ? Number(Math.min(100, (recordedSeconds / requestedSeconds) * 100).toFixed(2))
        : 0;

    // Get timeline events (motion, alerts, bookmarks) for visualization
    const events = await this.getTimelineEvents(
      tenantId,
      filters.cameraId || filters.cameraIds?.[0],
      filters.from,
      filters.to,
    );

    return {
      segments,
      events,
      gaps,
      timeline,
      total,
      recordedSeconds,
      requestedSeconds,
      coveragePercent,
    };
  }

  /**
   * Search by motion events
   */
  async searchByMotion(
    tenantId: string,
    filters: {
      cameraId?: string;
      from: string;
      to: string;
      minDuration?: number;
      minConfidence?: number;
      zoneId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ data: MotionSearchResult[]; total: number }> {
    const conditions: string[] = ["me.tenant_id = $1"];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    conditions.push(`me.started_at >= $${paramIndex}::timestamptz`);
    params.push(filters.from);
    paramIndex++;

    conditions.push(`me.ended_at <= $${paramIndex}::timestamptz`);
    params.push(filters.to);
    paramIndex++;

    if (filters.cameraId) {
      conditions.push(`me.camera_id = $${paramIndex}`);
      params.push(filters.cameraId);
      paramIndex++;
    }

    if (filters.minDuration) {
      conditions.push(`me.duration_seconds >= $${paramIndex}`);
      params.push(filters.minDuration);
      paramIndex++;
    }

    if (filters.minConfidence) {
      conditions.push(`me.confidence >= $${paramIndex}`);
      params.push(filters.minConfidence);
      paramIndex++;
    }

    if (filters.zoneId) {
      conditions.push(`me.zone_id = $${paramIndex}`);
      params.push(filters.zoneId);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");

    // Count total
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM motion_events me WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get results
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const result = await this.pool.query(
      `SELECT me.* FROM motion_events me
       WHERE ${whereClause}
       ORDER BY me.started_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );

    const data = result.rows.map((row) => ({
      id: row.id,
      cameraId: row.camera_id,
      segmentId: row.segment_id,
      startedAt: new Date(row.started_at).toISOString(),
      endedAt: new Date(row.ended_at).toISOString(),
      durationSeconds: row.duration_seconds,
      confidence: parseFloat(row.confidence),
      motionAreaPercent: row.motion_area_percent
        ? parseFloat(row.motion_area_percent)
        : undefined,
      zoneName: row.zone_name,
    }));

    return { data, total };
  }

  /**
   * Search by detected objects (person, vehicle, etc.)
   */
  async searchByObject(
    tenantId: string,
    filters: {
      cameraId?: string;
      from: string;
      to: string;
      objectClass?: string;
      minConfidence?: number;
      zoneId?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ data: ObjectSearchResult[]; total: number }> {
    const conditions: string[] = ["do.tenant_id = $1"];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    conditions.push(`do.detected_at >= $${paramIndex}::timestamptz`);
    params.push(filters.from);
    paramIndex++;

    conditions.push(`do.detected_at <= $${paramIndex}::timestamptz`);
    params.push(filters.to);
    paramIndex++;

    if (filters.cameraId) {
      conditions.push(`do.camera_id = $${paramIndex}`);
      params.push(filters.cameraId);
      paramIndex++;
    }

    if (filters.objectClass) {
      conditions.push(`do.object_class = $${paramIndex}`);
      params.push(filters.objectClass);
      paramIndex++;
    }

    if (filters.minConfidence) {
      conditions.push(`do.confidence >= $${paramIndex}`);
      params.push(filters.minConfidence);
      paramIndex++;
    }

    if (filters.zoneId) {
      conditions.push(`do.zone_id = $${paramIndex}`);
      params.push(filters.zoneId);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");

    // Count total
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM detected_objects do WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get results
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const result = await this.pool.query(
      `SELECT do.* FROM detected_objects do
       WHERE ${whereClause}
       ORDER BY do.detected_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );

    const data = result.rows.map((row) => ({
      id: row.id,
      cameraId: row.camera_id,
      segmentId: row.segment_id,
      detectedAt: new Date(row.detected_at).toISOString(),
      objectClass: row.object_class,
      confidence: parseFloat(row.confidence),
      boundingBox: row.bounding_box,
      attributes: row.attributes,
      thumbnail: row.thumbnail_path,
    }));

    return { data, total };
  }

  /**
   * Get timeline events for visualization
   */
  async getTimelineEvents(
    tenantId: string,
    cameraId: string | undefined,
    from: string,
    to: string,
  ): Promise<TimelineEvent[]> {
    if (!cameraId) return [];

    const result = await this.pool.query(
      `SELECT * FROM timeline_markers
       WHERE tenant_id = $1 AND camera_id = $2
       AND timestamp >= $3::timestamptz AND timestamp <= $4::timestamptz
       ORDER BY timestamp ASC
       LIMIT 200`,
      [tenantId, cameraId, from, to],
    );

    return result.rows.map((row) => ({
      id: row.id,
      timestamp: new Date(row.timestamp).toISOString(),
      type: row.marker_type,
      severity: row.severity,
      title: row.title,
      description: row.description,
      referenceId: row.reference_id,
      color: row.color,
    }));
  }

  /**
   * Calculate gaps between segments
   */
  private calculateGaps(
    segments: RecordingSegment[],
    from: string,
    to: string,
    gapToleranceSeconds = 2,
  ): Array<{ startTime: string; endTime: string; reason?: string }> {
    const gaps: Array<{ startTime: string; endTime: string; reason?: string }> = [];
    const toleranceMs = gapToleranceSeconds * 1000;
    const startBoundary = new Date(from).getTime();
    const endBoundary = new Date(to).getTime();

    // Only consider ready segments
    const readySegments = segments
      .filter((s) => s.status === "ready")
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

    if (readySegments.length === 0) {
      // Entire period is a gap
      return [
        {
          startTime: from,
          endTime: to,
          reason: "No recordings found",
        },
      ];
    }

    let cursor = startBoundary;

    for (const segment of readySegments) {
      const segmentStart = new Date(segment.startedAt).getTime();
      const segmentEnd = new Date(segment.endedAt).getTime();

      // Gap before this segment
      if (segmentStart > cursor + toleranceMs) {
        gaps.push({
          startTime: new Date(cursor).toISOString(),
          endTime: new Date(segmentStart).toISOString(),
          reason: "Recording gap",
        });
      }

      cursor = Math.max(cursor, segmentEnd);
    }

    // Gap at the end
    if (cursor < endBoundary - toleranceMs) {
      gaps.push({
        startTime: new Date(cursor).toISOString(),
        endTime: new Date(endBoundary).toISOString(),
        reason: "Recording gap",
      });
    }

    return gaps;
  }

  /**
   * Build timeline visualization data
   */
  private buildTimeline(
    segments: RecordingSegment[],
    gaps: Array<{ startTime: string; endTime: string }>,
  ): TimelineSegment[] {
    const timeline: TimelineSegment[] = [];

    // Sort segments
    const sortedSegments = [...segments].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );

    // Interleave segments and gaps
    for (let i = 0; i < sortedSegments.length; i++) {
      const segment = sortedSegments[i]!;

      // Add segment
      timeline.push({
        startTime: segment.startedAt,
        endTime: segment.endedAt,
        type: "recording",
        status: segment.status,
        segmentId: segment.id,
      });
    }

    // Add gaps
    for (const gap of gaps) {
      timeline.push({
        startTime: gap.startTime,
        endTime: gap.endTime,
        type: "gap",
      });
    }

    // Sort by start time
    timeline.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    return timeline;
  }

  /**
   * Get available object classes for filtering
   */
  async getAvailableObjectClasses(
    tenantId: string,
    cameraId?: string,
  ): Promise<Array<{ objectClass: string; count: number }>> {
    const result = await this.pool.query(
      `SELECT object_class, COUNT(*) as count
       FROM detected_objects
       WHERE tenant_id = $1 ${cameraId ? "AND camera_id = $2" : ""}
       GROUP BY object_class
       ORDER BY count DESC
       LIMIT 20`,
      cameraId ? [tenantId, cameraId] : [tenantId],
    );

    return result.rows.map((row) => ({
      objectClass: row.object_class,
      count: parseInt(row.count, 10),
    }));
  }

  /**
   * Get recording statistics for a camera or branch
   */
  async getRecordingStatistics(
    tenantId: string,
    filters: { cameraId?: string; branchId?: string; from: string; to: string },
  ): Promise<{
    totalSegments: number;
    totalBytes: number;
    totalSeconds: number;
    motionEvents: number;
    aiDetections: number;
    coveragePercent: number;
  }> {
    const conditions: string[] = ["rsi.tenant_id = $1"];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    conditions.push(`rsi.started_at >= $${paramIndex}::timestamptz`);
    params.push(filters.from);
    paramIndex++;

    conditions.push(`rsi.ended_at <= $${paramIndex}::timestamptz`);
    params.push(filters.to);
    paramIndex++;

    if (filters.cameraId) {
      conditions.push(`rsi.camera_id = $${paramIndex}`);
      params.push(filters.cameraId);
      paramIndex++;
    } else if (filters.branchId) {
      conditions.push(
        `EXISTS (SELECT 1 FROM cameras c WHERE c.id = rsi.camera_id AND c.branch_id = $${paramIndex})`,
      );
      params.push(filters.branchId);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");

    const result = await this.pool.query(
      `SELECT 
         COUNT(DISTINCT rsi.segment_id) as total_segments,
         SUM(rs.size_bytes) as total_bytes,
         SUM(rsi.duration_seconds) as total_seconds,
         SUM(CASE WHEN rsi.has_motion THEN 1 ELSE 0 END) as motion_segments,
         SUM(rsi.event_count) as total_events,
         SUM(rsi.object_count) as total_objects
       FROM recording_search_index rsi
       JOIN recording_segments rs ON rs.id = rsi.segment_id
       WHERE ${whereClause}`,
      params,
    );

    const row = result.rows[0];
    const requestedMs =
      new Date(filters.to).getTime() - new Date(filters.from).getTime();
    const requestedSeconds = Math.round(requestedMs / 1000);
    const totalSeconds = parseInt(row.total_seconds || "0", 10);

    return {
      totalSegments: parseInt(row.total_segments || "0", 10),
      totalBytes: parseInt(row.total_bytes || "0", 10),
      totalSeconds,
      motionEvents: parseInt(row.motion_segments || "0", 10),
      aiDetections: parseInt(row.total_objects || "0", 10),
      coveragePercent:
        requestedSeconds > 0
          ? Number(Math.min(100, (totalSeconds / requestedSeconds) * 100).toFixed(2))
          : 0,
    };
  }
}

function mapSegment(row: any): RecordingSegment {
  return {
    id: row.id,
    cameraId: row.camera_id,
    jobId: row.job_id,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: new Date(row.ended_at).toISOString(),
    storagePath: row.storage_path,
    sizeBytes: Number(row.size_bytes),
    storageNodeExternalId: row.storage_node_external_id,
    storageTier: row.storage_tier,
    status: row.status,
    checksumSha256: row.checksum_sha256 ?? undefined,
    codec: row.codec ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
