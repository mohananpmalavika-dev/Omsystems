/**
 * Device Binding Service
 * Links Digital Twin objects to actual physical devices
 */

import { pool } from '../config/database';
import {
  DigitalTwinDeviceBinding,
  CreateDeviceBindingRequest,
  DeviceType,
} from '../types/digital-twin';

export class DeviceBindingService {
  async createBinding(request: CreateDeviceBindingRequest, userId: string): Promise<DigitalTwinDeviceBinding> {
    const result = await pool.query(
      `INSERT INTO digital_twin_device_bindings 
       (twin_object_id, device_type, device_id, device_table, status_source, 
        alert_source, status_mapping, auto_update, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        request.twinObjectId,
        request.deviceType,
        request.deviceId,
        request.deviceTable,
        request.statusSource,
        request.alertSource,
        JSON.stringify(request.statusMapping || {}),
        request.autoUpdate !== false,
        JSON.stringify(request.metadata || {}),
      ]
    );

    return this.mapBinding(result.rows[0]);
  }

  async getBinding(bindingId: string): Promise<DigitalTwinDeviceBinding | null> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_device_bindings WHERE id = $1',
      [bindingId]
    );
    
    return result.rows[0] ? this.mapBinding(result.rows[0]) : null;
  }

  async getBindingByObject(twinObjectId: string): Promise<DigitalTwinDeviceBinding | null> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_device_bindings WHERE twin_object_id = $1 LIMIT 1',
      [twinObjectId]
    );
    
    return result.rows[0] ? this.mapBinding(result.rows[0]) : null;
  }

  async getBindingByDevice(
    deviceType: DeviceType,
    deviceId: string
  ): Promise<DigitalTwinDeviceBinding | null> {
    const result = await pool.query(
      'SELECT * FROM digital_twin_device_bindings WHERE device_type = $1 AND device_id = $2 LIMIT 1',
      [deviceType, deviceId]
    );
    
    return result.rows[0] ? this.mapBinding(result.rows[0]) : null;
  }

  async listBindingsByFloor(floorId: string): Promise<DigitalTwinDeviceBinding[]> {
    const result = await pool.query(
      `SELECT dtdb.* FROM digital_twin_device_bindings dtdb
       JOIN digital_twin_objects dto ON dtdb.twin_object_id = dto.id
       WHERE dto.floor_id = $1`,
      [floorId]
    );
    
    return result.rows.map(this.mapBinding);
  }

  async updateBinding(
    bindingId: string,
    updates: Partial<CreateDeviceBindingRequest>,
    userId: string
  ): Promise<DigitalTwinDeviceBinding> {
    const result = await pool.query(
      `UPDATE digital_twin_device_bindings 
       SET status_source = COALESCE($1, status_source),
           alert_source = COALESCE($2, alert_source),
           status_mapping = COALESCE($3, status_mapping),
           auto_update = COALESCE($4, auto_update),
           metadata = COALESCE($5, metadata),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        updates.statusSource,
        updates.alertSource,
        updates.statusMapping ? JSON.stringify(updates.statusMapping) : null,
        updates.autoUpdate,
        updates.metadata ? JSON.stringify(updates.metadata) : null,
        bindingId,
      ]
    );

    return this.mapBinding(result.rows[0]);
  }

  async deleteBinding(bindingId: string, userId: string): Promise<void> {
    await pool.query('DELETE FROM digital_twin_device_bindings WHERE id = $1', [bindingId]);
  }

  async getDeviceStatus(binding: DigitalTwinDeviceBinding): Promise<any> {
    // Fetch device status from appropriate table
    const result = await pool.query(
      `SELECT * FROM ${binding.deviceTable} WHERE id = $1`,
      [binding.deviceId]
    );

    if (!result.rows[0]) {
      return { status: 'unknown', color: 'grey' };
    }

    const device = result.rows[0];
    
    // Apply status mapping
    return this.mapDeviceStatus(device, binding);
  }

  private mapDeviceStatus(device: any, binding: DigitalTwinDeviceBinding): any {
    const statusMapping = binding.statusMapping || {};
    
    // Extract status from device based on device type
    let deviceStatus: string;
    let isOnline: boolean;
    let isRecording: boolean | undefined;
    
    switch (binding.deviceType) {
      case 'camera':
        deviceStatus = device.health_status || device.status || 'unknown';
        isOnline = device.is_online || device.health_status === 'online';
        isRecording = device.is_recording;
        break;
        
      case 'recorder':
        deviceStatus = device.status || 'unknown';
        isOnline = device.is_online;
        break;
        
      case 'access_control':
        deviceStatus = device.door_status || device.status || 'unknown';
        isOnline = device.is_online;
        break;
        
      case 'sensor':
        deviceStatus = device.status || 'unknown';
        isOnline = device.is_online || device.status !== 'offline';
        break;
        
      default:
        deviceStatus = 'unknown';
        isOnline = false;
    }

    // Apply custom status mapping if provided
    const statusColor = statusMapping[deviceStatus] || this.getDefaultStatusColor(deviceStatus);

    return {
      status: deviceStatus,
      statusColor,
      isOnline,
      isRecording,
      deviceInfo: device,
    };
  }

  private getDefaultStatusColor(status: string): string {
    const colorMap: Record<string, string> = {
      online: '#22c55e',        // green
      offline: '#ef4444',       // red
      recording: '#22c55e',     // green
      not_recording: '#eab308', // yellow
      degraded: '#f97316',      // orange
      open: '#3b82f6',          // blue
      closed: '#22c55e',        // green
      forced: '#ef4444',        // red
      held_open: '#f97316',     // orange
      triggered: '#f97316',     // orange
      normal: '#22c55e',        // green
      tampered: '#ef4444',      // red
      battery_low: '#eab308',   // yellow
      unknown: '#6b7280',       // grey
    };

    return colorMap[status] || '#6b7280';
  }

  private mapBinding(row: any): DigitalTwinDeviceBinding {
    return {
      id: row.id,
      twinObjectId: row.twin_object_id,
      deviceType: row.device_type,
      deviceId: row.device_id,
      deviceTable: row.device_table,
      statusSource: row.status_source,
      alertSource: row.alert_source,
      statusMapping: row.status_mapping,
      autoUpdate: row.auto_update,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export default new DeviceBindingService();
