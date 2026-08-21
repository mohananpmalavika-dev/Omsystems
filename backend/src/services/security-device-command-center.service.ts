/**
 * Security Device Command Center Integration Service
 * 
 * Provides security device metrics and alerts for Command Center dashboard
 * Integrates with existing Command Center infrastructure
 */

import { Pool } from 'pg';
import { SecurityDeviceService } from './security-device.service';
import { PanicButtonEmergencyService } from './panic-button-emergency.service';
import { Redis } from 'ioredis';

export interface SecurityDeviceCommandCenterMetrics {
  // Overall device health
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  degradedDevices: number;
  healthPercentage: number;
  
  // Alerts and alarms
  activeAlarms: number;
  criticalAlerts: number;
  panicEmergencies: number;
  
  // Device categories
  devicesByCategory: {
    cctv: CategoryMetrics;
    accessControl: CategoryMetrics;
    intrusion: CategoryMetrics;
    fire: CategoryMetrics;
    banking: CategoryMetrics;
    power: CategoryMetrics;
  };
  
  // Recent events (last hour)
  recentEvents: {
    panicButtonEvents: number;
    forcedEntryEvents: number;
    vaultAccessEvents: number;
    fireAlarmEvents: number;
    atmTamperingEvents: number;
  };
  
  // Branch security posture
  branchesAtRisk: number;
  criticalBranches: string[];
  
  // Trends
  healthTrend: 'improving' | 'stable' | 'degrading';
  incidentTrend: 'increasing' | 'stable' | 'decreasing';
  
  timestamp: string;
}

export interface CategoryMetrics {
  total: number;
  online: number;
  offline: number;
  healthPercentage: number;
}

export interface SecurityDeviceAlert {
  id: string;
  type: 'PANIC_EMERGENCY' | 'DEVICE_OFFLINE' | 'VAULT_ACCESS' | 'FIRE_ALARM' | 'ATM_TAMPERING' | 'FORCED_ENTRY';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  branchId: string;
  branchName?: string;
  deviceId?: string;
  deviceName?: string;
  occurredAt: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  attachedCameras?: number;
}

export interface BranchSecurityStatus {
  branchId: string;
  branchName?: string;
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  deviceCount: number;
  onlineDevices: number;
  activeAlarms: number;
  criticalIssues: string[];
}

export class SecurityDeviceCommandCenterService {
  private static instance: SecurityDeviceCommandCenterService;
  private deviceService: SecurityDeviceService;
  private panicService: PanicButtonEmergencyService;

  private constructor(
    private readonly pool: Pool,
    private readonly redis: Redis
  ) {
    this.deviceService = SecurityDeviceService.getInstance();
    this.panicService = PanicButtonEmergencyService.getInstance(pool, redis);
  }

  static getInstance(pool?: Pool, redis?: Redis): SecurityDeviceCommandCenterService {
    if (!SecurityDeviceCommandCenterService.instance) {
      if (!pool || !redis) {
        throw new Error('Pool and Redis required for first initialization');
      }
      SecurityDeviceCommandCenterService.instance = new SecurityDeviceCommandCenterService(pool, redis);
    }
    return SecurityDeviceCommandCenterService.instance;
  }

