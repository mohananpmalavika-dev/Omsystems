/**
 * Security Operations Center (SOC) Service
 * Unified security dashboard with real-time monitoring and alerts
 */

import {
  SecurityPosture,
  SecurityMetrics,
  SecurityAlert,
  SecurityAlertType,
  SecurityTrend
} from '../types/security.types';
import { zeroTrustService } from './zero-trust.service';
import { certificateManager } from './certificate-manager.service';
import { tamperDetectionService } from './tamper-detection.service';
import { ransomwareDetectionService } from './ransomware-detection.service';
import { secureBootTPMService } from './secure-boot-tpm.service';
import crypto from 'crypto';

export class SecurityOperationsService {
  private alerts: Map<string, SecurityAlert> = new Map();
  private postureHistory: SecurityPosture[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startMonitoring();
  }

  /**
   * Get current security posture
   */
  async getSecurityPosture(): Promise<SecurityPosture> {
    console.log('📊 Calculating security posture...');

    // Gather metrics from all security services
    const metrics = await this.gatherMetrics();

    // Calculate overall score (0-100)
    const overallScore = this.calculateOverallScore(metrics);

    // Get active alerts
    const alerts = await this.getActiveAlerts();

    // Calculate trends
    const trends = await this.calculateTrends();

    const provenance = this.calculateProvenance(metrics);
    const posture: SecurityPosture = {
      overallScore,
      timestamp: new Date(),
      provenance,
      available: provenance !== 'UNAVAILABLE',
      reason: provenance === 'UNAVAILABLE' ? 'missing_security_evidence' : undefined,
      metrics,
      alerts,
      trends
    };

    // Store in history
    this.postureHistory.push(posture);
    if (this.postureHistory.length > 1000) {
      this.postureHistory.shift(); // Keep last 1000
    }

    return posture;
  }

  /**
   * Create security alert
   */
  async createAlert(
    type: SecurityAlertType,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    title: string,
    description: string,
    source: string,
    actions: string[] = []
  ): Promise<SecurityAlert> {
    const alertId = crypto.randomBytes(16).toString('hex');

    const alert: SecurityAlert = {
      id: alertId,
      type,
      severity,
      title,
      description,
      timestamp: new Date(),
      source,
      acknowledged: false,
      actions
    };

    this.alerts.set(alertId, alert);

    console.log(`🚨 Security Alert: [${severity}] ${title}`);

    // Auto-escalate critical alerts
    if (severity === 'CRITICAL') {
      await this.escalateAlert(alert);
    }

    return alert;
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);

    if (!alert) {
      return false;
    }

    alert.acknowledged = true;

    console.log(`✓ Alert acknowledged: ${alertId}`);

