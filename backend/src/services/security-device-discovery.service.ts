/**
 * Security Device Discovery Service
 * 
 * Handles network discovery, device identification, and enrollment of security devices.
 * Supports zero-touch provisioning workflows.
 */

import { Pool } from 'pg';
import {
  DiscoveredDevice,
  SecurityDevice,
  DiscoveryOptions,
  SecurityDeviceType,
  DeviceProtocol,
  BulkEnrollDevicesRequest,
} from '../types/security-device';
import { adapterRegistry } from '../adapters/security-device';
import { getSecurityDeviceService } from './security-device.service';

export interface DiscoveryJob {
  id: string;
  tenantId: string;
  branchId?: string;
  networkRange: string;
  scanType: 'QUICK' | 'DEEP' | 'SCHEDULED';
  includeDeviceTypes?: SecurityDeviceType[];
  excludeDeviceTypes?: SecurityDeviceType[];
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progressPercent: number;
  devicesDiscovered: number;
  devicesEnrolled: number;
  startedAt?: Date;
  completedAt?: Date;
  durationSeconds?: number;
  errorMessage?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  createdBy: string;
}

export class SecurityDeviceDiscoveryService {
  constructor(private readonly pool: Pool) {}

  /**
   * Start a device discovery job
   */
  async startDiscovery(
    tenantId: string,
    branchId: string | null,
    networkRange: string,
    options: DiscoveryOptions,
    createdBy: string
  ): Promise<DiscoveryJob> {
    // Create discovery job record
    const result = await this.pool.query(
      `INSERT INTO security_device_discovery_jobs (
        tenant_id, branch_id, network_range, scan_type,
        include_device_types, exclude_device_types,
        status, progress_percent, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        tenantId,
        branchId,
        networkRange,
        options.deepScan ? 'DEEP' : 'QUICK',
        JSON.stringify(options.includeDeviceTypes || []),
        JSON.stringify(options.excludeDeviceTypes || []),
        'PENDING',
        0,
        createdBy,
      ]
    );

    const job = this.mapDiscoveryJob(result.rows[0]);

    // Start discovery in background
    this.executeDiscovery(job, networkRange, options).catch((error) => {
      console.error('[DiscoveryService] Discovery job failed:', error);
    });

    return job;
  }

  /**
   * Execute discovery job
   */
  private async executeDiscovery(
    job: DiscoveryJob,
    networkRange: string,
    options: DiscoveryOptions
  ): Promise<void> {
    try {
      // Update status to RUNNING
      await this.updateJobStatus(job.id, 'RUNNING', 0);
      const startTime = Date.now();

      console.log(`[DiscoveryService] Starting discovery job ${job.id} on ${networkRange}`);

      // Discover devices using all compatible adapters
      const discoveryResults = await adapterRegistry.discoverDevices(
        networkRange,
        options
      );

      const allDiscovered: DiscoveredDevice[] = [];
      for (const [adapterName, devices] of discoveryResults) {
        allDiscovered.push(...devices);
        console.log(`[DiscoveryService] ${adapterName} found ${devices.length} devices`);
      }

      console.log(`[DiscoveryService] Total discovered: ${allDiscovered.length} devices`);

      // Filter by device types if specified
      let filteredDevices = allDiscovered;
      
      if (options.includeDeviceTypes && options.includeDeviceTypes.length > 0) {
        filteredDevices = filteredDevices.filter(
          (d) => d.deviceType && options.includeDeviceTypes!.includes(d.deviceType)
        );
      }

      if (options.excludeDeviceTypes && options.excludeDeviceTypes.length > 0) {
        filteredDevices = filteredDevices.filter(
          (d) => !d.deviceType || !options.excludeDeviceTypes!.includes(d.deviceType)
        );
      }

      // Save discovered devices to staging table
      for (const device of filteredDevices) {
        await this.saveDiscoveredDevice(job.tenantId, job.branchId ?? null, job.id, device);
      }

      // Calculate duration
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);

      // Mark job as completed
      await this.pool.query(
        `UPDATE security_device_discovery_jobs
         SET status = 'COMPLETED',
             progress_percent = 100,
             devices_discovered = $1,
             completed_at = NOW(),
             duration_seconds = $2
         WHERE id = $3`,
        [filteredDevices.length, durationSeconds, job.id]
      );

      console.log(
        `[DiscoveryService] Job ${job.id} completed: ${filteredDevices.length} devices in ${durationSeconds}s`
      );
    } catch (error) {
      console.error('[DiscoveryService] Discovery job failed:', error);

      await this.pool.query(
        `UPDATE security_device_discovery_jobs
         SET status = 'FAILED',
             error_message = $1,
             completed_at = NOW()
         WHERE id = $2`,
        [String(error), job.id]
      );
    }
  }

  /**
   * Update job status and progress
   */
  private async updateJobStatus(
    jobId: string,
    status: string,
    progressPercent: number
  ): Promise<void> {
    const updates: string[] = ['status = $1', 'progress_percent = $2'];
    const params: any[] = [status, progressPercent];

    if (status === 'RUNNING') {
      updates.push('started_at = NOW()');
    }

    await this.pool.query(
      `UPDATE security_device_discovery_jobs
       SET ${updates.join(', ')}
       WHERE id = $${params.length + 1}`,
      [...params, jobId]
    );
  }

  /**
   * Save discovered device to staging table
   */
  private async saveDiscoveredDevice(
    tenantId: string,
    branchId: string | null,
    jobId: string,
    device: DiscoveredDevice
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO security_discovered_devices (
        tenant_id, branch_id, discovery_job_id,
        ip_address, mac_address, port, device_type,
        manufacturer, model, serial_number, firmware_version, protocol,
        capabilities, metadata, confidence, enrollment_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (ip_address) DO UPDATE
      SET discovered_at = NOW(),
          confidence = GREATEST(EXCLUDED.confidence, security_discovered_devices.confidence)`,
      [
        tenantId,
        branchId,
        jobId,
        device.ipAddress,
        device.macAddress,
        device.port,
        device.deviceType,
        device.manufacturer,
        device.model,
        device.serialNumber,
        device.firmwareVersion,
        device.protocol,
        JSON.stringify(device.capabilities || []),
        JSON.stringify(device.metadata),
        device.confidence,
        'PENDING_REVIEW',
      ]
    );
  }

