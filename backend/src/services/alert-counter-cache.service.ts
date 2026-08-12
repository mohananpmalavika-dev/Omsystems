/**
 * Alert Counter Cache Service
 * Provides fast, cached alert counters with Redis backing
 * Eliminates frontend counting loops and N+1 queries
 */

import { createClient, RedisClientType } from 'redis';
import { Pool } from 'pg';

export interface AlertCounters {
  total: number;
  bySeverity: {
    P1: number;
    P2: number;
    P3: number;
    P4: number;
    P5: number;
  };
  byStatus: {
    pending: number;
    investigating: number;
    acknowledged: number;
    resolved: number;
    false_alarm: number;
    suppressed: number;
  };
  active: number; // pending + investigating + acknowledged
  critical: number; // P1 + P2
  lastUpdated: string;
}

export interface AlertCounterCacheConfig {
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    url?: string;
  };
  ttl?: number; // Cache TTL in seconds
  enableCache?: boolean;
}

export class AlertCounterCacheService {
  private redis: RedisClientType | null = null;
  private isRedisConnected = false;
  private ttl: number;
  private enableCache: boolean;

  constructor(
    private db: Pool,
    private config: AlertCounterCacheConfig = {}
  ) {
    this.ttl = config.ttl || 30; // 30 seconds default
    this.enableCache = config.enableCache !== false;
  }

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (!this.enableCache) {
      console.log('[AlertCounterCache] Cache disabled, using direct queries');
      return;
    }

