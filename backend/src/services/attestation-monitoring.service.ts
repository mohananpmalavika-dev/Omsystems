/**
 * Attestation Monitoring Service
 * Generates alerts and monitors attestation health
 */

import { Pool } from 'pg';
import {
  AttestationStatus,
  AttestationEvent,
  AttestationEventType,
  DeviceAttestation
} from '../types/attestation.types';
import { DeviceAttestationRepository } from '../repositories/device-attestation.repository';

export interface AttestationAlert {
  id: string;
  tenantId: string;
  deviceId: string;
  deviceName?: string;
  
  type: AttestationEventType;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  
  title: string;
  message: string;
  details: any;
  
  timestamp: Date;
  
  requiresAction: boolean;
  suggestedActions?: string[];
}

export class AttestationMonitoringService {
  private attestationRepo: DeviceAttestationRepository;

  constructor(private pool: Pool) {
    this.attestationRepo = new DeviceAttestationRepository(pool);
  }

  /**
   * Process attestation result and generate alerts
   */
  async processAttestationResult(
    tenantId: string,
    deviceId: string,
    attestation: DeviceAttestation,
    deviceName?: string
  ): Promise<AttestationAlert[]> {
    const alerts: AttestationAlert[] = [];

    // Alert on failed attestation
    if (attestation.status === AttestationStatus.FAILED) {
      alerts.push(this.createFailureAlert(
        tenantId,
        deviceId,
        deviceName,
        attestation
      ));
    }

    // Alert on specific failure types
    if (attestation.failureReasons) {
      for (const reason of attestation.failureReasons) {
        const alert = this.createSpecificFailureAlert(
          tenantId,
          deviceId,
          deviceName,
          reason,
          attestation
        );
        if (alert) {
          alerts.push(alert);
        }
      }
    }

    // Alert on policy violation
    if (!attestation.policyVerified && attestation.quoteVerified) {
      alerts.push(this.createPolicyViolationAlert(
        tenantId,
        deviceId,
        deviceName,
        attestation
      ));
    }

    return alerts;
  }

  /**
   * Check for stale attestations and generate alerts
   */
  async checkStaleAttestations(
    tenantId: string,
    maxAgeSeconds: number = 86400
  ): Promise<AttestationAlert[]> {
    const staleAttestations = await this.attestationRepo.getStaleAttestations(
      tenantId,
      maxAgeSeconds
    );

    return staleAttestations.map(attestation =>
      this.createStaleAlert(tenantId, attestation)
    );
  }

  /**
   * Check for recent failures
   */
  async checkRecentFailures(
    tenantId: string,
    hoursBack: number = 1
  ): Promise<AttestationAlert[]> {
    const failures = await this.attestationRepo.getRecentFailures(
      tenantId,
      hoursBack
    );

    if (failures.length === 0) {
      return [];
    }

    // Group failures by device
    const deviceFailures = new Map<string, DeviceAttestation[]>();
    for (const failure of failures) {
      const existing = deviceFailures.get(failure.deviceId) || [];
      existing.push(failure);
      deviceFailures.set(failure.deviceId, existing);
    }

    const alerts: AttestationAlert[] = [];

    // Alert on repeated failures
    for (const [deviceId, deviceFailureList] of deviceFailures) {
      if (deviceFailureList.length >= 3) {
        alerts.push(this.createRepeatedFailureAlert(
          tenantId,
          deviceId,
          deviceFailureList
        ));
      }
    }

    return alerts;
  }

  /**
   * Create failure alert
   */
  private createFailureAlert(
    tenantId: string,
    deviceId: string,
    deviceName: string | undefined,
    attestation: DeviceAttestation
  ): AttestationAlert {
    const failureCount = attestation.failureReasons?.length || 0;

    return {
      id: `alert_${attestation.id}`,
      tenantId,
      deviceId,
      deviceName,
      type: AttestationEventType.ATTESTATION_FAILED,
      severity: 'ERROR',
      title: 'Device Attestation Failed',
      message: `Device ${deviceName || deviceId} failed TPM attestation with ${failureCount} error(s)`,
      details: {
        attestationId: attestation.id,
        failures: attestation.failureReasons,
        quoteVerified: attestation.quoteVerified,
        nonceVerified: attestation.nonceVerified,
        pcrDigestVerified: attestation.pcrDigestVerified,
        policyVerified: attestation.policyVerified
      },
      timestamp: attestation.attestedAt,
      requiresAction: true,
      suggestedActions: [
        'Review attestation failure details',
        'Check device boot configuration',
        'Verify TPM is functioning correctly',
        'Compare PCR values against policy'
      ]
    };
  }

