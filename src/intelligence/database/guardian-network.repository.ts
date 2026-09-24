/**
 * Guardian Network Database Repository
 * 
 * Production-grade database operations with connection pooling,
 * transactions, prepared statements, and error handling.
 */

import type { Pool, PoolClient } from 'pg';
import type {
  ThreatPattern,
  ThreatIntelligenceUpdate,
  BenchmarkMetrics,
  NetworkStatistics,
  IndustryIntelligenceReport,
  RealtimeThreatAlert,
  ThreatDatabaseQuery,
  IndustryVertical,
} from '../guardian-network.types';

export class GuardianNetworkRepository {
  constructor(private pool: Pool) {}

  /**
   * Store a new threat pattern
   */
  async createPattern(pattern: ThreatPattern): Promise<void> {
    const query = `
      INSERT INTO guardian_network.threat_patterns (
        id, category, severity, confidence,
        occurred_at, time_of_day, day_of_week,
        industry_vertical, location_category, geographic_region, urban_density,
        behavioral_signature, detection_methods, ai_capabilities,
        outcome, response_time,
        contributing_deployment_id, shared_at, verification_status,
        match_count, related_pattern_ids
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14,
        $15, $16,
        $17, $18, $19,
        $20, $21
      )
      ON CONFLICT (id) DO UPDATE SET
        verification_status = EXCLUDED.verification_status,
        match_count = EXCLUDED.match_count,
        updated_at = NOW()
    `;

    const values = [
      pattern.id,
      pattern.category,
      pattern.severity,
      pattern.confidence,
      pattern.occurredAt,
      pattern.timeOfDay,
      pattern.dayOfWeek,
      pattern.industryVertical,
      pattern.locationCategory,
      pattern.geographicRegion,
      pattern.urbanDensity,
      JSON.stringify(pattern.behavioralSignature),
      pattern.detectionMethods,
      pattern.aiCapabilitiesInvolved,
      pattern.outcome,
      pattern.responseTime,
      pattern.contributingDeploymentId,
      pattern.sharedAt,
      pattern.verificationStatus,
      pattern.matchCount,
      pattern.relatedPatternIds || [],
    ];

    await this.pool.query(query, values);
  }

