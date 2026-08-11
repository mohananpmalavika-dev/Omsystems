/**
 * Departure Completion Rule
 * 
 * Verifies that transfer completed before vehicle departed
 */

import { BaseRule, RuleContext, RuleResult } from './rule-engine';

export class DepartureCompletionRule extends BaseRule {
  constructor() {
    super(
      'departure_completion',
      'Departure After Completion',
      'Vehicle should not depart before transfer is complete',
      'high'
    );
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const { session } = context;

    // Only evaluate if vehicle has departed
    if (!session.departedAt) {
      return this.unknown(
        'Vehicle has not departed yet',
        {
          reason: 'not_departed',
          state: session.state,
        }
      );
    }

    // Check if transfer was completed
    if (!session.transferCompletedAt) {
      return this.fail(
        'Vehicle departed before transfer completion',
        {
          departedAt: session.departedAt,
          transferCompleted: false,
          unloadingStarted: !!session.unloadingStartedAt,
        },
        [
          {
            type: 'detection',
            id: session.vehicleTrackId || 'vehicle',
            timestamp: session.departedAt,
            metadata: { event: 'vehicle_departed_early' },
          },
        ]
      );
    }

    // Check timing - transfer should complete before departure
    if (session.transferCompletedAt > session.departedAt) {
      // This shouldn't happen, but handle it
      return this.fail(
        'Transfer completion timestamp after departure (data inconsistency)',
        {
          departedAt: session.departedAt,
          transferCompletedAt: session.transferCompletedAt,
          inconsistency: true,
        }
      );
    }

    // Calculate dwell time after completion
    const dwellTimeMs = session.departedAt.getTime() - session.transferCompletedAt.getTime();
    const dwellTimeSeconds = Math.floor(dwellTimeMs / 1000);

    return this.pass(
      `Vehicle departed after transfer completion`,
      {
        transferCompletedAt: session.transferCompletedAt,
        departedAt: session.departedAt,
        dwellAfterCompletionSeconds: dwellTimeSeconds,
      },
      [
        {
          type: 'detection',
          id: session.vehicleTrackId || 'vehicle',
          timestamp: session.departedAt,
          metadata: { event: 'vehicle_departed' },
        },
      ]
    );
  }
}
