/**
 * Video Search Integration Pipeline
 * 
 * Provides end-to-end integration for video search including:
 * - Real-time video metadata indexing
 * - Automatic embedding generation
 * - Cross-camera tracking automation
 * - Search result enrichment
 * - Performance monitoring
 */

import type { Pool } from "pg";
import { AIVideoSearchService, type VideoObject, type VideoObjectAttributes } from "./ai-video-search.js";

export interface VideoIndexingJob {
  id: string;
  tenantId: string;
  cameraId: string;
  segmentId: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoPath: string;
  startTime: string;
  endTime: string;
  priority: number;
  retryCount: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface IndexingResult {
  success: boolean;
  objectsIndexed: number;
  embeddingsGenerated: number;
  trackingIdsAssigned: number;
  processingTimeMs: number;
  error?: string;
}

export interface SearchEnrichment {
  detectionQuality: "high" | "medium" | "low";
  contextualInfo: {
    timeOfDay: string;
    lightingCondition: string;
    crowdDensity: string;
    weatherHint?: string;
  };
  similarDetections: number;
  trackingConfidence?: number;
}

export class VideoSearchIntegrationPipeline {
  private aiVideoSearch: AIVideoSearchService;
  private isProcessing = false;
  private processingInterval?: NodeJS.Timeout;

  constructor(private pool: Pool) {
    this.aiVideoSearch = new AIVideoSearchService(pool);
  }

  /**
   * Start the integration pipeline
   */
  start(intervalMs: number = 5000): void {
    if (this.isProcessing) {
      console.warn("Video search integration pipeline already running");
      return;
    }

    this.isProcessing = true;
    console.log("Starting video search integration pipeline");

    // Process indexing queue periodically
    this.processingInterval = setInterval(() => {
      void this.processIndexingQueue().catch((error) => {
        console.error("Error processing indexing queue:", error);
      });
    }, intervalMs);
  }