  /**
   * Query threat patterns with filtering
   */
  async queryPatterns(queryParams: ThreatDatabaseQuery): Promise<ThreatPattern[]> {
    const conditions: string[] = ['TRUE']; // Base condition
    const values: any[] = [];
    let paramIndex = 1;

    // Build WHERE conditions
    if (queryParams.categories && queryParams.categories.length > 0) {
      conditions.push(`category = ANY($${paramIndex})`);
      values.push(queryParams.categories);
      paramIndex++;
    }

    if (queryParams.industries && queryParams.industries.length > 0) {
      conditions.push(`industry_vertical = ANY($${paramIndex})`);
      values.push(queryParams.industries);
      paramIndex++;
    }

    if (queryParams.severities && queryParams.severities.length > 0) {
      conditions.push(`severity = ANY($${paramIndex})`);
      values.push(queryParams.severities);
      paramIndex++;
    }

    if (queryParams.from) {
      conditions.push(`occurred_at >= $${paramIndex}`);
      values.push(queryParams.from);
      paramIndex++;
    }

    if (queryParams.to) {
      conditions.push(`occurred_at <= $${paramIndex}`);
      values.push(queryParams.to);
      paramIndex++;
    }

    // Build ORDER BY clause
    let orderBy = 'occurred_at DESC';
    switch (queryParams.sortBy) {
      case 'frequency':
        orderBy = 'match_count DESC';
        break;
      case 'severity':
        orderBy = `
          CASE severity
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END, occurred_at DESC
        `;
        break;
      case 'recency':
        orderBy = 'occurred_at DESC';
        break;
    }

    // Build query
    const query = `
      SELECT 
        id, category, severity, confidence,
        occurred_at, time_of_day, day_of_week,
        industry_vertical, location_category, geographic_region, urban_density,
        behavioral_signature, detection_methods, ai_capabilities,
        outcome, response_time,
        contributing_deployment_id, shared_at, verification_status,
        match_count, last_matched_at, related_pattern_ids,
        created_at, updated_at
      FROM guardian_network.threat_patterns
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;

    values.push(queryParams.limit || 100);
    values.push(queryParams.offset || 0);

    const result = await this.pool.query(query, values);

    return result.rows.map(row => this.mapRowToPattern(row));
  }

  /**
   * Find similar patterns using vector similarity
   */
  async findSimilarPatterns(
    pattern: Partial<ThreatPattern>,
    minSimilarity: number = 0.6,
    limit: number = 10
  ): Promise<Array<{ pattern: ThreatPattern; similarity: number }>> {
    // Stage 1: Fast filter using indexes
    const fastFilterQuery = `
      SELECT 
        id, category, severity, confidence,
        occurred_at, time_of_day, day_of_week,
        industry_vertical, location_category, geographic_region, urban_density,
        behavioral_signature, detection_methods, ai_capabilities,
        outcome, response_time,
        contributing_deployment_id, shared_at, verification_status,
        match_count, last_matched_at, related_pattern_ids
      FROM guardian_network.threat_patterns
      WHERE category = $1
        AND industry_vertical = $2
        AND occurred_at >= NOW() - INTERVAL '90 days'
      ORDER BY match_count DESC
      LIMIT 500
    `;

    const fastResult = await this.pool.query(fastFilterQuery, [
      pattern.category,
      pattern.industryVertical,
    ]);

    // Stage 2: Calculate similarity in application (more flexible than SQL)
    const candidates = fastResult.rows.map(row => this.mapRowToPattern(row));
    const results: Array<{ pattern: ThreatPattern; similarity: number }> = [];

    for (const candidate of candidates) {
      const similarity = this.calculateSimilarity(pattern, candidate);
      if (similarity >= minSimilarity) {
        results.push({ pattern: candidate, similarity });
      }
    }

    // Sort by similarity and return top N
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Record a pattern match
   */
  async recordPatternMatch(
    deploymentId: string,
    patternId: string,
    localIncidentId: string,
    similarityScore: number,
    matchedAttributes: string[],
    confidence: string,
    prevented: boolean = false
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Insert match record
      const insertQuery = `
        INSERT INTO guardian_network.pattern_matches (
          deployment_id, pattern_id, local_incident_id,
          similarity_score, matched_attributes, confidence,
          prevented, matched_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (deployment_id, local_incident_id, pattern_id) 
        DO NOTHING
      `;

      await client.query(insertQuery, [
        deploymentId,
        patternId,
        localIncidentId,
        similarityScore,
        matchedAttributes,
        confidence,
        prevented,
      ]);

      // Update pattern match count (handled by trigger, but we can force it)
      const updateQuery = `
        UPDATE guardian_network.threat_patterns
        SET 
          match_count = match_count + 1,
          last_matched_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `;

      await client.query(updateQuery, [patternId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get deployment statistics
   */
  async getDeploymentStatistics(deploymentId: string): Promise<NetworkStatistics> {
    const query = `
      WITH deployment_info AS (
        SELECT 
          patterns_contributed,
          patterns_received,
          usefulness_score,
          last_synced_at
        FROM guardian_network.deployments
        WHERE id = $1
      ),
      match_info AS (
        SELECT 
          COUNT(*) as local_match_count,
          SUM(CASE WHEN prevented THEN 1 ELSE 0 END) as prevented_count
        FROM guardian_network.pattern_matches
        WHERE deployment_id = $1
          AND matched_at >= NOW() - INTERVAL '30 days'
      ),
      network_info AS (
        SELECT 
          COUNT(DISTINCT id) as total_deployments,
          COUNT(DISTINCT id) FILTER (WHERE status = 'active') as active_deployments,
          (SELECT COUNT(*) FROM guardian_network.threat_patterns) as total_patterns,
          (SELECT COUNT(*) FROM guardian_network.threat_patterns 
           WHERE created_at >= NOW() - INTERVAL '30 days') as recent_patterns,
          (SELECT COUNT(DISTINCT industry_vertical) FROM guardian_network.deployments) as total_industries,
          (SELECT SUM(match_count) FROM guardian_network.threat_patterns) as global_incident_count
        FROM guardian_network.deployments
      ),
      sync_info AS (
        SELECT 
          last_sync_at,
          sync_status,
          pending_uploads,
          pending_downloads
        FROM guardian_network.sync_status
        WHERE deployment_id = $1
      )
      SELECT 
        di.patterns_contributed,
        di.patterns_received,
        di.usefulness_score,
        di.last_synced_at as contribution_last_shared,
        mi.local_match_count,
        mi.prevented_count,
        ni.total_deployments,
        ni.active_deployments,
        ni.total_patterns,
        ni.recent_patterns,
        ni.total_industries,
        ni.global_incident_count,
        si.last_sync_at,
        si.sync_status,
        si.pending_uploads,
        si.pending_downloads
      FROM deployment_info di
      CROSS JOIN match_info mi
      CROSS JOIN network_info ni
      LEFT JOIN sync_info si ON TRUE
    `;

    const result = await this.pool.query(query, [deploymentId]);
    const row = result.rows[0];

    if (!row) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    return {
      contribution: {
        patternsShared: row.patterns_contributed || 0,
        lastSharedAt: row.contribution_last_shared,
        verifiedPatterns: row.patterns_contributed || 0, // Assume all are verified
        usefulnessScore: row.usefulness_score || 0,
      },
      benefit: {
        patternsReceived: row.patterns_received || 0,
        lastReceivedAt: row.last_sync_at,
        localMatchCount: parseInt(row.local_match_count) || 0,
        preventedIncidents: parseInt(row.prevented_count) || 0,
        improvedResponseTime: 0, // Would need historical data
      },
      network: {
        totalDeployments: parseInt(row.total_deployments) || 0,
        activeDeployments: parseInt(row.active_deployments) || 0,
        totalPatterns: parseInt(row.total_patterns) || 0,
        recentPatterns: parseInt(row.recent_patterns) || 0,
        totalIndustries: parseInt(row.total_industries) || 0,
        globalIncidentCount: parseInt(row.global_incident_count) || 0,
      },
      sync: {
        lastSyncAt: row.last_sync_at || new Date(),
        syncStatus: row.sync_status || 'offline',
        pendingUploads: row.pending_uploads || 0,
        pendingDownloads: row.pending_downloads || 0,
      },
    };
  }

  /**
   * Update sync status
   */
  async updateSyncStatus(
    deploymentId: string,
    status: 'healthy' | 'degraded' | 'offline',
    pendingUploads: number = 0,
    pendingDownloads: number = 0
  ): Promise<void> {
    const query = `
      INSERT INTO guardian_network.sync_status (
        deployment_id, last_sync_at, sync_status, 
        pending_uploads, pending_downloads, updated_at
      ) VALUES ($1, NOW(), $2, $3, $4, NOW())
      ON CONFLICT (deployment_id) DO UPDATE SET
        last_sync_at = NOW(),
        sync_status = EXCLUDED.sync_status,
        pending_uploads = EXCLUDED.pending_uploads,
        pending_downloads = EXCLUDED.pending_downloads,
        updated_at = NOW()
    `;

    await this.pool.query(query, [deploymentId, status, pendingUploads, pendingDownloads]);
  }

  /**
   * Register or update deployment
   */
  async upsertDeployment(
    deploymentId: string,
    industryVertical: IndustryVertical,
    geographicRegion?: string,
    urbanDensity?: 'urban' | 'suburban' | 'rural'
  ): Promise<void> {
    const query = `
      INSERT INTO guardian_network.deployments (
        id, industry_vertical, geographic_region, urban_density,
        first_connected_at, last_synced_at, status
      ) VALUES ($1, $2, $3, $4, NOW(), NOW(), 'active')
      ON CONFLICT (id) DO UPDATE SET
        last_synced_at = NOW(),
        status = 'active',
        updated_at = NOW()
    `;

    await this.pool.query(query, [
      deploymentId,
      industryVertical,
      geographicRegion,
      urbanDensity,
    ]);
  }

  /**
   * Store benchmark metrics
   */
  async storeBenchmarkMetrics(metrics: BenchmarkMetrics): Promise<void> {
    const query = `
      INSERT INTO guardian_network.benchmark_metrics (
        deployment_id, period_start, period_end,
        incident_count, prevention_rate, detection_rate,
        avg_response_time, false_positive_rate,
        by_category,
        overall_percentile, prevention_percentile, detection_percentile,
        response_time_percentile, ai_effectiveness_percentile
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (deployment_id, period_start, period_end) DO UPDATE SET
        incident_count = EXCLUDED.incident_count,
        prevention_rate = EXCLUDED.prevention_rate,
        detection_rate = EXCLUDED.detection_rate,
        avg_response_time = EXCLUDED.avg_response_time,
        false_positive_rate = EXCLUDED.false_positive_rate,
        by_category = EXCLUDED.by_category,
        overall_percentile = EXCLUDED.overall_percentile,
        prevention_percentile = EXCLUDED.prevention_percentile,
        detection_percentile = EXCLUDED.detection_percentile,
        response_time_percentile = EXCLUDED.response_time_percentile,
        ai_effectiveness_percentile = EXCLUDED.ai_effectiveness_percentile,
        created_at = NOW()
    `;

    await this.pool.query(query, [
      metrics.deploymentId,
      metrics.benchmarkPeriod.startDate,
      metrics.benchmarkPeriod.endDate,
      metrics.your.incidentCount,
      metrics.your.preventionRate,
      metrics.your.detectionRate,
      metrics.your.averageResponseTime,
      metrics.your.falsePositiveRate,
      JSON.stringify(metrics.your.byCategory),
      metrics.rankings.overall,
      metrics.rankings.prevention,
      metrics.rankings.detection,
      metrics.rankings.responseTime,
      metrics.rankings.aiEffectiveness,
    ]);
  }

  /**
   * Get recent threat alerts
   */
  async getRecentAlerts(
    industries: IndustryVertical[],
    limit: number = 10
  ): Promise<RealtimeThreatAlert[]> {
    const query = `
      SELECT 
        id, alert_level, title, description,
        threat_data, scope, indicators, actions,
        detection_guidance, issued_at, expires_at,
        acknowledgment_required, acknowledgment_count
      FROM guardian_network.threat_alerts
      WHERE industries && $1
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY issued_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [industries, limit]);

    return result.rows.map(row => ({
      id: row.id,
      alertLevel: row.alert_level,
      title: row.title,
      description: row.description,
      threat: row.threat_data,
      scope: JSON.parse(row.scope || '{}'),
      indicators: JSON.parse(row.indicators || '{}'),
      actions: JSON.parse(row.actions || '{}'),
      detectionGuidance: JSON.parse(row.detection_guidance || '{}'),
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      acknowledgmentRequired: row.acknowledgment_required,
      acknowledgedBy: [], // Would need join to acknowledgments table
    }));
  }

  /**
   * Acknowledge threat alert
   */
  async acknowledgeThreatAlert(alertId: string, deploymentId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Insert acknowledgment
      const insertQuery = `
        INSERT INTO guardian_network.threat_alert_acknowledgments (
          alert_id, deployment_id, acknowledged_at
        ) VALUES ($1, $2, NOW())
        ON CONFLICT (alert_id, deployment_id) DO NOTHING
      `;

      await client.query(insertQuery, [alertId, deploymentId]);

      // Update alert acknowledgment count (handled by trigger)
      const updateQuery = `
        UPDATE guardian_network.threat_alerts
        SET acknowledgment_count = acknowledgment_count + 1
        WHERE id = $1
      `;

      await client.query(updateQuery, [alertId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Audit log entry
   */
  async logAuditEvent(
    deploymentId: string,
    eventType: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const query = `
      INSERT INTO guardian_network.audit_log (
        deployment_id, event_type, entity_type, entity_id, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `;

    await this.pool.query(query, [
      deploymentId,
      eventType,
      entityType,
      entityId,
      metadata ? JSON.stringify(metadata) : null,
    ]);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private mapRowToPattern(row: any): ThreatPattern {
    return {
      id: row.id,
      category: row.category,
      severity: row.severity,
      confidence: row.confidence,
      occurredAt: row.occurred_at,
      timeOfDay: row.time_of_day,
      dayOfWeek: row.day_of_week,
      industryVertical: row.industry_vertical,
      locationCategory: row.location_category,
      geographicRegion: row.geographic_region,
      urbanDensity: row.urban_density,
      behavioralSignature: typeof row.behavioral_signature === 'string'
        ? JSON.parse(row.behavioral_signature)
        : row.behavioral_signature,
      detectionMethods: row.detection_methods,
      aiCapabilitiesInvolved: row.ai_capabilities,
      outcome: row.outcome,
      responseTime: row.response_time,
      contributingDeploymentId: row.contributing_deployment_id,
      sharedAt: row.shared_at,
      verificationStatus: row.verification_status,
      matchCount: row.match_count,
      lastMatchedAt: row.last_matched_at,
      relatedPatternIds: row.related_pattern_ids,
    };
  }

  private calculateSimilarity(pattern1: Partial<ThreatPattern>, pattern2: ThreatPattern): number {
    let score = 0;
    let weights = 0;

    // Category match (weight: 0.3)
    if (pattern1.category === pattern2.category) {
      score += 0.3;
    }
    weights += 0.3;

    // Time of day match (weight: 0.1)
    if (pattern1.timeOfDay === pattern2.timeOfDay) {
      score += 0.1;
    }
    weights += 0.1;

    // Location category match (weight: 0.15)
    if (pattern1.locationCategory === pattern2.locationCategory) {
      score += 0.15;
    }
    weights += 0.15;

    // Behavioral signature similarity (weight: 0.35)
    if (pattern1.behavioralSignature && pattern2.behavioralSignature) {
      const behavioralSim = this.compareBehavioralSignatures(
        pattern1.behavioralSignature,
        pattern2.behavioralSignature
      );
      score += behavioralSim * 0.35;
    }
    weights += 0.35;

    // Detection methods overlap (weight: 0.1)
    if (pattern1.detectionMethods && pattern2.detectionMethods) {
      const methodsOverlap = this.calculateArrayOverlap(
        pattern1.detectionMethods,
        pattern2.detectionMethods
      );
      score += methodsOverlap * 0.1;
    }
    weights += 0.1;

    return weights > 0 ? score / weights : 0;
  }

  private compareBehavioralSignatures(sig1: any, sig2: any): number {
    let matches = 0;
    let total = 0;

    const fields = ['approachPattern', 'targetType', 'entryMethod', 'vehicleInvolved', 'coordinatedAttack'];

    for (const field of fields) {
      if (sig1[field] !== undefined && sig2[field] !== undefined) {
        total++;
        if (sig1[field] === sig2[field]) {
          matches++;
        }
      }
    }

    return total > 0 ? matches / total : 0;
  }

  private calculateArrayOverlap(arr1: string[], arr2: string[]): number {
    if (arr1.length === 0 || arr2.length === 0) return 0;

    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));

    return intersection.size / Math.max(set1.size, set2.size);
  }
}
