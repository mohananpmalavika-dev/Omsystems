/**
 * Certificate Trust Store
 * Manages multiple trust domains: public CAs, private PKI, customer CAs, device manufacturers
 * Provides explicit trust anchor identification for compliance
 */

import { TrustAnchor, TrustSource } from './types';
import { x509Parser } from './x509-parser';

export class TrustStore {
  private anchors: Map<string, TrustAnchor> = new Map();

  /**
   * Add trust anchor to store
   */
  async addTrustAnchor(anchor: Omit<TrustAnchor, 'id' | 'fingerprint' | 'subject'>): Promise<TrustAnchor> {
    // Parse certificate to extract fingerprint and subject
    const parseResult = x509Parser.parseCertificate(anchor.certificatePem);
    
    if (parseResult.status !== 'PARSED') {
      throw new Error(`Failed to parse trust anchor certificate: ${parseResult.error}`);
    }

    const trustAnchor: TrustAnchor = {
      id: parseResult.fingerprint256,
      fingerprint: parseResult.fingerprint256,
      subject: parseResult.subject,
      ...anchor
    };

    this.anchors.set(trustAnchor.id, trustAnchor);

    console.log(`✓ Trust anchor added: ${trustAnchor.subject} (${trustAnchor.type})`);

    return trustAnchor;
  }

  /**
   * Remove trust anchor
   */
  removeTrustAnchor(anchorId: string): boolean {
    const removed = this.anchors.delete(anchorId);
    
    if (removed) {
      console.log(`⚠️ Trust anchor removed: ${anchorId}`);
    }
    
    return removed;
  }

  /**
   * Get trust anchor by ID
   */
  getTrustAnchor(anchorId: string): TrustAnchor | null {
    return this.anchors.get(anchorId) || null;
  }

  /**
   * Get trust anchor by fingerprint
   */
  getTrustAnchorByFingerprint(fingerprint: string): TrustAnchor | null {
    return this.anchors.get(fingerprint) || null;
  }

  /**
   * Find trust anchor by issuer subject
   */
  findTrustAnchorBySubject(subject: string): TrustAnchor | null {
    for (const anchor of this.anchors.values()) {
      if (anchor.subject === subject && anchor.enabled) {
        return anchor;
      }
    }
    return null;
  }

  /**
   * List all trust anchors
   */
  listTrustAnchors(filter?: {
    type?: TrustSource;
    tenantId?: string;
    enabled?: boolean;
  }): TrustAnchor[] {
    let anchors = Array.from(this.anchors.values());

    if (filter?.type) {
      anchors = anchors.filter(a => a.type === filter.type);
    }

    if (filter?.tenantId !== undefined) {
      anchors = anchors.filter(a => a.tenantId === filter.tenantId);
    }

    if (filter?.enabled !== undefined) {
      anchors = anchors.filter(a => a.enabled === filter.enabled);
    }

    return anchors;
  }

  /**
   * Enable/disable trust anchor
   */
  setTrustAnchorEnabled(anchorId: string, enabled: boolean): boolean {
    const anchor = this.anchors.get(anchorId);
    
    if (!anchor) {
      return false;
    }

    anchor.enabled = enabled;
    
    console.log(`Trust anchor ${enabled ? 'enabled' : 'disabled'}: ${anchor.subject}`);
    
    return true;
  }

  /**
   * Get all enabled trust anchors for tenant
   */
  getEnabledTrustAnchors(tenantId?: string): TrustAnchor[] {
    return this.listTrustAnchors({
      enabled: true,
      tenantId
    });
  }

  /**
   * Get trust anchors as PEM certificates
   */
  getTrustAnchorsPem(tenantId?: string): string[] {
    const anchors = this.getEnabledTrustAnchors(tenantId);
    return anchors.map(a => a.certificatePem);
  }

  /**
   * Check if issuer is trusted
   */
  isIssuerTrusted(issuerSubject: string, tenantId?: string): boolean {
    const anchors = this.getEnabledTrustAnchors(tenantId);
    return anchors.some(a => a.subject === issuerSubject);
  }

  /**
   * Initialize default system trust anchors
   * In production, load from OS trust store or configuration
   */
  async initializeSystemTrustAnchors(): Promise<void> {
    console.log('Initializing system trust anchors...');
    
    // Note: In production, load actual root CA certificates
    // For now, this is a placeholder for explicit configuration
    // System should require explicit trust anchor configuration
    
    console.log('✓ Trust store initialized (explicit configuration required)');
  }

  /**
   * Clear all trust anchors (use with caution)
   */
  clearAllTrustAnchors(): void {
    console.warn('⚠️ Clearing all trust anchors');
    this.anchors.clear();
  }

  /**
   * Get trust store statistics
   */
  getStatistics(): {
    totalAnchors: number;
    enabledAnchors: number;
    byType: Record<TrustSource, number>;
    byTenant: Record<string, number>;
  } {
    const anchors = Array.from(this.anchors.values());
    
    const byType: Record<TrustSource, number> = {
      PUBLIC_CA: 0,
      PRIVATE_CA: 0,
      CUSTOMER_CA: 0,
      MANUFACTURER_CA: 0,
      PINNED: 0
    };

    const byTenant: Record<string, number> = {};

    for (const anchor of anchors) {
      byType[anchor.type]++;
      
      if (anchor.tenantId) {
        byTenant[anchor.tenantId] = (byTenant[anchor.tenantId] || 0) + 1;
      }
    }

    return {
      totalAnchors: anchors.length,
      enabledAnchors: anchors.filter(a => a.enabled).length,
      byType,
      byTenant
    };
  }
}

// Singleton instance
export const trustStore = new TrustStore();
