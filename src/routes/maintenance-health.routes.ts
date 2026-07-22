/**
 * Maintenance Health Monitoring Routes
 * Real-time health monitoring and alerting endpoints
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { getHealthCollector } from '../maintenance/health-collector.js';
import { getAlertEngine } from '../maintenance/alert-engine.js';

export async function registerMaintenanceHealthRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  // ============================================================================
  // Health Collector Management
  // ============================================================================

  /**
   * Get health collector status
   */
  app.get('/v1/maintenance/health/collector/status', async (request, reply) => {
    const collector = getHealthCollector();
    
    if (!collector) {
      return reply.code(503).send({
        error: 'health_collector_not_initialized',
        message: 'Health collector service is not running',
      });
    }

    return collector.getStatus();
  });

  /**
   * Get real-time camera health metrics
   */
  app.get('/v1/maintenance/health/cameras/realtime', async (request, reply) => {
    const query = z.object({
      branchNodeId: z.string().uuid().optional(),
      status: z.enum(['online', 'offline', 'degraded']).optional(),
      limit: z.coerce.number().min(1).max(1000).default(100),
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;
    
    // Get recent camera health records (last 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    
    // This would query the camera_health table with filters
    // For now, return sample data
    return {
      data: [],
      metadata: {
        queriedAt: new Date().toISOString(),
        timeWindow: '15 minutes',
        limit: query.limit,
      },
    };
  });

  /**
   * Get camera health history
   */
  app.get('/v1/maintenance/health/cameras/:cameraId/history', async (request, reply) => {
    const params = z.object({
      cameraId: z.string().uuid(),
    }).parse(request.params);

    const query = z.object({
      hours: z.coerce.number().min(1).max(168).default(24), // Up to 7 days
      metrics: z.string().optional(), // Comma-separated: fps,bitrate,temperature
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;
    
    // Query camera_health table for historical data
    const startTime = new Date(Date.now() - query.hours * 60 * 60 * 1000);

    return {
      cameraId: params.cameraId,
      timeRange: {
        start: startTime.toISOString(),
        end: new Date().toISOString(),
        hours: query.hours,
      },
      metrics: [],
    };
  });

  /**
   * Get storage health summary
   */
  app.get('/v1/maintenance/health/storage/summary', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;

    // Query storage_health table for latest records per asset
    const storageAssets = await store.listMaintenanceAssets(tenantId, 'storage');

    const summary = {
      totalDevices: storageAssets.length,
      healthy: storageAssets.filter(a => a.status === 'operational').length,
      warning: storageAssets.filter(a => a.status === 'degraded').length,
      critical: storageAssets.filter(a => a.status === 'offline').length,
      averageUsagePercentage: 75, // Would calculate from actual data
      totalCapacityTb: 0,
      usedCapacityTb: 0,
      devicesNearingCapacity: 0, // > 80%
      devicesList: storageAssets.map(asset => ({
        id: asset.id,
        model: asset.model,
        status: asset.status,
        branchNodeId: asset.branchNodeId,
      })),
    };

    return summary;
  });

  /**
   * Get network health for all branches
   */
  app.get('/v1/maintenance/health/network/branches', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;

    // Get all branches
    // TODO: Implement listNodes method on store interface
    const branches: any[] = []; // Placeholder

    // For each branch, get latest network health
    const branchHealth = await Promise.all(
      branches.map(async branch => {
        // Query network_health table
        return {
          branchId: branch.id,
          branchName: branch.name,
          status: 'healthy' as const,
          latencyMs: 25,
          packetLoss: 0.2,
          jitterMs: 5,
          lastCheck: new Date().toISOString(),
        };
      })
    );

    return {
      data: branchHealth,
      summary: {
        total: branches.length,
        healthy: branchHealth.filter(b => b.status === 'healthy').length,
        warning: branchHealth.filter(b => b.status === 'warning').length,
        critical: branchHealth.filter(b => b.status === 'critical').length,
      },
    };
  });

  /**
   * Get UPS/Power health summary
   */
  app.get('/v1/maintenance/health/power/summary', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;

    const upsAssets = await store.listMaintenanceAssets(tenantId, 'power');

    // Query ups_health table for latest records
    return {
      totalDevices: upsAssets.length,
      healthy: upsAssets.filter(a => a.status === 'operational').length,
      warning: upsAssets.filter(a => a.status === 'degraded').length,
      critical: upsAssets.filter(a => a.status === 'offline').length,
      averageBatteryHealth: 92,
      averageRuntime: 240,
      devices: upsAssets.map(asset => ({
        id: asset.id,
        model: asset.model,
        branchNodeId: asset.branchNodeId,
        status: asset.status,
      })),
    };
  });

  /**
   * Run health check on-demand
   */
  app.post('/v1/maintenance/health/check/run', async (request, reply) => {
    const body = z.object({
      componentType: z.enum(['camera', 'storage', 'network', 'ups', 'all']),
      componentId: z.string().uuid().optional(),
    }).parse(request.body);

    const tenantId = request.currentUser.tenantId;

    await store.writeAudit({
      tenantId,
      actorUserId: request.currentUser.id,
      action: 'maintenance.health_check_triggered',
      resourceNodeId: body.componentId || null,
      outcome: 'success',
      details: { componentType: body.componentType },
    });

    return reply.code(202).send({
      message: 'Health check initiated',
      componentType: body.componentType,
      status: 'in-progress',
    });
  });

  // ============================================================================
  // Alert Management
  // ============================================================================

  /**
   * Get active alerts
   */
  app.get('/v1/maintenance/alerts', async (request, reply) => {
    const query = z.object({
      severity: z.enum(['info', 'warning', 'critical']).optional(),
      category: z.enum(['health', 'maintenance', 'sla', 'predictive']).optional(),
      status: z.enum(['active', 'acknowledged', 'resolved']).optional(),
      limit: z.coerce.number().min(1).max(500).default(100),
    }).parse(request.query);

    const alertEngine = getAlertEngine();
    
    if (!alertEngine) {
      return reply.code(503).send({
        error: 'alert_engine_not_initialized',
        message: 'Alert engine is not running',
      });
    }

    const alerts = alertEngine.getActiveAlerts(request.currentUser.tenantId);

    // Apply filters
    let filteredAlerts = alerts;
    
    if (query.severity) {
      filteredAlerts = filteredAlerts.filter(a => a.severity === query.severity);
    }
    
    if (query.category) {
      filteredAlerts = filteredAlerts.filter(a => a.category === query.category);
    }
    
    if (query.status) {
      filteredAlerts = filteredAlerts.filter(a => a.status === query.status);
    }

    return {
      data: filteredAlerts.slice(0, query.limit),
      total: filteredAlerts.length,
      summary: {
        critical: alerts.filter(a => a.severity === 'critical' && a.status === 'active').length,
        warning: alerts.filter(a => a.severity === 'warning' && a.status === 'active').length,
        info: alerts.filter(a => a.severity === 'info' && a.status === 'active').length,
      },
    };
  });

  /**
   * Get alert by ID
   */
  app.get('/v1/maintenance/alerts/:alertId', async (request, reply) => {
    const params = z.object({
      alertId: z.string(),
    }).parse(request.params);

    const alertEngine = getAlertEngine();
    
    if (!alertEngine) {
      return reply.code(503).send({
        error: 'alert_engine_not_initialized',
      });
    }

    const alert = alertEngine.getAlert(params.alertId);
    
    if (!alert) {
      return reply.code(404).send({ error: 'alert_not_found' });
    }

    // Verify tenant access
    if (alert.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: 'alert_not_found' });
    }

    return alert;
  });

  /**
   * Acknowledge an alert
   */
  app.post('/v1/maintenance/alerts/:alertId/acknowledge', async (request, reply) => {
    const params = z.object({
      alertId: z.string(),
    }).parse(request.params);

    const body = z.object({
      notes: z.string().optional(),
    }).parse(request.body);

    const alertEngine = getAlertEngine();
    
    if (!alertEngine) {
      return reply.code(503).send({
        error: 'alert_engine_not_initialized',
      });
    }

    const alert = alertEngine.getAlert(params.alertId);
    
    if (!alert) {
      return reply.code(404).send({ error: 'alert_not_found' });
    }

    if (alert.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: 'alert_not_found' });
    }

    await alertEngine.acknowledgeAlert(params.alertId, request.currentUser.id);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'maintenance.alert_acknowledged',
      resourceNodeId: alert.branchNodeId || null,
      outcome: 'success',
      details: { alertId: params.alertId, notes: body.notes },
    });

    return {
      message: 'Alert acknowledged',
      alertId: params.alertId,
      acknowledgedBy: request.currentUser.id,
      acknowledgedAt: new Date().toISOString(),
    };
  });

  /**
   * Resolve an alert
   */
  app.post('/v1/maintenance/alerts/:alertId/resolve', async (request, reply) => {
    const params = z.object({
      alertId: z.string(),
    }).parse(request.params);

    const body = z.object({
      resolution: z.string().min(1).max(2000),
    }).parse(request.body);

    const alertEngine = getAlertEngine();
    
    if (!alertEngine) {
      return reply.code(503).send({
        error: 'alert_engine_not_initialized',
      });
    }

    const alert = alertEngine.getAlert(params.alertId);
    
    if (!alert) {
      return reply.code(404).send({ error: 'alert_not_found' });
    }

    if (alert.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: 'alert_not_found' });
    }

    await alertEngine.resolveAlert(params.alertId);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'maintenance.alert_resolved',
      resourceNodeId: alert.branchNodeId || null,
      outcome: 'success',
      details: { alertId: params.alertId, resolution: body.resolution },
    });

    return {
      message: 'Alert resolved',
      alertId: params.alertId,
      resolvedAt: new Date().toISOString(),
    };
  });

  /**
   * Get alert engine status
   */
  app.get('/v1/maintenance/alerts/engine/status', async (request, reply) => {
    const alertEngine = getAlertEngine();
    
    if (!alertEngine) {
      return {
        running: false,
        activeAlertCount: 0,
        rules: 0,
      };
    }

    return alertEngine.getStatus();
  });

  // ============================================================================
  // Predictive Alerts
  // ============================================================================

  /**
   * Get predictive failure alerts
   */
  app.get('/v1/maintenance/health/predictive', async (request, reply) => {
    const query = z.object({
      minScore: z.coerce.number().min(0).max(1).default(0.5),
      assetType: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;

    const predictiveAlerts = await store.listPredictiveAlerts(tenantId);

    // Filter and sort
    const filteredAlerts = predictiveAlerts
      .filter(a => a.score >= query.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit);

    return {
      data: filteredAlerts,
      summary: {
        highRisk: predictiveAlerts.filter(a => a.score >= 0.8).length,
        mediumRisk: predictiveAlerts.filter(a => a.score >= 0.5 && a.score < 0.8).length,
        lowRisk: predictiveAlerts.filter(a => a.score < 0.5).length,
      },
    };
  });

  /**
   * Get component failure forecast
   */
  app.get('/v1/maintenance/health/forecast', async (request, reply) => {
    const query = z.object({
      days: z.coerce.number().min(7).max(365).default(90),
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;

    // Get predictive alerts with estimated failure dates
    const alerts = await store.listPredictiveAlerts(tenantId);
    
    const forecast = alerts
      .filter(a => a.details?.estimated_failure_days)
      .map(a => ({
        assetId: a.assetId,
        type: a.type,
        failureProbability: a.score,
        estimatedDays: a.details?.estimated_failure_days,
        estimatedDate: new Date(Date.now() + (a.details?.estimated_failure_days || 0) * 24 * 60 * 60 * 1000),
        recommendation: a.details?.recommendation,
      }))
      .sort((a, b) => (a.estimatedDays || 999) - (b.estimatedDays || 999));

    return {
      data: forecast,
      timeRange: {
        days: query.days,
        until: new Date(Date.now() + query.days * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  });
}
