/**
 * Digital Twin Prediction Integration Service
 * 
 * Integrates failure predictions with Digital Twin visualization:
 * 1. Add visual risk indicators to branch map view
 * 2. Display device-level risk badges (pulsing red, orange warning, yellow countdown)
 * 3. Show prediction popover on device selection
 * 4. Real-time risk status updates via WebSocket
 * 5. Branch-level risk heat map overlay
 */

import { Pool } from 'pg';
import digitalTwinEventMapper from './digital-twin-event-mapper.service.js';
import { type AlertSeverity } from '../types/digital-twin.js';

// ============================================
// Types
// ============================================

interface DeviceRiskIndicator {
  deviceId: string;
  deviceType: string;
  branchNodeId: string;
  riskLevel: 'imminent' | 'critical' | 'high' | 'emerging' | 'monitor' | 'none';
  visualStyle: {
    color: string;
    animation: 'pulsing' | 'steady' | 'blinking' | 'none';
    icon: string;
    badge: string;
  };
  activePredictions: Array<{
    id: string;
    predictionType: string;
    probability: number;
    expectedFailureFrom: string;
    expectedFailureTo: string;
    hoursUntilFailure: number;
  }>;
  branchRiskScore?: number;
}

interface BranchRiskOverlay {
  branchNodeId: string;
  branchName: string;
  overallRiskScore: number;
  riskColor: string;
  componentRisks: {
    recorder: number;
    storage: number;
    network: number;
    power: number;
    camera: number;
    compliance: number;
  };
  topRisks: string[];
  deviceCount: number;
  criticalDeviceCount: number;
}

// ============================================
// Digital Twin Prediction Integration
// ============================================

export class DigitalTwinPredictionIntegration {
  constructor(private pool: Pool) {}

  /**
   * Get risk indicators for all devices in a branch
   */
  async getBranchDeviceRiskIndicators(branchNodeId: string, tenantId: string): Promise<DeviceRiskIndicator[]> {
    const query = `
      WITH device_predictions AS (
        SELECT 
          fp.device_id,
          fp.device_type,
          fp.branch_node_id,
          fp.risk_classification,
          json_agg(
            json_build_object(
              'id', fp.id,
              'predictionType', fp.prediction_type,
              'probability', fp.probability,
              'expectedFailureFrom', fp.expected_failure_from,
              'expectedFailureTo', fp.expected_failure_to,
              'hoursUntilFailure', EXTRACT(EPOCH FROM (fp.expected_failure_from - NOW())) / 3600
            ) ORDER BY fp.probability DESC
          ) as predictions,
          MAX(
            CASE fp.risk_classification
              WHEN 'imminent_failure' THEN 5
              WHEN 'critical_risk' THEN 4
              WHEN 'high_risk' THEN 3
              WHEN 'emerging_risk' THEN 2
              ELSE 1
            END
          ) as max_risk_level
        FROM failure_predictions fp
        WHERE fp.branch_node_id = $1
          AND fp.tenant_id = $2
          AND fp.status = 'active'
          AND fp.expected_failure_to >= NOW()
        GROUP BY fp.device_id, fp.device_type, fp.branch_node_id, fp.risk_classification
      )
      SELECT 
        dp.device_id,
        dp.device_type,
        dp.branch_node_id,
        CASE dp.max_risk_level
          WHEN 5 THEN 'imminent'
          WHEN 4 THEN 'critical'
          WHEN 3 THEN 'high'
          WHEN 2 THEN 'emerging'
          ELSE 'monitor'
        END as risk_level,
        dp.predictions
      FROM device_predictions dp
      ORDER BY dp.max_risk_level DESC
    `;

    const result = await this.pool.query(query, [branchNodeId, tenantId]);

    return result.rows.map(row => this.buildRiskIndicator(row));
  }

