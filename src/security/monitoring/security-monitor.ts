/**
 * Security Monitoring and Alerting System
 * Real-time security event monitoring and notification
 */

import { EventEmitter } from 'events';
import { SecurityServicesFactory } from '../services';
import { getDatabase } from '../../config/database.js';

export interface SecurityAlert {
  id: string;
  type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  source: string;
  data: any;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export class SecurityMonitor extends EventEmitter {
  private static instance: SecurityMonitor;
  private securityServices: SecurityServicesFactory;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alertThresholds: Map<string, number> = new Map();

  private constructor() {
    super();
    this.securityServices = SecurityServicesFactory.getInstance();
    this.initializeThresholds();
    this.setupEventListeners();
  }

  static getInstance(): SecurityMonitor {
    if (!SecurityMonitor.instance) {
      SecurityMonitor.instance = new SecurityMonitor();
    }
    return SecurityMonitor.instance;
  }

  /**
   * Initialize alert thresholds
   */
  private initializeThresholds(): void {
    this.alertThresholds.set('certificate_expiry_days', 30);
    this.alertThresholds.set('secret_expiry_days', 30);
    this.alertThresholds.set('password_rotation_overdue_days', 7);
    this.alertThresholds.set('security_score_threshold', 80);
    this.alertThresholds.set('risk_score_threshold', 70);
    this.alertThresholds.set('max_failed_rotations', 3);
  }

  /**
   * Setup event listeners for all security services
   */
  private setupEventListeners(): void {
    // Certificate alerts
    this.securityServices.certificateManagement?.on('certificate:expiring-soon', (data) => {
      this.createAlert({
        type: 'certificate_expiring',
        severity: data.daysUntilExpiry <= 7 ? 'critical' : 'high',
        title: 'Certificate Expiring Soon',
        description: `Certificate "${data.name}" expires in ${data.daysUntilExpiry} days`,
        source: 'certificate_management',
        data
      });
    });

    this.securityServices.certificateManagement?.on('certificate:renewal-failed', (data) => {
      this.createAlert({
        type: 'certificate_renewal_failed',
        severity: 'critical',
        title: 'Certificate Renewal Failed',
        description: `Failed to renew certificate: ${data.error}`,
        source: 'certificate_management',
        data
      });
    });

    // Secret vault alerts
    this.securityServices.secretVault?.on('secret:expiring-soon', (data) => {
      this.createAlert({
        type: 'secret_expiring',
        severity: 'high',
        title: 'Secret Expiring Soon',
        description: `Secret "${data.name}" will expire soon`,
        source: 'secret_vault',
        data
      });
    });

    this.securityServices.secretVault?.on('secret:rotation-failed', (data) => {
      this.createAlert({
        type: 'secret_rotation_failed',
        severity: 'high',
        title: 'Secret Rotation Failed',
        description: `Failed to rotate secret: ${data.error}`,
        source: 'secret_vault',
        data
      });
    });

    // Password rotation alerts
    this.securityServices.passwordRotation?.on('rotation:failed', (data) => {
      this.createAlert({
        type: 'password_rotation_failed',
        severity: 'high',
        title: 'Password Rotation Failed',
        description: `Failed to rotate password for target ${data.targetId}: ${data.error}`,
        source: 'password_rotation',
        data
      });
    });

    this.securityServices.passwordRotation?.on('rotation:due', (data) => {
      this.createAlert({
        type: 'password_rotation_due',
        severity: 'medium',
        title: 'Password Rotation Due',
        description: `Password rotation is due for ${data.name}`,
        source: 'password_rotation',
        data
      });
    });

    // Zero Trust alerts
    this.securityServices.zeroTrust?.on('access:evaluated', (data) => {
      if (data.decision === 'deny' && data.riskScore > 80) {
        this.createAlert({
          type: 'high_risk_access_denied',
          severity: 'high',
          title: 'High Risk Access Denied',
          description: `Access denied for user ${data.userId} with risk score ${data.riskScore}`,
          source: 'zero_trust',
          data
        });
      }
    });

    // Security services factory alerts
    this.securityServices.on('security:alert', (alert) => {
      this.createAlert(alert);
    });
  }

  /**
   * Start monitoring
   */
  async startMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      console.log('Security monitoring already running');
      return;
    }

