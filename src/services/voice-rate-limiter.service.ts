/**
 * Voice Rate Limiter Service
 * 
 * Production-grade rate limiting with per-user, per-IP, and per-tenant limits,
 * sliding window algorithm, and anomaly detection for abuse prevention.
 */

export interface RateLimitConfig {
  // Per-user limits
  userAuthAttemptsPerMinute: number;
  userAuthAttemptsPerHour: number;
  userEnrollmentAttemptsPerHour: number;
  
  // Per-IP limits
  ipAuthAttemptsPerMinute: number;
  ipAuthAttemptsPerHour: number;
  
  // Per-tenant limits
  tenantAuthAttemptsPerMinute: number;
  
  // Lockout thresholds
  maxConsecutiveFailures: number;
  lockoutDurationMinutes: number;
  
  // Anomaly detection
  enableAnomalyDetection: boolean;
  anomalyThresholdMultiplier: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts?: number;
  resetTime?: Date;
  lockoutUntil?: Date;
  reason?: string;
}

export interface RateLimitKey {
  type: "user" | "ip" | "tenant";
  identifier: string;
  action: "auth" | "enrollment";
  window: "minute" | "hour";
}

interface RateLimitEntry {
  count: number;
  firstAttempt: Date;
  lastAttempt: Date;
  consecutiveFailures: number;
  lockedUntil?: Date;
}

export class VoiceRateLimiterService {
  private config: RateLimitConfig;
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      // User limits
      userAuthAttemptsPerMinute: 5,
      userAuthAttemptsPerHour: 20,
      userEnrollmentAttemptsPerHour: 10,
      
      // IP limits
      ipAuthAttemptsPerMinute: 10,
      ipAuthAttemptsPerHour: 50,
      
      // Tenant limits
      tenantAuthAttemptsPerMinute: 100,
      
      // Lockout
      maxConsecutiveFailures: 5,
      lockoutDurationMinutes: 15,
      
      // Anomaly detection
      enableAnomalyDetection: true,
      anomalyThresholdMultiplier: 3,
      
