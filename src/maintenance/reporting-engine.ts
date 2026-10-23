/**
 * Advanced Reporting Engine
 * Generates PDF, Excel, and scheduled reports for maintenance module
 */

import type { ControlPlaneStore } from '../control-plane-store.js';

export interface ReportConfig {
  id: string;
  tenantId: string;
  reportType: 
    | 'preventive-maintenance'
    | 'corrective-maintenance'
    | 'amc-performance'
    | 'vendor-performance'
    | 'sla-compliance'
    | 'health-summary'
    | 'cost-analysis'
    | 'capacity-forecast'
    | 'predictive-summary';
  title: string;
  periodStart: Date;
  periodEnd: Date;
  filters?: {
    branchNodeId?: string;
    assetId?: string;
    vendorId?: string;
    severity?: string;
  };
  format: 'pdf' | 'excel' | 'json';
  includeCharts?: boolean;
  includeDetails?: boolean;
  generatedBy: string;
  generatedAt: Date;
}

export interface GeneratedReport {
  reportId: string;
  config: ReportConfig;
  data: any;
  summary: string;
  metrics: Record<string, any>;
  filename: string;
  fileSize?: number;
  downloadUrl?: string;
}

export class ReportingEngine {
  private store: ControlPlaneStore;
  private logger: any;
  private reports: Map<string, GeneratedReport> = new Map();

  constructor(store: ControlPlaneStore, logger?: any) {
    this.store = store;
    this.logger = logger || console;
  }

  /**
   * Generate a report
   */
  async generateReport(config: ReportConfig): Promise<GeneratedReport> {
    try {
      this.logger.info('Generating report:', {
        type: config.reportType,
        format: config.format,
        period: `${config.periodStart.toISOString()} to ${config.periodEnd.toISOString()}`,
      });

      // Collect data based on report type
      const data = await this.collectReportData(config);

      // Calculate metrics and summary
      const metrics = this.calculateMetrics(config.reportType, data);
      const summary = this.generateSummary(config.reportType, metrics);

      // Generate filename
      const filename = this.generateFilename(config);

      const report: GeneratedReport = {
        reportId: config.id,
        config,
        data,
        summary,
        metrics,
        filename,
      };

      // Store report
      this.reports.set(report.reportId, report);

      // Generate file in requested format
      if (config.format === 'pdf') {
        await this.generatePDF(report);
      } else if (config.format === 'excel') {
        await this.generateExcel(report);
      }

      // Log to audit
      await this.store.writeAudit({
        tenantId: config.tenantId,
        actorUserId: config.generatedBy,
        action: 'maintenance.report_generated',
        resourceNodeId: config.filters?.branchNodeId || null,
        outcome: 'success',
        details: {
          reportType: config.reportType,
          format: config.format,
          reportId: report.reportId,
        },
      });

      this.logger.info('Report generated successfully:', {
        reportId: report.reportId,
        filename: report.filename,
      });

      return report;
    } catch (error) {
      this.logger.error('Failed to generate report:', error);
      throw error;
    }
  }

