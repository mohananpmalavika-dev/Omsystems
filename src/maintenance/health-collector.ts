/**
 * Health Collector Service
 * Continuously collects health metrics from all system components
 * and stores them in the database for monitoring and alerting
 */

import type { ControlPlaneStore } from '../control-plane-store.js';

export interface HealthMetric {
  componentId: string;
  componentType: 'camera' | 'storage' | 'network' | 'ups' | 'recorder';
  metricName: string;
  value: number;
  unit: string;
  timestamp: Date;
  status: 'healthy' | 'warning' | 'critical';
  metadata?: Record<string, any>;
}

export interface HealthThreshold {
  metricName: string;
  warningThreshold: number;
  criticalThreshold: number;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
}

export class HealthCollectorService {
  private store: ControlPlaneStore;
  private logger: any;
  private collectionIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  // Default collection intervals (in milliseconds)
  private readonly INTERVALS = {
    camera: 5 * 60 * 1000,      // 5 minutes
    storage: 15 * 60 * 1000,    // 15 minutes
    network: 10 * 60 * 1000,    // 10 minutes
    ups: 20 * 60 * 1000,        // 20 minutes
    recorder: 10 * 60 * 1000,   // 10 minutes
  };

  // Default health thresholds
  private readonly THRESHOLDS: Record<string, HealthThreshold[]> = {
    camera: [
      { metricName: 'fps', warningThreshold: 20, criticalThreshold: 15, operator: 'lt' },
      { metricName: 'bitrate', warningThreshold: 2000, criticalThreshold: 1000, operator: 'lt' },
      { metricName: 'temperature', warningThreshold: 60, criticalThreshold: 70, operator: 'gt' },
      { metricName: 'latency_ms', warningThreshold: 500, criticalThreshold: 1000, operator: 'gt' },
      { metricName: 'packet_loss', warningThreshold: 5, criticalThreshold: 10, operator: 'gt' },
    ],
    storage: [
      { metricName: 'usage_percentage', warningThreshold: 80, criticalThreshold: 90, operator: 'gte' },
      { metricName: 'temperature', warningThreshold: 50, criticalThreshold: 60, operator: 'gt' },
      { metricName: 'bad_sectors', warningThreshold: 10, criticalThreshold: 50, operator: 'gt' },
      { metricName: 'remaining_lifetime_years', warningThreshold: 1, criticalThreshold: 0.5, operator: 'lt' },
    ],
    network: [
      { metricName: 'latency_ms', warningThreshold: 100, criticalThreshold: 200, operator: 'gt' },
      { metricName: 'packet_loss_percentage', warningThreshold: 1, criticalThreshold: 5, operator: 'gt' },
      { metricName: 'jitter_ms', warningThreshold: 20, criticalThreshold: 50, operator: 'gt' },
    ],
    ups: [
      { metricName: 'battery_health_percentage', warningThreshold: 85, criticalThreshold: 70, operator: 'lt' },
      { metricName: 'runtime_minutes', warningThreshold: 30, criticalThreshold: 15, operator: 'lt' },
      { metricName: 'load_percentage', warningThreshold: 80, criticalThreshold: 95, operator: 'gt' },
      { metricName: 'temperature', warningThreshold: 35, criticalThreshold: 45, operator: 'gt' },
    ],
  };

  constructor(store: ControlPlaneStore, logger?: any) {
    this.store = store;
    this.logger = logger || console;
  }

