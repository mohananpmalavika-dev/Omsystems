/**
 * Scheduled Reports Service
 * Automatically generates and distributes reports on a schedule
 */

import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { initReportingEngine, type ReportConfig } from './reporting-engine.js';
import { v4 as uuidv4 } from 'uuid';

export interface ScheduledReportConfig {
  id: string;
  tenantId: string;
  reportType: ReportConfig['reportType'];
  title: string;
  schedule: string; // Cron expression
  format: 'pdf' | 'excel' | 'both';
  recipients: string[]; // Email addresses
  includeCharts?: boolean;
  includeDetails?: boolean;
  filters?: ReportConfig['filters'];
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  lastRun?: Date;
  nextRun?: Date;
}

export class ScheduledReportsService {
  private store: ControlPlaneStore;
  private logger: any;
  private schedules: Map<string, ScheduledTask> = new Map();
  private scheduledReports: Map<string, ScheduledReportConfig> = new Map();

  constructor(store: ControlPlaneStore, logger?: any) {
    this.store = store;
    this.logger = logger || console;
  }

  /**
   * Start the scheduled reports service
   */
  start() {
    this.logger.info('Starting scheduled reports service');
    
    // Load existing scheduled reports from database
    // In production, this would load from a scheduled_reports table
    
    this.logger.info('Scheduled reports service started');
  }

  /**
   * Stop the scheduled reports service
   */
  stop() {
    this.logger.info('Stopping scheduled reports service');
    
    // Stop all cron jobs
    this.schedules.forEach(task => task.stop());
    this.schedules.clear();
    
    this.logger.info('Scheduled reports service stopped');
  }

  /**
   * Create a scheduled report
   */
  async createScheduledReport(config: Omit<ScheduledReportConfig, 'id' | 'createdAt' | 'nextRun'>): Promise<ScheduledReportConfig> {
    const id = uuidv4();
    
    // Validate cron expression
    if (!cron.validate(config.schedule)) {
      throw new Error('Invalid cron expression');
    }

    const scheduledReport: ScheduledReportConfig = {
      ...config,
      id,
      createdAt: new Date(),
      nextRun: this.getNextRun(config.schedule),
    };

    // Store in database
    // await this.store.createScheduledReport(scheduledReport);
    
    // Store in memory
    this.scheduledReports.set(id, scheduledReport);

    // Schedule the job
    if (config.enabled) {
      this.scheduleReport(scheduledReport);
    }

    this.logger.info('Scheduled report created:', {
      id,
      reportType: config.reportType,
      schedule: config.schedule,
    });

    return scheduledReport;
  }

  /**
   * Update a scheduled report
   */
  async updateScheduledReport(id: string, updates: Partial<ScheduledReportConfig>): Promise<ScheduledReportConfig> {
    const existing = this.scheduledReports.get(id);
    
    if (!existing) {
      throw new Error('Scheduled report not found');
    }

    // Validate cron if updated
    if (updates.schedule && !cron.validate(updates.schedule)) {
      throw new Error('Invalid cron expression');
    }

    const updated: ScheduledReportConfig = {
      ...existing,
      ...updates,
      nextRun: updates.schedule ? this.getNextRun(updates.schedule) : existing.nextRun,
    };

    // Update in database
    // await this.store.updateScheduledReport(id, updated);
    
    this.scheduledReports.set(id, updated);

    // Reschedule if enabled
    this.unscheduleReport(id);
    if (updated.enabled) {
      this.scheduleReport(updated);
    }

    this.logger.info('Scheduled report updated:', { id });

    return updated;
  }

  /**
   * Delete a scheduled report
   */
  async deleteScheduledReport(id: string): Promise<void> {
    this.unscheduleReport(id);
    this.scheduledReports.delete(id);
    
    // Delete from database
    // await this.store.deleteScheduledReport(id);
    
    this.logger.info('Scheduled report deleted:', { id });
  }

  /**
   * Get a scheduled report
   */
  getScheduledReport(id: string): ScheduledReportConfig | undefined {
    return this.scheduledReports.get(id);
  }

  /**
   * List all scheduled reports for a tenant
   */
  listScheduledReports(tenantId: string): ScheduledReportConfig[] {
    return Array.from(this.scheduledReports.values())
      .filter(report => report.tenantId === tenantId);
  }

