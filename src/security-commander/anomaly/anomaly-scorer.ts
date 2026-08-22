/**
 * Anomaly Scorer
 * 
 * Calculates abnormality scores for security events based on multiple factors.
 */

import type { SecurityEvent, AbnormalityScore } from '../types/index.js';

export interface ScoringContext {
  tenantId: string;
  branchId?: string;
  currentTime: Date;
  recentEventCounts?: Map<string, number>;
  historicalBaseline?: {
    mean: number;
    stddev: number;
  };
}

export class AnomalyScorer {
  /**
   * Calculate abnormality score for an event
   */
  calculateScore(event: SecurityEvent, context: ScoringContext): AbnormalityScore {
    const factors = {
      eventSeverity: this.scoreSeverity(event),
      rarity: this.scoreRarity(event, context),
      temporalAnomaly: this.scoreTemporalAnomaly(event, context),
      spatialAnomaly: this.scoreSpatialAnomaly(event, context),
      contextualRisk: this.scoreContextualRisk(event, context),
      correlatedSignals: this.scoreCorrelatedSignals(event, context),
    };

    // Weighted combination
    const score = 
      factors.eventSeverity * 0.25 +
      factors.rarity * 0.15 +
      factors.temporalAnomaly * 0.10 +
      factors.spatialAnomaly * 0.10 +
      factors.contextualRisk * 0.20 +
      factors.correlatedSignals * 0.20;

    const reasons = this.generateReasons(factors, event);

    return {
      eventId: event.id,
      score: Math.min(1.0, Math.max(0.0, score)),
      reasons,
      factors,
    };
  }

  /**
   * Score based on event severity
   */
  private scoreSeverity(event: SecurityEvent): number {
    const severityScores: Record<string, number> = {
      critical: 1.0,
      high: 0.8,
      medium: 0.5,
      low: 0.2,
      info: 0.0,
    };

    return severityScores[event.severity] ?? 0.5;
  }

  /**
   * Score based on event rarity
   */
  private scoreRarity(event: SecurityEvent, context: ScoringContext): number {
    // Certain event types are inherently rare and suspicious
    const rareEventTypes = [
      'camera.tamper',
      'access.door_forced',
      'ai.weapon_detected',
      'ai.fire_detected',
      'ai.smoke_detected',
      'ai.fall_detected',
      'recorder.recording_stopped',
      'storage.full',
      'storage.disk_failed',
      'network.switch_failure',
      'security.privilege_escalation',
      'security.firmware_tamper',
    ];

    if (rareEventTypes.includes(event.type)) {
      return 1.0;
    }

    // Check frequency from recent events
    if (context.recentEventCounts) {
      const count = context.recentEventCounts.get(event.type) ?? 0;
      
      // If very rare (< 5 occurrences in recent window), score high
      if (count < 5) return 0.8;
      if (count < 10) return 0.5;
      if (count < 20) return 0.3;
    }

    return 0.1;
  }

  /**
   * Score based on temporal anomaly (wrong time of day)
   */
  private scoreTemporalAnomaly(event: SecurityEvent, context: ScoringContext): number {
    const hour = event.timestamp.getHours();
    const dayOfWeek = event.timestamp.getDay();

    // After-hours activity (based on event type)
    const afterHoursEvents = [
      'ai.person_detected',
      'ai.vehicle_detected',
      'access.granted',
      'access.denied',
    ];

    if (afterHoursEvents.includes(event.type)) {
      // Weekdays: 6 PM to 6 AM
      // Weekends: all day
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isAfterHours = hour < 6 || hour >= 18;

      if (isWeekend) return 0.7;
      if (isAfterHours) return 0.8;
    }

    // Infrastructure events during business hours might be more concerning
    const infrastructureEvents = [
      'camera.offline',
      'recorder.offline',
      'network.device_unreachable',
    ];

    if (infrastructureEvents.includes(event.type)) {
      const isBusinessHours = hour >= 8 && hour < 18 && !dayOfWeek === (dayOfWeek === 0 || dayOfWeek === 6);
      if (isBusinessHours) return 0.6;
    }

    return 0.1;
  }

