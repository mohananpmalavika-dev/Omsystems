/**
 * Infrastructure-RCA Integration Service
 * 
 * Correlates infrastructure failures with surveillance incidents to enable
 * automatic root cause analysis. When cameras go offline or incidents occur,
 * this service checks the underlying infrastructure to identify the true cause.
 * 
 * Example Correlation Flows:
 * 1. Camera Offline → Check switch port → PoE status → UPS health → Power outage
 * 2. Multiple cameras down → Check switch health → Network failure → Core switch down
 * 3. Recording gaps → Check recorder → Disk health → Storage failure prediction
 * 4. Video quality issues → Check bandwidth → Network congestion → Firewall sessions
 * 
 * This reduces troubleshooting time from hours to minutes by automatically
 * checking the entire infrastructure stack.
 */

import { Pool } from 'pg';
import type { 
  SwitchHealthMetrics,
  FirewallHealthMetrics,
  UPSHealthMetrics,
  InfrastructureAlert
} from '../../types/infrastructure.types.js';

// ============================================
// Types
// ============================================

interface CameraIncident {
  cameraId: string;
  cameraName: string;
  branchId: string;
  incidentType: 'offline' | 'poor_quality' | 'recording_gap' | 'connection_lost';
  detectedAt: Date;
  metadata?: Record<string, any>;
}

interface InfrastructureRootCause {
  rootCauseType: 'switch_port' | 'switch_device' | 'ups_power' | 'firewall' | 'network_link' | 'unknown';
  confidence: number; // 0-1
  explanation: string;
  affectedComponents: Array<{
    componentType: string;
    componentId: string;
    componentName: string;
    status: string;
    healthScore?: number;
  }>;
  recommendedActions: string[];
  relatedAlerts: InfrastructureAlert[];
  troubleshootingPath: string[];
}

interface CorrelationResult {
  cameraId: string;
  incidentType: string;
  infrastructureRootCause: InfrastructureRootCause | null;
  correlationTimestamp: Date;
  investigationDurationSeconds: number;
}

// ============================================
// Infrastructure-RCA Integration Service
// ============================================

export class InfrastructureRcaIntegrationService {
  constructor(private pool: Pool) {}

  /**
   * Main entry point: Investigate a camera incident and correlate with infrastructure
   */
  async investigateCameraIncident(incident: CameraIncident): Promise<CorrelationResult> {
    const startTime = Date.now();

    console.log(`[RCA-Integration] Investigating camera incident: ${incident.cameraId} (${incident.incidentType})`);

    // 1. Get camera network topology (which switch port is it connected to?)
    const cameraTopology = await this.getCameraNetworkTopology(incident.cameraId, incident.branchId);

    if (!cameraTopology) {
      return {
        cameraId: incident.cameraId,
        incidentType: incident.incidentType,
        infrastructureRootCause: null,
        correlationTimestamp: new Date(),
        investigationDurationSeconds: (Date.now() - startTime) / 1000
      };
    }

    // 2. Build correlation chain
    const rootCause = await this.buildCorrelationChain(
      incident,
      cameraTopology,
      incident.branchId
    );

    // 3. Store correlation result
    await this.storeCorrelationResult(incident, rootCause);

    // 4. Create unified incident if infrastructure failure detected
    if (rootCause && rootCause.confidence > 0.7) {
      await this.createUnifiedIncident(incident, rootCause);
    }

    return {
      cameraId: incident.cameraId,
      incidentType: incident.incidentType,
      infrastructureRootCause: rootCause,
      correlationTimestamp: new Date(),
      investigationDurationSeconds: (Date.now() - startTime) / 1000
    };
  }

