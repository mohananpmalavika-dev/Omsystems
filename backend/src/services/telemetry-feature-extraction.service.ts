/**
 * Telemetry Feature Extraction Service
 * 
 * Extracts prediction features from raw telemetry data including:
 * - Moving averages (7-day, 30-day)
 * - Trend slopes and direction
 * - Degradation rates
 * - Anomaly scores
 * - Statistical metrics (std dev, variance, min/max)
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

interface TelemetryDataPoint {
  timestamp: Date;
  value: number;
}

interface ExtractedFeatures {
  deviceId: string;
  deviceType: string;
  extractedAt: Date;
  movingAvg7d: number | null;
  movingAvg30d: number | null;
  trendSlope: number | null;
  trendDirection: 'improving' | 'stable' | 'degrading';
  stdDev: number | null;
  variance: number | null;
  minValue: number | null;
  maxValue: number | null;
  features: Record<string, any>;
}

export class TelemetryFeatureExtractionService {
  constructor(private pool: Pool) {}

  /**
   * Extract features for all devices
   */
  async extractFeaturesForTenant(tenantId: string): Promise<number> {
    let featuresExtracted = 0;

    try {
      // Extract features for recorders
      featuresExtracted += await this.extractRecorderFeatures(tenantId);
      
      // Extract features for disks
      featuresExtracted += await this.extractDiskFeatures(tenantId);
      
      // Extract features for network devices
      featuresExtracted += await this.extractNetworkFeatures(tenantId);
      
      // Extract features for cameras
      featuresExtracted += await this.extractCameraFeatures(tenantId);
      
      // Extract features for UPS
      featuresExtracted += await this.extractUpsFeatures(tenantId);

      logger.info('Feature extraction completed', { tenantId, featuresExtracted });
      return featuresExtracted;
    } catch (error) {
      logger.error('Error extracting features', { error, tenantId });
      throw error;
    }
  }

  /**
   * Extract features for recorders
   */
  private async extractRecorderFeatures(tenantId: string): Promise<number> {
    try {
      const recorders = await this.pool.query(
        `SELECT DISTINCT device_id, device_type, branch_node_id
        FROM device_health_snapshots
        WHERE tenant_id = $1 
          AND device_type = 'recorder'
          AND snapshot_timestamp >= NOW() - INTERVAL '30 days'`,
        [tenantId]
      );

      for (const recorder of recorders.rows) {
        await this.extractDeviceFeatures(
          tenantId,
          recorder.device_id,
          recorder.device_type,
          'health_score'
        );
      }

      return recorders.rows.length;
    } catch (error) {
      logger.error('Error extracting recorder features', { error, tenantId });
      return 0;
    }
  }

  /**
   * Extract features for disks
   */
  private async extractDiskFeatures(tenantId: string): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT DISTINCT 
          ma.device_id,
          'disk' as device_type
        FROM maintenance_assets ma
        JOIN storage_health sh ON sh.asset_id = ma.id
        WHERE ma.tenant_id = $1 
          AND ma.asset_type = 'storage'
          AND sh.last_check_at >= NOW() - INTERVAL '30 days'`,
        [tenantId]
      );

      for (const disk of result.rows) {
        await this.extractDiskHealthFeatures(tenantId, disk.device_id);
      }

      return result.rows.length;
    } catch (error) {
      logger.error('Error extracting disk features', { error, tenantId });
      return 0;
    }
  }

  /**
   * Extract features for network devices
   */
  private async extractNetworkFeatures(tenantId: string): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT DISTINCT 
          branch_node_id as device_id,
          'network' as device_type
        FROM network_health
        WHERE tenant_id = $1 
          AND last_check_at >= NOW() - INTERVAL '7 days'`,
        [tenantId]
      );

      for (const network of result.rows) {
        await this.extractNetworkHealthFeatures(tenantId, network.device_id);
      }

      return result.rows.length;
    } catch (error) {
      logger.error('Error extracting network features', { error, tenantId });
      return 0;
    }
  }


  /**
   * Extract features for cameras
   */
  private async extractCameraFeatures(tenantId: string): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT DISTINCT 
          camera_id as device_id,
          'camera' as device_type
        FROM camera_health_history
        WHERE timestamp >= NOW() - INTERVAL '7 days'`,
        []
      );

      for (const camera of result.rows) {
        await this.extractCameraHealthFeatures(tenantId, camera.device_id);
      }

      return result.rows.length;
    } catch (error) {
      logger.error('Error extracting camera features', { error, tenantId });
      return 0;
    }
  }

  /**
   * Extract features for UPS
   */
  private async extractUpsFeatures(tenantId: string): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT DISTINCT 
          ma.device_id,
          'ups' as device_type
        FROM maintenance_assets ma
        JOIN ups_health uh ON uh.asset_id = ma.id
        WHERE ma.tenant_id = $1 
          AND ma.asset_type = 'ups'
          AND uh.last_check_at >= NOW() - INTERVAL '30 days'`,
        [tenantId]
      );

      for (const ups of result.rows) {
        await this.extractUpsHealthFeatures(tenantId, ups.device_id);
      }

      return result.rows.length;
    } catch (error) {
      logger.error('Error extracting UPS features', { error, tenantId });
      return 0;
    }
  }

  /**
   * Generic device feature extraction
   */
  private async extractDeviceFeatures(
    tenantId: string,
    deviceId: string,
    deviceType: string,
    metricName: string
  ): Promise<void> {
    try {
      // Get time series data
      const timeSeries = await this.getTimeSeries(tenantId, deviceId, deviceType, metricName);
      
      if (timeSeries.length < 7) {
        return; // Insufficient data
      }

      // Calculate features
      const features = this.calculateFeatures(timeSeries);
      
      // Store features
      await this.storeFeatures(tenantId, deviceId, deviceType, features);
    } catch (error) {
      logger.error('Error extracting device features', { error, deviceId });
    }
  }

  /**
   * Extract disk-specific health features
   */
  private async extractDiskHealthFeatures(tenantId: string, deviceId: string): Promise<void> {
    try {
      const healthData = await this.pool.query(
        `SELECT 
          last_check_at as timestamp,
          health_score as value,
          reallocated_sectors,
          pending_sectors,
          temperature_celsius
        FROM storage_health sh
        JOIN maintenance_assets ma ON ma.id = sh.asset_id
        WHERE ma.tenant_id = $1 
          AND ma.device_id = $2
          AND sh.last_check_at >= NOW() - INTERVAL '30 days'
        ORDER BY sh.last_check_at ASC`,
        [tenantId, deviceId]
      );

      if (healthData.rows.length < 3) return;

      const timeSeries: TelemetryDataPoint[] = healthData.rows.map(r => ({
        timestamp: r.timestamp,
        value: r.value || 0
      }));

      const features = this.calculateFeatures(timeSeries);
      
      // Add disk-specific features
      const recent = healthData.rows[healthData.rows.length - 1];
      features.features.reallocated_sectors = recent.reallocated_sectors || 0;
      features.features.pending_sectors = recent.pending_sectors || 0;
      features.features.temperature = recent.temperature_celsius || 0;

      await this.storeFeatures(tenantId, deviceId, 'disk', features);
    } catch (error) {
      logger.error('Error extracting disk health features', { error, deviceId });
    }
  }

  /**
   * Extract network-specific health features
   */
  private async extractNetworkHealthFeatures(tenantId: string, deviceId: string): Promise<void> {
    try {
      const networkData = await this.pool.query(
        `SELECT 
          last_check_at as timestamp,
          latency_ms,
          packet_loss_percentage,
          jitter_ms
        FROM network_health
        WHERE tenant_id = $1 
          AND branch_node_id = $2
          AND last_check_at >= NOW() - INTERVAL '7 days'
        ORDER BY last_check_at ASC`,
        [tenantId, deviceId]
      );

      if (networkData.rows.length < 10) return;

      // Extract latency features
      const latencyTimeSeries: TelemetryDataPoint[] = networkData.rows
        .filter(r => r.latency_ms != null)
        .map(r => ({ timestamp: r.timestamp, value: r.latency_ms }));

      if (latencyTimeSeries.length >= 10) {
        const features = this.calculateFeatures(latencyTimeSeries);
        
        // Add network-specific features
        const recentPacketLoss = networkData.rows.slice(-24)
          .reduce((sum, r) => sum + (r.packet_loss_percentage || 0), 0) / 24;
        
        features.features.avg_packet_loss = recentPacketLoss;
        features.features.avg_jitter = networkData.rows.slice(-24)
          .reduce((sum, r) => sum + (r.jitter_ms || 0), 0) / 24;

        await this.storeFeatures(tenantId, deviceId, 'network', features);
      }
    } catch (error) {
      logger.error('Error extracting network features', { error, deviceId });
    }
  }


  /**
   * Extract camera-specific health features
   */
  private async extractCameraHealthFeatures(tenantId: string, deviceId: string): Promise<void> {
    try {
      const cameraData = await this.pool.query(
        `SELECT 
          timestamp,
          response_time_ms,
          packet_loss,
          CASE WHEN stream_active THEN 1 ELSE 0 END as stream_status
        FROM camera_health_history
        WHERE camera_id = $1
          AND timestamp >= NOW() - INTERVAL '7 days'
        ORDER BY timestamp ASC`,
        [deviceId]
      );

      if (cameraData.rows.length < 24) return;

      // Extract response time features
      const responseTimeSeries: TelemetryDataPoint[] = cameraData.rows
        .filter(r => r.response_time_ms != null)
        .map(r => ({ timestamp: r.timestamp, value: r.response_time_ms }));

      if (responseTimeSeries.length >= 24) {
        const features = this.calculateFeatures(responseTimeSeries);
        
        // Add camera-specific features
        const disconnectCount = cameraData.rows.filter(r => r.stream_status === 0).length;
        const avgPacketLoss = cameraData.rows
          .reduce((sum, r) => sum + (r.packet_loss || 0), 0) / cameraData.rows.length;

        features.features.disconnect_count_7d = disconnectCount;
        features.features.avg_packet_loss = avgPacketLoss;
        features.features.disconnect_rate = disconnectCount / cameraData.rows.length;

        await this.storeFeatures(tenantId, deviceId, 'camera', features);
      }
    } catch (error) {
      logger.error('Error extracting camera features', { error, deviceId });
    }
  }

  /**
   * Extract UPS-specific health features
   */
  private async extractUpsHealthFeatures(tenantId: string, deviceId: string): Promise<void> {
    try {
      const upsData = await this.pool.query(
        `SELECT 
          uh.last_check_at as timestamp,
          uh.battery_health_percentage as value,
          uh.runtime_minutes,
          uh.load_percentage,
          uh.temperature
        FROM ups_health uh
        JOIN maintenance_assets ma ON ma.id = uh.asset_id
        WHERE ma.tenant_id = $1 
          AND ma.device_id = $2
          AND uh.last_check_at >= NOW() - INTERVAL '30 days'
        ORDER BY uh.last_check_at ASC`,
        [tenantId, deviceId]
      );

      if (upsData.rows.length < 7) return;

      const timeSeries: TelemetryDataPoint[] = upsData.rows.map(r => ({
        timestamp: r.timestamp,
        value: r.value || 0
      }));

      const features = this.calculateFeatures(timeSeries);
      
      // Add UPS-specific features
      const recentRuntime = upsData.rows.slice(-7)
        .reduce((sum, r) => sum + (r.runtime_minutes || 0), 0) / 7;
      const oldRuntime = upsData.rows.slice(0, 7)
        .reduce((sum, r) => sum + (r.runtime_minutes || 0), 0) / 7;
      
      features.features.avg_runtime = recentRuntime;
      features.features.runtime_degradation = oldRuntime > 0 ? 
        ((oldRuntime - recentRuntime) / oldRuntime) * 100 : 0;
      features.features.avg_load = upsData.rows.slice(-7)
        .reduce((sum, r) => sum + (r.load_percentage || 0), 0) / 7;

      await this.storeFeatures(tenantId, deviceId, 'ups', features);
    } catch (error) {
      logger.error('Error extracting UPS features', { error, deviceId });
    }
  }

  /**
   * Get time series data for a device metric
   */
  private async getTimeSeries(
    tenantId: string,
    deviceId: string,
    deviceType: string,
    metricName: string
  ): Promise<TelemetryDataPoint[]> {
    try {
      const result = await this.pool.query(
        `SELECT 
          snapshot_timestamp as timestamp,
          health_score as value
        FROM device_health_snapshots
        WHERE tenant_id = $1 
          AND device_id = $2
          AND device_type = $3
          AND snapshot_timestamp >= NOW() - INTERVAL '30 days'
        ORDER BY snapshot_timestamp ASC`,
        [tenantId, deviceId, deviceType]
      );

      return result.rows.map(r => ({
        timestamp: r.timestamp,
        value: r.value || 0
      }));
    } catch (error) {
      logger.error('Error getting time series', { error, deviceId });
      return [];
    }
  }

  /**
   * Calculate statistical features from time series
   */
  private calculateFeatures(timeSeries: TelemetryDataPoint[]): ExtractedFeatures {
    const values = timeSeries.map(d => d.value);
    const n = values.length;

    // Moving averages
    const last7 = values.slice(-7);
    const last30 = values.slice(-30);
    const movingAvg7d = last7.length > 0 ? 
      last7.reduce((a, b) => a + b, 0) / last7.length : null;
    const movingAvg30d = last30.length > 0 ? 
      last30.reduce((a, b) => a + b, 0) / last30.length : null;

    // Trend slope (linear regression)
    const trendSlope = this.calculateTrendSlope(timeSeries);
    const trendDirection = trendSlope === null ? 'stable' :
      trendSlope > 0.5 ? 'improving' :
      trendSlope < -0.5 ? 'degrading' : 'stable';

    // Statistical metrics
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    return {
      deviceId: '',
      deviceType: '',
      extractedAt: new Date(),
      movingAvg7d,
      movingAvg30d,
      trendSlope,
      trendDirection,
      stdDev,
      variance,
      minValue,
      maxValue,
      features: {}
    };
  }


  /**
   * Calculate trend slope using linear regression
   */
  private calculateTrendSlope(timeSeries: TelemetryDataPoint[]): number | null {
    if (timeSeries.length < 2) return null;

    // Convert timestamps to numeric (days since first point)
    const startTime = timeSeries[0].timestamp.getTime();
    const x = timeSeries.map((d, i) => i);
    const y = timeSeries.map(d => d.value);
    const n = timeSeries.length;

    // Calculate means
    const xMean = x.reduce((a, b) => a + b, 0) / n;
    const yMean = y.reduce((a, b) => a + b, 0) / n;

    // Calculate slope
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (x[i] - xMean) * (y[i] - yMean);
      denominator += Math.pow(x[i] - xMean, 2);
    }

    return denominator !== 0 ? numerator / denominator : 0;
  }

  /**
   * Store extracted features in database
   */
  private async storeFeatures(
    tenantId: string,
    deviceId: string,
    deviceType: string,
    features: ExtractedFeatures
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO device_health_features (
          tenant_id,
          device_id,
          device_type,
          extracted_at,
          moving_avg_7d,
          moving_avg_30d,
          trend_slope,
          trend_direction,
          std_dev,
          variance,
          min_value,
          max_value,
          features
        ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (tenant_id, device_id, extracted_at)
        DO UPDATE SET
          moving_avg_7d = EXCLUDED.moving_avg_7d,
          moving_avg_30d = EXCLUDED.moving_avg_30d,
          trend_slope = EXCLUDED.trend_slope,
          trend_direction = EXCLUDED.trend_direction,
          std_dev = EXCLUDED.std_dev,
          variance = EXCLUDED.variance,
          min_value = EXCLUDED.min_value,
          max_value = EXCLUDED.max_value,
          features = EXCLUDED.features`,
        [
          tenantId,
          deviceId,
          deviceType,
          features.movingAvg7d,
          features.movingAvg30d,
          features.trendSlope,
          features.trendDirection,
          features.stdDev,
          features.variance,
          features.minValue,
          features.maxValue,
          JSON.stringify(features.features)
        ]
      );
    } catch (error) {
      logger.error('Error storing features', { error, deviceId });
    }
  }
}
