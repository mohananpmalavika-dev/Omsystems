/**
 * Security Device Service
 * 
 * Core service for managing security devices across all types:
 * CCTV, access control, intrusion, fire, ATM, vault, UPS, etc.
 */

import { Pool } from 'pg';
import {
  SecurityDevice,
  SecurityDeviceHealthSnapshot,
  SecurityDeviceEvent,
  DeviceCommand,
  DeviceCommandResult,
  DeviceState,
  DeviceCapability,
  DiscoveredDevice,
  BranchSecurityPosture,
  CreateSecurityDeviceRequest,
  UpdateSecurityDeviceRequest,
  ExecuteDeviceCommandRequest,
  GetDeviceEventsRequest,
  SecurityDeviceType,
  DeviceStatus,
  DeviceHealth,
} from '../types/security-device';
import { adapterRegistry } from '../adapters/security-device';

export class SecurityDeviceService {
  constructor(private readonly pool: Pool) {}

  /**
   * Create a new security device
   */
  async createDevice(
    request: CreateSecurityDeviceRequest,
    createdBy: string
  ): Promise<SecurityDevice> {
    const result = await this.pool.query(
      `INSERT INTO security_devices (
        tenant_id, branch_id, type, name, description,
        manufacturer, model, serial_number, firmware_version, hardware_version,
        ip_address, mac_address, port, protocol,
        status, health, capabilities,
        parent_device_id, controller_device_id, digital_twin_object_id,
        metadata, credential_ref_id, polling_interval_seconds,
        auto_discovered, enrollment_status, created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17,
        $18, $19, $20,
        $21, $22, $23,
        $24, $25, $26
      ) RETURNING *`,
      [
        request.tenantId || null, // Will be set by middleware
        request.branchId,
        request.type,
        request.name,
        request.description,
        request.manufacturer,
        request.model,
        request.serialNumber,
        request.firmwareVersion || null,
        request.hardwareVersion || null,
        request.ipAddress,
        request.macAddress,
        request.port,
        request.protocol,
        'PROVISIONING', // Initial status
        'UNKNOWN', // Initial health
        JSON.stringify(request.capabilities || []),
        request.parentDeviceId,
        request.controllerDeviceId,
        request.digitalTwinObjectId,
        JSON.stringify(request.metadata || {}),
        request.credentialRefId,
        request.pollingIntervalSeconds || 60,
        false, // Not auto-discovered
        'APPROVED', // Manually added devices are pre-approved
        createdBy,
      ]
    );

    return this.mapDevice(result.rows[0]);
  }

  /**
   * Get device by ID
   */
  async getDevice(tenantId: string, deviceId: string): Promise<SecurityDevice | null> {
    const result = await this.pool.query(
      `SELECT * FROM security_devices 
       WHERE id = $1 AND tenant_id = $2`,
      [deviceId, tenantId]
    );

    return result.rows[0] ? this.mapDevice(result.rows[0]) : null;
  }

