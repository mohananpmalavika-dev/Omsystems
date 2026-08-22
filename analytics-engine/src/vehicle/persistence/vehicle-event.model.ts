/**
 * Vehicle Event Data Model
 * Represents a finalized vehicle sighting with all enriched metadata
 */

export interface VehicleEvent {
  id: string;
  
  // Tenant & Location
  tenantId: string;
  siteId: string;
  cameraId: string;
  
  // Tracking
  trackId: string;
  
  // Timing
  occurredAt: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  durationSeconds: number;
  
  // Vehicle Classification
  vehicleType: 'car' | 'truck' | 'bus' | 'motorcycle' | 'bicycle' | 'van' | 'unknown';
  vehicleConfidence: number;
  
  // Color
  color?: 'black' | 'white' | 'gray' | 'silver' | 'red' | 'blue' | 'green' | 'yellow' | 'orange' | 'brown' | 'beige' | 'unknown';
  colorConfidence?: number;
  
  // ANPR
  rawPlateText?: string;
  normalizedPlate?: string;
  plateDetectionConfidence?: number;
  ocrConfidence?: number;
  plateConfidence?: number;
  plateStatus?: 'recognized' | 'low-confidence' | 'conflicting' | 'insufficient' | 'not-visible';
  
  // Location
  country?: string;
  region?: string;
  
  // Movement
  direction?: 'entering' | 'exiting' | 'passing' | 'unknown';
  speed?: number; // km/h
  
  // Bounding Boxes (for last seen position)
  vehicleBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  plateBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  
  // Evidence
  snapshotUri?: string;
  plateCropUri?: string;
  
  // Metadata
  metadata?: {
    observationCount?: number;
    plateObservations?: number;
    colorObservations?: number;
    alternativePlates?: Array<{ plate: string; score: number }>;
    normalizationChanges?: Array<{ position: number; from: string; to: string; reason: string }>;
    reIdFeature?: number[];
    globalVehicleId?: string;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt?: Date;
}

export interface VehicleEventQuery {
  tenantId: string;
  
  // Filters
  siteIds?: string[];
  cameraIds?: string[];
  vehicleTypes?: string[];
  colors?: string[];
  
  // ANPR search
  normalizedPlate?: string;
  plateSimilarity?: number; // 0-1, for fuzzy search
  
  // Time range
  from?: Date;
  to?: Date;
  
  // Direction
  direction?: 'entering' | 'exiting' | 'passing';
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Sorting
  orderBy?: 'occurredAt' | 'createdAt' | 'plateConfidence';
  orderDirection?: 'asc' | 'desc';
}

export interface PlateHistoryOptions {
  includeAlternatives?: boolean;
  minConfidence?: number;
  maxResults?: number;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface VehicleEventStats {
  total: number;
  byType: Record<string, number>;
  byColor: Record<string, number>;
  byCamera: Record<string, number>;
  withPlates: number;
  avgConfidence: number;
}

/**
 * Domain event published when vehicle is sighted
 */
export interface VehicleSightedEvent {
  eventId: string;
  tenantId: string;
  siteId: string;
  cameraId: string;
  
  vehicle: {
    trackId: string;
    type: string;
    color?: string;
    plate?: string;
    confidence: number;
  };
  
  location: {
    direction?: string;
    speed?: number;
  };
  
  timing: {
    occurredAt: Date;
    firstSeen: Date;
    lastSeen: Date;
  };
  
  evidence: {
    snapshotUri?: string;
    plateCropUri?: string;
  };
}

/**
 * Factory to create vehicle event from track state
 */
export interface VehicleEventFactory {
  create(params: {
    track: any; // VehicleTrackState
    plate?: any; // PlateConsensusResult
    color?: any; // VehicleColorResult
    context: {
      tenantId: string;
      siteId: string;
      cameraId: string;
    };
  }): VehicleEvent;
}

export class DefaultVehicleEventFactory implements VehicleEventFactory {
  create(params: {
    track: any;
    plate?: any;
    color?: any;
    context: {
      tenantId: string;
      siteId: string;
      cameraId: string;
    };
  }): VehicleEvent {
    const { track, plate, color, context } = params;
    
    const id = `${context.tenantId}_${track.trackId}_${Date.now()}`;
    const now = new Date();
    
    const durationSeconds = track.lastSeenAt && track.firstSeenAt
      ? (track.lastSeenAt.getTime() - track.firstSeenAt.getTime()) / 1000
      : 0;
    
    const lastPosition = track.positions?.[track.positions.length - 1];
    
    return {
      id,
      
      tenantId: context.tenantId,
      siteId: context.siteId,
      cameraId: context.cameraId,
      
      trackId: track.trackId,
      
      occurredAt: track.lastSeenAt || now,
      firstSeenAt: track.firstSeenAt || now,
      lastSeenAt: track.lastSeenAt || now,
      durationSeconds,
      
      vehicleType: track.vehicleType || 'unknown',
      vehicleConfidence: track.detectionConfidence || 0,
      
      color: color?.color,
      colorConfidence: color?.confidence,
      
      rawPlateText: plate?.rawPlate,
      normalizedPlate: plate?.plate,
      plateDetectionConfidence: plate?.confidence?.detection,
      ocrConfidence: plate?.confidence?.ocr,
      plateConfidence: plate?.confidence?.final,
      plateStatus: plate?.status,
      
      vehicleBoundingBox: lastPosition?.boundingBox,
      
      metadata: {
        observationCount: track.positions?.length || 0,
        plateObservations: track.plateObservations?.length || 0,
        colorObservations: track.colorObservations?.length || 0,
        alternativePlates: plate?.alternatives,
        reIdFeature: track.reIdFeature,
        globalVehicleId: track.globalVehicleId,
      },
      
      createdAt: now,
    };
  }
}
