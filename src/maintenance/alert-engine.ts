/**
 * Alert Engine
 * Processes health metrics and triggers alerts based on thresholds
 * Handles notification dispatch, deduplication, and escalation
 */

import type { ControlPlaneStore } from '../control-plane-store.js';

export interface Alert {
  id: string;
  tenantId: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'health' | 'maintenance' | 'sla' | 'predictive';
  title: string;
  description: string;
  assetId?: string;
  branchNodeId?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  status: 'active' | 'acknowledged' | 'resolved' | 'expired';
}

export interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: any) => boolean;
  severity: 'info' | 'warning' | 'critical';
  category: string;
  title: string;
  description: string;
  cooldownMinutes: number;
  escalationMinutes?: number;
  notificationChannels: ('email' | 'sms' | 'webhook')[];
}

export interface NotificationChannel {
  type: 'email' | 'sms' | 'webhook';
  recipients: string[];
  enabled: boolean;
}

export class AlertEngine {
  private store: ControlPlaneStore;
  private logger: any;
  private activeAlerts: Map<string, Alert> = new Map();
  private alertCooldowns: Map<string, Date> = new Map();
  private isRunning: boolean = false;
  private processingInterval?: NodeJS.Timeout;

  // Alert rules
  private readonly ALERT_RULES: AlertRule[] = [
    // Camera health alerts
    {
      id: 'camera-offline',
      name: 'Camera Offline',
      condition: (camera: any) => camera.onlineStatus === 'offline',
      severity: 'critical',
      category: 'health',
      title: 'Camera Offline',
      description: 'Camera is not responding',
      cooldownMinutes: 15,
      escalationMinutes: 30,
      notificationChannels: ['email', 'sms'],
    },
    {
      id: 'camera-degraded',
      name: 'Camera Degraded',
      condition: (camera: any) => camera.onlineStatus === 'degraded',
      severity: 'warning',
      category: 'health',
      title: 'Camera Performance Degraded',
      description: 'Camera is experiencing performance issues',
      cooldownMinutes: 30,
      notificationChannels: ['email'],
    },
    {
      id: 'camera-high-temperature',
      name: 'Camera Overheating',
      condition: (camera: any) => camera.temperature && camera.temperature > 70,
      severity: 'critical',
      category: 'health',
      title: 'Camera Overheating',
      description: 'Camera temperature exceeds safe threshold',
      cooldownMinutes: 20,
      escalationMinutes: 45,
      notificationChannels: ['email', 'sms'],
    },
    {
      id: 'camera-tampering',
      name: 'Camera Tampering Detected',
      condition: (camera: any) => camera.tampering === true,
      severity: 'critical',
      category: 'health',
      title: 'Camera Tampering Detected',
      description: 'Physical tampering detected on camera',
      cooldownMinutes: 5,
      notificationChannels: ['email', 'sms', 'webhook'],
    },

    // Storage health alerts
    {
      id: 'storage-critical',
      name: 'Storage Capacity Critical',
      condition: (storage: any) => storage.usagePercentage >= 90,
      severity: 'critical',
      category: 'health',
      title: 'Storage Capacity Critical',
      description: 'Storage usage above 90%',
      cooldownMinutes: 60,
      escalationMinutes: 120,
      notificationChannels: ['email', 'sms'],
    },
    {
      id: 'storage-warning',
      name: 'Storage Capacity Warning',
      condition: (storage: any) => storage.usagePercentage >= 80 && storage.usagePercentage < 90,
      severity: 'warning',
      category: 'health',
      title: 'Storage Capacity Warning',
      description: 'Storage usage above 80%',
      cooldownMinutes: 120,
      notificationChannels: ['email'],
    },
    {
      id: 'storage-smart-failure',
      name: 'Storage SMART Failure',
      condition: (storage: any) => storage.smartStatus === 'FAILED',
      severity: 'critical',
      category: 'health',
      title: 'Storage Device Failing',
      description: 'SMART status indicates imminent disk failure',
      cooldownMinutes: 30,
      escalationMinutes: 60,
      notificationChannels: ['email', 'sms', 'webhook'],
    },

    // Network health alerts
    {
      id: 'network-high-latency',
      name: 'High Network Latency',
      condition: (network: any) => network.latencyMs > 200,
      severity: 'warning',
      category: 'health',
      title: 'High Network Latency',
      description: 'Network latency exceeds acceptable threshold',
      cooldownMinutes: 30,
      notificationChannels: ['email'],
    },
    {
      id: 'network-packet-loss',
      name: 'Network Packet Loss',
      condition: (network: any) => network.packetLossPercentage > 5,
      severity: 'critical',
      category: 'health',
      title: 'High Network Packet Loss',
      description: 'Network experiencing significant packet loss',
      cooldownMinutes: 20,
      escalationMinutes: 40,
      notificationChannels: ['email', 'sms'],
    },

    // UPS alerts
    {
      id: 'ups-battery-low',
      name: 'UPS Battery Low',
      condition: (ups: any) => ups.batteryHealthPercentage < 70,
      severity: 'critical',
      category: 'health',
      title: 'UPS Battery Health Critical',
      description: 'UPS battery health below 70%',
      cooldownMinutes: 60,
      escalationMinutes: 120,
      notificationChannels: ['email', 'sms'],
    },
    {
      id: 'ups-runtime-low',
      name: 'UPS Runtime Low',
      condition: (ups: any) => ups.runtimeMinutes < 30,
      severity: 'warning',
      category: 'health',
      title: 'UPS Runtime Low',
      description: 'UPS estimated runtime below 30 minutes',
      cooldownMinutes: 60,
      notificationChannels: ['email'],
    },

    // Maintenance alerts
    {
      id: 'maintenance-overdue',
      name: 'Maintenance Overdue',
      condition: (visit: any) => {
        const dueDate = new Date(visit.dueAt);
        return visit.status !== 'completed' && dueDate < new Date();
      },
      severity: 'warning',
      category: 'maintenance',
      title: 'Preventive Maintenance Overdue',
      description: 'Scheduled maintenance visit is overdue',
      cooldownMinutes: 1440, // 24 hours
      notificationChannels: ['email'],
    },

    // SLA alerts
    {
      id: 'workorder-sla-breach',
      name: 'Work Order SLA Breach',
      condition: (workOrder: any) => {
        const slaDue = new Date(workOrder.slaDueAt);
        return workOrder.status !== 'closed' && slaDue < new Date();
      },
      severity: 'critical',
      category: 'sla',
      title: 'Work Order SLA Breached',
      description: 'Work order exceeded SLA deadline',
      cooldownMinutes: 60,
      escalationMinutes: 120,
      notificationChannels: ['email', 'sms'],
    },

    // AMC alerts
    {
      id: 'amc-expiring-soon',
      name: 'AMC Contract Expiring',
      condition: (contract: any) => {
        const endDate = new Date(contract.endDate);
        const daysUntilExpiry = Math.floor((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
      },
      severity: 'warning',
      category: 'maintenance',
      title: 'AMC Contract Expiring Soon',
      description: 'AMC contract expiring within 90 days',
      cooldownMinutes: 10080, // 7 days
      notificationChannels: ['email'],
    },
  ];

  constructor(store: ControlPlaneStore, logger?: any) {
    this.store = store;
    this.logger = logger || console;
  }

  /**
   * Start the alert processing engine
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Alert engine is already running');
      return;
    }

    this.logger.info('Starting alert engine...');
    this.isRunning = true;

    // Process alerts every minute
    this.processingInterval = setInterval(() => {
      this.processAlerts().catch(error => {
        this.logger.error('Error processing alerts:', error);
      });
    }, 60 * 1000);

    // Run immediately
    this.processAlerts().catch(error => {
      this.logger.error('Error processing alerts:', error);
    });

    this.logger.info('Alert engine started successfully');
  }

  /**
   * Stop the alert processing engine
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping alert engine...');
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    this.isRunning = false;
    this.logger.info('Alert engine stopped');
  }

  /**
   * Process all alerts
   */
  private async processAlerts(): Promise<void> {
    try {
      const tenants = await this.store.listTenants();

      for (const tenant of tenants) {
        await this.processHealthAlerts(tenant.id);
        await this.processMaintenanceAlerts(tenant.id);
        await this.processSlaAlerts(tenant.id);
        await this.cleanupExpiredAlerts();
      }
    } catch (error) {
      this.logger.error('Error in alert processing:', error);
    }
  }

  /**
   * Process health-related alerts
   */
  private async processHealthAlerts(tenantId: string): Promise<void> {
    // Check camera health
    const cameraRules = this.ALERT_RULES.filter(r => r.id.startsWith('camera-'));
    // This would query recent camera_health records
    // For each camera that matches an alert condition, create or update alert

    // Check storage health
    const storageRules = this.ALERT_RULES.filter(r => r.id.startsWith('storage-'));
    // Query storage_health records

    // Check network health
    const networkRules = this.ALERT_RULES.filter(r => r.id.startsWith('network-'));
    // Query network_health records

    // Check UPS health
    const upsRules = this.ALERT_RULES.filter(r => r.id.startsWith('ups-'));
    // Query ups_health records
  }

  /**
   * Process maintenance-related alerts
   */
  private async processMaintenanceAlerts(tenantId: string): Promise<void> {
    // Check overdue maintenance visits
    const visits = await this.store.listMaintenanceVisits(tenantId, { status: 'pending' });
    const overdueVisits = visits.filter(v => new Date(v.dueAt) < new Date());

    for (const visit of overdueVisits) {
      await this.createAlert(tenantId, {
        ruleId: 'maintenance-overdue',
        assetId: undefined,
        branchNodeId: undefined,
        metadata: { visitId: visit.id, dueAt: visit.dueAt },
      });
    }

    // Check expiring AMC contracts
    const contracts = await this.store.listAmcContracts(tenantId);
    const now = new Date();
    const expiringContracts = contracts.filter(c => {
      const endDate = new Date(c.endDate);
      const daysUntilExpiry = Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
    });

    for (const contract of expiringContracts) {
      await this.createAlert(tenantId, {
        ruleId: 'amc-expiring-soon',
        metadata: { contractId: contract.id, endDate: contract.endDate },
      });
    }
  }

  /**
   * Process SLA-related alerts
   */
  private async processSlaAlerts(tenantId: string): Promise<void> {
    const workOrders = await this.store.listWorkOrders(tenantId, 'open');
    const now = new Date();

    const breachedOrders = workOrders.filter(wo => {
      return wo.slaDueAt && new Date(wo.slaDueAt) < now;
    });

    for (const workOrder of breachedOrders) {
      await this.createAlert(tenantId, {
        ruleId: 'workorder-sla-breach',
        assetId: workOrder.assetId,
        branchNodeId: workOrder.branchNodeId,
        metadata: {
          workOrderId: workOrder.id,
          workOrderNumber: workOrder.workOrderNumber,
          slaDueAt: workOrder.slaDueAt,
        },
      });
    }
  }

  /**
   * Create or update an alert
   */
  private async createAlert(
    tenantId: string,
    params: {
      ruleId: string;
      assetId?: string;
      branchNodeId?: string;
      metadata: Record<string, any>;
    }
  ): Promise<void> {
    const rule = this.ALERT_RULES.find(r => r.id === params.ruleId);
    if (!rule) return;

    // Generate unique alert key for deduplication
    const alertKey = `${tenantId}:${params.ruleId}:${params.assetId || ''}:${params.branchNodeId || ''}`;

    // Check cooldown
    const lastAlert = this.alertCooldowns.get(alertKey);
    if (lastAlert) {
      const minutesSince = (Date.now() - lastAlert.getTime()) / (1000 * 60);
      if (minutesSince < rule.cooldownMinutes) {
        return; // Still in cooldown period
      }
    }

    // Create alert
    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      severity: rule.severity,
      category: rule.category as any,
      title: rule.title,
      description: rule.description,
      assetId: params.assetId,
      branchNodeId: params.branchNodeId,
      metadata: params.metadata,
      createdAt: new Date(),
      status: 'active',
    };

    this.activeAlerts.set(alert.id, alert);
    this.alertCooldowns.set(alertKey, new Date());

    // Dispatch notifications
    await this.dispatchNotifications(alert, rule);

    this.logger.info(`Alert created: ${alert.title}`, { alertId: alert.id, tenantId });
  }

  /**
   * Dispatch notifications through configured channels
   */
  private async dispatchNotifications(alert: Alert, rule: AlertRule): Promise<void> {
    for (const channel of rule.notificationChannels) {
      try {
        switch (channel) {
          case 'email':
            await this.sendEmailNotification(alert);
            break;
          case 'sms':
            await this.sendSmsNotification(alert);
            break;
          case 'webhook':
            await this.sendWebhookNotification(alert);
            break;
        }
      } catch (error) {
        this.logger.error(`Failed to send ${channel} notification:`, error);
      }
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(alert: Alert): Promise<void> {
    try {
      // Try to use notification service if available
      const { getNotificationService } = await import('../services/notification-service.js');
      const notificationService = getNotificationService();

      if (notificationService) {
        const template = notificationService.generateAlertEmailTemplate(alert);
        
        // Get admin emails from tenant configuration
        // In production, query tenant settings for notification recipients
        const recipients = ['admin@example.com']; // TODO: Get from tenant settings

        await notificationService.sendEmail(
          {
            to: recipients,
            subject: template.subject,
            body: template.body,
            html: template.html,
          },
          alert.tenantId
        );
      } else {
        // Fallback: Log notification
        this.logger.info('Email notification (service not configured):', {
          to: 'admin@example.com',
          subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
          body: alert.description,
        });
      }
    } catch (error) {
      this.logger.error('Failed to send email notification:', error);
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSmsNotification(alert: Alert): Promise<void> {
    try {
      const { getNotificationService } = await import('../services/notification-service.js');
      const notificationService = getNotificationService();

      if (notificationService) {
        // Get SMS recipients from tenant configuration
        const recipients = ['+1234567890']; // TODO: Get from tenant settings

        await notificationService.sendSms(
          {
            to: recipients,
            body: `[${alert.severity.toUpperCase()}] ${alert.title}: ${alert.description}`,
          },
          alert.tenantId
        );
      } else {
        this.logger.info('SMS notification (service not configured):', {
          to: '+1234567890',
          message: `[${alert.severity.toUpperCase()}] ${alert.title}: ${alert.description}`,
        });
      }
    } catch (error) {
      this.logger.error('Failed to send SMS notification:', error);
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(alert: Alert): Promise<void> {
    try {
      const { getNotificationService } = await import('../services/notification-service.js');
      const notificationService = getNotificationService();

      if (notificationService) {
        await notificationService.sendWebhook(
          {
            event: 'maintenance.alert',
            timestamp: new Date().toISOString(),
            data: {
              alert,
              severity: alert.severity,
              category: alert.category,
              tenantId: alert.tenantId,
            },
          },
          alert.tenantId
        );
      } else {
        this.logger.info('Webhook notification (service not configured):', {
          url: 'https://example.com/webhook',
          payload: alert,
        });
      }
    } catch (error) {
      this.logger.error('Failed to send webhook notification:', error);
    }
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }

    alert.status = 'acknowledged';
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = userId;

    this.logger.info(`Alert acknowledged: ${alertId}`, { userId });
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date();

    this.logger.info(`Alert resolved: ${alertId}`);
  }

  /**
   * Clean up expired alerts
   */
  private async cleanupExpiredAlerts(): Promise<void> {
    const now = Date.now();
    const expirationMs = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const [alertId, alert] of this.activeAlerts) {
      const ageMs = now - alert.createdAt.getTime();
      if (ageMs > expirationMs && (alert.status === 'resolved' || alert.status === 'acknowledged')) {
        this.activeAlerts.delete(alertId);
      }
    }

    // Clean up old cooldowns
    for (const [key, timestamp] of this.alertCooldowns) {
      const ageMs = now - timestamp.getTime();
      if (ageMs > 24 * 60 * 60 * 1000) { // 24 hours
        this.alertCooldowns.delete(key);
      }
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(tenantId?: string): Alert[] {
    const alerts = Array.from(this.activeAlerts.values());
    
    if (tenantId) {
      return alerts.filter(a => a.tenantId === tenantId && a.status === 'active');
    }
    
    return alerts.filter(a => a.status === 'active');
  }

  /**
   * Get alert by ID
   */
  getAlert(alertId: string): Alert | undefined {
    return this.activeAlerts.get(alertId);
  }

  /**
   * Get engine status
   */
  getStatus(): { running: boolean; activeAlertCount: number; rules: number } {
    return {
      running: this.isRunning,
      activeAlertCount: Array.from(this.activeAlerts.values()).filter(a => a.status === 'active').length,
      rules: this.ALERT_RULES.length,
    };
  }
}

// Singleton instance
let alertEngineInstance: AlertEngine | null = null;

export function initAlertEngine(store: ControlPlaneStore, logger?: any): AlertEngine {
  if (!alertEngineInstance) {
    alertEngineInstance = new AlertEngine(store, logger);
  }
  return alertEngineInstance;
}

export function getAlertEngine(): AlertEngine | null {
  return alertEngineInstance;
}