  /**
   * Start all health collection services
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Health collector is already running');
      return;
    }

    this.logger.info('Starting health collector service...');
    this.isRunning = true;

    // Start collection for each component type
    this.startCameraHealthCollection();
    this.startStorageHealthCollection();
    this.startNetworkHealthCollection();
    this.startUpsHealthCollection();

    this.logger.info('Health collector service started successfully');
  }

  /**
   * Stop all health collection services
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping health collector service...');
    
    for (const [type, interval] of this.collectionIntervals) {
      clearInterval(interval);
      this.logger.info(`Stopped ${type} health collection`);
    }

    this.collectionIntervals.clear();
    this.isRunning = false;
    this.logger.info('Health collector service stopped');
  }

  /**
   * Collect camera health metrics
   */
  private startCameraHealthCollection(): void {
    const collect = async () => {
      try {
        // Get all tenants (in production, iterate through active tenants)
        // TODO: Implement proper tenant iteration without store.listTenants
        // const tenants = await this.store.listTenants();
        const tenants: any[] = []; // Placeholder until proper implementation
        
        for (const tenant of tenants) {
          // const cameras = await this.store.listCameras(tenant.id);
          const cameras: any[] = []; // Placeholder
          
          for (const camera of cameras) {
            await this.collectCameraHealth(tenant.id, camera);
          }
        }
      } catch (error) {
        this.logger.error('Error collecting camera health:', error);
      }
    };

    // Run immediately and then on interval
    collect();
    const interval = setInterval(collect, this.INTERVALS.camera);
    this.collectionIntervals.set('camera', interval);
  }

  /**
   * Collect individual camera health
   */
  private async collectCameraHealth(tenantId: string, camera: any): Promise<void> {
    try {
      // In production, this would query the camera via ONVIF/RTSP or get data from edge agent
      // For now, we'll simulate or use existing camera status
      
      const fps = camera.streamConfig?.fps || 25;
      const bitrate = camera.streamConfig?.bitrate || 4096;
      const onlineStatus = camera.status === 'online' ? 'online' : 
                          camera.status === 'offline' ? 'offline' : 'degraded';

      // Simulate temperature and other metrics (in production, get from actual device)
      const temperature = 45 + Math.random() * 15; // 45-60°C range
      const latencyMs = Math.random() * 200; // 0-200ms
      const packetLoss = Math.random() * 2; // 0-2%

      // Evaluate status based on thresholds
      const status = this.evaluateHealth('camera', {
        fps,
        bitrate,
        temperature,
        latency_ms: latencyMs,
        packet_loss: packetLoss,
      });

      // Record camera health
      await this.store.recordCameraHealth({
        tenantId,
        cameraId: camera.id,
        onlineStatus,
        fps,
        bitrate,
        streamQuality: status === 'healthy' ? 'good' : status === 'warning' ? 'fair' : 'poor',
        temperature,
        tampering: false,
        recordingRunning: true,
        latencyMs,
        packetLoss,
      });

      // If not healthy, create health check record
      if (status !== 'healthy') {
        await this.createHealthCheckRecord(tenantId, camera.id, 'camera', status, {
          fps,
          bitrate,
          temperature,
          latencyMs,
          packetLoss,
        });
      }
    } catch (error) {
      this.logger.error(`Error collecting health for camera ${camera.id}:`, error);
    }
  }

  /**
   * Collect storage health metrics
   */
  private startStorageHealthCollection(): void {
    const collect = async () => {
      try {
        // TODO: Implement proper tenant iteration
        const tenants: any[] = []; // Placeholder
        
        for (const tenant of tenants) {
          // const assets = await this.store.listMaintenanceAssets(tenant.id, 'storage');
          const assets: any[] = []; // Placeholder
          
          for (const asset of assets) {
            await this.collectStorageHealth(tenant.id, asset);
          }
        }
      } catch (error) {
        this.logger.error('Error collecting storage health:', error);
      }
    };

    collect();
    const interval = setInterval(collect, this.INTERVALS.storage);
    this.collectionIntervals.set('storage', interval);
  }

