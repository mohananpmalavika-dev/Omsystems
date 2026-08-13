/**
 * Attestation Client
 * Handles attestation workflow with Sentinel backend
 */

import axios, { AxiosInstance } from 'axios';
import {
  AttestationProvider,
  AttestationChallenge,
  AttestationError
} from './attestation-provider.interface.js';
import { LinuxTpmProvider } from './linux-tpm-provider.js';

export class AttestationClient {
  private provider: AttestationProvider;
  private api: AxiosInstance;
  private deviceId: string;
  private identityEnrolled: boolean = false;

  constructor(
    private config: {
      backendUrl: string;
      deviceId: string;
      apiKey?: string;
      provider?: AttestationProvider;
    }
  ) {
    this.deviceId = config.deviceId;
    this.provider = config.provider || new LinuxTpmProvider();
    
    this.api = axios.create({
      baseURL: `${config.backendUrl}/api/attestation`,
      headers: config.apiKey
        ? { Authorization: `Bearer ${config.apiKey}` }
        : {}
    });
  }

  /**
   * Initialize attestation
   * Checks support and enrolls identity if needed
   */
  async initialize(): Promise<boolean> {
    try {
      // Check if TPM attestation is supported
      const supported = await this.provider.isSupported();

      if (!supported) {
        console.warn('⚠️  TPM attestation not supported on this platform');
        return false;
      }

      console.log('✓ TPM attestation supported');

      // Enroll identity if not already enrolled
      if (!this.identityEnrolled) {
        await this.enrollIdentity();
      }

      return true;
    } catch (error: any) {
      console.error('Attestation initialization error:', error);
      return false;
    }
  }

  /**
   * Enroll attestation identity with backend
   */
  async enrollIdentity(): Promise<void> {
    try {
      console.log('🔐 Enrolling attestation identity...');

      const identity = await this.provider.getIdentity();

      const response = await this.api.post('/identities/enroll', {
        deviceId: this.deviceId,
        akPublicKeyPem: identity.akPublicKeyPem,
        akName: identity.akName,
        tpmInfo: {
          manufacturer: identity.tpmManufacturer,
          firmwareVersion: identity.tpmFirmwareVersion,
          ekPublicKeyHash: identity.ekPublicKeyHash
        }
      });

      if (response.data.success) {
        console.log('✓ Attestation identity enrolled');
        this.identityEnrolled = true;
      } else {
        throw new Error('Identity enrollment failed');
      }
    } catch (error: any) {
      console.error('Identity enrollment error:', error);
      throw new AttestationError(
        'Failed to enroll identity',
        'ENROLLMENT_ERROR',
        error
      );
    }
  }

  /**
   * Perform attestation
   */
  async attest(): Promise<{
    success: boolean;
    status: string;
    result?: any;
  }> {
    try {
      console.log('🔍 Starting attestation...');

      // Step 1: Request challenge
      const challenge = await this.requestChallenge();
      console.log(`✓ Received challenge: ${challenge.challengeId}`);

      // Step 2: Generate TPM quote
      const evidence = await this.provider.quote(challenge);
      console.log('✓ Generated TPM quote');

      // Step 3: Submit for verification
      const result = await this.submitQuote(challenge.challengeId, evidence);
      console.log(`✓ Attestation result: ${result.status}`);

      return result;
    } catch (error: any) {
      console.error('Attestation error:', error);
      throw new AttestationError(
        'Attestation failed',
        'ATTESTATION_ERROR',
        error
      );
    }
  }

  /**
   * Request attestation challenge from backend
   */
  private async requestChallenge(): Promise<AttestationChallenge> {
    try {
      const response = await this.api.post('/challenges', {
        deviceId: this.deviceId
      });

      if (!response.data.success) {
        throw new Error('Challenge request failed');
      }

      return response.data.data;
    } catch (error: any) {
      throw new AttestationError(
        'Failed to request challenge',
        'CHALLENGE_REQUEST_ERROR',
        error
      );
    }
  }

  /**
   * Submit TPM quote for verification
   */
  private async submitQuote(
    challengeId: string,
    evidence: any
  ): Promise<{
    success: boolean;
    status: string;
    result: any;
  }> {
    try {
      const response = await this.api.post('/verify', {
        challengeId,
        deviceId: this.deviceId,
        ...evidence
      });

      return {
        success: response.data.success,
        status: response.data.data?.status || 'UNKNOWN',
        result: response.data.data?.result
      };
    } catch (error: any) {
      if (error.response?.status === 403) {
        // Verification failed but got response
        return {
          success: false,
          status: error.response.data.data?.status || 'FAILED',
          result: error.response.data.data?.result
        };
      }

      throw new AttestationError(
        'Failed to submit quote',
        'QUOTE_SUBMISSION_ERROR',
        error
      );
    }
  }

  /**
   * Get current attestation status
   */
  async getStatus(): Promise<any> {
    try {
      const response = await this.api.get(`/status/${this.deviceId}`);
      return response.data.data;
    } catch (error: any) {
      throw new AttestationError(
        'Failed to get status',
        'STATUS_REQUEST_ERROR',
        error
      );
    }
  }

  /**
   * Run periodic attestation
   */
  startPeriodicAttestation(intervalMinutes: number = 60): NodeJS.Timeout {
    console.log(`Starting periodic attestation (every ${intervalMinutes} minutes)`);

    const intervalMs = intervalMinutes * 60 * 1000;

    return setInterval(async () => {
      try {
        await this.attest();
      } catch (error) {
        console.error('Periodic attestation error:', error);
      }
    }, intervalMs);
  }
}
