/**
 * Emergency Exit Monitor
 * Detects exit blockages, crowding, and clearance violations
 */

import { randomUUID } from 'node:crypto';
import type { ZoneEngine } from './zone-engine.js';
import type { ObjectTracker, MultiObjectTracker, TrackedObject, BoundingBox } from './object-tracker.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ExitZone {
  id: string;
  name: string;
  location: string;
  polygon: Array<{ x: number; y: number }>;
  clearanceRequired: number; // meters
  maxOccupancy?: number; // Max people in exit zone
  exitType: 'primary' | 'secondary' | 'emergency';
  evacuationCapacity: number; // People per minute
  requiresClearPath: boolean;
  metadata?: Record<string, unknown>;
}

export interface ExitBlockage {
  id: string;
  exitId: string;
  exitName: string;
  blockageType: 'object' | 'crowd' | 'vehicle' | 'obstruction';
  severity: 'low' | 'medium' | 'high' | 'critical';
  overlapPercentage: number;
  blockingObjects: Array<{
    trackId: string;
    label: string;
    boundingBox: BoundingBox;
  }>;
  startedAt: Date;
  lastDetected: Date;
  duration: number; // seconds
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ExitStatus {
  exitId: string;
  exitName: string;
  isBlocked: boolean;
  isCrowded: boolean;
  currentOccupancy: number;
  maxOccupancy?: number;
  clearanceViolations: number;
  activeBlockages: ExitBlockage[];
  status: 'clear' | 'warning' | 'blocked' | 'critical';
  lastChecked: Date;
}

export interface ExitAnalytics {
  exitId: string;
  exitName: string;
  totalBlockages: number;
  averageBlockageDuration: number; // seconds
  longestBlockage: number; // seconds
  blockagesByType: Record<string, number>;
  averageOccupancy: number;
  peakOccupancy: number;
  evacuationReadiness: number; // 0-100 score
}

// ============================================================================
// Emergency Exit Monitor
// ============================================================================

export class EmergencyExitMonitor {
  private zoneEngine: ZoneEngine;
  private objectTracker: ObjectTracker | MultiObjectTracker;
  private exitZones = new Map<string, ExitZone>();
  private activeBlockages = new Map<string, ExitBlockage>();
  private blockageHistory: ExitBlockage[] = [];
  private occupancyHistory = new Map<string, number[]>();
  private readonly maxHistorySize = 10000;
  private readonly gracePerodMs = 10000; // 10 seconds before alerting

  // Object types that can block exits
  private readonly blockingObjectTypes = [
    'box', 'carton', 'crate', 'pallet',
    'chair', 'table', 'furniture',
    'vehicle', 'cart', 'trolley',
    'trash', 'debris', 'equipment',
    'barrel', 'container'
  ];

  constructor(zoneEngine: ZoneEngine, objectTracker: ObjectTracker | MultiObjectTracker) {
    this.zoneEngine = zoneEngine;
    this.objectTracker = objectTracker;
    this.startExitMonitoring();
  }

  // ============================================================================
  // Exit Management
  // ============================================================================

  /**
   * Register emergency exit zone
   */
  registerExit(exit: Omit<ExitZone, 'id'>): ExitZone {
    const id = `exit_${randomUUID().substring(0, 8)}`;
    const exitZone: ExitZone = { id, ...exit };

    this.exitZones.set(id, exitZone);
    this.occupancyHistory.set(id, []);

    console.log(`✓ Registered emergency exit: ${exit.name} (${id})`);
    return exitZone;
  }

  /**
   * Update exit configuration
   */
  updateExit(exitId: string, updates: Partial<ExitZone>): void {
    const exit = this.exitZones.get(exitId);
    if (!exit) throw new Error(`Exit not found: ${exitId}`);
    Object.assign(exit, updates);
  }

  /**
   * Remove exit
   */
  removeExit(exitId: string): void {
    this.exitZones.delete(exitId);
    this.occupancyHistory.delete(exitId);
  }

  /**
   * Get exit
   */
  getExit(exitId: string): ExitZone | undefined {
    return this.exitZones.get(exitId);
  }

  /**
   * Get all exits
   */
  getAllExits(): ExitZone[] {
    return Array.from(this.exitZones.values());
  }

  // ============================================================================
  // Blockage Detection
  // ============================================================================