  /**
   * Stop the integration pipeline
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    this.isProcessing = false;
    console.log("Stopped video search integration pipeline");
  }

  /**
   * Index video segment with objects (Full Pipeline)
   */
  async indexVideoSegment(input: {
    tenantId: string;
    cameraId: string;
    segmentId: string;
    videoPath: string;
    startTime: string;
    endTime: string;
    objects: VideoObject[];
    metadata?: {
      branchId?: string;
      sceneType?: string;
      lightingCondition?: "day" | "night" | "dawn" | "dusk";
      weatherCondition?: string;
      crowdDensity?: "empty" | "sparse" | "moderate" | "crowded";
    };
    generateEmbeddings?: boolean;
    enableCrossCameraTracking?: boolean;
  }): Promise<IndexingResult> {
    const startTime = Date.now();
    let objectsIndexed = 0;
    let embeddingsGenerated = 0;
    let trackingIdsAssigned = 0;

    try {
      // Step 1: Generate embeddings for objects if requested
      if (input.generateEmbeddings) {
        for (const obj of input.objects) {
          try {
            // Generate embedding from video frame
            const embedding = await this.aiVideoSearch.generateEmbedding(
              input.videoPath,
              obj.boundingBoxes[0] // Use first bounding box
            );
            obj.embedding = embedding;
            embeddingsGenerated++;
          } catch (error) {
            console.warn(`Failed to generate embedding for object ${obj.objectId}:`, error);
            // Generate from attributes as fallback
            obj.embedding = await this.aiVideoSearch.generateAttributeEmbedding(obj.attributes);
          }
        }
      }

      // Step 2: Index video metadata with objects
      await this.aiVideoSearch.indexVideoMetadata(
        input.tenantId,
        input.cameraId,
        input.segmentId,
        input.objects,
        {
          startTime: input.startTime,
          endTime: input.endTime,
          branchId: input.metadata?.branchId,
          sceneType: input.metadata?.sceneType,
          lightingCondition: input.metadata?.lightingCondition,
          weatherCondition: input.metadata?.weatherCondition,
          crowdDensity: input.metadata?.crowdDensity,
        }
      );
      objectsIndexed = input.objects.length;

      // Step 3: Attempt cross-camera tracking if enabled
      if (input.enableCrossCameraTracking && input.objects.length > 0) {
        for (const obj of input.objects) {
          try {
            const track = await this.aiVideoSearch.trackAcrossCameras(
              input.tenantId,
              obj.objectId,
              input.startTime,
              30 // 30 minute window
            );
            if (track) {
              trackingIdsAssigned++;
            }
          } catch (error) {
            console.warn(`Cross-camera tracking failed for object ${obj.objectId}:`, error);
          }
        }
      }

      const processingTimeMs = Date.now() - startTime;

      return {
        success: true,
        objectsIndexed,
        embeddingsGenerated,
        trackingIdsAssigned,
        processingTimeMs,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      return {
        success: false,
        objectsIndexed,
        embeddingsGenerated,
        trackingIdsAssigned,
        processingTimeMs,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Enrich search results with additional context
   */
  async enrichSearchResults(
    tenantId: string,
    results: any[]
  ): Promise<Array<any & { enrichment: SearchEnrichment }>> {
    const enrichedResults = [];

    for (const result of results) {
      const enrichment = await this.calculateEnrichment(tenantId, result);
      enrichedResults.push({
        ...result,
        enrichment,
      });
    }

    return enrichedResults;
  }

  /**
   * Calculate enrichment data for a search result
   */
  private async calculateEnrichment(
    tenantId: string,
    result: any
  ): Promise<SearchEnrichment> {
    // Determine detection quality
    let detectionQuality: "high" | "medium" | "low" = "low";
    if (result.score >= 0.8 && result.object.confidence >= 0.8) {
      detectionQuality = "high";
    } else if (result.score >= 0.6 && result.object.confidence >= 0.6) {
      detectionQuality = "medium";
    }

    // Derive contextual info from timestamp
    const timestamp = new Date(result.timestamp);
    const hour = timestamp.getHours();
    
    let timeOfDay: string;
    let lightingCondition: string;
    
    if (hour >= 6 && hour < 12) {
      timeOfDay = "morning";
      lightingCondition = "day";
    } else if (hour >= 12 && hour < 18) {
      timeOfDay = "afternoon";
      lightingCondition = "day";
    } else if (hour >= 18 && hour < 21) {
      timeOfDay = "evening";
      lightingCondition = "dusk";
    } else {
      timeOfDay = "night";
      lightingCondition = "night";
    }

    // Count similar detections
    let similarDetections = 0;
    if (result.object.embedding) {
      try {
        const similar = await this.aiVideoSearch.searchBySimilarity(
          tenantId,
          result.object.embedding,
          {
            objectType: result.object.objectType,
            threshold: 0.85,
            limit: 10,
          }
        );
        similarDetections = similar.length;
      } catch (error) {
        console.warn("Failed to count similar detections:", error);
      }
    }

    // Get tracking confidence if available
    let trackingConfidence: number | undefined;
    if (result.object.crossCameraTrackingId) {
      trackingConfidence = result.object.relatedCameraDetections?.length 
        ? result.object.relatedCameraDetections.length * 0.2 
        : undefined;
    }

    return {
      detectionQuality,
      contextualInfo: {
        timeOfDay,
        lightingCondition,
        crowdDensity: "unknown",
      },
      similarDetections,
      trackingConfidence,
    };
  }

  /**
   * Process pending indexing jobs from queue
   */
  private async processIndexingQueue(): Promise<void> {
    // Get pending jobs
    const result = await this.pool.query(
      `SELECT * FROM video_indexing_queue
       WHERE status = 'pending'
       ORDER BY priority DESC, created_at ASC
       LIMIT 10
       FOR UPDATE SKIP LOCKED`
    );

    if (result.rows.length === 0) {
      return;
    }

    console.log(`Processing ${result.rows.length} video indexing jobs`);

    for (const job of result.rows) {
      await this.processIndexingJob(job);
    }
  }

  /**
   * Process a single indexing job
   */
  private async processIndexingJob(job: any): Promise<void> {
    try {
      // Mark as processing
      await this.pool.query(
        `UPDATE video_indexing_queue
         SET status = 'processing', started_at = NOW()
         WHERE id = $1`,
        [job.id]
      );

      // Get objects from analytics engine or detection service
      const objects = await this.fetchObjectsForSegment(
        job.tenant_id,
        job.segment_id
      );

      // Index the video segment
      const result = await this.indexVideoSegment({
        tenantId: job.tenant_id,
        cameraId: job.camera_id,
        segmentId: job.segment_id,
        videoPath: job.video_path,
        startTime: job.start_time,
        endTime: job.end_time,
        objects,
        generateEmbeddings: true,
        enableCrossCameraTracking: true,
      });

      if (result.success) {
        // Mark as completed
        await this.pool.query(
          `UPDATE video_indexing_queue
           SET status = 'completed',
               completed_at = NOW(),
               objects_indexed = $2,
               processing_time_ms = $3
           WHERE id = $1`,
          [job.id, result.objectsIndexed, result.processingTimeMs]
        );
      } else {
        // Mark as failed and increment retry count
        await this.pool.query(
          `UPDATE video_indexing_queue
           SET status = 'failed',
               error = $2,
               retry_count = retry_count + 1
           WHERE id = $1`,
          [job.id, result.error]
        );
      }
    } catch (error) {
      console.error(`Failed to process indexing job ${job.id}:`, error);
      
      // Mark as failed
      await this.pool.query(
        `UPDATE video_indexing_queue
         SET status = 'failed',
             error = $2,
             retry_count = retry_count + 1
         WHERE id = $1`,
        [job.id, error instanceof Error ? error.message : String(error)]
      );
    }
  }

  /**
   * Fetch detected objects for a segment
   */
  private async fetchObjectsForSegment(
    tenantId: string,
    segmentId: string
  ): Promise<VideoObject[]> {
    // Query detected_objects table
    const result = await this.pool.query(
      `SELECT * FROM detected_objects
       WHERE tenant_id = $1 AND segment_id = $2
       ORDER BY detected_at ASC`,
      [tenantId, segmentId]
    );

    // Group objects by detection and convert to VideoObject format
    const objectsMap = new Map<string, VideoObject>();

    for (const row of result.rows) {
      const objectId = row.id;
      
      if (!objectsMap.has(objectId)) {
        objectsMap.set(objectId, {
          objectId,
          objectType: this.mapObjectClass(row.object_class),
          trackingId: undefined,
          firstSeen: new Date(row.detected_at).toISOString(),
          lastSeen: new Date(row.detected_at).toISOString(),
          durationSeconds: 0,
          boundingBoxes: [
            {
              timestamp: new Date(row.detected_at).toISOString(),
              x: row.bounding_box.x,
              y: row.bounding_box.y,
              width: row.bounding_box.width,
              height: row.bounding_box.height,
              confidence: parseFloat(row.confidence),
            }
          ],
          attributes: row.attributes || {},
          confidence: parseFloat(row.confidence),
        });
      }
    }

    return Array.from(objectsMap.values());
  }

  /**
   * Map object class to object type
   */
  private mapObjectClass(objectClass: string): VideoObject["objectType"] {
    const lowerClass = objectClass.toLowerCase();
    if (lowerClass.includes("person") || lowerClass.includes("people")) {
      return "person";
    }
    if (lowerClass.includes("car") || lowerClass.includes("vehicle") || 
        lowerClass.includes("truck") || lowerClass.includes("bus")) {
      return "vehicle";
    }
    if (lowerClass.includes("dog") || lowerClass.includes("cat") || 
        lowerClass.includes("animal")) {
      return "animal";
    }
    return "object";
  }

  /**
   * Enqueue video segment for indexing
   */
  async enqueueIndexing(input: {
    tenantId: string;
    cameraId: string;
    segmentId: string;
    videoPath: string;
    startTime: string;
    endTime: string;
    priority?: number;
  }): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO video_indexing_queue (
         tenant_id, camera_id, segment_id, video_path,
         start_time, end_time, priority, status, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
       RETURNING id`,
      [
        input.tenantId,
        input.cameraId,
        input.segmentId,
        input.videoPath,
        input.startTime,
        input.endTime,
        input.priority || 100,
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Get indexing statistics
   */
  async getIndexingStatistics(tenantId: string): Promise<{
    pendingJobs: number;
    processingJobs: number;
    completedToday: number;
    failedToday: number;
    avgProcessingTimeMs: number;
    totalObjectsIndexed: number;
  }> {
    const result = await this.pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'pending') as pending_jobs,
         COUNT(*) FILTER (WHERE status = 'processing') as processing_jobs,
         COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE) as completed_today,
         COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= CURRENT_DATE) as failed_today,
         AVG(processing_time_ms) FILTER (WHERE status = 'completed') as avg_processing_time,
         SUM(objects_indexed) FILTER (WHERE status = 'completed') as total_objects
       FROM video_indexing_queue
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const row = result.rows[0];
    return {
      pendingJobs: parseInt(row.pending_jobs || "0"),
      processingJobs: parseInt(row.processing_jobs || "0"),
      completedToday: parseInt(row.completed_today || "0"),
      failedToday: parseInt(row.failed_today || "0"),
      avgProcessingTimeMs: parseInt(row.avg_processing_time || "0"),
      totalObjectsIndexed: parseInt(row.total_objects || "0"),
    };
  }

  /**
   * Retry failed indexing jobs
   */
  async retryFailedJobs(tenantId: string, maxRetries: number = 3): Promise<number> {
    const result = await this.pool.query(
      `UPDATE video_indexing_queue
       SET status = 'pending', error = NULL
       WHERE tenant_id = $1
         AND status = 'failed'
         AND retry_count < $2
       RETURNING id`,
      [tenantId, maxRetries]
    );

    return result.rowCount || 0;
  }

  /**
   * Perform bulk re-indexing for a camera or branch
   */
  async bulkReindex(input: {
    tenantId: string;
    cameraId?: string;
    branchId?: string;
    from: string;
    to: string;
    priority?: number;
  }): Promise<{ jobsCreated: number }> {
    // Get all segments in range
    const conditions = ["rs.tenant_id = $1"];
    const params: any[] = [input.tenantId];
    let paramIndex = 2;

    if (input.cameraId) {
      conditions.push(`rs.camera_id = $${paramIndex}`);
      params.push(input.cameraId);
      paramIndex++;
    }

    if (input.branchId) {
      conditions.push(`c.branch_id = $${paramIndex}`);
      params.push(input.branchId);
      paramIndex++;
    }

    conditions.push(`rs.started_at >= $${paramIndex}::timestamptz`);
    params.push(input.from);
    paramIndex++;

    conditions.push(`rs.ended_at <= $${paramIndex}::timestamptz`);
    params.push(input.to);
    paramIndex++;

    const whereClause = conditions.join(" AND ");

    const result = await this.pool.query(
      `INSERT INTO video_indexing_queue (
         tenant_id, camera_id, segment_id, video_path,
         start_time, end_time, priority, status, created_at
       )
       SELECT 
         rs.tenant_id,
         rs.camera_id,
         rs.id,
         rs.storage_path,
         rs.started_at,
         rs.ended_at,
         $${paramIndex},
         'pending',
         NOW()
       FROM recording_segments rs
       LEFT JOIN cameras c ON c.id = rs.camera_id
       WHERE ${whereClause}
         AND rs.status = 'ready'
         AND NOT EXISTS (
           SELECT 1 FROM video_indexing_queue viq
           WHERE viq.segment_id = rs.id
             AND viq.status IN ('completed', 'processing')
         )
       ON CONFLICT (segment_id) DO NOTHING
       RETURNING id`,
      [...params, input.priority || 50]
    );

    return { jobsCreated: result.rowCount || 0 };
  }
}