  /**
   * Get discovery job
   */
  async getDiscoveryJob(tenantId: string, jobId: string): Promise<DiscoveryJob | null> {
    const result = await this.pool.query(
      `SELECT * FROM security_device_discovery_jobs
       WHERE id = $1 AND tenant_id = $2`,
      [jobId, tenantId]
    );

    return result.rows[0] ? this.mapDiscoveryJob(result.rows[0]) : null;
  }

  /**
   * List discovery jobs
   */
  async listDiscoveryJobs(
    tenantId: string,
    filters: {
      branchId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ jobs: DiscoveryJob[]; total: number }> {
    let query = `
      SELECT * FROM security_device_discovery_jobs
      WHERE tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters.branchId) {
      query += ` AND branch_id = $${paramIndex}`;
      params.push(filters.branchId);
      paramIndex++;
    }

    if (filters.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    // Get total count
    const countResult = await this.pool.query(
      query.replace('SELECT *', 'SELECT COUNT(*)'),
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Add sorting and pagination
    query += ` ORDER BY created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    const result = await this.pool.query(query, params);

    return {
      jobs: result.rows.map(this.mapDiscoveryJob),
      total,
    };
  }

  /**
   * Get discovered devices
   */
  async getDiscoveredDevices(
    tenantId: string,
    filters: {
      branchId?: string;
      jobId?: string;
      enrollmentStatus?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ devices: DiscoveredDevice[]; total: number }> {
    let query = `
      SELECT * FROM security_discovered_devices
      WHERE tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters.branchId) {
      query += ` AND branch_id = $${paramIndex}`;
      params.push(filters.branchId);
      paramIndex++;
    }

    if (filters.jobId) {
      query += ` AND discovery_job_id = $${paramIndex}`;
      params.push(filters.jobId);
      paramIndex++;
    }

    if (filters.enrollmentStatus) {
      query += ` AND enrollment_status = $${paramIndex}`;
      params.push(filters.enrollmentStatus);
      paramIndex++;
    }

    // Get total count
    const countResult = await this.pool.query(
      query.replace('SELECT *', 'SELECT COUNT(*)'),
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Add sorting and pagination
    query += ` ORDER BY discovered_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
    }

    const result = await this.pool.query(query, params);

    return {
      devices: result.rows.map(this.mapDiscoveredDevice),
      total,
    };
  }

  /**
   * Enroll discovered devices
   */
  async enrollDevices(
    tenantId: string,
    request: BulkEnrollDevicesRequest,
    enrolledBy: string
  ): Promise<SecurityDevice[]> {
    const enrolledDevices: SecurityDevice[] = [];
    const deviceService = getSecurityDeviceService(this.pool);

    for (const discoveredId of request.discoveredDeviceIds) {
      try {
        // Get discovered device
        const result = await this.pool.query(
          `SELECT * FROM security_discovered_devices
           WHERE id = $1 AND tenant_id = $2 AND enrollment_status = 'APPROVED'`,
          [discoveredId, tenantId]
        );

        if (result.rows.length === 0) {
          console.warn(`[DiscoveryService] Device ${discoveredId} not found or not approved`);
          continue;
        }

        const discovered = this.mapDiscoveredDevice(result.rows[0]);

        // Create security device
        const device = await deviceService.createDevice(
          {
            tenantId,
            branchId: request.branchId,
            type: discovered.deviceType!,
            name: this.generateDeviceName(discovered),
            description: `Auto-discovered ${discovered.manufacturer} ${discovered.model}`,
            manufacturer: discovered.manufacturer,
            model: discovered.model,
            serialNumber: discovered.serialNumber,
            firmwareVersion: discovered.firmwareVersion,
            ipAddress: discovered.ipAddress,
            macAddress: discovered.macAddress,
            port: discovered.port,
            protocol: discovered.protocol,
            capabilities: discovered.capabilities,
            metadata: {
              ...discovered.metadata,
              autoEnrolled: true,
              discoveredAt: discovered.discoveredAt,
              discoveryConfidence: discovered.confidence,
            },
          },
          enrolledBy
        );

        enrolledDevices.push(device);

        // Update discovered device status
        await this.pool.query(
          `UPDATE security_discovered_devices
           SET enrollment_status = 'ENROLLED',
               enrolled_device_id = $1
           WHERE id = $2`,
          [device.id, discoveredId]
        );

        // Update discovery job count
        await this.pool.query(
          `UPDATE security_device_discovery_jobs
           SET devices_enrolled = devices_enrolled + 1
           WHERE id = (SELECT discovery_job_id FROM security_discovered_devices WHERE id = $1)`,
          [discoveredId]
        );
      } catch (error) {
        console.error(`[DiscoveryService] Failed to enroll device ${discoveredId}:`, error);
      }
    }

    return enrolledDevices;
  }

  /**
   * Approve discovered device
   */
  async approveDiscoveredDevice(
    tenantId: string,
    discoveredId: string,
    reviewedBy: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE security_discovered_devices
       SET enrollment_status = 'APPROVED',
           reviewed_by = $1,
           reviewed_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [reviewedBy, discoveredId, tenantId]
    );
  }

