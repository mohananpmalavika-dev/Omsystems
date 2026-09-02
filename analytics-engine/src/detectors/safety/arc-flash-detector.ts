/**
 * Arc Flash Detector
 * Detects electrical arc flash events using brightness/spectral analysis
 */

import { randomUUID } from 'node:crypto';
import type { ZoneEngine } from './zone-engine.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ArcFlashEvent {
  id: string;
  confidence: number | null; // Null because this is heuristic rule-based detection
  heuristicScore: number;
  provenance: "HEURISTIC_RULE_ENGINE";
  location: { x: number; y: number };
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  brightness: number; // Peak brightness (0-255)
  duration: number; // milliseconds
  blueWhiteRatio: number; // Spectral characteristic (0-1)
  firstDetected: Date;
  lastDetected: Date;
  frameCount: number;
  zoneId?: string;
  zoneName?: string;
  isElectricalZone: boolean;
  peopleNearby: number;
  peopleInDanger: string[]; // Person track IDs
  metadata?: {
    temperature?: number; // If thermal sensor available
    currentSpike?: boolean; // If current sensor available
    soundDetected?: boolean; // If audio analysis available
    smokeDetected?: boolean; // Correlation with smoke
    method?: string;
  };
}


export interface ArcFlashIncident {
  id: string;
  eventId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: { x: number; y: number };
  zoneId?: string;
  zoneName?: string;
  peopleAffected: string[];
  injuries: number;
  equipmentDamage: boolean;
  startedAt: Date;
  resolvedAt?: Date;
  duration: number; // seconds
  resolved: boolean;
  responseTime?: number; // seconds
  metadata?: Record<string, unknown>;
}

export interface FrameAnalysis {
  averageBrightness: number;
  maxBrightness: number;
  blueWhiteRatio: number;
  hasFlash: boolean;
  flashLocation?: { x: number; y: number };
  flashArea?: { x: number; y: number; width: number; height: number };
}

export interface ArcFlashAnalytics {
  totalEvents: number;
  activeEvents: number;
  bySeverity: Record<string, number>;
  byZone: Record<string, number>;
  averageDuration: number; // milliseconds
  peopleAffected: number;
  electricalZoneEvents: number;
  correlatedWithSmoke: number;
  averageResponseTime: number; // seconds
}

// ============================================================================
// Arc Flash Detector
// ============================================================================

export class ArcFlashDetector {
  private zoneEngine: ZoneEngine;
  private activeEvents = new Map<string, ArcFlashEvent>();
  private incidents = new Map<string, ArcFlashIncident>();
  private incidentHistory: ArcFlashIncident[] = [];
  private frameHistory: FrameAnalysis[] = [];
  private readonly maxHistorySize = 5000;
  private readonly maxFrameHistory = 100;
  
  // Configuration
  private readonly brightnessThreshold = 200; // 0-255 scale
  private readonly flashDurationMin = 16; // milliseconds (1-10 frames at 60fps)
  private readonly flashDurationMax = 166; // milliseconds
  private readonly blueWhiteThreshold = 0.6; // Characteristic of arc flash
  private readonly rapidDecayFrames = 5; // Frames for decay detection
  private readonly electricalZoneBonus = 0.3; // Confidence boost in electrical zones

  constructor(zoneEngine: ZoneEngine) {
    this.zoneEngine = zoneEngine;
    this.startArcFlashMonitoring();
  }

  // ============================================================================
  // Detection Methods
  // ============================================================================

