/**
 * Investigation Service Interface
 * 
 * Provides real investigation workflows with ReID and timeline.
 * Replaces fake track_123 generated stories.
 */

/**
 * Investigation status
 */
export enum InvestigationStatus {
  CREATED = 'CREATED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

/**
 * Investigation subject
 */
export interface InvestigationSubject {
  type: 'person' | 'vehicle' | 'object';
  sourceDetectionId: string;
  sourceCamera: string;
  sourceTimestamp: Date;
  attributes?: Record<string, unknown>;
}

/**
 * ReID match
 */
export interface ReIdMatch {
  detectionId: string;
  cameraId: string;
  cameraName?: string;
  timestamp: Date;
  confidence: number;
  similarityScore: number;
  attributes?: Record<string, unknown>;
}

/**
 * Investigation timeline entry
 */
export interface TimelineEntry {
  detectionId: string;
  cameraId: string;
  cameraName?: string;
  location?: string;
  timestamp: Date;
  action: string;
  dwellTimeSeconds?: number;
  confidence: number;
}

/**
 * Investigation result
 */
export interface Investigation {
  id: string;
  status: InvestigationStatus;
  subject: InvestigationSubject;
  createdBy: string;
  createdAt: Date;
  completedAt?: Date;
  
  /** Timeline of appearances */
  timeline: TimelineEntry[];
  
  /** All matching detections */
  matches: ReIdMatch[];
  
  /** Journey summary */
  summary: {
    totalAppearances: number;
    camerasVisited: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    totalDurationMinutes: number;
  };
  
  /** Investigation metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Create investigation request
 */
export interface CreateInvestigationRequest {
  type: 'person' | 'vehicle';
  subjectDetectionId: string;
  requestedBy: string;
  
  /** Optional search parameters */
  options?: {
    timeRange?: {
      from: Date;
      to: Date;
    };
    cameraIds?: string[];
    minConfidence?: number;
  };
}

/**
 * Investigation Service
 */
export interface InvestigationService {
  /**
   * Create and execute an investigation
   */
  create(request: CreateInvestigationRequest): Promise<Investigation>;
  
  /**
   * Get investigation by ID
   */
  get(investigationId: string): Promise<Investigation | null>;
  
  /**
   * List investigations
   */
  list(filter: {
    userId?: string;
    status?: InvestigationStatus;
    fromDate?: Date;
    limit?: number;
  }): Promise<Investigation[]>;
}

/**
 * ReID Service Interface
 */
export interface ReIdService {
  /**
   * Find matching appearances across cameras
   */
  findMatches(
    subjectDetectionId: string,
    options: {
      timeRange?: { from: Date; to: Date };
      cameraIds?: string[];
      minSimilarity?: number;
      limit?: number;
    }
  ): Promise<ReIdMatch[]>;
}

/**
 * Timeline Service Interface
 */
export interface TimelineService {
  /**
   * Build timeline from ReID matches
   */
  buildTimeline(matches: ReIdMatch[]): Promise<TimelineEntry[]>;
  
  /**
   * Get journey summary
   */
  getSummary(timeline: TimelineEntry[]): {
    totalAppearances: number;
    camerasVisited: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    totalDurationMinutes: number;
  };
}