  /**
   * List devices with filters
   */
  async listDevices(filters: {
    tenantId: string;
    branchId?: string;
    type?: SecurityDeviceType;
    status?: DeviceStatus;
    health?: DeviceHealth;
    enrollmentStatus?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ devices: SecurityDevice[]; total: number }> {
    let query = `
      SELECT * FROM security_devices
      WHERE tenant_id = $1
    `;
    const params: any[] = [filters.tenantId];
    let paramIndex = 2;

    if (filters.branchId) {
      query += ` AND branch_id = $${paramIndex}`;
      params.push(filters.branchId);
      paramIndex++;
    }

    if (filters.type) {
      query += ` AND type = $${paramIndex}`;
      params.push(filters.type);
      paramIndex++;
    }

    if (filters.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.health) {
      query += ` AND health = $${paramIndex}`;
      params.push(filters.health);
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

    // Add sorting, pagination
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
      devices: result.rows.map(this.mapDevice),
      total,
    };
  }

  /**
   * Update device
   */
  async updateDevice(
    tenantId: string,
    deviceId: string,
    updates: UpdateSecurityDeviceRequest,
    updatedBy: string
  ): Promise<SecurityDevice | null> {
    const existing = await this.getDevice(tenantId, deviceId);
    if (!existing) return null;

    const result = await this.pool.query(
      `UPDATE security_devices
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           ip_address = COALESCE($3, ip_address),
           port = COALESCE($4, port),
           status = COALESCE($5, status),
           capabilities = COALESCE($6, capabilities),
           digital_twin_object_id = COALESCE($7, digital_twin_object_id),
           polling_interval_seconds = COALESCE($8, polling_interval_seconds),
           metadata = COALESCE($9, metadata),
           updated_by = $10,
           updated_at = NOW()
       WHERE id = $11 AND tenant_id = $12
       RETURNING *`,
      [
        updates.name,
        updates.description,
        updates.ipAddress,
        updates.port,
        updates.status,
        updates.capabilities ? JSON.stringify(updates.capabilities) : null,
        updates.digitalTwinObjectId,
        updates.pollingIntervalSeconds,
        updates.metadata ? JSON.stringify(updates.metadata) : null,
        updatedBy,
        deviceId,
        tenantId,
      ]
    );

    return result.rows[0] ? this.mapDevice(result.rows[0]) : null;
  }

  /**
   * Delete device
   */
  async deleteDevice(tenantId: string, deviceId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM security_devices 
       WHERE id = $1 AND tenant_id = $2`,
      [deviceId, tenantId]
    );

    return result.rowCount ? result.rowCount > 0 : false;
  }

  /**
   * Get device health
   */
  async getDeviceHealth(
    tenantId: string,
    deviceId: string
  ): Promise<SecurityDeviceHealthSnapshot | null> {
    const device = await this.getDevice(tenantId, deviceId);
    if (!device) return null;

    try {
      // Get adapter for device
      const adapter = adapterRegistry.getAdapterForDevice(device);

      // Query device health through adapter
      const health = await adapter.getHealth(device);

      // Save health snapshot to database
      await this.saveHealthSnapshot(health);

      // Update device status and health
      await this.pool.query(
        `UPDATE security_devices
         SET status = $1, health = $2, last_seen_at = NOW(), last_health_check_at = NOW()
         WHERE id = $3`,
        [health.isOnline ? 'ONLINE' : 'OFFLINE', health.health, deviceId]
      );

      return health;
    } catch (error) {
      console.error(`[SecurityDeviceService] Failed to get health for device ${deviceId}:`, error);
      
      // Mark device as offline
      await this.pool.query(
        `UPDATE security_devices
         SET status = 'OFFLINE', health = 'CRITICAL', last_health_check_at = NOW()
         WHERE id = $1`,
        [deviceId]
      );

      return null;
    }
  }

  /**
   * Save health snapshot
   */
  private async saveHealthSnapshot(
    health: SecurityDeviceHealthSnapshot
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO security_device_health_snapshots (
        device_id, tenant_id, branch_id,
        health, health_score, is_online,
        response_time_ms, packet_loss_percent, signal_strength_dbm,
        cpu_usage_percent, memory_usage_percent, storage_usage_percent, temperature_celsius,
        power_status, battery_level_percent, battery_voltage, ups_runtime_minutes,
        error_count, warning_count, last_error_message, last_error_at,
        uptime_seconds, last_reboot_at, last_maintenance_at, next_maintenance_due,
        metadata, captured_at
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20, $21,
        $22, $23, $24, $25,
        $26, $27
      )`,
      [
        health.deviceId,
        health.tenantId,
        health.branchId,
        health.health,
        health.healthScore,
        health.isOnline,
        health.responseTimeMs,
        health.packetLossPercent,
        health.signalStrengthDbm,
        health.cpuUsagePercent,
        health.memoryUsagePercent,
        health.storageUsagePercent,
        health.temperatureCelsius,
        health.powerStatus,
        health.batteryLevelPercent,
        health.batteryVoltage,
        health.upsRuntimeMinutes,
        health.errorCount,
        health.warningCount,
        health.lastErrorMessage,
        health.lastErrorAt,
        health.uptimeSeconds,
        health.lastRebootAt,
        health.lastMaintenanceAt,
        health.nextMaintenanceDue,
        JSON.stringify(health.metadata),
        health.capturedAt,
      ]
    );
  }

