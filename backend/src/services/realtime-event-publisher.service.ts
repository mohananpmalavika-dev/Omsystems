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

    // Monitor camera quality metrics (every 10 seconds)
    this.pollingIntervals.push(
      setInterval(() => this.checkCameraQualityMetrics(), 10000)
    );

    // Monitor camera quality alerts (every 5 seconds)
    this.pollingIntervals.push(
      setInterval(() => this.checkCameraQualityAlerts(), 5000)
    );

    // Monitor frozen streams (every 30 seconds)
    this.pollingIntervals.push(
      setInterval(() => this.checkFrozenStreams(), 30000)
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
          c.id::text,
          c.branch_node_id::text as branch_id,
          rn.name,
          c.status,
          c.last_seen_at,
          latest.current_fps,
          latest.current_bitrate,
          latest.packet_loss,
          latest.latency_ms,
          latest.stream_active,
          latest.video_loss,
          latest.image_frozen,
          latest.black_screen,
          b.tenant_id::text,
          branch_node.name as branch_name,
          branch_node.metadata->>'region' as region
        FROM cameras c
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        JOIN resource_nodes branch_node ON branch_node.id = c.branch_node_id
        LEFT JOIN LATERAL (
          SELECT *
          FROM camera_health_history
          WHERE camera_id = c.id
          ORDER BY timestamp DESC
          LIMIT 1
        ) latest ON true
        WHERE (c.last_seen_at >= NOW() - INTERVAL '15 seconds'
          OR latest.timestamp >= NOW() - INTERVAL '15 seconds')
        LIMIT 100
      `;

      const result = await this.pool.query(query);

      // Group by tenant and branch
      const tenantUpdates = new Map<string, Map<string, any[]>>();
      
      result.rows.forEach(camera => {
        const tenantId = camera.tenant_id;
        const branchId = camera.branch_id;
        
        if (!tenantUpdates.has(tenantId)) {
          tenantUpdates.set(tenantId, new Map());
        }
        const branchUpdates = tenantUpdates.get(tenantId)!;
        
        if (!branchUpdates.has(branchId)) {
          branchUpdates.set(branchId, []);
        }
        
        branchUpdates.get(branchId)!.push({
          id: camera.id,
          name: camera.name,
          status: camera.status,
          lastSeen: camera.last_seen_at,
          currentFps: camera.current_fps,
          currentBitrate: camera.current_bitrate,
          packetLoss: camera.packet_loss,
          latencyMs: camera.latency_ms,
          streamActive: camera.stream_active,
          videoLoss: camera.video_loss,
          imageFrozen: camera.image_frozen,
          blackScreen: camera.black_screen
        });
      });

      // Send updates per tenant per branch
      tenantUpdates.forEach((branchUpdates, tenantId) => {
        branchUpdates.forEach((cameras, branchId) => {
          const firstCamera = result.rows.find(c => c.branch_id === branchId);
          if (firstCamera) {
            this.wsManager.sendCameraStatusUpdate(tenantId, branchId, {
              branchId,
              branchName: firstCamera.branch_name,
              region: firstCamera.region,
              cameras,
              updatedAt: new Date()
            });
          }
        });
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

  /**
   * Check for camera quality metrics updates
   */
  private async checkCameraQualityMetrics() {
    try {
      const query = `
        SELECT 
          c.id::text as camera_id,
          c.branch_node_id::text as branch_id,
          rn.name as camera_name,
          latest.current_fps,
          latest.current_bitrate,
          latest.packet_loss,
          latest.latency_ms,
          latest.stream_active,
          latest.timestamp,
          (c.profiles->0->>'frameRate')::float as expected_fps,
          b.tenant_id::text,
          branch_node.name as branch_name
        FROM cameras c
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        JOIN resource_nodes branch_node ON branch_node.id = c.branch_node_id
        LEFT JOIN LATERAL (
          SELECT *
          FROM camera_health_history
          WHERE camera_id = c.id
            AND current_fps IS NOT NULL
          ORDER BY timestamp DESC
          LIMIT 1
        ) latest ON true
        WHERE latest.timestamp >= NOW() - INTERVAL '15 seconds'
          AND c.status IN ('online', 'warning', 'degraded')
        LIMIT 100
      `;

      const result = await this.pool.query(query);

      // Group by tenant and branch
      const tenantUpdates = new Map<string, Map<string, any[]>>();
      
      result.rows.forEach(row => {
        const tenantId = row.tenant_id;
        const branchId = row.branch_id;
        
        if (!tenantUpdates.has(tenantId)) {
          tenantUpdates.set(tenantId, new Map());
        }
        const branchUpdates = tenantUpdates.get(tenantId)!;
        
        if (!branchUpdates.has(branchId)) {
          branchUpdates.set(branchId, []);
        }
        
        // Calculate quality score
        const fpsQuality = row.current_fps >= row.expected_fps * 0.9 ? 100 : 
                           row.current_fps >= row.expected_fps * 0.8 ? 80 : 60;
        const packetLossQuality = row.packet_loss <= 1 ? 100 :
                                   row.packet_loss <= 3 ? 80 : 60;
        const latencyQuality = row.latency_ms <= 100 ? 100 :
                               row.latency_ms <= 200 ? 80 : 60;
        const overallQuality = Math.round((fpsQuality + packetLossQuality + latencyQuality) / 3);
        
        branchUpdates.get(branchId)!.push({
          cameraId: row.camera_id,
          cameraName: row.camera_name,
          currentFps: row.current_fps,
          expectedFps: row.expected_fps,
          currentBitrate: row.current_bitrate,
          packetLoss: row.packet_loss,
          latencyMs: row.latency_ms,
          streamActive: row.stream_active,
          qualityScore: overallQuality,
          timestamp: row.timestamp
        });
      });

      // Send quality updates per branch
      tenantUpdates.forEach((branchUpdates, tenantId) => {
        branchUpdates.forEach((qualityMetrics, branchId) => {
          const firstMetric = result.rows.find(r => r.branch_id === branchId);
          if (firstMetric) {
            this.wsManager.broadcast(tenantId, `branch:${branchId}`, {
              type: 'camera_quality_metrics',
              data: {
                branchId,
                branchName: firstMetric.branch_name,
                metrics: qualityMetrics,
                updatedAt: new Date()
              },
              timestamp: new Date()
            });
          }
        });
      });
    } catch (error) {
      console.error('Error checking camera quality metrics:', error);
    }
  }

  /**
   * Check for camera quality alerts
   */
  private async checkCameraQualityAlerts() {
    try {
      const query = `
        SELECT 
          cqa.*,
          rn.name as camera_name,
          branch_node.name as branch_name,
          branch_node.metadata->>'region' as region
        FROM camera_quality_alerts cqa
        JOIN cameras c ON c.id = cqa.camera_id
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        JOIN resource_nodes branch_node ON branch_node.id = cqa.branch_id
        WHERE cqa.status = 'active'
          AND cqa.detected_at >= NOW() - INTERVAL '10 seconds'
        ORDER BY cqa.detected_at DESC
        LIMIT 50
      `;

      const result = await this.pool.query(query);

      result.rows.forEach(alert => {
        this.wsManager.sendAlert(alert.tenant_id, {
          id: alert.id,
          alertType: 'camera_quality',
          severity: alert.severity,
          cameraId: alert.camera_id,
          cameraName: alert.camera_name,
          branchId: alert.branch_id,
          branchName: alert.branch_name,
          region: alert.region,
          title: alert.title,
          message: alert.message,
          qualityType: alert.alert_type,
          fpsAtAlert: alert.fps_at_alert,
          bitrateAtAlert: alert.bitrate_at_alert,
          packetLossAtAlert: alert.packet_loss_at_alert,
          latencyAtAlert: alert.latency_at_alert,
          detectedAt: alert.detected_at
        });
      });
    } catch (error) {
      console.error('Error checking camera quality alerts:', error);
    }
  }

  /**
   * Check for frozen streams
   * Detects cameras where FPS has dropped significantly or video feed appears frozen
   */
  private async checkFrozenStreams() {
    try {
      const query = `
        WITH recent_fps AS (
          SELECT 
            camera_id,
            current_fps,
            timestamp,
            LAG(current_fps, 5) OVER (PARTITION BY camera_id ORDER BY timestamp) as fps_5_checks_ago
          FROM camera_health_history
          WHERE timestamp >= NOW() - INTERVAL '5 minutes'
            AND current_fps IS NOT NULL
        ),
        frozen_candidates AS (
          SELECT DISTINCT ON (camera_id)
            camera_id,
            current_fps,
            fps_5_checks_ago,
            timestamp
          FROM recent_fps
          WHERE ABS(current_fps - fps_5_checks_ago) < 0.5  -- FPS hasn't changed
            AND current_fps < 5  -- Very low FPS
          ORDER BY camera_id, timestamp DESC
        )
        SELECT 
          fc.camera_id::text,
          c.branch_node_id::text as branch_id,
          rn.name as camera_name,
          fc.current_fps,
          (c.profiles->0->>'frameRate')::float as expected_fps,
          b.tenant_id::text,
          branch_node.name as branch_name,
          branch_node.metadata->>'region' as region
        FROM frozen_candidates fc
        JOIN cameras c ON c.id = fc.camera_id
        JOIN resource_nodes rn ON rn.id = c.resource_node_id
        JOIN resource_nodes branch_node ON branch_node.id = c.branch_node_id
        WHERE c.status IN ('online', 'warning')
          AND fc.timestamp >= NOW() - INTERVAL '35 seconds'
        LIMIT 50
      `;

      const result = await this.pool.query(query);

      // Send frozen stream alerts
      result.rows.forEach(camera => {
        // Update camera_health_history with frozen flag
        this.pool.query(
          `UPDATE camera_health_history 
           SET image_frozen = true 
           WHERE camera_id = $1::uuid 
           AND timestamp >= NOW() - INTERVAL '1 minute'`,
          [camera.camera_id]
        ).catch(err => console.error('Failed to update frozen flag:', err));

        // Send alert
        this.wsManager.sendAlert(camera.tenant_id, {
          id: `frozen-${camera.camera_id}-${Date.now()}`,
          alertType: 'camera_quality',
          severity: 'high',
          cameraId: camera.camera_id,
          cameraName: camera.camera_name,
          branchId: camera.branch_id,
          branchName: camera.branch_name,
          region: camera.region,
          title: 'Frozen Video Stream Detected',
          message: `Camera ${camera.camera_name} appears to have a frozen video stream (FPS: ${camera.current_fps?.toFixed(1)} / ${camera.expected_fps})`,
          qualityType: 'frozen_frame',
          fpsAtAlert: camera.current_fps,
          detectedAt: new Date()
        });
      });

      if (result.rows.length > 0) {
        console.log(`Detected ${result.rows.length} potentially frozen camera streams`);
      }
    } catch (error) {
      console.error('Error checking frozen streams:', error);
    }
  }
}
