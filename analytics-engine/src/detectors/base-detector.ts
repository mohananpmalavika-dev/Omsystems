/**
 * Base detector interface for all AI detection types
 */

export interface DetectionFrame {
  cameraId: string;
  tenantId: string;
  timestamp: Date;
  imageData: Buffer;
  width: number;
  height: number;
  metadata?: Record<string, unknown>;
}

export interface DetectedObject {
  label: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  trackId?: string;
}

export interface DetectionResult {
  detectionType: string;
  confidence: number;
  objects: DetectedObject[];
  metadata?: Record<string, unknown>;
  requiresAlert: boolean;
}

export abstract class BaseDetector {
  constructor(
    protected readonly detectionType: string,
    protected readonly modelVersion: string,
  ) {}

  /**
   * Process a single frame and return detection results
   */
  abstract detect(frame: DetectionFrame): Promise<DetectionResult[]>;

  /**
   * Initialize the detector (load models, etc.)
   */
  abstract initialize(): Promise<void>;

  /**
   * Cleanup resources
   */
  abstract cleanup(): Promise<void>;

  /**
   * Get detector health status
   */
  abstract getHealth(): {
    status: "healthy" | "degraded" | "unhealthy";
    details?: string;
  };
}

/**
 * Normalize bounding box coordinates to 0-1 range
 */
export function normalizeBoundingBox(
  box: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: box.x / frameWidth,
    y: box.y / frameHeight,
    width: box.width / frameWidth,
    height: box.height / frameHeight,
  };
}

/**
 * Check if a point is inside a polygon zone
 */
export function isPointInPolygon(
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calculate center point of bounding box
 */
export function getBoundingBoxCenter(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number } {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

/**
 * Calculate intersection over union (IoU) for two bounding boxes
 */
export function calculateIoU(
  box1: { x: number; y: number; width: number; height: number },
  box2: { x: number; y: number; width: number; height: number },
): number {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

  if (x2 < x1 || y2 < y1) return 0;

  const intersection = (x2 - x1) * (y2 - y1);
  const area1 = box1.width * box1.height;
  const area2 = box2.width * box2.height;
  const union = area1 + area2 - intersection;

  return union > 0 ? intersection / union : 0;
}