  /**
   * Create specific failure alert
   */
  private createSpecificFailureAlert(
    tenantId: string,
    deviceId: string,
    deviceName: string | undefined,
    reason: string,
    attestation: DeviceAttestation
  ): AttestationAlert | null {
    let type: AttestationEventType;
    let severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL' = 'ERROR';
    let title: string;
    let message: string;
    let actions: string[];

    switch (reason) {
      case 'INVALID_QUOTE_SIGNATURE':
      case 'QUOTE_SIGNATURE_VERIFICATION_ERROR':
        type = AttestationEventType.QUOTE_SIGNATURE_INVALID;
        severity = 'CRITICAL';
        title = 'Invalid TPM Quote Signature';
        message = 'TPM quote signature verification failed - possible tampering or key mismatch';
        actions = [
          'Verify device attestation key (AK) is enrolled correctly',
          'Check TPM health and firmware',
          'Investigate potential security incident'
        ];
        break;

      case 'NONCE_MISMATCH':
      case 'NONCE_VERIFICATION_ERROR':
        type = AttestationEventType.NONCE_MISMATCH;
        severity = 'CRITICAL';
        title = 'Attestation Nonce Mismatch';
        message = 'Challenge nonce does not match - possible replay attack';
        actions = [
          'Verify device time synchronization',
          'Check for network interception',
          'Investigate potential replay attack'
        ];
        break;

      case 'PCR_DIGEST_MISMATCH':
      case 'PCR_DIGEST_VERIFICATION_ERROR':
        type = AttestationEventType.PCR_DIGEST_MISMATCH;
        severity = 'CRITICAL';
        title = 'PCR Digest Mismatch';
        message = 'Submitted PCR values do not match TPM quote digest';
        actions = [
          'Check for man-in-the-middle attack',
          'Verify edge agent integrity',
          'Investigate device tampering'
        ];
        break;

      case 'PCR_POLICY_MISMATCH':
      case 'NO_POLICY_FOR_PCR':
        type = AttestationEventType.POLICY_VIOLATION;
        severity = 'ERROR';
        title = 'Boot Policy Violation';
        message = 'Device boot state does not match approved policy';
        actions = [
          'Review PCR values against policy',
          'Check for firmware/BIOS updates',
          'Update boot policy if legitimate change',
          'Investigate unauthorized configuration changes'
        ];
        break;

      case 'DEVICE_NOT_ENROLLED':
        type = AttestationEventType.IDENTITY_ENROLLED;
        severity = 'WARNING';
        title = 'Device Not Enrolled';
        message = 'Device attestation identity not enrolled';
        actions = [
          'Enroll device TPM attestation key',
          'Verify edge agent is running',
          'Check device connectivity'
        ];
        break;

      case 'IDENTITY_REVOKED':
        type = AttestationEventType.IDENTITY_REVOKED;
        severity = 'CRITICAL';
        title = 'Attestation Identity Revoked';
        message = 'Device attestation identity has been revoked';
        actions = [
          'Review revocation reason',
          'Re-enroll device if appropriate',
          'Investigate security incident'
        ];
        break;

      default:
        // Generic failure - already covered by main failure alert
        return null;
    }

    return {
      id: `alert_${attestation.id}_${reason}`,
      tenantId,
      deviceId,
      deviceName,
      type,
      severity,
      title,
      message: `${message} (${deviceName || deviceId})`,
      details: {
        reason,
        attestationId: attestation.id,
        pcrValues: attestation.pcrValues
      },
      timestamp: attestation.attestedAt,
      requiresAction: true,
      suggestedActions: actions
    };
  }

