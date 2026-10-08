/**
 * Analytics Statistics Models
 * Type definitions for aggregated analytics statistics
 */

export type AnalyticsBucket = "minute" | "hour" | "day" | "week";
export type SeverityLevel = "P1" | "P2" | "P3" | "P4" | "P5";
export type EventStatus = "accepted" | "suppressed" | "unmatched";

/**
 * Statistics query filters
 */
export interface StatisticsFilters {
  tenantId: string;
  from: Date;
  to: Date;

  detectorTypes?: string[];
  severities?: SeverityLevel[];

  branchId?: string;
  cameraId?: string;
}

/**
 * Query parameters from HTTP request
 */
export interface StatisticsQuery {
  from?: string;
  to?: string;

  bucket?: AnalyticsBucket;

  detectorType?: string | string[];
  severity?: string | string[];

  cameraId?: string;
  branchId?: string;

  includeTimeline?: boolean;
  includeCameraBreakdown?: boolean;
  includeBranchBreakdown?: boolean;
}

/**
 * Summary aggregates
 */
export interface StatisticsSummary {
  totalDetections: number;
  averageConfidence: number | null;
  alerts: number;
}

/**
 * Per-type breakdown
 */
export interface TypeStatistics {
  count: number;
  averageConfidence: number | null;
  alerts: number;
}

/**
 * Timeline bucket
 */
export interface TimelineBucket {
  timestamp: string;
  total: number;
  alerts: number;
  averageConfidence: number | null;
  byType: Record<string, number>;
}

/**
 * Camera breakdown
 */
export interface CameraStatistics {
  cameraId: string;
  detections: number;
  alerts: number;
}

/**
 * Branch breakdown
 */
export interface BranchStatistics {
  branchId: string;
  detections: number;
  alerts: number;
}

/**
 * Complete statistics response
 */
export interface AnalyticsStatisticsResponse {
  range: {
    from: string;
    to: string;
    bucket: AnalyticsBucket;
  };

  totalDetections: number;
  averageConfidence: number | null;
  alerts: number;

  byType: Record<string, TypeStatistics>;
  bySeverity: Record<string, number>;

  timeline: TimelineBucket[];

  topCameras?: CameraStatistics[];
  topBranches?: BranchStatistics[];

  meta: {
    generatedAt: string;
    source: "raw" | "rollup";
    cached: boolean;
  };
}

/**
 * Statistics service request
 */
export interface AnalyticsStatisticsRequest {
  tenantId: string;

  from?: Date;
  to?: Date;

  bucket?: AnalyticsBucket;

  detectorTypes?: string[];
  severities?: SeverityLevel[];

  cameraId?: string;
  branchId?: string;

  includeTimeline?: boolean;
  includeCameraBreakdown?: boolean;
  includeBranchBreakdown?: boolean;
}
