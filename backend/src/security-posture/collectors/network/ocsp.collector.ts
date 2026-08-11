/**
 * OCSP Revocation Collector
 * 
 * Collects OCSP revocation status evidence.
 */

import { BaseSecurityCollector, CollectorContext } from '../base-collector';
import {
  SecurityEvidence,
  EvidenceSource,
  EvidenceTrust,
  createHealthyEvidence,
  createUnhealthyEvidence,
  createUnavailableEvidence,
} from '../../contracts/security-evidence';
import { SecurityCapabilities } from '../../contracts/target-capabilities';
import {
  getCertificateValidationService,
  OcspCheckResult,
} from '../../services/certificate-validation.service';

/**
 * OCSP evidence
 */
export interface OcspEvidence {
  /** OCSP check result */
  ocsp: OcspCheckResult;
  
  /** Certificate serial number */
  serialNumber: string;
  
  /** Certificate fingerprint */
  fingerprint: string;
}

/**
 * OCSP Collector
 */
export class OcspCollector extends BaseSecurityCollector<OcspEvidence> {
  readonly id = 'ocsp-check';
  readonly version = '1.0.0';
  readonly capability = 'LIVE'; // Framework ready, implementation needs OCSP library
  
  private certService = getCertificateValidationService();
  
  /**
   * Check if collector supports target
   */
  supports(_target: any, capabilities: SecurityCapabilities): boolean {
    return capabilities.certificates.available && capabilities.certificates.ocsp;
  }
  
  /**
   * Collect OCSP evidence
   */
  protected async doCollect(context: CollectorContext): Promise<SecurityEvidence<OcspEvidence>> {
    const { target } = context;
    
    const hostname = target.metadata?.hostname as string;
    const port = (target.metadata?.port as number) || 443;
    
    if (!hostname) {
      throw new Error('Hostname required for OCSP collection');
    }
    
    try {
      // Get certificate chain
      const chain = await this.certService.validateChain(hostname, port);
      
      if (chain.chain.length < 2) {
        return createUnavailableEvidence(
          this.getMetadata(),
          context.target,
          'NOT_CONFIGURED',
          'Insufficient chain length for OCSP validation (need issuer cert)'
        );
      }
      
      const cert = chain.chain[0];
      const issuerCert = chain.chain[1];
      
      // Check OCSP
      const ocspResult = await this.certService.checkOcsp(cert, issuerCert);
      
      const evidence: OcspEvidence = {
        ocsp: ocspResult,
        serialNumber: cert.serialNumber,
        fingerprint: cert.fingerprintSHA256,
      };
      
      const observedAt = new Date();
      const expiresAt = ocspResult.nextUpdate || undefined;
      
      // Determine health based on revocation status
      if (!ocspResult.reachable) {
        return createUnavailableEvidence(
          this.getMetadata(),
          context.target,
          'TEMPORARILY_UNAVAILABLE',
          ocspResult.error || 'OCSP responder unreachable'
        );
      }
      
      if (ocspResult.status === 'REVOKED') {
        return createUnhealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          `Certificate revoked: ${ocspResult.revocationReason || 'unknown reason'}`,
          {
            source: EvidenceSource.EXTERNAL_SERVICE,
            confidence: ocspResult.responderVerified ? 1.0 : 0.7,
            provenance: {
              endpoint: `${hostname}:${port}`,
              protocol: 'OCSP',
              certificateFingerprint: cert.fingerprintSHA256,
              trustLevel: EvidenceTrust.EXTERNAL_SERVICE,
            },
          }
        );
      }
      
      if (ocspResult.status === 'GOOD') {
        return createHealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          {
            source: EvidenceSource.EXTERNAL_SERVICE,
            confidence: ocspResult.responderVerified ? 1.0 : 0.7,
            expiresAt,
            provenance: {
              endpoint: `${hostname}:${port}`,
              protocol: 'OCSP',
              certificateFingerprint: cert.fingerprintSHA256,
              trustLevel: EvidenceTrust.EXTERNAL_SERVICE,
            },
            metadata: {
              producedAt: ocspResult.producedAt,
              thisUpdate: ocspResult.thisUpdate,
              nextUpdate: ocspResult.nextUpdate,
            },
          }
        );
      }
      