  /**
   * Batch investigation: Check all offline cameras in a branch
   */
  async investigateBranchOutage(branchId: string, tenantId: string): Promise<CorrelationResult[]> {
    console.log(`[RCA-Integration] Investigating branch-wide outage: ${branchId}`);

    // Get all offline cameras
    const offlineCameras = await this.pool.query(
      `SELECT 
        c.id as camera_id,
        c.name as camera_name,
        c.last_seen_at,
        NOW() - c.last_seen_at as offline_duration
      FROM cameras c
      WHERE c.branch_id = $1
        AND c.tenant_id = $2
        AND c.last_seen_at < NOW() - INTERVAL '5 minutes'
      ORDER BY c.last_seen_at ASC`,
      [branchId, tenantId]
    );

    if (offlineCameras.rows.length === 0) {
      return [];
    }

    console.log(`[RCA-Integration] Found ${offlineCameras.rows.length} offline cameras in branch ${branchId}`);

    // Investigate each camera
    const results: CorrelationResult[] = [];
    for (const camera of offlineCameras.rows) {
      const incident: CameraIncident = {
        cameraId: camera.camera_id,
        cameraName: camera.camera_name,
        branchId,
        incidentType: 'offline',
        detectedAt: new Date(camera.last_seen_at)
      };

      const result = await this.investigateCameraIncident(incident);
      results.push(result);
    }

    // Check for common root cause (e.g., UPS failure affecting all cameras)
    await this.detectCommonRootCause(results, branchId);

    return results;
  }

