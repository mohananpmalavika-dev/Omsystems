import { randomUUID } from 'node:crypto';
import type { DetectionEvent as SharedEvent, BoundingBox } from '../../../src/events/detection-event.js';

export interface DetectionInput {
  tenantId?: string;
  branchId?: string;
  cameraId: string;
  type: string;
  timestamp: string;
  confidence: number;
  zone?: string;
  trackedObjectId?: string;
  metadata?: Record<string, unknown>;
  // Optional artifacts
  snapshot?: string;
  clip?: string;
  model?: string;
  modelVersion?: string;
  ruleId?: string;
  evidence?: Record<string, unknown>;
}

/**
 * Convert the analytics detection shape used in analytics-engine into the shared DetectionEvent
 */
export function toDetectionEvent(input: DetectionInput): SharedEvent {
  const eventId = randomUUID();

  // Try to extract bounding boxes and track ids from metadata in a few common places
  const metadata = input.metadata ?? {};

  const boxes: BoundingBox[] | undefined = (metadata['boundingBoxes'] as BoundingBox[] | undefined)
    ?? (metadata['boundingBox'] as BoundingBox | undefined ? [metadata['boundingBox'] as BoundingBox] : undefined);

  const trackIds: string[] | undefined = (metadata['trackIds'] as string[] | undefined)
    ?? (input.trackedObjectId ? [input.trackedObjectId] : undefined)
    ?? (metadata['trackId'] ? [String(metadata['trackId'])] : undefined);

  const event: SharedEvent = {
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
    severity: metadata['severity'] as any ?? undefined,
    boundingBoxes: boxes,
    trackIds,
    snapshot: input.snapshot,
    clip: input.clip,
    model: input.model,
    modelVersion: input.modelVersion,
    ruleId: input.ruleId,
    evidence: input.evidence ?? (metadata['evidence'] as Record<string, unknown> | undefined),
    metadata,
    trackedObjectId: input.trackedObjectId,
  };

  return event;
}