  /**
   * Collect individual storage device health
   */
  private async collectStorageHealth(tenantId: string, asset: any): Promise<void> {
    try {
      // In production, query SMART data from storage device
      // Simulate metrics for now
      const totalCapacityGb = 10000;
      const usedCapacityGb = 7500 + Math.random() * 1000;
      const availableCapacityGb = totalCapacityGb - usedCapacityGb;
      const usagePercentage = (usedCapacityGb / totalCapacityGb) * 100;
      
      const temperature = 40 + Math.random() * 20;
      const badSectors = Math.floor(Math.random() * 20);
      const readSpeedMbs = 150 + Math.random() * 50;
      const writeSpeedMbs = 120 + Math.random() * 40;

      const status = this.evaluateHealth('storage', {
        usage_percentage: usagePercentage,
        temperature,
        bad_sectors: badSectors,
      });

      await this.store.recordStorageHealth({
        tenantId,
        assetId: asset.id,
        totalCapacityGb,
        usedCapacityGb,
        availableCapacityGb,
        smartStatus: badSectors < 10 ? 'PASSED' : 'WARNING',
        temperature,
        badSectors,
        readSpeedMbs,
        writeSpeedMbs,
        remainingLifetimeYears: 3 - (badSectors / 100),
        errorCount: badSectors,
      });

      if (status !== 'healthy') {
        await this.createHealthCheckRecord(tenantId, asset.id, 'storage', status, {
          usagePercentage,
          temperature,
          badSectors,
        });
      }
    } catch (error) {
      this.logger.error(`Error collecting storage health for asset ${asset.id}:`, error);
    }
  }

  /**
   * Collect network health metrics
   */
  private startNetworkHealthCollection(): void {
    const collect = async () => {
      try {
        // TODO: Implement proper tenant iteration
        const tenants: any[] = []; // Placeholder
        
        for (const tenant of tenants) {
          // Get all branches
          // const branches = await this.store.listNodes(tenant.id, 'branch');
          const branches: any[] = []; // Placeholder
          
          for (const branch of branches) {
            await this.collectNetworkHealth(tenant.id, branch.id);
          }
        }
      } catch (error) {
        this.logger.error('Error collecting network health:', error);
      }
    };

    collect();
    const interval = setInterval(collect, this.INTERVALS.network);
    this.collectionIntervals.set('network', interval);
  }

  /**
   * Collect network health for a branch
   */
  private async collectNetworkHealth(tenantId: string, branchNodeId: string): Promise<void> {
    try {
      // In production, perform actual network tests (ping, bandwidth, etc.)
      const latencyMs = 20 + Math.random() * 80;
      const packetLossPercentage = Math.random() * 3;
      const jitterMs = 5 + Math.random() * 15;
      const bandwidthAvailableMbps = 900 + Math.random() * 100;

      const status = this.evaluateHealth('network', {
        latency_ms: latencyMs,
        packet_loss_percentage: packetLossPercentage,
        jitter_ms: jitterMs,
      });

      await this.store.recordNetworkHealth({
        tenantId,
        branchNodeId,
        checkType: 'periodic',
        latencyMs,
        packetLossPercentage,
        jitterMs,
        bandwidthAvailableMbps,
        rtspAvailable: true,
        onvifAvailable: true,
      });

      if (status !== 'healthy') {
        await this.createHealthCheckRecord(tenantId, branchNodeId, 'network', status, {
          latencyMs,
          packetLossPercentage,
          jitterMs,
        });
      }
    } catch (error) {
      this.logger.error(`Error collecting network health for branch ${branchNodeId}:`, error);
    }
  }

  /**
   * Collect UPS health metrics
   */
  private startUpsHealthCollection(): void {
    const collect = async () => {
      try {
        // TODO: Implement proper tenant iteration
        const tenants: any[] = []; // Placeholder
        
        for (const tenant of tenants) {
          // const assets = await this.store.listMaintenanceAssets(tenant.id, 'power');
          const assets: any[] = []; // Placeholder
          
          for (const asset of assets) {
            if (asset.assetType?.toLowerCase().includes('ups')) {
              await this.collectUpsHealth(tenant.id, asset);
            }
          }
        }
      } catch (error) {
        this.logger.error('Error collecting UPS health:', error);
      }
    };

    collect();
    const interval = setInterval(collect, this.INTERVALS.ups);
    this.collectionIntervals.set('ups', interval);
  }

