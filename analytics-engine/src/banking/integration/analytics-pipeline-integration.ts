/**
 * Banking Analytics Integration with Analytics Pipeline
 * 
 * Wires up existing detectors (vehicle, ANPR, person, face, zone, access)
 * to publish normalized events to the banking analytics workflow engine.
 */

import type { DetectionFrame, DetectionResult } from '../../detectors/base-detector.js';
import type { AnalyticsPipeline } from '../../analytics-pipeline.js';
import { getBankingIntegrationManager } from './event-publishers.js';
import type { VehicleDetection } from '../../vehicle/tracking/vehicle-tracker.js';
import type { PlateReading } from '../../detectors/anpr-detector.js';

export interface BankingIntegrationConfig {
  enableVehicleEvents: boolean;
  enableAnprEvents: boolean;
  enablePersonEvents: boolean;
  enableFaceEvents: boolean;
  enableZoneEvents: boolean;
  enableAccessEvents: boolean;
  enableObjectEvents: boolean;
}

const DEFAULT_CONFIG: BankingIntegrationConfig = {
  enableVehicleEvents: true,
  enableAnprEvents: true,
  enablePersonEvents: true,
  enableFaceEvents: true,
  enableZoneEvents: true,
  enableAccessEvents: true,
  enableObjectEvents: true,
};

/**
 * Banking Analytics Pipeline Integration
 * 
 * Subscribes to detection results from the analytics pipeline and
 * publishes normalized events to the banking analytics system.
 */
export class BankingAnalyticsPipelineIntegration {
  private config: BankingIntegrationConfig;
  private isActive = false;

