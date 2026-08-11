/**
 * Certificate Revocation Service
 * Handles OCSP and CRL checking with proper UNKNOWN state until fully implemented
 * Includes SSRF protection and caching
 */

import { ParsedCertificate, RevocationResult, RevocationStatus } from './types';
import { createHash } from 'node:crypto';

export interface RevocationServiceConfig {
  enableOcsp: boolean;
  enableCrl: boolean;
  ocspTimeout: number;
  crlTimeout: number;
  maxCacheAge: number;
  allowPrivateIpRanges: boolean;
}

interface CachedRevocationResult extends RevocationResult {
  cacheKey: string;
  expiresAt: Date;
}

export class RevocationService {
  private config: RevocationServiceConfig;
  private cache: Map<string, CachedRevocationResult> = new Map();

  constructor(config?: Partial<RevocationServiceConfig>) {
    this.config = {
      enableOcsp: config?.enableOcsp ?? false,
      enableCrl: config?.enableCrl ?? false,
      ocspTimeout: config?.ocspTimeout ?? 5000,
      crlTimeout: config?.crlTimeout ?? 10000,
      maxCacheAge: config?.maxCacheAge ?? 3600000, // 1 hour default
      allowPrivateIpRanges: config?.allowPrivateIpRanges ?? false
    };
  }

  /**
   * Check certificate revocation status
   * Returns UNKNOWN if OCSP/CRL not configured or unavailable
   */
  async checkRevocation(
    certificate: ParsedCertificate,
    issuerCertificate?: ParsedCertificate
  ): Promise<RevocationResult> {
    const cacheKey = this.getCacheKey(certificate, issuerCertificate);

    // Check cache first
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }

    // If OCSP not enabled, return UNKNOWN immediately
    if (!this.config.enableOcsp && !this.config.enableCrl) {
      const result: RevocationResult = {
        status: 'UNKNOWN',
        source: 'NONE',
        checkedAt: new Date(),
        error: 'Certificate revocation checking is not configured'
      };

      return result;
    }

    // Try OCSP first (faster)
    if (this.config.enableOcsp) {
      const ocspResult = await this.checkOcsp(certificate, issuerCertificate);
      
      // If OCSP gives definitive answer, use it
      if (ocspResult.status !== 'UNKNOWN') {
        this.cacheResult(cacheKey, ocspResult);
        return ocspResult;
      }
    }

    // Fallback to CRL if OCSP unavailable
    if (this.config.enableCrl) {
      const crlResult = await this.checkCrl(certificate);
      this.cacheResult(cacheKey, crlResult);
      return crlResult;
    }

