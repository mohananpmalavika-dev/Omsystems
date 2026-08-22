/**
 * Certificate Transparency Log Registry
 * 
 * Maintains trusted CT log metadata for SCT validation.
 * Caches log list to avoid repeated fetches.
 */

/**
 * CT log information
 */
export interface CtLogInfo {
  /** Log ID (base64) */
  logId: string;
  
  /** Log public key */
  publicKey: string;
  
  /** Log operator */
  operator: string;
  
  /** Log state */
  state: 'usable' | 'readonly' | 'retired' | 'rejected';
  
  /** Valid from timestamp */
  validFrom?: Date;
  
  /** Valid until timestamp */
  validUntil?: Date;
  
  /** Log URL */
  url?: string;
  
  /** Maximum merge delay (seconds) */
  mmd?: number;
}

/**
 * CT Log Registry
 */
export class CtLogRegistry {
  private logs = new Map<string, CtLogInfo>();
  private lastFetchedAt: Date | null = null;
  private fetchPromise: Promise<void> | null = null;
  
  /**
   * Fetch and cache CT log list
   */
  async fetchLogList(): Promise<void> {
    // Prevent concurrent fetches
    if (this.fetchPromise) {
      return this.fetchPromise;
    }
    
    this.fetchPromise = this.doFetchLogList();
    
    try {
      await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
    }
  }
  
  /**
   * Actual fetch implementation
   */
  private async doFetchLogList(): Promise<void> {
    try {
      // In a real implementation, this would fetch from:
      // https://www.gstatic.com/ct/log_list/v3/log_list.json
      
      // For now, add some well-known logs manually
      this.addWellKnownLogs();
      
      this.lastFetchedAt = new Date();
    } catch (error) {
      console.error('[CtLogRegistry] Failed to fetch CT log list:', error);
      
      // Fallback to well-known logs
      if (this.logs.size === 0) {
        this.addWellKnownLogs();
      }
    }
  }
  
  /**
   * Add well-known CT logs
   */
  private addWellKnownLogs(): void {
    // Google 'Argon2024' Log
    this.logs.set('google-argon2024', {
      logId: 'google-argon2024',
      publicKey: '',
      operator: 'Google',
      state: 'usable',
      url: 'https://ct.googleapis.com/logs/us1/argon2024/',
      mmd: 86400,
    });
    
    // Google 'Xenon2024' Log
    this.logs.set('google-xenon2024', {
      logId: 'google-xenon2024',
      publicKey: '',
      operator: 'Google',
      state: 'usable',
      url: 'https://ct.googleapis.com/logs/us1/xenon2024/',
      mmd: 86400,
    });
    
    // Cloudflare 'Nimbus2024' Log
    this.logs.set('cloudflare-nimbus2024', {
      logId: 'cloudflare-nimbus2024',
      publicKey: '',
      operator: 'Cloudflare',
      state: 'usable',
      url: 'https://ct.cloudflare.com/logs/nimbus2024/',
      mmd: 86400,
    });
    
    // DigiCert Log
    this.logs.set('digicert-log', {
      logId: 'digicert-log',
      publicKey: '',
      operator: 'DigiCert',
      state: 'usable',
      url: 'https://ct1.digicert-ct.com/log/',
      mmd: 86400,
    });
    
    // Let's Encrypt 'Oak2024' Log
    this.logs.set('letsencrypt-oak2024', {
      logId: 'letsencrypt-oak2024',
      publicKey: '',
      operator: "Let's Encrypt",
      state: 'usable',
      url: 'https://oak.ct.letsencrypt.org/2024/',
      mmd: 86400,
    });
  }
  
  /**
   * Get log by ID
   */
  getLog(logId: string): CtLogInfo | undefined {
    return this.logs.get(logId);
  }
  
  /**
   * Get all usable logs
   */
  getUsableLogs(): CtLogInfo[] {
    return Array.from(this.logs.values())
      .filter(log => log.state === 'usable');
  }
  
  /**
   * Get all logs
   */
  getAllLogs(): CtLogInfo[] {
    return Array.from(this.logs.values());
  }
  
  /**
   * Check if log is recognized
   */
  isRecognized(logId: string): boolean {
    return this.logs.has(logId);
  }
  
  /**
   * Check if log is trusted (usable)
   */
  isTrusted(logId: string): boolean {
    const log = this.logs.get(logId);
    return log?.state === 'usable';
  }
  
  /**
   * Get metadata freshness
   */
  isStale(maxAgeMs: number = 24 * 60 * 60 * 1000): boolean {
    if (!this.lastFetchedAt) return true;
    return Date.now() - this.lastFetchedAt.getTime() > maxAgeMs;
  }
  
  /**
   * Refresh if stale
   */
  async refreshIfStale(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    if (this.isStale(maxAgeMs)) {
      await this.fetchLogList();
    }
  }
}

/**
 * Singleton instance
 */
let registryInstance: CtLogRegistry | null = null;

/**
 * Get CT log registry
 */
export function getCtLogRegistry(): CtLogRegistry {
  if (!registryInstance) {
    registryInstance = new CtLogRegistry();
    
    // Initialize with well-known logs
    registryInstance.fetchLogList().catch(error => {
      console.error('[CtLogRegistry] Failed to initialize:', error);
    });
  }
  
  return registryInstance;
}
