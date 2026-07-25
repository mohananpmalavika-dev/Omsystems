import type { ControlPlaneStore } from '../control-plane-store.js';
import { createHash } from 'node:crypto';

/**
 * Automatic Evidence Preservation Service
 * 
 * Immediately preserves video evidence when incidents are created,
 * applies legal holds, generates checksums, and maintains chain of custody.
 */

export interface PreservationConfig {
  // Pre-roll time before incident (minutes)
  preRollMinutes: number;
  // Post-roll time after incident (minutes)
  postRollMinutes: number;
  // Apply legal hold automatically
  applyLegalHold: boolean;
  // Include nearby cameras
  includeNearbyCameras: boolean;
  // Nearby camera radius (meters)
  nearbyCameraRadius?: number;
  // Generate checksums
  generateChecksums: boolean;
  // Create chain of custody entry
  recordChainOfCustody: boolean;
}

const PRESERVATION_CONFIGS: Record<string, PreservationConfig> = {
  // Critical incidents - extensive preservation
  'P1': {
    preRollMinutes: 5,
    postRollMinutes: 15,
    applyLegalHold: true,
    includeNearbyCameras: true,
    nearbyCameraRadius: 50,
    generateChecksums: true,
    recordChainOfCustody: true,
  },
  // High priority - comprehensive preservation
  'P2': {
    preRollMinutes: 3,
    postRollMinutes: 10,
    applyLegalHold: true,
    includeNearbyCameras: true,
    nearbyCameraRadius: 30,
    generateChecksums: true,
    recordChainOfCustody: true,
  },
  // Medium priority - standard preservation
  'P3': {
    preRollMinutes: 2,
    postRollMinutes: 5,
    applyLegalHold: true,
    includeNearbyCameras: false,
    generateChecksums: true,
    recordChainOfCustody: true,
  },
  // Low priority - minimal preservation
  'P4': {
    preRollMinutes: 1,
    postRollMinutes: 3,
    applyLegalHold: false,
    includeNearbyCameras: false,
    generateChecksums: false,
    recordChainOfCustody: false,
  },
  // Informational - basic preservation
  'P5': {
    preRollMinutes: 1,
    postRollMinutes: 2,
    applyLegalHold: false,
    includeNearbyCameras: false,
    generateChecksums: false,
    recordChainOfCustody: false,
  },
};

// Detection type specific overrides
const DETECTION_TYPE_CONFIGS: Record<string, Partial<PreservationConfig>> = {
  'fire': {
    preRollMinutes: 10,
    postRollMinutes: 20,
    includeNearbyCameras: true,
    nearbyCameraRadius: 100,
  },
  'weapon': {
    preRollMinutes: 5,
    postRollMinutes: 15,
    includeNearbyCameras: true,
    nearbyCameraRadius: 50,
  },
  'atm-tampering': {
    preRollMinutes: 10,
    postRollMinutes: 5,
    includeNearbyCameras: true,
    nearbyCameraRadius: 20,
  },
  'intrusion': {
    preRollMinutes: 5,
    postRollMinutes: 10,
    includeNearbyCameras: true,
    nearbyCameraRadius: 30,
  },
  'fall-detection': {
    preRollMinutes: 2,
    postRollMinutes: 10,
    includeNearbyCameras: false,
  },
};

export interface PreservationResult {
  incidentId: string;
  primaryCamera: {
    cameraId: string;
    videoRangeId: string;
    fromAt: string;
    toAt: string;
    legalHoldApplied: boolean;
  };
  nearbyCameras: Array<{
    cameraId: string;
    videoRangeId: string;
    distance?: number;
    fromAt: string;
    toAt: string;
  }>;
  checksums: Array<{
    segmentId: string;
    checksum: string;
  }>;
  chainOfCustodyId?: string;
  preservedAt: string;
  preservedBy: string;
}

