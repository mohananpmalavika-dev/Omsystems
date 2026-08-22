/**
 * Spill Detector
 * Detects liquid spills using AI model with motion-based fallback
 */

import { randomUUID } from 'node:crypto';
import type { ObjectTracker, MultiObjectTracker, TrackedObject } from './object-tracker.js';
import type { ZoneEngine } from './zone-engine.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface SpillDetection {
  id: string;
  type: 'oil' | 'water' | 'chemical' | 'liquid' | 'unknown';
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  location: { x: number; y: number };
  area: number; // Estimated area in square meters
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectionMethod: 'ai' | 'motion' | 'hybrid';
  firstDetected: Date;
  lastDetected: Date;
  duration: number; // seconds
  isGrowing: boolean;
  growthRate?: number; // area increase per second
  peopleNearby: number;
  slipRisk: number; // 0-100
  metadata?: {
    color?: string;
    reflectivity?: number;
    viscosity?: 'low' | 'medium' | 'high';
    spreading?: boolean;
  };
}

export interface SpillIncident {
  id: string;
  spillId: string;
  type: SpillDetection['type'];
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: { x: number; y: number };
  area: number;
  zoneId?: string;
  zoneName?: string;
  peopleAffected: string[]; // Person track IDs
  slipIncidents: number;
  startedAt: Date;
  lastUpdated: Date;
  duration: number;
  resolved: boolean;
  resolvedAt?: Date;
  cleanupStarted?: Date;
  responseTime?: number; // seconds
}

export interface BackgroundModel {
  width: number;
  height: number;
  data: Float32Array;
  lastUpdate: Date;
}

export interface SpillAnalytics {
  totalSpills: number;
  activeSpills: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  totalArea: number; // square meters
  averageDuration: number; // seconds
  peopleAffected: number;
  slipIncidents: number;
  averageResponseTime: number; // seconds
}

// ============================================================================
// Spill Detector
// ============================================================================

export class SpillDetector {
  private objectTracker: ObjectTracker | MultiObjectTracker;
  private zoneEngine: ZoneEngine;
  private activeSpills = new Map<string, SpillDetection>();
  private incidents = new Map<string, SpillIncident>();
  private incidentHistory: SpillIncident[] = [];
  private backgroundModel?: BackgroundModel;
  private readonly maxHistorySize = 5000;
  
  // Configuration
  private readonly minSpillArea = 0.01; // 0.01 square meters (100 cm²)
  private readonly slipRiskRadius = 2.0; // meters
  private readonly growthThreshold = 0.001; // area increase threshold
  private readonly stableFramesRequired = 10; // frames before confirming spill
  private readonly aiConfidenceThreshold = 0.6;
  
  // Spill classes for AI detection
  private readonly spillClasses = [
    'oil_spill', 'water_spill', 'chemical_spill', 
    'liquid_spill', 'spill', 'puddle', 'leak'
  ];

  constructor(objectTracker: ObjectTracker | MultiObjectTracker, zoneEngine: ZoneEngine) {
    this.objectTracker = objectTracker;
    this.zoneEngine = zoneEngine;
    this.startSpillMonitoring();
  }

  // ============================================================================
  // Detection Methods
  // ============================================================================

  /**
   * Detect spills using AI and/or motion analysis
   */
  async detectSpills(
    frame: { 
      data: Uint8Array | Buffer; 
      width: number; 
      height: number;
      timestamp: Date;
    },
    useAI: boolean = true
  ): Promise<SpillDetection[]> {
    const detections: SpillDetection[] = [];

    // Try AI detection first
    if (useAI) {
      const aiDetections = await this.detectSpillsAI(frame);
      detections.push(...aiDetections);
    }

    // Use motion-based fallback if AI unavailable or low confidence
    if (!useAI || detections.length === 0) {
      const motionDetections = this.detectSpillsMotion(frame);
      detections.push(...motionDetections);
    }

    // Update active spills
    this.updateActiveSpills(detections, frame.timestamp);

    // Analyze risk and update incidents
    this.analyzeSpillRisk(frame.timestamp);

    return this.getActiveSpills();
  }

  /**
   * Detect spills using AI model
   */
  private async detectSpillsAI(frame: {
    data: Uint8Array | Buffer;
    width: number;
    height: number;
    timestamp: Date;
  }): Promise<SpillDetection[]> {
    // This would integrate with YOLO or similar model
    // For now, return empty array - would be implemented with actual model
    return [];
  }

