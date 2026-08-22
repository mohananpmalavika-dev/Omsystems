/**
 * TPM Attestation Service (DEPRECATED)
 * 
 * ⚠️  WARNING: This implementation contains placeholder methods and does not
 * provide cryptographic security. It has been replaced by a new implementation.
 * 
 * USE INSTEAD: backend/src/attestation/application/tpm-attestation.service.ts
 * 
 * This file is maintained for backward compatibility only and will be removed
 * in a future version. All methods throw errors directing to the new API.
 * 
 * Migration Guide:
 * - Replace TPMAttestationService with tpmAttestationService
 * - Use challenge-response protocol instead of direct quote generation
 * - Enroll device AK before attestation
 * - See: backend/src/attestation/transport/attestation.routes.ts
 */

import { ITPMAttestationService } from '../interfaces.js';
import { TPMStatus, AttestationResult, TrustLevel } from '../types.js';
import { getDatabase } from '../../config/database.js';
import { EventEmitter } from 'events';

/**
 * @deprecated Use backend/src/attestation/application/tpm-attestation.service.ts
 */
export class TPMAttestationService extends EventEmitter implements ITPMAttestationService {
  
  async getTPMStatus(deviceId: string): Promise<TPMStatus> {
    throw new Error(
      'TPMAttestationService.getTPMStatus is deprecated.\n' +
      'Use: GET /api/attestation/devices/:deviceId/ak-status\n' +
      'Or: tpmAttestationService.getAkService().getDeviceIdentity(deviceId)'
    );
  }

  async listTPMDevices(): Promise<TPMStatus[]> {
    throw new Error(
      'TPMAttestationService.listTPMDevices is deprecated.\n' +
      'Use: tpmAttestationService.getAkService().listIdentities({ tenantId })'
    );
  }

  async requestAttestation(deviceId: string): Promise<AttestationResult> {
    throw new Error(
      'TPMAttestationService.requestAttestation is deprecated.\n' +
      'SECURITY WARNING: This method returned placeholder quote/signature values.\n\n' +
      'Use challenge-response protocol instead:\n' +
      '1. POST /api/attestation/devices/:deviceId/challenge\n' +
      '2. Device generates TPM quote with nonce\n' +
      '3. POST /api/attestation/devices/:deviceId/evidence\n\n' +
      'Or programmatically:\n' +
      '1. const challenge = await tpmAttestationService.issueChallenge(tenantId, deviceId)\n' +
      '2. // Device generates quote\n' +
      '3. const result = await tpmAttestationService.submitEvidence(tenantId, deviceId, submission)'
    );
  }

  async verifyAttestation(
    deviceId: string,
    quote: string,
    signature: string,
    pcrs: Record<number, string>
  ): Promise<AttestationResult> {
    throw new Error(
      'TPMAttestationService.verifyAttestation is deprecated.\n' +
      'SECURITY WARNING: This method did not perform cryptographic verification.\n\n' +
      'Use: POST /api/attestation/devices/:deviceId/evidence\n' +
      'Or: tpmAttestationService.submitEvidence(tenantId, deviceId, submission)'
    );
  }

  async createTPMKey(deviceId: string, keyType: string, algorithm: string): Promise<any> {
    throw new Error(
      'TPMAttestationService.createTPMKey is deprecated and not implemented.\n' +
      'TPM keys must be created on the device TPM itself.'
    );
  }

  async getTPMKeys(deviceId: string): Promise<any[]> {
    throw new Error(
      'TPMAttestationService.getTPMKeys is deprecated and not implemented.'
    );
  }

  async sealData(deviceId: string, data: Buffer, pcrSelection: number[]): Promise<Buffer> {
    throw new Error(
      'TPMAttestationService.sealData is deprecated.\n' +
      'SECURITY WARNING: This method returned placeholder sealed data.\n\n' +
      'TPM sealing must be performed on the device TPM itself, not on the control plane.'
    );
  }

  async unsealData(deviceId: string, sealedData: Buffer): Promise<Buffer> {
    throw new Error(
      'TPMAttestationService.unsealData is deprecated.\n' +
      'SECURITY WARNING: This method returned placeholder unsealed data.\n\n' +
      'TPM unsealing must be performed on the device TPM itself, not on the control plane.'
    );
  }

  async generateQuote(deviceId: string, nonce: string, pcrSelection: number[]): Promise<any> {
    throw new Error(
      'TPMAttestationService.generateQuote is deprecated.\n' +
      'SECURITY WARNING: This method returned placeholder quote/signature.\n\n' +
      'TPM quotes must be generated on the device TPM itself.\n' +
      'The control plane issues challenges and verifies evidence.\n\n' +
      'Use: POST /api/attestation/devices/:deviceId/challenge to issue a challenge'
    );
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    return {
      status: 'deprecated',
      details: {
        message: 'This service is deprecated. Use tpmAttestationService instead.',
        newEndpoint: '/api/attestation/statistics'
      }
    };
  }
}
