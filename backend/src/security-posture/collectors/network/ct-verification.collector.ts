/**
 * Certificate Transparency Verification Collector
 * 
 * Collects Certificate Transparency SCT validation evidence.
 */

import { BaseSecurityCollector, CollectorContext } from '../base-collector';
import {
  SecurityEvidence,
  EvidenceSource,
  EvidenceTrust,
  createHealthyEvidence,
  createUnhealthyEvidence,
} from '../../contracts/security-evidence';
import { SecurityCapabilities } from '../../contracts/target-capabilities';
import {
  getCertificateValidationService,
  CtCheckResult,
} from '../../services/certificate-validation.service';

/**
 * CT verification evidence
 */
export interface CtVerificationEvidence {
  /** CT check result */
  ctCheck: CtCheckResult;
  
  /** Certificate fingerprint */
  fingerprint: string;
  
  /** Compliance status */
  compliant: boolean;
}

/**
 * CT Verification Collector
 */
export class CtVerificationCollector extends BaseSecurityCollector<CtVerificationEvidence> {
  readonly id = 'ct-log-verification';
  readonly version = '1.0.0';
  readonly capability = 'LIVE'; // Framework ready, implementation needs CT library
  
  private certService = getCertificateValidationService();
  
  /**
   * Check if collector supports target
   */
  supports(_target: any, capabilities: SecurityCapabilities): boolean {
    return capabilities.certificates.available && capabilities.certificates.ctLogs;
  }
  
  /**
   * Collect CT verification evidence
   */
  protected async doCollect(context: CollectorContext): Promise<SecurityEvidence<CtVerificationEvidence>> {
    const { target } = context;
    
    const hostname = target.metadata?.hostname as string;
    const port = (target.metadata?.port as number) || 443;
    
    if (!hostname) {
      throw new Error('Hostname required for CT verification');
    }
    
    try {
      // Get certificate
      const chain = await this.certService.validateChain(hostname, port);
      
      if (chain.chain.length === 0) {
        throw new Error('No certificate received');
      }
      
      const cert = chain.chain[0];
      
      // Verify Certificate Transparency
      const ctResult = await this.certService.verifyCertificateTransparency(cert);
      
      // Determine compliance
      // For public CAs, at least 2 valid SCTs from different logs are typically required
      const compliant = ctResult.sctsPresent && ctResult.validSctCount >= 2;
      
      const evidence: CtVerificationEvidence = {
        ctCheck: ctResult,
        fingerprint: cert.fingerprintSHA256,
        compliant,
      };
      
      const observedAt = new Date();
      
      // Determine health
      if (compliant) {
        return createHealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          {
            source: EvidenceSource.NETWORK_PROBE,
            confidence: ctResult.inclusionVerified ? 1.0 : 0.8,
            provenance: {
              endpoint: `${hostname}:${port}`,
              protocol: 'TLS',
              certificateFingerprint: cert.fingerprintSHA256,
              trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
            },
            metadata: {
              validSctCount: ctResult.validSctCount,
              recognizedLogs: ctResult.recognizedLogs,
              inclusionVerified: ctResult.inclusionVerified,
            },
          }
        );
      } else {
        const reason = !ctResult.sctsPresent
          ? 'No SCTs present in certificate'
          : `Insufficient valid SCTs: ${ctResult.validSctCount} (minimum 2 required)`;
        
        return createUnhealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          reason,
          {
            source: EvidenceSource.NETWORK_PROBE,
            confidence: 0.9,
            provenance: {
              endpoint: `${hostname}:${port}`,
              protocol: 'TLS',
              certificateFingerprint: cert.fingerprintSHA256,
              trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
            },
            metadata: {
              errors: ctResult.errors,
            },
          }
        );
      }
    } catch (error) {
      throw new Error(`CT verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