  /**
   * Detect spills using motion-based analysis (fallback method)
   */
  private detectSpillsMotion(frame: {
    data: Uint8Array | Buffer;
    width: number;
    height: number;
    timestamp: Date;
  }): SpillDetection[] {
    const detections: SpillDetection[] = [];

    // Initialize background model if needed
    if (!this.backgroundModel) {
      this.initializeBackgroundModel(frame);
      return detections;
    }

    // Detect new static blobs (potential spills)
    const blobs = this.detectStaticBlobs(frame);

    for (const blob of blobs) {
      // Check if blob has spill characteristics
      if (this.isLikelySpill(blob, frame)) {
        const detection: SpillDetection = {
          id: `spill_${randomUUID().substring(0, 8)}`,
          type: this.classifySpillType(blob),
          confidence: blob.confidence,
          boundingBox: blob.boundingBox,
          location: {
            x: blob.boundingBox.x + blob.boundingBox.width / 2,
            y: blob.boundingBox.y + blob.boundingBox.height / 2,
          },
          area: this.estimateArea(blob.boundingBox),
          severity: this.calculateSpillSeverity(blob),
          detectionMethod: 'motion',
          firstDetected: frame.timestamp,
          lastDetected: frame.timestamp,
          duration: 0,
          isGrowing: false,
          peopleNearby: 0,
          slipRisk: 0,
          metadata: {
            reflectivity: blob.reflectivity,
            spreading: blob.spreading,
          },
        };

        detections.push(detection);
      }
    }

    // Update background model
    this.updateBackgroundModel(frame);

    return detections;
  }

  // ============================================================================
  // Background Subtraction Methods
  // ============================================================================

  /**
   * Initialize background model
   */
  private initializeBackgroundModel(frame: {
    data: Uint8Array | Buffer;
    width: number;
    height: number;
    timestamp: Date;
  }): void {
    const data = new Float32Array(frame.width * frame.height);
    
    // Convert to grayscale and store
    for (let i = 0; i < frame.width * frame.height; i++) {
      const r = frame.data[i * 3];
      const g = frame.data[i * 3 + 1];
      const b = frame.data[i * 3 + 2];
      data[i] = (r + g + b) / 3;
    }

    this.backgroundModel = {
      width: frame.width,
      height: frame.height,
      data,
      lastUpdate: frame.timestamp,
    };
  }

  /**
   * Update background model
   */
  private updateBackgroundModel(frame: {
    data: Uint8Array | Buffer;
    width: number;
    height: number;
  }): void {
    if (!this.backgroundModel) return;

    const alpha = 0.01; // Learning rate

    for (let i = 0; i < frame.width * frame.height; i++) {
      const r = frame.data[i * 3] || 0;
      const g = frame.data[i * 3 + 1] || 0;
      const b = frame.data[i * 3 + 2] || 0;
      const gray = (r + g + b) / 3;

      this.backgroundModel.data[i] = 
        alpha * gray + (1 - alpha) * this.backgroundModel.data[i];
    }
  }

  /**
   * Detect static blobs (potential spills)
   */
  private detectStaticBlobs(frame: {
    data: Uint8Array | Buffer;
    width: number;
    height: number;
  }): Array<{
    boundingBox: { x: number; y: number; width: number; height: number };
    confidence: number;
    reflectivity: number;
    spreading: boolean;
  }> {
    // Simplified blob detection - would use proper computer vision in production
    return [];
  }

  /**
   * Check if blob has spill characteristics
   */
  private isLikelySpill(blob: any, frame: any): boolean {
    // Check for:
    // 1. Reflective surface (liquid characteristic)
    // 2. Irregular shape
    // 3. Static (not moving)
    // 4. Minimum size threshold
    
    const hasMinSize = this.estimateArea(blob.boundingBox) >= this.minSpillArea;
    const isReflective = blob.reflectivity > 0.5;
    
    return hasMinSize && isReflective;
  }

  /**
   * Classify spill type based on visual characteristics
   */
  private classifySpillType(blob: any): SpillDetection['type'] {
    // Would analyze color, viscosity, spread pattern
    // For now, return unknown
    return 'unknown';
  }

  // ============================================================================
  // Spill Management
  // ============================================================================

  /**
   * Update active spills with new detections
   */
  private updateActiveSpills(detections: SpillDetection[], timestamp: Date): void {
    // Match detections to existing spills
    for (const detection of detections) {
      let matched = false;

      for (const [id, existingSpill] of this.activeSpills.entries()) {
        const distance = this.calculateDistance(
          detection.location,
          existingSpill.location
        );

        if (distance < 1.0) { // Within 1 meter
          // Update existing spill
          existingSpill.lastDetected = timestamp;
          existingSpill.duration = 
            (timestamp.getTime() - existingSpill.firstDetected.getTime()) / 1000;
          
          // Check growth
          const oldArea = existingSpill.area;
          existingSpill.area = detection.area;
          existingSpill.isGrowing = detection.area > oldArea + this.growthThreshold;
          
          if (existingSpill.isGrowing && existingSpill.duration > 0) {
            existingSpill.growthRate = 
              (detection.area - oldArea) / existingSpill.duration;
          }

          matched = true;
          break;
        }
      }

      if (!matched) {
        // New spill
        this.activeSpills.set(detection.id, detection);
      }
    }

    // Remove stale spills (not detected in 30 seconds)
    const staleThreshold = 30000;
    const toRemove: string[] = [];

    for (const [id, spill] of this.activeSpills.entries()) {
      const age = timestamp.getTime() - spill.lastDetected.getTime();
      if (age > staleThreshold) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.activeSpills.delete(id);
    }
  }