  /**
   * Check all exits for blockages
   */
  checkAllExits(timestamp: Date = new Date()): ExitStatus[] {
    const statuses: ExitStatus[] = [];

    for (const exit of this.exitZones.values()) {
      const status = this.checkExit(exit, timestamp);
      statuses.push(status);
    }

    return statuses;
  }

  /**
   * Check single exit for blockages
   */
  checkExit(exit: ExitZone, timestamp: Date): ExitStatus {
    // Handle both ObjectTracker and MultiObjectTracker
    const trackedObjects = 'getActiveTracks' in this.objectTracker
      ? this.objectTracker.getActiveTracks()
      : this.objectTracker.getAllTracks();

    // Get objects in exit polygon
    const objectsInExit = this.getObjectsInPolygon(trackedObjects, exit.polygon);

    // Separate people from objects
    const people = objectsInExit.filter(o => o.label === 'person');
    const objects = objectsInExit.filter(o => 
      this.blockingObjectTypes.includes(o.label) || o.label !== 'person'
    );

    // Check for object blockages
    const objectBlockages = this.detectObjectBlockages(exit, objects, timestamp);

    // Check for crowding
    const crowdBlockage = this.detectCrowding(exit, people, timestamp);

    // Check clearance violations
    const clearanceViolations = this.checkClearanceViolations(exit, objects);

    // Combine all blockages
    const allBlockages = [...objectBlockages];
    if (crowdBlockage) allBlockages.push(crowdBlockage);

    // Update occupancy history
    this.updateOccupancyHistory(exit.id, people.length);

    // Determine exit status
    const isBlocked = allBlockages.some(b => b.severity === 'high' || b.severity === 'critical');
    const isCrowded = crowdBlockage !== null;
    const currentOccupancy = people.length;

    let status: ExitStatus['status'] = 'clear';
    if (allBlockages.some(b => b.severity === 'critical')) {
      status = 'critical';
    } else if (isBlocked) {
      status = 'blocked';
    } else if (clearanceViolations > 0 || isCrowded) {
      status = 'warning';
    }

    return {
      exitId: exit.id,
      exitName: exit.name,
      isBlocked,
      isCrowded,
      currentOccupancy,
      maxOccupancy: exit.maxOccupancy,
      clearanceViolations,
      activeBlockages: allBlockages,
      status,
      lastChecked: timestamp,
    };
  }

  /**
   * Detect object blockages in exit
   */
  private detectObjectBlockages(
    exit: ExitZone,
    objects: TrackedObject[],
    timestamp: Date
  ): ExitBlockage[] {
    const blockages: ExitBlockage[] = [];

    if (objects.length === 0) {
      // No objects - resolve any existing blockages
      this.resolveExitBlockages(exit.id, 'object', timestamp);
      return blockages;
    }

    // Calculate total overlap
    let totalOverlap = 0;
    const blockingObjects: ExitBlockage['blockingObjects'] = [];

    for (const obj of objects) {
      const overlap = this.calculatePolygonOverlap(
        this.boundingBoxToPolygon(obj.boundingBox),
        exit.polygon
      );

      if (overlap > 5) { // More than 5% overlap
        totalOverlap += overlap;
        blockingObjects.push({
          trackId: obj.trackId,
          label: obj.label,
          boundingBox: obj.boundingBox,
        });
      }
    }

    // Create or update blockage
    if (totalOverlap > 10) { // Threshold for blockage
      const severity = this.calculateBlockageSeverity(totalOverlap, objects.length);
      const blockage = this.createOrUpdateBlockage({
        exitId: exit.id,
        exitName: exit.name,
        blockageType: 'object',
        severity,
        overlapPercentage: Math.min(totalOverlap, 100),
        blockingObjects,
        timestamp,
      });

      // Only alert after grace period
      if (blockage.duration >= this.gracePerodMs / 1000) {
        blockages.push(blockage);
      }
    } else {
      this.resolveExitBlockages(exit.id, 'object', timestamp);
    }

    return blockages;
  }

