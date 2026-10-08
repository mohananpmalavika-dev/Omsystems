/**
 * Detection Search Service Interface
 * 
 * Service contract for searching detections and events.
 * Replaces fake search results with real queries.
 */

/**
 * Detection search query
 */
export interface DetectionSearchQuery {
  /** Time range filter */
  timeRange?: {
    from: Date;
    to: Date;
  };
  
  /** Camera filters */
  cameraIds?: string[];
  
  /** Site filters */
  siteIds?: string[];
  
  /** Object type filters */
  objectTypes?: Array<'person' | 'vehicle' | 'face' | 'license_plate' | 'object'>;
  
  /** Attribute filters */
  attributes?: {
    color?: string;
    clothing?: string;
    vehicleType?: string;
    [key: string]: unknown;
  };
  
  /** Minimum confidence threshold */
  minConfidence?: number;
  
  /** Free text search */
  freeText?: string;
  
  /** Result limit */
  limit: number;
  
  /** Offset for pagination */
  offset?: number;
}

/**
 * Detection match result
 */
export interface DetectionMatch {
  detectionId: string;
  cameraId: string;
  cameraName?: string;
  timestamp: Date;
  objectType: string;
  confidence: number;
  attributes?: Record<string, unknown>;
  thumbnailUrl?: string;
  videoClipUrl?: string;
}

/**
 * Search result
 */
export interface DetectionSearchResult {
  query: DetectionSearchQuery;
  totalResults: number;
  results: DetectionMatch[];
  executionTimeMs: number;
  queriedAt: Date;
}

/**
 * Detection Search Service
 */
export interface DetectionSearchService {
  /**
   * Search for detections matching criteria
   */
  search(query: DetectionSearchQuery): Promise<DetectionSearchResult>;
  
  /**
   * Get detection by ID
   */
  getById(detectionId: string): Promise<DetectionMatch | null>;
  
  /**
   * Search by similarity (vector search)
   * Requires vector search capability
   */
  searchSimilar?(
    referenceDetectionId: string,
    options: {
      cameraIds?: string[];
      timeRange?: { from: Date; to: Date };
      limit: number;
      minSimilarity?: number;
    }
  ): Promise<DetectionSearchResult>;
}
