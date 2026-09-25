/**
 * Communication Presence Service
 * 
 * Manages real-time presence state for devices, employees, branches, and operators.
 * Uses Redis for distributed, short-lived presence state that survives across
 * control-plane instances.
 * 
 * Core responsibilities:
 * - Track device online/offline status
 * - Track employee presence (aggregated from linked devices)
 * - Track branch presence (aggregated from branch devices)
 * - Track operator presence
 * - Process heartbeats with TTL
 * - Compute derived presence states
 * 
 * Architecture:
 * - Redis for authoritative short-lived state
 * - TTL-based expiry (devices must heartbeat)
 * - PostgreSQL for durable device records
 * - Presence keys follow REDIS_KEYS pattern from constants
 */

import type { RedisClientType } from 'redis';
import type { Pool } from 'pg';
import type {
  CommunicationPresence,
  DevicePresence,
  EmployeePresence,
  BranchPresence,
  OperatorPresence,
  PresenceHeartbeat,
} from '../domain/types.js';
import {
  REDIS_KEYS,
  PRESENCE_TTL_SECONDS,
  PRESENCE_HEARTBEAT_INTERVAL_MS,
} from '../domain/constants.js';

/**
 * Presence query options
 */
export interface PresenceQueryOptions {
  /**
   * Tenant ID for isolation
   */
  tenantId: string;

  /**
   * Optional branch filter
   */
  branchId?: string;
}

/**
 * Communication Presence Service
 */
export class CommunicationPresenceService {
  constructor(
    private readonly redis: RedisClientType,
    private readonly pool: Pool
  ) {}

  /**
   * Record device heartbeat
   * 
   * Devices must send periodic heartbeats to maintain ONLINE status.
   * Missed heartbeats result in automatic OFFLINE transition.
   * 
   * @param heartbeat - Device heartbeat data
   */
  async recordDeviceHeartbeat(heartbeat: PresenceHeartbeat): Promise<void> {
    const {
      deviceId,
      tenantId,
      branchId,
      appVersion,
      metadata,
    } = heartbeat;

    const key = REDIS_KEYS.DEVICE_PRESENCE(tenantId, deviceId);

    const presenceData: DevicePresence = {
      deviceId,
      tenantId,
      branchId,
      status: 'ONLINE',
      lastSeen: new Date().toISOString(),
      appVersion,
      metadata,
    };

    // Store with TTL
    await this.redis.setEx(
      key,
      PRESENCE_TTL_SECONDS.DEVICE,
      JSON.stringify(presenceData)
    );

    // Update PostgreSQL last_seen_at
    await this.pool.query(
      `UPDATE communication_devices
      SET last_seen_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2`,
      [deviceId, tenantId]
    );
  }