  /**
   * Detect crowding at exit
   */
  private detectCrowding(
    exit: ExitZone,
    people: TrackedObject[],
    timestamp: Date
  ): ExitBlockage | null {
    const currentOccupancy = people.length;
    const maxOccupancy = exit.maxOccupancy || Infinity;

    if (currentOccupancy <= maxOccupancy) {
      this.resolveExitBlockages(exit.id, 'crowd', timestamp);
      return null;
    }

    // Calculate crowding severity
    const overCapacity = currentOccupancy - maxOccupancy;
    const overCapacityPercent = (overCapacity / maxOccupancy) * 100;

    let severity: ExitBlockage['severity'] = 'low';
    if (overCapacityPercent >= 100) severity = 'critical'; // 2x capacity
    else if (overCapacityPercent >= 50) severity = 'high'; // 1.5x capacity
    else if (overCapacityPercent >= 25) severity = 'medium'; // 1.25x capacity

    return this.createOrUpdateBlockage({
      exitId: exit.id,
      exitName: exit.name,
      blockageType: 'crowd',
      severity,
      overlapPercentage: Math.min((currentOccupancy / maxOccupancy) * 100, 100),
      blockingObjects: people.map(p => ({
        trackId: p.trackId,
        label: 'person',
        boundingBox: p.boundingBox,
      })),
      timestamp,
      metadata: { currentOccupancy, maxOccupancy },
    });
  }

  /**
   * Check clearance violations
   */
  private checkClearanceViolations(exit: ExitZone, objects: TrackedObject[]): number {
    // Count objects too close to exit that could impede evacuation
    return objects.filter(obj => {
      const distance = this.calculateMinDistanceToPolygon(
        this.getCenterPoint(obj.boundingBox),
        exit.polygon
      );
      return distance < exit.clearanceRequired;
    }).length;
  }

  // ============================================================================
  // Blockage Management
  // ============================================================================

  /**
   * Create or update blockage
   */
  private createOrUpdateBlockage(params: {
    exitId: string;
    exitName: string;
    blockageType: ExitBlockage['blockageType'];
    severity: ExitBlockage['severity'];
    overlapPercentage: number;
    blockingObjects: ExitBlockage['blockingObjects'];
    timestamp: Date;
    metadata?: Record<string, unknown>;
  }): ExitBlockage {
    const key = `${params.exitId}_${params.blockageType}`;
    const existing = this.activeBlockages.get(key);

    if (existing && !existing.resolved) {
      // Update existing blockage
      existing.lastDetected = params.timestamp;
      existing.duration = (params.timestamp.getTime() - existing.startedAt.getTime()) / 1000;
      existing.severity = params.severity;
      existing.overlapPercentage = params.overlapPercentage;
      existing.blockingObjects = params.blockingObjects;
      existing.metadata = params.metadata;
      return existing;
    }

    // Create new blockage
    const blockage: ExitBlockage = {
      id: `blockage_${randomUUID().substring(0, 8)}`,
      exitId: params.exitId,
      exitName: params.exitName,
      blockageType: params.blockageType,
      severity: params.severity,
      overlapPercentage: params.overlapPercentage,
      blockingObjects: params.blockingObjects,
      startedAt: params.timestamp,
      lastDetected: params.timestamp,
      duration: 0,
      resolved: false,
      metadata: params.metadata,
    };

    this.activeBlockages.set(key, blockage);
    this.blockageHistory.push(blockage);

    // Limit history
    if (this.blockageHistory.length > this.maxHistorySize) {
      this.blockageHistory.shift();
    }

    return blockage;
  }

  /**
   * Resolve blockages for an exit
   */
  private resolveExitBlockages(
    exitId: string,
    blockageType: ExitBlockage['blockageType'],
    timestamp: Date
  ): void {
    const key = `${exitId}_${blockageType}`;
    const blockage = this.activeBlockages.get(key);

    if (blockage && !blockage.resolved) {
      blockage.resolved = true;
      blockage.resolvedAt = timestamp;
      blockage.duration = (timestamp.getTime() - blockage.startedAt.getTime()) / 1000;
      this.activeBlockages.delete(key);
    }
  }

  /**
   * Get active blockages
   */
  getActiveBlockages(): ExitBlockage[] {
    return Array.from(this.activeBlockages.values()).filter(b => !b.resolved);
  }

  /**
   * Get blockages for exit
   */
  getExitBlockages(exitId: string, includeResolved = false): ExitBlockage[] {
    const source = includeResolved ? this.blockageHistory : this.getActiveBlockages();
    return source.filter(b => b.exitId === exitId);
  }

  // ============================================================================
  // Spatial Calculations
  // ============================================================================

  /**
   * Get objects within polygon
   */
  private getObjectsInPolygon(objects: TrackedObject[], polygon: Array<{ x: number; y: number }>): TrackedObject[] {
    return objects.filter(obj => {
      const center = this.getCenterPoint(obj.boundingBox);
      return this.isPointInPolygon(center, polygon);
    });
  }

