/**
 * Analytics Service Interface
 * 
 * Provides real analytics queries.
 * Replaces hardcoded analytics values.
 */

/**
 * Time range for analytics queries
 */
export interface AnalyticsTimeRange {
  from: Date;
  to: Date;
}

/**
 * Occupancy query
 */
export interface OccupancyQuery {
  siteId?: string;
  siteIds?: string[];
  zoneId?: string;
  at: Date;
}

/**
 * Occupancy metrics
 */
export interface OccupancyMetrics {
  count: number;
  capacity?: number;
  percentage?: number;
  calculatedAt: Date;
  source: 'ENTRY_EXIT_TRACKING' | 'DETECTION_COUNT' | 'ESTIMATED';
  freshnessMs: number;
}

/**
 * People count query
 */
export interface PeopleCountQuery {
  siteIds?: string[];
  cameraIds?: string[];
  timeRange: AnalyticsTimeRange;
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

/**
 * People count metrics
 */
export interface PeopleCountMetrics {
  totalDetections: number;
  uniquePeople?: number;
  entries?: number;
  exits?: number;
  peakHour?: {
    hour: number;
    count: number;
  };
  byCamera?: Array<{
    cameraId: string;
    count: number;
  }>;
  timeRange: AnalyticsTimeRange;
  calculatedAt: Date;
}

/**
 * Vehicle count query
 */
export interface VehicleCountQuery {
  siteIds?: string[];
  cameraIds?: string[];
  timeRange: AnalyticsTimeRange;
  vehicleTypes?: string[];
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

/**
 * Vehicle count metrics
 */
export interface VehicleCountMetrics {
  totalDetections: number;
  uniqueVehicles?: number;
  byType?: Record<string, number>;
  byCamera?: Array<{
    cameraId: string;
    count: number;
  }>;
  peakHour?: {
    hour: number;
    count: number;
  };
  timeRange: AnalyticsTimeRange;
  calculatedAt: Date;
}

/**
 * Traffic trend query
 */
export interface TrafficTrendQuery {
  siteIds?: string[];
  cameraIds?: string[];
  timeRange: AnalyticsTimeRange;
  objectType: 'person' | 'vehicle';
  granularity: 'hour' | 'day' | 'week';
}

/**
 * Traffic trend data point
 */
export interface TrafficDataPoint {
  timestamp: Date;
  count: number;
}

/**
 * Traffic trend
 */
export interface TrafficTrend {
  dataPoints: TrafficDataPoint[];
  trend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'UNKNOWN';
  averageCount: number;
  peakCount: number;
  peakTimestamp?: Date;
  timeRange: AnalyticsTimeRange;
  calculatedAt: Date;
}

/**
 * Analytics Service
 */
export interface AnalyticsService {
  /**
   * Get current occupancy
   */
  getOccupancy(query: OccupancyQuery): Promise<OccupancyMetrics>;
  
  /**
   * Get people count
   */
  getPeopleCount(query: PeopleCountQuery): Promise<PeopleCountMetrics>;
  
  /**
   * Get vehicle count
   */
  getVehicleCount(query: VehicleCountQuery): Promise<VehicleCountMetrics>;
  
  /**
   * Get traffic trend
   */
  getTrafficTrend(query: TrafficTrendQuery): Promise<TrafficTrend>;
}