  /**
   * Collect data for report
   */
  private async collectReportData(config: ReportConfig): Promise<any> {
    const { tenantId, reportType, periodStart, periodEnd, filters } = config;

    switch (reportType) {
      case 'preventive-maintenance':
        return this.collectPreventiveMaintenanceData(tenantId, periodStart, periodEnd, filters);
      
      case 'corrective-maintenance':
        return this.collectCorrectiveMaintenanceData(tenantId, periodStart, periodEnd, filters);
      
      case 'amc-performance':
        return this.collectAmcPerformanceData(tenantId, periodStart, periodEnd, filters);
      
      case 'vendor-performance':
        return this.collectVendorPerformanceData(tenantId, periodStart, periodEnd, filters);
      
      case 'sla-compliance':
        return this.collectSlaComplianceData(tenantId, periodStart, periodEnd, filters);
      
      case 'health-summary':
        return this.collectHealthSummaryData(tenantId, periodStart, periodEnd, filters);
      
      case 'cost-analysis':
        return this.collectCostAnalysisData(tenantId, periodStart, periodEnd, filters);
      
      case 'capacity-forecast':
        return this.collectCapacityForecastData(tenantId, periodStart, periodEnd, filters);
      
      case 'predictive-summary':
        return this.collectPredictiveSummaryData(tenantId, periodStart, periodEnd, filters);
      
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  }

  /**
   * Collect preventive maintenance data
   */
  private async collectPreventiveMaintenanceData(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    filters?: any
  ): Promise<any> {
    const [visits, allSchedules] = await Promise.all([
      this.store.listMaintenanceVisits(tenantId, { startDate: periodStart, endDate: periodEnd, branchNodeId: filters?.branchNodeId }),
      this.store.listMaintenanceSchedules(tenantId),
    ]);
    const schedules = allSchedules.filter(schedule =>
      (!filters?.branchNodeId || schedule.branchNodeId === filters.branchNodeId) &&
      (!filters?.assetId || schedule.assetId === filters.assetId));
    const scheduleIds = new Set(schedules.map(schedule => schedule.id));

    // Filter by period
    const periodVisits = visits.filter(v => {
      const visitDate = new Date(v.dueAt);
      return visitDate >= periodStart && visitDate <= periodEnd
        && (!filters?.branchNodeId || v.branchNodeId === filters.branchNodeId || scheduleIds.has(v.scheduleId))
        && (!filters?.assetId || scheduleIds.has(v.scheduleId));
    });

    // Calculate compliance
    const scheduledVisits = periodVisits.length;
    const completedVisits = periodVisits.filter(v => v.status === 'completed').length;
    const overdueVisits = periodVisits.filter(v => 
      !['completed', 'cancelled'].includes(v.status) && new Date(v.dueAt) < new Date()
    ).length;

    // Group by branch if available
    const byBranch = this.groupByBranch(periodVisits, schedules);

    return {
      period: { start: periodStart, end: periodEnd },
      visits: periodVisits,
      schedules: schedules.length,
      statistics: {
        scheduled: scheduledVisits,
        completed: completedVisits,
        overdue: overdueVisits,
        complianceRate: scheduledVisits > 0 ? (completedVisits / scheduledVisits) * 100 : 100,
      },
      byBranch,
    };
  }

  /**
   * Collect corrective maintenance data
   */
  private async collectCorrectiveMaintenanceData(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    filters?: any
  ): Promise<any> {
    const workOrders = await this.reportWorkOrders(tenantId, periodStart, periodEnd, filters);

    // Filter by period
    const periodWorkOrders = workOrders.filter(wo => {
      const createdDate = new Date(wo.createdAt);
      return createdDate >= periodStart && createdDate <= periodEnd;
    });

    // Calculate statistics
    const totalOrders = periodWorkOrders.length;
    const closedOrders = periodWorkOrders.filter(wo => wo.status === 'closed').length;
    const openOrders = totalOrders - closedOrders;

    // Calculate average resolution time
    const closedWithSla = periodWorkOrders.filter(
      wo => wo.status === 'closed' && (wo.resolvedAt || wo.updatedAt)
    );
    const avgResolutionHours = closedWithSla.length > 0
      ? closedWithSla.reduce((sum, wo) => {
          const created = new Date(wo.createdAt).getTime();
          const closed = new Date(wo.resolvedAt || wo.updatedAt).getTime();
          return sum + ((closed - created) / (1000 * 60 * 60));
        }, 0) / closedWithSla.length
      : 0;

    // Group by severity
    const bySeverity = {
      critical: periodWorkOrders.filter(wo => wo.severity === 'critical').length,
      high: periodWorkOrders.filter(wo => wo.severity === 'high').length,
      medium: periodWorkOrders.filter(wo => wo.severity === 'medium').length,
      low: periodWorkOrders.filter(wo => wo.severity === 'low').length,
    };

    // Calculate total cost
    const totalCost = periodWorkOrders.reduce((sum, wo) => sum + Number(wo.cost || 0), 0);

    return {
      period: { start: periodStart, end: periodEnd },
      workOrders: periodWorkOrders,
      statistics: {
        total: totalOrders,
        closed: closedOrders,
        open: openOrders,
        avgResolutionHours,
        totalCost,
      },
      bySeverity,
    };
  }

  /**
   * Collect AMC performance data
   */
  private async collectAmcPerformanceData(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    filters?: any
  ): Promise<any> {
    const contracts = await this.store.listAmcContracts(tenantId, filters?.vendorId);
    const workOrders = await this.reportWorkOrders(tenantId, periodStart, periodEnd, filters);

    // Active contracts during period
    const activeContracts = contracts.filter(c => {
      const start = new Date(c.startDate);
      const end = new Date(c.endDate);
      return start <= periodEnd && end >= periodStart;
    });

    // Work orders covered by AMC
    const amcWorkOrders = workOrders.filter(wo => {
      const created = new Date(wo.createdAt);
      return created >= periodStart && created <= periodEnd && activeContracts.some(contract =>
        contract.vendorId === wo.vendorId && new Date(contract.startDate) <= created && Date.parse(contract.endDate) + (/^\d{4}-\d{2}-\d{2}$/.test(contract.endDate) ? 86_400_000 : 0) > created.getTime());
    });

    // Calculate response time compliance
    const onTimeSla = amcWorkOrders.filter(wo => {
      if (!wo.slaDueAt || !(wo.resolvedAt || wo.updatedAt) || wo.status !== 'closed') return false;
      return new Date(wo.resolvedAt || wo.updatedAt) <= new Date(wo.slaDueAt);
    }).length;

    const slaCompliance = amcWorkOrders.length > 0
      ? (onTimeSla / amcWorkOrders.length) * 100
      : 100;

    // Calculate total AMC cost
    const totalAmcCost = activeContracts.reduce((sum, c) => sum + Number(c.cost || 0), 0);

    return {
      period: { start: periodStart, end: periodEnd },
      contracts: activeContracts,
      workOrders: amcWorkOrders,
      statistics: {
        activeContracts: activeContracts.length,
        totalWorkOrders: amcWorkOrders.length,
        slaCompliance,
        onTimeSla,
        totalCost: totalAmcCost,
      },
    };
  }

  /**
   * Collect vendor performance data
   */
  private async collectVendorPerformanceData(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    filters?: any
  ): Promise<any> {
    const vendors = (await this.store.listMaintenanceVendors(tenantId)).filter(vendor => !filters?.vendorId || vendor.id === filters.vendorId);
    const workOrders = await this.reportWorkOrders(tenantId, periodStart, periodEnd, filters);

    const vendorPerformance = vendors.map(vendor => {
      const vendorWorkOrders = workOrders.filter(wo => {
        const created = new Date(wo.createdAt);
        return wo.vendorId === vendor.id && created >= periodStart && created <= periodEnd;
      });

      const completed = vendorWorkOrders.filter(wo => wo.status === 'closed').length;
      const onTime = vendorWorkOrders.filter(wo => {
        if (!wo.slaDueAt || !(wo.resolvedAt || wo.updatedAt) || wo.status !== 'closed') return false;
        return new Date(wo.resolvedAt || wo.updatedAt) <= new Date(wo.slaDueAt);
      }).length;

      const avgResolutionTime = completed > 0
        ? vendorWorkOrders
            .filter(wo => wo.status === 'closed')
            .reduce((sum, wo) => {
              const created = new Date(wo.createdAt).getTime();
              const closed = new Date(wo.resolvedAt || wo.updatedAt).getTime();
              return sum + ((closed - created) / (1000 * 60 * 60));
            }, 0) / completed
        : 0;

      const totalCost = vendorWorkOrders.reduce((sum, wo) => sum + Number(wo.cost || 0), 0);

      return {
        vendor,
        statistics: {
          totalWorkOrders: vendorWorkOrders.length,
          completed,
          onTime,
          slaCompliance: vendorWorkOrders.length > 0 ? (onTime / vendorWorkOrders.length) * 100 : 100,
          avgResolutionHours: avgResolutionTime,
          totalCost,
        },
      };
    });

    // Sort by performance score
    vendorPerformance.sort((a, b) => b.statistics.slaCompliance - a.statistics.slaCompliance);

    return {
      period: { start: periodStart, end: periodEnd },
      vendors: vendorPerformance,
    };
  }

  /**
   * Collect SLA compliance data
   */
  private async collectSlaComplianceData(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    filters?: any
  ): Promise<any> {
    const workOrders = await this.reportWorkOrders(tenantId, periodStart, periodEnd, filters);

    const periodWorkOrders = workOrders.filter(wo => {
      const created = new Date(wo.createdAt);
      return created >= periodStart && created <= periodEnd
        && (!filters?.branchNodeId || wo.branchNodeId === filters.branchNodeId)
        && (!filters?.assetId || wo.assetId === filters.assetId)
        && (!filters?.vendorId || wo.vendorId === filters.vendorId)
        && (!filters?.severity || wo.severity === filters.severity);
    });

    const withSla = periodWorkOrders.filter(wo => wo.slaDueAt);
    const closed = withSla.filter(wo => wo.status === 'closed');
    const onTime = closed.filter(wo => new Date(wo.resolvedAt || wo.updatedAt) <= new Date(wo.slaDueAt!));
    const closedLate = closed.filter(wo => new Date(wo.resolvedAt || wo.updatedAt) > new Date(wo.slaDueAt!));
    const openBreaches = withSla.filter(wo =>
      wo.status !== 'closed' && new Date(wo.slaDueAt!) < new Date()
    );
    const breached = [...closedLate, ...openBreaches];
    const evaluated = closed.length + openBreaches.length;

    // Group by severity
    const bySeverity = {
      critical: this.calculateSlaForSeverity(periodWorkOrders, 'critical'),
      high: this.calculateSlaForSeverity(periodWorkOrders, 'high'),
      medium: this.calculateSlaForSeverity(periodWorkOrders, 'medium'),
      low: this.calculateSlaForSeverity(periodWorkOrders, 'low'),
    };

    return {
      period: { start: periodStart, end: periodEnd },
      workOrders: withSla,
      statistics: {
        total: withSla.length,
        closed: closed.length,
        onTime: onTime.length,
        breached: breached.length,
        complianceRate: evaluated > 0 ? (onTime.length / evaluated) * 100 : 100,
      },
      bySeverity,
    };
  }

  /**
   * Collect health summary data
   */
  private async collectHealthSummaryData(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    filters?: any
  ): Promise<any> {
    // Get current health status
    const healthSummary = await this.store.getHealthCheckSummary(tenantId);

    // Get alerts during period
    const alerts = await this.reportPredictiveAlerts(tenantId, periodStart, periodEnd, filters);
    const periodAlerts = alerts.filter(a => {
      const detected = new Date(a.detectedAt);
      return detected >= periodStart && detected <= periodEnd;
    });

    // Group alerts by category
    const alertsByCategory = {
      critical: periodAlerts.filter(a => a.score > 0.8).length,
      warning: periodAlerts.filter(a => a.score > 0.5 && a.score <= 0.8).length,
      info: periodAlerts.filter(a => a.score <= 0.5).length,
    };

    return {
      period: { start: periodStart, end: periodEnd },
      currentHealth: healthSummary,
      alerts: periodAlerts,
      statistics: {
        totalAlerts: periodAlerts.length,
        alertsByCategory,
      },
    };
  }

  /**
   * Collect cost analysis data
   */
  private async collectCostAnalysisData(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    filters?: any
  ): Promise<any> {
    const workOrders = await this.reportWorkOrders(tenantId, periodStart, periodEnd, filters);
    const contracts = await this.store.listAmcContracts(tenantId);
    const assets = await this.store.listMaintenanceAssets(tenantId);

    const periodWorkOrders = workOrders.filter(wo => {
      const created = new Date(wo.createdAt);
      return created >= periodStart && created <= periodEnd;
    });

    // Calculate corrective maintenance costs
    const correctiveCost = periodWorkOrders.reduce((sum, wo) => sum + Number(wo.cost || 0), 0);

    // Calculate AMC costs (pro-rated for period)
    const amcCost = contracts
      .filter(c => !filters?.vendorId || c.vendorId === filters.vendorId)
      .reduce((sum, contract) => {
        const start = Date.parse(contract.startDate);
        const end = Date.parse(contract.endDate);
        const day = 86_400_000;
        const overlap = Math.max(0, Math.min(end + day, periodEnd.getTime()) - Math.max(start, periodStart.getTime()));
        return sum + Number(contract.cost || 0) * overlap / Math.max(day, end - start + day);
      }, 0);

    // Cost by asset category
    const costByCategory = this.calculateCostByCategory(periodWorkOrders, assets);

    // Cost trend (monthly breakdown)
    const costTrend = this.calculateCostTrend(periodWorkOrders, periodStart, periodEnd);

    return {
      period: { start: periodStart, end: periodEnd },
      statistics: {
        correctiveCost,
        amcCost,
        totalCost: correctiveCost + amcCost,
        costPerWorkOrder: periodWorkOrders.length > 0 ? correctiveCost / periodWorkOrders.length : 0,
      },
      costByCategory,
      costTrend,
    };
  }

  /**
   * Collect capacity forecast data
   */
  private async collectCapacityForecastData(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    filters?: any
  ): Promise<any> {
    const cameras = (await this.store.listCameras(tenantId)).filter(camera => !filters?.branchNodeId || camera.branchId === filters.branchNodeId);
    const telemetry = (await this.store.listLatestOperationalTelemetry(tenantId, filters?.branchNodeId ? [filters.branchNodeId] : undefined))
      .filter(item => (!filters?.branchNodeId || item.branchId === filters.branchNodeId) && (!filters?.assetId || item.deviceId === filters.assetId));
    const totalStorageBytes = telemetry.reduce((sum: number, t: any) => sum + (Number(t?.metrics?.usedBytes) || 0), 0);
    const dailyIngestBytes = telemetry.reduce((sum: number, t: any) => sum + (Number(t?.metrics?.dailyIngestBytes) || 0), 0);

    const hasSufficientData = telemetry.length > 0 && dailyIngestBytes > 0;
    const currentGb = totalStorageBytes / (1024 * 1024 * 1024);
    const dailyGb = dailyIngestBytes / (1024 * 1024 * 1024);

    return {
      period: { start: periodStart, end: periodEnd },
      forecastStatus: hasSufficientData ? "CALCULATED" : "INSUFFICIENT_DATA",
      forecast: {
        storage: {
          current: currentGb,
          predicted30Days: hasSufficientData ? currentGb + dailyGb * 30 : null,
          predicted60Days: hasSufficientData ? currentGb + dailyGb * 60 : null,
          predicted90Days: hasSufficientData ? currentGb + dailyGb * 90 : null,
          capacityExhausted: hasSufficientData ? "CALCULATED_FROM_TELEMETRY" : "INSUFFICIENT_DATA",
        },
        cameras: {
          current: cameras.length,
          predicted12Months: cameras.length,
          growthRate: 0,
        },
      },
    };
  }

  /**
   * Collect predictive summary data
   */
  private async collectPredictiveSummaryData(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
    filters?: any
  ): Promise<any> {
    const alerts = await this.reportPredictiveAlerts(tenantId, periodStart, periodEnd, filters);

    const highRisk = alerts.filter(a => a.score > 0.8);
    const mediumRisk = alerts.filter(a => a.score > 0.5 && a.score <= 0.8);

    // Group by asset type
    const byType = {
      storage: alerts.filter(a => a.type?.includes('storage') || a.type?.includes('disk')).length,
      ups: alerts.filter(a => a.type?.includes('ups') || a.type?.includes('battery')).length,
      camera: alerts.filter(a => a.type?.includes('camera')).length,
      network: alerts.filter(a => a.type?.includes('network')).length,
    };

    return {
      period: { start: periodStart, end: periodEnd },
      alerts,
      statistics: {
        total: alerts.length,
        highRisk: highRisk.length,
        mediumRisk: mediumRisk.length,
        lowRisk: alerts.length - highRisk.length - mediumRisk.length,
      },
      byType,
    };
  }

  /**
   * Calculate metrics based on report type
   */
  private calculateMetrics(reportType: string, data: any): Record<string, any> {
    // Return data.statistics or calculate custom metrics
    return data.statistics || {};
  }

  /**
   * Generate summary text
   */
  private generateSummary(reportType: string, metrics: Record<string, any>): string {
    switch (reportType) {
      case 'preventive-maintenance':
        return `Preventive maintenance compliance: ${metrics.complianceRate?.toFixed(1)}%. ${metrics.completed} of ${metrics.scheduled} visits completed.`;
      
      case 'corrective-maintenance':
        return `${metrics.total} work orders processed. ${metrics.closed} closed, ${metrics.open} remain open. Average resolution time: ${metrics.avgResolutionHours?.toFixed(1)} hours.`;
      
      case 'amc-performance':
        return `${metrics.activeContracts} active AMC contracts. SLA compliance: ${metrics.slaCompliance?.toFixed(1)}%. Total cost: $${metrics.totalCost?.toFixed(2)}.`;
      
      case 'vendor-performance':
        return `Vendor performance analysis covering ${metrics.vendorCount || 'multiple'} vendors.`;
      
      case 'sla-compliance':
        return `SLA compliance rate: ${metrics.complianceRate?.toFixed(1)}%. ${metrics.onTime} on-time, ${metrics.breached} breached.`;
      
      case 'health-summary':
        return `System health overview with ${metrics.totalAlerts} alerts generated.`;
      
      case 'cost-analysis':
        return `Total maintenance cost: $${metrics.totalCost?.toFixed(2)}. Corrective: $${metrics.correctiveCost?.toFixed(2)}, AMC: $${metrics.amcCost?.toFixed(2)}.`;
      
      default:
        return `Report generated successfully.`;
    }
  }

  /**
   * Generate filename
   */
  private generateFilename(config: ReportConfig): string {
    const date = new Date().toISOString().split('T')[0];
    const type = config.reportType.replace(/-/g, '_');
    const ext = config.format === 'pdf' ? 'pdf' : config.format === 'excel' ? 'xlsx' : 'json';
    return `maintenance_${type}_${date}.${ext}`;
  }

  /**
   * Generate PDF report (with actual PDF generation)
   */
  private async generatePDF(report: GeneratedReport): Promise<Buffer> {
    try {
      const { PDFGenerator } = await import('./pdf-generator.js');
      const pdfGenerator = new PDFGenerator(this.logger);
      
      const buffer = await pdfGenerator.generatePDF(report, {
        includeLogo: false,
        includeCharts: false,
        includeDetails: true,
      });
      
      // In production, save to file system or object storage
      report.fileSize = buffer.length;
      report.downloadUrl = `/v1/maintenance/reports/${report.reportId}/download`;
      
      this.logger.info('PDF generated successfully:', {
        reportId: report.reportId,
        size: buffer.length,
      });
      return buffer;
    } catch (error) {
      this.logger.error('Failed to generate PDF:', error);
      throw error;
    }
  }

  /**
   * Generate Excel report (with actual Excel generation)
   */
  private async generateExcel(report: GeneratedReport): Promise<void> {
    try {
      const { ExcelGenerator } = await import('./excel-generator.js');
      const excelGenerator = new ExcelGenerator(this.logger);
      
      const buffer = await excelGenerator.generateExcel(report, {
        includeCharts: false,
        includeSummary: true,
        includeDetails: true,
        multiSheet: true,
      });
      
      // In production, save to file system or object storage
      report.fileSize = buffer.length;
      report.downloadUrl = `/v1/maintenance/reports/${report.reportId}/download`;
      
      this.logger.info('Excel generated successfully:', {
        reportId: report.reportId,
        size: buffer.length,
      });
    } catch (error) {
      this.logger.error('Failed to generate Excel:', error);
      throw error;
    }
  }

  /**
   * Get generated report
   */
  getReport(reportId: string): GeneratedReport | undefined {
    return this.reports.get(reportId);
  }

  /**
   * List generated reports
   */
  listReports(): GeneratedReport[] {
    return Array.from(this.reports.values());
  }

  /**
   * Get generated reports
   */
  getGeneratedReports(): GeneratedReport[] {
    return this.listReports();
  }

  /**
   * Get a report by its id
   */
  getReportById(reportId: string): GeneratedReport | undefined {
    return this.getReport(reportId);
  }

  /**
   * Export report to PDF
   */
  async exportReportToPDF(report: GeneratedReport): Promise<Buffer> {
    if (report.config.format !== 'pdf') {
      return this.generatePDF(report);
    }

    return this.generatePDF(report);
  }

  /**
   * Export report to JSON
   */
  async exportReportToJSON(report: GeneratedReport): Promise<string> {
    return JSON.stringify(report, null, 2);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async reportWorkOrders(tenantId: string, start: Date, end: Date, filters?: ReportConfig['filters']) {
    const orders = await this.store.listWorkOrders(tenantId, undefined, { ...filters, from: start.toISOString(), to: end.toISOString() });
    return orders.filter(order => new Date(order.createdAt) >= start && new Date(order.createdAt) <= end
      && (!filters?.branchNodeId || order.branchNodeId === filters.branchNodeId)
      && (!filters?.assetId || order.assetId === filters.assetId)
      && (!filters?.vendorId || order.vendorId === filters.vendorId)
      && (!filters?.severity || order.severity === filters.severity));
  }

  private async reportPredictiveAlerts(tenantId: string, start: Date, end: Date, filters?: ReportConfig['filters']) {
    const alerts = await this.store.listPredictiveAlerts(tenantId);
    const assets = filters?.branchNodeId || filters?.vendorId ? await this.store.listMaintenanceAssets(tenantId) : [];
    const assetIds = new Set(assets.filter(asset => (!filters?.branchNodeId || asset.branchNodeId === filters.branchNodeId)
      && (!filters?.vendorId || asset.vendorId === filters.vendorId)).map(asset => asset.id));
    return alerts.filter(alert => new Date(alert.detectedAt) >= start && new Date(alert.detectedAt) <= end
      && (!filters?.assetId || alert.assetId === filters.assetId)
      && (!(filters?.branchNodeId || filters?.vendorId) || assetIds.has(alert.assetId))
      && (!filters?.severity || alert.severity === filters.severity));
  }

  private groupByBranch(visits: any[], schedules: any[]): any {
    const branchBySchedule = new Map(schedules.map(schedule => [schedule.id, schedule.branchNodeId]));
    const byBranch: Record<string, { scheduled: number; completed: number; overdue: number }> = {};
    for (const visit of visits) {
      const branchId = visit.branchNodeId || branchBySchedule.get(visit.scheduleId) || 'unassigned';
      const row = byBranch[branchId] ??= { scheduled: 0, completed: 0, overdue: 0 };
      row.scheduled++;
      if (visit.status === 'completed') row.completed++;
      else if (visit.status !== 'cancelled' && new Date(visit.dueAt) < new Date()) row.overdue++;
    }
    return byBranch;
  }

  private calculateSlaForSeverity(workOrders: any[], severity: string): any {
    const filtered = workOrders.filter(wo => wo.severity === severity && wo.slaDueAt);
    const closed = filtered.filter(wo => wo.status === 'closed');
    const openBreaches = filtered.filter(wo => wo.status !== 'closed' && new Date(wo.slaDueAt) < new Date());
    const evaluated = closed.length + openBreaches.length;
    const onTime = closed.filter(wo => new Date(wo.resolvedAt || wo.updatedAt) <= new Date(wo.slaDueAt));
    
    return {
      total: filtered.length,
      onTime: onTime.length,
      compliance: evaluated > 0 ? (onTime.length / evaluated) * 100 : 100,
    };
  }

  private calculateCostByCategory(workOrders: any[], assets: any[]): any {
    const costs: Record<string, number> = { camera: 0, recorder: 0, storage: 0, network: 0, power: 0, accessory: 0 };
    const categoryByAsset = new Map(assets.map(asset => [asset.id, asset.category]));
    for (const order of workOrders) {
      const category = categoryByAsset.get(order.assetId);
      if (category && category in costs) costs[category]! += Number(order.cost || 0);
    }
    return costs;
  }

  private calculateCostTrend(
    workOrders: any[],
    periodStart: Date,
    periodEnd: Date
  ): any[] {
    const buckets = new Map<string, { month: string; cost: number; workOrders: number }>();
    const current = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), 1));
    while (current <= periodEnd) {
      const month = current.toISOString().slice(0, 7);
      buckets.set(month, { month, cost: 0, workOrders: 0 });
      current.setUTCMonth(current.getUTCMonth() + 1);
    }
    for (const order of workOrders) {
      const created = new Date(order.createdAt);
      if (created < periodStart || created > periodEnd || !Number.isFinite(created.getTime())) continue;
      const bucket = buckets.get(created.toISOString().slice(0, 7));
      if (bucket) { bucket.cost += Number(order.cost || 0); bucket.workOrders++; }
    }
    return [...buckets.values()];
  }
}

// Singleton instance
let reportingEngineInstance: ReportingEngine | null = null;

export function initReportingEngine(store: ControlPlaneStore, logger?: any): ReportingEngine {
  if (!reportingEngineInstance) {
    reportingEngineInstance = new ReportingEngine(store, logger);
  }
  return reportingEngineInstance;
}

export function getReportingEngine(): ReportingEngine | null {
  return reportingEngineInstance;
}