  /**
   * Get comprehensive security device metrics for Command Center
   */
  async getCommandCenterMetrics(tenantId: string, branchIds?: string[]): Promise<SecurityDeviceCommandCenterMetrics> {
    const startTime = Date.now();

    // Get all devices with filters
    const filters: any = { includeHealth: true };
    if (branchIds && branchIds.length > 0) {
      // For multiple branches, we'll need to aggregate
      filters.branchId = branchIds[0]; // TODO: Support multiple branches in filter
    }

    const allDevices = await this.deviceService.getAllDevices(filters);

    // Calculate overall metrics
    const totalDevices = allDevices.length;
    const onlineDevices = allDevices.filter(d => d.health?.status === 'online').length;
    const offlineDevices = allDevices.filter(d => d.health?.status === 'offline').length;
    const degradedDevices = allDevices.filter(d => d.health?.status === 'degraded').length;
    const activeAlarms = allDevices.filter(d => d.health?.hasActiveAlarm).length;
    const healthPercentage = totalDevices > 0 ? (onlineDevices / totalDevices) * 100 : 100;

    // Get panic emergencies
    const panicEmergencies = this.panicService.getActiveEmergencies();

    // Calculate device categories
    const devicesByCategory = this.calculateCategoryMetrics(allDevices);

    // Get recent events (last hour)
    const oneHourAgo = new Date(Date.now() - 3600000);
    const recentEvents = await this.getRecentSecurityEvents(oneHourAgo);

    // Get branch security posture
    const branchPostures = await this.getBranchSecurityPostures(branchIds);
    const criticalBranches = branchPostures
      .filter(b => b.riskLevel === 'critical')
      .map(b => b.branchId);
    const branchesAtRisk = branchPostures.filter(
      b => b.riskLevel === 'high' || b.riskLevel === 'critical'
    ).length;

    // Calculate trends
    const healthTrend = await this.calculateHealthTrend();
    const incidentTrend = await this.calculateIncidentTrend();

    // Count critical alerts
    const criticalAlerts = panicEmergencies.length + 
      (recentEvents.fireAlarmEvents > 0 ? 1 : 0) +
      (recentEvents.vaultAccessEvents > 0 ? 1 : 0);

    const metrics: SecurityDeviceCommandCenterMetrics = {
      totalDevices,
      onlineDevices,
      offlineDevices,
      degradedDevices,
      healthPercentage: Math.round(healthPercentage * 10) / 10,
      activeAlarms,
      criticalAlerts,
      panicEmergencies: panicEmergencies.length,
      devicesByCategory,
      recentEvents,
      branchesAtRisk,
      criticalBranches,
      healthTrend,
      incidentTrend,
      timestamp: new Date().toISOString(),
    };

    const duration = Date.now() - startTime;
    console.log(`[SecurityDeviceCommandCenter] Metrics calculated in ${duration}ms`);

    return metrics;
  }

  /**
   * Get active security device alerts for Command Center
   */
  async getActiveAlerts(tenantId: string, limit: number = 20): Promise<SecurityDeviceAlert[]> {
    const alerts: SecurityDeviceAlert[] = [];

    // Get panic emergencies
    const panicEmergencies = this.panicService.getActiveEmergencies();
    for (const emergency of panicEmergencies.slice(0, limit)) {
      alerts.push({
        id: emergency.panicEvent.id,
        type: 'PANIC_EMERGENCY',
        severity: 'CRITICAL',
        title: `🚨 Panic Button - ${emergency.panicEvent.location || 'Branch'}`,
        description: `Panic button activated. ${emergency.attachedCameras.length} cameras attached. ${emergency.notificationsSent.length} personnel notified.`,
        branchId: emergency.panicEvent.branchId,
        branchName: emergency.panicEvent.branchName,
        deviceId: emergency.panicEvent.deviceId,
        deviceName: emergency.panicEvent.deviceName,
        occurredAt: emergency.panicEvent.triggeredAt.toISOString(),
        acknowledged: emergency.panicEvent.acknowledged,
        acknowledgedBy: emergency.panicEvent.acknowledgedBy,
        attachedCameras: emergency.attachedCameras.length,
      });
    }

    // Get correlated security incidents from last 24 hours
    const result = await this.pool.query(
      `SELECT 
        id, incident_type, severity, title, description,
        branch_id, device_ids, attached_camera_ids,
        detected_at, acknowledged_by
       FROM correlated_security_incidents
       WHERE tenant_id = $1
         AND status = 'ACTIVE'
         AND detected_at > NOW() - INTERVAL '24 hours'
       ORDER BY detected_at DESC
       LIMIT $2`,
      [tenantId, limit - alerts.length]
    );

    for (const row of result.rows) {
      const alertType = this.mapIncidentTypeToAlertType(row.incident_type);
      const severity = this.mapSeverityToAlertSeverity(row.severity);
      
      alerts.push({
        id: row.id,
        type: alertType,
        severity,
        title: row.title,
        description: row.description,
        branchId: row.branch_id,
        deviceId: row.device_ids?.[0],
        occurredAt: row.detected_at,
        acknowledged: !!row.acknowledged_by,
        acknowledgedBy: row.acknowledged_by,
        attachedCameras: row.attached_camera_ids?.length || 0,
      });
    }

    return alerts;
  }