  /**
   * Detect arc flash in frame
   */
  detectArcFlash(frame: {
    data: Uint8Array | Buffer;
    width: number;
    height: number;
    timestamp: Date;
  }): ArcFlashEvent[] {
    // Analyze frame for flash characteristics
    const analysis = this.analyzeFrame(frame);
    
    // Store frame analysis
    this.frameHistory.push(analysis);
    if (this.frameHistory.length > this.maxFrameHistory) {
      this.frameHistory.shift();
    }

    const events: ArcFlashEvent[] = [];

    // Check if flash detected
    if (analysis.hasFlash && analysis.flashLocation && analysis.flashArea) {
      // Validate flash characteristics
      if (this.isArcFlash(analysis)) {
        // Check if in electrical zone
        const zone = this.findElectricalZone(analysis.flashLocation);
        const isElectricalZone = zone !== undefined;

        // Calculate heuristic score (rule-based brightness & spectral analysis)
        let heuristicScore = 0.5;
        
        // Brightness contribution
        heuristicScore += (analysis.maxBrightness / 255) * 0.2;
        
        // Spectral contribution
        heuristicScore += analysis.blueWhiteRatio * 0.2;
        
        // Electrical zone bonus
        if (isElectricalZone) {
          heuristicScore += this.electricalZoneBonus;
        }
        
        heuristicScore = Math.min(heuristicScore, 1.0);

        // Create or update event
        const event = this.createOrUpdateEvent({
          location: analysis.flashLocation,
          boundingBox: analysis.flashArea,
          brightness: analysis.maxBrightness,
          blueWhiteRatio: analysis.blueWhiteRatio,
          timestamp: frame.timestamp,
          zoneId: zone?.id,
          zoneName: zone?.name,
          isElectricalZone,
          heuristicScore,
        });

        events.push(event);
      }
    }

    // Update existing events (check for decay)
    this.updateEventDecay(frame.timestamp);

    return this.getActiveEvents();
  }

  // ============================================================================
  // Frame Analysis
  // ============================================================================