    console.log('Starting security monitoring...');

    // Run checks every 5 minutes
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.runSecurityChecks();
      } catch (error) {
        console.error('Security monitoring error:', error);
      }
    }, 5 * 60 * 1000);

    // Run initial check
    await this.runSecurityChecks();

    this.emit('monitoring:started');
    console.log('Security monitoring started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.emit('monitoring:stopped');
      console.log('Security monitoring stopped');
    }
  }

  /**
   * Run comprehensive security checks
   */
  private async runSecurityChecks(): Promise<void> {
    const checks = [
      this.checkCertificateHealth(),
      this.checkSecretHealth(),
      this.checkPasswordRotationHealth(),
      this.checkSecurityPosture(),
      this.checkThreatLevel(),
      this.checkTamperEvents(),
      this.checkComplianceStatus()
    ];

    await Promise.allSettled(checks);
  }

  /**
   * Check certificate health
   */
  private async checkCertificateHealth(): Promise<void> {
    try {
      const expiringCerts = await this.securityServices.certificateManagement.checkExpiringCertificates(30);
      
      if (expiringCerts.length > 0) {
        this.emit('check:certificates', {
          status: 'warning',
          expiringCount: expiringCerts.length
        });
      }
    } catch (error) {
      console.error('Certificate health check failed:', error);
    }
  }

  /**
   * Check secret health
   */
  private async checkSecretHealth(): Promise<void> {
    try {
      const expiringSecrets = await this.securityServices.secretVault.checkExpiringSecrets();
      
      if (expiringSecrets.length > 0) {
        this.emit('check:secrets', {
          status: 'warning',
          expiringCount: expiringSecrets.length
        });
      }
    } catch (error) {
      console.error('Secret health check failed:', error);
    }
  }

  /**
   * Check password rotation health
   */
  private async checkPasswordRotationHealth(): Promise<void> {
    try {
      const overdueTargets = await this.securityServices.passwordRotation.listTargets({ overdue: true });
      
      if (overdueTargets.length > 0) {
        this.createAlert({
          type: 'password_rotation_overdue',
          severity: 'high',
          title: 'Password Rotations Overdue',
          description: `${overdueTargets.length} password rotation(s) are overdue`,
          source: 'password_rotation',
          data: { count: overdueTargets.length, targets: overdueTargets }
        });
      }
    } catch (error) {
      console.error('Password rotation health check failed:', error);
    }
  }

  /**
   * Check security posture
   */
  private async checkSecurityPosture(): Promise<void> {
    try {
      const posture = await (this.securityServices as any).securityPosture?.getPosture();
      
      if (posture && posture.overallScore < this.alertThresholds.get('security_score_threshold')!) {
        this.createAlert({
          type: 'low_security_score',
          severity: posture.overallScore < 70 ? 'critical' : 'high',
          title: 'Low Security Score',
          description: `Security posture score is ${posture.overallScore}`,
          source: 'security_posture',
          data: posture
        });
      }

      if (posture && posture.criticalIssues > 0) {
        this.createAlert({
          type: 'critical_security_issues',
          severity: 'critical',
          title: 'Critical Security Issues Detected',
          description: `${posture.criticalIssues} critical security issue(s) detected`,
          source: 'security_posture',
          data: { criticalIssues: posture.criticalIssues }
        });
      }
    } catch (error) {
      console.error('Security posture check failed:', error);
    }
  }

  /**
   * Check threat level
   */
  private async checkThreatLevel(): Promise<void> {
    try {
      const activeThreats = await (this.securityServices as any).ransomwareDetection?.listThreats({ resolved: false });
      
      if (activeThreats && activeThreats.length > 0) {
        const criticalThreats = activeThreats.filter((t: any) => t.level === 'critical');
        
        if (criticalThreats.length > 0) {
          this.createAlert({
            type: 'critical_threats_active',
            severity: 'critical',
            title: 'Critical Threats Detected',
            description: `${criticalThreats.length} critical threat(s) detected`,
            source: 'ransomware_detection',
            data: { threats: criticalThreats }
          });
        }
      }
    } catch (error) {
      console.error('Threat level check failed:', error);
    }
  }

  /**
   * Check tamper events
   */
  private async checkTamperEvents(): Promise<void> {
    try {
      const recentTampers = await (this.securityServices as any).tamperDetection?.listTamperEvents({
        acknowledged: false,
        severity: 'critical'
      });
      
      if (recentTampers && recentTampers.length > 0) {
        this.createAlert({
          type: 'unacknowledged_tamper_events',
          severity: 'critical',
          title: 'Unacknowledged Tamper Events',
          description: `${recentTampers.length} critical tamper event(s) need attention`,
          source: 'tamper_detection',
          data: { events: recentTampers }
        });
      }
    } catch (error) {
      console.error('Tamper events check failed:', error);
    }
  }

  /**
   * Check compliance status
   */
  private async checkComplianceStatus(): Promise<void> {
    try {
      const frameworks = await (this.securityServices as any).securityPosture?.listComplianceFrameworks();
      
      if (frameworks) {
        for (const framework of frameworks) {
          if (framework.overallCompliance < 80) {
            this.createAlert({
              type: 'compliance_below_threshold',
              severity: 'medium',
              title: 'Compliance Below Threshold',
              description: `${framework.framework} compliance is ${framework.overallCompliance}%`,
              source: 'compliance',
              data: framework
            });
          }
        }
      }
    } catch (error) {
      console.error('Compliance status check failed:', error);
    }
  }

  /**
   * Create security alert
   */
  private async createAlert(alertData: Omit<SecurityAlert, 'id' | 'timestamp' | 'acknowledged'>): Promise<SecurityAlert> {
    const db = getDatabase();

    const alert: SecurityAlert = {
      id: this.generateId(),
      timestamp: new Date(),
      acknowledged: false,
      ...alertData
    };

    await db.collection('security_alerts').insertOne(alert);

    this.emit('alert:created', alert);

    // Send notifications based on severity
    await this.sendNotifications(alert);

    return alert;
  }

  /**
   * Send notifications for alert
   */
  private async sendNotifications(alert: SecurityAlert): Promise<void> {
    // Integration points for notifications:
    // - Email
    // - SMS
    // - Slack/Teams
    // - PagerDuty
    // - Webhook
    
    console.log(`[${alert.severity.toUpperCase()}] ${alert.title}: ${alert.description}`);
    
    // Emit for external notification handlers
    this.emit('notification:send', alert);
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(severity?: string): Promise<SecurityAlert[]> {
    const db = getDatabase();
    
    const query: any = { acknowledged: false };
    if (severity) {
      query.severity = severity;
    }
    
    return await db.collection('security_alerts')
      .find(query)
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const db = getDatabase();
    
    await db.collection('security_alerts').updateOne(
      { id: alertId },
      {
        $set: {
          acknowledged: true,
          acknowledgedBy: userId,
          acknowledgedAt: new Date()
        }
      }
    );

    this.emit('alert:acknowledged', { alertId, userId });
  }

  /**
   * Get monitoring statistics
   */
  async getStatistics(): Promise<any> {
    const db = getDatabase();
    
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const [
      totalAlerts,
      activeAlerts,
      criticalAlerts,
      alerts24h
    ] = await Promise.all([
      db.collection('security_alerts').countDocuments(),
      db.collection('security_alerts').countDocuments({ acknowledged: false }),
      db.collection('security_alerts').countDocuments({ severity: 'critical', acknowledged: false }),
      db.collection('security_alerts').countDocuments({ timestamp: { $gte: last24h } })
    ]);

    return {
      totalAlerts,
      activeAlerts,
      criticalAlerts,
      alerts24h,
      monitoringActive: this.monitoringInterval !== null
    };
  }

  private generateId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const stats = await this.getStatistics();
      
      return {
        status: 'healthy',
        details: stats
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }
}

// Export singleton instance
export const securityMonitor = SecurityMonitor.getInstance();