  /**
   * Get branch-specific security device status
   */
  async getBranchSecurityDeviceStatus(branchId: string): Promise<BranchSecurityStatus> {
    const devices = await this.deviceService.getAllDevices({
      branchId,
      includeHealth: true,
    });

    const onlineDevices = devices.filter(d => d.health?.status === 'online').length;
    const activeAlarms = devices.filter(d => d.health?.hasActiveAlarm).length;
    
    // Get branch posture if available
    const posture = await this.deviceService.getBranchSecurityPosture(branchId);

    const criticalIssues: string[] = [];
    if (activeAlarms > 0) {
      criticalIssues.push(`${activeAlarms} active alarms`);
    }
    
    const offlineCount = devices.filter(d => d.health?.status === 'offline').length;
    if (offlineCount > 0) {
      criticalIssues.push(`${offlineCount} devices offline`);
    }

    const overallScore = posture?.overallScore || (devices.length > 0 ? (onlineDevices / devices.length) * 100 : 100);

    return {
      branchId,
      branchName: devices[0]?.branchName,
      overallScore: Math.round(overallScore),
      riskLevel: posture?.riskLevel || this.calculateRiskLevel(overallScore),
      deviceCount: devices.length,
      onlineDevices,
      activeAlarms,
      criticalIssues,
    };
  }

  /**
   * Calculate device metrics by category
   */
  private calculateCategoryMetrics(devices: any[]): SecurityDeviceCommandCenterMetrics['devicesByCategory'] {
    const categories = {
      cctv: [] as any[],
      accessControl: [] as any[],
      intrusion: [] as any[],
      fire: [] as any[],
      banking: [] as any[],
      power: [] as any[],
    };

    // Categorize devices
    devices.forEach(device => {
      const type = device.deviceType;
      
      if (type === 'ip-camera' || type === 'nvr' || type === 'dvr') {
        categories.cctv.push(device);
      } else if (type === 'access-controller' || type === 'door') {
        categories.accessControl.push(device);
      } else if (type === 'intrusion-panel' || type === 'motion-sensor' || type === 'glass-break') {
        categories.intrusion.push(device);
      } else if (type === 'fire-panel' || type === 'smoke-detector' || type === 'fire-detector') {
        categories.fire.push(device);
      } else if (type === 'atm' || type === 'vault-door' || type === 'vault') {
        categories.banking.push(device);
      } else if (type === 'ups') {
        categories.power.push(device);
      }
    });

    // Calculate metrics for each category
    const calculateMetrics = (deviceList: any[]): CategoryMetrics => {
      const total = deviceList.length;
      const online = deviceList.filter(d => d.health?.status === 'online').length;
      const offline = deviceList.filter(d => d.health?.status === 'offline').length;
      const healthPercentage = total > 0 ? (online / total) * 100 : 100;

      return {
        total,
        online,
        offline,
        healthPercentage: Math.round(healthPercentage * 10) / 10,
      };
    };

    return {
      cctv: calculateMetrics(categories.cctv),
      accessControl: calculateMetrics(categories.accessControl),
      intrusion: calculateMetrics(categories.intrusion),
      fire: calculateMetrics(categories.fire),
      banking: calculateMetrics(categories.banking),
      power: calculateMetrics(categories.power),
    };
  }

  /**
   * Get recent security events (last hour)
   */
  private async getRecentSecurityEvents(since: Date): Promise<SecurityDeviceCommandCenterMetrics['recentEvents']> {
    const result = await this.pool.query(
      `SELECT event_type, COUNT(*) as count
       FROM security_device_events
       WHERE occurred_at > $1
       GROUP BY event_type`,
      [since]
    );

    const eventCounts: Record<string, number> = {};
    result.rows.forEach(row => {
      eventCounts[row.event_type] = parseInt(row.count);
    });

    return {
      panicButtonEvents: eventCounts['PANIC_BUTTON_PRESSED'] || 0,
      forcedEntryEvents: (eventCounts['DOOR_FORCED_OPEN'] || 0) + (eventCounts['GLASS_BREAK_DETECTED'] || 0),
      vaultAccessEvents: (eventCounts['VAULT_OPENED'] || 0) + (eventCounts['VAULT_UNAUTHORIZED_ACCESS'] || 0),
      fireAlarmEvents: (eventCounts['FIRE_ALARM_TRIGGERED'] || 0) + (eventCounts['SMOKE_DETECTED'] || 0),
      atmTamperingEvents: eventCounts['ATM_TAMPER'] || 0,
    };
  }