  /**
   * Create policy violation alert
   */
  private createPolicyViolationAlert(
    tenantId: string,
    deviceId: string,
    deviceName: string | undefined,
    attestation: DeviceAttestation
  ): AttestationAlert {
    return {
      id: `alert_${attestation.id}_policy`,
      tenantId,
      deviceId,
      deviceName,
      type: AttestationEventType.POLICY_VIOLATION,
      severity: 'ERROR',
      title: 'Boot Integrity Policy Violation',
      message: `Device ${deviceName || deviceId} boot state violates approved policy`,
      details: {
        attestationId: attestation.id,
        policyId: attestation.bootPolicyId,
        pcrValues: attestation.pcrValues,
        failures: attestation.failureReasons
      },
      timestamp: attestation.attestedAt,
      requiresAction: true,
      suggestedActions: [
        'Review PCR values against boot policy',
        'Check for unauthorized firmware changes',
        'Update policy if legitimate change occurred',
        'Investigate potential compromise'
      ]
    };
  }

  /**
   * Create stale attestation alert
   */
  private createStaleAlert(
    tenantId: string,
    attestation: DeviceAttestation
  ): AttestationAlert {
    const ageHours = Math.floor(
      (Date.now() - attestation.attestedAt.getTime()) / (1000 * 60 * 60)
    );

    return {
      id: `alert_stale_${attestation.deviceId}`,
      tenantId,
      deviceId: attestation.deviceId,
      type: AttestationEventType.ATTESTATION_STALE,
      severity: ageHours > 168 ? 'ERROR' : 'WARNING', // 7 days
      title: 'Stale Attestation',
      message: `Device attestation is ${ageHours} hours old`,
      details: {
        lastAttestationAt: attestation.attestedAt,
        ageHours,
        lastStatus: attestation.status
      },
      timestamp: new Date(),
      requiresAction: true,
      suggestedActions: [
        'Trigger manual attestation',
        'Check device connectivity',
        'Verify edge agent is running',
        'Review attestation configuration'
      ]
    };
  }

  /**
   * Create repeated failure alert
   */
  private createRepeatedFailureAlert(
    tenantId: string,
    deviceId: string,
    failures: DeviceAttestation[]
  ): AttestationAlert {
    const failureCount = failures.length;
    const latestFailure = failures[0];

    return {
      id: `alert_repeated_${deviceId}`,
      tenantId,
      deviceId,
      type: AttestationEventType.ATTESTATION_FAILED,
      severity: 'CRITICAL',
      title: 'Repeated Attestation Failures',
      message: `Device ${deviceId} has failed attestation ${failureCount} times in the last hour`,
      details: {
        failureCount,
        failures: failures.map(f => ({
          attestationId: f.id,
          timestamp: f.attestedAt,
          reasons: f.failureReasons
        }))
      },
      timestamp: new Date(),
      requiresAction: true,
      suggestedActions: [
        'Isolate device from network',
        'Perform security investigation',
        'Check for hardware tampering',
        'Review device logs',
        'Consider device quarantine'
      ]
    };
  }

  /**
   * Get alert statistics
   */
  async getAlertStatistics(
    tenantId: string,
    hoursBack: number = 24
  ): Promise<{
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  }> {
    // This would query an alerts table if alerts are persisted
    // For now, return computed statistics
    const failures = await this.attestationRepo.getRecentFailures(
      tenantId,
      hoursBack
    );

    return {
      total: failures.length,
      bySeverity: {
        CRITICAL: failures.filter(f =>
          f.failureReasons?.some(r =>
            ['INVALID_QUOTE_SIGNATURE', 'NONCE_MISMATCH', 'PCR_DIGEST_MISMATCH'].includes(r)
          )
        ).length,
        ERROR: failures.length,
        WARNING: 0,
        INFO: 0
      },
      byType: {
        ATTESTATION_FAILED: failures.length,
        POLICY_VIOLATION: failures.filter(f => !f.policyVerified).length,
        QUOTE_SIGNATURE_INVALID: failures.filter(f =>
          f.failureReasons?.includes('INVALID_QUOTE_SIGNATURE')
        ).length
      }
    };
  }
}
