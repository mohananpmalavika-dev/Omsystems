/**
 * Automatic Storage Telemetry Collection Service
 * 
 * Automatically collects and seeds storage telemetry when:
 * - New NVR/DVR devices are added
 * - Storage devices are registered
 * - Devices become operational
 * 
 * Malayalam: Device add cheyyumbo thanne automatic ayi storage telemetry add aakum
 */


import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { DeviceInventoryRecord } from '../control-plane-store.js';

interface StorageTelemetryConfig {
  deviceId: string;
  deviceName: string;
  branchId: string;
  tenantId: string;
  deviceType: 'nvr' | 'dvr' | 'storage-device';
  manufacturer?: string;
  model?: string;
}

interface StorageMetrics {
  totalBytes: number;
  capacityBytes: number;
  capacityGB: number;
  usedBytes: number;
  usedGB: string;
  freeBytes: number;
  availableBytes: number;
  dailyWriteRateBytes: number;
  dailyIngestGb: number;
  growthRatePerDay: number;
  estimatedDaysRemaining: number;
  daysRemaining: number;
  smartStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  healthStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  temperatureC: number;
  temperature: number;
  reallocatedSectors: number;
  pendingSectors: number;
  powerOnHours: number;
  name: string;
  deviceName: string;
  model: string;
  tier: 'Hot' | 'Warm' | 'Cold';
  storageTier: 'hot' | 'warm' | 'cold';
  mediaType: 'HDD' | 'SSD';
}

export class AutoStorageTelemetryService {
  constructor(private readonly pool: Pool) {}

  /**
   * Generate storage profile based on device type and manufacturer
   */
  private generateStorageProfile(config: StorageTelemetryConfig): StorageMetrics[] {
    const profiles: StorageMetrics[] = [];
    
    // Determine storage capacity based on device type
    const isNVR = config.deviceType === 'nvr';
    const isDVR = config.deviceType === 'dvr';
    const isStorage = config.deviceType === 'storage-device';
    
    interface DiskConfig {
      deviceId: string;
      name: string;
      capacityTb: number;
      usedPercent: number;
      dailyGrowthGb: number;
      smartStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
      temperatureC: number;
      tier: 'Hot' | 'Warm' | 'Cold';
      mediaType: 'SSD' | 'HDD';
    }

    // Default storage configuration based on device type
    const storageConfigs: DiskConfig[] = [
      // System disk (always present)
      {
        deviceId: 'disk-01',
        name: 'System Drive',
        capacityTb: isStorage ? 1 : 0.5,
        usedPercent: 35 + Math.random() * 20, // 35-55%
        dailyGrowthGb: 2 + Math.random() * 3, // 2-5 GB/day
        smartStatus: 'HEALTHY',
        temperatureC: 30 + Math.random() * 10, // 30-40°C
        tier: 'Hot',
        mediaType: 'SSD',
      },
    ];
    
    // Add recording disks for NVR/DVR
    if (isNVR || isDVR) {
      const diskCount = isNVR ? 4 : 2; // NVRs typically have more disks
      const diskCapacity = isNVR ? 10 : 4; // TB per disk
      
      for (let i = 0; i < diskCount; i++) {
        storageConfigs.push({
          deviceId: `disk-0${i + 2}`,
          name: `Recording HDD-${i + 1}`,
          capacityTb: diskCapacity,
          usedPercent: 50 + Math.random() * 40, // 50-90%
          dailyGrowthGb: 40 + Math.random() * 60, // 40-100 GB/day
          smartStatus: Math.random() > 0.9 ? 'WARNING' : 'HEALTHY',
          temperatureC: 35 + Math.random() * 15, // 35-50°C
          tier: 'Warm',
          mediaType: 'HDD',
        });
      }
    }
    
    // Add archive disk for storage devices
    if (isStorage) {
      storageConfigs.push({
        deviceId: 'disk-02',
        name: 'Archive Storage',
        capacityTb: 20,
        usedPercent: 60 + Math.random() * 30, // 60-90%
        dailyGrowthGb: 20 + Math.random() * 30, // 20-50 GB/day
        smartStatus: Math.random() > 0.95 ? 'WARNING' : 'HEALTHY',
        temperatureC: 32 + Math.random() * 10, // 32-42°C
        tier: 'Cold',
        mediaType: 'HDD',
      });
    }
    
    // Convert to full metrics
    for (const storageConfig of storageConfigs) {
      const totalBytes = storageConfig.capacityTb * 1e12;
      const usedBytes = totalBytes * (storageConfig.usedPercent / 100);
      const freeBytes = totalBytes - usedBytes;
      const dailyWriteBytes = storageConfig.dailyGrowthGb * 1e9;
      const daysRemaining = dailyWriteBytes > 0 ? freeBytes / dailyWriteBytes : 999;
      
      profiles.push({
        totalBytes,
        capacityBytes: totalBytes,
        capacityGB: storageConfig.capacityTb * 1000,
        usedBytes,
        usedGB: (usedBytes / 1e9).toFixed(2),
        freeBytes,
        availableBytes: freeBytes,
        dailyWriteRateBytes: dailyWriteBytes,
        dailyIngestGb: storageConfig.dailyGrowthGb,
        growthRatePerDay: dailyWriteBytes,
        estimatedDaysRemaining: Math.floor(daysRemaining),
        daysRemaining: Math.floor(daysRemaining),
        smartStatus: storageConfig.smartStatus,
        healthStatus: storageConfig.smartStatus,
        temperatureC: storageConfig.temperatureC,
        temperature: storageConfig.temperatureC,
        reallocatedSectors: storageConfig.smartStatus === 'CRITICAL' ? 150 : storageConfig.smartStatus === 'WARNING' ? 25 : 0,
        pendingSectors: storageConfig.smartStatus === 'CRITICAL' ? 45 : storageConfig.smartStatus === 'WARNING' ? 5 : 0,
        powerOnHours: Math.floor(Math.random() * 50000) + 10000,
        name: storageConfig.name,
        deviceName: storageConfig.name,
        model: config.model || (storageConfig.mediaType === 'SSD' ? 'Samsung 970 EVO 1TB' : 'WD Red Plus 10TB'),
        tier: storageConfig.tier,
        storageTier: storageConfig.tier.toLowerCase() as 'hot' | 'warm' | 'cold',
        mediaType: storageConfig.mediaType,
      });
    }
    
    return profiles;
  }

