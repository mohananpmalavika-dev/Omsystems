/**
 * Maintenance Export API Routes
 * CSV and data export endpoints for alerts, reports, and health data
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import type { Action, Camera, User } from '../domain/models.js';
import Papa from 'papaparse';

const MAX_EXPORT_ROWS = 50_000;
const branchIdSchema = z.string().trim().min(1).max(200);
const dateRangeFields = {
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
};

function dateRangeSchema<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ...dateRangeFields, ...shape }).refine(
    ({ startDate, endDate }) => !startDate || !endDate || startDate <= endDate,
    { message: 'startDate must be before or equal to endDate', path: ['endDate'] },
  );
}

type ExportScope = {
  nodes: Awaited<ReturnType<ControlPlaneStore['listAccessibleNodes']>>;
  nodeIds: Set<string>;
  branchIds: Set<string>;
  tenantWide: boolean;
};

async function exportScope(
  store: ControlPlaneStore,
  user: User,
  action: Action,
): Promise<ExportScope> {
  const nodes = await store.listAccessibleNodes(user, action);
  return {
    nodes,
    nodeIds: new Set(nodes.map((node) => node.id)),
    branchIds: new Set(nodes.filter((node) => node.type === 'branch').map((node) => node.id)),
    tenantWide: nodes.some((node) => node.type === 'company'),
  };
}

function canAccessBranch(scope: ExportScope, branchId: string) {
  return scope.tenantWide || scope.nodeIds.has(branchId);
}

function invalidInput(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({
    error: 'invalid_export_request',
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

function forbidden(reply: FastifyReply) {
  return reply.code(403).send({ error: 'forbidden' });
}

function toCsv(rows: Array<Record<string, unknown>>) {
  return Papa.unparse(rows, { escapeFormulae: true });
}

function setCsvHeaders(reply: FastifyReply, filename: string) {
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
}

function exportFilename(prefix: string) {
  return `${prefix}_${new Date().toISOString().slice(0, 10)}.csv`;
}

function sanitizeFilename(value: string) {
  const leaf = value.split(/[\\/]/).pop() ?? 'export.csv';
  const cleaned = leaf.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 120);
  const filename = cleaned || 'export.csv';
  return filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
}

function isoOrEmpty(value: unknown) {
  if (typeof value !== 'string' && !(value instanceof Date)) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function numericMetric(metrics: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = metrics?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function textMetric(metrics: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = metrics?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function cameraHealthStatus(camera: Camera, metrics?: Record<string, unknown>) {
  const reported = textMetric(metrics, 'healthStatus', 'overallStatus', 'status')?.toLowerCase();
  if (reported && ['healthy', 'warning', 'critical', 'offline'].includes(reported)) return reported;
  if (camera.status === 'online') return 'healthy';
  if (camera.status === 'offline') return 'offline';
  return 'warning';
}

export async function registerMaintenanceExportRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  // ============================================================================
  // Export Alerts to CSV
  // ============================================================================

  app.get('/v1/maintenance/export/alerts', async (request, reply) => {
    const parsed = dateRangeSchema({
      severity: z.enum(['critical', 'warning', 'info']).optional(),
      category: z.string().trim().min(1).max(100).optional(),
      status: z.enum(['active', 'acknowledged', 'resolved']).optional(),
    }).safeParse(request.query);
    if (!parsed.success) return invalidInput(reply, parsed.error);
    const query = parsed.data;

    const tenantId = request.currentUser.tenantId;

    try {
      const scope = await exportScope(store, request.currentUser, 'analytics:export');
      if (scope.nodes.length === 0) return forbidden(reply);
      const cameraPage = await store.listAccessibleCameras(
        request.currentUser,
        'analytics:export',
        { limit: MAX_EXPORT_ROWS, offset: 0 },
      );
      const cameraById = new Map(cameraPage.cameras.map((camera) => [camera.id, camera]));
      const severityMatches = (severity: string) => {
        if (!query.severity) return true;
        if (query.severity === 'critical') return severity === 'P1';
        if (query.severity === 'warning') return severity === 'P2' || severity === 'P3';
        return severity === 'P4' || severity === 'P5';
      };
      const statusMatches = (status: string) => {
        if (!query.status) return true;
        if (query.status === 'acknowledged') return status === 'acknowledged';
        if (query.status === 'resolved') return status === 'resolved';
        return ['new', 'investigating', 'escalated'].includes(status);
      };
      const category = query.category?.toLowerCase();
      const alerts = (await store.listAnalyticsAlerts(tenantId, {
        from: query.startDate,
        to: query.endDate,
        limit: MAX_EXPORT_ROWS,
      }))
        .filter((alert) => cameraById.has(alert.cameraId))
        .filter((alert) => severityMatches(alert.severity))
        .filter((alert) => statusMatches(alert.status))
        .filter((alert) => !category ||
          alert.title.toLowerCase().includes(category) ||
          alert.objectClasses.some((item) => item.toLowerCase().includes(category))
        );

      // Format data for CSV
      const csvData = alerts.map((alert) => ({
        'Alert ID': alert.id,
        'Severity': alert.severity,
        'Category': alert.objectClasses.join(', '),
        'Message': alert.description ? `${alert.title}: ${alert.description}` : alert.title,
        'Source': cameraById.get(alert.cameraId)?.name ?? alert.cameraId,
        'Status': alert.status,
        'Created At': isoOrEmpty(alert.createdAt),
        'Acknowledged At': isoOrEmpty(alert.acknowledgedAt),
        'Acknowledged By': alert.acknowledgedBy || '',
        'Resolved At': isoOrEmpty(alert.resolvedAt),
        'Assigned To': alert.assignedTo || '',
        'Occurrences': alert.occurrenceCount,
        'Notes': alert.falseAlarmReason || '',
      }));

      // Generate CSV
      const csv = toCsv(csvData);

      // Set response headers
      const filename = exportFilename('alerts_export');
      setCsvHeaders(reply, filename);

      // Write audit log
      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.alerts_exported',
        resourceNodeId: null,
        outcome: 'success',
        details: { count: alerts.length, filename, filters: query },
      });

      return csv;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to export alerts');
      return reply.code(500).send({ error: 'export_failed' });
    }
  });

  // ============================================================================
  // Export Work Orders to CSV
  // ============================================================================

  app.get('/v1/maintenance/export/work-orders', async (request, reply) => {
    const parsed = dateRangeSchema({
      status: z.enum(['open', 'assigned', 'in_progress', 'resolved', 'closed']).optional(),
      severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
      branchNodeId: branchIdSchema.optional(),
    }).safeParse(request.query);
    if (!parsed.success) return invalidInput(reply, parsed.error);
    const query = parsed.data;

    const tenantId = request.currentUser.tenantId;

    try {
      const scope = await exportScope(store, request.currentUser, 'device:configure');
      if (scope.nodes.length === 0 ||
          (query.branchNodeId && !canAccessBranch(scope, query.branchNodeId))) {
        return forbidden(reply);
      }
      // Fetch work orders
      const workOrders = await store.listWorkOrders(tenantId);
      const filteredWorkOrders = workOrders.filter((wo) => {
        if (query.status && wo.status !== query.status) {
          return false;
        }
        if (query.severity && wo.severity !== query.severity) {
          return false;
        }
        if (query.branchNodeId && wo.branchNodeId !== query.branchNodeId) {
          return false;
        }
        if (!query.branchNodeId && wo.branchNodeId && !canAccessBranch(scope, wo.branchNodeId)) {
          return false;
        }
        if (!wo.branchNodeId && !scope.tenantWide) {
          return false;
        }
        if (query.startDate && new Date(wo.createdAt) < new Date(query.startDate)) {
          return false;
        }
        if (query.endDate && new Date(wo.createdAt) > new Date(query.endDate)) {
          return false;
        }
        return true;
      });

      // Format data for CSV
      const csvData = filteredWorkOrders.map((wo) => ({
        'WO Number': wo.workOrderNumber,
        'Asset ID': wo.assetId || '',
        'Problem': wo.problem,
        'Severity': wo.severity,
        'Status': wo.status,
        'Created': isoOrEmpty(wo.createdAt),
        'Assigned To': wo.technician || '',
        'SLA Due': isoOrEmpty(wo.slaDueAt),
        'Resolved': ['resolved', 'closed'].includes(wo.status) ? isoOrEmpty(wo.updatedAt) : '',
        'Cost ($)': wo.cost || 0,
        'Root Cause': wo.rootCause || '',
      }));

      const csv = toCsv(csvData);
      const filename = exportFilename('work_orders');

      setCsvHeaders(reply, filename);

      // Write audit log
      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.work_orders_exported',
        resourceNodeId: query.branchNodeId || null,
        outcome: 'success',
        details: { count: filteredWorkOrders.length, filename, filters: query },
      });

      return csv;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to export work orders');
      return reply.code(500).send({ error: 'export_failed' });
    }
  });

  // ============================================================================
  // Export Camera Health to CSV
  // ============================================================================

  app.get('/v1/maintenance/export/camera-health', async (request, reply) => {
    const parsed = z.object({
      branchNodeId: branchIdSchema.optional(),
      status: z.enum(['healthy', 'warning', 'critical', 'offline']).optional(),
    }).safeParse(request.query);
    if (!parsed.success) return invalidInput(reply, parsed.error);
    const query = parsed.data;

    const tenantId = request.currentUser.tenantId;

    try {
      const scope = await exportScope(store, request.currentUser, 'device:configure');
      if (scope.nodes.length === 0 ||
          (query.branchNodeId && !canAccessBranch(scope, query.branchNodeId))) {
        return forbidden(reply);
      }
      const cameraPage = await store.listAccessibleCameras(
        request.currentUser,
        'device:configure',
        {
          ...(query.branchNodeId ? { branchId: query.branchNodeId } : {}),
          limit: MAX_EXPORT_ROWS,
          offset: 0,
        },
      );
      const branchIds = [...new Set(cameraPage.cameras.map((camera) => camera.branchId))];
      const [branches, telemetry] = await Promise.all([
        store.listNodesByIds(branchIds),
        store.listLatestOperationalTelemetry(tenantId, branchIds),
      ]);
      const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
      const cameraTelemetry = new Map(
        telemetry
          .filter((item) => item.deviceType === 'camera')
          .map((item) => [item.deviceId, item]),
      );
      const cameras = cameraPage.cameras.filter((camera) => {
        const health = cameraHealthStatus(camera, cameraTelemetry.get(camera.id)?.metrics);
        return !query.status || health === query.status;
      });

      // Format data for CSV
      const csvData = cameras.map((camera) => {
        const observation = cameraTelemetry.get(camera.id);
        const profile = camera.profiles.find((item) => item.role === 'main') ?? camera.profiles[0];
        const metrics = observation?.metrics as Record<string, unknown> | undefined;
        const resolution = textMetric(metrics, 'resolution') ??
          (profile ? `${profile.width}x${profile.height}` : '');
        return {
        'Camera ID': camera.id,
        'Camera Name': camera.name,
        'Branch': branchNames.get(camera.branchId) ?? camera.branchId,
        'Status': cameraHealthStatus(camera, metrics),
        'Uptime (%)': numericMetric(metrics, 'uptimePercent') ?? '',
        'Last Seen': isoOrEmpty(observation?.observedAt ?? camera.lastSeenAt),
        'Frame Rate (fps)': numericMetric(metrics, 'fps', 'frameRate') ?? profile?.frameRate ?? '',
        'Bitrate (kbps)': numericMetric(metrics, 'bitrateKbps', 'bitrate') ?? profile?.bitrateKbps ?? '',
        'Resolution': resolution,
        'Packet Loss (%)': numericMetric(metrics, 'packetLossPercent', 'packetLoss') ?? '',
        };
      });

      const csv = toCsv(csvData);
      const filename = exportFilename('camera_health');

      setCsvHeaders(reply, filename);

      // Write audit log
      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.camera_health_exported',
        resourceNodeId: query.branchNodeId || null,
        outcome: 'success',
        details: { count: cameras.length, filename, filters: query },
      });

      return csv;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to export camera health');
      return reply.code(500).send({ error: 'export_failed' });
    }
  });

  // ============================================================================
  // Export Storage Health to CSV
  // ============================================================================

  app.get('/v1/maintenance/export/storage-health', async (request, reply) => {
    const parsed = z.object({
      branchNodeId: branchIdSchema.optional(),
      status: z.enum(['healthy', 'warning', 'critical', 'offline']).optional(),
    }).safeParse(request.query);
    if (!parsed.success) return invalidInput(reply, parsed.error);
    const query = parsed.data;

    const tenantId = request.currentUser.tenantId;

    try {
      const scope = await exportScope(store, request.currentUser, 'device:configure');
      if (scope.nodes.length === 0 ||
          (query.branchNodeId && !canAccessBranch(scope, query.branchNodeId))) {
        return forbidden(reply);
      }
      const storage = (await store.listRecordingStorageNodes(tenantId))
        .filter((node) => query.branchNodeId
          ? node.scopeNodeId === query.branchNodeId
          : node.scopeNodeId ? scope.nodeIds.has(node.scopeNodeId) : scope.tenantWide
        )
        .filter((node) => !query.status || node.status === query.status);
      const scopeNames = new Map(scope.nodes.map((node) => [node.id, node.name]));
      const gigabyte = 1024 ** 3;

      const csvData = storage.map((s) => ({
        'Storage ID': s.id,
        'Storage Name': s.name,
        'Branch': s.scopeNodeId ? scopeNames.get(s.scopeNodeId) ?? s.scopeNodeId : '',
        'Total Capacity (GB)': (s.capacityBytes / gigabyte).toFixed(2),
        'Used (GB)': (s.usedBytes / gigabyte).toFixed(2),
        'Available (GB)': (s.availableBytes / gigabyte).toFixed(2),
        'Usage (%)': s.capacityBytes > 0 ? ((s.usedBytes / s.capacityBytes) * 100).toFixed(2) : '0.00',
        'Status': s.status,
        'SMART Status': s.smart?.overallStatus ?? '',
        'RAID Status': s.raid?.status ?? '',
        'Last Write Probe': s.lastWriteProbe?.status ?? '',
        'Last Checked': isoOrEmpty(s.lastSeenAt),
      }));

      const csv = toCsv(csvData);
      const filename = exportFilename('storage_health');

      setCsvHeaders(reply, filename);

      // Write audit log
      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.storage_health_exported',
        resourceNodeId: query.branchNodeId || null,
        outcome: 'success',
        details: { count: storage.length, filename, filters: query },
      });

      return csv;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to export storage health');
      return reply.code(500).send({ error: 'export_failed' });
    }
  });

  // ============================================================================
  // Export Maintenance Visits to CSV
  // ============================================================================

  app.get('/v1/maintenance/export/visits', async (request, reply) => {
    const parsed = dateRangeSchema({
      status: z.string().trim().min(1).max(50).optional(),
      branchNodeId: branchIdSchema.optional(),
    }).safeParse(request.query);
    if (!parsed.success) return invalidInput(reply, parsed.error);
    const query = parsed.data;

    const tenantId = request.currentUser.tenantId;

    try {
      const scope = await exportScope(store, request.currentUser, 'device:configure');
      if (scope.nodes.length === 0 ||
          (query.branchNodeId && !canAccessBranch(scope, query.branchNodeId))) {
        return forbidden(reply);
      }
      const [visitCandidates, assets] = await Promise.all([
        store.listMaintenanceVisits(tenantId),
        store.listMaintenanceAssets(tenantId),
      ]);
      const assetBranches = new Map(assets.map((asset) => [asset.id, asset.branchNodeId]));
      const scopeNames = new Map(scope.nodes.map((node) => [node.id, node.name]));
      const visits = visitCandidates.filter((visit: any) => {
        const branchId = visit.branchNodeId ?? assetBranches.get(visit.assetId);
        if (query.branchNodeId && branchId !== query.branchNodeId) return false;
        if (!query.branchNodeId && branchId && !canAccessBranch(scope, branchId)) return false;
        if (!branchId && !scope.tenantWide) return false;
        if (query.status && visit.status !== query.status) return false;
        const dueAt = isoOrEmpty(visit.dueAt);
        if (query.startDate && dueAt < query.startDate) return false;
        if (query.endDate && dueAt > query.endDate) return false;
        return true;
      });

      const csvData = visits.map((visit: any) => ({
        'Visit ID': visit.id,
        'Plan': visit.maintenancePlanName || visit.planId || visit.scheduleId || '',
        'Branch': visit.branchName || scopeNames.get(
          visit.branchNodeId ?? assetBranches.get(visit.assetId) ?? '',
        ) || '',
        'Due Date': isoOrEmpty(visit.dueAt),
        'Completed Date': isoOrEmpty(visit.visitedAt),
        'Status': visit.status,
        'Technician': visit.assignedTo || visit.technician || '',
        'Duration (min)': visit.duration || '',
        'Findings': visit.findings || '',
        'Notes': visit.notes || '',
      }));

      const csv = toCsv(csvData);
      const filename = exportFilename('maintenance_visits');

      setCsvHeaders(reply, filename);

      // Write audit log
      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.visits_exported',
        resourceNodeId: query.branchNodeId || null,
        outcome: 'success',
        details: { count: visits.length, filename, filters: query },
      });

      return csv;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to export visits');
      return reply.code(500).send({ error: 'export_failed' });
    }
  });

  // ============================================================================
  // Export Custom Data (Generic)
  // ============================================================================

  app.post('/v1/maintenance/export/custom', async (request, reply) => {
    const parsed = z.object({
      data: z.array(z.record(z.string(), z.unknown())).max(MAX_EXPORT_ROWS),
      filename: z.string().trim().min(1).max(200),
      headers: z.record(z.string(), z.string().trim().min(1).max(200)).optional(),
    }).safeParse(request.body);
    if (!parsed.success) return invalidInput(reply, parsed.error);
    const body = parsed.data;

    const tenantId = request.currentUser.tenantId;

    try {
      const scope = await exportScope(store, request.currentUser, 'device:configure');
      if (scope.nodes.length === 0) return forbidden(reply);
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

      const csv = toCsv(csvData);
      const filename = sanitizeFilename(body.filename);

      setCsvHeaders(reply, filename);

      // Write audit log
      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.custom_data_exported',
        resourceNodeId: null,
        outcome: 'success',
        details: { count: body.data.length, filename },
      });

      return csv;
    } catch (error: any) {
      app.log.error({ error }, 'Failed to export custom data');
      return reply.code(500).send({ error: 'export_failed' });
    }
  });
}
