/**
 * Infrastructure-RCA Integration Service
 * 
 * Correlates infrastructure failures with surveillance incidents to enable
 * automatic root cause analysis. When cameras go offline or incidents occur,
 * this service checks the underlying infrastructure to identify the true cause.
 * 
 * Example Correlation Flows:
 * 1. Camera Offline → Check switch port → PoE status → UPS health → Power outage
 * 2. Multiple cameras down → Check switch health → Network failure → Core switch down
 * 3. Recording gaps → Check recorder → Disk health → Storage failure prediction
 * 4. Video quality issues → Check bandwidth → Network congestion → Firewall sessions
 * 
 * This reduces troubleshooting time from hours to minutes by automatically
 * checking the entire infrastructure stack.
 */

import { Pool } from 'pg';
import type { 
  SwitchHealthMetrics,
  FirewallHealthMetrics,
  UPSHealthMetrics,
  InfrastructureAlert
} from '../../types/infrastructure.types';

// ============================================
// Types
// ============================================

interface CameraIncident {
  cameraId: string;
  cameraName: string;
  branchId: string;
  incidentType: 'offline' | 'poor_quality' | 'recording_gap' | 'connection_lost';
  detectedAt: Date;
  metadata?: Record<string, any>;
}

interface InfrastructureRootCause {
  rootCauseType: 'switch_port' | 'switch_device' | 'ups_power' | 'firewall' | 'network_link' | 'unknown';
  confidence: number; // 0-1
  explanation: string;
  affectedComponents: Array<{
    componentType: string;
    componentId: string;
    componentName: string;
    status: string;
    healthScore?: number;
  }>;
  recommendedActions: string[];
  relatedAlerts: InfrastructureAlert[];
  troubleshootingPath: string[];
}

interface CorrelationResult {
  cameraId: string;
  incidentType: string;
  infrastructureRootCause: InfrastructureRootCause | null;
  correlationTimestamp: Date;
  investigationDuration