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
    const visits = await this.store.listMaintenanceVisits(tenantId);
    const schedules = await this.store.listMaintenanceSchedules(tenantId);

    // Filter by period
    const periodVisits = visits.filter(v => {
      const visitDate = new Date(v.dueAt);
      return visitDate >= periodStart && visitDate <= periodEnd;
    });

    // Calculate compliance
    const scheduledVisits = periodVisits.length;
    const completedVisits = periodVisits.filter(v => v.status === 'completed').length;
    const overdueVisits = periodVisits.filter(v => 
      v.status !== 'completed' && new Date(v.dueAt) < new Date()
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
    const workOrders = await this.store.listWorkOrders(tenantId);

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
      wo => wo.status === 'closed' && wo.slaDueAt && wo.updatedAt
    );
    const avgResolutionHours = closedWithSla.length > 0
      ? closedWithSla.reduce((sum, wo) => {
          const created = new Date(wo.createdAt).getTime();
          const closed = new Date(wo.updatedAt).getTime();
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
    const totalCost = periodWorkOrders.reduce((sum, wo) => sum + (wo.cost || 0), 0);

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
    const workOrders = await this.store.listWorkOrders(tenantId);

    // Active contracts during period
    const activeContracts = contracts.filter(c => {
      const start = new Date(c.startDate);
      const end = new Date(c.endDate);
      return start <= periodEnd && end >= periodStart;
    });

    // Work orders covered by AMC
    const amcWorkOrders = workOrders.filter(wo => {
      const created = new Date(wo.createdAt);
      return created >= periodStart && created <= periodEnd && wo.vendorId;
    });

    // Calculate response time compliance
    const onTimeSla = amcWorkOrders.filter(wo => {
      if (!wo.slaDueAt || !wo.updatedAt || wo.status !== 'closed') return false;
      return new Date(wo.updatedAt) <= new Date(wo.slaDueAt);
    }).length;

    const slaCompliance = amcWorkOrders.length > 0
      ? (onTimeSla / amcWorkOrders.length) * 100
      : 100;

    // Calculate total AMC cost
    const totalAmcCost = activeContracts.reduce((sum, c) => sum + (c.cost || 0), 0);

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
    const vendors = await this.store.listMaintenanceVendors(tenantId);
    const workOrders = await this.store.listWorkOrders(tenantId);

    const vendorPerformance = vendors.map(vendor => {
      const vendorWorkOrders = workOrders.filter(wo => {
        const created = new Date(wo.createdAt);
        return wo.vendorId === vendor.id && created >= periodStart && created <= periodEnd;
      });

      const completed = vendorWorkOrders.filter(wo => wo.status === 'closed').length;
      const onTime = vendorWorkOrders.filter(wo => {
        if (!wo.slaDueAt || !wo.updatedAt || wo.status !== 'closed') return false;
        return new Date(wo.updatedAt) <= new Date(wo.slaDueAt);
      }).length;

      const avgResolutionTime = completed > 0
        ? vendorWorkOrders
            .filter(wo => wo.status === 'closed')
            .reduce((sum, wo) => {
              const created = new Date(wo.createdAt).getTime();
              const closed = new Date(wo.updatedAt).getTime();
              return sum + ((closed - created) / (1000 * 60 * 60));
            }, 0) / completed
        : 0;

      const totalCost = vendorWorkOrders.reduce((sum, wo) => sum + (wo.cost || 0), 0);

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
    const workOrders = await this.store.listWorkOrders(tenantId);

    const periodWorkOrders = workOrders.filter(wo => {
      const created = new Date(wo.createdAt);
      return created >= periodStart && created <= periodEnd;
    });

    const withSla = periodWorkOrders.filter(wo => wo.slaDueAt);
    const closed = withSla.filter(wo => wo.status === 'closed');
    const onTime = closed.filter(wo => new Date(wo.updatedAt) <= new Date(wo.slaDueAt!));
    const breached = withSla.filter(wo => 
      wo.status !== 'closed' && new Date(wo.slaDueAt!) < new Date()
    );

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
        complianceRate: closed.length > 0 ? (onTime.length / closed.length) * 100 : 100,
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
    const alerts = await this.store.listPredictiveAlerts(tenantId);
    const periodAlerts = alerts.filter(a => {
      const detected = new Date(a.detectedAt || Date.now());
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
    const workOrders = await this.store.listWorkOrders(tenantId);
    const contracts = await this.store.listAmcContracts(tenantId);
    const assets = await this.store.listMaintenanceAssets(tenantId);

    const periodWorkOrders = workOrders.filter(wo => {
      const created = new Date(wo.createdAt);
      return created >= periodStart && created <= periodEnd;
    });

    // Calculate corrective maintenance costs
    const correctiveCost = periodWorkOrders.reduce((sum, wo) => sum + (wo.cost || 0), 0);

    // Calculate AMC costs (pro-rated for period)
    const amcCost = contracts
      .filter(c => c.status === 'active')
      .reduce((sum, c) => sum + (c.cost || 0), 0);

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
    // This would implement forecasting algorithms
    // For now, return placeholder data
    return {
      period: { start: periodStart, end: periodEnd },
      forecast: {
        storage: {
          current: 7500,
          predicted30Days: 8200,
          predicted60Days: 8900,
          predicted90Days: 9500,
          capacityExhausted: '~120 days',
        },
        cameras: {
          current: 545,
          predicted12Months: 600,
          growthRate: 10,
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
    const alerts = await this.store.listPredictiveAlerts(tenantId);

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
  private async generatePDF(report: GeneratedReport): Promise<void> {
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

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private groupByBranch(visits: any[], schedules: any[]): any {
    // Group visits by branch from schedules
    return {};
  }

  private calculateSlaForSeverity(workOrders: any[], severity: string): any {
    const filtered = workOrders.filter(wo => wo.severity === severity && wo.slaDueAt);
    const closed = filtered.filter(wo => wo.status === 'closed');
    const onTime = closed.filter(wo => new Date(wo.updatedAt) <= new Date(wo.slaDueAt));
    
    return {
      total: filtered.length,
      onTime: onTime.length,
      compliance: closed.length > 0 ? (onTime.length / closed.length) * 100 : 100,
    };
  }

  private calculateCostByCategory(workOrders: any[], assets: any[]): any {
    const categories = ['camera', 'recorder', 'storage', 'network', 'power', 'accessory'];
    
    return categories.reduce((acc, category) => {
      const categoryAssets = assets.filter(a => a.category === category);
      const categoryWorkOrders = workOrders.filter(wo => 
        categoryAssets.some(a => a.id === wo.assetId)
      );
      const cost = categoryWorkOrders.reduce((sum, wo) => sum + (wo.cost || 0), 0);
      
      acc[category] = cost;
      return acc;
    }, {} as Record<string, number>);
  }

  private calculateCostTrend(
    workOrders: any[],
    periodStart: Date,
    periodEnd: Date
  ): any[] {
    const months: any[] = [];
    const current = new Date(periodStart);
    
    while (current <= periodEnd) {
      const monthStart = new Date(current);
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      
      const monthWorkOrders = workOrders.filter(wo => {
        const created = new Date(wo.createdAt);
        return created >= monthStart && created <= monthEnd;
      });
      
      const cost = monthWorkOrders.reduce((sum, wo) => sum + (wo.cost || 0), 0);
      
      months.push({
        month: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
        cost,
        workOrders: monthWorkOrders.length,
      });
      
      current.setMonth(current.getMonth() + 1);
    }
    
    return months;
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
