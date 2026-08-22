/**
 * Federation Gateway Service
 * Routes requests to appropriate regional servers and aggregates results
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { getFederationManager, type RoutingDecision } from './federation-manager.service.js';

export interface GatewayRequest {
  tenantId: string;
  scopeNodeId?: string; // Optional: specific resource scope
  targetServerId?: string; // Optional: explicit server target
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

export interface GatewayResponse {
  success: boolean;
  statusCode: number;
  data?: any;
  error?: string;
  serverId: string;
  serverName: string;
  responseTime: number;
  cached?: boolean;
}

export interface AggregatedResponse {
  success: boolean;
  totalServers: number;
  successfulServers: number;
  failedServers: number;
  results: GatewayResponse[];
  aggregatedData?: any;
  responseTime: number;
}

export interface CircuitBreakerState {
  serverId: string;
  status: 'closed' | 'open' | 'half_open';
  failureCount: number;
  lastFailureTime?: Date;
  nextRetryTime?: Date;
}

export class FederationGatewayService extends EventEmitter {
  private pool: Pool;
  private federationManager: ReturnType<typeof getFederationManager>;
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private requestCache: Map<string, { data: any; expiresAt: Date }> = new Map();
  
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT_MS = 60000; // 1 minute
  private readonly CACHE_TTL_MS = 30000; // 30 seconds
  private readonly REQUEST_TIMEOUT_MS = 10000; // 10 seconds

  constructor(pool: Pool) {
    super();
    this.pool = pool;
    this.federationManager = getFederationManager(pool);

    // Start circuit breaker reset timer
    this.startCircuitBreakerMonitoring();
  }

  /**
   * Route a request to a single server
   */
  async routeRequest(request: GatewayRequest): Promise<GatewayResponse> {
    const startTime = Date.now();

    try {
      // Determine target server
      const routing = await this.determineTargetServer(request);

      // Check circuit breaker
      if (this.isCircuitOpen(routing.serverId)) {
        // Try fallback servers
        if (routing.fallbackServers && routing.fallbackServers.length > 0) {
          for (const fallbackId of routing.fallbackServers) {
            if (!this.isCircuitOpen(fallbackId)) {
              const fallbackServer = await this.federationManager.getServerById(fallbackId);
              if (fallbackServer) {
                routing.serverId = fallbackServer.id;
                routing.serverUrl = fallbackServer.apiUrl;
                break;
              }
            }
          }
        }

        if (this.isCircuitOpen(routing.serverId)) {
          throw new Error(`Circuit breaker open for server: ${routing.serverId}`);
        }
      }

      // Check cache for GET requests
      if (request.method === 'GET') {
        const cached = this.getFromCache(routing.serverId, request.path, request.query);
        if (cached) {
          return {
            success: true,
            statusCode: 200,
            data: cached,
            serverId: routing.serverId,
            serverName: 'cached',
            responseTime: Date.now() - startTime,
            cached: true
          };
        }
      }

      // Execute request
      const response = await this.executeRequest(routing, request);

      // Cache successful GET requests
      if (request.method === 'GET' && response.success) {
        this.setCache(routing.serverId, request.path, request.query, response.data);
      }

      // Reset circuit breaker on success
      this.recordSuccess(routing.serverId);

      return {
        ...response,
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Gateway request failed', {
        path: request.path,
        method: request.method,
        error: errorMessage
      });

      return {
        success: false,
        statusCode: 502,
        error: errorMessage,
        serverId: 'unknown',
        serverName: 'unknown',
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Broadcast a request to multiple servers and aggregate results
   */
  async broadcastRequest(
    tenantId: string,
    request: Omit<GatewayRequest, 'tenantId' | 'scopeNodeId'>,
    filters?: {
      regions?: string[];
      serverIds?: string[];
      roles?: string[];
    }
  ): Promise<AggregatedResponse> {
    const startTime = Date.now();

    try {
      // Get target servers
      const servers = await this.getTargetServers(tenantId, filters);

      if (servers.length === 0) {
        return {
          success: false,
          totalServers: 0,
          successfulServers: 0,
          failedServers: 0,
          results: [],
          responseTime: Date.now() - startTime
        };
      }

      // Execute requests in parallel
      const promises = servers.map(server => 
        this.executeServerRequest(server.id, server.api_url, request)
      );

      const results = await Promise.allSettled(promises);

      // Process results
      const responses: GatewayResponse[] = [];
      let successCount = 0;
      let failureCount = 0;

      results.forEach((result, index) => {
        const server = servers[index];
        
        if (result.status === 'fulfilled') {
          responses.push({
            ...result.value,
            serverId: server.id,
            serverName: server.name
          });
          
          if (result.value.success) {
            successCount++;
            this.recordSuccess(server.id);
          } else {
            failureCount++;
            this.recordFailure(server.id);
          }
        } else {
          responses.push({
            success: false,
            statusCode: 503,
            error: result.reason?.message || 'Request failed',
            serverId: server.id,
            serverName: server.name,
            responseTime: Date.now() - startTime
          });
          failureCount++;
          this.recordFailure(server.id);
        }
      });

      return {
        success: successCount > 0,
        totalServers: servers.length,
        successfulServers: successCount,
        failedServers: failureCount,
        results: responses,
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      logger.error('Broadcast request failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        totalServers: 0,
        successfulServers: 0,
        failedServers: 0,
        results: [],
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Aggregate search results from multiple servers
   */
  async aggregateSearchResults(
    tenantId: string,
    searchQuery: any,
    options?: {
      regions?: string[];
      maxResults?: number;
      sortBy?: string;
    }
  ): Promise<AggregatedResponse> {
    const startTime = Date.now();

    // Broadcast search to all relevant servers
    const response = await this.broadcastRequest(
      tenantId,
      {
        path: '/v1/search',
        method: 'POST',
        body: searchQuery
      },
      { regions: options?.regions }
    );

    // Aggregate and sort results
    const allResults: any[] = [];
    
    response.results.forEach(result => {
      if (result.success && result.data?.results) {
        allResults.push(...result.data.results.map((item: any) => ({
          ...item,
          sourceServerId: result.serverId,
          sourceServerName: result.serverName
        })));
      }
    });

    // Sort results
    if (options?.sortBy) {
      allResults.sort((a, b) => {
        const aVal = a[options.sortBy!];
        const bVal = b[options.sortBy!];
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return bVal - aVal; // Descending for numbers
        }
        
        return String(aVal).localeCompare(String(bVal));
      });
    }

    // Limit results
    const maxResults = options?.maxResults || 100;
    const limitedResults = allResults.slice(0, maxResults);

    return {
      ...response,
      aggregatedData: {
        totalResults: allResults.length,
        returnedResults: limitedResults.length,
        results: limitedResults
      },
      responseTime: Date.now() - startTime
    };
  }

  /**
   * Determine target server for request
   */
  private async determineTargetServer(request: GatewayRequest): Promise<RoutingDecision> {
    // Explicit server specified
    if (request.targetServerId) {
      const server = await this.federationManager.getServerById(request.targetServerId);
      if (!server) {
        throw new Error(`Server not found: ${request.targetServerId}`);
      }

      return {
        serverId: server.id,
        serverUrl: server.apiUrl,
        confidence: 1.0,
        reason: 'Explicitly specified'
      };
    }

    // Route based on resource scope
    if (request.scopeNodeId) {
      return this.federationManager.routeToServer(request.tenantId, request.scopeNodeId);
    }

    // Default: route to global command center
    const servers = await this.federationManager.listServers(request.tenantId, {
      role: 'global_command_center',
      status: 'online'
    });

    if (servers.length === 0) {
      throw new Error('No online global command center available');
    }

    const server = servers[0];
    return {
      serverId: server.id,
      serverUrl: server.apiUrl!,
      confidence: 0.9,
      reason: 'Global command center'
    };
  }

  /**
   * Get target servers based on filters
   */
  private async getTargetServers(
    tenantId: string,
    filters?: {
      regions?: string[];
      serverIds?: string[];
      roles?: string[];
    }
  ): Promise<Array<{ id: string; name: string; api_url: string }>> {
    let query = `
      SELECT 
        id::text,
        name,
        api_url
      FROM federated_servers
      WHERE tenant_id = $1::uuid
        AND status IN ('online', 'degraded')
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.regions && filters.regions.length > 0) {
      query += ` AND region = ANY($${paramIndex++}::text[])`;
      params.push(filters.regions);
    }

    if (filters?.serverIds && filters.serverIds.length > 0) {
      query += ` AND id::text = ANY($${paramIndex++}::text[])`;
      params.push(filters.serverIds);
    }

    if (filters?.roles && filters.roles.length > 0) {
      query += ` AND role = ANY($${paramIndex++}::federation_server_role[])`;
      params.push(filters.roles);
    }

    query += ` ORDER BY health_score DESC`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Execute request to a server
   */
  private async executeRequest(
    routing: RoutingDecision,
    request: GatewayRequest
  ): Promise<GatewayResponse> {
    const url = new URL(request.path, routing.serverUrl);
    
    if (request.query) {
      Object.entries(request.query).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const startTime = Date.now();

    try {
      const response = await fetch(url.toString(), {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          ...request.headers
        },
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: AbortSignal.timeout(this.REQUEST_TIMEOUT_MS)
      });

      const data = response.ok ? await response.json() : null;

      return {
        success: response.ok,
        statusCode: response.status,
        data,
        error: response.ok ? undefined : `HTTP ${response.status}`,
        serverId: routing.serverId,
        serverName: 'remote',
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Request execution failed'
      );
    }
  }

  /**
   * Execute request to specific server
   */
  private async executeServerRequest(
    serverId: string,
    serverUrl: string,
    request: Omit<GatewayRequest, 'tenantId' | 'scopeNodeId'>
  ): Promise<GatewayResponse> {
    return this.executeRequest(
      {
        serverId,
        serverUrl,
        confidence: 1.0,
        reason: 'Broadcast target'
      },
      {
        tenantId: 'broadcast',
        ...request
      }
    );
  }

  /**
   * Circuit breaker: check if circuit is open
   */
  private isCircuitOpen(serverId: string): boolean {
    const breaker = this.circuitBreakers.get(serverId);
    
    if (!breaker || breaker.status === 'closed') {
      return false;
    }

    if (breaker.status === 'open' && breaker.nextRetryTime) {
      if (new Date() >= breaker.nextRetryTime) {
        // Move to half-open state
        breaker.status = 'half_open';
        this.circuitBreakers.set(serverId, breaker);
        return false;
      }
      return true;
    }

    return breaker.status === 'open';
  }

  /**
   * Record successful request
   */
  private recordSuccess(serverId: string): void {
    const breaker = this.circuitBreakers.get(serverId);
    
    if (breaker) {
      // Reset circuit breaker
      breaker.status = 'closed';
      breaker.failureCount = 0;
      breaker.lastFailureTime = undefined;
      breaker.nextRetryTime = undefined;
      this.circuitBreakers.set(serverId, breaker);
    }
  }

  /**
   * Record failed request
   */
  private recordFailure(serverId: string): void {
    let breaker = this.circuitBreakers.get(serverId);
    
    if (!breaker) {
      breaker = {
        serverId,
        status: 'closed',
        failureCount: 0
      };
    }

    breaker.failureCount++;
    breaker.lastFailureTime = new Date();

    if (breaker.failureCount >= this.CIRCUIT_BREAKER_THRESHOLD) {
      breaker.status = 'open';
      breaker.nextRetryTime = new Date(
        Date.now() + this.CIRCUIT_BREAKER_TIMEOUT_MS
      );

      logger.warn('Circuit breaker opened for server', {
        serverId,
        failureCount: breaker.failureCount
      });

      this.emit('circuit_breaker:opened', { serverId });
    }

    this.circuitBreakers.set(serverId, breaker);
  }

  /**
   * Start circuit breaker monitoring
   */
  private startCircuitBreakerMonitoring(): void {
    setInterval(() => {
      const now = new Date();
      
      for (const [serverId, breaker] of this.circuitBreakers.entries()) {
        if (breaker.status === 'open' && breaker.nextRetryTime && now >= breaker.nextRetryTime) {
          breaker.status = 'half_open';
          this.circuitBreakers.set(serverId, breaker);
          
          logger.info('Circuit breaker moved to half-open', { serverId });
        }
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Cache management
   */
  private getCacheKey(serverId: string, path: string, query?: Record<string, string>): string {
    const queryString = query ? JSON.stringify(query) : '';
    return `${serverId}:${path}:${queryString}`;
  }

  private getFromCache(
    serverId: string,
    path: string,
    query?: Record<string, string>
  ): any | null {
    const key = this.getCacheKey(serverId, path, query);
    const cached = this.requestCache.get(key);

    if (cached && cached.expiresAt > new Date()) {
      return cached.data;
    }

    // Remove expired entry
    if (cached) {
      this.requestCache.delete(key);
    }

    return null;
  }

  private setCache(
    serverId: string,
    path: string,
    query: Record<string, string> | undefined,
    data: any
  ): void {
    const key = this.getCacheKey(serverId, path, query);
    this.requestCache.set(key, {
      data,
      expiresAt: new Date(Date.now() + this.CACHE_TTL_MS)
    });

    // Simple cache size management
    if (this.requestCache.size > 1000) {
      const firstKey = this.requestCache.keys().next().value;
      this.requestCache.delete(firstKey);
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): CircuitBreakerState[] {
    return Array.from(this.circuitBreakers.values());
  }
}

// Singleton instance
let federationGatewayInstance: FederationGatewayService | null = null;

export function getFederationGateway(pool: Pool): FederationGatewayService {
  if (!federationGatewayInstance) {
    federationGatewayInstance = new FederationGatewayService(pool);
  }
  return federationGatewayInstance;
}
