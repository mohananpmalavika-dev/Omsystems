/**
 * Certificate Change Event Handler
 * Handles certificate rotation, change detection, and security alerts
 */

import { EventEmitter } from 'events';
import { certificateRepository } from './certificate-repository';
import { CertificateChangeEvent } from './types';

export interface CertificateChangeAnalysis {
  changeType: 'ROTATION' | 'RENEWAL' | 'REPLACEMENT' | 'UNKNOWN';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  authorized: boolean | 'UNKNOWN';
  indicators: string[];
  recommendations: string[];
}

export class CertificateChangeEventHandler extends EventEmitter {
  constructor() {
    super();
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for certificate changes
   */
  private setupEventListeners(): void {
    certificateRepository.on('certificate.changed', (event: CertificateChangeEvent) => {
      this.handleCertificateChange(event);
    });
  }

  /**
   * Handle certificate change event
   */
  private async handleCertificateChange(event: CertificateChangeEvent): Promise<void> {
    console.log(`🔄 Certificate change detected for device ${event.deviceId}`);

    try {
      // Analyze the change
      const analysis = await this.analyzeCertificateChange(event);

      // Emit analyzed event
      this.emit('certificate.change.analyzed', {
        event,
        analysis
      });

      // Create security alert if necessary
      if (analysis.severity === 'HIGH' || analysis.severity === 'CRITICAL') {
        await this.createSecurityAlert(event, analysis);
      }

      // Log for audit trail
      await this.logCertificateChange(event, analysis);

      console.log(`✓ Certificate change processed: ${analysis.changeType} (${analysis.severity})`);
    } catch (error) {
      console.error('Failed to handle certificate change:', error);
    }
  }

  /**
   * Analyze certificate change to determine type and severity
   */
  private async analyzeCertificateChange(
    event: CertificateChangeEvent
  ): Promise<CertificateChangeAnalysis> {
    const indicators: string[] = [];
    const recommendations: string[] = [];

    // Get previous and current certificates
    const previousCert = await certificateRepository.getCertificateByFingerprint(
      event.previousFingerprint
    );

    const currentCert = await certificateRepository.getCertificateByFingerprint(
      event.currentFingerprint
    );

    // Determine change type
    let changeType: CertificateChangeAnalysis['changeType'] = 'UNKNOWN';
    let severity: CertificateChangeAnalysis['severity'] = 'MEDIUM';
    let authorized: boolean | 'UNKNOWN' = 'UNKNOWN';

    if (previousCert && currentCert) {
      // Compare certificates to determine change type
      
      // Same issuer = likely renewal
      if (previousCert.issuer === currentCert.issuer) {
        changeType = 'RENEWAL';
        severity = 'LOW';
        indicators.push('Same issuer as previous certificate');
        
        // Check if subject also matches
        if (previousCert.subject === currentCert.subject) {
          indicators.push('Same subject as previous certificate');
          authorized = true;
        } else {
          indicators.push('Subject changed during renewal');
          severity = 'MEDIUM';
          recommendations.push('Verify subject change was intentional');
        }
      } else {
        // Different issuer
        changeType = 'REPLACEMENT';
        severity = 'MEDIUM';
        indicators.push('Certificate issuer changed');
        recommendations.push('Verify new issuer is authorized');

        // If subject also changed, could be device replacement
        if (previousCert.subject !== currentCert.subject) {
          indicators.push('Subject also changed');
          severity = 'HIGH';
          recommendations.push('Verify this is not unauthorized device replacement');
        }
      }

      // Check timing
      const daysSinceDiscovery = Math.floor(
        (currentCert.discoveredAt.getTime() - previousCert.discoveredAt.getTime()) /
        (1000 * 60 * 60 * 24)
      );

      if (daysSinceDiscovery < 1) {
        indicators.push('Certificate changed within 24 hours');
        severity = Math.max(severity, 'HIGH') as any;
        recommendations.push('Verify rapid certificate rotation was planned');
      }

      // Check if previous cert was close to expiry
      const daysUntilPreviousExpiry = Math.floor(
        (previousCert.notAfter.getTime() - previousCert.discoveredAt.getTime()) /
        (1000 * 60 * 60 * 24)
      );

      if (daysUntilPreviousExpiry <= 30) {
        indicators.push('Previous certificate was expiring soon');
        changeType = 'ROTATION';
        authorized = true;
      } else if (daysUntilPreviousExpiry > 180) {
        indicators.push('Previous certificate had significant validity remaining');
        severity = Math.max(severity, 'MEDIUM') as any;
        recommendations.push('Investigate reason for early rotation');
      }
    } else if (currentCert && !previousCert) {
      // First certificate for this device
      changeType = 'UNKNOWN';
      severity = 'LOW';
      indicators.push('First certificate observed for device');
    }

    return {
      changeType,
      severity,
      authorized,
      indicators,
      recommendations
    };
  }

  /**
   * Create security alert for certificate change
   */
  private async createSecurityAlert(
    event: CertificateChangeEvent,
    analysis: CertificateChangeAnalysis
  ): Promise<void> {
    const alert = {
      type: 'CERTIFICATE_CHANGED',
      severity: analysis.severity,
      deviceId: event.deviceId,
      tenantId: event.tenantId,
      timestamp: event.timestamp,
      title: `Certificate ${analysis.changeType.toLowerCase()} detected`,
      description: `Device certificate changed from ${event.previousFingerprint.substring(0, 16)}... to ${event.currentFingerprint.substring(0, 16)}...`,
      indicators: analysis.indicators,
      recommendations: analysis.recommendations,
      authorized: analysis.authorized
    };

    // Emit alert event
    this.emit('security.alert', alert);

    console.log(`🚨 Security alert created: ${alert.title} (${alert.severity})`);
  }

  /**
   * Log certificate change for audit trail
   */
  private async logCertificateChange(
    event: CertificateChangeEvent,
    analysis: CertificateChangeAnalysis
  ): Promise<void> {
    const logEntry = {
      timestamp: event.timestamp,
      eventType: 'CERTIFICATE_CHANGE',
      tenantId: event.tenantId,
      deviceId: event.deviceId,
      previousFingerprint: event.previousFingerprint,
      currentFingerprint: event.currentFingerprint,
      changeType: analysis.changeType,
      severity: analysis.severity,
      authorized: analysis.authorized,
      reason: event.reason
    };

    // In production, write to audit log storage
    console.log('📝 Certificate change audit log:', JSON.stringify(logEntry, null, 2));
  }

  /**
   * Get certificate change history for device
   */
  async getCertificateChangeHistory(deviceId: string): Promise<any[]> {
    const history = await certificateRepository.getCertificateHistory(deviceId);
    
    const changes: any[] = [];

    for (let i = 1; i < history.length; i++) {
      const previous = history[i];
      const current = history[i - 1];

      changes.push({
        timestamp: current.discoveredAt,
        previousFingerprint: previous.fingerprintSha256,
        currentFingerprint: current.fingerprintSha256,
        previousExpiry: previous.notAfter,
        currentExpiry: current.notAfter
      });
    }

    return changes;
  }
}

// Singleton instance
export const certificateChangeEventHandler = new CertificateChangeEventHandler();
