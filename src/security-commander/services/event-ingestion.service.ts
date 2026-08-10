/**
 * Event Ingestion Service
 * 
 * High-level service for ingesting raw events from various sources,
 * normalizing them, and storing in the event repository.
 */

import type { Pool } from 'pg';
import { SecurityEventRepository } from '../repositories/security-event.repository.js';
import { getNormalizerRegistry, type NormalizationError } from '../normalizers/normalizer-registry.js';
import type { NormalizationContext, RawEvent } from '../normalizers/base-normalizer.js';
import type { SecurityEvent } from '../types/index.js';
import { AnomalyDetectionEngine } from '../anomaly/anomaly-engine.js';

export interface IngestionResult {
  success: boolean;
  eventsIngested: number;
  eventsFailed: number;
  errors: Array<{
    event: RawEvent;
    error: string;
  }>;
  ingestedEvents?: SecurityEvent[];
}

export class EventIngestionService {
  private readonly eventRepository: SecurityEventRepository;
  private readonly normalizerRegistry = getNormalizerRegistry();
  private readonly anomalyEngine: AnomalyDetectionEngine;

  constructor(
    pool: Pool,
    private readonly options: {
      enableAnomalyDetection?: boolean;
    } = {}
  ) {
    this.eventRepository = new SecurityEventRepository(pool);
    this.anomalyEngine = new AnomalyDetectionEngine(pool);
    this.options.enableAnomalyDetection = options.enableAnomalyDetection ?? true;
  }

  /**
   * Ingest a single raw event
   */
  async ingestEvent(
    raw: RawEvent,
    context: NormalizationContext
  ): Promise<SecurityEvent> {
    // Normalize the event
    const normalized = this.normalizerRegistry.normalize(raw, context);

    // Store in database
    const event = await this.eventRepository.createEvent(normalized);

    // Run anomaly detection
    if (this.options.enableAnomalyDetection) {
      try {
        await this.anomalyEngine.analyzeEvent(event, {
          useBaseline: true,
          threshold: 0.5,
        });
      } catch (error) {
        console.warn('Anomaly detection failed:', error);
        // Continue even if anomaly detection fails
      }
    }

    return event;
  }

  /**
   * Ingest multiple events in bulk
   */
  async ingestEventsBulk(
    events: RawEvent[],
    context: NormalizationContext
  ): Promise<IngestionResult> {
    if (events.length === 0) {
      return {
        success: true,
        eventsIngested: 0,
        eventsFailed: 0,
        errors: [],
        ingestedEvents: [],
      };
    }

    const normalized: any[] = [];
    const errors: Array<{ event: RawEvent; error: string }> = [];

    // Normalize all events
    for (const raw of events) {
      try {
        const normalizedEvent = this.normalizerRegistry.normalize(raw, context);
        normalized.push(normalizedEvent);
      } catch (error) {
        errors.push({
          event: raw,
          error: error instanceof Error ? error.message : 'Unknown normalization error',
        });
      }
    }

    // Store normalized events in bulk
    let ingestedEvents: SecurityEvent[] = [];
    try {
      if (normalized.length > 0) {
        ingestedEvents = await this.eventRepository.createEventsBulk(normalized);
      }
    } catch (error) {
      return {
        success: false,
        eventsIngested: 0,
        eventsFailed: events.length,
        errors: [
          ...errors,
          {
            event: events[0],
            error: `Bulk insertion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }

    return {
      success: errors.length === 0,
      eventsIngested: ingestedEvents.length,
      eventsFailed: errors.length,
      errors,
      ingestedEvents,
    };
  }

  /**
   * Ingest events with error tolerance
   * Continues on individual failures, stores successful events
   */
  async ingestEventsWithTolerance(
    events: RawEvent[],
    context: NormalizationContext
  ): Promise<IngestionResult> {
    const results: SecurityEvent[] = [];
    const errors: Array<{ event: RawEvent; error: string }> = [];

    for (const raw of events) {
      try {
        const event = await this.ingestEvent(raw, context);
        results.push(event);
      } catch (error) {
        errors.push({
          event: raw,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      success: errors.length === 0,
      eventsIngested: results.length,
      eventsFailed: errors.length,
      errors,
      ingestedEvents: results,
    };
  }

  /**
   * Ingest camera events from various camera systems
   */
  async ingestCameraEvents(
    events: Array<{
      cameraId: string;
      eventType: string;
      timestamp: Date | string;
      branchId?: string;
      metadata?: Record<string, unknown>;
    }>,
    context: NormalizationContext
  ): Promise<IngestionResult> {
    return this.ingestEventsBulk(events, context);
  }

  /**
   * Ingest AI detection events from analytics engine
   */
  async ingestAIDetections(
    detections: Array<{
      cameraId: string;
      detectionType: string;
      timestamp: Date | string;
      confidence: number;
      branchId?: string;
      zoneId?: string;
      snapshot?: string;
      clip?: string;
      metadata?: Record<string, unknown>;
    }>,
    context: NormalizationContext
  ): Promise<IngestionResult> {
    return this.ingestEventsBulk(detections, context);
  }

  /**
   * Ingest access control events
   */
  async ingestAccessControlEvents(
    events: Array<{
      doorId: string;
      eventType: string;
      timestamp: Date | string;
      badgeId?: string;
      userId?: string;
      branchId?: string;
      metadata?: Record<string, unknown>;
    }>,
    context: NormalizationContext
  ): Promise<IngestionResult> {
    return this.ingestEventsBulk(events, context);
  }

  /**
   * Ingest recorder events
   */
  async ingestRecorderEvents(
    events: Array<{
      recorderId: string;
      eventType: string;
      timestamp: Date | string;
      branchId?: string;
      cameraId?: string;
      metadata?: Record<string, unknown>;
    }>,
    context: NormalizationContext
  ): Promise<IngestionResult> {
    return this.ingestEventsBulk(events, context);
  }

  /**
   * Ingest network events
   */
  async ingestNetworkEvents(
    events: Array<{
      deviceId: string;
      deviceType: string;
      eventType: string;
      timestamp: Date | string;
      branchId?: string;
      metadata?: Record<string, unknown>;
    }>,
    context: NormalizationContext
  ): Promise<IngestionResult> {
    return this.ingestEventsBulk(events, context);
  }

  /**
   * Ingest storage events
   */
  async ingestStorageEvents(
    events: Array<{
      storageId: string;
      eventType: string;
      timestamp: Date | string;
      branchId?: string;
      freePercent?: number;
      metadata?: Record<string, unknown>;
    }>,
    context: NormalizationContext
  ): Promise<IngestionResult> {
    return this.ingestEventsBulk(events, context);
  }

  /**
   * Check if an event can be normalized
   */
  canIngest(raw: RawEvent): boolean {
    return this.normalizerRegistry.canNormalize(raw);
  }

  /**
   * Get statistics about ingestion
   */
  async getIngestionStats(
    tenantId: string,
    from: Date,
    to: Date
  ): Promise<{
    totalEvents: number;
    bySeverity: Record<string, number>;
    bySource: Record<string, number>;
  }> {
    const stats = await this.eventRepository.getEventStats({
      tenantId,
      from,
      to,
    });

    return {
      totalEvents: stats.total,
      bySeverity: stats.bySeverity,
      bySource: stats.bySource,
    };
  }
}