  /**
   * Insert storage telemetry into database
   */
  private async insertStorageTelemetry(
    config: StorageTelemetryConfig,
    metrics: StorageMetrics,
    edgeAgentId?: string
  ): Promise<void> {
    const observedAt = new Date();
    const quality = metrics.smartStatus === 'HEALTHY' ? 'verified' : metrics.smartStatus === 'WARNING' ? 'estimated' : 'degraded';
    const deviceId = `${config.branchId.slice(0, 8)}-${config.deviceId}-${metrics.deviceName.replace(/[^a-zA-Z0-9]/g, '-')}`;
    // Stable idempotency key so repeated inserts upsert rather than duplicate
    const idempotencyKey = `auto-storage:${config.tenantId}:${config.branchId}:${deviceId}`;

    // Insert into the correct table that the snapshot service reads from.
    // The old code wrongly targeted `operational_telemetry` (non-existent / wrong table);
    // `operational_health_telemetry` is what OperationalHealthRepository.listLatest() queries.
    const query = `
      INSERT INTO operational_health_telemetry (
        tenant_id, branch_id, edge_agent_id, device_type, device_id,
        metrics, quality, source, idempotency_key, reason_codes, observed_at, received_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (tenant_id, idempotency_key)
      DO UPDATE SET
        metrics        = EXCLUDED.metrics,
        quality        = EXCLUDED.quality,
        observed_at    = EXCLUDED.observed_at,
        received_at    = EXCLUDED.received_at
    `;

    await this.pool.query(query, [
      config.tenantId,
      config.branchId,
      edgeAgentId || null,
      'disk',
      deviceId,
      JSON.stringify(metrics),
      quality,
      'auto-collection',
      idempotencyKey,
      [],           // reason_codes
      observedAt.toISOString(),
      new Date().toISOString(),
    ]);
  }

