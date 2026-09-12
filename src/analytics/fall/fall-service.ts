/**
 * Worker/Elderly Fall Detection Service
 * 
 * Orchestrates camera stream kinematics, manages per-camera detection instances,
 * records incident evidence in PostgreSQL, and dispatches surveillance alert notifications.
 */

import type { Pool } from 'pg';
import { FallDetector } from './fall-detector.js';
import { FallRepository } from './fall-repository.js';
import type {
  FallDetectionInput,
  FallDetectionResult,
  FallDetectorConfig,
  FallEventRecord,
  ListFallEventsFilter,
} from './types.js';
import type { ControlPlaneStore } from '../../control-plane-store.js';

export class FallDetectionService {
  private readonly repository: FallRepository;
  private readonly detectorInstances = new Map<string, FallDetector>();

  constructor(
    pool: Pool,
    private readonly store?: ControlPlaneStore
  ) {
    this.repository = new FallRepository(pool);
  }

  /**
   * Get or instantiate a cached FallDetector for a camera
   */
  public async getDetectorForCamera(cameraId: string, tenantId: string): Promise<FallDetector> {
    let detector = this.detectorInstances.get(cameraId);
    if (!detector) {
      const config = await this.repository.getCameraConfig(cameraId, tenantId);
      const detectorConfig: Partial<FallDetectorConfig> | undefined = config
        ? {
            profile: config.profile,
            sensitivity: Number(config.sensitivity),
            minConfidence: Number(config.min_confidence),
            aspectRatioThreshold: Number(config.aspect_ratio_threshold),
            velocityThreshold: Number(config.velocity_threshold),
            torsoAngleThreshold: Number(config.torso_angle_threshold),
            motionlessDelaySeconds: Number(config.motionless_delay_seconds),
            recoveryTimeoutSeconds: Number(config.recovery_timeout_seconds),
            alertSeverity: config.alert_severity,
          }
        : undefined;

      detector = new FallDetector(detectorConfig);
      this.detectorInstances.set(cameraId, detector);
    }
    return detector;
  }

  /**
   * Process a frame's active tracks for fall detection
   */
  public async processAnalysis(
    input: FallDetectionInput,
    options?: { snapshotReference?: string }
  ): Promise<{ results: FallDetectionResult[]; events: FallEventRecord[] }> {
    const detector = await this.getDetectorForCamera(input.cameraId, input.tenantId);
    const results = detector.analyze(input);

    const savedEvents: FallEventRecord[] = [];

    for (const res of results) {
      if (res.detected && (res.status === 'confirmed' || res.alertRequired)) {
        const occurredAt = new Date(input.timestamp);
        const event = await this.repository.saveEvent(
          input.tenantId,
          input.cameraId,
          res,
          occurredAt,
          options?.snapshotReference
        );
        savedEvents.push(event);

        // Dispatch alert to control-plane if required
        if (res.alertRequired && this.store && typeof (this.store as any).createAlert === 'function') {
          try {
            const profileLabel = res.personCategory === 'worker' ? 'Worker' : res.personCategory === 'elderly' ? 'Elderly' : 'Person';
            const alertTitle = res.severity === 'P1'
              ? `CRITICAL EMERGENCY: ${profileLabel} Fall Detected (Unresponsive)`
              : `${profileLabel} Fall Detected (${res.fallType.toUpperCase()})`;

            const alertDesc = res.severity === 'P1'
              ? `${profileLabel} fell (Type: ${res.fallType}) and has remained motionless for ${res.motionlessDurationSeconds}s. Peak AR: ${res.peakAspectRatio}, Impact speed: ${res.impactSpeed}. Immediate assistance dispatched.`
              : `${profileLabel} fall incident detected (Type: ${res.fallType}). Impact speed: ${res.impactSpeed}, Torso angle: ${res.torsoAngleDegrees ?? 'N/A'}°.`;

            await (this.store as any).createAlert({
              tenantId: input.tenantId,
              cameraId: input.cameraId,
              alertType: 'FALL_DETECTION',
              severity: res.severity,
              title: alertTitle,
              description: alertDesc,
              metadata: {
                fallEventId: event.id,
                trackId: res.trackId,
                personCategory: res.personCategory,
                fallType: res.fallType,
                confidence: res.confidence,
                impactSpeed: res.impactSpeed,
                aspectRatioPeak: res.peakAspectRatio,
                torsoAngleDegrees: res.torsoAngleDegrees,
                motionlessDurationSeconds: res.motionlessDurationSeconds,
                recoveryDetected: res.recoveryDetected,
                dynamicsTelemetry: res.dynamicsTelemetry,
              },
              snapshotReference: options?.snapshotReference,
              occurredAt,
            });
          } catch (alertErr) {
            console.error('[FallDetectionService] Failed to dispatch alert:', alertErr);
          }
        }
      }
    }

    return { results, events: savedEvents };
  }

  /**
   * List historical fall events
   */
  public async listEvents(filter: ListFallEventsFilter) {
    return this.repository.listEvents(filter);
  }

  /**
   * Get single event by ID
   */
  public async getEventById(eventId: string, tenantId: string) {
    return this.repository.getEventById(eventId, tenantId);
  }

  /**
   * Operator review
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
   * Get camera threshold configuration
   */
  public async getCameraConfig(cameraId: string, tenantId: string) {
    return this.repository.getCameraConfig(cameraId, tenantId);
  }

  /**
   * Update camera threshold configuration
   */
  public async updateCameraConfig(cameraId: string, tenantId: string, config: any) {
    this.detectorInstances.delete(cameraId); // Invalidate cache
    return this.repository.upsertCameraConfig(cameraId, tenantId, config);
  }

  /**
   * Operational statistics
   */
  public async getStats(tenantId: string) {
    return this.repository.getStats(tenantId);
  }
}