    return true;
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);

    if (!alert) {
      return false;
    }

    alert.resolvedAt = new Date();

    console.log(`✓ Alert resolved: ${alertId}`);

    return true;
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<SecurityAlert[]> {
    return Array.from(this.alerts.values())
      .filter(a => !a.resolvedAt)
      .sort((a, b) => {
        // Sort by severity, then timestamp
        const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.timestamp.getTime() - a.timestamp.getTime();
      });
  }

  /**
   * Get security trends
   */
  async getSecurityTrends(days: number = 7): Promise<SecurityTrend[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentHistory = this.postureHistory.filter(p => p.timestamp >= cutoffDate);

    if (recentHistory.length < 2) {
      return [];
    }

    const current = recentHistory[recentHistory.length - 1];
    const previous = recentHistory[0];

    return this.calculateTrends(current, previous);
  }

  /**
   * Get security report
   */
  async getSecurityReport(startDate: Date, endDate: Date): Promise<{
    period: { start: Date; end: Date };
    averageScore: number;
    alerts: {
      total: number;
      bySeverity: Record<string, number>;
      byType: Record<string, number>;
    };
    incidents: {
      ransomware: number;
      tamper: number;
      zeroTrustViolations: number;
    };
    recommendations: string[];
  }> {
    const periodHistory = this.postureHistory.filter(
      p => p.timestamp >= startDate && p.timestamp <= endDate
    );

    const averageScore = periodHistory.length > 0
      ? periodHistory.reduce((sum, p) => sum + p.overallScore, 0) / periodHistory.length
      : 0;

    const allAlerts = Array.from(this.alerts.values()).filter(
      a => a.timestamp >= startDate && a.timestamp <= endDate
    );

    const bySeverity: Record<string, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0
    };

    const byType: Record<string, number> = {};

    for (const alert of allAlerts) {
      bySeverity[alert.severity]++;
      byType[alert.type] = (byType[alert.type] || 0) + 1;
    }

    // Get incident counts
    const ransomwareEvents = await ransomwareDetectionService.listEvents();
    const tamperEvents = await tamperDetectionService.listEvents();

    const recommendations = await this.generateRecommendations(periodHistory);

    return {
      period: { start: startDate, end: endDate },
      averageScore,
      alerts: {
        total: allAlerts.length,
        bySeverity,
        byType
      },
      incidents: {
        ransomware: ransomwareEvents.filter(e => 
          e.detectedAt >= startDate && e.detectedAt <= endDate
        ).length,
        tamper: tamperEvents.filter(e =>
          e.detectedAt >= startDate && e.detectedAt <= endDate
        ).length,
        zeroTrustViolations: 0 // Would come from zero trust logs
      },
      recommendations
    };
  }

  /**
   * Run security health check
   */
  async runHealthCheck(): Promise<{
    overall: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    checks: Array<{
      name: string;
      status: 'PASS' | 'WARN' | 'FAIL';
      message: string;
    }>;
  }> {
    console.log('🏥 Running security health check...');

    const checks = [];

    // Check 1: Certificate health
    const certHealth = await certificateManager.getHealth();
    checks.push({
      name: 'Certificates',
      status: certHealth.expired > 0 ? 'FAIL' : certHealth.expiringSoon > 5 ? 'WARN' : 'PASS',
      message: `${certHealth.healthy}/${certHealth.totalCertificates} healthy, ${certHealth.expired} expired, ${certHealth.expiringSoon} expiring soon`
    });

    // Check 2: Zero Trust compliance
    const ztMetrics = await zeroTrustService.getMetrics();
    const ztCompliance = ztMetrics.totalDevices > 0
      ? (ztMetrics.compliantDevices / ztMetrics.totalDevices) * 100
      : 0;
    checks.push({
      name: 'Zero Trust Compliance',
      status: ztMetrics.totalDevices === 0 ? 'WARN' : ztCompliance < 80 ? 'FAIL' : ztCompliance < 95 ? 'WARN' : 'PASS',
      message: ztMetrics.totalDevices === 0
        ? 'No zero trust device data available'
        : `${ztCompliance.toFixed(1)}% devices compliant (${ztMetrics.compliantDevices}/${ztMetrics.totalDevices})`
    });

    // Check 3: Active ransomware threats
    const ransomwareStats = await ransomwareDetectionService.getStatistics();
    checks.push({
      name: 'Ransomware Detection',
      status: ransomwareStats.activeThreats > 0 ? 'FAIL' : 'PASS',
      message: `${ransomwareStats.activeThreats} active threats detected`
    });

    // Check 4: Tamper events
    const tamperStats = await tamperDetectionService.getStatistics();
    checks.push({
      name: 'Tamper Detection',
      status: tamperStats.active > 10 ? 'WARN' : 'PASS',
      message: `${tamperStats.active} active tamper events`
    });

    // Check 5: TPM attestation
    const tpmStats = await secureBootTPMService.getStatistics();
    const tpmHealth = tpmStats.totalTPMDevices > 0
      ? (tpmStats.healthyTPM / tpmStats.totalTPMDevices) * 100
      : 0;
    checks.push({
      name: 'TPM Attestation',
      status: tpmStats.totalTPMDevices === 0 ? 'WARN' : tpmStats.failedAttestations > 5 ? 'FAIL' : tpmStats.failedAttestations > 0 ? 'WARN' : 'PASS',
      message: tpmStats.totalTPMDevices === 0
        ? 'No TPM attestation data available'
        : `${tpmHealth.toFixed(1)}% healthy, ${tpmStats.failedAttestations} failed attestations`
    });

    // Determine overall status
    const failCount = checks.filter(c => c.status === 'FAIL').length;
    const warnCount = checks.filter(c => c.status === 'WARN').length;

    let overall: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    if (failCount > 0) {
      overall = 'CRITICAL';
    } else if (warnCount > 0) {
      overall = 'WARNING';
    }

    console.log(`✓ Health check complete: ${overall} (${checks.filter(c => c.status === 'PASS').length}/${checks.length} passed)`);

    return {
      overall,
      checks
    };
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  private async gatherMetrics(): Promise<SecurityMetrics> {
    // Zero Trust metrics
    const ztMetrics = await zeroTrustService.getMetrics();

    // Certificate metrics
    const certHealth = await certificateManager.getHealth();
    const certScore = certHealth.totalCertificates > 0
      ? (certHealth.healthy / certHealth.totalCertificates) * 100
      : 0;

    // Ransomware metrics
    const ransomwareStats = await ransomwareDetectionService.getStatistics();

    // Tamper metrics
    const tamperStats = await tamperDetectionService.getStatistics();

    // TPM metrics
    const tpmStats = await secureBootTPMService.getStatistics();
    const tpmScore = tpmStats.totalTPMDevices > 0
      ? (tpmStats.healthyTPM / tpmStats.totalTPMDevices) * 100
      : 0;

    return {
      zeroTrust: {
        score: ztMetrics.totalDevices > 0
          ? (ztMetrics.compliantDevices / ztMetrics.totalDevices) * 100
          : 0,
        devicesCompliant: ztMetrics.compliantDevices,
        devicesTotal: ztMetrics.totalDevices,
        highRiskSessions: ztMetrics.highRiskDevices
      },
      encryption: {
        score: 0,
        videosEncrypted: 0,
        videosTotal: 0,
        tlsCompliance: 0
      },
      certificates: {
        score: certScore,
        healthy: certHealth.healthy,
        expiringSoon: certHealth.expiringSoon,
        expired: certHealth.expired,
        revoked: certHealth.revoked
      },
      secrets: {
        status: 'UNAVAILABLE',
        rotationCompliance: 0,
        expiring: 0
      },
      ransomware: {
        activeThreats: ransomwareStats.activeThreats,
        eventsToday: 0,
        riskLevel: ransomwareStats.activeThreats > 0 ? 'HIGH' : 'NONE',
        available: true
      },
      tamper: {
        activeEvents: tamperStats.active,
        criticalEvents: tamperStats.bySeverity['CRITICAL'] || 0,
        resolvedToday: 0,
        available: true
      },
      secureBoot: {
        score: tpmStats.totalSecureBoot > 0
          ? (tpmStats.validSecureBoot / tpmStats.totalSecureBoot) * 100
          : 0,
        compliantDevices: tpmStats.validSecureBoot,
        totalDevices: tpmStats.totalSecureBoot
      },
      tpm: {
        score: tpmScore,
        attestedDevices: tpmStats.healthyTPM,
        totalDevices: tpmStats.totalTPMDevices,
        failedAttestations: tpmStats.failedAttestations
      }
    };
  }

  private calculateOverallScore(metrics: SecurityMetrics): number {
    const weights = {
      zeroTrust: 0.20,
      encryption: 0.15,
      certificates: 0.15,
      ransomware: 0.20,
      tamper: 0.10,
      secureBoot: 0.10,
      tpm: 0.10
    };

    let score = 0;
    score += metrics.zeroTrust.score * weights.zeroTrust;
    score += metrics.encryption.score * weights.encryption;
    score += metrics.certificates.score * weights.certificates;
    const ransomwareScore = metrics.ransomware.available
      ? (metrics.ransomware.activeThreats === 0 ? 100 : 0)
      : 0;
    const tamperScore = metrics.tamper.available
      ? (metrics.tamper.criticalEvents === 0 ? 100 : 50)
      : 0;

    score += ransomwareScore * weights.ransomware;
    score += tamperScore * weights.tamper;
    score += metrics.secureBoot.score * weights.secureBoot;
    score += metrics.tpm.score * weights.tpm;

    return Math.round(score);
  }

  private calculateProvenance(metrics: SecurityMetrics): 'REAL' | 'DEGRADED' | 'UNAVAILABLE' {
    const evidenceFlags = {
      zeroTrust: metrics.zeroTrust.devicesTotal > 0,
      certificates: (metrics.certificates.healthy + metrics.certificates.expiringSoon + metrics.certificates.expired + metrics.certificates.revoked) > 0,
      encryption: metrics.encryption.videosTotal > 0 || metrics.encryption.tlsCompliance > 0,
      secrets: metrics.secrets.status !== 'UNAVAILABLE',
      secureBoot: metrics.secureBoot.totalDevices > 0,
      tpm: metrics.tpm.totalDevices > 0,
      ransomware: metrics.ransomware.available,
      tamper: metrics.tamper.available
    };

    const evidenceCount = Object.values(evidenceFlags).filter(Boolean).length;
    if (evidenceCount === 0) {
      return 'UNAVAILABLE';
    }
    if (evidenceCount < Object.keys(evidenceFlags).length) {
      return 'DEGRADED';
    }
    return 'REAL';
  }

  private async calculateTrends(current?: SecurityPosture, previous?: SecurityPosture): Promise<SecurityTrend[]> {
    if (!current || !previous) {
      if (this.postureHistory.length < 2) {
        return [];
      }
      current = this.postureHistory[this.postureHistory.length - 1];
      previous = this.postureHistory[this.postureHistory.length - 2];
    }

    const trends: SecurityTrend[] = [];

    // Overall score trend
    trends.push(this.createTrend('Overall Score', current.overallScore, previous.overallScore));

    // Zero Trust trend
    trends.push(this.createTrend(
      'Zero Trust Compliance',
      current.metrics.zeroTrust.devicesCompliant,
      previous.metrics.zeroTrust.devicesCompliant
    ));

    // Certificate health trend
    trends.push(this.createTrend(
      'Certificate Health',
      current.metrics.certificates.healthy,
      previous.metrics.certificates.healthy
    ));

    return trends;
  }

  private createTrend(metric: string, current: number, previous: number): SecurityTrend {
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;

    let direction: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
    if (Math.abs(changePercent) > 5) {
      direction = change > 0 ? 'UP' : 'DOWN';
    }

    return {
      metric,
      current,
      previous,
      change,
      changePercent: Math.round(changePercent * 10) / 10,
      direction
    };
  }

  private async escalateAlert(alert: SecurityAlert): Promise<void> {
    console.log(`🚨 ESCALATING CRITICAL ALERT: ${alert.title}`);
    // In production: send to SOC, SMS, email, etc.
  }

  private async generateRecommendations(history: SecurityPosture[]): Promise<string[]> {
    const recommendations: string[] = [];

    if (history.length === 0) return recommendations;

    const latest = history[history.length - 1];

    // Check various metrics and generate recommendations
    if (latest.metrics.certificates.expiringSoon > 0) {
      recommendations.push(`Renew ${latest.metrics.certificates.expiringSoon} expiring certificates`);
    }

    if (latest.metrics.zeroTrust.highRiskSessions > 0) {
      recommendations.push(`Review ${latest.metrics.zeroTrust.highRiskSessions} high-risk sessions`);
    }

    if (latest.metrics.ransomware.activeThreats > 0) {
      recommendations.push('URGENT: Active ransomware threats detected - isolate affected systems');
    }

    if (latest.metrics.tamper.criticalEvents > 0) {
      recommendations.push(`Investigate ${latest.metrics.tamper.criticalEvents} critical tamper events`);
    }

    if (latest.overallScore < 80) {
      recommendations.push('Overall security posture below acceptable threshold - conduct security audit');
    }

    return recommendations;
  }

  private startMonitoring(): void {
    // Update security posture every 5 minutes
    this.monitoringInterval = setInterval(async () => {
      await this.getSecurityPosture();
    }, 5 * 60 * 1000);

    console.log('✓ Security Operations monitoring started');
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('Security Operations monitoring stopped');
    }
  }
}

export const securityOperationsService = new SecurityOperationsService();