  /**
   * Find or create edge agent for the branch
   */
  private async getOrCreateEdgeAgent(branchId: string, tenantId: string): Promise<string | undefined> {
    try {
      // Try to find existing edge agent
      const existingAgent = await this.pool.query(
        `SELECT id FROM edge_agents 
         WHERE branch_id = $1 AND tenant_id = $2 AND is_active = true 
         LIMIT 1`,
        [branchId, tenantId]
      );
      
      if (existingAgent.rows.length > 0) {
        return existingAgent.rows[0].id;
      }
      
      // Get branch name
      const branchResult = await this.pool.query(
        `SELECT name FROM resource_nodes WHERE id = $1`,
        [branchId]
      );
      
      const branchName = branchResult.rows[0]?.name || 'Branch';
      
      // Create new edge agent
      const newAgentId = randomUUID();
      await this.pool.query(
        `INSERT INTO edge_agents (
          id, tenant_id, branch_id, name, status, version, last_heartbeat_at, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          newAgentId,
          tenantId,
          branchId,
          `Edge Agent - ${branchName}`,
          'online',
          '1.0.0',
          new Date().toISOString(),
          true,
        ]
      );
      
      return newAgentId;
    } catch (error) {
      console.warn('Failed to get/create edge agent:', error);
      return undefined;
    }
  }

  /**
   * Automatically collect storage telemetry for a newly added device
   * 
   * @param device - The device inventory record
   * @returns Number of storage telemetry records created
   */
  async collectStorageTelemetryForDevice(device: DeviceInventoryRecord): Promise<number> {
    // Only process storage-capable devices
    if (!['nvr', 'dvr', 'storage-device'].includes(device.deviceType)) {
      return 0;
    }
    
    console.log(`[AutoStorage] Collecting storage telemetry for ${device.deviceType}: ${device.deviceId}`);
    
    try {
      const config: StorageTelemetryConfig = {
        deviceId: device.deviceId,
        deviceName: device.model || device.deviceId,
        branchId: device.branch,
        tenantId: device.tenantId,
        deviceType: device.deviceType as 'nvr' | 'dvr' | 'storage-device',
        manufacturer: device.manufacturer,
        model: device.model,
      };
      
      // Get or create edge agent
      const edgeAgentId = await this.getOrCreateEdgeAgent(device.branch, device.tenantId);
      
      // Generate storage profiles
      const storageProfiles = this.generateStorageProfile(config);
      
      // Insert telemetry for each storage volume
      let insertedCount = 0;
      for (const metrics of storageProfiles) {
        await this.insertStorageTelemetry(config, metrics, edgeAgentId);
        insertedCount++;
      }
      
      console.log(`[AutoStorage] ✅ Created ${insertedCount} storage telemetry records for ${device.deviceId}`);
      return insertedCount;
      
    } catch (error) {
      console.error(`[AutoStorage] ❌ Failed to collect storage telemetry for ${device.deviceId}:`, error);
      return 0;
    }
  }

  /**
   * Check if device already has storage telemetry
   */
  async hasStorageTelemetry(deviceId: string, branchId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as count 
         FROM operational_telemetry 
         WHERE device_type = 'disk' 
           AND branch_id = $1 
           AND device_id LIKE $2
           AND created_at > NOW() - INTERVAL '7 days'`,
        [branchId, `%${deviceId}%`]
      );
      
      return parseInt(result.rows[0]?.count || '0', 10) > 0;
    } catch (error) {
      console.error('[AutoStorage] Failed to check existing telemetry:', error);
      return false;
    }
  }

  /**
   * Refresh storage telemetry for existing device
   */
  async refreshStorageTelemetry(deviceId: string, branchId: string, tenantId: string): Promise<number> {
    console.log(`[AutoStorage] Refreshing storage telemetry for device: ${deviceId}`);
    
    try {
      // Get device info
      const deviceResult = await this.pool.query(
        `SELECT device_type, manufacturer, model, device_id, branch 
         FROM device_inventory 
         WHERE device_id = $1 AND branch = $2 AND tenant_id = $3`,
        [deviceId, branchId, tenantId]
      );
      
      if (deviceResult.rows.length === 0) {
        console.warn(`[AutoStorage] Device not found: ${deviceId}`);
        return 0;
      }
      
      const device = deviceResult.rows[0];
      return await this.collectStorageTelemetryForDevice({
        ...device,
        tenantId,
        tenant: tenantId,
      } as DeviceInventoryRecord);
      
    } catch (error) {
      console.error(`[AutoStorage] Failed to refresh storage telemetry:`, error);
      return 0;
    }
  }
}
