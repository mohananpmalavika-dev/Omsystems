/**
 * Real-time Event Publisher Service
 * Monitors database changes and publishes WebSocket updates
 */

import { Pool } from 'pg';
import { WebSocketManager } from './websocket-manager.service';

export class RealtimeEventPublisher {
  private pool: Pool;
  private wsManager: WebSocketManager;
  private pollingIntervals: NodeJS.Timeout[] = [];

  constructor(pool: Pool, wsManager: WebSocketManager) {
    this.pool = pool;
    this.wsManager = wsManager;
  }

  /**
   * Start monitoring for real-time updates
   */
  public start() {
    console.log('Starting real-time event publisher...');

    // Monitor operational alerts (every 5 seconds)
    this.pollingIntervals.push(
      setInterval(() => this.checkNewAlerts(), 5000)
    );

    // Monitor incidents (every 5 seconds)
    this.pollingIntervals.push(
      setInterval(() => this.checkNewIncidents(), 5000)
    );

    // Monitor camera status changes (every 10 seconds)
    this.pollingIntervals.push(
      setInterval(() => this.checkCameraStatusChanges(), 10000)
    );

    // Monitor branch health updates (every 30 seconds)
    this.pollingIntervals.push(
      setInterval(() => this.checkBranchHealthUpdates(), 30000)
    );

    // Monitor edge agent status (every 15 seconds)
    this.pollingIntervals.push(
      setInterval(() => this.checkEdgeAgentStatus(), 15000)
    );

    // Monitor storage alerts (every 60 seconds)
    this.pollingIntervals.push(
      setInterval(() => this.checkStorageAlerts(), 60000)
    );

    console.log('Real-time event publisher started');
  }

  /**
   * Stop monitoring
   */
  public stop() {
    console.log('Stopping real-time event publisher...');
    this.pollingIntervals.forEach(interval => clearInterval(interval));
    this.pollingIntervals = [];
    console.log('Real-time event publisher stopped');
  }

  /**
   * Check for new operational alerts
   */
  private async checkNewAlerts() {
    try {
      const query = `
        SELECT 
          oa.*,
          b.name as branch_name,
          b.region
        FROM operational_alerts oa
        LEFT JOIN branches b ON b.id = oa.branch_id
        WHERE oa.status = 'active'
          AND oa.detected_at >= NOW() - INTERVAL '10 seconds'
        ORDER BY oa.detected_at DESC
        LIMIT 50
      `;

      const result = await this.pool.query(query);

      result.rows.forEach(alert => {
        this.wsManager.sendAlert(alert.tenant_id, {
          id: alert.id,
          severity: alert.severity,
          componentType: alert.component_type,
          title: alert.title,
          description: alert.description,
          branchId: alert.branch_id,
          branchName: alert.branch_name,
          region: alert.region,
          detectedAt: alert.detected_at
        });
      });
    } catch (error) {
      console.error('Error checking new alerts:', error);
    }
  }

  /**
   * Check for new incidents
   */
  private async checkNewIncidents() {
    try {
      const query = `
        SELECT 
          i.*,
          on.name as branch_name,
          on.metadata->>'region' as region
        FROM incidents i
        LEFT JOIN organization_nodes on ON i.branch_node_id = on.id
        WHERE i.occurred_at >= NOW() - INTERVAL '10 seconds'
        ORDER BY i.occurred_at DESC
        LIMIT 50
      `;

      const result = await this.pool.query(query);

      result.rows.forEach(incident => {
        this.wsManager.sendIncident(incident.tenant_id, {
          id: incident.id,
          incidentNumber: incident.incident_number,
          severity: incident.severity,
          incidentType: incident.incident_type,
          status: incident.status,
          branchId: incident.branch_node_id,
          branchName: incident.branch_name,
          region: incident.region,
          occurredAt: incident.occurred_at
        });
      });
    } catch (error) {
      console.error('Error checking new incidents:', error);
    }
  }