      // UNKNOWN status
      return createUnavailableEvidence(
        this.getMetadata(),
        context.target,
        'TEMPORARILY_UNAVAILABLE',
        'OCSP status unknown'
      );
    } catch (error) {
      throw new Error(`OCSP check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * OCSP Stapling Collector
 */
export class OcspStaplingCollector extends BaseSecurityCollector<OcspEvidence> {
  readonly id = 'ocsp-stapling';
  readonly version = '1.0.0';
  readonly capability = 'LIVE'; // Framework ready, implementation needs OCSP stapling support
  
  private certService = getCertificateValidationService();
  
  /**
   * Check if collector supports target
   */
  supports(_target: any, capabilities: SecurityCapabilities): boolean {
    return capabilities.certificates.available && capabilities.certificates.ocspStapling;
  }
  
  /**
   * Collect OCSP stapling evidence
   */
  protected async doCollect(context: CollectorContext): Promise<SecurityEvidence<OcspEvidence>> {
    const { target } = context;
    
    const hostname = target.metadata?.hostname as string;
    const port = (target.metadata?.port as number) || 443;
    
    if (!hostname) {
      throw new Error('Hostname required for OCSP stapling collection');
    }
    
    try {
      // Get certificate
      const chain = await this.certService.validateChain(hostname, port);
      
      if (chain.chain.length === 0) {
        throw new Error('No certificate received');
      }
      
      const cert = chain.chain[0];
      
      // Check for stapled OCSP response
      const staplingResult = await this.certService.checkOcspStapling(hostname, port);
      
      if (!staplingResult.stapled) {
        return createUnhealthyEvidence(
          this.getMetadata(),
          context.target,
          {
            ocsp: {
              reachable: false,
              status: 'UNKNOWN',
              responderVerified: false,
            },
            serialNumber: cert.serialNumber,
            fingerprint: cert.fingerprintSHA256,
          },
          new Date(),
          'OCSP response not stapled',
          {
            source: EvidenceSource.NETWORK_PROBE,
            confidence: 1.0,
            provenance: {
              endpoint: `${hostname}:${port}`,
              protocol: 'TLS',
              certificateFingerprint: cert.fingerprintSHA256,
              trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
            },
          }
        );
      }
      
      const evidence: OcspEvidence = {
        ocsp: {
          reachable: true,
          status: staplingResult.status || 'UNKNOWN',
          producedAt: staplingResult.producedAt,
          thisUpdate: staplingResult.thisUpdate,
          nextUpdate: staplingResult.nextUpdate,
          responderVerified: staplingResult.responderVerified || false,
        },
        serialNumber: cert.serialNumber,
        fingerprint: cert.fingerprintSHA256,
      };
      
      const observedAt = new Date();
      
      if (staplingResult.status === 'GOOD') {
        return createHealthyEvidence(
          this.getMetadata(),
          context.target,
          evidence,
          observedAt,
          {
            source: EvidenceSource.NETWORK_PROBE,
            confidence: staplingResult.responderVerified ? 1.0 : 0.8,
            expiresAt: staplingResult.nextUpdate,
            provenance: {
              endpoint: `${hostname}:${port}`,
              protocol: 'TLS',
              certificateFingerprint: cert.fingerprintSHA256,
              trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
            },
          }
        );
      }
      
      return createUnhealthyEvidence(
        this.getMetadata(),
        context.target,
        evidence,
        observedAt,
        `Stapled OCSP status: ${staplingResult.status}`,
        {
          source: EvidenceSource.NETWORK_PROBE,
          confidence: 0.8,
          provenance: {
            endpoint: `${hostname}:${port}`,
            protocol: 'TLS',
            trustLevel: EvidenceTrust.ACTIVE_NETWORK_PROBE,
          },
        }
      );
    } catch (error) {
      throw new Error(`OCSP stapling check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
