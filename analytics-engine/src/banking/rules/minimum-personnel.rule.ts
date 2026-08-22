/**
 * Minimum Personnel Rule
 * 
 * Verifies that minimum required personnel are present
 */

import { BaseRule, RuleContext, RuleResult } from './rule-engine.js';

export class MinimumPersonnelRule extends BaseRule {
  constructor() {
    super(
      'minimum_personnel',
      'Minimum Personnel Count',
      'Minimum number of personnel must be present for cash transfer',
      'high'
    );
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const { session, monitor } = context;

    // Check if person tracking is available
    if (!session.evidenceAvailability.personTracking) {
      return this.unknown(
        'Person tracking not available',
        { reason: 'person_tracking_unavailable' }
      );
    }

    // Filter for stable personnel (associated with vehicle)
    const stablePersonnel = session.personnel.filter(person => {
      // Must be associated with vehicle
      if (!person.associatedWithVehicle) {
        return false;
      }

      // Must have been tracked for minimum duration
      const trackAgeMs = session.lastUpdatedAt.getTime() - person.firstSeenAt.getTime();
      return trackAgeMs >= monitor.personnelRules.minimumTrackAgeMs;
    });

    const observedCount = stablePersonnel.length;
    const requiredCount = monitor.personnelRules.minimumPersonnel;

    // Check minimum
    if (observedCount < requiredCount) {
      return this.fail(
        `Insufficient personnel: ${observedCount} observed, ${requiredCount} required`,
        {
          observed: observedCount,
          required: requiredCount,
          personnelTrackIds: stablePersonnel.map(p => p.trackId),
        },
        stablePersonnel.map(p => ({
          type: 'track' as const,
          id: p.trackId,
          confidence: p.confidence,
          timestamp: p.firstSeenAt,
        }))
      );
    }

    // Check maximum if configured
    if (monitor.personnelRules.maximumPersonnel) {
      const maxCount = monitor.personnelRules.maximumPersonnel;
      if (observedCount > maxCount) {
        return this.fail(
          `Excessive personnel: ${observedCount} observed, maximum ${maxCount}`,
          {
            observed: observedCount,
            maximum: maxCount,
            excess: observedCount - maxCount,
            personnelTrackIds: stablePersonnel.map(p => p.trackId),
          },
          stablePersonnel.map(p => ({
            type: 'track' as const,
            id: p.trackId,
            confidence: p.confidence,
            timestamp: p.firstSeenAt,
          })),
          0.9 // Slightly lower confidence for max violations
        );
      }
    }

    // Personnel count is acceptable
    return this.pass(
      `Personnel count acceptable: ${observedCount} present`,
      {
        observed: observedCount,
        required: requiredCount,
        maximum: monitor.personnelRules.maximumPersonnel,
        personnelTrackIds: stablePersonnel.map(p => p.trackId),
      },
      stablePersonnel.map(p => ({
        type: 'track' as const,
        id: p.trackId,
        confidence: p.confidence,
        timestamp: p.firstSeenAt,
      }))
    );
  }
}
