/**
 * Certificate Chain Collector
 * 
 * Collects certificate chain validation evidence.
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
  ChainValidationResult,
  ExpiryCheckResult,
  HostnameValidationResult,
} from '../../services/certificate-validation.service';

/**
 * Certificate chain evidence
 */
export interface CertificateChainEvidence {
  /** Chain validation result */
  chain: ChainValidationResult;
  
  /** Expiry check result */
  expiry: ExpiryCheckResult;
  
  /** Hostname validation result */
  hostnameValidation: HostnameValidationResult;
  
  /** Overall valid? */
  valid: boolean;
  
  /** Validation errors */
  errors: string[];
}

/**
 * Certificate Chain Collector
 */
export class CertificateChainCollector extends BaseSecurityCollector<CertificateChainEvidence> {
  readonly id = 'certificate-chain';
  readonly version = '1.0.0';
  
  private certService = getCertificateValidationService();
  
  /**
   * Check if collector supports target
   */
  supports(_target: any, capabilities: SecurityCapabilities): boolean {
    return capabilities.certificates.available && capabilities.tls.canProbeDirectly;
  }
  
  /**
   * Collect certificate chain evidence
   */
  protected async doCollect(context: CollectorContext): Promise<SecurityEvidence<CertificateChainEvidence>> {
    const { target } = context;
    
    const hostname = target.metadata?.hostname as string;
    const port = (target.metadata?.port as number) || 443;
    
    if (!hostname) {
      throw new Error('Hostname required for certificate chain collection');
    }
    
    try {
      // Validate chain
      const chain = await this.certService.validateChain(hostname, port);
      
      if (chain.chain.length === 0) {
        throw new Error('No certificate chain received');
      }
      
      // Check expiry
      const expiry = this.certService.checkExpiry(chain.chain[0]);
      
      // Validate hostname
      const hostnameValidation = this.certService.validateHostname(chain.chain[0], hostname);
      
      // Determine overall validity
      const errors: string[] = [
        ...chain.errors,
        ...hostnameValidation.errors,
      ];
      
      if (expiry.expired) {
        errors.push(`Certificate expired ${Math.abs(expiry.daysUntilExpiry)} days ago`);
      }
      
      const valid = chain.valid && !expiry.expired && hostnameValidation.valid;
      
      const evidence: CertificateChainEvidence = {
        chain,
        expiry,
        hostnameValidation,
        valid,
        errors,
      };
      
      const observedAt = new Date();
      
      // Determine health
      if (valid) {
        // Check for expiring soon
        if (expiry.expiresWithin30Days) {
          return createUnhealthyEvidence(
            this.getMetadata(),
            context.target,
            evidence,
            observedAt,
            `Certificate expires in ${expiry.daysUntilExpiry} days`,
            {
              source: EvidenceSource.NETWORK_PROBE,
              confidence: 1.0,
              provenance: {
                endpoint: `${hostname}:${port}`,
                protocol: 'TLS',
                certificateFingerprint: chain.chain[0].fingerprintSHA256,
                trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
              },
            }
          );
        }
        
        return createHealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          {
            source: EvidenceSource.NETWORK_PROBE,
            confidence: 1.0,
            expiresAt: chain.chain[0].validUntil,
            provenance: {
              endpoint: `${hostname}:${port}`,
              protocol: 'TLS',
              certificateFingerprint: chain.chain[0].fingerprintSHA256,
              trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
            },
            metadata: {
              chainLength: chain.chainLength,
              daysUntilExpiry: expiry.daysUntilExpiry,
              selfSigned: chain.selfSigned,
            },
          }
        );
      } else {
        return createUnhealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          errors.join('; '),
          {
            source: EvidenceSource.NETWORK_PROBE,
            confidence: 1.0,
            provenance: {
              endpoint: `${hostname}:${port}`,
              protocol: 'TLS',
              certificateFingerprint: chain.chain[0]?.fingerprintSHA256,
              trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
            },
          }
        );
      }
    } catch (error) {
      throw new Error(`Certificate chain validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
