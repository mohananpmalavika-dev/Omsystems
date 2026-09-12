/**
 * Physical Violence & Fight Detection Service
 * 
 * Orchestrates real-time frame and track analysis, manages per-camera detection instances,
 * persists incident evidence to PostgreSQL, and dispatches surveillance alert notifications.
 */

import type { Pool } from 'pg';
import {
  ViolenceDetector,
  type ViolenceDetectionInput,
  type ViolenceDetectionResult,
  type ViolenceDetectorConfig,
} from './violence-detector.js';
import { ViolenceRepository, type ViolenceEventRecord, type ListViolenceEventsFilter } from './violence-repository.js';
import type { ControlPlaneStore } from '../../control-plane-store.js';

export class ViolenceDetectionService {
  private readonly repository: ViolenceRepository;
  private readonly detectorInstances = new Map<string, ViolenceDetector>();

  constructor(
    pool: Pool,
    private readonly store?: ControlPlaneStore
  ) {
    this.repository = new ViolenceRepository(pool);
  }

  /**
   * Get or create a cached ViolenceDetector configured for a specific camera
   */
  public async getDetectorForCamera(cameraId: string, tenantId: string): Promise<ViolenceDetector> {
    let detector = this.detectorInstances.get(cameraId);
    if (!detector) {
      const config = await this.repository.getCameraConfig(cameraId, tenantId);
      const detectorConfig: Partial<ViolenceDetectorConfig> | undefined = config
        ? {
            sensitivity: Number(config.sensitivity),
            minConfidence: Number(config.min_confidence),
            minOpticalFlowEnergy: Number(config.min_optical_flow_energy),
            minLimbAcceleration: Number(config.min_limb_acceleration),
            minDurationMs: config.min_duration_ms,
            cooldownSeconds: config.cooldown_seconds,
            alertSeverity: config.alert_severity,
          }
        : undefined;

      detector = new ViolenceDetector(detectorConfig);
      this.detectorInstances.set(cameraId, detector);
    }
    return detector;
  }

  /**
   * Process a frame and tracks for violent encounter analysis
   */
  public async processAnalysis(
    input: ViolenceDetectionInput,
    options?: { snapshotReference?: string }
  ): Promise<{ result: ViolenceDetectionResult; event: ViolenceEventRecord | null }> {
    const detector = await this.getDetectorForCamera(input.cameraId, input.tenantId);
    const result = detector.analyze(input);

    let event: ViolenceEventRecord | null = null;

    if (result.detected && (result.status === 'confirmed' || result.alertRequired)) {
      const occurredAt = new Date(input.timestamp);
      event = await this.repository.saveEvent(
        input.tenantId,
        input.cameraId,
        result,
        occurredAt,
        options?.snapshotReference
      );

      // If alert is required, dispatch to the control-plane surveillance alert system
      if (result.alertRequired && this.store && typeof (this.store as any).createAlert === 'function') {
        try {
          await (this.store as any).createAlert({
            tenantId: input.tenantId,
            cameraId: input.cameraId,
            alertType: 'VIOLENCE',
            severity: result.severity,
            title: `Physical Altercation / Violence Detected (${result.severity})`,
            description: `Violent physical interaction detected involving ${result.participantCount} participant(s). Peak acceleration: ${result.maxLimbAcceleration} px/s², Kinetic energy: ${result.opticalFlowEnergy}.`,
            metadata: {
              violenceEventId: event.id,
              confidence: result.confidence,
              strikeCount: result.strikeCount,
              participantTrackIds: result.participantTrackIds,
              interactionBox: result.interactionBox,
              metrics: result.metrics,
            },
            snapshotReference: options?.snapshotReference,
            occurredAt,
          });
        } catch (alertError) {
          // Log without breaking analysis pipeline
          console.error('[ViolenceDetectionService] Failed to dispatch alert:', alertError);
        }
      }
    }

    return { result, event };
  }

  /**
   * List violence events with filtering
   */
  public async listEvents(filter: ListViolenceEventsFilter) {
    return this.repository.listEvents(filter);
  }

  /**
   * Get single event by ID
   */
  public async getEventById(eventId: string, tenantId: string) {
    return this.repository.getEventById(eventId, tenantId);
  }

  /**
   * Review event
   */
  public async reviewEvent(
    eventId: string,
    tenantId: string,
    reviewStatus: 'confirmed' | 'false_positive' | 'escalated',
    reviewedBy: string,
    reviewNotes?: string
  ) {
    return this.repository.reviewEvent(eventId, tenantId, reviewStatus, reviewedBy, reviewNotes);
  }

  /**
   * Get camera config
   */
  public async getCameraConfig(cameraId: string, tenantId: string) {
    return this.repository.getCameraConfig(cameraId, tenantId);
  }

  /**
   * Update camera config
   */
  public async updateCameraConfig(cameraId: string, tenantId: string, config: any) {
    this.detectorInstances.delete(cameraId); // Invalidate cache
    return this.repository.upsertCameraConfig(cameraId, tenantId, config);
  }

  /**
   * Get stats
   */
  public async getStats(tenantId: string) {
    return this.repository.getStats(tenantId);
  }
}