  /**
   * Get branch security postures
   */
  private async getBranchSecurityPostures(branchIds?: string[]): Promise<BranchSecurityStatus[]> {
    let query = `
      SELECT branch_id, overall_score, risk_level, 
             total_devices, online_devices, active_alarms
      FROM branch_security_posture
    `;
    
    const params: any[] = [];
    if (branchIds && branchIds.length > 0) {
      query += ` WHERE branch_id = ANY($1)`;
      params.push(branchIds);
    }

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      branchId: row.branch_id,
      overallScore: parseFloat(row.overall_score),
      riskLevel: row.risk_level,
      deviceCount: row.total_devices,
      onlineDevices: row.online_devices,
      activeAlarms: row.active_alarms,
      criticalIssues: [],
    }));
  }

  /**
   * Calculate health trend
   */
  private async calculateHealthTrend(): Promise<'improving' | 'stable' | 'degrading'> {
    // Compare current health with 1 hour ago
    const result = await this.pool.query(
      `WITH current_health AS (
        SELECT COUNT(*) FILTER (WHERE status = 'online') as online,
               COUNT(*) as total
        FROM security_devices
      ),
      past_health AS (
        SELECT AVG(
          CASE WHEN snapshot->>'status' = 'online' THEN 1.0 ELSE 0.0 END
        ) as online_percentage
        FROM security_device_health_snapshots
        WHERE snapshot_time > NOW() - INTERVAL '1 hour'
          AND snapshot_time < NOW() - INTERVAL '55 minutes'
      )
      SELECT 
        (c.online::float / NULLIF(c.total, 0) - COALESCE(p.online_percentage, 0)) as health_delta
      FROM current_health c, past_health p`
    );

    const healthDelta = result.rows[0]?.health_delta || 0;
    
    if (healthDelta > 0.02) return 'improving'; // > 2% improvement
    if (healthDelta < -0.02) return 'degrading'; // > 2% degradation
    return 'stable';
  }

  /**
   * Calculate incident trend
   */
  private async calculateIncidentTrend(): Promise<'increasing' | 'stable' | 'decreasing'> {
    const result = await this.pool.query(
      `WITH current_hour AS (
        SELECT COUNT(*) as count
        FROM correlated_security_incidents
        WHERE detected_at > NOW() - INTERVAL '1 hour'
      ),
      previous_hour AS (
        SELECT COUNT(*) as count
        FROM correlated_security_incidents
        WHERE detected_at > NOW() - INTERVAL '2 hours'
          AND detected_at < NOW() - INTERVAL '1 hour'
      )
      SELECT c.count as current, p.count as previous
      FROM current_hour c, previous_hour p`
    );

    const current = result.rows[0]?.current || 0;
    const previous = result.rows[0]?.previous || 0;
    
    if (current > previous + 2) return 'increasing';
    if (current < previous - 2) return 'decreasing';
    return 'stable';
  }

  /**
   * Map incident type to alert type
   */
  private mapIncidentTypeToAlertType(incidentType: string): SecurityDeviceAlert['type'] {
    const mapping: Record<string, SecurityDeviceAlert['type']> = {
      'PANIC_EMERGENCY': 'PANIC_EMERGENCY',
      'UNAUTHORIZED_VAULT_ACCESS': 'VAULT_ACCESS',
      'FIRE_EMERGENCY': 'FIRE_ALARM',
      'ATM_TAMPERING': 'ATM_TAMPERING',
      'FORCED_ENTRY': 'FORCED_ENTRY',
    };

    return mapping[incidentType] || 'DEVICE_OFFLINE';
  }

  /**
   * Map severity to alert severity
   */
  private mapSeverityToAlertSeverity(severity: string): SecurityDeviceAlert['severity'] {
    if (severity === 'P1') return 'CRITICAL';
    if (severity === 'P2') return 'HIGH';
    if (severity === 'P3') return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Calculate risk level from score
   */
  private calculateRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 90) return 'low';
    if (score >= 70) return 'medium';
    if (score >= 50) return 'high';
    return 'critical';
  }
}