    // Both methods unavailable
    return {
      status: 'UNKNOWN',
      source: 'NONE',
      checkedAt: new Date(),
      error: 'No revocation checking methods succeeded'
    };
  }

  /**
   * Check OCSP status
   * Returns UNKNOWN until full OCSP implementation is added
   */
  private async checkOcsp(
    certificate: ParsedCertificate,
    issuerCertificate?: ParsedCertificate
  ): Promise<RevocationResult> {
    const result: RevocationResult = {
      status: 'UNKNOWN',
      source: 'OCSP',
      checkedAt: new Date(),
      error: 'OCSP validation not yet implemented'
    };

    // Extract OCSP URL from certificate extensions
    // Note: Node's X509Certificate doesn't expose extensions directly
    // In full implementation, would parse authorityInfoAccess extension
    
    // For now, return UNKNOWN - this is safe and honest
    // Never return GOOD without actual validation
    
    console.log(`OCSP check for ${certificate.subject}: UNKNOWN (not implemented)`);

    return result;
  }

  /**
   * Check CRL status
   * Returns UNKNOWN until full CRL implementation is added
   */
  private async checkCrl(certificate: ParsedCertificate): Promise<RevocationResult> {
    const result: RevocationResult = {
      status: 'UNKNOWN',
      source: 'CRL',
      checkedAt: new Date(),
      error: 'CRL validation not yet implemented'
    };

    // In full implementation:
    // 1. Extract CRL distribution point from certificate
    // 2. Download CRL (with SSRF protection)
    // 3. Parse CRL
    // 4. Check if certificate serial number is in revoked list
    // 5. Verify CRL signature
    // 6. Check CRL is not expired (thisUpdate, nextUpdate)
    
    console.log(`CRL check for ${certificate.subject}: UNKNOWN (not implemented)`);

    return result;
  }

  /**
   * Validate OCSP responder URL for SSRF protection
   */
  private validateOcspUrl(url: string): { valid: boolean; error?: string } {
    try {
      const parsed = new URL(url);

      // Only allow http/https
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          valid: false,
          error: `Unsupported protocol: ${parsed.protocol}`
        };
      }

      // Check for dangerous hosts
      const hostname = parsed.hostname.toLowerCase();

      // Block localhost
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return {
          valid: false,
          error: 'Localhost OCSP responder not allowed'
        };
      }

      // Block link-local addresses
      if (hostname.startsWith('169.254.') || hostname.startsWith('fe80:')) {
        return {
          valid: false,
          error: 'Link-local OCSP responder not allowed'
        };
      }

      // Block cloud metadata endpoints
      if (hostname === '169.254.169.254') {
        return {
          valid: false,
          error: 'Cloud metadata endpoint not allowed'
        };
      }

      // Block private IP ranges (unless explicitly allowed)
      if (!this.config.allowPrivateIpRanges) {
        if (this.isPrivateIp(hostname)) {
          return {
            valid: false,
            error: 'Private IP ranges not allowed (configure allowPrivateIpRanges for internal PKI)'
          };
        }
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid OCSP URL format'
      };
    }
  }

  /**
   * Check if hostname is a private IP address
   */
  private isPrivateIp(hostname: string): boolean {
    // Check for RFC 1918 private ranges
    const privatePatterns = [
      /^10\./,                    // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
      /^192\.168\./,              // 192.168.0.0/16
      /^fc00:/,                   // IPv6 ULA
      /^fd[0-9a-f]{2}:/          // IPv6 ULA
    ];

    return privatePatterns.some(pattern => pattern.test(hostname));
  }

  /**
   * Generate cache key for revocation result
   */
  private getCacheKey(
    certificate: ParsedCertificate,
    issuerCertificate?: ParsedCertificate
  ): string {
    const parts = [
      certificate.fingerprint256,
      issuerCertificate?.fingerprint256 || 'no-issuer'
    ];

    return createHash('sha256')
      .update(parts.join(':'))
      .digest('hex');
  }

  /**
   * Get cached revocation result
   */
  private getCachedResult(cacheKey: string): RevocationResult | null {
    const cached = this.cache.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if cache entry is still valid
    if (new Date() > cached.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }

    // If OCSP response has nextUpdate, respect it
    if (cached.nextUpdate && new Date() > cached.nextUpdate) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached;
  }

  /**
   * Cache revocation result
   */
  private cacheResult(cacheKey: string, result: RevocationResult): void {
    // Determine cache expiry
    let expiresAt: Date;

    if (result.nextUpdate) {
      // Use OCSP nextUpdate if available
      expiresAt = result.nextUpdate;
    } else {
      // Use configured max cache age
      expiresAt = new Date(Date.now() + this.config.maxCacheAge);
    }

    const cached: CachedRevocationResult = {
      ...result,
      cacheKey,
      expiresAt
    };

    this.cache.set(cacheKey, cached);
  }

  /**
   * Clear revocation cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('Revocation cache cleared');
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const now = new Date();
    let cleared = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now > cached.expiresAt) {
        this.cache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      console.log(`Cleared ${cleared} expired revocation cache entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): {
    totalEntries: number;
    byStatus: Record<RevocationStatus, number>;
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    const entries = Array.from(this.cache.values());

    const byStatus: Record<RevocationStatus, number> = {
      GOOD: 0,
      REVOKED: 0,
      UNKNOWN: 0
    };

    let oldestEntry: Date | undefined;
    let newestEntry: Date | undefined;

    for (const entry of entries) {
      byStatus[entry.status]++;

      if (!oldestEntry || entry.checkedAt < oldestEntry) {
        oldestEntry = entry.checkedAt;
      }

      if (!newestEntry || entry.checkedAt > newestEntry) {
        newestEntry = entry.checkedAt;
      }
    }

    return {
      totalEntries: entries.length,
      byStatus,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RevocationServiceConfig>): void {
    Object.assign(this.config, config);
    console.log('Revocation service configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): RevocationServiceConfig {
    return { ...this.config };
  }

  /**
   * Enable OCSP checking (requires full implementation)
   */
  enableOcsp(): void {
    console.warn('⚠️ OCSP checking enabled but not yet fully implemented - will return UNKNOWN');
    this.config.enableOcsp = true;
  }

  /**
   * Disable OCSP checking
   */
  disableOcsp(): void {
    this.config.enableOcsp = false;
    console.log('OCSP checking disabled');
  }
}

// Singleton instance
export const revocationService = new RevocationService();