  /**
   * Point in polygon test
   */
  private isPointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    const { x, y } = point;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Calculate polygon overlap (simplified)
   */
  private calculatePolygonOverlap(poly1: Array<{ x: number; y: number }>, poly2: Array<{ x: number; y: number }>): number {
    const bbox1 = this.getPolygonBoundingBox(poly1);
    const bbox2 = this.getPolygonBoundingBox(poly2);

    const xOverlap = Math.max(0, Math.min(bbox1.maxX, bbox2.maxX) - Math.max(bbox1.minX, bbox2.minX));
    const yOverlap = Math.max(0, Math.min(bbox1.maxY, bbox2.maxY) - Math.max(bbox1.minY, bbox2.minY));

    const intersectionArea = xOverlap * yOverlap;
    const poly1Area = (bbox1.maxX - bbox1.minX) * (bbox1.maxY - bbox1.minY);

    return poly1Area > 0 ? (intersectionArea / poly1Area) * 100 : 0;
  }

  /**
   * Get bounding box for polygon
   */
  private getPolygonBoundingBox(polygon: Array<{ x: number; y: number }>): { minX: number; maxX: number; minY: number; maxY: number } {
    if (polygon.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    let minX = polygon[0].x;
    let maxX = polygon[0].x;
    let minY = polygon[0].y;
    let maxY = polygon[0].y;

    for (const point of polygon) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    return { minX, maxX, minY, maxY };
  }

  /**
   * Convert bounding box to polygon
   */
  private boundingBoxToPolygon(bbox: BoundingBox): Array<{ x: number; y: number }> {
    return [
      { x: bbox.x, y: bbox.y },
      { x: bbox.x + bbox.width, y: bbox.y },
      { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
      { x: bbox.x, y: bbox.y + bbox.height },
    ];
  }

  /**
   * Get center point of bounding box
   */
  private getCenterPoint(bbox: BoundingBox): { x: number; y: number } {
    return {
      x: bbox.x + bbox.width / 2,
      y: bbox.y + bbox.height / 2,
    };
  }

  /**
   * Calculate minimum distance from point to polygon edge
   */
  private calculateMinDistanceToPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): number {
    let minDistance = Infinity;

    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];
      const distance = this.distanceToSegment(point, p1, p2);
      minDistance = Math.min(minDistance, distance);
    }

    return minDistance;
  }

  /**
   * Calculate distance from point to line segment
   */
  private distanceToSegment(
    point: { x: number; y: number },
    segStart: { x: number; y: number },
    segEnd: { x: number; y: number }
  ): number {
    const dx = segEnd.x - segStart.x;
    const dy = segEnd.y - segStart.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return Math.sqrt(
        (point.x - segStart.x) ** 2 + (point.y - segStart.y) ** 2
      );
    }

    const t = Math.max(0, Math.min(1, 
      ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSquared
    ));

    const projX = segStart.x + t * dx;
    const projY = segStart.y + t * dy;

    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Calculate blockage severity
   */
  private calculateBlockageSeverity(overlapPercent: number, objectCount: number): ExitBlockage['severity'] {
    if (overlapPercent >= 75 || objectCount >= 5) return 'critical';
    if (overlapPercent >= 50 || objectCount >= 3) return 'high';
    if (overlapPercent >= 25 || objectCount >= 2) return 'medium';
    return 'low';
  }

  /**
   * Update occupancy history
   */
  private updateOccupancyHistory(exitId: string, occupancy: number): void {
    const history = this.occupancyHistory.get(exitId) || [];
    history.push(occupancy);

    // Keep last 1000 readings
    if (history.length > 1000) {
      history.shift();
    }

    this.occupancyHistory.set(exitId, history);
  }

  // ============================================================================
  // Analytics & Reporting
  // ============================================================================

