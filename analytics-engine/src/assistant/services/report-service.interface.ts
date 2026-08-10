/**
 * Report Service Interface
 * 
 * Provides real report generation.
 * Replaces hardcoded report numbers.
 */

/**
 * Report type
 */
export enum ReportType {
  INCIDENT_SUMMARY = 'INCIDENT_SUMMARY',
  ANALYTICS_SUMMARY = 'ANALYTICS_SUMMARY',
  COMPLIANCE = 'COMPLIANCE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  CUSTOM = 'CUSTOM'
}

/**
 * Report period
 */
export interface ReportPeriod {
  from: Date;
  to: Date;
  label?: string;
}

/**
 * Incident report data
 */
export interface IncidentReportData {
  period: ReportPeriod;
  
  summary: {
    total: number;
    open: number;
    resolved: number;
    avgResponseTimeMinutes: number;
  };
  
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  
  byType?: Record<string, number>;
  
  bySite?: Array<{
    siteId: string;
    siteName: string;
    count: number;
  }>;
  
  byCamera?: Array<{
    cameraId: string;
    cameraName: string;
    count: number;
  }>;
  
  topIncidents?: Array<{
    id: string;
    type: string;
    severity: string;
    timestamp: Date;
    resolved: boolean;
  }>;
}

/**
 * Analytics report data
 */
export interface AnalyticsReportData {
  period: ReportPeriod;
  
  people: {
    totalDetections: number;
    uniqueCount?: number;
    avgPerDay: number;
    peakDay?: {
      date: string;
      count: number;
    };
  };
  
  vehicles: {
    totalDetections: number;
    uniqueCount?: number;
    avgPerDay: number;
    peakDay?: {
      date: string;
      count: number;
    };
  };
  
  occupancy?: {
    avgOccupancy: number;
    peakOccupancy: number;
    peakTimestamp?: Date;
  };
  
  bySite?: Array<{
    siteId: string;
    siteName: string;
    peopleCount: number;
    vehicleCount: number;
  }>;
}

/**
 * Report
 */
export interface Report {
  id: string;
  type: ReportType;
  generatedAt: Date;
  generatedBy: string;
  period: ReportPeriod;
  
  /** Report data (type-specific) */
  data: IncidentReportData | AnalyticsReportData | Record<string, unknown>;
  
  /** Export URLs if available */
  exports?: {
    pdf?: string;
    csv?: string;
    json?: string;
  };
  
  metadata?: Record<string, unknown>;
}

/**
 * Report generation request
 */
export interface GenerateReportRequest {
  type: ReportType;
  period: ReportPeriod;
  requestedBy: string;
  
  /** Filters */
  siteIds?: string[];
  cameraIds?: string[];
  
  /** Options */
  options?: {
    includeCharts?: boolean;
    includeRawData?: boolean;
    format?: 'json' | 'pdf' | 'csv';
  };
}

/**
 * Report Service
 */
export interface ReportService {
  /**
   * Generate a report
   */
  generate(request: GenerateReportRequest): Promise<Report>;
  
  /**
   * Get report by ID
   */
  get(reportId: string): Promise<Report | null>;
  
  /**
   * List reports
   */
  list(filter: {
    userId?: string;
    type?: ReportType;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }): Promise<Report[]>;
  
  /**
   * Export report
   */
  export(reportId: string, format: 'pdf' | 'csv' | 'json'): Promise<{
    url: string;
    expiresAt: Date;
  }>;
}

/**
 * Incident Analytics Service
 * 
 * Provides incident aggregation for reports
 */
export interface IncidentAnalyticsService {
  /**
   * Get incident summary for period
   */
  getSummary(request: {
    from: Date;
    to: Date;
    siteIds?: string[];
  }): Promise<IncidentReportData>;
}
