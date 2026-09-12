/**
 * Abandoned & Unattended Object Analytics Service
 * 
 * Orchestrates multi-camera static foreground tracking, multi-frame debounce,
 * zone intersection checks, persistence, incident lifecycle, and operational stats.
 */

import type { Pool } from 'pg';
import { AbandonedObjectRepository } from './abandoned-object-repository.js';
import { StaticBlobTracker } from './static-blob-tracker.js';
import type {
  AbandonedObjectEventRecord,
  AbandonedObjectZoneRecord,
  AbandonedObjectConfigRecord,
  BoundingBox,
  DetectedPersonObservation,
  FrameAnalysisResult,
  ListAbandonedEventsFilter,
  ListAbandonedZonesFilter,
  AbandonedStats,
  AbandonedStatus,
} from './types.js';

export class AbandonedObjectService {
  private readonly repo: AbandonedObjectRepository;
  private readonly cameraTrackers = new Map<string, StaticBlobTracker>();
  // Tracks already persisted event IDs per blob to prevent event storming
  private readonly activeBlobEventIds = new Map<string, string>();

  constructor(pool?: Pool) {
    this.repo = new AbandonedObjectRepository(pool);
  }

  private getOrCreateTracker(cameraId: string): StaticBlobTracker {
    let tracker = this.cameraTrackers.get(cameraId);
    if (!tracker) {
      tracker = new StaticBlobTracker();
      this.cameraTrackers.set(cameraId, tracker);
    }
    return tracker;
  }

  /**
   * Processes a raw RGB frame buffer directly with background subtraction and static blob extraction
   */
  async processFrame(params: {
    tenantId: string;
    cameraId: string;
    branchId?: string;
    frameBuffer: Uint8Array;
    width: number;
    height: number;
    channels?: number;
    persons?: DetectedPersonObservation[];
    timestamp?: Date;
    saveToDb?: boolean;
  }): Promise<{
    analysis: FrameAnalysisResult;
    savedEvents: AbandonedObjectEventRecord[];
  }> {
    const tracker = this.getOrCreateTracker(params.cameraId);
    const luma = StaticBlobTracker.extractLuma(
      params.frameBuffer,
      params.width,
      params.height,
      params.channels ?? 3
    );

    // Extract candidate foreground difference blobs
    const candidateBlobs = tracker.detectForegroundBlobs(
      luma,
      params.width,
      params.height,
      28,
      120,
      50000
    );

    return this.processObservations({
      tenantId: params.tenantId,
      cameraId: params.cameraId,
      branchId: params.branchId,
      candidateBlobs,
      persons: params.persons || [],
      timestamp: params.timestamp,
      saveToDb: params.saveToDb ?? true,
    });
  }

  /**
   * Processes pre-extracted candidate bounding boxes and person detections
   */
  async processObservations(params: {
    tenantId: string;
    cameraId: string;
    branchId?: string;
    candidateBlobs: BoundingBox[];
    persons?: DetectedPersonObservation[];
    timestamp?: Date;
    saveToDb?: boolean;
  }): Promise<{
    analysis: FrameAnalysisResult;
    savedEvents: AbandonedObjectEventRecord[];
  }> {
    const tracker = this.getOrCreateTracker(params.cameraId);
    const config = await this.repo.getConfig(params.tenantId, params.cameraId);
    const zones = await this.repo.listZones({
      tenantId: params.tenantId,
      cameraId: params.cameraId,
      enabledOnly: true,
    });

    const analysis = tracker.processFrameBlobs({
      candidateBlobs: params.candidateBlobs,
      persons: params.persons || [],
      zones,
      timestamp: params.timestamp,
      config,
    });

    const savedEvents: AbandonedObjectEventRecord[] = [];
    const shouldSave = params.saveToDb ?? true;

    if (shouldSave) {
      for (const alertBlob of analysis.blobs) {
        // Check if event already created for this blob
        const existingEventId = this.activeBlobEventIds.get(alertBlob.blobId);

        if (!existingEventId) {
          // Find zone id if matched
          const matchedZone = zones.find((z) => z.zone_name === alertBlob.zoneName);

          const event = await this.repo.createEvent({
            tenant_id: params.tenantId,
            camera_id: params.cameraId,
            zone_id: matchedZone?.id || null,
            branch_id: params.branchId || null,
            event_type: alertBlob.eventType,
            object_type: alertBlob.objectType,
            severity: alertBlob.severity,
            confidence: alertBlob.confidence,
            bounding_box: alertBlob.boundingBox,
            dwell_time_seconds: alertBlob.dwellTimeSeconds,
            owner_track_id: alertBlob.ownerTrackId || null,
            owner_distance_pixels: alertBlob.ownerDistancePixels ?? null,
            status: 'detected',
            first_seen_at: new Date(Date.now() - alertBlob.dwellTimeSeconds * 1000),
            detected_at: params.timestamp || new Date(),
          });

          this.activeBlobEventIds.set(alertBlob.blobId, event.id);
          savedEvents.push(event);
        }
      }
    }

    return { analysis, savedEvents };
  }

  // ==========================================================================
  // EVENT OPERATIONS
  // ==========================================================================

  async listEvents(filter: ListAbandonedEventsFilter) {
    return this.repo.listEvents(filter);
  }

  async getEventById(tenantId: string, id: string) {
    return this.repo.getEventById(tenantId, id);
  }

  async updateEventStatus(
    tenantId: string,
    id: string,
    status: AbandonedStatus,
    resolvedBy?: string,
    notes?: string
  ) {
    return this.repo.updateEventStatus(tenantId, id, status, resolvedBy, notes);
  }

  // ==========================================================================
  // ZONE OPERATIONS
  // ==========================================================================

  async listZones(filter: ListAbandonedZonesFilter) {
    return this.repo.listZones(filter);
  }

  async getZoneById(tenantId: string, id: string) {
    return this.repo.getZoneById(tenantId, id);
  }

  async createZone(data: Omit<AbandonedObjectZoneRecord, 'id' | 'created_at' | 'updated_at'>) {
    return this.repo.createZone(data);
  }

  async updateZone(
    tenantId: string,
    id: string,
    data: Partial<Omit<AbandonedObjectZoneRecord, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>>
  ) {
    return this.repo.updateZone(tenantId, id, data);
  }

  async deleteZone(tenantId: string, id: string) {
    return this.repo.deleteZone(tenantId, id);
  }

  // ==========================================================================
  // CONFIG & STATS
  // ==========================================================================

  async getConfig(tenantId: string, cameraId: string) {
    return this.repo.getConfig(tenantId, cameraId);
  }

  async updateConfig(data: Omit<AbandonedObjectConfigRecord, 'id' | 'updated_at'>) {
    return this.repo.upsertConfig(data);
  }

  async getStats(tenantId: string, cameraId?: string): Promise<AbandonedStats> {
    return this.repo.getStats(tenantId, cameraId);
  }

  public resetCameraTracker(cameraId: string): void {
    const tracker = this.cameraTrackers.get(cameraId);
    if (tracker) {
      tracker.clear();
      this.cameraTrackers.delete(cameraId);
    }
  }
}
