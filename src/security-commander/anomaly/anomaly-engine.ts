/**
 * Anomaly Detection Engine
 * 
 * Main engine for detecting abnormal security events.
 */

import type { Pool } from 'pg';
import { AnomalyScorer, type ScoringContext } from './anomaly-scorer.js';
import { BaselineService } from './baseline.service.js';
import { SecurityEventRepository } from '../repositories/security-event.repository.js';
import type { SecurityEvent, AbnormalityScore } from '../types/index.js';

export interface AnomalyDetectionResult {
  event: SecurityEvent;
  abnormalityScore: AbnormalityScore;
  isAbnormal: boolean;
  baselineAnomaly?: {
    isAnomaly: boolean;
    zScore: number;
    expected: number;
    actual: number;
  };
}

export class AnomalyDetectionEngine {
  private readonly scorer: AnomalyScorer;
  private readonly baselineService: BaselineService;
  private readonly eventRepository: SecurityEventRepository;

  constructor(pool: Pool) {
    this.scorer = new AnomalyScorer();
    this.baselineService = new BaselineService(pool);
    this.eventRepository = new SecurityEventRepository(pool);
  }

  /**
   * Analyze a single event for anomalies
   */
  async analyzeEvent(
    event: SecurityEvent,
    options: {
      useBaseline?: boolean;
      threshold?: number;
    } = {}
  ): Promise<AnomalyDetectionResult> {
    const threshold = options.threshold ?? 0.5;
    const useBaseline = options.useBaseline ?? true;

    // Build scoring context
    const context = await this.buildScoringContext(event);

    // Calculate abnormality score
    const abnormalityScore = this.scorer.calculateScore(event, context);

    // Check statistical baseline if available
    let baselineAnomaly;
    if (useBaseline) {
      try {
        baselineAnomaly = await this.checkBaselineAnomaly(event);
        
        // Boost score if baseline indicates anomaly
        if (baselineAnomaly.isAnomaly) {
          abnormalityScore.score = Math.min(
            1.0,
            abnormalityScore.score + 0.2
          );
          abnormalityScore.reasons.push('Statistical anomaly detected');
        }
      } catch (error) {
        // Baseline check failed, continue without it
        console.warn('Baseline check failed:', error);
      }
    }

    // Store score in database
    await this.eventRepository.updateAbnormalityScore(event.id, abnormalityScore.score);

    return {
      event,
      abnormalityScore,
      isAbnormal: this.scorer.isAbnormal(abnormalityScore.score, threshold),
      baselineAnomaly,
    };
  }

  /**
   * Analyze multiple events in bulk
   */
  async analyzeEventsBulk(
    events: SecurityEvent[],
    options: {
      useBaseline?: boolean;
      threshold?: number;
    } = {}
  ): Promise<AnomalyDetectionResult[]> {
    const results: AnomalyDetectionResult[] = [];

    for (const event of events) {
      const result = await this.analyzeEvent(event, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Get abnormal events in a time range
   */
  async getAbnormalEvents(
    tenantId: string,
    from: Date,
    to: Date,
    options: {
      branchId?: string;
      minScore?: number;
      limit?: number;
    } = {}
  ): Promise<SecurityEvent[]> {
    const minScore = options.minScore ?? 0.5;

    return this.eventRepository.searchEvents({
      tenantId,
      branchId: options.branchId,
      from,
      to,
      abnormalOnly: true,
      minAbnormalityScore: minScore,
      limit: options.limit ?? 1000,
    });
  }

  /**
   * Calculate baselines for historical data
   */
  async calculateBaselines(
    tenantId: string,
    branchId: string,
    from: Date,
    to: Date
  ): Promise<void> {
    await this.baselineService.calculateBaselinesForBranch(
      tenantId,
      branchId,
      from,
      to
    );
  }

  /**
   * Build scoring context from event
   */
  private async buildScoringContext(event: SecurityEvent): Promise<ScoringContext> {
    // Get recent event counts for rarity scoring
    const recentWindow = new Date(event.timestamp.getTime() - 60 * 60 * 1000); // Last hour
    
    const recentEvents = await this.eventRepository.searchEvents({
      tenantId: event.tenantId,
      branchId: event.branchId,
      from: recentWindow,
      to: event.timestamp,
      limit: 10000,
    });

    // Count events by type
    const recentEventCounts = new Map<string, number>();
    for (const e of recentEvents) {
      const count = recentEventCounts.get(e.type) ?? 0;
      recentEventCounts.set(e.type, count + 1);
    }

    return {
      tenantId: event.tenantId,
      branchId: event.branchId,
      currentTime: new Date(),
      recentEventCounts,
    };
  }

  /**
   * Check if event is a baseline anomaly
   */
  private async checkBaselineAnomaly(event: SecurityEvent): Promise<{
    isAnomaly: boolean;
    zScore: number;
    expected: number;
    actual: number;
  }> {
    // Count events of this type in the current hour
    const hourStart = new Date(event.timestamp);
    hourStart.setMinutes(0, 0, 0);
    
    const hourEnd = new Date(hourStart);
    hourEnd.setHours(hourEnd.getHours() + 1);

    const eventsInHour = await this.eventRepository.searchEvents({
      tenantId: event.tenantId,
      from: hourStart,
      to: hourEnd,
      types: [event.type],
      limit: 10000,
    });

    const currentCount = eventsInHour.length;

    // Check against baseline
    const anomalyCheck = await this.baselineService.checkAnomaly(
      event.tenantId,
      event.source.id,
      event.type,
      currentCount,
      event.timestamp,
      3.0 // 3 standard deviations
    );

    return anomalyCheck;
  }

  /**
   * Get anomaly statistics for a time period
   */
  async getAnomalyStats(
    tenantId: string,
    from: Date,
    to: Date,
    branchId?: string
  ): Promise<{
    totalEvents: number;
    abnormalEvents: number;
    abnormalPercentage: number;
    topAbnormalTypes: Array<{ type: string; count: number; avgScore: number }>;
  }> {
    const stats = await this.eventRepository.getEventStats({
      tenantId,
      branchId,
      from,
      to,
    });

    const abnormalEvents = stats.abnormalCount;
    const totalEvents = stats.total;
    const abnormalPercentage = totalEvents > 0
      ? (abnormalEvents / totalEvents) * 100
      : 0;

    // Get top abnormal event types (would need additional query)
    const topAbnormalTypes: Array<{ type: string; count: number; avgScore: number }> = [];

    return {
      totalEvents,
      abnormalEvents,
      abnormalPercentage,
      topAbnormalTypes,
    };
  }

  /**
   * Manually mark event as abnormal/normal
   */
  async overrideAbnormalityScore(
    eventId: string,
    score: number
  ): Promise<void> {
    await this.eventRepository.updateAbnormalityScore(eventId, score);
  }
}
