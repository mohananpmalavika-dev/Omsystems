/**
 * Vehicle Journey Reconstruction
 * Builds cross-camera timelines and routes for vehicles
 */

import type { VehicleEvent, DateRange } from '../persistence/vehicle-event.model.js';
import type { VehicleEventRepository } from '../persistence/vehicle-event.repository.js';

export interface VehicleJourney {
  plate: string;
  vehicleType?: string;
  color?: string;
  
  startedAt: Date;
  endedAt: Date;
  totalDuration: number; // seconds
  
  appearances: JourneyAppearance[];
  
  route?: string[]; // camera IDs in order
  estimatedPath?: string; // human-readable path description
  
  statistics: {
    totalCameras: number;
    totalSites: number;
    avgConfidence: number;
    avgSpeed?: number;
  };
}

export interface JourneyAppearance {
  eventId: string;
  cameraId: string;
  cameraName?: string;
  siteId: string;
  siteName?: string;
  
  timestamp: Date;
  duration: number;
  
  direction?: string;
  speed?: number;
  
  confidence: number;
  
  snapshotUri?: string;
  plateCropUri?: string;
  
  timeSincePrevious?: number; // seconds
  distanceFromPrevious?: number; // meters (if topology available)
}

export interface CameraTopology {
  cameras: Map<string, CameraNode>;
  connections: CameraConnection[];
}

export interface CameraNode {
  cameraId: string;
  cameraName: string;
  siteId: string;
  siteName: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface CameraConnection {
  fromCameraId: string;
  toCameraId: string;
  distance: number; // meters
  typicalTransitTime: number; // seconds
}

export interface RouteValidation {
  isValid: boolean;
  impossibleTransitions: Array<{
    from: string;
    to: string;
    reason: string;
  }>;
  suspiciousGaps: Array<{
    from: string;
    to: string;
    timeDelta: number;
    expectedTime: number;
  }>;
}

export class VehicleJourneyService {
  private topology?: CameraTopology;
  
  constructor(
    private readonly eventRepository: VehicleEventRepository
  ) {}
  
  /**
   * Build journey for a vehicle plate
   */
  async buildJourney(
    tenantId: string,
    plate: string,
    range: DateRange,
    options?: {
      minConfidence?: number;
      includeAlternatives?: boolean;
    }
  ): Promise<VehicleJourney | null> {
    const minConfidence = options?.minConfidence || 0.7;
    
    // Get all events for this plate
    const events = await this.eventRepository.findJourney(
      tenantId,
      plate,
      range
    );
    
    if (events.length === 0) {
      return null;
    }
    
    // Filter by confidence
    const reliableEvents = events.filter(
      e => (e.plateConfidence || 0) >= minConfidence
    );
    
    if (reliableEvents.length === 0) {
      return null;
    }
    
    // Sort by time
    reliableEvents.sort((a, b) => 
      a.occurredAt.getTime() - b.occurredAt.getTime()
    );
    
    // Build appearances
    const appearances: JourneyAppearance[] = [];
    
    for (let i = 0; i < reliableEvents.length; i++) {
      const event = reliableEvents[i];
      if (!event) continue; // Skip if event is undefined
      
      const prev = i > 0 ? reliableEvents[i - 1] : null;
      
      const timeSincePrevious = prev
        ? (event.occurredAt.getTime() - prev.occurredAt.getTime()) / 1000
        : undefined;
      
      const distanceFromPrevious = prev && this.topology
        ? this.calculateDistance(prev.cameraId, event.cameraId)
        : undefined;
      
      appearances.push({
        eventId: event.id,
        cameraId: event.cameraId,
        cameraName: this.getCameraName(event.cameraId),
        siteId: event.siteId,
        siteName: this.getSiteName(event.siteId),
        timestamp: event.occurredAt,
        duration: event.durationSeconds,
        direction: event.direction,
        speed: event.speed,
        confidence: event.plateConfidence || 0,
        snapshotUri: event.snapshotUri,
        plateCropUri: event.plateCropUri,
        timeSincePrevious,
        distanceFromPrevious,
      });
    }
    
    // Build route
    const route = appearances.map(a => a.cameraId);
    const uniqueCameras = new Set(route);
    const uniqueSites = new Set(appearances.map(a => a.siteId));
    
    // Calculate statistics
    const totalConfidence = appearances.reduce((sum, a) => sum + a.confidence, 0);
    const speeds = appearances.filter(a => a.speed).map(a => a.speed!);
    const avgSpeed = speeds.length > 0
      ? speeds.reduce((sum, s) => sum + s, 0) / speeds.length
      : undefined;
    
    // Ensure we have at least one reliable event
    const firstEvent = reliableEvents[0];
    const lastEvent = reliableEvents[reliableEvents.length - 1];
    
    if (!firstEvent || !lastEvent) {
      throw new Error('Cannot build journey without reliable events');
    }
    
    return {
      plate,
      vehicleType: firstEvent.vehicleType,
      color: firstEvent.color,
      startedAt: firstEvent.occurredAt,
      endedAt: lastEvent.occurredAt,
      totalDuration: (lastEvent.occurredAt.getTime() - firstEvent.occurredAt.getTime()) / 1000,
      appearances,
      route,
      estimatedPath: this.buildPathDescription(appearances),
      statistics: {
        totalCameras: uniqueCameras.size,
        totalSites: uniqueSites.size,
        avgConfidence: totalConfidence / appearances.length,
        avgSpeed,
      },
    };
  }
  