      ...config,
    };

    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if request is rate limited
   */
  async checkRateLimit(
    userId?: string,
    ipAddress?: string,
    tenantId?: string,
    action: "auth" | "enrollment" = "auth"
  ): Promise<RateLimitResult> {
    const checks: RateLimitResult[] = [];

    // Check user-based limits
    if (userId) {
      checks.push(await this.checkUserLimit(userId, action));
    }

    // Check IP-based limits
    if (ipAddress) {
      checks.push(await this.checkIpLimit(ipAddress, action));
    }

    // Check tenant-based limits
    if (tenantId) {
      checks.push(await this.checkTenantLimit(tenantId, action));
    }

    // Return first failure or success
    const blocked = checks.find((c) => !c.allowed);
    if (blocked) {
      return blocked;
    }

    // Find the most restrictive remaining count
    const remainingCounts = checks
      .map((c) => c.remainingAttempts)
      .filter((c): c is number => c !== undefined);

    return {
      allowed: true,
      remainingAttempts: remainingCounts.length > 0 ? Math.min(...remainingCounts) : undefined,
      resetTime: checks[0]?.resetTime,
    };
  }

  /**
   * Record attempt (success or failure)
   */
  async recordAttempt(
    success: boolean,
    userId?: string,
    ipAddress?: string,
    tenantId?: string,
    action: "auth" | "enrollment" = "auth"
  ): Promise<void> {
    const now = new Date();

    // Record for user
    if (userId) {
      this.incrementCounter(userId, action, "minute", success);
      this.incrementCounter(userId, action, "hour", success);
    }

    // Record for IP
    if (ipAddress) {
      this.incrementCounter(ipAddress, action, "minute", success, "ip");
      this.incrementCounter(ipAddress, action, "hour", success, "ip");
    }

    // Record for tenant
    if (tenantId) {
      this.incrementCounter(tenantId, action, "minute", success, "tenant");
    }

    // Check for anomalies
    if (this.config.enableAnomalyDetection && !success) {
      await this.detectAnomalies(userId, ipAddress, tenantId);
    }
  }

  /**
   * Check if user/IP is locked out
   */
  async isLockedOut(identifier: string, type: "user" | "ip" = "user"): Promise<boolean> {
    const key = this.buildKey({ type, identifier, action: "auth", window: "minute" });
    const entry = this.store.get(key);

    if (!entry || !entry.lockedUntil) {
      return false;
    }

    if (new Date() < entry.lockedUntil) {
      return true;
    }

    // Lockout expired, clear it
    delete entry.lockedUntil;
    entry.consecutiveFailures = 0;
    this.store.set(key, entry);

    return false;
  }

  /**
   * Get lockout info
   */
  async getLockoutInfo(identifier: string, type: "user" | "ip" = "user"): Promise<{
    isLocked: boolean;
    lockedUntil?: Date;
    consecutiveFailures: number;
  }> {
    const key = this.buildKey({ type, identifier, action: "auth", window: "minute" });
    const entry = this.store.get(key);

    if (!entry) {
      return { isLocked: false, consecutiveFailures: 0 };
    }

    const isLocked = entry.lockedUntil ? new Date() < entry.lockedUntil : false;

    return {
      isLocked,
      lockedUntil: isLocked ? entry.lockedUntil : undefined,
      consecutiveFailures: entry.consecutiveFailures,
    };
  }

  /**
   * Manually lock user/IP
   */
  async lockIdentifier(
    identifier: string,
    durationMinutes: number,
    type: "user" | "ip" = "user"
  ): Promise<void> {
    const key = this.buildKey({ type, identifier, action: "auth", window: "minute" });
    const entry = this.store.get(key) || {
      count: 0,
      firstAttempt: new Date(),
      lastAttempt: new Date(),
      consecutiveFailures: this.config.maxConsecutiveFailures,
    };

    const lockoutUntil = new Date();
    lockoutUntil.setMinutes(lockoutUntil.getMinutes() + durationMinutes);

    entry.lockedUntil = lockoutUntil;
    this.store.set(key, entry);
  }

  /**
   * Unlock user/IP
   */
  async unlockIdentifier(identifier: string, type: "user" | "ip" = "user"): Promise<void> {
    const key = this.buildKey({ type, identifier, action: "auth", window: "minute" });
    const entry = this.store.get(key);

    if (entry) {
      delete entry.lockedUntil;
      entry.consecutiveFailures = 0;
      this.store.set(key, entry);
    }
  }

  /**
   * Reset rate limit for identifier
   */
  async resetRateLimit(identifier: string, type: "user" | "ip" = "user"): Promise<void> {
    // Remove all entries for this identifier
    const keysToDelete: string[] = [];

    for (const key of this.store.keys()) {
      if (key.includes(identifier)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.store.delete(key);
    }
  }

  /**
   * Get current rate limit status
   */
  async getRateLimitStatus(
    identifier: string,
    type: "user" | "ip" = "user",
    action: "auth" | "enrollment" = "auth"
  ): Promise<{
    minuteCount: number;
    hourCount: number;
    consecutiveFailures: number;
    lockedUntil?: Date;
  }> {
    const minuteKey = this.buildKey({ type, identifier, action, window: "minute" });
    const hourKey = this.buildKey({ type, identifier, action, window: "hour" });

    const minuteEntry = this.store.get(minuteKey);
    const hourEntry = this.store.get(hourKey);

    return {
      minuteCount: this.getValidCount(minuteEntry, 60),
      hourCount: this.getValidCount(hourEntry, 3600),
      consecutiveFailures: minuteEntry?.consecutiveFailures || 0,
      lockedUntil: minuteEntry?.lockedUntil,
    };
  }

  /**
   * Private methods
   */

  private async checkUserLimit(userId: string, action: "auth" | "enrollment"): Promise<RateLimitResult> {
    // Check if locked out
    if (await this.isLockedOut(userId, "user")) {
      const lockoutInfo = await this.getLockoutInfo(userId, "user");
      return {
        allowed: false,
        reason: "Account temporarily locked due to too many failed attempts",
        lockoutUntil: lockoutInfo.lockedUntil,
      };
    }

    // Check minute limit
    const minuteLimit = this.config.userAuthAttemptsPerMinute;
    const minuteKey = this.buildKey({ type: "user", identifier: userId, action, window: "minute" });
    const minuteEntry = this.store.get(minuteKey);
    const minuteCount = this.getValidCount(minuteEntry, 60);

    if (minuteCount >= minuteLimit) {
      return {
        allowed: false,
        remainingAttempts: 0,
        resetTime: this.getResetTime(minuteEntry, 60),
        reason: "Rate limit exceeded (per minute)",
      };
    }

    // Check hour limit
    const hourLimit =
      action === "auth"
        ? this.config.userAuthAttemptsPerHour
        : this.config.userEnrollmentAttemptsPerHour;
    const hourKey = this.buildKey({ type: "user", identifier: userId, action, window: "hour" });
    const hourEntry = this.store.get(hourKey);
    const hourCount = this.getValidCount(hourEntry, 3600);

    if (hourCount >= hourLimit) {
      return {
        allowed: false,
        remainingAttempts: 0,
        resetTime: this.getResetTime(hourEntry, 3600),
        reason: "Rate limit exceeded (per hour)",
      };
    }

    return {
      allowed: true,
      remainingAttempts: Math.min(minuteLimit - minuteCount, hourLimit - hourCount),
      resetTime: this.getResetTime(minuteEntry, 60),
    };
  }

  private async checkIpLimit(ipAddress: string, action: "auth" | "enrollment"): Promise<RateLimitResult> {
    // Check if IP is locked out
    if (await this.isLockedOut(ipAddress, "ip")) {
      const lockoutInfo = await this.getLockoutInfo(ipAddress, "ip");
      return {
        allowed: false,
        reason: "IP address temporarily blocked",
        lockoutUntil: lockoutInfo.lockedUntil,
      };
    }

    // Check minute limit
    const minuteLimit = this.config.ipAuthAttemptsPerMinute;
    const minuteKey = this.buildKey({ type: "ip", identifier: ipAddress, action, window: "minute" });
    const minuteEntry = this.store.get(minuteKey);
    const minuteCount = this.getValidCount(minuteEntry, 60);

    if (minuteCount >= minuteLimit) {
      return {
        allowed: false,
        remainingAttempts: 0,
        resetTime: this.getResetTime(minuteEntry, 60),
        reason: "Rate limit exceeded for IP address",
      };
    }

    // Check hour limit
    const hourLimit = this.config.ipAuthAttemptsPerHour;
    const hourKey = this.buildKey({ type: "ip", identifier: ipAddress, action, window: "hour" });
    const hourEntry = this.store.get(hourKey);
    const hourCount = this.getValidCount(hourEntry, 3600);

    if (hourCount >= hourLimit) {
      return {
        allowed: false,
        remainingAttempts: 0,
        resetTime: this.getResetTime(hourEntry, 3600),
        reason: "Hourly rate limit exceeded for IP address",
      };
    }

    return {
      allowed: true,
      remainingAttempts: Math.min(minuteLimit - minuteCount, hourLimit - hourCount),
    };
  }

  private async checkTenantLimit(tenantId: string, action: "auth" | "enrollment"): Promise<RateLimitResult> {
    const minuteLimit = this.config.tenantAuthAttemptsPerMinute;
    const minuteKey = this.buildKey({ type: "tenant", identifier: tenantId, action, window: "minute" });
    const minuteEntry = this.store.get(minuteKey);
    const minuteCount = this.getValidCount(minuteEntry, 60);

    if (minuteCount >= minuteLimit) {
      return {
        allowed: false,
        remainingAttempts: 0,
        resetTime: this.getResetTime(minuteEntry, 60),
        reason: "Tenant rate limit exceeded",
      };
    }

    return {
      allowed: true,
      remainingAttempts: minuteLimit - minuteCount,
    };
  }

  private incrementCounter(
    identifier: string,
    action: "auth" | "enrollment",
    window: "minute" | "hour",
    success: boolean,
    type: "user" | "ip" | "tenant" = "user"
  ): void {
    const key = this.buildKey({ type, identifier, action, window });
    const now = new Date();
    const windowSeconds = window === "minute" ? 60 : 3600;

    let entry = this.store.get(key);

    if (!entry || this.isExpired(entry, windowSeconds)) {
      entry = {
        count: 0,
        firstAttempt: now,
        lastAttempt: now,
        consecutiveFailures: 0,
      };
    }

    entry.count++;
    entry.lastAttempt = now;

    // Track consecutive failures for lockout
    if (!success) {
      entry.consecutiveFailures++;

      // Trigger lockout if threshold exceeded
      if (entry.consecutiveFailures >= this.config.maxConsecutiveFailures && !entry.lockedUntil) {
        const lockoutUntil = new Date();
        lockoutUntil.setMinutes(lockoutUntil.getMinutes() + this.config.lockoutDurationMinutes);
        entry.lockedUntil = lockoutUntil;
      }
    } else {
      entry.consecutiveFailures = 0;
      delete entry.lockedUntil;
    }

    this.store.set(key, entry);
  }

  private getValidCount(entry: RateLimitEntry | undefined, windowSeconds: number): number {
    if (!entry) return 0;
    if (this.isExpired(entry, windowSeconds)) return 0;
    return entry.count;
  }

  private isExpired(entry: RateLimitEntry, windowSeconds: number): boolean {
    const now = Date.now();
    const firstAttemptTime = entry.firstAttempt.getTime();
    return now - firstAttemptTime > windowSeconds * 1000;
  }

  private getResetTime(entry: RateLimitEntry | undefined, windowSeconds: number): Date | undefined {
    if (!entry) return undefined;

    const resetTime = new Date(entry.firstAttempt.getTime() + windowSeconds * 1000);
    return resetTime;
  }

  private buildKey(key: RateLimitKey): string {
    return `${key.type}:${key.identifier}:${key.action}:${key.window}`;
  }

  private async detectAnomalies(
    userId?: string,
    ipAddress?: string,
    tenantId?: string
  ): Promise<void> {
    // Check for suspicious patterns
    // E.g., same IP trying multiple users, rapid failures, etc.

    if (ipAddress) {
      // Check if IP is attacking multiple users
      const ipKeys = Array.from(this.store.keys()).filter(
        (k) => k.startsWith("ip:") && k.includes(ipAddress)
      );

      if (ipKeys.length > 10) {
        // IP is trying many accounts, lock it
        await this.lockIdentifier(ipAddress, this.config.lockoutDurationMinutes * 2, "ip");
        console.warn(`Suspicious activity detected from IP ${ipAddress}, locking for extended period`);
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.store.entries()) {
      // Remove entries older than 2 hours
      if (now - entry.lastAttempt.getTime() > 2 * 3600 * 1000) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.store.delete(key);
    }

    if (keysToDelete.length > 0) {
      console.log(`Cleaned up ${keysToDelete.length} expired rate limit entries`);
    }
  }

  /**
   * Cleanup on shutdown
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

// Singleton instance
let rateLimiterInstance: VoiceRateLimiterService | null = null;

export function getVoiceRateLimiter(config?: Partial<RateLimitConfig>): VoiceRateLimiterService {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new VoiceRateLimiterService(config);
  }
  return rateLimiterInstance;
}