  /**
   * Analyze spill risk based on people nearby
   */
  private analyzeSpillRisk(timestamp: Date): void {
    // Handle both ObjectTracker and MultiObjectTracker
    const allTracks = 'getActiveTracks' in this.objectTracker
      ? this.objectTracker.getActiveTracks()
      : this.objectTracker.getAllTracks();
    
    const trackedPersons = allTracks.filter(track => track.label === 'person');

    for (const spill of this.activeSpills.values()) {
      // Count people nearby
      let peopleNearby = 0;
      const peopleAffected: string[] = [];

      for (const person of trackedPersons) {
        const personLocation = {
          x: person.position.x,
          y: person.position.y,
        };

        const distance = this.calculateDistance(spill.location, personLocation);

        if (distance < this.slipRiskRadius) {
          peopleNearby++;
          peopleAffected.push(person.trackId);
        }
      }

      spill.peopleNearby = peopleNearby;

      // Calculate slip risk (0-100)
      let slipRisk = 0;
      
      // Base risk on spill type
      const typeRisk: Record<string, number> = {
        oil: 90,
        water: 60,
        chemical: 70,
        liquid: 50,
        unknown: 40,
      };
      slipRisk += typeRisk[spill.type] || 40;

      // Increase risk for larger spills
      slipRisk += Math.min(spill.area * 10, 20);

      // Increase risk if people nearby
      if (peopleNearby > 0) {
        slipRisk += peopleNearby * 5;
      }

      spill.slipRisk = Math.min(slipRisk, 100);

      // Update or create incident
      this.updateSpillIncident(spill, peopleAffected, timestamp);
    }
  }

  // ============================================================================
  // Incident Management
  // ============================================================================

  /**
   * Update spill incident
   */
  private updateSpillIncident(
    spill: SpillDetection,
    peopleAffected: string[],
    timestamp: Date
  ): void {
    const existing = this.incidents.get(spill.id);

    if (existing && !existing.resolved) {
      // Update existing incident
      existing.lastUpdated = timestamp;
      existing.duration = (timestamp.getTime() - existing.startedAt.getTime()) / 1000;
      existing.area = spill.area;
      existing.peopleAffected = peopleAffected;
      existing.severity = spill.severity;
      return;
    }

    // Create new incident
    const zone = this.zoneEngine.getAllZones().find(z =>
      this.isPointInZone({ x: spill.location.x, y: spill.location.y }, z.polygon)
    );

    const incident: SpillIncident = {
      id: `incident_${randomUUID().substring(0, 8)}`,
      spillId: spill.id,
      type: spill.type,
      severity: spill.severity,
      location: spill.location,
      area: spill.area,
      zoneId: zone?.id,
      zoneName: zone?.name,
      peopleAffected,
      slipIncidents: 0,
      startedAt: timestamp,
      lastUpdated: timestamp,
      duration: 0,
      resolved: false,
    };

    this.incidents.set(spill.id, incident);
    this.incidentHistory.push(incident);

    if (this.incidentHistory.length > this.maxHistorySize) {
      this.incidentHistory.shift();
    }
  }

  /**
   * Resolve spill incident
   */
  resolveIncident(spillId: string, timestamp: Date = new Date()): void {
    const incident = this.incidents.get(spillId);
    if (incident && !incident.resolved) {
      incident.resolved = true;
      incident.resolvedAt = timestamp;
      incident.duration = (timestamp.getTime() - incident.startedAt.getTime()) / 1000;
      
      if (incident.cleanupStarted) {
        incident.responseTime = 
          (incident.cleanupStarted.getTime() - incident.startedAt.getTime()) / 1000;
      }

      this.incidents.delete(spillId);
      this.activeSpills.delete(spillId);
    }
  }

