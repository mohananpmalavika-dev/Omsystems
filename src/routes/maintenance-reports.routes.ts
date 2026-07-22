/**
 * Maintenance Reports API Routes
 * PDF, Excel, and scheduled report generation
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { initReportingEngine, type ReportConfig } from '../maintenance/reporting-engine.js';
import { initScheduledReportsService, type ScheduledReportConfig } from '../maintenance/scheduled-reports.js';
import { v4 as uuidv4 } from 'uuid';

export async function registerMaintenanceReportsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  // ============================================================================
  // Report Generation
  // ============================================================================

  /**
   * Generate a report
   */
  app.post('/v1/maintenance/reports/generate', async (request, reply) => {
    const body = z.object({
      reportType: z.enum([
        'preventive-maintenance',
        'corrective-maintenance',
        'amc-performance',
        'vendor-performance',
        'sla-compliance',
        'health-summary',
        'cost-analysis',
        'capacity-forecast',
        'predictive-summary',
      ]),
      title: z.string().min(1).max(200),
      periodStart: z.string().datetime(),
      periodEnd: z.string().datetime(),
      format: z.enum(['pdf', 'excel', 'json']),
      filters: z.object({
        branchNodeId: z.string().uuid().optional(),
        assetId: z.string().uuid().optional(),
        vendorId: z.string().uuid().optional(),
        severity: z.string().optional(),
      }).optional(),
      includeCharts: z.boolean().default(false),
      includeDetails: z.boolean().default(true),
    }).parse(request.body);

    const tenantId = request.currentUser.tenantId;

    // Validate period
    const start = new Date(body.periodStart);
    const end = new Date(body.periodEnd);

    if (end <= start) {
      return reply.code(400).send({
        error: 'invalid_period',
        message: 'Period end must be after period start',
      });
    }

    // Maximum 1 year period
    const maxPeriod = 365 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > maxPeriod) {
      return reply.code(400).send({
        error: 'period_too_long',
        message: 'Maximum report period is 1 year',
      });
    }

    const config: ReportConfig = {
      id: uuidv4(),
      tenantId,
      reportType: body.reportType,
      title: body.title,
      periodStart: start,
      periodEnd: end,
      filters: body.filters,
      format: body.format,
      includeCharts: body.includeCharts,
      includeDetails: body.includeDetails,
      generatedBy: request.currentUser.id,
      generatedAt: new Date(),
    };

    try {
      const reportingEngine = initReportingEngine(store, app.log);
      const report = await reportingEngine.generateReport(config);

      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.report_generated',
        resourceNodeId: body.filters?.branchNodeId || null,
        outcome: 'success',
        details: {
          reportId: report.reportId,
          reportType: body.reportType,
          format: body.format,
        },
      });

      return reply.code(201).send(report);
    } catch (error) {
      app.log.error('Failed to generate report:', error);
      
      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.report_generated',
        resourceNodeId: body.filters?.branchNodeId || null,
        outcome: 'failure',
        details: {
          reportType: body.reportType,
          error: String(error),
        },
      });

      return reply.code(500).send({
        error: 'report_generation_failed',
        message: 'Failed to generate report',
      });
    }
  });

  /**
   * Get generated report
   */
  app.get('/v1/maintenance/reports/:reportId', async (request, reply) => {
    const params = z.object({
      reportId: z.string().uuid(),
    }).parse(request.params);

    const reportingEngine = initReportingEngine(store, app.log);
    const report = reportingEngine.getReport(params.reportId);

    if (!report) {
      return reply.code(404).send({ error: 'report_not_found' });
    }

    // Verify tenant access
    if (report.config.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: 'report_not_found' });
    }

    return report;
  });

  /**
   * List generated reports
   */
  app.get('/v1/maintenance/reports', async (request, reply) => {
    const query = z.object({
      reportType: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
    }).parse(request.query);

    const tenantId = request.currentUser.tenantId;

    const reportingEngine = initReportingEngine(store, app.log);
    let reports = reportingEngine.listReports();

    // Filter by tenant
    reports = reports.filter(r => r.config.tenantId === tenantId);

    // Filter by type
    if (query.reportType) {
      reports = reports.filter(r => r.config.reportType === query.reportType);
    }

    // Sort by generation date (newest first)
    reports.sort((a, b) => 
      b.config.generatedAt.getTime() - a.config.generatedAt.getTime()
    );

    return {
      data: reports.slice(0, query.limit),
      total: reports.length,
    };
  });

  /**
   * Download report file
   */
  app.get('/v1/maintenance/reports/:reportId/download', async (request, reply) => {
    const params = z.object({
      reportId: z.string().uuid(),
    }).parse(request.params);

    const reportingEngine = initReportingEngine(store, app.log);
    const report = reportingEngine.getReport(params.reportId);

    if (!report) {
      return reply.code(404).send({ error: 'report_not_found' });
    }

    if (report.config.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: 'report_not_found' });
    }

    // In production, stream from file system or object storage
    return reply.code(501).send({
      error: 'not_implemented',
      message: 'Report download requires file storage configuration',
    });
  });

  // ============================================================================
  // Scheduled Reports
  // ============================================================================

  /**
   * Create scheduled report
   */
  app.post('/v1/maintenance/reports/scheduled', async (request, reply) => {
    const body = z.object({
      reportType: z.enum([
        'preventive-maintenance',
        'corrective-maintenance',
        'amc-performance',
        'vendor-performance',
        'sla-compliance',
        'health-summary',
        'cost-analysis',
        'capacity-forecast',
        'predictive-summary',
      ]),
      title: z.string().min(1).max(200),
      schedule: z.string().min(1), // Cron expression
      format: z.enum(['pdf', 'excel', 'both']),
      recipients: z.array(z.string().email()).min(1),
      filters: z.object({
        branchNodeId: z.string().uuid().optional(),
        assetId: z.string().uuid().optional(),
        vendorId: z.string().uuid().optional(),
        severity: z.string().optional(),
      }).optional(),
      includeCharts: z.boolean().default(false),
      includeDetails: z.boolean().default(true),
      enabled: z.boolean().default(true),
    }).parse(request.body);

    const tenantId = request.currentUser.tenantId;

    const config: Omit<ScheduledReportConfig, 'id' | 'createdAt' | 'nextRun'> = {
      tenantId,
      reportType: body.reportType,
      title: body.title,
      schedule: body.schedule,
      format: body.format,
      recipients: body.recipients,
      filters: body.filters,
      includeCharts: body.includeCharts,
      includeDetails: body.includeDetails,
      enabled: body.enabled,
      createdBy: request.currentUser.id,
    };

    try {
      const scheduledReportsService = initScheduledReportsService(store, app.log);
      const scheduledReport = await scheduledReportsService.createScheduledReport(config);

      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.scheduled_report_created',
        resourceNodeId: null,
        outcome: 'success',
        details: {
          scheduledReportId: scheduledReport.id,
          reportType: body.reportType,
          schedule: body.schedule,
        },
      });

      return reply.code(201).send(scheduledReport);
    } catch (error) {
      app.log.error('Failed to create scheduled report:', error);
      
      return reply.code(400).send({
        error: 'invalid_schedule',
        message: String(error),
      });
    }
  });

  /**
   * Get scheduled report
   */
  app.get('/v1/maintenance/reports/scheduled/:id', async (request, reply) => {
    const params = z.object({
      id: z.string().uuid(),
    }).parse(request.params);

    const scheduledReportsService = initScheduledReportsService(store, app.log);
    const scheduledReport = scheduledReportsService.getScheduledReport(params.id);

    if (!scheduledReport) {
      return reply.code(404).send({ error: 'scheduled_report_not_found' });
    }

    if (scheduledReport.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: 'scheduled_report_not_found' });
    }

    return scheduledReport;
  });

  /**
   * List scheduled reports
   */
  app.get('/v1/maintenance/reports/scheduled', async (request, reply) => {
    const tenantId = request.currentUser.tenantId;

    const scheduledReportsService = initScheduledReportsService(store, app.log);
    const scheduledReports = scheduledReportsService.listScheduledReports(tenantId);

    return {
      data: scheduledReports,
      total: scheduledReports.length,
    };
  });

  /**
   * Update scheduled report
   */
  app.patch('/v1/maintenance/reports/scheduled/:id', async (request, reply) => {
    const params = z.object({
      id: z.string().uuid(),
    }).parse(request.params);

    const body = z.object({
      title: z.string().min(1).max(200).optional(),
      schedule: z.string().min(1).optional(),
      format: z.enum(['pdf', 'excel', 'both']).optional(),
      recipients: z.array(z.string().email()).min(1).optional(),
      includeCharts: z.boolean().optional(),
      includeDetails: z.boolean().optional(),
      enabled: z.boolean().optional(),
    }).parse(request.body);

    const scheduledReportsService = initScheduledReportsService(store, app.log);
    const existing = scheduledReportsService.getScheduledReport(params.id);

    if (!existing) {
      return reply.code(404).send({ error: 'scheduled_report_not_found' });
    }

    if (existing.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: 'scheduled_report_not_found' });
    }

    try {
      const updated = await scheduledReportsService.updateScheduledReport(params.id, body);

      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: 'maintenance.scheduled_report_updated',
        resourceNodeId: null,
        outcome: 'success',
        details: { scheduledReportId: params.id },
      });

      return updated;
    } catch (error) {
      app.log.error('Failed to update scheduled report:', error);
      
      return reply.code(400).send({
        error: 'invalid_schedule',
        message: String(error),
      });
    }
  });

  /**
   * Delete scheduled report
   */
  app.delete('/v1/maintenance/reports/scheduled/:id', async (request, reply) => {
    const params = z.object({
      id: z.string().uuid(),
    }).parse(request.params);

    const scheduledReportsService = initScheduledReportsService(store, app.log);
    const existing = scheduledReportsService.getScheduledReport(params.id);

    if (!existing) {
      return reply.code(404).send({ error: 'scheduled_report_not_found' });
    }

    if (existing.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: 'scheduled_report_not_found' });
    }

    await scheduledReportsService.deleteScheduledReport(params.id);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: 'maintenance.scheduled_report_deleted',
      resourceNodeId: null,
      outcome: 'success',
      details: { scheduledReportId: params.id },
    });

    return reply.code(204).send();
  });
}
