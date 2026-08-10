/**
 * Network Security Posture Adapter
 * 
 * Collects TLS, certificate, and HTTPS enforcement telemetry.
 */

import { BaseSecurityAdapter } from './base-adapter';
import {
  SecurityTelemetryResult,
  createSuccessResult,
  createUnavailableResult,
  TelemetryErrorCode,
} from '../contracts/telemetry-result';
import { SecurityTelemetryContext } from '../contracts/telemetry-context';
import { SecurityCapability, calculateFreshness, TELEMETRY_FRESHNESS_TTL } from '../contracts/security-posture-collector';
import { TlsScannerProvider, TLSInspection, HttpsEnforcementCheck } from '../providers/tls-scanner.provider';
import { withTimeout } from '../utils/timeout';

/**
 * TLS Protocol telemetry
 */
export interface TlsProtocolTelemetry {
  protocol: string;
  secure: boolean;
  score: number; // 0-100
}

/**
 * Cipher strength telemetry
 */
export interface CipherStrengthTelemetry {
  cipherName: string;
  bits?: number;
  secure: boolean;
  score: number; // 0-100
}

/**
 * Certificate validation telemetry
 */
export interface CertificateValidationTelemetry {
  valid: boolean;
  hostnameValid: boolean;
  chainValid: boolean;
  selfSigned: boolean;
  expired: boolean;
  expiresWithin30Days: boolean;
  daysRemaining: number;
  subject: string;
  issuer: string;
  serialNumber: string;
  fingerprint: string;
}

/**
 * HTTPS enforcement telemetry
 */
export interface HttpsEnforcementTelemetry {
  httpsEnforced: boolean;
  httpReachable: boolean;
  redirectsToHttps: boolean;
  hstsEnabled: boolean;
  hstsMaxAge?: number;
  hstsIncludesSubdomains?: boolean;
}

/**
 * Network Security Adapter
 */
export class NetworkSecurityAdapter extends BaseSecurityAdapter {
  private tlsScanner: TlsScannerProvider;
  
  constructor() {
    super('network-security');
    this.tlsScanner = new TlsScannerProvider();
  }
  
  /**
   * Collect all network security telemetry
   */
  protected async doCollect(context: SecurityTelemetryContext): Promise<SecurityTelemetryResult[]> {
    const endpoints = await this.discoverEndpoints(context);
    
    if (endpoints.length === 0) {
      return [
        createUnavailableResult(
          this.collectorId,
          TelemetryErrorCode.COLLECTOR_NOT_CONFIGURED,
          'No network endpoints configured for scanning'
        ),
      ];
    }
    
    const results: SecurityTelemetryResult[] = [];
    
    // Collect telemetry for each endpoint
    for (const endpoint of endpoints) {
      try {
        const endpointResults = await this.collectEndpointTelemetry(endpoint, context);
        results.push(...endpointResults);
      } catch (error) {
        results.push(
          createUnavailableResult(
            this.collectorId,
            TelemetryErrorCode.NETWORK_TIMEOUT,
            `Failed to scan ${endpoint.hostname}:${endpoint.port}: ${error.message}`
          )
        );
      }
    }
    
    return results;
  }
  
  /**
   * Collect telemetry for a single endpoint
   */
  private async collectEndpointTelemetry(
    endpoint: { hostname: string; port: number; entityId?: string },
    context: SecurityTelemetryContext
  ): Promise<SecurityTelemetryResult[]> {
    const results: SecurityTelemetryResult[] = [];
    
    // Run TLS inspection and HTTPS enforcement check in parallel
    const [tlsResult, httpsResult] = await Promise.allSettled([
      withTimeout(
        this.tlsScanner.inspectTls(endpoint.hostname, endpoint.port),
        10000,
        `TLS scan timeout for ${endpoint.hostname}`
      ),
      withTimeout(
        this.tlsScanner.checkHttpsEnforcement(endpoint.hostname),
        10000,
        `HTTPS check timeout for ${endpoint.hostname}`
      ),
    ]);
    
    // Process TLS inspection results
    if (tlsResult.status === 'fulfilled') {
      const inspection = tlsResult.value;
      results.push(...this.processTlsInspection(inspection, endpoint));
    } else {
      results.push(
        createUnavailableResult(
          'tls-scanner',
          TelemetryErrorCode.NETWORK_TIMEOUT,
          `TLS inspection failed: ${tlsResult.reason?.message}`
        )
      );
    }
    
    // Process HTTPS enforcement results
    if (httpsResult.status === 'fulfilled') {
      results.push(this.processHttpsEnforcement(httpsResult.value, endpoint));
    } else {
      results.push(
        createUnavailableResult(
          'https-enforcement',
          TelemetryErrorCode.NETWORK_TIMEOUT,
          `HTTPS check failed: ${httpsResult.reason?.message}`
        )
      );
    }
    
    return results;
  }
  