  /**
   * Validate journey route against topology
   */
  validateRoute(journey: VehicleJourney): RouteValidation {
    const impossibleTransitions: RouteValidation['impossibleTransitions'] = [];
    const suspiciousGaps: RouteValidation['suspiciousGaps'] = [];
    
    if (!this.topology) {
      return {
        isValid: true,
        impossibleTransitions,
        suspiciousGaps,
      };
    }
    
    for (let i = 1; i < journey.appearances.length; i++) {
      const prev = journey.appearances[i - 1];
      const current = journey.appearances[i];
      
      // Skip if either element is undefined
      if (!prev || !current) continue;
      
      // Check if transition is possible
      const connection = this.findConnection(prev.cameraId, current.cameraId);
      
      if (!connection) {
        // Check if they're in completely different locations
        const prevCam = this.topology.cameras.get(prev.cameraId);
        const currCam = this.topology.cameras.get(current.cameraId);
        
        if (prevCam && currCam && prevCam.location && currCam.location) {
          const distance = this.haversineDistance(
            prevCam.location,
            currCam.location
          );
          
          // If cameras are > 50km apart with < 30 min gap, likely impossible
          if (distance > 50000 && current.timeSincePrevious && current.timeSincePrevious < 1800) {
            impossibleTransitions.push({
              from: prev.cameraId,
              to: current.cameraId,
              reason: `${Math.round(distance / 1000)}km in ${Math.round(current.timeSincePrevious / 60)} minutes`,
            });
          }
        }
      } else if (current.timeSincePrevious) {
        // Check if time gap is suspicious
        const expectedTime = connection.typicalTransitTime;
        const actualTime = current.timeSincePrevious;
        
        // Flag if actual time is < 50% or > 300% of expected
        if (actualTime < expectedTime * 0.5 || actualTime > expectedTime * 3) {
          suspiciousGaps.push({
            from: prev.cameraId,
            to: current.cameraId,
            timeDelta: actualTime,
            expectedTime,
          });
        }
      }
    }
    
    return {
      isValid: impossibleTransitions.length === 0,
      impossibleTransitions,
      suspiciousGaps,
    };
  }
  
  /**
   * Find similar journeys (same route pattern)
   */
  async findSimilarJourneys(
    tenantId: string,
    journey: VehicleJourney,
    range: DateRange,
    minSimilarity: number = 0.7
  ): Promise<VehicleJourney[]> {
    // Get all events in the time range
    const allEvents = await this.eventRepository.search({
      tenantId,
      from: range.from,
      to: range.to,
      orderBy: 'occurredAt',
      orderDirection: 'asc',
    });
    
    // Group by plate
    const eventsByPlate = new Map<string, VehicleEvent[]>();
    for (const event of allEvents) {
      if (!event.normalizedPlate) continue;
      
      const existing = eventsByPlate.get(event.normalizedPlate) || [];
      existing.push(event);
      eventsByPlate.set(event.normalizedPlate, existing);
    }
    
    // Find similar journeys
    const similar: VehicleJourney[] = [];
    
    for (const [plate, events] of eventsByPlate.entries()) {
      if (plate === journey.plate) continue;
      
      const otherJourney = await this.buildJourney(
        tenantId,
        plate,
        range
      );
      
      if (!otherJourney) continue;
      
      const similarity = this.calculateRouteSimilarity(
        journey.route || [],
        otherJourney.route || []
      );
      
      if (similarity >= minSimilarity) {
        similar.push(otherJourney);
      }
    }
    
    return similar;
  }
  
