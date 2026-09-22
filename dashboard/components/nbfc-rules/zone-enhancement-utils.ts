/**
 * Zone Configuration Enhancement Utilities
 * Comprehensive validation, editing, conflict detection, and measurements
 */

export interface Point {
  x: number;
  y: number;
}

export interface ZoneValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    area?: number;
    perimeter?: number;
    selfIntersecting?: boolean;
    convex?: boolean;
  };
}

export interface ZoneConflict {
  zoneId: string;
  zoneName: string;
  overlapPercentage: number;
  type: "OVERLAP" | "DUPLICATE_CLASSIFICATION" | "CONTAINS" | "CONTAINED_BY";
}

/**
 * Validates a polygon zone for self-intersection, minimum area, and topology
 */
export function validatePolygonZone(points: Point[]): ZoneValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (points.length < 3) {
    errors.push("Polygon must have at least 3 vertices");
    return { isValid: false, errors, warnings };
  }

  // Check for self-intersection
  const hasSelfIntersection = checkSelfIntersection(points);
  if (hasSelfIntersection) {
    errors.push("Polygon edges intersect themselves - please redraw without crossing lines");
  }

  // Calculate area
  const area = calculatePolygonArea(points);
  if (area < 0.001) {
    errors.push("Polygon area is too small - must cover at least 0.1% of frame");
  }

  // Check if points are too close together
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    if (dist < 0.01) {
      warnings.push(`Vertices ${i + 1} and ${((i + 1) % points.length) + 1} are very close together`);
    }
  }

  // Check convexity
  const isConvex = checkConvexity(points);
  if (!isConvex) {
    warnings.push("Zone is concave - detection may be less accurate in indented areas");
  }

  const perimeter = calculatePerimeter(points);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    metadata: {
      area,
      perimeter,
      selfIntersecting: hasSelfIntersection,
      convex: isConvex,
    },
  };
}

/**
 * Validates a tripwire line
 */
export function validateTripwire(points: Point[]): ZoneValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (points.length !== 2) {
    errors.push("Tripwire must have exactly 2 points");
    return { isValid: false, errors, warnings };
  }

  const [p1, p2] = points;
  const length = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

  if (length < 0.05) {
    errors.push("Tripwire is too short - minimum 5% of frame width");
  }

  if (length > 1.5) {
    warnings.push("Tripwire spans most of the frame - consider reducing length for accuracy");
  }

  // Check if tripwire is too vertical or too horizontal
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
  if (Math.abs(angle) < 10 || Math.abs(angle - 180) < 10) {
    warnings.push("Tripwire is nearly horizontal - directional detection may be ambiguous");
  }
  if (Math.abs(angle - 90) < 10 || Math.abs(angle + 90) < 10) {
    warnings.push("Tripwire is nearly vertical - consider angling for better detection");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    metadata: {
      perimeter: length,
    },
  };
}

/**
 * Detects conflicts between zones
 */
export function detectZoneConflicts(
  newZone: { polygon: Point[]; type: string; cameraId: string },
  existingZones: Array<{ id: string; name: string; polygon: Point[]; type: string; cameraId: string }>
): ZoneConflict[] {
  const conflicts: ZoneConflict[] = [];

  for (const existing of existingZones) {
    // Only check zones on the same camera
    if (existing.cameraId !== newZone.cameraId) continue;

    const overlapPercent = calculateOverlapPercentage(newZone.polygon, existing.polygon);

    if (overlapPercent > 80) {
      conflicts.push({
        zoneId: existing.id,
        zoneName: existing.name,
        overlapPercentage: overlapPercent,
        type: "DUPLICATE_CLASSIFICATION",
      });
    } else if (overlapPercent > 30) {
      conflicts.push({
        zoneId: existing.id,
        zoneName: existing.name,
        overlapPercentage: overlapPercent,
        type: "OVERLAP",
      });
    }

    // Check if same classification overlaps significantly
    if (existing.type === newZone.type && overlapPercent > 20) {
      conflicts.push({
        zoneId: existing.id,
        zoneName: existing.name,
        overlapPercentage: overlapPercent,
        type: "DUPLICATE_CLASSIFICATION",
      });
    }
  }

  return conflicts;
}

/**
 * Snap point to grid
 */
export function snapToGridPoint(point: Point, gridSize = 0.05): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

/**
 * Calculate polygon area using shoelace formula
 */
function calculatePolygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Calculate perimeter
 */