  /**
   * Mark cleanup started
   */
  markCleanupStarted(spillId: string, timestamp: Date = new Date()): void {
    const incident = this.incidents.get(spillId);
    if (incident) {
      incident.cleanupStarted = timestamp;
    }
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get active spills
   */
  getActiveSpills(): SpillDetection[] {
    return Array.from(this.activeSpills.values());
  }

  /**
   * Get spill by ID
   */
  getSpill(spillId: string): SpillDetection | undefined {
    return this.activeSpills.get(spillId);
  }

  /**
   * Get active incidents
   */
  getActiveIncidents(): SpillIncident[] {
    return Array.from(this.incidents.values()).filter(i => !i.resolved);
  }

  /**
   * Get all incidents (including resolved)
   */
  getAllIncidents(includeResolved: boolean = false): SpillIncident[] {
    return includeResolved ? this.incidentHistory : this.getActiveIncidents();
  }

  /**
   * Get spills by severity
   */
  getSpillsBySeverity(severity: SpillDetection['severity']): SpillDetection[] {
    return this.getActiveSpills().filter(s => s.severity === severity);
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  /**
   * Get spill analytics
   */
  getAnalytics(): SpillAnalytics {
    const activeSpills = this.getActiveSpills();
    const allIncidents = this.getAllIncidents(true);

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {
      low: 0, medium: 0, high: 0, critical: 0,
    };

    let totalArea = 0;
    const peopleAffectedSet = new Set<string>();

    for (const spill of activeSpills) {
      byType[spill.type] = (byType[spill.type] || 0) + 1;
      bySeverity[spill.severity]++;
      totalArea += spill.area;
    }

    let totalDuration = 0;
    let slipIncidents = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;

    for (const incident of allIncidents) {
      totalDuration += incident.duration;
      slipIncidents += incident.slipIncidents;
      
      for (const personId of incident.peopleAffected) {
        peopleAffectedSet.add(personId);
      }

      if (incident.responseTime) {
        totalResponseTime += incident.responseTime;
        responseTimeCount++;
      }
    }

    return {
      totalSpills: allIncidents.length,
      activeSpills: activeSpills.length,
      byType,
      bySeverity,
      totalArea: Math.round(totalArea * 100) / 100,
      averageDuration: allIncidents.length > 0 
        ? Math.round(totalDuration / allIncidents.length) 
        : 0,
      peopleAffected: peopleAffectedSet.size,
      slipIncidents,
      averageResponseTime: responseTimeCount > 0
        ? Math.round(totalResponseTime / responseTimeCount)
        : 0,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Calculate distance between two points
   */
  private calculateDistance(
    p1: { x: number; y: number },
    p2: { x: number; y: number }
  ): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  /**
   * Estimate spill area from bounding box
   */
  private estimateArea(bbox: { width: number; height: number }): number {
    // Assume elliptical shape and convert to square meters
    return Math.PI * (bbox.width / 2) * (bbox.height / 2);
  }

  /**
   * Calculate spill severity
   */
  private calculateSpillSeverity(blob: any): SpillDetection['severity'] {
    const area = this.estimateArea(blob.boundingBox);

    if (area > 5) return 'critical'; // > 5 m²
    if (area > 2) return 'high';     // > 2 m²
    if (area > 0.5) return 'medium'; // > 0.5 m²
    return 'low';
  }

  /**
   * Check if point is in zone
   */
  private isPointInZone(
    point: { x: number; y: number },
    polygon: Array<{ x: number; y: number }>
  ): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // ============================================================================
  // Monitoring
  // ============================================================================

  /**
   * Start periodic spill monitoring
   */
  private startSpillMonitoring(): void {
    setInterval(() => {
      const now = new Date();
      
      // Update spill risk
      this.analyzeSpillRisk(now);

      // Clean up old incidents
      this.cleanupOldIncidents();
    }, 5000); // Every 5 seconds
  }

  /**
   * Clean up old resolved incidents
   */
  private cleanupOldIncidents(): void {
    const maxAge = 3600000; // 1 hour
    const now = Date.now();

    this.incidentHistory = this.incidentHistory.filter(i => {
      if (!i.resolved) return true;
      if (!i.resolvedAt) return true;
      return (now - i.resolvedAt.getTime()) < maxAge;
    });
  }

  /**
   * Get health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeSpills: number;
    criticalSpills: number;
    highRiskSpills: number;
  } {
    const activeSpills = this.getActiveSpills();
    const criticalSpills = activeSpills.filter(s => s.severity === 'critical').length;
    const highRiskSpills = activeSpills.filter(s => s.slipRisk > 70).length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (criticalSpills > 0) status = 'unhealthy';
    else if (activeSpills.length > 0) status = 'degraded';

    return {
      status,
      activeSpills: activeSpills.length,
      criticalSpills,
      highRiskSpills,
    };
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    this.activeSpills.clear();
    this.incidents.clear();
    this.incidentHistory = [];
    this.backgroundModel = undefined;
  }
}
