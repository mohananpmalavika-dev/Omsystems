/**
 * Intent parsing and entity extraction types
 */

/**
 * Intent types recognized by the assistant
 */
export type IntentType = 
  | 'CAMERA_START'
  | 'CAMERA_STOP'
  | 'CAMERA_STATUS'
  | 'SYSTEM_STATUS'
  | 'SEARCH_DETECTIONS'
  | 'SEARCH_PERSON'
  | 'SEARCH_VEHICLE'
  | 'INVESTIGATE_PERSON'
  | 'INVESTIGATE_VEHICLE'
  | 'REPORT_INCIDENTS'
  | 'REPORT_ANALYTICS'
  | 'REPORT_COMPLIANCE'
  | 'ANALYTICS_OCCUPANCY'
  | 'ANALYTICS_PEOPLE_COUNT'
  | 'ANALYTICS_VEHICLE_COUNT'
  | 'ANALYTICS_TREND'
  | 'HELP'
  | 'UNKNOWN';

/**
 * Entity extracted from natural language
 */
export interface Entity {
  type: 
    | 'camera'
    | 'person'
    | 'vehicle'
    | 'object'
    | 'time'
    | 'location'
    | 'color'
    | 'attribute'
    | 'number'
    | 'date'
    | 'action';
  
  /** Raw value extracted */
  value: string;
  
  /** Confidence in extraction (0-1) */
  confidence: number;
  
  /** Original text span */
  span?: {
    start: number;
    end: number;
  };
}

/**
 * Parsed query result
 */
export interface ParsedQuery {
  /** Recognized intent */
  intent: IntentType;
  
  /** Confidence in intent classification (0-1) */
  confidence: number;
  
  /** Extracted entities */
  entities: Entity[];
  
  /** Structured parameters extracted from query */
  parameters: QueryParameters;
  
  /** Original user query */
  originalQuery: string;
}

/**
 * Structured parameters from query
 */
export interface QueryParameters {
  // Camera parameters
  camera?: string;
  cameraIds?: string[];
  
  // Object parameters
  objectType?: 'person' | 'vehicle' | 'face' | 'license_plate';
  
  // Attribute parameters
  color?: string;
  attributes?: Record<string, unknown>;
  
  // Action parameters
  action?: 'start' | 'stop' | 'show' | 'find' | 'track' | 'generate';
  
  // Time parameters
  timeRange?: {
    from?: Date;
    to?: Date;
  };
  startDate?: string;
  endDate?: string;
  
  // Location parameters
  location?: string;
  zone?: string;
  
  // Report parameters
  reportType?: 'daily' | 'weekly' | 'monthly' | 'custom';
  
  // Investigation parameters
  subjectId?: string;
  trackingId?: string;
  
  // Free text
  freeText?: string;
  
  // Generic parameters
  [key: string]: unknown;
}

/**
 * Intent parser interface
 */
export interface IntentParser {
  /**
   * Parse natural language query into structured intent
   */
  parse(query: string): Promise<ParsedQuery> | ParsedQuery;
}