function calculatePerimeter(points: Point[]): number {
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dx = points[j].x - points[i].x;
    const dy = points[j].y - points[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}

/**
 * Check if polygon is self-intersecting
 */
function checkSelfIntersection(points: Point[]): boolean {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 2; j < points.length; j++) {
      // Don't check adjacent edges
      if (j === (i + 1) % points.length || i === (j + 1) % points.length) continue;

      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const p3 = points[j];
      const p4 = points[(j + 1) % points.length];

      if (doLineSegmentsIntersect(p1, p2, p3, p4)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if two line segments intersect
 */
function doLineSegmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const ccw = (a: Point, b: Point, c: Point) => {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  };

  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

/**
 * Check if polygon is convex
 */
function checkConvexity(points: Point[]): boolean {
  if (points.length < 3) return true;

  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];

    const crossProduct =
      (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);

    if (crossProduct !== 0) {
      const currentSign = crossProduct > 0 ? 1 : -1;
      if (sign === 0) {
        sign = currentSign;
      } else if (sign !== currentSign) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Calculate overlap percentage between two polygons (approximation)
 */
function calculateOverlapPercentage(poly1: Point[], poly2: Point[]): number {
  // Simple grid-based approximation
  const gridSize = 0.01; // 1% resolution
  let poly1Points = 0;
  let overlapPoints = 0;

  for (let x = 0; x <= 1; x += gridSize) {
    for (let y = 0; y <= 1; y += gridSize) {
      const point = { x, y };
      const inPoly1 = isPointInPolygon(point, poly1);
      const inPoly2 = isPointInPolygon(point, poly2);

      if (inPoly1) {
        poly1Points++;
        if (inPoly2) {
          overlapPoints++;
        }
      }
    }
  }

  if (poly1Points === 0) return 0;
  return (overlapPoints / poly1Points) * 100;
}

/**
 * Check if point is inside polygon using ray casting
 */
function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Format area for display
 */
export function formatArea(area: number): string {
  const percentage = (area * 100).toFixed(1);
  return `${percentage}% of frame`;
}

/**
 * Format perimeter for display
 */
export function formatPerimeter(perimeter: number): string {
  const percentage = (perimeter * 100).toFixed(1);
  return `${percentage}% of frame diagonal`;
}

/**
 * Get zone template presets with more options
 */
export interface ZoneTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  polygon: Point[];
  icon: string;
}

export const ZONE_TEMPLATES: ZoneTemplate[] = [
  {
    id: "vault",
    name: "Gold Vault Cage",
    description: "Standard locker/vault rectangular zone",
    type: "LOCKER",
    polygon: [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.8 },
      { x: 0.25, y: 0.8 },
    ],
    icon: "🔒",
  },
  {
    id: "counter",
    name: "Cash Counter",
    description: "Teller cash drawer zone",
    type: "CASH_COUNTER",
    polygon: [
      { x: 0.35, y: 0.55 },
      { x: 0.65, y: 0.55 },
      { x: 0.65, y: 0.85 },
      { x: 0.35, y: 0.85 },
    ],
    icon: "💵",
  },
  {
    id: "queue",
    name: "Customer Queue",
    description: "Waiting area for customers",
    type: "QUEUE_AREA",
    polygon: [
      { x: 0.1, y: 0.3 },
      { x: 0.4, y: 0.3 },
      { x: 0.4, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ],
    icon: "👥",
  },
  {
    id: "entrance",
    name: "Branch Entrance",
    description: "Main entrance/exit monitoring",
    type: "ENTRANCE",
    polygon: [
      { x: 0.3, y: 0.1 },
      { x: 0.7, y: 0.1 },
      { x: 0.7, y: 0.5 },
      { x: 0.3, y: 0.5 },
    ],
    icon: "🚪",
  },
  {
    id: "atm",
    name: "ATM Lobby",
    description: "ATM area monitoring",
    type: "ATM_AREA",
    polygon: [
      { x: 0.6, y: 0.2 },
      { x: 0.9, y: 0.2 },
      { x: 0.9, y: 0.7 },
      { x: 0.6, y: 0.7 },
    ],
    icon: "🏧",
  },
  {
    id: "restricted",
    name: "Restricted Zone",
    description: "Staff-only high security area",
    type: "RESTRICTED_AREA",
    polygon: [
      { x: 0.05, y: 0.05 },
      { x: 0.3, y: 0.05 },
      { x: 0.3, y: 0.3 },
      { x: 0.05, y: 0.3 },
    ],
    icon: "⚠️",
  },
];

export const TRIPWIRE_TEMPLATES = [
  {
    id: "door-horizontal",
    name: "Door Ingress (Horizontal)",
    description: "Horizontal tripwire across doorway",
    polygon: [
      { x: 0.15, y: 0.5 },
      { x: 0.85, y: 0.5 },
    ],
    icon: "⚡",
  },
  {
    id: "door-vertical",
    name: "Door Ingress (Vertical)",
    description: "Vertical tripwire at doorway",
    polygon: [
      { x: 0.5, y: 0.2 },
      { x: 0.5, y: 0.8 },
    ],
    icon: "⚡",
  },
  {
    id: "perimeter",
    name: "Perimeter Breach",
    description: "Diagonal boundary line",
    polygon: [
      { x: 0.1, y: 0.3 },
      { x: 0.9, y: 0.7 },
    ],
    icon: "⚡",
  },
];

/**
 * Export zone configuration to JSON
 */
export function exportZoneConfig(zones: any[]): string {
  return JSON.stringify(
    {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      zones: zones.map((z) => ({
        name: z.name,
        type: z.type,
        polygon: z.polygon,
        enabled: z.enabled,
      })),
    },
    null,
    2
  );
}

/**
 * Import zone configuration from JSON
 */
export function importZoneConfig(jsonString: string): any[] {
  try {
    const config = JSON.parse(jsonString);
    if (!config.zones || !Array.isArray(config.zones)) {
      throw new Error("Invalid zone configuration format");
    }
    return config.zones;
  } catch (error) {
    throw new Error(`Failed to import zones: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
