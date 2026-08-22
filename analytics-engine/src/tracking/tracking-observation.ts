/**
 * Tracking Observation Types
 * 
 * Normalized tracking data contract between inference/tracking and analytics.
 * All analytics processors consume TrackingObservation rather than raw detector output.
 */

export type TrackedObjectType =
    | 'person'
    | 'vehicle'
    | 'bicycle'
    | 'motorcycle'
    | 'forklift'
    | 'animal'
    | 'package'
    | 'unknown';

export interface Point {
    x: number;
    y: number;
}

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Velocity {
    x: number;
    y: number;
    speed?: number;
}

export interface WorldPosition {
    x: number;
    y: number;
    z?: number;
}

/**
 * Normalized tracking observation from multi-object tracking pipeline.
 * 
 * This is the canonical representation consumed by all analytics:
 * - Heatmaps
 * - Zone analytics
 * - Dwell analytics
 * - Journey tracking
 * - Flow analytics
 * - Crowd behavior
 */
export interface TrackingObservation {
    /** Tenant isolation */
    tenantId: string;
    branchId?: string;

    /** Camera and frame context */
    cameraId: string;
    frameId?: string;

    /** Track identity - globally unique within tenant/camera/session */
    trackId: string;

    /** Object classification */
    objectType: TrackedObjectType;

    /** Observation timestamp (milliseconds since epoch) */
    timestamp: number;

    /** Bounding box in image coordinates */
    bbox: BoundingBox;

    /**
     * Anchor point for spatial analytics.
     * 
     * For pedestrian/vehicle heatmaps, this is bottom-center of bbox,
     * approximating ground contact point rather than bbox center.
     * 
     * For floor/traffic heatmaps this is more semantically meaningful
     * than bbox center because it represents where the object "is"
     * rather than its visual midpoint.
     */
    anchor: Point;

    /** Detection confidence [0, 1] */
    confidence: number;

    /** Optional velocity information */
    velocity?: Velocity;

    /**
     * Optional world coordinates from camera calibration/homography.
     * 
     * When available, enables cross-camera analytics and floor-plan heatmaps.
     */
    worldPosition?: WorldPosition;

    /** Additional metadata */
    metadata?: {
        vehicleClass?: string;
        vehicleColor?: string;
        licensePlate?: string;
        direction?: number;
        zoneIds?: string[];
        attributes?: Record<string, unknown>;
        [key: string]: unknown;
    };
}

/**
 * Track lifecycle events for state management
 */
export interface TrackLifecycleEvent {
    tenantId: string;
    cameraId: string;
    trackId: string;
    objectType: TrackedObjectType;
    timestamp: number;
}

export interface TrackStartEvent extends TrackLifecycleEvent {
    type: 'track.start';
    initialBbox: BoundingBox;
}

export interface TrackEndEvent extends TrackLifecycleEvent {
    type: 'track.end';
    finalBbox: BoundingBox;
    duration: number;
}

/**
 * Tracker session for ID scoping
 */
export interface TrackerSession {
    sessionId: string;
    cameraId: string;
    startTime: number;
    endTime?: number;
}