  /**
   * Analyze frame for flash characteristics
   */
  private analyzeFrame(frame: {
    data: Uint8Array | Buffer;
    width: number;
    height: number;
  }): FrameAnalysis {
    let totalBrightness = 0;
    let maxBrightness = 0;
    let maxBrightnessLocation = { x: 0, y: 0 };
    let blueSum = 0;
    let whiteSum = 0;

    // Analyze each pixel
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const idx = (y * frame.width + x) * 3;
        const r = frame.data[idx] || 0;
        const g = frame.data[idx + 1] || 0;
        const b = frame.data[idx + 2] || 0;

        // Calculate brightness
        const brightness = (r + g + b) / 3;
        totalBrightness += brightness;

        if (brightness > maxBrightness) {
          maxBrightness = brightness;
          maxBrightnessLocation = { x: x / frame.width, y: y / frame.height };
        }

        // Check for blue-white spectrum (characteristic of arc flash)
        if (brightness > this.brightnessThreshold) {
          // Blue-white has high blue and balanced RGB
          const isBlueWhite = b > 200 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30;
          if (isBlueWhite) {
            blueSum += 1;
          }
          whiteSum += 1;
        }
      }
    }

    const averageBrightness = totalBrightness / (frame.width * frame.height);
    const blueWhiteRatio = whiteSum > 0 ? blueSum / whiteSum : 0;
    const hasFlash = maxBrightness > this.brightnessThreshold;

    let flashArea: FrameAnalysis['flashArea'];
    if (hasFlash) {
      // Estimate flash area around brightest point
      flashArea = this.estimateFlashArea(frame, maxBrightnessLocation);
    }

    return {
      averageBrightness,
      maxBrightness,
      blueWhiteRatio,
      hasFlash,
      flashLocation: hasFlash ? maxBrightnessLocation : undefined,
      flashArea,
    };
  }

  /**
   * Estimate flash area around brightest point
   */
  private estimateFlashArea(
    frame: { data: Uint8Array | Buffer; width: number; height: number },
    location: { x: number; y: number }
  ): { x: number; y: number; width: number; height: number } {
    // Convert normalized coordinates to pixels
    const centerX = Math.floor(location.x * frame.width);
    const centerY = Math.floor(location.y * frame.height);

    // Search for bright region boundaries
    let minX = centerX, maxX = centerX;
    let minY = centerY, maxY = centerY;
    const searchRadius = 50; // pixels

    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const x = centerX + dx;
        const y = centerY + dy;

        if (x < 0 || x >= frame.width || y < 0 || y >= frame.height) continue;

        const idx = (y * frame.width + x) * 3;
        const r = frame.data[idx] || 0;
        const g = frame.data[idx + 1] || 0;
        const b = frame.data[idx + 2] || 0;
        const brightness = (r + g + b) / 3;

        if (brightness > this.brightnessThreshold * 0.8) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }

    // Convert back to normalized coordinates
    return {
      x: minX / frame.width,
      y: minY / frame.height,
      width: (maxX - minX) / frame.width,
      height: (maxY - minY) / frame.height,
    };
  }

  /**
   * Check if flash has arc flash characteristics
   */
  private isArcFlash(analysis: FrameAnalysis): boolean {
    // Check brightness threshold
    if (analysis.maxBrightness < this.brightnessThreshold) return false;

    // Check blue-white spectrum
    if (analysis.blueWhiteRatio < this.blueWhiteThreshold) return false;

    // Check for rapid decay (characteristic of arc flash)
    if (!this.hasRapidDecay()) return false;

    return true;
  }

  /**
   * Check for rapid brightness decay
   */
  private hasRapidDecay(): boolean {
    if (this.frameHistory.length < this.rapidDecayFrames) return true;

    const recent = this.frameHistory.slice(-this.rapidDecayFrames);
    
    // Check if brightness is decreasing rapidly
    let decayCount = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].maxBrightness < recent[i - 1].maxBrightness * 0.8) {
        decayCount++;
      }
    }

    return decayCount >= this.rapidDecayFrames - 2;
  }

  /**
   * Find electrical zone containing location
   */
  private findElectricalZone(location: { x: number; y: number }): any {
    const electricalZones = this.zoneEngine.getZonesByType('electrical');
    
    for (const zone of electricalZones) {
      if (this.isPointInPolygon(location, zone.polygon)) {
        return zone;
      }
    }

    return undefined;
  }

  /**
   * Point in polygon test
   */
  private isPointInPolygon(
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
  // Event Management
  // ============================================================================

  /**
   * Create or update arc flash event
   */
  private createOrUpdateEvent(params: {
    location: { x: number; y: number };
    boundingBox: { x: number; y: number; width: number; height: number };
    brightness: number;
    blueWhiteRatio: number;
    timestamp: Date;
    zoneId?: string;
    zoneName?: string;
    isElectricalZone: boolean;
    heuristicScore: number;
  }): ArcFlashEvent {
    // Check for nearby existing event
    let existingEvent: ArcFlashEvent | undefined;
    
    for (const event of this.activeEvents.values()) {
      const distance = this.calculateDistance(params.location, event.location);
      if (distance < 0.1) { // Within 10% of frame
        existingEvent = event;
        break;
      }
    }

    if (existingEvent) {
      // Update existing event
      existingEvent.lastDetected = params.timestamp;
      existingEvent.frameCount++;
      existingEvent.duration = 
        existingEvent.lastDetected.getTime() - existingEvent.firstDetected.getTime();
      existingEvent.brightness = Math.max(existingEvent.brightness, params.brightness);
      existingEvent.heuristicScore = Math.max(existingEvent.heuristicScore, params.heuristicScore);
      return existingEvent;
    }

    // Create new event
    const severity = this.calculateSeverity(params);
    
    const event: ArcFlashEvent = {
      id: `arc_${randomUUID().substring(0, 8)}`,
      confidence: null, // Confidence is null for heuristic image analysis
      heuristicScore: params.heuristicScore,
      provenance: "HEURISTIC_RULE_ENGINE",
      location: params.location,
      boundingBox: params.boundingBox,
      severity,
      brightness: params.brightness,
      duration: 0,
      blueWhiteRatio: params.blueWhiteRatio,
      firstDetected: params.timestamp,
      lastDetected: params.timestamp,
      frameCount: 1,
      zoneId: params.zoneId,
      zoneName: params.zoneName,
      isElectricalZone: params.isElectricalZone,
      peopleNearby: 0,
      peopleInDanger: [],
      metadata: {
        method: "HEURISTIC_RULE_ENGINE",
      },
    };


    this.activeEvents.set(event.id, event);
    this.createIncident(event);

    return event;
  }

  /**
   * Update event decay (remove stale events)
   */
  private updateEventDecay(timestamp: Date): void {
    const maxAge = 1000; // 1 second
    const toRemove: string[] = [];

    for (const [id, event] of this.activeEvents.entries()) {
      const age = timestamp.getTime() - event.lastDetected.getTime();
      
      if (age > maxAge) {
        // Check duration validity
        if (event.duration >= this.flashDurationMin && 
            event.duration <= this.flashDurationMax) {
          // Valid arc flash - keep in incidents
          this.resolveIncident(event.id, timestamp);
        } else {
          // Invalid duration - likely false positive
          const incident = this.incidents.get(event.id);
          if (incident) {
            incident.resolved = true;
            incident.resolvedAt = timestamp;
            this.incidents.delete(event.id);
          }
        }
        
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.activeEvents.delete(id);
    }
  }

  /**
   * Calculate event severity
   */
  private calculateSeverity(params: {
    brightness: number;
    isElectricalZone: boolean;
    boundingBox: { width: number; height: number };
  }): ArcFlashEvent['severity'] {
    let score = 0;

    // Brightness contribution
    if (params.brightness > 250) score += 3;
    else if (params.brightness > 230) score += 2;
    else score += 1;

    // Electrical zone
    if (params.isElectricalZone) score += 2;

    // Flash size
    const area = params.boundingBox.width * params.boundingBox.height;
    if (area > 0.1) score += 2;
    else if (area > 0.05) score += 1;

    if (score >= 6) return 'critical';
    if (score >= 4) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  // ============================================================================
  // Incident Management
  // ============================================================================

  /**
   * Create incident from arc flash event
   */
  private createIncident(event: ArcFlashEvent): void {
    const incident: ArcFlashIncident = {
      id: `incident_${randomUUID().substring(0, 8)}`,
      eventId: event.id,
      severity: event.severity,
      location: event.location,
      zoneId: event.zoneId,
      zoneName: event.zoneName,
      peopleAffected: [],
      injuries: 0,
      equipmentDamage: event.isElectricalZone,
      startedAt: event.firstDetected,
      duration: 0,
      resolved: false,
    };

    this.incidents.set(event.id, incident);
    this.incidentHistory.push(incident);

    if (this.incidentHistory.length > this.maxHistorySize) {
      this.incidentHistory.shift();
    }
  }

  /**
   * Resolve incident
   */
  private resolveIncident(eventId: string, timestamp: Date): void {
    const incident = this.incidents.get(eventId);
    if (incident && !incident.resolved) {
      incident.resolved = true;
      incident.resolvedAt = timestamp;
      incident.duration = 
        (timestamp.getTime() - incident.startedAt.getTime()) / 1000;
      this.incidents.delete(eventId);
    }
  }

  /**
   * Update incident with sensor data
   */
  updateIncidentWithSensorData(
    eventId: string,
    sensorData: {
      temperature?: number;
      currentSpike?: boolean;
      soundDetected?: boolean;
      smokeDetected?: boolean;
    }
  ): void {
    const event = this.activeEvents.get(eventId);
    if (event) {
      event.metadata = { ...event.metadata, ...sensorData };
      
      // Boost confidence with correlated sensor data
      if (sensorData.currentSpike) event.confidence = Math.min(event.confidence + 0.2, 1.0);
      if (sensorData.smokeDetected) event.confidence = Math.min(event.confidence + 0.1, 1.0);
      if (sensorData.soundDetected) event.confidence = Math.min(event.confidence + 0.1, 1.0);
    }
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get active events
   */
  getActiveEvents(): ArcFlashEvent[] {
    return Array.from(this.activeEvents.values());
  }

  /**
   * Get event by ID
   */
  getEvent(eventId: string): ArcFlashEvent | undefined {
    return this.activeEvents.get(eventId);
  }

  /**
   * Get active incidents
   */
  getActiveIncidents(): ArcFlashIncident[] {
    return Array.from(this.incidents.values()).filter(i => !i.resolved);
  }

  /**
   * Get all incidents
   */
  getAllIncidents(includeResolved: boolean = false): ArcFlashIncident[] {
    return includeResolved ? this.incidentHistory : this.getActiveIncidents();
  }

  /**
   * Get events by severity
   */
  getEventsBySeverity(severity: ArcFlashEvent['severity']): ArcFlashEvent[] {
    return this.getActiveEvents().filter(e => e.severity === severity);
  }

  /**
   * Get events in electrical zones
   */
  getElectricalZoneEvents(): ArcFlashEvent[] {
    return this.getActiveEvents().filter(e => e.isElectricalZone);
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  /**
   * Get analytics
   */
  getAnalytics(): ArcFlashAnalytics {
    const activeEvents = this.getActiveEvents();
    const allIncidents = this.getAllIncidents(true);

    const bySeverity: Record<string, number> = {
      low: 0, medium: 0, high: 0, critical: 0,
    };
    const byZone: Record<string, number> = {};

    for (const event of activeEvents) {
      bySeverity[event.severity]++;
      if (event.zoneName) {
        byZone[event.zoneName] = (byZone[event.zoneName] || 0) + 1;
      }
    }

    const totalDuration = activeEvents.reduce((sum, e) => sum + e.duration, 0);
    const averageDuration = activeEvents.length > 0 
      ? totalDuration / activeEvents.length 
      : 0;

    const peopleAffectedSet = new Set<string>();
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    let correlatedWithSmoke = 0;

    for (const incident of allIncidents) {
      for (const personId of incident.peopleAffected) {
        peopleAffectedSet.add(personId);
      }

      if (incident.responseTime) {
        totalResponseTime += incident.responseTime;
        responseTimeCount++;
      }

      // Check for smoke correlation
      const event = this.activeEvents.get(incident.eventId);
      if (event?.metadata?.smokeDetected) {
        correlatedWithSmoke++;
      }
    }

    const electricalZoneEvents = activeEvents.filter(e => e.isElectricalZone).length;

    return {
      totalEvents: allIncidents.length,
      activeEvents: activeEvents.length,
      bySeverity,
      byZone,
      averageDuration: Math.round(averageDuration),
      peopleAffected: peopleAffectedSet.size,
      electricalZoneEvents,
      correlatedWithSmoke,
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

  // ============================================================================
  // Monitoring
  // ============================================================================

  /**
   * Start periodic monitoring
   */
  private startArcFlashMonitoring(): void {
    setInterval(() => {
      const now = new Date();
      
      // Update event decay
      this.updateEventDecay(now);

      // Clean up old incidents
      this.cleanupOldIncidents();
    }, 1000); // Every second
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
    activeEvents: number;
    criticalEvents: number;
    electricalZoneEvents: number;
  } {
    const activeEvents = this.getActiveEvents();
    const criticalEvents = activeEvents.filter(e => e.severity === 'critical').length;
    const electricalZoneEvents = activeEvents.filter(e => e.isElectricalZone).length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (criticalEvents > 0) status = 'unhealthy';
    else if (activeEvents.length > 0) status = 'degraded';

    return {
      status,
      activeEvents: activeEvents.length,
      criticalEvents,
      electricalZoneEvents,
    };
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    this.activeEvents.clear();
    this.incidents.clear();
    this.incidentHistory = [];
    this.frameHistory = [];
  }
}
