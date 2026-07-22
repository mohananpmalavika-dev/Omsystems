/**
 * Maintenance Export API Routes
 * CSV and data export endpoints for alerts, reports, and health data
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import Papa from 'papaparse';

export async function registerMaintenanceExportRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  // ============================================================================
  // Export Alerts to CSV
  // ============================================================================

  app.get('/v1/maintenance/export/alerts', async (request, reply) => {
    const query = z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      severity: z.enum(['critical', 'warning', 'info']).optional(),
      category: z.string().optional(),
      status: z.enum(['active', 'acknowledged', 'resolved']).optional(),
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;

    try {
      // Fetch alerts from database
      const alerts = await store.getAlerts({
        tenantId,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        severity: query.severity,
        category: query.category,
        status: query.status,
      });

      // Format data for CSV
      const csvData = alerts.map((alert: any) => ({
        'Alert ID': alert.id.slice(0, 8),
        'Severity': alert.severity,
        'Category': alert.category,
        'Message': alert.message,
        'Source': alert.source,
        'Status': alert.status,
        'Created At': new Date(alert.createdAt).toLocaleString(),
        'Acknowledged At': alert.acknowledgedAt ? new Date(alert.acknowledgedAt).toLocaleString() : '',
        'Acknowledged By': alert.acknowledgedBy || '',
        'Resolved At': alert.resolvedAt ? new Date(alert.resolvedAt).toLocaleString() : '',
        'Resolved By': alert.resolvedBy || '',
        'Notes': alert.notes || '',
      }));

      // Generate CSV
      const csv = Papa.unparse(csvData);

      // Set response headers
      const filename = `alerts_export_${new Date().toISOString().split('T')[0]}.csv`;
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);

      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.alerts_exported',
        resourceNodeId: null,
        outcome: 'success',
        details: { count: alerts.length },
      });

      return csv;
    } catch (error) {
      app.log.error('Failed to export alerts:', error);
      return reply.code(500).send({ error: 'export_failed' });
    }
  });

  // ============================================================================
  // Export Work Orders to CSV
  // ============================================================================

  app.get('/v1/maintenance/export/work-orders', async (request, reply) => {
    const query = z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      status: z.string().optional(),
      severity: z.string().optional(),
      branchNodeId: z.string().uuid().optional(),
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;

    try {
      // Fetch work orders
      const workOrders = await store.getWorkOrders({
        tenantId,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        status: query.status,
        severity: query.severity,
        branchNodeId: query.branchNodeId,
      });

      // Format data for CSV
      const csvData = workOrders.map((wo: any) => ({
        'WO Number': wo.workOrderNumber,
        'Asset ID': wo.assetId?.slice(0, 8) || '',
        'Problem': wo.problem,
        'Severity': wo.severity,
        'Status': wo.status,
        'Created': new Date(wo.createdAt).toLocaleString(),
        'Assigned To': wo.assignedTo || '',
        'SLA Due': wo.slaDueAt ? new Date(wo.slaDueAt).toLocaleString() : '',
        'Resolved': wo.resolvedAt ? new Date(wo.resolvedAt).toLocaleString() : '',
        'Cost ($)': wo.cost || 0,
        'Root Cause': wo.rootCause || '',
      }));

      const csv = Papa.unparse(csvData);
      const filename = `work_orders_${new Date().toISOString().split('T')[0]}.csv`;

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);

      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.work_orders_exported',
        resourceNodeId: query.branchNodeId || null,
        outcome: 'success',
        details: { count: workOrders.length },
      });

      return csv;
    } catch (error) {
      app.log.error('Failed to export work orders:', error);
      return reply.code(500).send({ error: 'export_failed' });
    }
  });

  // ============================================================================
  // Export Camera Health to CSV
  // ============================================================================

  app.get('/v1/maintenance/export/camera-health', async (request, reply) => {
    const query = z.object({
      branchNodeId: z.string().uuid().optional(),
      status: z.enum(['healthy', 'warning', 'critical', 'offline']).optional(),
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;

    try {
      // Fetch camera health data
      const cameras = await store.getCameraHealth({
        tenantId,
        branchNodeId: query.branchNodeId,
        status: query.status,
      });

      // Format data for CSV
      const csvData = cameras.map((camera: any) => ({
        'Camera ID': camera.id.slice(0, 8),
        'Camera Name': camera.name,
        'Branch': camera.branchName || '',
        'Status': camera.status,
        'Uptime (%)': camera.uptime?.toFixed(2) || '0',
        'Last Seen': camera.lastSeen ? new Date(camera.lastSeen).toLocaleString() : '',
        'Frame Rate (fps)': camera.frameRate || 0,
        'Bitrate (kbps)': camera.bitrate || 0,
        'Resolution': camera.resolution || '',
        'Disk Usage (GB)': camera.diskUsage?.toFixed(2) || '0',
      }));

      const csv = Papa.unparse(csvData);
      const filename = `camera_health_${new Date().toISOString().split('T')[0]}.csv`;

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);

      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.camera_health_exported',
        resourceNodeId: query.branchNodeId || null,
        outcome: 'success',
        details: { count: cameras.length },
      });

      return csv;
    } catch (error) {
      app.log.error('Failed to export camera health:', error);
      return reply.code(500).send({ error: 'export_failed' });
    }
  });

  // ============================================================================
  // Export Storage Health to CSV
  // ============================================================================

  app.get('/v1/maintenance/export/storage-health', async (request, reply) => {
    const query = z.object({
      branchNodeId: z.string().uuid().optional(),
      status: z.enum(['healthy', 'warning', 'critical']).optional(),
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;

    try {
      const storage = await store.getStorageHealth({
        tenantId,
        branchNodeId: query.branchNodeId,
        status: query.status,
      });

      const csvData = storage.map((s: any) => ({
        'Storage ID': s.id.slice(0, 8),
        'Storage Name': s.name,
        'Branch': s.branchName || '',
        'Total Capacity (GB)': s.totalCapacity?.toFixed(2) || '0',
        'Used (GB)': s.usedCapacity?.toFixed(2) || '0',
        'Available (GB)': s.availableCapacity?.toFixed(2) || '0',
        'Usage (%)': s.usagePercent?.toFixed(2) || '0',
        'Status': s.status,
        'Days Left': s.estimatedDaysLeft || '',
        'Last Checked': s.lastChecked ? new Date(s.lastChecked).toLocaleString() : '',
      }));

      const csv = Papa.unparse(csvData);
      const filename = `storage_health_${new Date().toISOString().split('T')[0]}.csv`;

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);

      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.storage_health_exported',
        resourceNodeId: query.branchNodeId || null,
        outcome: 'success',
        details: { count: storage.length },
      });

      return csv;
    } catch (error) {
      app.log.error('Failed to export storage health:', error);
      return reply.code(500).send({ error: 'export_failed' });
    }
  });

  // ============================================================================
  // Export Maintenance Visits to CSV
  // ============================================================================

  app.get('/v1/maintenance/export/visits', async (request, reply) => {
    const query = z.object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      status: z.string().optional(),
      branchNodeId: z.string().uuid().optional(),
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;

    try {
      const visits = await store.getMaintenanceVisits({
        tenantId,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        status: query.status,
        branchNodeId: query.branchNodeId,
      });

      const csvData = visits.map((visit: any) => ({
        'Visit ID': visit.id.slice(0, 8),
        'Plan': visit.maintenancePlanName || '',
        'Branch': visit.branchName || '',
        'Due Date': new Date(visit.dueAt).toLocaleString(),
        'Completed Date': visit.visitedAt ? new Date(visit.visitedAt).toLocaleString() : '',
        'Status': visit.status,
        'Technician': visit.assignedTo || '',
        'Duration (min)': visit.duration || '',
        'Findings': visit.findings || '',
        'Notes': visit.notes || '',
      }));

      const csv = Papa.unparse(csvData);
      const filename = `maintenance_visits_${new Date().toISOString().split('T')[0]}.csv`;

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);

      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.visits_exported',
        resourceNodeId: query.branchNodeId || null,
        outcome: 'success',
        details: { count: visits.length },
      });

      return csv;
    } catch (error) {
      app.log.error('Failed to export visits:', error);
      return reply.code(500).send({ error: 'export_failed' });
    }
  });

  // ============================================================================
  // Export Custom Data (Generic)
  // ============================================================================

  app.post('/v1/maintenance/export/custom', async (request, reply) => {
    const body = z.object({
      data: z.array(z.record(z.any())),
      filename: z.string().min(1),
      headers: z.record(z.string()).optional(),
    }).parse(request.body);

    const tenantId = request.currentUser.tenantId;

    try {
      // Apply custom headers if provided
      const csvData = body.headers
        ? body.data.map(row => {
            const renamed: Record<string, any> = {};
            Object.keys(row).forEach(key => {
              const newKey = body.headers![key] || key;
              renamed[newKey] = row[key];
            });
            return renamed;
          })
        : body.data;

      const csv = Papa.unparse(csvData);

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="${body.filename}"`);

      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.custom_data_exported',
        resourceNodeId: null,
        outcome: 'success',
        details: { filename: body.filename, rows: body.data.length },
      });

      return csv;
    } catch (error) {
      app.log.error('Failed to export custom data:', error);
      return reply.code(500).send({ error: 'export_failed' });
    }
  });
}
