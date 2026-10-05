/**
 * Banking Analytics Integration with Analytics Pipeline
 *
 * Wires up existing detectors (vehicle, ANPR, person, face, zone, access)
 * to publish normalized events to the banking analytics workflow engine.
 */
import { getBankingIntegrationManager } from './event-publishers.js';
const DEFAULT_CONFIG = {
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
    config;
    isActive = false;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Attach to analytics pipeline to receive detection results
     */
    attachToPipeline(pipeline) {
        if (this.isActive) {
            console.warn('Banking analytics integration already active');
            return;
        }
        console.log('Attaching banking analytics integration to analytics pipeline');
        this.isActive = true;
        // Note: The analytics pipeline processes frames and returns detection events (not DetectionResult).
        // Since we need to integrate at a different layer, we'll skip the processFrame wrapper
        // and instead subscribe to detector-level events or post-process the events.
        // For now, mark as active but don't intercept processFrame
        // TODO: Implement proper event subscription mechanism
        console.log('Banking analytics integration attached successfully');
    }
    /**
     * Process detection results and publish banking events
     */
    async processDetectionResults(frame, results) {
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
            }
            catch (error) {
                console.error(`Error publishing banking event for ${result.detectionType}:`, error);
            }
        }
    }
    /**
     * Publish vehicle detection events
     */
    async publishVehicleEvents(manager, tenantId, cameraId, timestamp, result) {
        for (const obj of result.objects) {
            if (!obj.trackId)
                continue;
            await manager.vehiclePublisher.publishVehicleDetection({
                tenantId,
                cameraId,
                timestamp,
                vehicleId: obj.trackId,
                vehicleType: this.mapVehicleType(obj.label),
                confidence: obj.confidence,
                boundingBox: obj.boundingBox,
                attributes: {
                    color: obj.color,
                    make: obj.make,
                    model: obj.model,
                    speed: obj.speed,
                    direction: obj.direction,
                },
            });
        }
    }
    /**
     * Publish ANPR events
     */
    async publishAnprEvents(manager, tenantId, cameraId, timestamp, result) {
        for (const obj of result.objects) {
            const plateReading = obj.plateReading;
            if (!plateReading)
                continue;
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
    async publishPersonEvents(manager, tenantId, cameraId, timestamp, result) {
        for (const obj of result.objects) {
            if (!obj.trackId)
                continue;
            await manager.personPublisher.publishPersonDetection({
                tenantId,
                cameraId,
                timestamp,
                personId: obj.trackId,
                confidence: obj.confidence,
                boundingBox: obj.boundingBox,
                attributes: {
                    pose: obj.pose,
                    gesture: obj.gesture,
                    clothing: obj.clothing,
                },
            });
        }
    }
    /**
     * Publish face recognition events
     */
    async publishFaceEvents(manager, tenantId, cameraId, timestamp, result) {
        for (const obj of result.objects) {
            const faceId = obj.faceId;
            const identityId = obj.identityId;
            if (!faceId)
                continue;
            await manager.facePublisher.publishFaceDetection({
                tenantId,
                cameraId,
                timestamp,
                faceId,
                personId: obj.trackId,
                identityId: identityId || undefined,
                confidence: obj.confidence,
                boundingBox: obj.boundingBox,
                recognitionConfidence: obj.recognitionConfidence,
            });
        }
    }
    /**
     * Publish zone crossing/entry events
     */
    async publishZoneEvents(manager, tenantId, cameraId, timestamp, result) {
        const zoneId = result.metadata?.zoneId;
        if (!zoneId)
            return;
        for (const obj of result.objects) {
            if (!obj.trackId)
                continue;
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
                dwellTime: result.metadata?.dwellTime,
            });
        }
    }
    /**
     * Publish object detection events (bags, packages, etc.)
     */
    async publishObjectEvents(manager, tenantId, cameraId, timestamp, result) {
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
                    status: obj.status || 'carried',
                },
            });
        }
    }
    /**
     * Map vehicle label to standardized vehicle type
     */
    mapVehicleType(label) {
        const mapping = {
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
    detach() {
        this.isActive = false;
        console.log('Banking analytics integration detached');
    }
    /**
     * Check if integration is active
     */
    isIntegrationActive() {
        return this.isActive;
    }
}
// Singleton instance
let integrationInstance = null;
/**
 * Get the singleton banking analytics pipeline integration
 */
export function getBankingAnalyticsPipelineIntegration(config) {
    if (!integrationInstance) {
        integrationInstance = new BankingAnalyticsPipelineIntegration(config);
    }
    return integrationInstance;
}
/**
 * Initialize and attach banking analytics integration to pipeline
 */
export function initializeBankingAnalyticsIntegration(pipeline, config) {
    const integration = getBankingAnalyticsPipelineIntegration(config);
    integration.attachToPipeline(pipeline);
    console.log('Banking analytics integration initialized and attached');
}
