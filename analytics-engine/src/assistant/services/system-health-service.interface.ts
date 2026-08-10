/**
 * System Health Service Interface
 * 
 * Provides real system health aggregation.
 * Replaces hardcoded system status values.
 */

/**
 * Overall system health status
 */
export enum SystemHealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  CRITICAL = 'CRITICAL',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Camera health summary
 */
export interface CameraHealthSummary {
  total: number;
  online: number;
  offline: number;
  degraded: number;
  starting: number;
  error: number;
}

/**
 * Detection pipeline health
 */
export interface DetectionPipelineHealth {
  healthy: boolean;
  processingLagMs: number | null;
  queueDepth?: number;
  framesProcessedPerSecond?: number;
}

/**
 * Incident summary
 */
export interface IncidentSummary {
  open: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  resolvedToday?: number;
}

/**
 * Storage health
 */
export interface StorageHealth {
  healthy: boolean;
  usedBytes: number;
  totalBytes: number;
  usedPercentage: number;
  estimatedDaysRemaining?: number;
}

/**
 * Database health
 */
export interface DatabaseHealth {
  healthy: boolean;
  connectionPoolActive: number;
  connectionPoolMax: number;
  slowQueryCount?: number;
}

/**
 * System health snapshot
 */
export interface SystemHealthSnapshot {
  timestamp: Date;
  overall: SystemHealthStatus;
  
  cameras: CameraHealthSummary;
  
  detection: DetectionPipelineHealth;
  
  incidents: IncidentSummary;
  
  storage: StorageHealth;
  
  database?: DatabaseHealth;
  
  uptime?: {
    seconds: number;
    formattedString: string;
  };
  
  /** Additional subsystem health */
  subsystems?: Record<string, {
    healthy: boolean;
    status: string;
    details?: string;
  }>;
}

/**
 * System Health Service
 */
export interface SystemHealthService {
  /**
   * Get current system health snapshot
   */
  getSnapshot(): Promise<SystemHealthSnapshot>;
  
  /**
   * Get camera health summary
   */
  getCameraHealth(): Promise<CameraHealthSummary>;
  
  /**
   * Get incident summary
   */
  getIncidentSummary(): Promise<IncidentSummary>;
  
  /**
   * Get storage health
   */
  getStorageHealth(): Promise<StorageHealth>;
  
  /**
   * Get detection pipeline health
   */
  getDetectionPipelineHealth(): Promise<DetectionPipelineHealth>;
}
