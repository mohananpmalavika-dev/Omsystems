/**
 * Failure Prediction Engine Service
 * 
 * Implements rules-based failure prediction for recorders, disks, network,
 * cameras, UPS, and storage retention. Uses deterministic rules that analyze
 * telemetry trends and generate time-bound failure predictions with evidence.
 * 
 * Phase 1 Implementation: Rules-based approach
 * - Easy to explain and audit
 * - Works with limited historical data
 * - Configurable thresholds per deployment
 * - Foundation for future ML models
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export interface PredictionConfig {
  // Recorder failure thresholds
  recorderTempIncreaseCelsius: number;
  recorderRebootThreshold: number;
  recorderLatencyIncreasePercent: number;
  recorderHeartbeatMissThreshold: number;
  
  // Disk failure thresholds
  diskReallocatedSectorDays: number;
  diskTempThresholdCelsius: number;
  diskLatencyIncreasePercent: number;
  
  // Network failure thresholds
  networkPacketLossPercent: number;
  networkLatencyIncreasePercent: number;
  networkDisconnectThreshold: number;
  networkRouterCpuPercent: number;
  
  // Camera failure thresholds
  cameraRtspDisconnectThreshold: number;
  cameraFrameLossPercent: number;
  cameraResponseTimeIncreasePercent: number;
  cameraPowerCycleThreshold: number;
  
  // UPS failure thresholds
  upsBatteryRuntimeDecreasePercent: number;
  upsVoltageVariationPercent: number;
  upsLoadPercent: number;
  
  // Storage retention thresholds
  storageRetentionDaysThreshold: number;
  storageGrowthAccelerationPercent: number;
}

export interface DeviceTelemetry {
  deviceId: string;
  deviceType: 'recorder' | 'disk' | 'camera' | 'network' | 'ups';
  branchNodeId: string;
  metrics: Record<string, any>;
  timestamp: Date;
}

export interface PredictionEvidence {
  evidenceType: string;
  evidenceDescription: string;
  metricName: string;
  currentValue: number;
  baselineValue: number | null;
  changePercentage: number | null;
  trendData?: Array<{ timestamp: string; value: number }>;
  weight: number;
}

export interface FailurePrediction {
  deviceId: string;
  deviceType: string;
  branchNodeId: string;
  predictionType: string;
  probability: number;
  confidence: 'low' | 'medium' | 'high';
  riskClassification: 'monitor' | 'emerging_risk' | 'high_risk' | 'critical_risk' | 'imminent_failure';
  expectedFailureFrom: Date;
  expectedFailureTo: Date;
  timeHorizonDays: number;
  predictedImpact: {
    cameras?: number;
    recordingAtRisk: boolean;
    complianceAtRisk: boolean;
    estimatedDowntime?: number;
  };
  recommendedAction: string;
  preventiveActions: string[];
  evidence: PredictionEvidence[];
  modelVersion: string;
  predictionMethod: string;
}


const DEFAULT_CONFIG: PredictionConfig = {
  // Recorder
  recorderTempIncreaseCelsius: 25,
  recorderRebootThreshold: 3,
  recorderLatencyIncreasePercent: 200,
  recorderHeartbeatMissThreshold: 5,
  
  // Disk
  diskReallocatedSectorDays: 3,
  diskTempThresholdCelsius: 55,
  diskLatencyIncreasePercent: 150,
  
  // Network
  networkPacketLossPercent: 8,
  networkLatencyIncreasePercent: 150,
  networkDisconnectThreshold: 11,
  networkRouterCpuPercent: 92,
  
  // Camera
  cameraRtspDisconnectThreshold: 10,
  cameraFrameLossPercent: 15,
  cameraResponseTimeIncreasePercent: 200,
  cameraPowerCycleThreshold: 5,
  
  // UPS
  upsBatteryRuntimeDecreasePercent: 40,
  upsVoltageVariationPercent: 10,
  upsLoadPercent: 85,
  
  // Storage
  storageRetentionDaysThreshold: 5,
  storageGrowthAccelerationPercent: 50
};

export class FailurePredictionEngine {
  private config: PredictionConfig;
  private modelVersion = '1.0.0-rules';

  constructor(
    private pool: Pool,
    config?: Partial<PredictionConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate predictions for all devices in a tenant
   */
  async generatePredictions(tenantId: string): Promise<FailurePrediction[]> {
    const predictions: FailurePrediction[] = [];

    try {
      // Get all devices with recent telemetry
      const devices = await this.getDevicesWithTelemetry(tenantId);

      for (const device of devices) {
        let prediction: FailurePrediction | null = null;

        switch (device.deviceType) {
          case 'recorder':
            prediction = await this.predictRecorderFailure(tenantId, device);
            break;
          case 'disk':
            prediction = await this.predictDiskFailure(tenantId, device);
            break;
          case 'network':
            prediction = await this.predictNetworkFailure(tenantId, device);
            break;
          case 'camera':
            prediction = await this.predictCameraFailure(tenantId, device);
            break;
          case 'ups':
            prediction = await this.predictUpsFailure(tenantId, device);
            break;
        }

        if (prediction && prediction.probability >= 0.3) {
          predictions.push(prediction);
        }
      }

      // Check storage retention risks
      const storageRisks = await this.predictStorageRetentionFailure(tenantId);
      predictions.push(...storageRisks);

      return predictions;
    } catch (error) {
      logger.error('Error generating predictions', { error, tenantId });
      throw error;
    }
  }


  /**
   * Predict recorder failure based on temperature, reboots, latency, heartbeat
   */
  private async predictRecorderFailure(
    tenantId: string,
    device: DeviceTelemetry
  ): Promise<FailurePrediction | null> {
    const evidence: PredictionEvidence[] = [];
    let probability = 0;
    let riskFactors = 0;

    try {
      // Get recorder health history (last 30 days)
      const healthHistory = await this.pool.query(
        `SELECT 
          timestamp, 
          metrics->>'temperature' as temperature,
          metrics->>'cpu_usage' as cpu_usage,
          metrics->>'uptime' as uptime,
          metrics
        FROM device_health_snapshots
        WHERE tenant_id = $1 
          AND device_id = $2
          AND device_type = 'recorder'
          AND snapshot_timestamp >= NOW() - INTERVAL '30 days'
        ORDER BY snapshot_timestamp ASC`,
        [tenantId, device.deviceId]
      );

      if (healthHistory.rows.length < 7) {
        return null; // Insufficient data
      }

      const recent = healthHistory.rows.slice(-7);
      const baseline = healthHistory.rows.slice(0, 7);

      // Rule 1: Temperature increase
      const currentTemp = parseFloat(recent[recent.length - 1].temperature) || 0;
      const baselineTemp = baseline.reduce((sum, r) => sum + (parseFloat(r.temperature) || 0), 0) / baseline.length;
      const tempIncrease = currentTemp - baselineTemp;

      if (tempIncrease >= this.config.recorderTempIncreaseCelsius) {
        riskFactors++;
        probability += 0.25;
        evidence.push({
          evidenceType: 'temperature_trend',
          evidenceDescription: `Recorder temperature increased from ${baselineTemp.toFixed(1)}°C to ${currentTemp.toFixed(1)}°C`,
          metricName: 'temperature',
          currentValue: currentTemp,
          baselineValue: baselineTemp,
          changePercentage: (tempIncrease / baselineTemp) * 100,
          weight: 0.3
        });
      }

      // Rule 2: Restart frequency
      const restartCount = await this.getRestartCount(tenantId, device.deviceId, 7);
      if (restartCount >= this.config.recorderRebootThreshold) {
        riskFactors++;
        probability += 0.3;
        evidence.push({
          evidenceType: 'restart_frequency',
          evidenceDescription: `${restartCount} unexpected reboots in seven days`,
          metricName: 'restart_count',
          currentValue: restartCount,
          baselineValue: 0,
          changePercentage: null,
          weight: 0.35
        });
      }

      // Rule 3: Write latency increase
      const latencyTrend = await this.getLatencyTrend(tenantId, device.deviceId);
      if (latencyTrend.increasePercent >= this.config.recorderLatencyIncreasePercent) {
        riskFactors++;
        probability += 0.25;
        evidence.push({
          evidenceType: 'write_latency',
          evidenceDescription: `Storage write latency increased by ${latencyTrend.increasePercent.toFixed(0)}%`,
          metricName: 'write_latency',
          currentValue: latencyTrend.current,
          baselineValue: latencyTrend.baseline,
          changePercentage: latencyTrend.increasePercent,
          weight: 0.25
        });
      }

      // Rule 4: Heartbeat instability
      const missedHeartbeats = await this.getMissedHeartbeats(tenantId, device.deviceId, 1);
      if (missedHeartbeats >= this.config.recorderHeartbeatMissThreshold) {
        riskFactors++;
        probability += 0.2;
        evidence.push({
          evidenceType: 'heartbeat_instability',
          evidenceDescription: `Recorder heartbeat instability detected (${missedHeartbeats} missed in 24h)`,
          metricName: 'heartbeat_missed',
          currentValue: missedHeartbeats,
          baselineValue: 0,
          changePercentage: null,
          weight: 0.1
        });
      }

      if (riskFactors === 0) {
        return null; // No risk detected
      }

      // Adjust probability based on risk factors
      probability = Math.min(probability, 0.98);

      // Calculate time to failure
      const hoursToFailure = this.estimateTimeToFailure(probability, riskFactors);


      // Get cameras affected
      const camerasAffected = await this.getCameraCountForRecorder(tenantId, device.deviceId);

      return {
        deviceId: device.deviceId,
        deviceType: 'recorder',
        branchNodeId: device.branchNodeId,
        predictionType: 'recorder_failure',
        probability,
        confidence: this.determineConfidence(healthHistory.rows.length, riskFactors),
        riskClassification: this.classifyRisk(probability),
        expectedFailureFrom: new Date(Date.now() + hoursToFailure.min * 3600000),
        expectedFailureTo: new Date(Date.now() + hoursToFailure.max * 3600000),
        timeHorizonDays: Math.ceil(hoursToFailure.max / 24),
        predictedImpact: {
          cameras: camerasAffected,
          recordingAtRisk: true,
          complianceAtRisk: camerasAffected > 0
        },
        recommendedAction: 'Replace or inspect recorder immediately',
        preventiveActions: [
          'Check recorder cooling system',
          'Inspect power supply',
          'Review system logs for errors',
          'Prepare replacement hardware',
          'Schedule maintenance window'
        ],
        evidence,
        modelVersion: this.modelVersion,
        predictionMethod: 'rule-based'
      };
    } catch (error) {
      logger.error('Error predicting recorder failure', { error, deviceId: device.deviceId });
      return null;
    }
  }

  /**
   * Predict disk failure based on SMART metrics and temperature
   */
  private async predictDiskFailure(
    tenantId: string,
    device: DeviceTelemetry
  ): Promise<FailurePrediction | null> {
    const evidence: PredictionEvidence[] = [];
    let probability = 0;
    let riskFactors = 0;

    try {
      // Get disk health history
      const diskHealth = await this.pool.query(
        `SELECT 
          timestamp,
          reallocated_sectors,
          pending_sectors,
          uncorrectable_sectors,
          temperature_celsius,
          health_score,
          metadata
        FROM storage_health
        WHERE tenant_id = $1 
          AND asset_id IN (
            SELECT id FROM maintenance_assets 
            WHERE device_id = $2 AND asset_type = 'storage'
          )
        ORDER BY last_check_at DESC
        LIMIT 30`,
        [tenantId, device.deviceId]
      );

      if (diskHealth.rows.length < 3) {
        return null;
      }

      const recent = diskHealth.rows.slice(0, 3);
      const older = diskHealth.rows.slice(-7);

      // Rule 1: Reallocated sectors increasing
      const recentReallocated = recent.map(r => r.reallocated_sectors || 0);
      const isIncreasing = recentReallocated[0] > recentReallocated[1] && 
                          recentReallocated[1] > recentReallocated[2];
      
      if (isIncreasing && recentReallocated[0] > 0) {
        riskFactors++;
        probability += 0.35;
        evidence.push({
          evidenceType: 'reallocated_sectors',
          evidenceDescription: 'SMART reallocated-sector count increasing',
          metricName: 'reallocated_sectors',
          currentValue: recentReallocated[0],
          baselineValue: recentReallocated[2],
          changePercentage: null,
          weight: 0.4
        });
      }

      // Rule 2: Pending or uncorrectable sectors
      const currentPending = recent[0].pending_sectors || 0;
      const currentUncorrectable = recent[0].uncorrectable_sectors || 0;
      
      if (currentPending > 0 || currentUncorrectable > 0) {
        riskFactors++;
        probability += 0.3;
        evidence.push({
          evidenceType: 'sector_errors',
          evidenceDescription: `Pending sectors: ${currentPending}, Uncorrectable: ${currentUncorrectable}`,
          metricName: 'sector_errors',
          currentValue: currentPending + currentUncorrectable,
          baselineValue: 0,
          changePercentage: null,
          weight: 0.35
        });
      }


      // Rule 3: Disk temperature
      const currentTemp = recent[0].temperature_celsius || 0;
      if (currentTemp > this.config.diskTempThresholdCelsius) {
        riskFactors++;
        probability += 0.2;
        evidence.push({
          evidenceType: 'disk_temperature',
          evidenceDescription: `Disk temperature repeatedly above threshold (${currentTemp}°C)`,
          metricName: 'temperature',
          currentValue: currentTemp,
          baselineValue: this.config.diskTempThresholdCelsius,
          changePercentage: ((currentTemp - this.config.diskTempThresholdCelsius) / this.config.diskTempThresholdCelsius) * 100,
          weight: 0.2
        });
      }

      // Rule 4: Health score degradation
      const currentHealth = recent[0].health_score || 100;
      const baselineHealth = older.reduce((sum, r) => sum + (r.health_score || 100), 0) / older.length;
      const healthDrop = baselineHealth - currentHealth;
      
      if (healthDrop > 40) {
        riskFactors++;
        probability += 0.15;
        evidence.push({
          evidenceType: 'health_degradation',
          evidenceDescription: `Health score dropped from ${baselineHealth.toFixed(0)} to ${currentHealth.toFixed(0)}`,
          metricName: 'health_score',
          currentValue: currentHealth,
          baselineValue: baselineHealth,
          changePercentage: (healthDrop / baselineHealth) * 100,
          weight: 0.05
        });
      }

      if (riskFactors === 0) {
        return null;
      }

      probability = Math.min(probability, 0.95);
      const daysToFailure = this.estimateDiskFailureDays(probability, currentHealth);

      return {
        deviceId: device.deviceId,
        deviceType: 'disk',
        branchNodeId: device.branchNodeId,
        predictionType: 'disk_failure',
        probability,
        confidence: this.determineConfidence(diskHealth.rows.length, riskFactors),
        riskClassification: this.classifyRisk(probability),
        expectedFailureFrom: new Date(Date.now() + daysToFailure.min * 86400000),
        expectedFailureTo: new Date(Date.now() + daysToFailure.max * 86400000),
        timeHorizonDays: daysToFailure.max,
        predictedImpact: {
          recordingAtRisk: true,
          complianceAtRisk: true
        },
        recommendedAction: `Replace disk before ${new Date(Date.now() + daysToFailure.min * 86400000).toLocaleDateString()}`,
        preventiveActions: [
          'Backup critical data immediately',
          'Order replacement disk',
          'Schedule maintenance window',
          'Prepare for data migration',
          'Monitor disk status hourly'
        ],
        evidence,
        modelVersion: this.modelVersion,
        predictionMethod: 'rule-based'
      };
    } catch (error) {
      logger.error('Error predicting disk failure', { error, deviceId: device.deviceId });
      return null;
    }
  }


  /**
   * Predict network failure based on packet loss, latency, disconnections
   */
  private async predictNetworkFailure(
    tenantId: string,
    device: DeviceTelemetry
  ): Promise<FailurePrediction | null> {
    const evidence: PredictionEvidence[] = [];
    let probability = 0;
    let riskFactors = 0;

    try {
      // Get network health history (last 48 hours)
      const networkHealth = await this.pool.query(
        `SELECT 
          timestamp,
          latency_ms,
          packet_loss_percentage,
          status,
          metadata
        FROM network_health
        WHERE tenant_id = $1 
          AND (asset_id IN (SELECT id FROM maintenance_assets WHERE device_id = $2)
               OR branch_node_id = $3)
          AND last_check_at >= NOW() - INTERVAL '48 hours'
        ORDER BY last_check_at DESC`,
        [tenantId, device.deviceId, device.branchNodeId]
      );

      if (networkHealth.rows.length < 10) {
        return null;
      }

      const recent = networkHealth.rows.slice(0, 24);
      const baseline = networkHealth.rows.slice(-24);

      // Rule 1: Packet loss increase
      const currentPacketLoss = recent.reduce((sum, r) => sum + (r.packet_loss_percentage || 0), 0) / recent.length;
      if (currentPacketLoss >= this.config.networkPacketLossPercent) {
        riskFactors++;
        probability += 0.3;
        evidence.push({
          evidenceType: 'packet_loss',
          evidenceDescription: `Packet loss increased to ${currentPacketLoss.toFixed(1)}%`,
          metricName: 'packet_loss',
          currentValue: currentPacketLoss,
          baselineValue: 1.0,
          changePercentage: ((currentPacketLoss - 1.0) / 1.0) * 100,
          weight: 0.35
        });
      }

      // Rule 2: Latency variation
      const currentLatency = recent.reduce((sum, r) => sum + (r.latency_ms || 0), 0) / recent.length;
      const baselineLatency = baseline.reduce((sum, r) => sum + (r.latency_ms || 0), 0) / baseline.length;
      const latencyIncrease = ((currentLatency - baselineLatency) / baselineLatency) * 100;

      if (latencyIncrease >= this.config.networkLatencyIncreasePercent) {
        riskFactors++;
        probability += 0.25;
        evidence.push({
          evidenceType: 'latency_increase',
          evidenceDescription: `Latency variation increased by ${latencyIncrease.toFixed(0)}%`,
          metricName: 'latency',
          currentValue: currentLatency,
          baselineValue: baselineLatency,
          changePercentage: latencyIncrease,
          weight: 0.25
        });
      }

      // Rule 3: WAN disconnections
      const disconnectCount = networkHealth.rows.filter(r => r.status === 'critical').length;
      if (disconnectCount >= this.config.networkDisconnectThreshold) {
        riskFactors++;
        probability += 0.3;
        evidence.push({
          evidenceType: 'wan_disconnections',
          evidenceDescription: `${disconnectCount} WAN disconnections in 48 hours`,
          metricName: 'disconnect_count',
          currentValue: disconnectCount,
          baselineValue: 2,
          changePercentage: null,
          weight: 0.3
        });
      }

      // Rule 4: Backup ISP status
      const backupAvailable = device.metrics?.backupIspAvailable === true;
      if (!backupAvailable && riskFactors > 0) {
        probability += 0.15;
        evidence.push({
          evidenceType: 'backup_unavailable',
          evidenceDescription: 'Backup ISP unavailable',
          metricName: 'backup_isp',
          currentValue: 0,
          baselineValue: 1,
          changePercentage: null,
          weight: 0.1
        });
      }

      if (riskFactors === 0) {
        return null;
      }

      probability = Math.min(probability, 0.90);
      const hoursToFailure = { min: 6, max: 18 };

      return {
        deviceId: device.deviceId,
        deviceType: 'network',
        branchNodeId: device.branchNodeId,
        predictionType: 'network_failure',
        probability,
        confidence: this.determineConfidence(networkHealth.rows.length, riskFactors),
        riskClassification: this.classifyRisk(probability),
        expectedFailureFrom: new Date(Date.now() + hoursToFailure.min * 3600000),
        expectedFailureTo: new Date(Date.now() + hoursToFailure.max * 3600000),
        timeHorizonDays: 1,
        predictedImpact: {
          recordingAtRisk: true,
          complianceAtRisk: false
        },
        recommendedAction: 'Escalate to ISP and restore backup connection',
        preventiveActions: [
          'Contact ISP support',
          'Enable backup connection',
          'Check router configuration',
          'Monitor bandwidth usage',
          'Prepare for failover'
        ],
        evidence,
        modelVersion: this.modelVersion,
        predictionMethod: 'rule-based'
      };
    } catch (error) {
      logger.error('Error predicting network failure', { error, deviceId: device.deviceId });
      return null;
    }
  }


  /**
   * Predict camera failure based on disconnects, frame loss, response time
   */
  private async predictCameraFailure(
    tenantId: string,
    device: DeviceTelemetry
  ): Promise<FailurePrediction | null> {
    const evidence: PredictionEvidence[] = [];
    let probability = 0;
    let riskFactors = 0;

    try {
      // Get camera health history (last 7 days)
      const cameraHealth = await this.pool.query(
        `SELECT 
          timestamp,
          response_time_ms,
          packet_loss,
          stream_active,
          video_loss,
          metadata
        FROM camera_health_history
        WHERE camera_id = $1
          AND timestamp >= NOW() - INTERVAL '7 days'
        ORDER BY timestamp DESC`,
        [device.deviceId]
      );

      if (cameraHealth.rows.length < 48) {
        return null;
      }

      const recent = cameraHealth.rows.slice(0, 48); // Last 24 hours
      const baseline = cameraHealth.rows.slice(-48);

      // Rule 1: RTSP disconnects
      const disconnectCount = recent.filter(r => r.stream_active === false).length;
      if (disconnectCount >= this.config.cameraRtspDisconnectThreshold) {
        riskFactors++;
        probability += 0.3;
        evidence.push({
          evidenceType: 'rtsp_disconnects',
          evidenceDescription: `${disconnectCount} RTSP disconnects in 24 hours`,
          metricName: 'disconnect_count',
          currentValue: disconnectCount,
          baselineValue: 2,
          changePercentage: null,
          weight: 0.35
        });
      }

      // Rule 2: Frame loss
      const frameLoss = recent.reduce((sum, r) => sum + (r.packet_loss || 0), 0) / recent.length;
      if (frameLoss >= this.config.cameraFrameLossPercent) {
        riskFactors++;
        probability += 0.25;
        evidence.push({
          evidenceType: 'frame_loss',
          evidenceDescription: `Frame loss at ${frameLoss.toFixed(1)}%`,
          metricName: 'frame_loss',
          currentValue: frameLoss,
          baselineValue: 2.0,
          changePercentage: ((frameLoss - 2.0) / 2.0) * 100,
          weight: 0.3
        });
      }

      // Rule 3: Response time increase
      const currentResponseTime = recent.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / recent.length;
      const baselineResponseTime = baseline.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / baseline.length;
      const responseIncrease = ((currentResponseTime - baselineResponseTime) / baselineResponseTime) * 100;

      if (responseIncrease >= this.config.cameraResponseTimeIncreasePercent) {
        riskFactors++;
        probability += 0.25;
        evidence.push({
          evidenceType: 'response_time',
          evidenceDescription: `Response time increased by ${responseIncrease.toFixed(0)}%`,
          metricName: 'response_time',
          currentValue: currentResponseTime,
          baselineValue: baselineResponseTime,
          changePercentage: responseIncrease,
          weight: 0.25
        });
      }

      // Rule 4: Video loss events
      const videoLossCount = recent.filter(r => r.video_loss === true).length;
      if (videoLossCount > 5) {
        riskFactors++;
        probability += 0.2;
        evidence.push({
          evidenceType: 'video_loss',
          evidenceDescription: `${videoLossCount} video loss events detected`,
          metricName: 'video_loss_count',
          currentValue: videoLossCount,
          baselineValue: 0,
          changePercentage: null,
          weight: 0.1
        });
      }

      if (riskFactors === 0) {
        return null;
      }

      probability = Math.min(probability, 0.85);
      const daysToFailure = { min: 1, max: 3 };

      return {
        deviceId: device.deviceId,
        deviceType: 'camera',
        branchNodeId: device.branchNodeId,
        predictionType: 'camera_failure',
        probability,
        confidence: this.determineConfidence(cameraHealth.rows.length, riskFactors),
        riskClassification: this.classifyRisk(probability),
        expectedFailureFrom: new Date(Date.now() + daysToFailure.min * 86400000),
        expectedFailureTo: new Date(Date.now() + daysToFailure.max * 86400000),
        timeHorizonDays: daysToFailure.max,
        predictedImpact: {
          cameras: 1,
          recordingAtRisk: true,
          complianceAtRisk: false
        },
        recommendedAction: 'Schedule camera maintenance or replacement',
        preventiveActions: [
          'Check camera power supply',
          'Inspect network cabling',
          'Clean camera lens and housing',
          'Verify PoE switch port',
          'Test with replacement camera'
        ],
        evidence,
        modelVersion: this.modelVersion,
        predictionMethod: 'rule-based'
      };
    } catch (error) {
      logger.error('Error predicting camera failure', { error, deviceId: device.deviceId });
      return null;
    }
  }


  /**
   * Predict UPS failure based on battery health and load
   */
  private async predictUpsFailure(
    tenantId: string,
    device: DeviceTelemetry
  ): Promise<FailurePrediction | null> {
    const evidence: PredictionEvidence[] = [];
    let probability = 0;
    let riskFactors = 0;

    try {
      const upsHealth = await this.pool.query(
        `SELECT 
          timestamp,
          battery_health_percentage,
          runtime_minutes,
          load_percentage,
          temperature,
          charging_status,
          status
        FROM ups_health
        WHERE tenant_id = $1 
          AND asset_id IN (SELECT id FROM maintenance_assets WHERE device_id = $2)
        ORDER BY last_check_at DESC
        LIMIT 30`,
        [tenantId, device.deviceId]
      );

      if (upsHealth.rows.length < 3) {
        return null;
      }

      const recent = upsHealth.rows[0];
      const older = upsHealth.rows.slice(-7);

      // Rule 1: Battery runtime decrease
      const currentRuntime = recent.runtime_minutes || 0;
      const baselineRuntime = older.reduce((sum, r) => sum + (r.runtime_minutes || 0), 0) / older.length;
      const runtimeDecrease = ((baselineRuntime - currentRuntime) / baselineRuntime) * 100;

      if (runtimeDecrease >= this.config.upsBatteryRuntimeDecreasePercent) {
        riskFactors++;
        probability += 0.35;
        evidence.push({
          evidenceType: 'battery_runtime',
          evidenceDescription: `Battery runtime decreased by ${runtimeDecrease.toFixed(0)}%`,
          metricName: 'runtime',
          currentValue: currentRuntime,
          baselineValue: baselineRuntime,
          changePercentage: runtimeDecrease,
          weight: 0.4
        });
      }

      // Rule 2: Battery health
      const batteryHealth = recent.battery_health_percentage || 100;
      if (batteryHealth < 60) {
        riskFactors++;
        probability += 0.3;
        evidence.push({
          evidenceType: 'battery_health',
          evidenceDescription: `Battery health at ${batteryHealth}%`,
          metricName: 'battery_health',
          currentValue: batteryHealth,
          baselineValue: 100,
          changePercentage: ((100 - batteryHealth) / 100) * 100,
          weight: 0.35
        });
      }

      // Rule 3: High load
      const currentLoad = recent.load_percentage || 0;
      if (currentLoad >= this.config.upsLoadPercent) {
        riskFactors++;
        probability += 0.2;
        evidence.push({
          evidenceType: 'high_load',
          evidenceDescription: `Load at ${currentLoad}% (near capacity)`,
          metricName: 'load',
          currentValue: currentLoad,
          baselineValue: 70,
          changePercentage: null,
          weight: 0.15
        });
      }

      // Rule 4: Charging failures
      const chargingFailures = upsHealth.rows.filter(r => 
        r.charging_status === 'failed' || r.charging_status === 'error'
      ).length;
      
      if (chargingFailures > 2) {
        riskFactors++;
        probability += 0.15;
        evidence.push({
          evidenceType: 'charging_failure',
          evidenceDescription: `${chargingFailures} charging failures detected`,
          metricName: 'charging_failures',
          currentValue: chargingFailures,
          baselineValue: 0,
          changePercentage: null,
          weight: 0.1
        });
      }

      if (riskFactors === 0) {
        return null;
      }

      probability = Math.min(probability, 0.90);
      const daysToFailure = { min: 3, max: 7 };

      return {
        deviceId: device.deviceId,
        deviceType: 'ups',
        branchNodeId: device.branchNodeId,
        predictionType: 'ups_failure',
        probability,
        confidence: this.determineConfidence(upsHealth.rows.length, riskFactors),
        riskClassification: this.classifyRisk(probability),
        expectedFailureFrom: new Date(Date.now() + daysToFailure.min * 86400000),
        expectedFailureTo: new Date(Date.now() + daysToFailure.max * 86400000),
        timeHorizonDays: daysToFailure.max,
        predictedImpact: {
          recordingAtRisk: true,
          complianceAtRisk: true,
          estimatedDowntime: 120
        },
        recommendedAction: 'Inspect and test UPS, replace battery if needed',
        preventiveActions: [
          'Test UPS under load',
          'Check battery connections',
          'Inspect for physical damage',
          'Verify charging circuit',
          'Plan battery replacement'
        ],
        evidence,
        modelVersion: this.modelVersion,
        predictionMethod: 'rule-based'
      };
    } catch (error) {
      logger.error('Error predicting UPS failure', { error, deviceId: device.deviceId });
      return null;
    }
  }


  /**
   * Predict storage retention compliance failure
   */
  private async predictStorageRetentionFailure(tenantId: string): Promise<FailurePrediction[]> {
    const predictions: FailurePrediction[] = [];

    try {
      // Get branches with storage concerns
      const storageData = await this.pool.query(
        `SELECT 
          branch_node_id,
          storage_node_name,
          total_capacity_gb,
          used_capacity_gb,
          utilization_percentage,
          cameras_allocated,
          estimated_days_until_full
        FROM storage_health_checks
        WHERE tenant_id = $1
          AND check_timestamp >= NOW() - INTERVAL '7 days'
          AND estimated_days_until_full IS NOT NULL
          AND estimated_days_until_full <= $2
        ORDER BY branch_node_id, check_timestamp DESC`,
        [tenantId, this.config.storageRetentionDaysThreshold + 2]
      );

      const branchMap = new Map<string, any>();
      for (const row of storageData.rows) {
        if (!branchMap.has(row.branch_node_id)) {
          branchMap.set(row.branch_node_id, row);
        }
      }

      for (const [branchNodeId, data] of branchMap) {
        const evidence: PredictionEvidence[] = [];
        let probability = 0;

        const daysUntilFull = data.estimated_days_until_full;
        const utilizationPercent = data.utilization_percentage || 0;

        // Calculate probability based on days until full
        if (daysUntilFull <= 2) {
          probability = 0.95;
        } else if (daysUntilFull <= 5) {
          probability = 0.85;
        } else if (daysUntilFull <= 7) {
          probability = 0.70;
        } else {
          probability = 0.50;
        }

        evidence.push({
          evidenceType: 'storage_depletion',
          evidenceDescription: `Storage will be full in approximately ${daysUntilFull} days`,
          metricName: 'days_until_full',
          currentValue: daysUntilFull,
          baselineValue: 30,
          changePercentage: null,
          weight: 0.5
        });

        evidence.push({
          evidenceType: 'storage_utilization',
          evidenceDescription: `Current utilization: ${utilizationPercent.toFixed(1)}%`,
          metricName: 'utilization',
          currentValue: utilizationPercent,
          baselineValue: 70,
          changePercentage: null,
          weight: 0.3
        });

        predictions.push({
          deviceId: data.storage_node_name,
          deviceType: 'storage',
          branchNodeId,
          predictionType: 'storage_retention_failure',
          probability,
          confidence: 'high',
          riskClassification: this.classifyRisk(probability),
          expectedFailureFrom: new Date(Date.now() + (daysUntilFull - 1) * 86400000),
          expectedFailureTo: new Date(Date.now() + (daysUntilFull + 1) * 86400000),
          timeHorizonDays: daysUntilFull,
          predictedImpact: {
            cameras: data.cameras_allocated,
            recordingAtRisk: true,
            complianceAtRisk: true
          },
          recommendedAction: 'Increase storage capacity or adjust retention policies',
          preventiveActions: [
            'Review and delete old recordings',
            'Adjust retention policies',
            'Add storage capacity',
            'Archive non-critical data',
            'Optimize compression settings'
          ],
          evidence,
          modelVersion: this.modelVersion,
          predictionMethod: 'rule-based'
        });
      }

      return predictions;
    } catch (error) {
      logger.error('Error predicting storage retention failure', { error, tenantId });
      return [];
    }
  }


  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async getDevicesWithTelemetry(tenantId: string): Promise<DeviceTelemetry[]> {
    const devices: DeviceTelemetry[] = [];

    try {
      // Get recorders with recent health data
      const recorders = await this.pool.query(
        `SELECT DISTINCT 
          device_id,
          'recorder' as device_type,
          branch_node_id,
          metrics,
          snapshot_timestamp as timestamp
        FROM device_health_snapshots
        WHERE tenant_id = $1 
          AND device_type = 'recorder'
          AND snapshot_timestamp >= NOW() - INTERVAL '1 hour'
        ORDER BY device_id, snapshot_timestamp DESC`,
        [tenantId]
      );

      for (const row of recorders.rows) {
        devices.push({
          deviceId: row.device_id,
          deviceType: 'recorder',
          branchNodeId: row.branch_node_id,
          metrics: row.metrics,
          timestamp: row.timestamp
        });
      }

      // Add more device types as needed
    } catch (error) {
      logger.error('Error getting devices with telemetry', { error, tenantId });
    }

    return devices;
  }

  private async getRestartCount(tenantId: string, deviceId: string, days: number): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as restart_count
        FROM device_health_snapshots
        WHERE tenant_id = $1 
          AND device_id = $2
          AND snapshot_timestamp >= NOW() - INTERVAL '1 day' * $3
          AND metrics->>'event_type' = 'restart'`,
        [tenantId, deviceId, days]
      );
      return parseInt(result.rows[0]?.restart_count || '0');
    } catch (error) {
      return 0;
    }
  }

  private async getLatencyTrend(
    tenantId: string,
    deviceId: string
  ): Promise<{ current: number; baseline: number; increasePercent: number }> {
    try {
      const result = await this.pool.query(
        `SELECT 
          AVG(CASE WHEN snapshot_timestamp >= NOW() - INTERVAL '24 hours' 
            THEN (metrics->>'write_latency_ms')::numeric ELSE NULL END) as current,
          AVG(CASE WHEN snapshot_timestamp < NOW() - INTERVAL '24 hours' 
            THEN (metrics->>'write_latency_ms')::numeric ELSE NULL END) as baseline
        FROM device_health_snapshots
        WHERE tenant_id = $1 
          AND device_id = $2
          AND snapshot_timestamp >= NOW() - INTERVAL '7 days'
          AND metrics->>'write_latency_ms' IS NOT NULL`,
        [tenantId, deviceId]
      );

      const current = parseFloat(result.rows[0]?.current || '0');
      const baseline = parseFloat(result.rows[0]?.baseline || '0');
      const increasePercent = baseline > 0 ? ((current - baseline) / baseline) * 100 : 0;

      return { current, baseline, increasePercent };
    } catch (error) {
      return { current: 0, baseline: 0, increasePercent: 0 };
    }
  }

  private async getMissedHeartbeats(tenantId: string, deviceId: string, days: number): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as missed_count
        FROM device_health_snapshots
        WHERE tenant_id = $1 
          AND device_id = $2
          AND snapshot_timestamp >= NOW() - INTERVAL '1 day' * $3
          AND metrics->>'heartbeat_status' = 'missed'`,
        [tenantId, deviceId, days]
      );
      return parseInt(result.rows[0]?.missed_count || '0');
    } catch (error) {
      return 0;
    }
  }

  private async getCameraCountForRecorder(tenantId: string, deviceId: string): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as camera_count
        FROM cameras c
        WHERE c.recorder_id = $1`,
        [deviceId]
      );
      return parseInt(result.rows[0]?.camera_count || '0');
    } catch (error) {
      return 0;
    }
  }

  private estimateTimeToFailure(probability: number, riskFactors: number): { min: number; max: number } {
    // Hours to failure based on probability and risk factors
    if (probability >= 0.9) return { min: 12, max: 24 };
    if (probability >= 0.8) return { min: 18, max: 36 };
    if (probability >= 0.7) return { min: 24, max: 48 };
    if (probability >= 0.6) return { min: 48, max: 72 };
    return { min: 72, max: 120 };
  }

  private estimateDiskFailureDays(probability: number, healthScore: number): { min: number; max: number } {
    if (probability >= 0.9 || healthScore < 20) return { min: 2, max: 4 };
    if (probability >= 0.8 || healthScore < 40) return { min: 3, max: 5 };
    if (probability >= 0.7 || healthScore < 60) return { min: 5, max: 7 };
    return { min: 7, max: 14 };
  }

  private classifyRisk(probability: number): 'monitor' | 'emerging_risk' | 'high_risk' | 'critical_risk' | 'imminent_failure' {
    if (probability >= 0.95) return 'imminent_failure';
    if (probability >= 0.80) return 'critical_risk';
    if (probability >= 0.65) return 'high_risk';
    if (probability >= 0.40) return 'emerging_risk';
    return 'monitor';
  }

  private determineConfidence(dataPoints: number, riskFactors: number): 'low' | 'medium' | 'high' {
    if (dataPoints >= 30 && riskFactors >= 3) return 'high';
    if (dataPoints >= 14 && riskFactors >= 2) return 'medium';
    return 'low';
  }
}