  /**
   * Get last known location of vehicle
   */
  async getLastSeen(
    tenantId: string,
    plate: string
  ): Promise<JourneyAppearance | null> {
    const events = await this.eventRepository.findByPlate(
      tenantId,
      plate,
      { maxResults: 1 }
    );
    
    if (events.length === 0) return null;
    
    const event = events[0];
    if (!event) return null;
    
    return {
      eventId: event.id,
      cameraId: event.cameraId,
      cameraName: this.getCameraName(event.cameraId),
      siteId: event.siteId,
      siteName: this.getSiteName(event.siteId),
      timestamp: event.occurredAt,
      duration: event.durationSeconds,
      direction: event.direction,
      speed: event.speed,
      confidence: event.plateConfidence || 0,
      snapshotUri: event.snapshotUri,
      plateCropUri: event.plateCropUri,
    };
  }
  
  /**
   * Set camera topology for route validation
   */
  setTopology(topology: CameraTopology): void {
    this.topology = topology;
  }
  
  /**
   * Calculate route similarity (Jaccard index)
   */
  private calculateRouteSimilarity(route1: string[], route2: string[]): number {
    const set1 = new Set(route1);
    const set2 = new Set(route2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }
  
  /**
   * Find connection between cameras
   */
  private findConnection(
    fromCameraId: string,
    toCameraId: string
  ): CameraConnection | undefined {
    if (!this.topology) return undefined;
    
    return this.topology.connections.find(
      c => c.fromCameraId === fromCameraId && c.toCameraId === toCameraId
    );
  }
  
  /**
   * Calculate distance between cameras
   */
  private calculateDistance(
    fromCameraId: string,
    toCameraId: string
  ): number | undefined {
    if (!this.topology) return undefined;
    
    const connection = this.findConnection(fromCameraId, toCameraId);
    if (connection) return connection.distance;
    
    // Calculate from coordinates if available
    const fromCam = this.topology.cameras.get(fromCameraId);
    const toCam = this.topology.cameras.get(toCameraId);
    
    if (fromCam?.location && toCam?.location) {
      return this.haversineDistance(fromCam.location, toCam.location);
    }
    
    return undefined;
  }
  
  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private haversineDistance(
    loc1: { latitude: number; longitude: number },
    loc2: { latitude: number; longitude: number }
  ): number {
    const R = 6371000; // Earth radius in meters
    const φ1 = loc1.latitude * Math.PI / 180;
    const φ2 = loc2.latitude * Math.PI / 180;
    const Δφ = (loc2.latitude - loc1.latitude) * Math.PI / 180;
    const Δλ = (loc2.longitude - loc1.longitude) * Math.PI / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }
  
  /**
   * Build human-readable path description
   */
  private buildPathDescription(appearances: JourneyAppearance[]): string {
    if (appearances.length === 0) return '';
    if (appearances.length === 1) {
      return `Seen at ${appearances[0].cameraName || appearances[0].cameraId}`;
    }
    
    const locations = appearances.map(a => a.cameraName || a.cameraId);
    const uniqueLocations = [...new Set(locations)];
    
    if (uniqueLocations.length <= 3) {
      return uniqueLocations.join(' → ');
    }
    
    return `${uniqueLocations[0]} → ... → ${uniqueLocations[uniqueLocations.length - 1]} (${uniqueLocations.length} locations)`;
  }
  
  /**
   * Get camera name from ID (placeholder)
   */
  private getCameraName(cameraId: string): string | undefined {
    return this.topology?.cameras.get(cameraId)?.cameraName;
  }
  
  /**
   * Get site name from ID (placeholder)
   */
  private getSiteName(siteId: string): string | undefined {
    // Would fetch from site repository in production
    return undefined;
  }
}