  /**
   * Get device presence
   * 
   * @param tenantId - Tenant ID
   * @param deviceId - Device ID
   * @returns Device presence or null if offline
   */
  async getDevicePresence(
    tenantId: string,
    deviceId: string
  ): Promise<DevicePresence | null> {
    const key = REDIS_KEYS.DEVICE_PRESENCE(tenantId, deviceId);
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as DevicePresence;
    } catch {
      return null;
    }
  }

  /**
   * Get employee presence
   * 
   * Employee is ONLINE if at least one linked device is ONLINE.
   * Employee is BUSY if in an active call.
   * 
   * @param tenantId - Tenant ID
   * @param employeeId - Employee ID
   * @returns Employee presence
   */
  async getEmployeePresence(
    tenantId: string,
    employeeId: string
  ): Promise<EmployeePresence> {
    // Get linked devices
    const devicesResult = await this.pool.query<{ deviceId: string }>(
      `SELECT device_id as "deviceId"
      FROM communication_device_employees
      WHERE employee_id = $1 AND unlinked_at IS NULL`,
      [employeeId]
    );

    const deviceIds = devicesResult.rows.map(row => row.deviceId);

    if (deviceIds.length === 0) {
      return {
        employeeId,
        tenantId,
        status: 'OFFLINE',
        lastSeen: null,
        deviceCount: 0,
        onlineDeviceIds: [],
      };
    }

    // Check presence for each device
    const onlineDevices: string[] = [];
    let latestSeen: string | null = null;

    for (const deviceId of deviceIds) {
      const presence = await this.getDevicePresence(tenantId, deviceId);
      if (presence && presence.status === 'ONLINE') {
        onlineDevices.push(deviceId);
        if (!latestSeen || presence.lastSeen > latestSeen) {
          latestSeen = presence.lastSeen;
        }
      }
    }

    // Check if employee is in a call
    const inCallKey = REDIS_KEYS.EMPLOYEE_IN_CALL(tenantId, employeeId);
    const inCall = await this.redis.exists(inCallKey);

    const status: CommunicationPresence = inCall
      ? 'IN_CALL'
      : onlineDevices.length > 0
        ? 'ONLINE'
        : 'OFFLINE';

    return {
      employeeId,
      tenantId,
      status,
      lastSeen: latestSeen,
      deviceCount: deviceIds.length,
      onlineDeviceIds: onlineDevices,
    };
  }

  /**
   * Get branch presence
   * 
   * Branch is ONLINE if at least one branch device is ONLINE.
   * This determines if "Call Branch" is possible.
   * 
   * @param tenantId - Tenant ID
   * @param branchId - Branch ID
   * @returns Branch presence
   */
  async getBranchPresence(
    tenantId: string,
    branchId: string
  ): Promise<BranchPresence> {
    // Get all devices for branch
    const devicesResult = await this.pool.query<{
      id: string;
      deviceName: string;
    }>(
      `SELECT id, device_name as "deviceName"
      FROM communication_devices
      WHERE branch_id = $1 AND tenant_id = $2
        AND status IN ('ACTIVE', 'OFFLINE')`,
      [branchId, tenantId]
    );

    const devices = devicesResult.rows;

    if (devices.length === 0) {
      return {
        branchId,
        tenantId,
        status: 'OFFLINE',
        lastSeen: null,
        deviceCount: 0,
        onlineDeviceIds: [],
      };
    }

    // Check presence for each device
    const onlineDevices: string[] = [];
    let latestSeen: string | null = null;

    for (const device of devices) {
      const presence = await this.getDevicePresence(tenantId, device.id);
      if (presence && presence.status === 'ONLINE') {
        onlineDevices.push(device.id);
        if (!latestSeen || presence.lastSeen > latestSeen) {
          latestSeen = presence.lastSeen;
        }
      }
    }

    return {
      branchId,
      tenantId,
      status: onlineDevices.length > 0 ? 'ONLINE' : 'OFFLINE',
      lastSeen: latestSeen,
      deviceCount: devices.length,
      onlineDeviceIds: onlineDevices,
    };
  }

  /**
   * Get operator presence
   * 
   * Operators are VMS users who can receive communication requests.
   * 
   * @param tenantId - Tenant ID
   * @param operatorId - Operator user ID
   * @returns Operator presence
   */
  async getOperatorPresence(
    tenantId: string,
    operatorId: string
  ): Promise<OperatorPresence> {
    const key = REDIS_KEYS.OPERATOR_PRESENCE(tenantId, operatorId);
    const data = await this.redis.get(key);

    if (!data) {
      return {
        operatorId,
        tenantId,
        status: 'OFFLINE',
        lastSeen: null,
      };
    }

    try {
      return JSON.parse(data) as OperatorPresence;
    } catch {
      return {
        operatorId,
        tenantId,
        status: 'OFFLINE',
        lastSeen: null,
      };
    }
  }

  /**
   * Set operator presence
   * 
   * Called when VMS operator connects to communication system.
   * 
   * @param tenantId - Tenant ID
   * @param operatorId - Operator user ID
   * @param status - Presence status
   */
  async setOperatorPresence(
    tenantId: string,
    operatorId: string,
    status: CommunicationPresence
  ): Promise<void> {
    const key = REDIS_KEYS.OPERATOR_PRESENCE(tenantId, operatorId);

    const presence: OperatorPresence = {
      operatorId,
      tenantId,
      status,
      lastSeen: new Date().toISOString(),
    };

    await this.redis.setEx(
      key,
      PRESENCE_TTL_SECONDS.OPERATOR,
      JSON.stringify(presence)
    );
  }

  /**
   * Mark employee as in call
   * 
   * Used to set BUSY/IN_CALL status.
   * 
   * @param tenantId - Tenant ID
   * @param employeeId - Employee ID
   * @param callId - Active call ID
   */
  async markEmployeeInCall(
    tenantId: string,
    employeeId: string,
    callId: string
  ): Promise<void> {
    const key = REDIS_KEYS.EMPLOYEE_IN_CALL(tenantId, employeeId);
    
    await this.redis.setEx(
      key,
      PRESENCE_TTL_SECONDS.CALL_STATE,
      callId
    );
  }

  /**
   * Clear employee in-call status
   * 
   * Called when call ends.
   * 
   * @param tenantId - Tenant ID
   * @param employeeId - Employee ID
   */
  async clearEmployeeInCall(
    tenantId: string,
    employeeId: string
  ): Promise<void> {
    const key = REDIS_KEYS.EMPLOYEE_IN_CALL(tenantId, employeeId);
    await this.redis.del(key);
  }

  /**
   * Mark operator as in call
   * 
   * Used to set BUSY/IN_CALL status.
   * 
   * @param tenantId - Tenant ID
   * @param operatorId - Operator ID
   * @param callId - Active call ID
   */
  async markOperatorInCall(
    tenantId: string,
    operatorId: string,
    callId: string
  ): Promise<void> {
    const key = REDIS_KEYS.OPERATOR_IN_CALL(tenantId, operatorId);
    
    await this.redis.setEx(
      key,
      PRESENCE_TTL_SECONDS.CALL_STATE,
      callId
    );

    // Also update operator presence to IN_CALL
    await this.setOperatorPresence(tenantId, operatorId, 'IN_CALL');
  }

  /**
   * Clear operator in-call status
   * 
   * Called when call ends.
   * 
   * @param tenantId - Tenant ID
   * @param operatorId - Operator ID
   */
  async clearOperatorInCall(
    tenantId: string,
    operatorId: string
  ): Promise<void> {
    const key = REDIS_KEYS.OPERATOR_IN_CALL(tenantId, operatorId);
    await this.redis.del(key);

    // Reset operator presence to ONLINE
    await this.setOperatorPresence(tenantId, operatorId, 'ONLINE');
  }

  /**
   * Get all online devices for branch
   * 
   * Used for "Call Branch" routing.
   * 
   * @param tenantId - Tenant ID
   * @param branchId - Branch ID
   * @returns Array of online device IDs
   */
  async getOnlineBranchDevices(
    tenantId: string,
    branchId: string
  ): Promise<string[]> {
    const presence = await this.getBranchPresence(tenantId, branchId);
    return presence.onlineDeviceIds;
  }

  /**
   * Get all online devices for employee
   * 
   * Used for "Call Employee" routing.
   * 
   * @param tenantId - Tenant ID
   * @param employeeId - Employee ID
   * @returns Array of online device IDs
   */
  async getOnlineEmployeeDevices(
    tenantId: string,
    employeeId: string
  ): Promise<string[]> {
    const presence = await this.getEmployeePresence(tenantId, employeeId);
    return presence.onlineDeviceIds;
  }

  /**
   * Get all available operators
   * 
   * Returns operators who are ONLINE (not BUSY/IN_CALL).
   * Used for branch->VMS call routing.
   * 
   * @param tenantId - Tenant ID
   * @returns Array of available operator IDs
   */
  async getAvailableOperators(tenantId: string): Promise<string[]> {
    // In production, this would scan a Redis set of operators
    // For now, query from user table with communication permissions
    const result = await this.pool.query<{ id: string }>(
      `SELECT DISTINCT u.id
      FROM users u
      INNER JOIN tenant_memberships tm ON u.id = tm.user_id
      INNER JOIN role_permissions rp ON tm.role_id = rp.role_id
      WHERE tm.tenant_id = $1
        AND tm.status = 'active'
        AND u.status = 'active'
        AND rp.action IN ('communication.receive.call', 'communication.branch.call')`,
      [tenantId]
    );

    const operatorIds = result.rows.map(row => row.id);

    // Filter to only ONLINE operators
    const available: string[] = [];
    for (const operatorId of operatorIds) {
      const presence = await this.getOperatorPresence(tenantId, operatorId);
      if (presence.status === 'ONLINE') {
        available.push(operatorId);
      }
    }

    return available;
  }

  /**
   * Clean up stale presence data
   * 
   * Redis TTL handles most cleanup, but this provides manual cleanup.
   * Called periodically by background worker.
   * 
   * @param tenantId - Tenant ID
   */
  async cleanupStalePresence(tenantId: string): Promise<void> {
    // Get all devices
    const devicesResult = await this.pool.query<{ id: string }>(
      `SELECT id FROM communication_devices WHERE tenant_id = $1`,
      [tenantId]
    );

    // Check TTL for each presence key
    const staleKeys: string[] = [];
    for (const device of devicesResult.rows) {
      const key = REDIS_KEYS.DEVICE_PRESENCE(tenantId, device.id);
      const ttl = await this.redis.ttl(key);
      
      // TTL of -2 means key doesn't exist (already expired)
      // TTL of -1 means key exists but has no TTL (shouldn't happen)
      if (ttl === -2 || ttl === -1) {
        staleKeys.push(key);
      }
    }

    // Delete stale keys (already expired or invalid)
    if (staleKeys.length > 0) {
      await this.redis.del(staleKeys);
    }
  }

  /**
   * Get presence summary for dashboard
   * 
   * Aggregates presence data for tenant overview.
   * 
   * @param tenantId - Tenant ID
   * @returns Presence summary
   */
  async getPresenceSummary(tenantId: string): Promise<{
    devices: { total: number; online: number; offline: number };
    branches: { total: number; online: number; offline: number };
    operators: { total: number; available: number; busy: number };
  }> {
    // Get all devices
    const devicesResult = await this.pool.query<{ id: string; branchId: string }>(
      `SELECT id, branch_id as "branchId"
      FROM communication_devices
      WHERE tenant_id = $1 AND status IN ('ACTIVE', 'OFFLINE')`,
      [tenantId]
    );

    const devices = devicesResult.rows;
    let onlineDevices = 0;

    for (const device of devices) {
      const presence = await this.getDevicePresence(tenantId, device.id);
      if (presence && presence.status === 'ONLINE') {
        onlineDevices++;
      }
    }

    // Get unique branches
    const branchIds = [...new Set(devices.map(d => d.branchId))];
    let onlineBranches = 0;

    for (const branchId of branchIds) {
      const presence = await this.getBranchPresence(tenantId, branchId);
      if (presence.status === 'ONLINE') {
        onlineBranches++;
      }
    }

    // Get operators
    const availableOps = await this.getAvailableOperators(tenantId);
    
    // Get total operators with permissions
    const totalOpsResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT u.id) as count
      FROM users u
      INNER JOIN tenant_memberships tm ON u.id = tm.user_id
      INNER JOIN role_permissions rp ON tm.role_id = rp.role_id
      WHERE tm.tenant_id = $1
        AND tm.status = 'active'
        AND u.status = 'active'
        AND rp.action IN ('communication.receive.call', 'communication.branch.call')`,
      [tenantId]
    );

    const totalOperators = parseInt(totalOpsResult.rows[0]?.count || '0', 10);

    return {
      devices: {
        total: devices.length,
        online: onlineDevices,
        offline: devices.length - onlineDevices,
      },
      branches: {
        total: branchIds.length,
        online: onlineBranches,
        offline: branchIds.length - onlineBranches,
      },
      operators: {
        total: totalOperators,
        available: availableOps.length,
        busy: totalOperators - availableOps.length,
      },
    };
  }
}
