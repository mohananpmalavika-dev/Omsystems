/**
 * Shared DetectionEvent schema used across incident and analytics services.
 * Provides a common structure so different detectors produce a unified event.
 */

export interface BoundingBox {
  x: number; // normalized 0-1 or pixel coordinates (documented by producer)
  y: number;
  width: number;
  height: number;
}

export type SeverityLevel = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'critical' | 'high' | 'medium' | 'low' | 'info' | string;

export interface DetectionEvent {
  // Unique event identifier
  eventId: string;

  // Tenant / organizational context
  tenantId?: string;
  branchId?: string;

  // Source camera and zone
  cameraId: string;
  zoneId?: string;
  zone?: string;

  // Timestamps
  // Use ISO-8601 strings for portability across services
  timestamp: string;
  detectionTime?: string;

  // Canonical event type (e.g., "person", "vehicle", "face", "anpr", "fire", "intrusion")
  eventType: string;
  // Backwards-compatible alias used in some parts of the codebase
  detectionType?: string;

  // Confidence score (0.0 - 1.0)
  confidence: number;

  // Numerical severity (optional) using platform codes or freeform string
  severity?: SeverityLevel;

  // Spatial evidence
  boundingBoxes?: BoundingBox[];
  trackIds?: string[];

  // Evidence and artifacts (URLs, storage keys or base64 payloads as appropriate)
  snapshot?: string; // e.g., URL to preserved snapshot
  clip?: string; // e.g., URL to preserved clip

  // Model provenance
  model?: string;
  modelVersion?: string;

  // Rule, zone, and correlation hints
  ruleId?: string;

  // Free-form evidence bag for detector-specific fields (ANPR readings, face matches, attributes)
  evidence?: Record<string, unknown>;

  // Tracking and zone context
  trackedObjectId?: string;

  // Generic metadata for forward compatibility
  metadata?: Record<string, unknown>;
}