    try {
      const redisUrl = 
        this.config.redis?.url ||
        `redis://${this.config.redis?.host || 'localhost'}:${this.config.redis?.port || 6379}`;

      this.redis = createClient({
        url: redisUrl,
        password: this.config.redis?.password,
        database: this.config.redis?.db || 0,
        socket: {
          reconnectStrategy: (retries) => {
            const delay = Math.min(retries * 50, 2000);
            return delay;
          },
        },
      });

      this.redis.on('error', (err) => {
        console.error('[AlertCounterCache] Redis error:', err);
        this.isRedisConnected = false;
      });

      this.redis.on('connect', () => {
        console.log('[AlertCounterCache] Connected to Redis');
        this.isRedisConnected = true;
      });

      this.redis.on('ready', () => {
        this.isRedisConnected = true;
      });

      await this.redis.connect();
      console.log('[AlertCounterCache] Redis connection established');
    } catch (error) {
      console.warn('[AlertCounterCache] Redis connection failed, falling back to direct queries:', error);
      this.redis = null;
      this.isRedisConnected = false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.isRedisConnected = false;
    }
  }

  /**
   * Get alert counters for a tenant (cached)
   */
  async getCounters(tenantId: string, options?: {
    branchId?: string;
    forceRefresh?: boolean;
  }): Promise<AlertCounters> {
    const cacheKey = this.getCacheKey(tenantId, options?.branchId);

    // Try cache first (unless force refresh)
    if (!options?.forceRefresh && this.isRedisConnected && this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const counters = JSON.parse(cached) as AlertCounters;
          console.log(`[AlertCounterCache] Cache HIT: ${cacheKey}`);
          return counters;
        }
      } catch (error) {
        console.warn('[AlertCounterCache] Cache read error:', error);
      }
    }

    // Cache miss or refresh - query database
    console.log(`[AlertCounterCache] Cache MISS: ${cacheKey}, querying database`);
    const counters = await this.queryCounters(tenantId, options?.branchId);

    // Update cache
    await this.setCache(cacheKey, counters);

    return counters;
  }

  /**
   * Query alert counters from database
   */
  private async queryCounters(tenantId: string, branchId?: string): Promise<AlertCounters> {
    const startTime = Date.now();

    let query = `
      SELECT
        COUNT(*) AS total,
        -- By Severity
        COUNT(*) FILTER (WHERE severity = 'P1') AS p1,
        COUNT(*) FILTER (WHERE severity = 'P2') AS p2,
        COUNT(*) FILTER (WHERE severity = 'P3') AS p3,
        COUNT(*) FILTER (WHERE severity = 'P4') AS p4,
        COUNT(*) FILTER (WHERE severity = 'P5') AS p5,
        -- By Status
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'investigating') AS investigating,
        COUNT(*) FILTER (WHERE status = 'acknowledged') AS acknowledged,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
        COUNT(*) FILTER (WHERE status = 'false_alarm') AS false_alarm,
        COUNT(*) FILTER (WHERE status = 'suppressed') AS suppressed,
        -- Active alerts
        COUNT(*) FILTER (WHERE status IN ('pending', 'investigating', 'acknowledged')) AS active,
        -- Critical alerts
        COUNT(*) FILTER (WHERE severity IN ('P1', 'P2') AND status NOT IN ('resolved', 'false_alarm', 'suppressed')) AS critical
      FROM analytics_alerts
      WHERE tenant_id = $1
    `;

    const params: any[] = [tenantId];

    if (branchId) {
      query += ` AND branch_id = $2`;
      params.push(branchId);
    }

    try {
      const result = await this.db.query(query, params);
      const row = result.rows[0];

      const counters: AlertCounters = {
        total: parseInt(row.total || '0', 10),
        bySeverity: {
          P1: parseInt(row.p1 || '0', 10),
          P2: parseInt(row.p2 || '0', 10),
          P3: parseInt(row.p3 || '0', 10),
          P4: parseInt(row.p4 || '0', 10),
          P5: parseInt(row.p5 || '0', 10),
        },
        byStatus: {
          pending: parseInt(row.pending || '0', 10),
          investigating: parseInt(row.investigating || '0', 10),
          acknowledged: parseInt(row.acknowledged || '0', 10),
          resolved: parseInt(row.resolved || '0', 10),
          false_alarm: parseInt(row.false_alarm || '0', 10),
          suppressed: parseInt(row.suppressed || '0', 10),
        },
        active: parseInt(row.active || '0', 10),
        critical: parseInt(row.critical || '0', 10),
        lastUpdated: new Date().toISOString(),
      };

      const duration = Date.now() - startTime;
      console.log(`[AlertCounterCache] Query completed in ${duration}ms`);

      return counters;
    } catch (error) {
      console.error('[AlertCounterCache] Query error:', error);
      throw error;
    }
  }

  /**
   * Invalidate cache for a tenant
   */
  async invalidate(tenantId: string, branchId?: string): Promise<void> {
    if (!this.isRedisConnected || !this.redis) {
      return;
    }

    const cacheKey = this.getCacheKey(tenantId, branchId);

    try {
      await this.redis.del(cacheKey);
      console.log(`[AlertCounterCache] Invalidated: ${cacheKey}`);
    } catch (error) {
      console.warn('[AlertCounterCache] Cache invalidation error:', error);
    }
  }

  /**
   * Increment counter in cache (optimistic update)
   */
  async incrementCounter(
    tenantId: string,
    severity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5',
    status: 'pending' | 'investigating' | 'acknowledged' | 'resolved' | 'false_alarm' | 'suppressed',
    branchId?: string
  ): Promise<void> {
    const cacheKey = this.getCacheKey(tenantId, branchId);

    if (!this.isRedisConnected || !this.redis) {
      return;
    }

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const counters = JSON.parse(cached) as AlertCounters;

        // Increment counters
        counters.total++;
        counters.bySeverity[severity]++;
        counters.byStatus[status]++;

        if (['pending', 'investigating', 'acknowledged'].includes(status)) {
          counters.active++;
        }

        if (['P1', 'P2'].includes(severity) && !['resolved', 'false_alarm', 'suppressed'].includes(status)) {
          counters.critical++;
        }

        counters.lastUpdated = new Date().toISOString();

        await this.setCache(cacheKey, counters);
        console.log(`[AlertCounterCache] Incremented counter for ${severity}/${status}`);
      }
    } catch (error) {
      console.warn('[AlertCounterCache] Counter increment error:', error);
    }
  }

  /**
   * Decrement counter in cache (optimistic update)
   */
  async decrementCounter(
    tenantId: string,
    severity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5',
    oldStatus: string,
    newStatus: string,
    branchId?: string
  ): Promise<void> {
    const cacheKey = this.getCacheKey(tenantId, branchId);

    if (!this.isRedisConnected || !this.redis) {
      return;
    }

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const counters = JSON.parse(cached) as AlertCounters;

        // Update status counters
        if (counters.byStatus[oldStatus as keyof typeof counters.byStatus]) {
          counters.byStatus[oldStatus as keyof typeof counters.byStatus]--;
        }
        if (counters.byStatus[newStatus as keyof typeof counters.byStatus]) {
          counters.byStatus[newStatus as keyof typeof counters.byStatus]++;
        }

        // Update active counter
        const wasActive = ['pending', 'investigating', 'acknowledged'].includes(oldStatus);
        const isActive = ['pending', 'investigating', 'acknowledged'].includes(newStatus);
        
        if (wasActive && !isActive) {
          counters.active = Math.max(0, counters.active - 1);
        } else if (!wasActive && isActive) {
          counters.active++;
        }

        // Update critical counter
        const wasCritical = ['P1', 'P2'].includes(severity) && !['resolved', 'false_alarm', 'suppressed'].includes(oldStatus);
        const isCritical = ['P1', 'P2'].includes(severity) && !['resolved', 'false_alarm', 'suppressed'].includes(newStatus);
        
        if (wasCritical && !isCritical) {
          counters.critical = Math.max(0, counters.critical - 1);
        } else if (!wasCritical && isCritical) {
          counters.critical++;
        }

        counters.lastUpdated = new Date().toISOString();

        await this.setCache(cacheKey, counters);
        console.log(`[AlertCounterCache] Updated counter for status change ${oldStatus} → ${newStatus}`);
      }
    } catch (error) {
      console.warn('[AlertCounterCache] Counter decrement error:', error);
    }
  }

  /**
   * Get cache hit rate (for monitoring)
   */
  async getCacheStats(): Promise<{
    enabled: boolean;
    connected: boolean;
    hitRate?: number;
  }> {
    if (!this.enableCache) {
      return { enabled: false, connected: false };
    }

    if (!this.isRedisConnected || !this.redis) {
      return { enabled: true, connected: false };
    }

    try {
      // Get Redis stats
      const info = await this.redis.info('stats');
      const lines = info.split('\r\n');
      
      let hits = 0;
      let misses = 0;
      
      for (const line of lines) {
        if (line.startsWith('keyspace_hits:')) {
          const value = line.split(':')[1];
          if (value) hits = parseInt(value, 10);
        }
        if (line.startsWith('keyspace_misses:')) {
          const value = line.split(':')[1];
          if (value) misses = parseInt(value, 10);
        }
      }

      const total = hits + misses;
      const hitRate = total > 0 ? (hits / total) * 100 : 0;

      return {
        enabled: true,
        connected: true,
        hitRate: Math.round(hitRate * 100) / 100,
      };
    } catch (error) {
      return { enabled: true, connected: false };
    }
  }

  /**
   * Warm cache for all tenants
   */
  async warmCache(tenantIds: string[]): Promise<void> {
    console.log(`[AlertCounterCache] Warming cache for ${tenantIds.length} tenants...`);
    
    await Promise.all(
      tenantIds.map(async (tenantId) => {
        try {
          await this.getCounters(tenantId, { forceRefresh: true });
        } catch (error) {
          console.error(`[AlertCounterCache] Failed to warm cache for tenant ${tenantId}:`, error);
        }
      })
    );

    console.log('[AlertCounterCache] Cache warming complete');
  }

  /**
   * Private helpers
   */

  private getCacheKey(tenantId: string, branchId?: string): string {
    if (branchId) {
      return `alert:counters:${tenantId}:${branchId}`;
    }
    return `alert:counters:${tenantId}`;
  }

  private async setCache(key: string, counters: AlertCounters): Promise<void> {
    if (!this.isRedisConnected || !this.redis) {
      return;
    }

    try {
      await this.redis.setEx(key, this.ttl, JSON.stringify(counters));
    } catch (error) {
      console.warn('[AlertCounterCache] Cache write error:', error);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    cacheEnabled: boolean;
    redisConnected: boolean;
  }> {
    return {
      healthy: !this.enableCache || this.isRedisConnected,
      cacheEnabled: this.enableCache,
      redisConnected: this.isRedisConnected,
    };
  }
}