  /**
   * Get device state
   */
  async getDeviceState(
    tenantId: string,
    deviceId: string
  ): Promise<DeviceState | null> {
    const device = await this.getDevice(tenantId, deviceId);
    if (!device) return null;

    try {
      const adapter = adapterRegistry.getAdapterForDevice(device);
      return await adapter.getState(device);
    } catch (error) {
      console.error(`[SecurityDeviceService] Failed to get state for device ${deviceId}:`, error);
      return null;
    }
  }

  /**
   * Get device events
   */
  async getDeviceEvents(
    tenantId: string,
    request: GetDeviceEventsRequest
  ): Promise<SecurityDeviceEvent[]> {
    let query = `
      SELECT * FROM security_device_events
      WHERE tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (request.deviceIds && request.deviceIds.length > 0) {
      query += ` AND device_id = ANY($${paramIndex})`;
      params.push(request.deviceIds);
      paramIndex++;
    }

    if (request.eventTypes && request.eventTypes.length > 0) {
      query += ` AND event_type = ANY($${paramIndex})`;
      params.push(request.eventTypes);
      paramIndex++;
    }

    if (request.severities && request.severities.length > 0) {
      query += ` AND severity = ANY($${paramIndex})`;
      params.push(request.severities);
      paramIndex++;
    }

    if (request.categories && request.categories.length > 0) {
      query += ` AND category = ANY($${paramIndex})`;
      params.push(request.categories);
      paramIndex++;
    }

    if (request.startTime) {
      query += ` AND occurred_at >= $${paramIndex}`;
      params.push(request.startTime);
      paramIndex++;
    }

    if (request.endTime) {
      query += ` AND occurred_at <= $${paramIndex}`;
      params.push(request.endTime);
      paramIndex++;
    }

    if (request.acknowledged !== undefined) {
      query += ` AND acknowledged = $${paramIndex}`;
      params.push(request.acknowledged);
      paramIndex++;
    }

    if (request.processed !== undefined) {
      query += ` AND processed = $${paramIndex}`;
      params.push(request.processed);
      paramIndex++;
    }

    query += ` ORDER BY occurred_at DESC`;

    if (request.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(request.limit);
      paramIndex++;
    }

    if (request.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(request.offset);
    }

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapEvent);
  }

  /**
   * Execute device command
   */
  async executeCommand(
    tenantId: string,
    deviceId: string,
    request: ExecuteDeviceCommandRequest,
    requestedBy: string
  ): Promise<DeviceCommand> {
    const device = await this.getDevice(tenantId, deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    // Check if device supports the capability
    if (!device.capabilities.includes(request.command)) {
      throw new Error(`Device ${device.name} does not support command: ${request.command}`);
    }

    // Check if command requires approval
    const requiresApproval = this.commandRequiresApproval(request.command);
    const requiresMFA = this.commandRequiresMFA(request.command);

    // Create command record
    const result = await this.pool.query(
      `INSERT INTO security_device_commands (
        tenant_id, branch_id, device_id,
        command, parameters,
        requested_by, requires_approval, requires_mfa, reason,
        status, timeout_seconds
      ) VALUES (
        $1, $2, $3,
        $4, $5,
        $6, $7, $8, $9,
        $10, $11
      ) RETURNING *`,
      [
        tenantId,
        device.branchId,
        deviceId,
        request.command,
        JSON.stringify(request.parameters || {}),
        requestedBy,
        requiresApproval,
        requiresMFA,
        request.reason,
        requiresApproval ? 'PENDING' : 'APPROVED',
        request.timeoutSeconds || 300,
      ]
    );

    const command = this.mapCommand(result.rows[0]);

    // If doesn't require approval, execute immediately
    if (!requiresApproval) {
      await this.executeCommandNow(command, device);
    }

    return command;
  }

  /**
   * Execute command immediately
   */
  private async executeCommandNow(
    command: DeviceCommand,
    device: SecurityDevice
  ): Promise<void> {
    try {
      // Update status to EXECUTING
      await this.pool.query(
        `UPDATE security_device_commands
         SET status = 'EXECUTING', executed_at = NOW()
         WHERE id = $1`,
        [command.id]
      );

      // Get adapter and execute
      const adapter = adapterRegistry.getAdapterForDevice(device);
      const result = await adapter.executeCommand(device, command);

      // Update command with result
      await this.pool.query(
        `UPDATE security_device_commands
         SET status = $1, result = $2, error_message = $3, completed_at = NOW()
         WHERE id = $4`,
        [
          result.success ? 'COMPLETED' : 'FAILED',
          JSON.stringify(result.result || {}),
          result.errorMessage,
          command.id,
        ]
      );

      // Add audit log entry
      await this.addCommandAudit(command.id, 'EXECUTED', command.requestedBy, {
        success: result.success,
        executionTimeMs: result.executionTimeMs,
      });
    } catch (error) {
      // Mark command as failed
      await this.pool.query(
        `UPDATE security_device_commands
         SET status = 'FAILED', error_message = $1, completed_at = NOW()
         WHERE id = $2`,
        [String(error), command.id]
      );

      throw error;
    }
  }

  /**
   * Approve command
   */
  async approveCommand(
    tenantId: string,
    commandId: string,
    approvedBy: string
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE security_device_commands
       SET status = 'APPROVED', approved_by = $1, approved_at = NOW()
       WHERE id = $2 AND tenant_id = $3 AND status = 'PENDING'
       RETURNING *`,
      [approvedBy, commandId, tenantId]
    );

