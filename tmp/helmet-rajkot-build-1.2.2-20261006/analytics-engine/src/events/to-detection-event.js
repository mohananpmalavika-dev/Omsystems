import { randomUUID } from 'node:crypto';
/**
 * Convert the analytics detection shape used in analytics-engine into the shared DetectionEvent
 */
export function toDetectionEvent(input) {
    const eventId = randomUUID();
    // Try to extract bounding boxes and track ids from metadata in a few common places
    const metadata = input.metadata ?? {};
    const boxes = metadata['boundingBoxes']
        ?? (metadata['boundingBox'] ? [metadata['boundingBox']] : undefined);
    const trackIds = metadata['trackIds']
        ?? (input.trackedObjectId ? [input.trackedObjectId] : undefined)
        ?? (metadata['trackId'] ? [String(metadata['trackId'])] : undefined);
    const event = {
        eventId,
        tenantId: input.tenantId,
        branchId: input.branchId,
        cameraId: input.cameraId,
        zoneId: input.zone,
        zone: input.zone,
        timestamp: input.timestamp,
        detectionTime: input.timestamp,
        eventType: input.type,
        detectionType: input.type,
        confidence: Math.max(0, Math.min(1, input.confidence)),
        severity: metadata['severity'] ?? undefined,
        boundingBoxes: boxes,
        trackIds,
        snapshot: input.snapshot,
        clip: input.clip,
        model: input.model,
        modelVersion: input.modelVersion,
        ruleId: input.ruleId,
        evidence: input.evidence ?? metadata['evidence'],
        metadata,
        trackedObjectId: input.trackedObjectId,
    };
    return event;
}