  constructor(config: Partial<BankingIntegrationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Attach to analytics pipeline to receive detection results
   */
  attachToPipeline(pipeline: AnalyticsPipeline): void {
    if (this.isActive) {
      console.warn('Banking analytics integration already active');
      return;
    }

    console.log('Attaching banking analytics integration to analytics pipeline');
    this.isActive = true;

    // Note: The analytics pipeline processes frames and returns detection results.
    // We'll hook into the frame processing workflow by wrapping processFrame.
    const originalProcessFrame = pipeline.processFrame.bind(pipeline);
    
    pipeline.processFrame = async (frame, rules) => {
      const results = await originalProcessFrame(frame, rules);
      
      // Process detection results for banking analytics
      await this.processDetectionResults(frame, results);
      
      return results;
    };

    console.log('Banking analytics integration attached successfully');
  }

  /**
   * Process detection results and publish banking events
   */
  private async processDetectionResults(
    frame: DetectionFrame,
    results: DetectionResult[]
  ): Promise<void> {
    const manager = getBankingIntegrationManager();
    const { tenantId, cameraId, timestamp } = frame;

    for (const result of results) {
      try {
        switch (result.detectionType) {
          case 'vehicle':
            if (this.config.enableVehicleEvents) {
              await this.publishVehicleEvents(manager, tenantId, cameraId, timestamp, result);
            }
            break;

          case 'anpr':
            if (this.config.enableAnprEvents) {
              await this.publishAnprEvents(manager, tenantId, cameraId, timestamp, result);
            }
            break;

          case 'person':
            if (this.config.enablePersonEvents) {
              await this.publishPersonEvents(manager, tenantId, cameraId, timestamp, result);
            }
            break;

          case 'face':
          case 'face-recognition':
            if (this.config.enableFaceEvents) {
              await this.publishFaceEvents(manager, tenantId, cameraId, timestamp, result);
            }
            break;

          case 'line-crossing':
          case 'intrusion':
          case 'loitering':
            if (this.config.enableZoneEvents) {
              await this.publishZoneEvents(manager, tenantId, cameraId, timestamp, result);
            }
            break;

          case 'object':
            if (this.config.enableObjectEvents) {
              await this.publishObjectEvents(manager, tenantId, cameraId, timestamp, result);
            }
            break;
        }
      } catch (error) {
        console.error(`Error publishing banking event for ${result.detectionType}:`, error);
      }
    }
  }

  /**
   * Publish vehicle detection events
   */
  private async publishVehicleEvents(
    manager: any,
    tenantId: string,
    cameraId: string,
    timestamp: Date,
    result: DetectionResult
  ): Promise<void> {
    for (const obj of result.objects) {
      if (!obj.trackId) continue;

      await manager.vehiclePublisher.publishVehicleDetection({
        tenantId,
        cameraId,
        timestamp,
        vehicleId: obj.trackId,
        vehicleType: this.mapVehicleType(obj.label),
        confidence: obj.confidence,
        boundingBox: obj.boundingBox,
        attributes: {
          color: (obj as any).color,
          make: (obj as any).make,
          model: (obj as any).model,
          speed: (obj as any).speed,
          direction: (obj as any).direction,
        },
      });
    }
  }

  /**
   * Publish ANPR events
   */
  private async publishAnprEvents(
    manager: any,
    tenantId: string,
    cameraId: string,
    timestamp: Date,
    result: DetectionResult
  ): Promise<void> {
    for (const obj of result.objects) {
      const plateReading = (obj as any).plateReading as PlateReading | undefined;
      if (!plateReading) continue;

      await manager.anprPublisher.publishPlateReading({
        tenantId,
        cameraId,
        timestamp,
        vehicleId: obj.trackId,
        plateNumber: plateReading.plateNumber,
        confidence: plateReading.confidence,
        country: plateReading.country,
        region: plateReading.region,
        boundingBox: obj.boundingBox,
      });
    }
  }

  /**
   * Publish person detection events
   */
  private async publishPersonEvents(
    manager: any,
    tenantId: string,
    cameraId: string,
    timestamp: Date,
    result: DetectionResult
  ): Promise<void> {
    for (const obj of result.objects) {
      if (!obj.trackId) continue;

      await manager.personPublisher.publishPersonDetection({
        tenantId,
        cameraId,
        timestamp,
        personId: obj.trackId,
        confidence: obj.confidence,
        boundingBox: obj.boundingBox,
        attributes: {
          pose: (obj as any).pose,
          gesture: (obj as any).gesture,
          clothing: (obj as any).clothing,
        },
      });
    }
  }

  /**
   * Publish face recognition events
   */
  private async publishFaceEvents(
    manager: any,
    tenantId: string,
    cameraId: string,
    timestamp: Date,
    result: DetectionResult
  ): Promise<void> {
    for (const obj of result.objects) {
      const faceId = (obj as any).faceId;
      const identityId = (obj as any).identityId;

      if (!faceId) continue;

      await manager.facePublisher.publishFaceDetection({
        tenantId,
        cameraId,
        timestamp,
        faceId,
        personId: obj.trackId,
        identityId: identityId || undefined,
        confidence: obj.confidence,
        boundingBox: obj.boundingBox,
        recognitionConfidence: (obj as any).recognitionConfidence,
      });
    }
  }

  /**
   * Publish zone crossing/entry events
   */
  private async publishZoneEvents(
    manager: any,
    tenantId: string,
    cameraId: string,
    timestamp: Date,
    result: DetectionResult
  ): Promise<void> {
    const zoneId = result.metadata?.zoneId as string | undefined;
    if (!zoneId) return;

    for (const obj of result.objects) {
      if (!obj.trackId) continue;

      const eventType = result.detectionType === 'line-crossing' ? 'entry' : 'presence';

      await manager.zonePublisher.publishZoneEvent({
        tenantId,
        cameraId,
        timestamp,
        zoneId,
        objectId: obj.trackId,
        objectType: obj.label === 'person' ? 'person' : 'vehicle',
        eventType,
        confidence: obj.confidence,
        dwellTime: result.metadata?.dwellTime as number | undefined,
      });
    }
  }

  /**
   * Publish object detection events (bags, packages, etc.)
   */
  private async publishObjectEvents(
    manager: any,
    tenantId: string,
    cameraId: string,
    timestamp: Date,
    result: DetectionResult
  ): Promise<void> {
    for (const obj of result.objects) {
      // Filter for relevant objects (bags, backpacks, suitcases, boxes)
      if (!['backpack', 'handbag', 'suitcase', 'box'].includes(obj.label)) {
        continue;
      }

      await manager.objectPublisher.publishObjectDetection({
        tenantId,
        cameraId,
        timestamp,
        objectId: obj.trackId || `${cameraId}-${timestamp.getTime()}-${obj.label}`,
        objectType: obj.label,
        confidence: obj.confidence,
        boundingBox: obj.boundingBox,
        attributes: {
          status: (obj as any).status || 'carried',
        },
      });
    }
  }

  /**
   * Map vehicle label to standardized vehicle type
   */
  private mapVehicleType(label: string): 'car' | 'truck' | 'van' | 'motorcycle' | 'other' {
    const mapping: Record<string, 'car' | 'truck' | 'van' | 'motorcycle' | 'other'> = {
      car: 'car',
      truck: 'truck',
      van: 'van',
      motorcycle: 'motorcycle',
      bus: 'truck',
      'auto-rickshaw': 'other',
      bicycle: 'other',
    };
    return mapping[label] || 'other';
  }

  /**
   * Detach from pipeline
   */
  detach(): void {
    this.isActive = false;
    console.log('Banking analytics integration detached');
  }

  /**
   * Check if integration is active
   */
  isIntegrationActive(): boolean {
    return this.isActive;
  }
}

// Singleton instance
let integrationInstance: BankingAnalyticsPipelineIntegration | null = null;

/**
 * Get the singleton banking analytics pipeline integration
 */
export function getBankingAnalyticsPipelineIntegration(
  config?: Partial<BankingIntegrationConfig>
): BankingAnalyticsPipelineIntegration {
  if (!integrationInstance) {
    integrationInstance = new BankingAnalyticsPipelineIntegration(config);
  }
  return integrationInstance;
}

/**
 * Initialize and attach banking analytics integration to pipeline
 */
export function initializeBankingAnalyticsIntegration(
  pipeline: AnalyticsPipeline,
  config?: Partial<BankingIntegrationConfig>
): void {
  const integration = getBankingAnalyticsPipelineIntegration(config);
  integration.attachToPipeline(pipeline);
  console.log('Banking analytics integration initialized and attached');
}