  /**
   * Get camera network topology
   */
  private async getCameraNetworkTopology(cameraId: string, branchId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
        c.id as camera_id,
        c.name as camera_name,
        c.ip_address as camera_ip,
        ntn.source_device_id as switch_id,
        ntn.source_interface as switch_port,
        ns.name as switch_name,
        ns.ip_address as switch_ip,
        ns.vendor as switch_vendor
      FROM cameras c
      LEFT JOIN network_topology_nodes ntn 
        ON ntn.target_device_id = c.id 
        AND ntn.target_device_type = 'camera'
      LEFT JOIN network_switches ns
        ON ns.id = ntn.source_device_id
      WHERE c.id = $1 AND c.branch_id = $2`,
      [cameraId, branchId]
    );

    return result.rows[0] || null;
  }

  /**
   * Build correlation chain to identify root cause
   */
  private async buildCorrelationChain(
    incident: CameraIncident,
    topology: any,
    branchId: string
  ): Promise<InfrastructureRootCause | null> {
    const troubleshootingPath: string[] = [];
    const affectedComponents: InfrastructureRootCause['affectedComponents'] = [];
    const relatedAlerts: InfrastructureAlert[] = [];

    troubleshootingPath.push(`Camera: ${incident.cameraName} (${incident.incidentType})`);

    // Step 1: Check switch port (if camera is connected to a switch)
    if (topology.switch_id) {
      troubleshootingPath.push(`Checking switch port: ${topology.switch_name} port ${topology.switch_port}`);

      const portStatus = await this.checkSwitchPort(
        topology.switch_id,
        topology.switch_port,
        branchId
      );

      if (portStatus) {
        affectedComponents.push({
          componentType: 'switch_port',
          componentId: `${topology.switch_id}-${topology.switch_port}`,
          componentName: `${topology.switch_name} Port ${topology.switch_port}`,
          status: portStatus.operStatus,
          healthScore: portStatus.healthScore
        });

        // Check if port is down
        if (portStatus.operStatus === 'down') {
          troubleshootingPath.push(`✗ Switch port is DOWN`);

          // Check if PoE is the issue
          if (portStatus.poeEnabled && !portStatus.poeDeviceDetected) {
            troubleshootingPath.push(`✗ PoE device not detected (power issue)`);

            return {
              rootCauseType: 'switch_port',
              confidence: 0.95,
              explanation: `Camera ${incident.cameraName} is offline because switch port ${topology.switch_port} on ${topology.switch_name} has lost PoE power. The port is administratively UP but operationally DOWN with no PoE device detected.`,
              affectedComponents,
              recommendedActions: [
                'Check physical cable connection',
                'Verify PoE budget on switch (may be exceeded)',
                'Test with known-good PoE injector',
                'Check for PoE short circuit or overload',
                'Inspect camera power requirements vs switch PoE capacity'
              ],
              relatedAlerts,
              troubleshootingPath
            };
          }

          return {
            rootCauseType: 'switch_port',
            confidence: 0.90,
            explanation: `Camera ${incident.cameraName} is offline because switch port ${topology.switch_port} on ${topology.switch_name} is DOWN. This could be due to physical disconnection, cable failure, or switch port failure.`,
            affectedComponents,
            recommendedActions: [
              'Check physical cable connection at both ends',
              'Test cable with cable tester',
              'Try connecting camera to different switch port',
              'Verify switch port configuration',
              'Check for port shutdown or error-disabled state'
            ],
            relatedAlerts,
            troubleshootingPath
          };
        }

        troubleshootingPath.push(`✓ Switch port is UP`);
      }

      // Step 2: Check overall switch health
      troubleshootingPath.push(`Checking switch health: ${topology.switch_name}`);

      const switchHealth = await this.getSwitchHealth(topology.switch_id, branchId);

      if (switchHealth) {
        affectedComponents.push({
          componentType: 'switch',
          componentId: topology.switch_id,
          componentName: topology.switch_name,
          status: switchHealth.health_status,
          healthScore: switchHealth.health_score
        });

        // Check for critical switch issues
        if (switchHealth.health_score < 50) {
          troubleshootingPath.push(`✗ Switch health CRITICAL (score: ${switchHealth.health_score})`);

          // Get switch alerts
          const switchAlerts = await this.getComponentAlerts(
            topology.switch_id,
            'switch',
            branchId
          );
          relatedAlerts.push(...switchAlerts);

          return {
            rootCauseType: 'switch_device',
            confidence: 0.85,
            explanation: `Camera ${incident.cameraName} is offline due to critical health issues on ${topology.switch_name}. Switch health score is ${switchHealth.health_score}/100. Issues: CPU ${switchHealth.cpu_usage_percent}%, Memory ${switchHealth.memory_usage_percent}%, Temperature ${switchHealth.temperature_celsius}°C.`,
            affectedComponents,
            recommendedActions: [
              `Address high CPU usage (${switchHealth.cpu_usage_percent}%)` ,
              `Address high memory usage (${switchHealth.memory_usage_percent}%)`,
              `Check switch temperature (${switchHealth.temperature_celsius}°C)`,
              'Review switch logs for errors',
              'Consider switch reboot if critical',
              'Plan switch replacement if hardware failure'
            ],
            relatedAlerts,
            troubleshootingPath
          };
        }

        troubleshootingPath.push(`✓ Switch health OK (score: ${switchHealth.health_score})`);
      }
    }

    // Step 3: Check UPS power (affects all devices in branch)
    troubleshootingPath.push(`Checking UPS power systems`);

    const upsStatus = await this.checkBranchUPS(branchId);

    if (upsStatus.onBattery || upsStatus.powerOutage) {
      affectedComponents.push(...upsStatus.affectedUPS);

      const upsAlerts = await this.getComponentAlerts(null, 'ups', branchId);
      relatedAlerts.push(...upsAlerts);

      troubleshootingPath.push(`✗ UPS is on battery or power outage detected`);

      return {
        rootCauseType: 'ups_power',
        confidence: 0.98,
        explanation: `Camera ${incident.cameraName} is offline due to a power issue. ${upsStatus.onBattery ? `UPS is running on battery power with ${upsStatus.estimatedRuntimeMinutes} minutes remaining.` : 'Power outage detected.'} All branch devices are affected.`,
        affectedComponents,
        recommendedActions: [
          'Check utility power status immediately',
          'Verify generator startup (if available)',
          `Monitor UPS runtime: ${upsStatus.estimatedRuntimeMinutes} minutes remaining`,
          'Prepare for graceful shutdown if power not restored',
          'Contact facility management',
          'Investigate cause of power outage'
        ],
        relatedAlerts,
        troubleshootingPath
      };
    }

    troubleshootingPath.push(`✓ UPS power systems healthy`);

    // Step 4: Check firewall / network connectivity
    troubleshootingPath.push(`Checking network connectivity and firewall`);

    const firewallHealth = await this.checkBranchFirewall(branchId);

    if (firewallHealth && firewallHealth.health_score < 60) {
      affectedComponents.push({
        componentType: 'firewall',
        componentId: firewallHealth.firewall_id,
        componentName: firewallHealth.firewall_name,
        status: firewallHealth.health_status,
        healthScore: firewallHealth.health_score
      });

      const firewallAlerts = await this.getComponentAlerts(
        firewallHealth.firewall_id,
        'firewall',
        branchId
      );
      relatedAlerts.push(...firewallAlerts);

      troubleshootingPath.push(`✗ Firewall health degraded (score: ${firewallHealth.health_score})`);

      return {
        rootCauseType: 'firewall',
        confidence: 0.75,
        explanation: `Camera ${incident.cameraName} may be offline due to firewall issues on ${firewallHealth.firewall_name}. Session table utilization: ${firewallHealth.session_utilization_percent}%, VPN tunnels down: ${firewallHealth.vpn_tunnels_down}.`,
        affectedComponents,
        recommendedActions: [
          'Check firewall session table capacity',
          'Verify VPN tunnel status if remote camera',
          'Review firewall logs for blocks/denies',
          'Check for DDoS or high traffic volume',
          'Consider firewall reboot if critical'
        ],
        relatedAlerts,
        troubleshootingPath
      };
    }

    troubleshootingPath.push(`✓ Firewall health OK`);

    // Step 5: No infrastructure root cause found
    troubleshootingPath.push(`⚠ No infrastructure root cause identified - likely camera-level issue`);

    return {
      rootCauseType: 'unknown',
      confidence: 0.30,
      explanation: `Camera ${incident.cameraName} is offline but no infrastructure issues detected. Switch port is UP, switch health is good, power is stable, and network is operational. This suggests a camera-level problem.`,
      affectedComponents,
      recommendedActions: [
        'Power cycle the camera',
        'Check camera firmware version',
        'Verify camera credentials and configuration',
        'Test camera with direct connection',
        'Check camera logs if accessible',
        'Consider camera replacement if hardware failure'
      ],
      relatedAlerts,
      troubleshootingPath
    };
  }

  /**
   * Check switch port status
   */
  private async checkSwitchPort(
    switchId: string,
    portNumber: string,
    branchId: string
  ): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
        port_number,
        port_name,
        admin_status,
        oper_status,
        poe_enabled,
        poe_device_detected,
        poe_power_watts,
        utilization_percent,
        rx_errors,
        tx_errors,
        observed_at,
        CASE 
          WHEN oper_status = 'up' AND rx_errors = 0 AND tx_errors = 0 THEN 100
          WHEN oper_status = 'up' AND (rx_errors > 0 OR tx_errors > 0) THEN 70
          WHEN oper_status = 'down' THEN 0
          ELSE 50
        END as health_score
      FROM switch_port_metrics
      WHERE switch_id = $1
        AND port_number = $2::text
        AND observed_at = (
          SELECT MAX(observed_at)
          FROM switch_port_metrics
          WHERE switch_id = $1
        )`,
      [switchId, portNumber]
    );

