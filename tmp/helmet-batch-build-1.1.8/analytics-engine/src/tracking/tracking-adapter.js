/**
 * Tracking Adapter
 *
 * Converts detector-specific tracking data to normalized TrackingObservation.
 * Provides adapters for PersonDetector, VehicleDetector, and other detectors.
 */
/**
 * Map detector labels to TrackedObjectType
 */
export function mapLabelToObjectType(label) {
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
export function buildTrackingObservation(detection, context) {
    const bbox = {
        x: detection.boundingBox.x,
        y: detection.boundingBox.y,
        width: detection.boundingBox.width,
        height: detection.boundingBox.height,
    };
    // Calculate anchor point (bottom-center of bbox for ground contact)
    const anchor = {
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
    const metadata = {};
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
        if (key !== 'trackId' &&
            key !== 'label' &&
            key !== 'confidence' &&
            key !== 'boundingBox' &&
            key !== 'timestamp' &&
            key !== 'speed' &&
            key !== 'direction' &&
            key !== 'dwellTimeSeconds') {
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
        ...(typeof context.frameWidth === 'number' && Number.isFinite(context.frameWidth) && context.frameWidth > 0
            ? { frameWidth: context.frameWidth }
            : {}),
        ...(typeof context.frameHeight === 'number' && Number.isFinite(context.frameHeight) && context.frameHeight > 0
            ? { frameHeight: context.frameHeight }
            : {}),
        anchor,
        confidence: detection.confidence,
        velocity,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
}
/**
 * Convert direction string to degrees
 */
function directionToDegrees(direction) {
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
function directionToVelocity(direction, speed) {
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
export function buildTrackingObservations(detections, context) {
    return detections.map(detection => buildTrackingObservation(detection, context));
}
