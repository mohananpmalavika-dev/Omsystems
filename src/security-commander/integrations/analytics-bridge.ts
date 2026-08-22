/**
 * Analytics Engine Bridge
 * 
 * Bridges analytics-engine DetectionEvent format to Security Commander events.
 */

import type { Pool } from 'pg';
import { EventIngestionService } from '../services/event-ingestion.service.js';
import type { NormalizationContext } from '../normalizers/base-normalizer.js';

/**
 * Bridge for converting analytics-engine detection events
 */
export class AnalyticsBridge {
  private readonly ingestionService: EventIngestionService;

  constructor(pool: Pool) {
    this.ingestionService = new EventIngestionService(pool);
  }

  /**
   * Ingest detection event from analytics engine
   */
  async ingestDetectionEvent(
    detection: {
      eventId: string;
      tenantId?: string;
      branchId?: string;
      cameraId: string;
      detectionType: string;
      timestamp: string;
      confidence: number;
      zone?: string;
      boundingBoxes?: Array<{
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
      trackIds?: string[];
      snapshot?: string;
      clip?: string;
      metadata?: Record<string, unknown>;
    },
    context: NormalizationContext
  ) {
    // Map analytics detection to security event
    const rawEvent = {
      cameraId: detection.cameraId,
      detectionType: detection.detectionType,
      timestamp: detection.timestamp,
      confidence: detection.confidence,
      branchId: detection.branchId,
      zoneId: detection.zone,
      boundingBoxes: detection.boundingBoxes,
      trackIds: detection.trackIds,
      snapshot: detection.snapshot,
      clip: detection.clip,
      metadata: {
        ...detection.metadata,
        originalEventId: detection.eventId,
        source: 'analytics-engine',
      },
    };

    return this.ingestionService.ingestEvent(rawEvent, {
      ...context,
      tenantId: detection.tenantId ?? context.tenantId ?? '',
    });
  }

  /**
   * Ingest multiple detection events in bulk
   */
  async ingestDetectionEventsBulk(
    detections: Array<{
      eventId: string;
      tenantId?: string;
      branchId?: string;
      cameraId: string;
      detectionType: string;
      timestamp: string;
      confidence: number;
      zone?: string;
      snapshot?: string;
      clip?: string;
      metadata?: Record<string, unknown>;
    }>,
    context: NormalizationContext
  ) {
    const rawEvents = detections.map(detection => ({
      cameraId: detection.cameraId,
      detectionType: detection.detectionType,
      timestamp: detection.timestamp,
      confidence: detection.confidence,
      branchId: detection.branchId,
      zoneId: detection.zone,
      snapshot: detection.snapshot,
      clip: detection.clip,
      metadata: {
        ...detection.metadata,
        originalEventId: detection.eventId,
        source: 'analytics-engine',
      },
    }));

    return this.ingestionService.ingestAIDetections(rawEvents, context);
  }
}

/**
 * Bridge for camera health events from device monitoring
 */
export class CameraHealthBridge {
  private readonly ingestionService: EventIngestionService;

  constructor(pool: Pool) {
    this.ingestionService = new EventIngestionService(pool);
  }

  /**
   * Report camera offline event
   */
  async reportCameraOffline(
    cameraId: string,
    branchId: string,
    context: NormalizationContext
  ) {
    return this.ingestionService.ingestEvent(
      {
        cameraId,
        eventType: 'offline',
        timestamp: new Date(),
        branchId,
        metadata: {
          source: 'device-monitor',
        },
      },
      context
    );
  }

  /**
   * Report camera online event
   */
  async reportCameraOnline(
    cameraId: string,
    branchId: string,
    context: NormalizationContext
  ) {
    return this.ingestionService.ingestEvent(
      {
        cameraId,
        eventType: 'online',
        timestamp: new Date(),
        branchId,
        metadata: {
          source: 'device-monitor',
        },
      },
      context
    );
  }

  /**
   * Report camera tamper event
   */
  async reportCameraTamper(
    cameraId: string,
    branchId: string,
    context: NormalizationContext
  ) {
    return this.ingestionService.ingestEvent(
      {
        cameraId,
        eventType: 'tamper',
        timestamp: new Date(),
        branchId,
        metadata: {
          source: 'onvif-event',
        },
      },
      context
    );
  }

  /**
   * Report stream loss event
   */
  async reportStreamLoss(
    cameraId: string,
    branchId: string,
    context: NormalizationContext
  ) {
    return this.ingestionService.ingestEvent(
      {
        cameraId,
        eventType: 'stream_lost',
        timestamp: new Date(),
        branchId,
        metadata: {
          source: 'stream-monitor',
        },
      },
      context
    );
  }
}

/**
 * Bridge for recorder health events
 */
export class RecorderHealthBridge {
  private readonly ingestionService: EventIngestionService;

  constructor(pool: Pool) {
    this.ingestionService = new EventIngestionService(pool);
  }

  /**
   * Report recorder offline
   */
  async reportRecorderOffline(
    recorderId: string,
    branchId: string,
    context: NormalizationContext
  ) {
    return this.ingestionService.ingestEvent(
      {
        recorderId,
        eventType: 'offline',
        timestamp: new Date(),
        branchId,
        metadata: {
          source: 'recorder-monitor',
        },
      },
      context
    );
  }

  /**
   * Report recording stopped
   */
  async reportRecordingStopped(
    recorderId: string,
    cameraId: string,
    branchId: string,
    context: NormalizationContext
  ) {
    return this.ingestionService.ingestEvent(
      {
        recorderId,
        eventType: 'recording_stopped',
        timestamp: new Date(),
        branchId,
        cameraId,
        metadata: {
          source: 'recorder-monitor',
        },
      },
      context
    );
  }
}
