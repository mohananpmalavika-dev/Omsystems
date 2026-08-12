/**
 * TPM (Trusted Platform Module) Attestation Collector
 * Verifies hardware-backed device identity and integrity
 */

import { BaseEvidenceCollector, type SecurityEvidence, EvidenceSource } from './base-evidence-collector.js';

export interface TPMAttestationData {
  deviceId: string;
  attestationStatus: 'valid' | 'invalid' | 'unknown' | 'not_configured';
  tpmVersion: string;
  pcr0Hash?: string; // Platform Configuration Register
  pcr7Hash?: string; // Secure boot
  endorsementKey: string;
  lastAttestation: Date;
  attestationErrors?: string[];
}

export interface TPMAttestationEvidence extends SecurityEvidence {
  type: 'tpm_attestation';
  value: {
    totalDevices: number;
    validAttestations: number;
    invalidAttestations: number;
    unknownStatus: number;
    notConfigured: number;
    devicesRequiringAttestation: TPMAttestationData[];
  };
}

export class TPMAttestationCollector extends BaseEvidenceCollector {
  readonly id = 'tpm-attestation';
  readonly name = 'TPM Device Attestation';
  readonly description = 'Collects hardware-backed device identity verification status';
  private lastError?: string;

  async collect(): Promise<SecurityEvidence[]> {
    const now = new Date();
    
    try {
      // In real implementation, this would query edge devices for TPM status
      // For now, simulate the check
      const devices = await this.getDevicesWithTPM();
      
      const totalDevices = devices.length;
      const validAttestations = devices.filter(d => d.attestationStatus === 'valid').length;
      const invalidAttestations = devices.filter(d => d.attestationStatus === 'invalid').length;
      const unknownStatus = devices.filter(d => d.attestationStatus === 'unknown').length;
      const notConfigured = devices.filter(d => d.attestationStatus === 'not_configured').length;
      
      // Devices requiring attention (invalid or not configured)
      const devicesRequiringAttestation = devices.filter(
        d => d.attestationStatus === 'invalid' || d.attestationStatus === 'not_configured'
      );

      // Calculate confidence based on attestation coverage
      const attestationRate = totalDevices > 0 ? (validAttestations / totalDevices) * 100 : 0;
      const confidence = Math.round(attestationRate);

      return [
        this.createEvidence(
          {
            type: 'tpm_attestation',
            totalDevices,
            validAttestations,
            invalidAttestations,
            unknownStatus,
            notConfigured,
            devicesRequiringAttestation,
          },
          confidence,
          {
            collector: this.id,
            version: '1.0.0',
            collectionMethod: this.isSimulation() ? 'simulation' : 'tpm_api',
          }
        )
      ];
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  /**
   * Get devices with TPM capability
   */
  private async getDevicesWithTPM(): Promise<TPMAttestationData[]> {
    // In real implementation, query edge agents for TPM status
    // For simulation, return sample data
    
    if (this.isSimulation()) {
      return [
        {
          deviceId: 'edge-agent-001',
          attestationStatus: 'valid',
          tpmVersion: '2.0',
          pcr0Hash: 'abc123...',
          pcr7Hash: 'def456...',
          endorsementKey: 'ek-001',
          lastAttestation: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        },
        {
          deviceId: 'edge-agent-002',
          attestationStatus: 'valid',
          tpmVersion: '2.0',
          pcr0Hash: 'ghi789...',
          pcr7Hash: 'jkl012...',
          endorsementKey: 'ek-002',
          lastAttestation: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
        },
        {
          deviceId: 'edge-agent-003',
          attestationStatus: 'not_configured',
          tpmVersion: '2.0',
          endorsementKey: 'ek-003',
          lastAttestation: new Date(0),
          attestationErrors: ['TPM not configured'],
        },
      ];
    }

    // Real implementation would call edge agent API
    const devices: TPMAttestationData[] = [];
    
    // TODO: Query actual edge agents
    // const response = await fetch('/api/edge-agents/tpm-status');
    // devices = await response.json();
    
    return devices;
  }

  /**
   * Check if running in simulation mode
   */
  private isSimulation(): boolean {
    return process.env.TPM_SIMULATION_MODE === 'true' || !process.env.TPM_API_ENDPOINT;
  }

  /**
   * Trigger attestation for a device
   */
  async triggerAttestation(deviceId: string): Promise<void> {
    // Real implementation would trigger TPM attestation on edge device
    if (this.isSimulation()) {
      console.log(`[SIMULATION] Triggering TPM attestation for device ${deviceId}`);
      return;
    }

    // TODO: Call edge agent to perform attestation
    // await fetch(`/api/edge-agents/${deviceId}/attest`, { method: 'POST' });
  }
}