    if (result.rowCount === 0) {
      throw new Error('Command not found or already processed');
    }

    const command = this.mapCommand(result.rows[0]);
    const device = await this.getDevice(tenantId, command.deviceId);

    if (device) {
      await this.executeCommandNow(command, device);
    }

    await this.addCommandAudit(commandId, 'APPROVED', approvedBy, {});
  }

  /**
   * Add command audit log entry
   */
  private async addCommandAudit(
    commandId: string,
    action: string,
    performedBy: string,
    details: Record<string, any>
  ): Promise<void> {
    await this.pool.query(
      `UPDATE security_device_commands
       SET audit_log = audit_log || $1::jsonb
       WHERE id = $2`,
      [
        JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            action,
            performedBy,
            details,
          },
        ]),
        commandId,
      ]
    );
  }

  /**
   * Get branch security posture
   */
  async getBranchPosture(
    tenantId: string,
    branchId: string
  ): Promise<BranchSecurityPosture | null> {
    const result = await this.pool.query(
      `SELECT * FROM branch_security_posture
       WHERE tenant_id = $1 AND branch_id = $2`,
      [tenantId, branchId]
    );

    return result.rows[0] ? this.mapPosture(result.rows[0]) : null;
  }

  /**
   * Update branch security posture
   */
  async updateBranchPosture(
    tenantId: string,
    branchId: string
  ): Promise<void> {
    // This is handled by the PostgreSQL function update_branch_security_posture()
    // which is triggered automatically by device changes
    await this.pool.query(
      `SELECT update_branch_security_posture($1)`,
      [branchId]
    );
  }

  /**
   * Check if command requires approval
   */
  private commandRequiresApproval(command: DeviceCapability): boolean {
    const highRiskCommands: DeviceCapability[] = [
      'UNLOCK',
      'DISARM',
      'RESET',
      'LOCKDOWN',
      'GRANT_ACCESS',
      'EVACUATE',
    ];

    return highRiskCommands.includes(command);
  }

  /**
   * Check if command requires MFA
   */
  private commandRequiresMFA(command: DeviceCapability): boolean {
    const mfaCommands: DeviceCapability[] = [
      'UNLOCK',
      'DISARM',
      'LOCKDOWN',
      'EVACUATE',
    ];

    return mfaCommands.includes(command);
  }

  /**
   * Map database row to SecurityDevice
   */
  private mapDevice(row: any): SecurityDevice {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      type: row.type,
      name: row.name,
      description: row.description,
      manufacturer: row.manufacturer,
      model: row.model,
      serialNumber: row.serial_number,
      firmwareVersion: row.firmware_version,
      hardwareVersion: row.hardware_version,
      ipAddress: row.ip_address,
      macAddress: row.mac_address,
      port: row.port,
      protocol: row.protocol,
      status: row.status,
      health: row.health,
      lastSeenAt: row.last_seen_at,
      lastHealthCheckAt: row.last_health_check_at,
      capabilities: row.capabilities || [],
      parentDeviceId: row.parent_device_id,
      controllerDeviceId: row.controller_device_id,
      digitalTwinObjectId: row.digital_twin_object_id,
      metadata: row.metadata || {},
      credentialRefId: row.credential_ref_id,
      pollingIntervalSeconds: row.polling_interval_seconds,
      eventBufferSize: row.event_buffer_size,
      autoDiscovered: row.auto_discovered,
      enrollmentStatus: row.enrollment_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }

  /**
   * Map database row to SecurityDeviceEvent
   */
  private mapEvent(row: any): SecurityDeviceEvent {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      deviceId: row.device_id,
      eventType: row.event_type,
      severity: row.severity,
      category: row.category,
      title: row.title,
      description: row.description,
      occurredAt: row.occurred_at,
      receivedAt: row.received_at,
      processedAt: row.processed_at,
      userId: row.user_id,
      credential: row.credential,
      location: row.location,
      correlationId: row.correlation_id,
      parentEventId: row.parent_event_id,
      incidentId: row.incident_id,
      processed: row.processed,
      acknowledged: row.acknowledged,
      acknowledgedBy: row.acknowledged_by,
      acknowledgedAt: row.acknowledged_at,
      payload: row.payload || {},
      normalizedPayload: row.normalized_payload,
      snapshotUrl: row.snapshot_url,
      videoUrl: row.video_url,
      attachedCameraIds: row.attached_camera_ids || [],
      metadata: row.metadata || {},
      createdAt: row.created_at,
    };
  }

  /**
   * Map database row to DeviceCommand
   */
  private mapCommand(row: any): DeviceCommand {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      deviceId: row.device_id,
      command: row.command,
      parameters: row.parameters || {},
      requestedBy: row.requested_by,
      approvedBy: row.approved_by,
      requiresApproval: row.requires_approval,
      requiresMFA: row.requires_mfa,
      reason: row.reason,
      status: row.status,
      result: row.result,
      errorMessage: row.error_message,
      requestedAt: row.requested_at,
      approvedAt: row.approved_at,
      executedAt: row.executed_at,
      completedAt: row.completed_at,
      timeoutSeconds: row.timeout_seconds,
      auditLog: row.audit_log || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to BranchSecurityPosture
   */
  private mapPosture(row: any): BranchSecurityPosture {
    return {
      branchId: row.branch_id,
      tenantId: row.tenant_id,
      overallStatus: row.overall_status,
      securityScore: parseFloat(row.security_score),
      cctv: row.cctv_status || {},
      accessControl: row.access_control_status || {},
      intrusion: row.intrusion_status || {},
      fire: row.fire_status || {},
      banking: row.banking_status || {},
      power: row.power_status || {},
      network: row.network_status || {},
      activeAlarms: row.active_alarms,
      criticalIssues: row.critical_issues,
      warnings: row.warnings,
      recentEvents: [], // Would need separate query
      correlatedIncidents: row.correlated_incidents,
      aiInsights: row.ai_insights || [],
      lastUpdated: row.last_updated,
      metadata: row.metadata || {},
    };
  }
}

/**
 * Singleton factory
 */
let serviceInstance: SecurityDeviceService | null = null;

export function getSecurityDeviceService(pool: Pool): SecurityDeviceService {
  if (!serviceInstance) {
    serviceInstance = new SecurityDeviceService(pool);
  }
  return serviceInstance;
}

export default SecurityDeviceService;