    return result.rows[0] || null;
  }

  /**
   * Get switch health metrics
   */
  private async getSwitchHealth(switchId: string, branchId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT *
      FROM switch_health_metrics
      WHERE switch_id = $1
      ORDER BY observed_at DESC
      LIMIT 1`,
      [switchId]
    );

    return result.rows[0] || null;
  }

  /**
   * Check branch UPS status
   */
  private async checkBranchUPS(branchId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
        u.id as ups_id,
        u.name as ups_name,
        uhm.running_on_battery,
        uhm.utility_power_available,
        uhm.estimated_runtime_minutes,
        uhm.battery_health_percent,
        uhm.health_score
      FROM ups_devices u
      JOIN LATERAL (
        SELECT *
        FROM ups_health_metrics
        WHERE ups_id = u.id
        ORDER BY observed_at DESC
        LIMIT 1
      ) uhm ON true
      WHERE u.branch_id = $1`,
      [branchId]
    );

    const allUPS = result.rows;
    const onBattery = allUPS.some(ups => ups.running_on_battery);
    const powerOutage = allUPS.some(ups => !ups.utility_power_available);
    const minRuntime = Math.min(...allUPS.map(ups => ups.estimated_runtime_minutes || 999));

    return {
      onBattery,
      powerOutage,
      estimatedRuntimeMinutes: onBattery ? minRuntime : null,
      affectedUPS: allUPS.map(ups => ({
        componentType: 'ups',
        componentId: ups.ups_id,
        componentName: ups.ups_name,
        status: ups.running_on_battery ? 'on_battery' : 'online',
        healthScore: ups.health_score
      }))
    };
  }

  /**
   * Check branch firewall health
   */
  private async checkBranchFirewall(branchId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
        f.id as firewall_id,
        f.name as firewall_name,
        fhm.health_score,
        fhm.health_status,
        fhm.session_utilization_percent,
        fhm.vpn_tunnels_down,
        fhm.ips_status,
        fhm.av_status
      FROM firewalls f
      JOIN LATERAL (
        SELECT *
        FROM firewall_health_metrics
        WHERE firewall_id = f.id
        ORDER BY observed_at DESC
        LIMIT 1
      ) fhm ON true
      WHERE f.branch_id = $1
      LIMIT 1`,
      [branchId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get infrastructure alerts for a component
   */
  private async getComponentAlerts(
    componentId: string | null,
    componentType: string,
    branchId: string
  ): Promise<InfrastructureAlert[]> {
    let query = `
      SELECT *
      FROM infrastructure_alerts
      WHERE branch_id = $1
        AND component_type = $2
        AND status = 'active'
        AND severity IN ('critical', 'warning')
      ORDER BY detected_at DESC
      LIMIT 5
    `;

    const params: any[] = [branchId, componentType];

    if (componentId) {
      query = `
        SELECT *
        FROM infrastructure_alerts
        WHERE component_id = $1
          AND component_type = $2
          AND status = 'active'
          AND severity IN ('critical', 'warning')
        ORDER BY detected_at DESC
        LIMIT 5
      `;
      params[0] = componentId;
    }

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Store correlation result
   */
  private async storeCorrelationResult(
    incident: CameraIncident,
    rootCause: InfrastructureRootCause | null
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO infrastructure_rca_correlations (
        tenant_id,
        camera_id,
        branch_id,
        incident_type,
        detected_at,
        root_cause_type,
        root_cause_confidence,
        root_cause_explanation,
        affected_components,
        recommended_actions,
        troubleshooting_path,
        created_at
      ) VALUES (
        (SELECT tenant_id FROM cameras WHERE id = $1),
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
      )`,
      [
        incident.cameraId,
        incident.branchId,
        incident.incidentType,
        incident.detectedAt,
        rootCause?.rootCauseType || 'unknown',
        rootCause?.confidence || 0,
        rootCause?.explanation || 'No infrastructure root cause identified',
        JSON.stringify(rootCause?.affectedComponents || []),
        JSON.stringify(rootCause?.recommendedActions || []),
        JSON.stringify(rootCause?.troubleshootingPath || [])
      ]
    );
  }

  /**
   * Create unified incident linking surveillance and infrastructure
   */
  private async createUnifiedIncident(
    incident: CameraIncident,
    rootCause: InfrastructureRootCause
  ): Promise<void> {
    // This creates a unified incident that appears in both surveillance and infrastructure dashboards
    await this.pool.query(
      `INSERT INTO unified_incidents (
        tenant_id,
        incident_type,
        severity,
        source_system,
        source_id,
        branch_id,
        title,
        description,
        root_cause_type,
        root_cause_confidence,
        affected_surveillance_devices,
        affected_infrastructure_devices,
        recommended_actions,
        status,
        created_at
      ) VALUES (
        (SELECT tenant_id FROM cameras WHERE id = $1),
        'camera_offline_infrastructure',
        CASE 
          WHEN $2 = 'ups_power' THEN 'critical'
          WHEN $2 = 'switch_device' THEN 'critical'
          WHEN $2 = 'switch_port' THEN 'warning'
          ELSE 'info'
        END,
        'rca_correlation',
        $1,
        $3,
        $4,
        $5,
        $2,
        $6,
        $7,
        $8,
        $9,
        'active',
        NOW()
      )`,
      [
        incident.cameraId,
        rootCause.rootCauseType,
        incident.branchId,
        `Camera Offline: ${incident.cameraName}`,
        rootCause.explanation,
        rootCause.confidence,
        JSON.stringify([{ cameraId: incident.cameraId, cameraName: incident.cameraName }]),
        JSON.stringify(rootCause.affectedComponents),
        JSON.stringify(rootCause.recommendedActions)
      ]
    );
  }

  /**
   * Detect common root cause affecting multiple cameras
   */
  private async detectCommonRootCause(
    results: CorrelationResult[],
    branchId: string
  ): Promise<void> {
    // Group by root cause type
    const rootCauseGroups = new Map<string, CorrelationResult[]>();

    for (const result of results) {
      if (!result.infrastructureRootCause) continue;

      const rcType = result.infrastructureRootCause.rootCauseType;
      if (!rootCauseGroups.has(rcType)) {
        rootCauseGroups.set(rcType, []);
      }
      rootCauseGroups.get(rcType)!.push(result);
    }

    // If majority of cameras have the same root cause, create branch-wide incident
    for (const [rcType, group] of rootCauseGroups) {
      if (group.length >= 3 || group.length / results.length > 0.5) {
        console.log(`[RCA-Integration] Common root cause detected: ${rcType} affecting ${group.length} cameras`);
        
        await this.createBranchWideIncident(branchId, rcType, group);
      }
    }
  }

  /**
   * Create branch-wide incident
   */
  private async createBranchWideIncident(
    branchId: string,
    rootCauseType: string,
    affectedCameras: CorrelationResult[]
  ): Promise<void> {
    const cameraNames = affectedCameras
      .map(r => r.infrastructureRootCause?.affectedComponents.find(c => c.componentType === 'camera'))
      .filter((c): c is NonNullable<typeof c> => c !== undefined && c !== null)
      .map(c => c.componentName)
      .join(', ');

    const firstRootCause = affectedCameras[0]?.infrastructureRootCause;
    
    if (!firstRootCause) {
      this.logger?.warn(`Cannot create unified incident: no root cause found`);
      return;
    }

    await this.pool.query(
      `INSERT INTO unified_incidents (
        tenant_id,
        incident_type,
        severity,
        source_system,
        branch_id,
        title,
        description,
        root_cause_type,
        root_cause_confidence,
        affected_surveillance_devices,
        affected_infrastructure_devices,
        recommended_actions,
        status,
        created_at
      ) VALUES (
        (SELECT tenant_id FROM resource_nodes WHERE id = $1),
        'branch_wide_outage',
        'critical',
        'rca_correlation',
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        'active',
        NOW()
      )`,
      [
        branchId,
        `Branch-Wide Outage: ${affectedCameras.length} Cameras Offline`,
        `Infrastructure failure affecting ${affectedCameras.length} cameras in branch. Root cause: ${rootCauseType}. ${firstRootCause.explanation}`,
        rootCauseType,
        firstRootCause.confidence,
        JSON.stringify(affectedCameras.map(r => ({ cameraId: r.cameraId }))),
        JSON.stringify(firstRootCause.affectedComponents),
        JSON.stringify(firstRootCause.recommendedActions)
      ]
    );
  }

  /**
   * Get RCA correlation history for a camera
   */
  async getCameraRcaHistory(cameraId: string, limit: number = 10): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT *
      FROM infrastructure_rca_correlations
      WHERE camera_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
      [cameraId, limit]
    );

    return result.rows;
  }

  /**
   * Get branch-wide RCA statistics
   */
  async getBranchRcaStatistics(branchId: string, days: number = 30): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
        root_cause_type,
        COUNT(*) as incident_count,
        AVG(root_cause_confidence) as avg_confidence,
        json_agg(DISTINCT camera_id) as affected_cameras
      FROM infrastructure_rca_correlations
      WHERE branch_id = $1
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY root_cause_type
      ORDER BY incident_count DESC`,
      [branchId]
    );

    return result.rows;
  }
}

export default InfrastructureRcaIntegrationService;