/**
 * Singleton instance
 */
let cacheInstance: AlertCounterCacheService | null = null;

export function initializeAlertCounterCache(
  db: Pool,
  config?: AlertCounterCacheConfig
): AlertCounterCacheService {
  if (cacheInstance) {
    return cacheInstance;
  }

  const redisConfig: AlertCounterCacheConfig = {
    redis: {
      host: config?.redis?.host || process.env.REDIS_HOST || 'localhost',
      port: config?.redis?.port || parseInt(process.env.REDIS_PORT || '6379', 10),
      password: config?.redis?.password || process.env.REDIS_PASSWORD,
      db: config?.redis?.db || parseInt(process.env.REDIS_COUNTER_DB || '1', 10),
      url: config?.redis?.url || process.env.REDIS_URL,
    },
    ttl: config?.ttl || parseInt(process.env.ALERT_COUNTER_TTL || '30', 10),
    enableCache: config?.enableCache !== false && process.env.ALERT_COUNTER_CACHE !== 'false',
  };

  cacheInstance = new AlertCounterCacheService(db, redisConfig);
  return cacheInstance;
}

export function getAlertCounterCache(): AlertCounterCacheService {
  if (!cacheInstance) {
    throw new Error('AlertCounterCacheService not initialized. Call initializeAlertCounterCache() first.');
  }
  return cacheInstance;
}

export default {
  initialize: initializeAlertCounterCache,
  getInstance: getAlertCounterCache,
};