  /**
   * Get risk indicator for a specific device
   */
  async getDeviceRiskIndicator(deviceId: string, branchNodeId: string, tenantId: string): Promise<DeviceRiskIndicator | null> {
    const query = `
      SELECT 
        fp.device_id,
        fp.device_type,
        fp.branch_node_id,
        fp.risk_classification,
        json_agg(
          json_build_object(
            'id', fp.id,
            'predictionType', fp.prediction_type,
            'probability', fp.probability,
            'expectedFailureFrom', fp.expected_failure_from,
            'expectedFailureTo', fp.expected_failure_to,
            'hoursUntilFailure', EXTRACT(EPOCH FROM (fp.expected_failure_from - NOW())) / 3600,
            'recommendedAction', fp.recommended_action
          ) ORDER BY fp.probability DESC
        ) as predictions
      FROM failure_predictions fp
      WHERE fp.device_id = $1
        AND fp.branch_node_id = $2
        AND fp.tenant_id = $3
        AND fp.status = 'active'
        AND fp.expected_failure_to >= NOW()
      GROUP BY fp.device_id, fp.device_type, fp.branch_node_id, fp.risk_classification
    `;

    const result = await this.pool.query(query, [deviceId, branchNodeId, tenantId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.buildRiskIndicator(result.rows[0]);
  }

  /**
   * Get branch risk overlay for map visualization
   */
  async getBranchRiskOverlay(branchNodeId: string, tenantId: string): Promise<BranchRiskOverlay | null> {
    // Get latest branch risk score
    const riskScoreQuery = `
      SELECT 
        brs.branch_node_id,
        rn.name as branch_name,
        brs.overall_score,
        brs.recorder_risk_score,
        brs.storage_risk_score,
        brs.network_risk_score,
        brs.power_risk_score,
        brs.camera_risk_score,
        brs.compliance_risk_score,
        brs.top_risks
      FROM branch_risk_scores brs
      JOIN resource_nodes rn ON rn.id = brs.branch_node_id
      WHERE brs.branch_node_id = $1
        AND brs.tenant_id = $2
      ORDER BY brs.calculated_at DESC
      LIMIT 1
    `;

    const riskResult = await this.pool.query(riskScoreQuery, [branchNodeId, tenantId]);

    if (riskResult.rows.length === 0) {
      return null;
    }

    const risk = riskResult.rows[0];

    // Get device counts
    const deviceCountQuery = `
      SELECT 
        COUNT(DISTINCT fp.device_id) as total_devices,
        COUNT(DISTINCT CASE WHEN fp.risk_classification IN ('critical_risk', 'imminent_failure') 
          THEN fp.device_id END) as critical_devices
      FROM failure_predictions fp
      WHERE fp.branch_node_id = $1
        AND fp.tenant_id = $2
        AND fp.status = 'active'
        AND fp.expected_failure_to >= NOW()
    `;

    const deviceResult = await this.pool.query(deviceCountQuery, [branchNodeId, tenantId]);
    const deviceCounts = deviceResult.rows[0];

    return {
      branchNodeId: risk.branch_node_id,
      branchName: risk.branch_name,
      overallRiskScore: parseFloat(risk.overall_score),
      riskColor: this.getRiskColor(parseFloat(risk.overall_score)),
      componentRisks: {
        recorder: parseFloat(risk.recorder_risk_score) || 100,
        storage: parseFloat(risk.storage_risk_score) || 100,
        network: parseFloat(risk.network_risk_score) || 100,
        power: parseFloat(risk.power_risk_score) || 100,
        camera: parseFloat(risk.camera_risk_score) || 100,
        compliance: parseFloat(risk.compliance_risk_score) || 100
      },
      topRisks: risk.top_risks || [],
      deviceCount: parseInt(deviceCounts.total_devices) || 0,
      criticalDeviceCount: parseInt(deviceCounts.critical_devices) || 0
    };
  }

  /**
   * Publish prediction alert to Digital Twin
   */
  async publishPredictionToDigitalTwin(
    prediction: any
  ): Promise<void> {
    const severity = this.mapRiskToSeverity(prediction.risk_classification);
    const title = this.formatPredictionTitle(prediction.prediction_type, prediction.probability);
    const description = this.formatPredictionDescription(prediction);

    // Map to spatial alert via digital twin event mapper
    await digitalTwinEventMapper.onAIDetection(
      prediction.device_id,
      `prediction_${prediction.prediction_type}`,
      severity,
      title,
      description,
      {
        predictionId: prediction.id,
        probability: prediction.probability,
        confidence: prediction.confidence,
        expectedFailureFrom: prediction.expected_failure_from,
        expectedFailureTo: prediction.expected_failure_to,
        recommendedAction: prediction.recommended_action,
        predictedImpact: prediction.predicted_impact
      }
    );
  }

  /**
   * Clear prediction alert from Digital Twin when resolved
   */
  async clearPredictionFromDigitalTwin(predictionId: string): Promise<void> {
    // This would clear the spatial alert
    // Implementation depends on your spatial alert service
    // For now, just log it
    console.log(`Clearing prediction ${predictionId} from Digital Twin`);
  }

  /**
   * Build risk indicator with visual styling
   */
  private buildRiskIndicator(row: any): DeviceRiskIndicator {
    const riskLevel = row.risk_level || 'none';
    const visualStyle = this.getVisualStyle(riskLevel);

    return {
      deviceId: row.device_id,
      deviceType: row.device_type,
      branchNodeId: row.branch_node_id,
      riskLevel,
      visualStyle,
      activePredictions: row.predictions || [],
      branchRiskScore: row.branch_risk_score
    };
  }

  /**
   * Get visual style for risk level
   */
  private getVisualStyle(riskLevel: string): DeviceRiskIndicator['visualStyle'] {
    const styles: Record<string, DeviceRiskIndicator['visualStyle']> = {
      imminent: {
        color: '#EF4444', // Red
        animation: 'pulsing',
        icon: '🔴',
        badge: 'IMMINENT'
      },
      critical: {
        color: '#F97316', // Orange
        animation: 'blinking',
        icon: '⚠️',
        badge: 'CRITICAL'
      },
      high: {
        color: '#F59E0B', // Yellow/Amber
        animation: 'steady',
        icon: '⚡',
        badge: 'HIGH'
      },
      emerging: {
        color: '#3B82F6', // Blue
        animation: 'none',
        icon: '📊',
        badge: 'WATCH'
      },
      monitor: {
        color: '#6B7280', // Gray
        animation: 'none',
        icon: '👁️',
        badge: 'MONITOR'
      },
      none: {
        color: '#10B981', // Green
        animation: 'none',
        icon: '✓',
        badge: 'OK'
      }
    };

    return styles[riskLevel] || styles.none;
  }

  /**
   * Get risk color for score
   */
  private getRiskColor(score: number): string {
    if (score >= 80) return '#10B981'; // Green
    if (score >= 60) return '#F59E0B'; // Yellow
    if (score >= 40) return '#F97316'; // Orange
    return '#EF4444'; // Red
  }

  /**
   * Map risk classification to alert severity
   */
  private mapRiskToSeverity(riskClassification: string): AlertSeverity {
    const mapping: Record<string, AlertSeverity> = {
      imminent_failure: 'critical',
      critical_risk: 'critical',
      high_risk: 'high',
      emerging_risk: 'medium',
      monitor: 'low'
    };

    return mapping[riskClassification] || 'low';
  }

  /**
   * Format prediction title
   */
  private formatPredictionTitle(predictionType: string, probability: number): string {
    const typeLabels: Record<string, string> = {
      recorder_failure: '📼 Recorder Failure Predicted',
      disk_failure: '💿 Disk Failure Predicted',
      network_failure: '🌐 Network Failure Predicted',
      camera_failure: '📹 Camera Failure Predicted',
      ups_failure: '🔋 UPS Failure Predicted',
      storage_retention_failure: '💾 Storage Retention Risk'
    };

    const label = typeLabels[predictionType] || '⚠️ Device Failure Predicted';
    return `${label} (${Math.round(probability * 100)}%)`;
  }

  /**
   * Format prediction description
   */
  private formatPredictionDescription(prediction: any): string {
    const hoursUntil = (new Date(prediction.expected_failure_from).getTime() - Date.now()) / (1000 * 60 * 60);
    
    let timeDesc: string;
    if (hoursUntil < 0) {
      timeDesc = 'Overdue';
    } else if (hoursUntil < 24) {
      timeDesc = `${Math.round(hoursUntil)} hours`;
    } else {
      timeDesc = `${Math.round(hoursUntil / 24)} days`;
    }

    let desc = `Expected within: ${timeDesc} | Confidence: ${prediction.confidence}`;

    if (prediction.predicted_impact) {
      const impact = prediction.predicted_impact;
      if (impact.cameras) desc += ` | ${impact.cameras} cameras affected`;
      if (impact.recordingAtRisk) desc += ` | Recording at risk`;
      if (impact.complianceAtRisk) desc += ` | Compliance risk`;
    }

    return desc;
  }
}

export default DigitalTwinPredictionIntegration;