  /**
   * Schedule a report job
   */
  private scheduleReport(config: ScheduledReportConfig) {
    try {
      const task = cron.schedule(config.schedule, async () => {
        await this.executeScheduledReport(config);
      });

      this.schedules.set(config.id, task);

      this.logger.info('Report scheduled:', {
        id: config.id,
        schedule: config.schedule,
        nextRun: config.nextRun,
      });
    } catch (error) {
      this.logger.error('Failed to schedule report:', error);
      throw error;
    }
  }

  /**
   * Unschedule a report job
   */
  private unscheduleReport(id: string) {
    const task = this.schedules.get(id);
    
    if (task) {
      task.stop();
      this.schedules.delete(id);
      this.logger.info('Report unscheduled:', { id });
    }
  }

  /**
   * Execute a scheduled report
   */
  private async executeScheduledReport(config: ScheduledReportConfig) {
    this.logger.info('Executing scheduled report:', {
      id: config.id,
      reportType: config.reportType,
    });

    try {
      const reportingEngine = initReportingEngine(this.store, this.logger);

      // Calculate period (previous week/month based on schedule)
      const { periodStart, periodEnd } = this.calculateReportPeriod(config.schedule);

      const reportConfig: ReportConfig = {
        id: uuidv4(),
        tenantId: config.tenantId,
        reportType: config.reportType,
        title: config.title,
        periodStart,
        periodEnd,
        filters: config.filters,
        format: config.format === 'both' ? 'pdf' : config.format,
        includeCharts: config.includeCharts,
        includeDetails: config.includeDetails,
        generatedBy: 'system',
        generatedAt: new Date(),
      };

      // Generate PDF
      if (config.format === 'pdf' || config.format === 'both') {
        await reportingEngine.generateReport({ ...reportConfig, format: 'pdf' });
        this.logger.info('PDF report generated');
      }

      // Generate Excel
      if (config.format === 'excel' || config.format === 'both') {
        await reportingEngine.generateReport({ ...reportConfig, format: 'excel' });
        this.logger.info('Excel report generated');
      }

      // Send to recipients
      await this.distributeReport(config, reportConfig);

      // Update last run
      const updated = this.scheduledReports.get(config.id);
      if (updated) {
        updated.lastRun = new Date();
        updated.nextRun = this.getNextRun(config.schedule);
        this.scheduledReports.set(config.id, updated);
      }

      this.logger.info('Scheduled report executed successfully:', {
        id: config.id,
      });
    } catch (error) {
      this.logger.error('Failed to execute scheduled report:', error);
      
      // In production, send alert to administrators
    }
  }

  /**
   * Distribute report to recipients
   */
  private async distributeReport(config: ScheduledReportConfig, reportConfig: ReportConfig) {
    // In production, use notification service to send emails
    this.logger.info('Distributing report to recipients:', {
      recipients: config.recipients,
      reportId: reportConfig.id,
    });

    // Example: Send email with attachments
    // const notificationService = getNotificationService();
    // await notificationService.sendEmail({
    //   to: config.recipients,
    //   subject: `${config.title} - ${reportConfig.periodStart.toLocaleDateString()}`,
    //   body: `Your scheduled report is ready.`,
    //   attachments: [
    //     { filename: report.filename, content: reportBuffer }
    //   ],
    // });
  }

  /**
   * Calculate report period based on schedule
   */
  private calculateReportPeriod(schedule: string): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    
    // Weekly reports (e.g., every Monday)
    if (schedule.includes('1') && schedule.includes('*')) {
      const periodEnd = new Date(now);
      const periodStart = new Date(periodEnd);
      periodStart.setDate(periodEnd.getDate() - 7);
      return { periodStart, periodEnd };
    }

    // Monthly reports (e.g., 1st of month)
    if (schedule.includes('1 0 1')) {
      const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
      const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); // First day of previous month
      return { periodStart, periodEnd };
    }

    // Daily reports
    const periodEnd = new Date(now);
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodEnd.getDate() - 1);
    return { periodStart, periodEnd };
  }

  /**
   * Get next run time for cron expression
   */
  private getNextRun(cronExpression: string): Date {
    // Simple implementation - in production, use cron-parser
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(nextRun.getHours() + 1);
    return nextRun;
  }
}

// Singleton instance
let scheduledReportsServiceInstance: ScheduledReportsService | null = null;

export function initScheduledReportsService(store: ControlPlaneStore, logger?: any): ScheduledReportsService {
  if (!scheduledReportsServiceInstance) {
    scheduledReportsServiceInstance = new ScheduledReportsService(store, logger);
  }
  return scheduledReportsServiceInstance;
}

export function getScheduledReportsService(): ScheduledReportsService | null {
  return scheduledReportsServiceInstance;
}