  /**
   * Reject discovered device
   */
  async rejectDiscoveredDevice(
    tenantId: string,
    discoveredId: string,
    reviewedBy: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE security_discovered_devices
       SET enrollment_status = 'REJECTED',
           reviewed_by = $1,
           reviewed_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [reviewedBy, discoveredId, tenantId]
    );
  }

  /**
   * Generate device name from discovered device
   */
  private generateDeviceName(device: DiscoveredDevice): string {
    const parts: string[] = [];

    if (device.deviceType) {
      parts.push(device.deviceType.replace(/_/g, ' '));
    }

    if (device.manufacturer) {
      parts.push(device.manufacturer);
    }

    if (device.model) {
      parts.push(device.model);
    }

    // Add IP for uniqueness
    parts.push(`(${device.ipAddress})`);

    return parts.join(' - ');
  }

  /**
   * Map database row to DiscoveryJob
   */
  private mapDiscoveryJob(row: any): DiscoveryJob {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      networkRange: row.network_range,
      scanType: row.scan_type,
      includeDeviceTypes: row.include_device_types || [],
      excludeDeviceTypes: row.exclude_device_types || [],
      status: row.status,
      progressPercent: parseFloat(row.progress_percent),
      devicesDiscovered: row.devices_discovered,
      devicesEnrolled: row.devices_enrolled,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationSeconds: row.duration_seconds,
      errorMessage: row.error_message,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }

  /**
   * Map database row to DiscoveredDevice
   */
  private mapDiscoveredDevice(row: any): DiscoveredDevice & { id: string } {
    return {
      id: row.id,
      ipAddress: row.ip_address,
      macAddress: row.mac_address,
      port: row.port,
      deviceType: row.device_type,
      manufacturer: row.manufacturer,
      model: row.model,
      serialNumber: row.serial_number,
      firmwareVersion: row.firmware_version,
      protocol: row.protocol,
      capabilities: row.capabilities || [],
      metadata: row.metadata || {},
      discoveredAt: row.discovered_at,
      confidence: parseFloat(row.confidence),
    };
  }
}

/**
 * Singleton factory
 */
let serviceInstance: SecurityDeviceDiscoveryService | null = null;

export function getSecurityDeviceDiscoveryService(
  pool: Pool
): SecurityDeviceDiscoveryService {
  if (!serviceInstance) {
    serviceInstance = new SecurityDeviceDiscoveryService(pool);
  }
  return serviceInstance;
}

export default SecurityDeviceDiscoveryService;
