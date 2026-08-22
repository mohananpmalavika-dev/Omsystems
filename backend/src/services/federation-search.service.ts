/**
 * Federation Search Service
 * Cross-server search for vehicles, faces, objects, and incidents
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';
import { getFederationGateway } from './federation-gateway.service.js';

export interface SearchQuery {
  queryType: 'vehicle' | 'face' | 'object' | 'incident' | 'person';
  timeRange: {
    from: Date;
    to: Date;
  };
  filters?: {
    vehiclePlate?: string;
    vehicleColor?: string;
    vehicleType?: string;
    vehicleMake?: string;
    objectClass?: string;
    confidence?: number;
    cameraIds?: string[];
    branchIds?: string[];
    regions?: string[];
  };
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  id: string;
  type: string;
  occurredAt: Date;
  cameraId: string;
  cameraName?: string;
  branchId: string;
  branchName?: string;
  region: string;
  confidence: number;
  metadata: Record<string, any>;
  snapshotUrl?: string;
  videoClipUrl?: string;
  sourceServerId: string;
  sourceServerName: string;
}

export interface AggregatedSearchResults {
  success: boolean;
  totalResults: number;
  results: SearchResult[];
  searchedServers: number;
  successfulServers: number;
  failedServers: number;
  searchTime: number;
  cached: boolean;
}

export interface JourneyReconstruction {
  entityId: string;
  entityType: string;
  totalSightings: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  journeyPath: Array<{
    timestamp: Date;
    location: string;
    branchId: string;
    cameraId: string;
    region: string;
    serverId: string;
    confidence: number;
    metadata?: Record<string, any>;
  }>;
  distanceCovered?: number;
  timeSpan: number;
}

export class FederationSearchService {
  private pool: Pool;
  private gatewayService: ReturnType<typeof getFederationGateway>;
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutes

  constructor(pool: Pool) {
    this.pool = pool;
    this.gatewayService = getFederationGateway(pool);
  }

  /**
   * Search across all federated servers
   */
  async searchAcrossServers(
    tenantId: string,
    query: SearchQuery
  ): Promise<AggregatedSearchResults> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cached = await this.getCachedSearch(tenantId, query);
      if (cached) {
        logger.debug('Returning cached search results', { queryType: query.queryType });
        return {
          ...cached,
          cached: true,
          searchTime: Date.now() - startTime
        };
      }

      // Broadcast search to relevant servers
      const response = await this.gatewayService.broadcastRequest(
        tenantId,
        {
          path: this.getSearchEndpoint(query.queryType),
          method: 'POST',
          body: this.buildSearchPayload(query)
        },
        {
          regions: query.filters?.regions
        }
      );

      // Aggregate and normalize results
      const aggregatedResults = this.aggregateSearchResults(response);

      // Cache results
      await this.cacheSearchResults(tenantId, query, aggregatedResults);

      logger.info('Federation search completed', {
        queryType: query.queryType,
        totalResults: aggregatedResults.totalResults,
        searchedServers: aggregatedResults.searchedServers,
        searchTime: Date.now() - startTime
      });

      return {
        ...aggregatedResults,
        cached: false,
        searchTime: Date.now() - startTime
      };

    } catch (error) {
      logger.error('Federation search failed', {
        queryType: query.queryType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        totalResults: 0,
        results: [],
        searchedServers: 0,
        successfulServers: 0,
        failedServers: 0,
        searchTime: Date.now() - startTime,
        cached: false
      };
    }
  }

  /**
   * Reconstruct entity journey across regions
   */
  async reconstructJourney(
    tenantId: string,
    entityType: 'vehicle' | 'person' | 'face',
    entityId: string,
    timeRange: { from: Date; to: Date }
  ): Promise<JourneyReconstruction | null> {
    try {
      // Search for all sightings of this entity
      const searchQuery: SearchQuery = {
        queryType: entityType,
        timeRange,
        filters: {
          [entityType === 'vehicle' ? 'vehiclePlate' : 'objectClass']: entityId
        },
        limit: 1000
      };

      const searchResults = await this.searchAcrossServers(tenantId, searchQuery);

      if (!searchResults.success || searchResults.results.length === 0) {
        return null;
      }

      // Sort by timestamp
      const sortedSightings = searchResults.results.sort(
        (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()
      );

      // Build journey path
      const journeyPath = sortedSightings.map(result => ({
        timestamp: result.occurredAt,
        location: result.branchName || result.branchId,
        branchId: result.branchId,
        cameraId: result.cameraId,
        region: result.region,
        serverId: result.sourceServerId,
        confidence: result.confidence,
        metadata: result.metadata
      }));

      // Calculate time span
      const firstSeen = sortedSightings[0].occurredAt;
      const lastSeen = sortedSightings[sortedSightings.length - 1].occurredAt;
      const timeSpan = lastSeen.getTime() - firstSeen.getTime();

      logger.info('Journey reconstructed', {
        entityType,
        entityId,
        totalSightings: sortedSightings.length,
        timeSpan: `${Math.floor(timeSpan / 60000)} minutes`
      });

      return {
        entityId,
        entityType,
        totalSightings: sortedSightings.length,
        firstSeenAt: firstSeen,
        lastSeenAt: lastSeen,
        journeyPath,
        timeSpan: Math.floor(timeSpan / 1000) // seconds
      };

    } catch (error) {
      logger.error('Journey reconstruction failed', {
        entityType,
        entityId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return null;
    }
  }

  /**
   * Search for coordinated activities across regions
   */
  async searchCoordinatedActivities(
    tenantId: string,
    activityType: string,
    timeWindow: number, // minutes
    minOccurrences: number = 3
  ): Promise<any[]> {
    try {
      // Get all recent activities from all servers
      const timeRange = {
        from: new Date(Date.now() - timeWindow * 60 * 1000),
        to: new Date()
      };

      const searchQuery: SearchQuery = {
        queryType: 'incident',
        timeRange,
        filters: {},
        limit: 1000
      };

      const searchResults = await this.searchAcrossServers(tenantId, searchQuery);

      if (!searchResults.success) {
        return [];
      }

      // Group by entity/pattern
      const grouped = this.groupByPattern(searchResults.results, activityType);

      // Filter patterns that meet threshold
      const coordinatedActivities = grouped.filter(
        pattern => pattern.occurrences >= minOccurrences
      );

      logger.info('Coordinated activities detected', {
        activityType,
        patterns: coordinatedActivities.length
      });

      return coordinatedActivities;

    } catch (error) {
      logger.error('Coordinated activity search failed', {
        activityType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return [];
    }
  }

  /**
   * Get search endpoint based on query type
   */
  private getSearchEndpoint(queryType: string): string {
    const endpoints: Record<string, string> = {
      vehicle: '/v1/analytics/vehicle-search',
      face: '/v1/analytics/face-search',
      object: '/v1/analytics/object-search',
      incident: '/v1/incidents/search',
      person: '/v1/analytics/person-search'
    };

    return endpoints[queryType] || '/v1/search';
  }

  /**
   * Build search payload
   */
  private buildSearchPayload(query: SearchQuery): any {
    return {
      timeRange: {
        from: query.timeRange.from.toISOString(),
        to: query.timeRange.to.toISOString()
      },
      filters: query.filters || {},
      limit: query.limit || 100,
      offset: query.offset || 0
    };
  }

  /**
   * Aggregate search results from multiple servers
   */
  private aggregateSearchResults(gatewayResponse: any): Omit<AggregatedSearchResults, 'cached' | 'searchTime'> {
    const allResults: SearchResult[] = [];

    gatewayResponse.results.forEach((serverResponse: any) => {
      if (serverResponse.success && serverResponse.data?.results) {
        const normalizedResults = serverResponse.data.results.map((item: any) => ({
          id: item.id || item.eventId,
          type: item.type || item.detectionType,
          occurredAt: new Date(item.occurredAt || item.timestamp),
          cameraId: item.cameraId,
          cameraName: item.cameraName,
          branchId: item.branchId,
          branchName: item.branchName,
          region: item.region,
          confidence: item.confidence || 1.0,
          metadata: item.metadata || item.data || {},
          snapshotUrl: item.snapshotUrl || item.snapshotReference,
          videoClipUrl: item.videoClipUrl || item.clipReference,
          sourceServerId: serverResponse.serverId,
          sourceServerName: serverResponse.serverName
        }));

        allResults.push(...normalizedResults);
      }
    });

    // Sort by timestamp descending (most recent first)
    allResults.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    return {
      success: gatewayResponse.success,
      totalResults: allResults.length,
      results: allResults,
      searchedServers: gatewayResponse.totalServers,
      successfulServers: gatewayResponse.successfulServers,
      failedServers: gatewayResponse.failedServers
    };
  }

  /**
   * Get cached search results
   */
  private async getCachedSearch(
    tenantId: string,
    query: SearchQuery
  ): Promise<Omit<AggregatedSearchResults, 'cached' | 'searchTime'> | null> {
    const queryHash = this.hashQuery(query);

    const result = await this.pool.query(
      `SELECT 
        result_count as "resultCount",
        results,
        cached_at as "cachedAt"
       FROM cross_server_search_cache
       WHERE tenant_id = $1::uuid
         AND query_hash = $2
         AND expires_at > now()
       ORDER BY cached_at DESC
       LIMIT 1`,
      [tenantId, queryHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const cached = result.rows[0];

    // Update hit count
    await this.pool.query(
      `UPDATE cross_server_search_cache
       SET hit_count = hit_count + 1,
           last_accessed_at = now()
       WHERE tenant_id = $1::uuid
         AND query_hash = $2`,
      [tenantId, queryHash]
    );

    return {
      success: true,
      totalResults: cached.resultCount,
      results: cached.results || [],
      searchedServers: 0,
      successfulServers: 0,
      failedServers: 0
    };
  }

  /**
   * Cache search results
   */
  private async cacheSearchResults(
    tenantId: string,
    query: SearchQuery,
    results: Omit<AggregatedSearchResults, 'cached' | 'searchTime'>
  ): Promise<void> {
    const queryHash = this.hashQuery(query);
    const expiresAt = new Date(Date.now() + this.CACHE_TTL_SECONDS * 1000);

    // For each server, cache its results separately
    const serverGroups = new Map<string, SearchResult[]>();
    
    results.results.forEach(result => {
      if (!serverGroups.has(result.sourceServerId)) {
        serverGroups.set(result.sourceServerId, []);
      }
      serverGroups.get(result.sourceServerId)!.push(result);
    });

    for (const [serverId, serverResults] of serverGroups.entries()) {
      await this.pool.query(
        `INSERT INTO cross_server_search_cache (
          tenant_id, query_hash, query_type, query_params,
          server_id, result_count, results, expires_at
        ) VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, $7, $8)
        ON CONFLICT (query_hash, server_id)
        DO UPDATE SET
          result_count = EXCLUDED.result_count,
          results = EXCLUDED.results,
          cached_at = now(),
          expires_at = EXCLUDED.expires_at,
          hit_count = 0`,
        [
          tenantId,
          queryHash,
          query.queryType,
          JSON.stringify(query),
          serverId,
          serverResults.length,
          JSON.stringify(serverResults),
          expiresAt
        ]
      );
    }
  }

  /**
   * Hash query for caching
   */
  private hashQuery(query: SearchQuery): string {
    const normalized = {
      type: query.queryType,
      from: query.timeRange.from.toISOString(),
      to: query.timeRange.to.toISOString(),
      filters: query.filters || {}
    };

    return createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }

  /**
   * Group results by pattern
   */
  private groupByPattern(results: SearchResult[], activityType: string): any[] {
    const patterns = new Map<string, any>();

    results.forEach(result => {
      // Extract pattern key based on activity type
      const patternKey = this.extractPatternKey(result, activityType);

      if (!patterns.has(patternKey)) {
        patterns.set(patternKey, {
          patternKey,
          activityType,
          occurrences: 0,
          locations: new Set(),
          regions: new Set(),
          events: []
        });
      }

      const pattern = patterns.get(patternKey)!;
      pattern.occurrences++;
      pattern.locations.add(result.branchId);
      pattern.regions.add(result.region);
      pattern.events.push(result);
    });

    return Array.from(patterns.values()).map(p => ({
      ...p,
      locations: Array.from(p.locations),
      regions: Array.from(p.regions)
    }));
  }

  /**
   * Extract pattern key from result
   */
  private extractPatternKey(result: SearchResult, activityType: string): string {
    // Customize based on activity type
    if (activityType === 'vehicle') {
      return result.metadata.vehiclePlate || result.metadata.vehicleId || result.id;
    }

    if (activityType === 'person') {
      return result.metadata.personId || result.metadata.trackId || result.id;
    }

    return result.type;
  }

  /**
   * Clean expired cache entries
   */
  async cleanExpiredCache(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM cross_server_search_cache
       WHERE expires_at < now()
       RETURNING id`
    );

    return result.rowCount || 0;
  }
}

// Singleton instance
let federationSearchService: FederationSearchService | null = null;

export function getFederationSearchService(pool: Pool): FederationSearchService {
  if (!federationSearchService) {
    federationSearchService = new FederationSearchService(pool);
  }
  return federationSearchService;
}