  /**
   * Check for camera status changes
   */
  private async checkCameraStatusChanges() {
    try {
      const query = `
        SELECT 
          c.id,
          c.branch_id,
          c.name,
          c.online_status,
          c.recording_status,
          c.health_score,
          c.last_heartbeat,
          b.name as branch_name,
          b.region,
          b.tenant_id
        FROM cameras c
        JOIN branches b ON b.id = c.branch_id
        WHERE c.updated_at >= NOW() - INTERVAL '15 seconds'
          AND c.status = 'active'
        LIMIT 100
      `;

      const result = await this.pool.query(query);

      // Group by branch
      const branchUpdates = new Map<string, any[]>();
      
      result.rows.forEach(camera => {
        if (!branchUpdates.has(camera.branch_id)) {
          branchUpdates.set(camera.branch_id, []);
        }
        branchUpdates.get(camera.branch_id)!.push({
          id: camera.id,
          name: camera.name,
          onlineStatus: camera.online_status,
          recordingStatus: camera.recording_status,
          healthScore: camera.health_score,
          lastHeartbeat: camera.last_heartbeat
        });
      });

      // Send updates per branch
      branchUpdates.forEach((cameras, branchId) => {
        const firstCamera = result.rows.find(c => c.branch_id === branchId);
        if (firstCamera) {
          this.wsManager.sendCameraStatusUpdate(firstCamera.tenant_id, branchId, {
            branchId,
            branchName: firstCamera.branch_name,
            region: firstCamera.region,
            cameras,
            updatedAt: new Date()
          });
        }
      });
    } catch (error) {
      console.error('Error checking camera status changes:', error);
    }
  }

  /**
   * Check for branch health score updates
   */
  private async checkBranchHealthUpdates() {
    try {
      const query = `
        SELECT 
          bhs.*,
          b.name as branch_name,
          b.region
        FROM branch_health_scores bhs
        JOIN branches b ON b.id = bhs.branch_id
        WHERE bhs.calculated_at >= NOW() - INTERVAL '35 seconds'
        ORDER BY bhs.calculated_at DESC
        LIMIT 100
      `;

      const result = await this.pool.query(query);

      result.rows.forEach(score => {
        this.wsManager.sendBranchHealthUpdate(score.tenant_id, score.branch_id, {
          branchId: score.branch_id,
          branchName: score.branch_name,
          region: score.region,
          overallScore: score.overall_score,
          overallStatus: score.overall_status,
          components: {
            camera: { score: score.camera_score, status: score.camera_status },
            recording: { score: score.recording_score, status: score.recording_status },
            storage: { score: score.storage_score, status: score.storage_status },
            network: { score: score.network_score, status: score.network_status },
            power: { score: score.power_score, status: score.power_status },
            edgeAgent: { score: score.edge_agent_score, status: score.edge_agent_status }
          },
          calculatedAt: score.calculated_at
        });
      });
    } catch (error) {
      console.error('Error checking branch health updates:', error);
    }
  }

  /**
   * Check for edge agent status changes
   */
  private async checkEdgeAgentStatus() {
    try {
      const query = `
        SELECT 
          ea.*,
          b.name as branch_name,
          b.region,
          b.tenant_id
        FROM edge_agents ea
        JOIN branches b ON b.id = ea.branch_id
        WHERE ea.last_heartbeat >= NOW() - INTERVAL '20 seconds'
          OR ea.updated_at >= NOW() - INTERVAL '20 seconds'
        LIMIT 100
      `;

      const result = await this.pool.query(query);

      result.rows.forEach(agent => {
        this.wsManager.sendEdgeAgentUpdate(agent.tenant_id, agent.branch_id, {
          agentId: agent.id,
          branchId: agent.branch_id,
          branchName: agent.branch_name,
          region: agent.region,
          status: agent.status,
          version: agent.version,
          cpuUsage: agent.cpu_usage,
          memoryUsage: agent.memory_usage,
          diskUsage: agent.disk_usage,
          uptimeSeconds: agent.uptime_seconds,
          lastHeartbeat: agent.last_heartbeat,
          pendingUploads: agent.pending_uploads
        });
      });
    } catch (error) {
      console.error('Error checking edge agent status:', error);
    }
  }

  /**
   * Check for storage alerts
   */
  private async checkStorageAlerts() {
    try {
      const query = `
        SELECT 
          ss.*,
          b.name as branch_name,
          b.region,
          b.tenant_id
        FROM storage_status ss
        JOIN branches b ON b.id = ss.branch_id
        WHERE (
          ss.usage_percent > 85
          OR ss.raid_status = 'degraded'
          OR ss.mount_status = 'unmounted'
        )
        AND ss.last_check >= NOW() - INTERVAL '65 seconds'
        LIMIT 50
      `;

      const result = await this.pool.query(query);

      result.rows.forEach(storage => {
        this.wsManager.sendStorageAlert(storage.tenant_id, storage.branch_id, {
          branchId: storage.branch_id,
          branchName: storage.branch_name,
          region: storage.region,
          usagePercent: storage.usage_percent,
          totalCapacity: storage.total_capacity_bytes,
          usedCapacity: storage.used_capacity_bytes,
          availableCapacity: storage.available_capacity_bytes,
          retentionDays: storage.retention_days_available,
          raidStatus: storage.raid_status,
          mountStatus: storage.mount_status,
          alertType: storage.usage_percent > 90 ? 'critical' : 'warning'
        });
      });
    } catch (error) {
      console.error('Error checking storage alerts:', error);
    }
  }
}
