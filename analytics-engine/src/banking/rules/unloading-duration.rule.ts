/**
 * Unloading Duration Rule
 * 
 * Verifies that unloading process completes within acceptable time
 */

import { BaseRule, RuleContext, RuleResult } from './rule-engine.js';

export class UnloadingDurationRule extends BaseRule {
  constructor() {
    super(
      'unloading_duration',
      'Unloading Duration',
      'Cash unloading must complete within maximum allowed time',
      'medium'
    );
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const { session, monitor, now } = context;

    // Check if unloading has started
    if (!session.unloadingStartedAt) {
      return this.unknown(
        'Unloading has not started yet',
        { reason: 'unloading_not_started' }
      );
    }

    // Check if unloading is complete
    if (session.transferCompletedAt) {
      const durationMs =
        session.transferCompletedAt.getTime() - session.unloadingStartedAt.getTime();
      const durationSeconds = Math.floor(durationMs / 1000);
      const maxDuration = monitor.unloadingRules.maxDurationSeconds;

      if (durationSeconds > maxDuration) {
        return this.fail(
          `Unloading exceeded time limit: ${durationSeconds}s (max: ${maxDuration}s)`,
          {
            durationSeconds,
            maxDurationSeconds: maxDuration,
            exceededBy: durationSeconds - maxDuration,
            startedAt: session.unloadingStartedAt,
            completedAt: session.transferCompletedAt,
          },
          [
            {
              type: 'detection',
              id: 'unloading_complete',
              timestamp: session.transferCompletedAt,
            },
          ]
        );
      }

      return this.pass(
        `Unloading completed within time limit: ${durationSeconds}s`,
        {
          durationSeconds,
          maxDurationSeconds: maxDuration,
          startedAt: session.unloadingStartedAt,
          completedAt: session.transferCompletedAt,
        }
      );
    }

    // Unloading is in progress - check current duration
    const durationMs = now.getTime() - session.unloadingStartedAt.getTime();
    const durationSeconds = Math.floor(durationMs / 1000);
    const maxDuration = monitor.unloadingRules.maxDurationSeconds;

    if (durationSeconds > maxDuration) {
      return this.fail(
        `Unloading timeout: ${durationSeconds}s elapsed (max: ${maxDuration}s)`,
        {
          durationSeconds,
          maxDurationSeconds: maxDuration,
          exceededBy: durationSeconds - maxDuration,
          startedAt: session.unloadingStartedAt,
          stillInProgress: true,
        },
        [
          {
            type: 'detection',
            id: 'unloading_timeout',
            timestamp: new Date(session.unloadingStartedAt.getTime() + maxDuration * 1000),
          },
        ]
      );
    }

    // Still within acceptable time
    const remainingSeconds = maxDuration - durationSeconds;
    return this.pass(
      `Unloading in progress: ${durationSeconds}s elapsed, ${remainingSeconds}s remaining`,
      {
        durationSeconds,
        maxDurationSeconds: maxDuration,
        remainingSeconds,
        startedAt: session.unloadingStartedAt,
        inProgress: true,
      }
    );
  }
}
