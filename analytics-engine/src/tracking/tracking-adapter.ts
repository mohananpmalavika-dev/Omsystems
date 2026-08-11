/**
 * Tracking Adapter
 * 
 * Converts detector-specific tracking data to normalized TrackingObservation.
 * Provides adapters for PersonDetector, VehicleDetector, and other detectors.
 */

import {
    TrackingObservation,
    TrackedObjectType,
    BoundingBox,
    Point,
} from './tracking-observation';

/**
 * Generic detection with tracking info
 */
export interface TrackedDetection {
    trackId: string;
    label: string;
    confidence: number;
    boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    timestamp?: Date;
    speed?: number;
    direction?: string;
    dwellTimeSeconds?: number;
    [key: string]: unknown;
}

/**
 * Frame context for observations
 */
export interface FrameContext {
    tenantId: string;
    branchId?: string;
    cameraId: string;
    frameId?: string;
    timestamp: Date;
    frameWidth?: number;
    frameHeight?: number;
}

/**
 * Map detector labels to TrackedObjectType
 */
export function mapLabelToObjectType(label: string): TrackedObjectType {
    const labelLower = label.toLowerCase();

    switch (labelLower) {
        case 'person':
        case 'people':
            return 'person';

        case 'car':
        case 'bus':
        case 'truck':
        case 'auto-rickshaw':
            return 'vehicle';

        case 'bicycle':
            return 'bicycle';

        case 'motorcycle':
        case 'motorbike':
            return 'motorcycle';

        case 'forklift':
            return 'forklift';

        case 'dog':
        case 'cat':
        case 'bird':
        case 'horse':
        case 'sheep':
        case 'cow':
        case 'elephant':
        case 'bear':
        case 'zebra':
        case 'giraffe':
            return 'animal';

        case 'package':
        case 'box':
        case 'suitcase':
        case 'backpack':
        case 'handbag':
            return 'package';

        default:
            return 'unknown';
    }
}

/**
 * Convert tracked detection to TrackingObservation
 */
export function buildTrackingObservation(
    detection: TrackedDetection,
    context: FrameContext,
): TrackingObservation {
    const bbox: BoundingBox = {
        x: detection.boundingBox.x,
        y: detection.boundingBox.y,
        width: detection.boundingBox.width,
        height: detection.boundingBox.height,
    };

    // Calculate anchor point (bottom-center of bbox for ground contact)
    const anchor: Point = {
        x: bbox.x + bbox.width / 2,
        y: bbox.y + bbox.height,
    };

    // Map label to object type
    const objectType = mapLabelToObjectType(detection.label);

    // Build velocity if speed and direction available
    let velocity;
    if (detection.speed !== undefined && detection.direction !== undefined) {
        const { vx, vy } = directionToVelocity(detection.direction, detection.speed);
        velocity = {
            x: vx,
            y: vy,
            speed: detection.speed,
        };
    }

    // Build globally unique track ID
    const globalTrackId = `${context.cameraId}:${detection.trackId}`;

    // Collect metadata
    const metadata: Record<string, unknown> = {};

    if (objectType === 'vehicle') {
        metadata.vehicleClass = detection.label;
        if (detection.direction) {
            metadata.direction = directionToDegrees(detection.direction);
        }
    }

    if (detection.dwellTimeSeconds !== undefined) {
        metadata.dwellTimeSeconds = detection.dwellTimeSeconds;
    }

    // Add any additional detection properties
    for (const [key, value] of Object.entries(detection)) {
        if (
            key !== 'trackId' &&
            key !== 'label' &&
            key !== 'confidence' &&
            key !== 'boundingBox' &&
            key !== 'timestamp' &&
            key !== 'speed' &&
            key !== 'direction' &&
            key !== 'dwellTimeSeconds'
        ) {
            metadata[key] = value;
        }
    }

    return {
        tenantId: context.tenantId,
        branchId: context.branchId,
        cameraId: context.cameraId,
        frameId: context.frameId,
        trackId: globalTrackId,
        objectType,
        timestamp: (detection.timestamp || context.timestamp).getTime(),
        bbox,
        anchor,
        confidence: detection.confidence,
        velocity,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
}

/**
 * Convert direction string to degrees
 */
function directionToDegrees(direction: string): number {
    switch (direction.toLowerCase()) {
        case 'north':
            return 0;
        case 'east':
            return 90;
        case 'south':
            return 180;
        case 'west':
            return 270;
        default:
            return 0;
    }
}

/**
 * Convert direction and speed to velocity components
 */
function directionToVelocity(
    direction: string,
    speed: number,
): { vx: number; vy: number } {
    const degrees = directionToDegrees(direction);
    const radians = (degrees * Math.PI) / 180;

    return {
        vx: Math.cos(radians) * speed,
        vy: Math.sin(radians) * speed,
    };
}

/**
 * Batch convert multiple detections
 */
export function buildTrackingObservations(
    detections: TrackedDetection[],
    context: FrameContext,
): TrackingObservation[] {
    return detections.map(detection =>
        buildTrackingObservation(detection, context),
    );
}