  /**
   * Get exit analytics
   */
  getExitAnalytics(exitId: string): ExitAnalytics {
    const exit = this.exitZones.get(exitId);
    if (!exit) throw new Error(`Exit not found: ${exitId}`);

    const blockages = this.getExitBlockages(exitId, true);
    const occupancyHistory = this.occupancyHistory.get(exitId) || [];

    const totalBlockages = blockages.length;
    const totalDuration = blockages.reduce((sum, b) => sum + b.duration, 0);
    const averageBlockageDuration = totalBlockages > 0 ? totalDuration / totalBlockages : 0;
    const longestBlockage = Math.max(0, ...blockages.map(b => b.duration));

    const blockagesByType: Record<string, number> = {};
    for (const blockage of blockages) {
      blockagesByType[blockage.blockageType] = (blockagesByType[blockage.blockageType] || 0) + 1;
    }

    const averageOccupancy = occupancyHistory.length > 0
      ? occupancyHistory.reduce((sum, o) => sum + o, 0) / occupancyHistory.length
      : 0;
    const peakOccupancy = Math.max(0, ...occupancyHistory);

    // Calculate evacuation readiness score (0-100)
    const activeBlockages = this.getExitBlockages(exitId, false);
    const hasActiveBlockages = activeBlockages.length > 0;
    const hasCriticalBlockages = activeBlockages.some(b => b.severity === 'critical');
    const isOverCapacity = exit.maxOccupancy && averageOccupancy > exit.maxOccupancy;

    let evacuationReadiness = 100;
    if (hasCriticalBlockages) evacuationReadiness = 0;
    else if (hasActiveBlockages) evacuationReadiness -= 50;
    if (isOverCapacity) evacuationReadiness -= 30;
    evacuationReadiness = Math.max(0, evacuationReadiness);

    return {
      exitId: exit.id,
      exitName: exit.name,
      totalBlockages,
      averageBlockageDuration: Math.round(averageBlockageDuration),
      longestBlockage: Math.round(longestBlockage),
      blockagesByType,
      averageOccupancy: Math.round(averageOccupancy * 10) / 10,
      peakOccupancy,
      evacuationReadiness,
    };
  }

  /**
   * Get all exit analytics
   */
  getAllExitAnalytics(): ExitAnalytics[] {
    return Array.from(this.exitZones.keys()).map(exitId => 
      this.getExitAnalytics(exitId)
    );
  }

  /**
   * Get summary statistics
   */
  getSummaryStatistics(): {
    totalExits: number;
    blockedExits: number;
    clearExits: number;
    totalActiveBlockages: number;
    criticalBlockages: number;
    averageEvacuationReadiness: number;
  } {
    const allStatuses = this.checkAllExits();
    const analytics = this.getAllExitAnalytics();

    const totalExits = allStatuses.length;
    const blockedExits = allStatuses.filter(s => s.status === 'blocked' || s.status === 'critical').length;
    const clearExits = allStatuses.filter(s => s.status === 'clear').length;
    const totalActiveBlockages = this.getActiveBlockages().length;
    const criticalBlockages = this.getActiveBlockages().filter(b => b.severity === 'critical').length;
    const averageEvacuationReadiness = analytics.length > 0
      ? analytics.reduce((sum, a) => sum + a.evacuationReadiness, 0) / analytics.length
      : 100;

    return {
      totalExits,
      blockedExits,
      clearExits,
      totalActiveBlockages,
      criticalBlockages,
      averageEvacuationReadiness: Math.round(averageEvacuationReadiness),
    };
  }

  // ============================================================================
  // Monitoring
  // ============================================================================

  /**
   * Start periodic exit monitoring
   */
  private startExitMonitoring(): void {
    setInterval(() => {
      const now = new Date();
      
      // Check all exits
      this.checkAllExits(now);

      // Clean up old resolved blockages
      this.cleanupOldBlockages();
    }, 5000); // Every 5 seconds
  }

  /**
   * Clean up old resolved blockages
   */
  private cleanupOldBlockages(): void {
    const maxAge = 3600000; // 1 hour
    const now = Date.now();

    this.blockageHistory = this.blockageHistory.filter(b => {
      if (!b.resolved) return true;
      if (!b.resolvedAt) return true;
      return (now - b.resolvedAt.getTime()) < maxAge;
    });
  }

  /**
   * Get health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    totalExits: number;
    blockedExits: number;
    criticalBlockages: number;
  } {
    const summary = this.getSummaryStatistics();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (summary.criticalBlockages > 0) status = 'unhealthy';
    else if (summary.blockedExits > 0) status = 'degraded';

    return {
      status,
      totalExits: summary.totalExits,
      blockedExits: summary.blockedExits,
      criticalBlockages: summary.criticalBlockages,
    };
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    this.activeBlockages.clear();
    this.blockageHistory = [];
    this.occupancyHistory.clear();
  }
}