  /**
   * Process TLS inspection into multiple telemetry results
   */
  private processTlsInspection(
    inspection: TLSInspection,
    endpoint: { hostname: string; port: number; entityId?: string }
  ): SecurityTelemetryResult[] {
    const results: SecurityTelemetryResult[] = [];
    const now = new Date();
    
    // TLS Protocol telemetry
    if (inspection.protocol) {
      const protocolTelemetry = this.evaluateTlsProtocol(inspection.protocol);
      results.push(
        createSuccessResult(
          'tls-protocol',
          protocolTelemetry,
          now,
          {
            confidence: 1.0,
            freshness: calculateFreshness(now, TELEMETRY_FRESHNESS_TTL.tls),
            completeness: 1.0,
            evidence: {
              endpoint: `${endpoint.hostname}:${endpoint.port}`,
              protocol: inspection.protocol,
              latencyMs: inspection.latencyMs,
            },
            entity: endpoint.entityId ? {
              entityType: 'server',
              entityId: endpoint.entityId,
            } : undefined,
          }
        )
      );
    }
    
    // Cipher strength telemetry
    if (inspection.cipher) {
      const cipherTelemetry = this.evaluateCipherStrength(inspection.cipher);
      results.push(
        createSuccessResult(
          'cipher-strength',
          cipherTelemetry,
          now,
          {
            confidence: 1.0,
            freshness: calculateFreshness(now, TELEMETRY_FRESHNESS_TTL.tls),
            completeness: 1.0,
            evidence: {
              endpoint: `${endpoint.hostname}:${endpoint.port}`,
              cipher: inspection.cipher,
            },
            entity: endpoint.entityId ? {
              entityType: 'server',
              entityId: endpoint.entityId,
            } : undefined,
          }
        )
      );
    }
    
    // Certificate validation telemetry
    if (inspection.certificate) {
      const certTelemetry: CertificateValidationTelemetry = {
        valid: inspection.certificate.chainValid && !this.isCertificateExpired(inspection.certificate),
        hostnameValid: inspection.certificate.hostnameValid,
        chainValid: inspection.certificate.chainValid,
        selfSigned: inspection.certificate.selfSigned,
        expired: this.isCertificateExpired(inspection.certificate),
        expiresWithin30Days: inspection.certificate.daysRemaining <= 30,
        daysRemaining: inspection.certificate.daysRemaining,
        subject: inspection.certificate.subject,
        issuer: inspection.certificate.issuer,
        serialNumber: inspection.certificate.serialNumber,
        fingerprint: inspection.certificate.fingerprintSHA256,
      };
      
      results.push(
        createSuccessResult(
          'certificate-validation',
          certTelemetry,
          now,
          {
            confidence: 1.0,
            freshness: calculateFreshness(now, TELEMETRY_FRESHNESS_TTL.certificate),
            completeness: 1.0,
            evidence: {
              endpoint: `${endpoint.hostname}:${endpoint.port}`,
              validFrom: inspection.certificate.validFrom,
              validUntil: inspection.certificate.validUntil,
              subjectAltNames: inspection.certificate.subjectAltNames,
            },
            entity: endpoint.entityId ? {
              entityType: 'server',
              entityId: endpoint.entityId,
            } : undefined,
          }
        )
      );
    }
    
    return results;
  }
  