  /**
   * Score based on spatial anomaly (unusual location)
   */
  private scoreSpatialAnomaly(event: SecurityEvent, context: ScoringContext): number {
    // High-security zones have higher sensitivity
    const secureZoneKeywords = ['vault', 'server', 'restricted', 'secure', 'armory'];
    
    const zoneName = event.location?.zone?.toLowerCase() ?? '';
    const isSecureZone = secureZoneKeywords.some(keyword => zoneName.includes(keyword));

    if (isSecureZone) {
      // Any activity in secure zones is more suspicious
      const suspiciousInSecureZone = [
        'ai.person_detected',
        'access.denied',
        'access.door_forced',
        'ai.intrusion',
      ];

      if (suspiciousInSecureZone.includes(event.type)) {
        return 0.9;
      }

      return 0.5;
    }

    return 0.1;
  }

  /**
   * Score based on contextual risk
   */
  private scoreContextualRisk(event: SecurityEvent, context: ScoringContext): number {
    let risk = 0.0;

    // Low confidence AI detections are less concerning
    if (event.source.type === 'ai' && event.confidence !== undefined) {
      if (event.confidence < 0.5) {
        risk = 0.2;
      } else if (event.confidence < 0.7) {
        risk = 0.4;
      } else if (event.confidence >= 0.9) {
        risk = 0.9;
      } else {
        risk = 0.6;
      }
    }

    // Access denials escalate with multiple attempts
    if (event.type === 'access.denied') {
      risk = Math.max(risk, 0.6);
    }

    // Critical infrastructure failures
    const criticalInfrastructure = [
      'recorder.recording_stopped',
      'storage.full',
      'network.switch_failure',
    ];

    if (criticalInfrastructure.includes(event.type)) {
      risk = Math.max(risk, 0.9);
    }

    // Safety events are always high risk
    const safetyEvents = [
      'ai.fire_detected',
      'ai.smoke_detected',
      'ai.fall_detected',
      'ai.weapon_detected',
    ];

    if (safetyEvents.includes(event.type)) {
      risk = 1.0;
    }

    return risk;
  }

  /**
   * Score based on correlated signals (placeholder - actual correlation happens in engine)
   */
  private scoreCorrelatedSignals(event: SecurityEvent, context: ScoringContext): number {
    // This is a placeholder - actual correlation is computed by the correlation engine
    // We can check if the event has a correlation ID indicating it's part of a pattern
    
    if (event.correlationId) {
      return 0.8;
    }

    return 0.0;
  }

  /**
   * Generate human-readable reasons for the score
   */
  private generateReasons(
    factors: AbnormalityScore['factors'],
    event: SecurityEvent
  ): string[] {
    const reasons: string[] = [];

    if (factors.eventSeverity >= 0.8) {
      reasons.push('Critical or high severity event');
    }

    if (factors.rarity >= 0.7) {
      reasons.push('Rare event type');
    }

    if (factors.temporalAnomaly >= 0.6) {
      reasons.push('Occurred outside normal hours');
    }

    if (factors.spatialAnomaly >= 0.6) {
      reasons.push('Occurred in high-security zone');
    }

    if (factors.contextualRisk >= 0.8) {
      reasons.push('High contextual risk');
    }

    if (factors.correlatedSignals >= 0.7) {
      reasons.push('Part of correlated event pattern');
    }

    // AI-specific reasons
    if (event.source.type === 'ai' && event.confidence !== undefined) {
      if (event.confidence >= 0.9) {
        reasons.push('High confidence AI detection');
      } else if (event.confidence < 0.6) {
        reasons.push('Low confidence detection');
      }
    }

    return reasons;
  }

  /**
   * Determine if an event is abnormal (score >= threshold)
   */
  isAbnormal(score: number, threshold: number = 0.5): boolean {
    return score >= threshold;
  }
}