  /**
   * Collect UPS device health
   */
  private async collectUpsHealth(tenantId: string, asset: any): Promise<void> {
    try {
      // In production, query UPS via SNMP or management interface
      const batteryHealthPercentage = 85 + Math.random() * 10;
      const runtimeMinutes = 240 + Math.random() * 120;
      const loadPercentage = 40 + Math.random() * 30;
      const temperature = 25 + Math.random() * 10;

      const status = this.evaluateHealth('ups', {
        battery_health_percentage: batteryHealthPercentage,
        runtime_minutes: runtimeMinutes,
        load_percentage: loadPercentage,
        temperature,
      });

      await this.store.recordUpsHealth({
        tenantId,
        assetId: asset.id,
        batteryHealthPercentage,
        runtimeMinutes,
        chargingStatus: 'charging',
        loadPercentage,
        temperature,
        alarmStatus: status === 'critical' ? 'active' : 'none',
      });

      if (status !== 'healthy') {
        await this.createHealthCheckRecord(tenantId, asset.id, 'ups', status, {
          batteryHealthPercentage,
          runtimeMinutes,
          loadPercentage,
          temperature,
        });
      }
    } catch (error) {
      this.logger.error(`Error collecting UPS health for asset ${asset.id}:`, error);
    }
  }

  /**
   * Evaluate health status based on thresholds
   */
  private evaluateHealth(
    componentType: keyof typeof this.THRESHOLDS,
    metrics: Record<string, number>
  ): 'healthy' | 'warning' | 'critical' {
    const thresholds = this.THRESHOLDS[componentType];
    if (!thresholds) return 'healthy';

    let worstStatus: 'healthy' | 'warning' | 'critical' = 'healthy';

    for (const threshold of thresholds) {
      const value = metrics[threshold.metricName];
      if (value === undefined) continue;

      const isCritical = this.compareValue(value, threshold.criticalThreshold, threshold.operator);
      const isWarning = this.compareValue(value, threshold.warningThreshold, threshold.operator);

      if (isCritical) {
        return 'critical'; // Return immediately on critical
      } else if (isWarning && worstStatus === 'healthy') {
        worstStatus = 'warning';
      }
    }

    return worstStatus;
  }

  /**
   * Compare value against threshold using operator
   */
  private compareValue(value: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }

  /**
   * Create a health check record
   */
  private async createHealthCheckRecord(
    tenantId: string,
    assetId: string,
    checkType: string,
    status: 'warning' | 'critical',
    metrics: Record<string, number>
  ): Promise<void> {
    // Find the most critical metric
    const thresholds = this.THRESHOLDS[checkType as keyof typeof this.THRESHOLDS];
    if (!thresholds) return;

    for (const threshold of thresholds) {
      const value = metrics[threshold.metricName];
      if (value === undefined) continue;

      const isCritical = this.compareValue(value, threshold.criticalThreshold, threshold.operator);
      const isWarning = this.compareValue(value, threshold.warningThreshold, threshold.operator);

      if ((status === 'critical' && isCritical) || (status === 'warning' && isWarning)) {
        // Create health check record (this would call a store method)
        // For now, we'll log it
        this.logger.warn(`Health check ${status}:`, {
          tenantId,
          assetId,
          checkType,
          metricName: threshold.metricName,
          value,
          threshold: status === 'critical' ? threshold.criticalThreshold : threshold.warningThreshold,
        });
      }
    }
  }

  /**
   * Get collection status
   */
  getStatus(): { running: boolean; collectors: string[] } {
    return {
      running: this.isRunning,
      collectors: Array.from(this.collectionIntervals.keys()),
    };
  }
}

// Singleton instance
let healthCollectorInstance: HealthCollectorService | null = null;

export function initHealthCollector(store: ControlPlaneStore, logger?: any): HealthCollectorService {
  if (!healthCollectorInstance) {
    healthCollectorInstance = new HealthCollectorService(store, logger);
  }
  return healthCollectorInstance;
}

export function getHealthCollector(): HealthCollectorService | null {
  return healthCollectorInstance;
}