  /**
   * Process HTTPS enforcement check
   */
  private processHttpsEnforcement(
    check: HttpsEnforcementCheck,
    endpoint: { hostname: string; entityId?: string }
  ): SecurityTelemetryResult<HttpsEnforcementTelemetry> {
    const now = new Date();
    
    const telemetry: HttpsEnforcementTelemetry = {
      httpsEnforced: check.redirectsToHttps || !check.httpReachable,
      httpReachable: check.httpReachable,
      redirectsToHttps: check.redirectsToHttps,
      hstsEnabled: check.hsts?.enabled ?? false,
      hstsMaxAge: check.hsts?.maxAge,
      hstsIncludesSubdomains: check.hsts?.includeSubDomains,
    };
    
    return createSuccessResult(
      'https-enforcement',
      telemetry,
      now,
      {
        confidence: 1.0,
        freshness: calculateFreshness(now, TELEMETRY_FRESHNESS_TTL.httpsEnforcement),
        completeness: 1.0,
        evidence: {
          endpoint: endpoint.hostname,
          redirectTarget: check.redirectTarget,
          redirectStatusCode: check.redirectStatusCode,
        },
        entity: endpoint.entityId ? {
          entityType: 'server',
          entityId: endpoint.entityId,
        } : undefined,
      }
    );
  }
  
  /**
   * Evaluate TLS protocol security
   */
  private evaluateTlsProtocol(protocol: string): TlsProtocolTelemetry {
    let score = 0;
    let secure = false;
    
    if (protocol === 'TLSv1.3') {
      score = 100;
      secure = true;
    } else if (protocol === 'TLSv1.2') {
      score = 90;
      secure = true;
    } else if (protocol === 'TLSv1.1') {
      score = 20;
      secure = false;
    } else if (protocol === 'TLSv1') {
      score = 10;
      secure = false;
    } else if (protocol.startsWith('SSL')) {
      score = 0;
      secure = false;
    }
    
    return { protocol, secure, score };
  }
  
  /**
   * Evaluate cipher strength
   */
  private evaluateCipherStrength(cipher: { name: string; bits?: number }): CipherStrengthTelemetry {
    let score = 50; // Default moderate
    let secure = false;
    
    const name = cipher.name.toUpperCase();
    
    // Evaluate by cipher name patterns
    if (name.includes('AES256-GCM') || name.includes('CHACHA20')) {
      score = 100;
      secure = true;
    } else if (name.includes('AES128-GCM')) {
      score = 95;
      secure = true;
    } else if (name.includes('AES256') || name.includes('AES128')) {
      score = 80;
      secure = true;
    } else if (name.includes('3DES')) {
      score = 30;
      secure = false;
    } else if (name.includes('RC4') || name.includes('DES')) {
      score = 0;
      secure = false;
    }
    
    // Adjust by key size
    if (cipher.bits) {
      if (cipher.bits >= 256) {
        score = Math.min(100, score + 5);
      } else if (cipher.bits < 128) {
        score = Math.max(0, score - 30);
        secure = false;
      }
    }
    
    return {
      cipherName: cipher.name,
      bits: cipher.bits,
      secure,
      score,
    };
  }
  
  /**
   * Check if certificate is expired
   */
  private isCertificateExpired(cert: { validUntil: Date }): boolean {
    return cert.validUntil.getTime() < Date.now();
  }
  
  /**
   * Discover endpoints to scan from context
   */
  private async discoverEndpoints(
    context: SecurityTelemetryContext
  ): Promise<Array<{ hostname: string; port: number; entityId?: string }>> {
    // In a real implementation, this would query the database for:
    // - DVR/NVR endpoints
    // - API servers
    // - Web servers
    // - Camera endpoints
    
    // For now, return empty array - will be populated by service integration
    return [];
  }
  
  /**
   * Query adapter capabilities
   */
  async capabilities(context: SecurityTelemetryContext): Promise<SecurityCapability[]> {
    return [
      {
        name: 'TLS_PROTOCOL_DETECTION',
        supported: true,
      },
      {
        name: 'CIPHER_ANALYSIS',
        supported: true,
      },
      {
        name: 'CERTIFICATE_VALIDATION',
        supported: true,
      },
      {
        name: 'HTTPS_ENFORCEMENT_CHECK',
        supported: true,
      },
      {
        name: 'OCSP_STAPLING',
        supported: false,
        reason: 'OCSP stapling detection not yet implemented',
      },
      {
        name: 'CERTIFICATE_TRANSPARENCY',
        supported: false,
        reason: 'CT log verification not implemented',
      },
    ];
  }
}