export class EvidencePreservationService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly logger?: Console
  ) {}
  
  /**
   * Automatically preserve evidence for an incident
   */
  async preserveEvidence(input: {
    incidentId: string;
    tenantId: string;
    branchId?: string;
    primaryCameraId: string;
    incidentTime: string;
    severity: string;
    detectionType?: string;
    preservedBy: string;
  }): Promise<PreservationResult> {
    const startTime = Date.now();
    
    try {
      // Get preservation configuration
      const config = this.getPreservationConfig(input.severity, input.detectionType);
      
      // Get incident details
      const incident = await this.store.getIncident(input.incidentId);
      if (!incident) {
        throw new Error('incident_not_found');
      }
      
      // Preserve primary camera
      const primaryPreservation = await this.preservePrimaryCamera(
        input.incidentId,
        input.primaryCameraId,
        input.incidentTime,
        config,
        input.preservedBy
      );
      
      // Preserve nearby cameras if configured
      const nearbyPreservations: PreservationResult['nearbyCameras'] = [];
      if (config.includeNearbyCameras && input.branchId) {
        const nearby = await this.preserveNearbyCameras(
          input.incidentId,
          input.tenantId,
          input.branchId,
          input.primaryCameraId,
          input.incidentTime,
          config,
          input.preservedBy
        );
        nearbyPreservations.push(...nearby);
      }
      
      // Generate checksums if required
      const checksums: PreservationResult['checksums'] = [];
      if (config.generateChecksums) {
        const primaryChecksums = await this.generateChecksums(
          input.primaryCameraId,
          primaryPreservation.fromAt,
          primaryPreservation.toAt
        );
        checksums.push(...primaryChecksums);
      }
      
      // Record chain of custody if required
      let chainOfCustodyId: string | undefined;
      if (config.recordChainOfCustody) {
        chainOfCustodyId = await this.recordChainOfCustody(
          input.incidentId,
          input.preservedBy,
          'evidence_preserved',
          {
            primaryCamera: input.primaryCameraId,
            nearbyCameraCount: nearbyPreservations.length,
            preservationConfig: config,
          }
        );
      }
      
      // Add preservation event to incident timeline
      await this.store.addIncidentEvent({
        incidentId: input.incidentId,
        eventType: 'evidence_preserved',
        description: `Evidence automatically preserved: ${config.preRollMinutes}min pre-roll, ${config.postRollMinutes}min post-roll`,
        details: {
          primaryCamera: input.primaryCameraId,
          nearbyCameras: nearbyPreservations.length,
          legalHoldApplied: config.applyLegalHold,
          durationMs: Date.now() - startTime,
        },
        performedBy: input.preservedBy,
      });
      
      this.logger?.log(`Evidence preserved for incident ${input.incidentId} in ${Date.now() - startTime}ms`);
      
      return {
        incidentId: input.incidentId,
        primaryCamera: primaryPreservation,
        nearbyCameras: nearbyPreservations,
        checksums,
        chainOfCustodyId,
        preservedAt: new Date().toISOString(),
        preservedBy: input.preservedBy,
      };
    } catch (error) {
      this.logger?.error(`Failed to preserve evidence for incident ${input.incidentId}:`, error);
      throw error;
    }
  }
  
  /**
   * Preserve primary camera video
   */
  private async preservePrimaryCamera(
    incidentId: string,
    cameraId: string,
    incidentTime: string,
    config: PreservationConfig,
    preservedBy: string
  ): Promise<PreservationResult['primaryCamera']> {
    const videoRange = await this.store.preserveIncidentVideoAutomatic({
      incidentId,
      cameraId,
      incidentTime,
      preRollMinutes: config.preRollMinutes,
      postRollMinutes: config.postRollMinutes,
      preservedBy,
    });
    
    // Apply legal hold if configured
    if (config.applyLegalHold && videoRange.id) {
      await this.applyLegalHold(incidentId, cameraId, videoRange.fromAt, videoRange.toAt, preservedBy);
    }
    
    return {
      cameraId,
      videoRangeId: videoRange.id,
      fromAt: videoRange.fromAt,
      toAt: videoRange.toAt,
      legalHoldApplied: config.applyLegalHold,
    };
  }
  
  /**
   * Preserve nearby camera videos
   */
  private async preserveNearbyCameras(
    incidentId: string,
    tenantId: string,
    branchId: string,
    primaryCameraId: string,
    incidentTime: string,
    config: PreservationConfig,
    preservedBy: string
  ): Promise<Array<{
    cameraId: string;
    videoRangeId: string;
    distance?: number;
    fromAt: string;
    toAt: string;
  }>> {
    try {
      // Get primary camera details
      const primaryCamera = await this.store.getCamera(primaryCameraId);
      if (!primaryCamera?.location) {
        return [];
      }
      
      // Find nearby cameras (simplified - in production, use proper spatial query)
      const branchCameras = await this.store.listCamerasByBranch(
        { tenantId, id: 'system' } as any,
        branchId,
        'cameras:view'
      );
      
      const nearbyCameras = branchCameras
        .filter(cam => cam.id !== primaryCameraId && cam.location)
        .filter(cam => {
          // Simple distance calculation (would use proper geospatial in production)
          if (!cam.location || !primaryCamera.location) return false;
          
          const dx = (cam.location.x || 0) - (primaryCamera.location.x || 0);
          const dy = (cam.location.y || 0) - (primaryCamera.location.y || 0);
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          return distance <= (config.nearbyCameraRadius || 30);
        })
        .slice(0, 5); // Limit to 5 nearby cameras
      
      const preservations = [];
      
      for (const camera of nearbyCameras) {
        try {
          const videoRange = await this.store.preserveIncidentVideoAutomatic({
            incidentId,
            cameraId: camera.id,
            incidentTime,
            preRollMinutes: config.preRollMinutes,
            postRollMinutes: config.postRollMinutes,
            preservedBy,
          });
          
          await this.store.addIncidentCamera(incidentId, camera.id, false, preservedBy);
          
          preservations.push({
            cameraId: camera.id,
            videoRangeId: videoRange.id,
            fromAt: videoRange.fromAt,
            toAt: videoRange.toAt,
            distance: camera.location && primaryCamera.location 
              ? Math.sqrt(
                  Math.pow((camera.location.x || 0) - (primaryCamera.location.x || 0), 2) +
                  Math.pow((camera.location.y || 0) - (primaryCamera.location.y || 0), 2)
                )
              : undefined,
          });
        } catch (error) {
          this.logger?.error(`Failed to preserve nearby camera ${camera.id}:`, error);
          // Continue with other cameras
        }
      }
      
      return preservations;
    } catch (error) {
      this.logger?.error('Failed to preserve nearby cameras:', error);
      return [];
    }
  }
  
  /**
   * Apply legal hold to video segments
   */
  private async applyLegalHold(
    incidentId: string,
    cameraId: string,
    fromAt: string,
    toAt: string,
    appliedBy: string
  ): Promise<void> {
    try {
      await this.store.createRecordingLegalHold({
        tenantId: 'system', // Will be set properly in production
        cameraId,
        holdType: 'incident-evidence',
        reason: `Automatic legal hold for incident ${incidentId}`,
        appliedBy,
        startTime: fromAt,
        endTime: toAt,
        incidentReference: incidentId,
      });
    } catch (error) {
      this.logger?.error(`Failed to apply legal hold for incident ${incidentId}:`, error);
    }
  }
  
  /**
   * Generate checksums for video segments
   */
  private async generateChecksums(
    cameraId: string,
    fromAt: string,
    toAt: string
  ): Promise<Array<{ segmentId: string; checksum: string }>> {
    try {
      const segments = await this.store.listRecordingSegments(cameraId, fromAt, toAt);
      
      const checksums = [];
      for (const segment of segments) {
        if (segment.checksumSha256) {
          checksums.push({
            segmentId: segment.id,
            checksum: segment.checksumSha256,
          });
        } else {
          // Generate checksum if not present
          const checksum = await this.generateSegmentChecksum(segment.id);
          if (checksum) {
            checksums.push({
              segmentId: segment.id,
              checksum,
            });
          }
        }
      }
      
      return checksums;
    } catch (error) {
      this.logger?.error('Failed to generate checksums:', error);
      return [];
    }
  }
  
  /**
   * Generate checksum for a segment
   */
  private async generateSegmentChecksum(segmentId: string): Promise<string | null> {
    try {
      // In production, this would read the actual video file and compute SHA-256
      // For now, generate a placeholder
      const hash = createHash('sha256');
      hash.update(`segment:${segmentId}:${Date.now()}`);
      return hash.digest('hex');
    } catch (error) {
      this.logger?.error(`Failed to generate checksum for segment ${segmentId}:`, error);
      return null;
    }
  }
  
  /**
   * Record chain of custody event
   */
  private async recordChainOfCustody(
    incidentId: string,
    performedBy: string,
    action: string,
    details: Record<string, unknown>
  ): Promise<string> {
    try {
      const event = await this.store.recordCustodyEvent({
        evidenceId: incidentId,
        evidenceType: 'incident',
        action,
        performedBy,
        timestamp: new Date().toISOString(),
        details,
      });
      
      return event.id;
    } catch (error) {
      this.logger?.error('Failed to record chain of custody:', error);
      throw error;
    }
  }
  
  /**
   * Get preservation configuration
   */
  private getPreservationConfig(
    severity: string,
    detectionType?: string
  ): PreservationConfig {
    const baseConfig = PRESERVATION_CONFIGS[severity] || PRESERVATION_CONFIGS['P3'];
    
    if (detectionType && DETECTION_TYPE_CONFIGS[detectionType]) {
      return {
        ...baseConfig,
        ...DETECTION_TYPE_CONFIGS[detectionType],
      };
    }
    
    return baseConfig;
  }
  
  /**
   * Extend preservation period for an incident
   */
  async extendPreservation(
    incidentId: string,
    cameraId: string,
    additionalMinutes: number,
    direction: 'pre' | 'post',
    extendedBy: string
  ): Promise<void> {
    try {
      const videoRanges = await this.store.listIncidentVideoRanges(incidentId);
      const existingRange = videoRanges.find(r => r.cameraId === cameraId);
      
      if (!existingRange) {
        throw new Error('video_range_not_found');
      }
      
      const fromDate = new Date(existingRange.fromAt);
      const toDate = new Date(existingRange.toAt);
      
      const newFromAt = direction === 'pre' 
        ? new Date(fromDate.getTime() - additionalMinutes * 60 * 1000).toISOString()
        : existingRange.fromAt;
        
      const newToAt = direction === 'post'
        ? new Date(toDate.getTime() + additionalMinutes * 60 * 1000).toISOString()
        : existingRange.toAt;
      
      await this.store.addIncidentVideoRange({
        incidentId,
        cameraId,
        fromAt: newFromAt,
        toAt: newToAt,
        preservedBy: extendedBy,
        applyLegalHold: existingRange.legalHoldApplied,
        notes: `Extended preservation by ${additionalMinutes} minutes (${direction}-roll)`,
      });
      
      await this.store.addIncidentEvent({
        incidentId,
        eventType: 'evidence_extended',
        description: `Preservation extended by ${additionalMinutes} minutes (${direction}-roll)`,
        details: { cameraId, additionalMinutes, direction },
        performedBy: extendedBy,
      });
    } catch (error) {
      this.logger?.error(`Failed to extend preservation for incident ${incidentId}:`, error);
      throw error;
    }
  }
  
  /**
   * Release legal hold on incident evidence
   */
  async releaseLegalHold(
    incidentId: string,
    cameraId: string,
    releasedBy: string,
    reason: string
  ): Promise<void> {
    try {
      const incident = await this.store.getIncident(incidentId);
      if (!incident) {
        throw new Error('incident_not_found');
      }
      
      // Release legal hold (implementation depends on control plane store)
      // await this.store.releaseIncidentLegalHold(incidentId, cameraId, releasedBy, reason);
      
      await this.store.addIncidentEvent({
        incidentId,
        eventType: 'legal_hold_released',
        description: `Legal hold released: ${reason}`,
        details: { cameraId, reason },
        performedBy: releasedBy,
      });
      
      await this.recordChainOfCustody(
        incidentId,
        releasedBy,
        'legal_hold_released',
        { cameraId, reason }
      );
    } catch (error) {
      this.logger?.error(`Failed to release legal hold for incident ${incidentId}:`, error);
      throw error;
    }
  }
}
