/**
 * Access Correlation Rule
 * 
 * Verifies that secure zone entry correlates with access control events
 */

import { BaseRule, RuleContext, RuleResult } from './rule-engine.js';

export class AccessCorrelationRule extends BaseRule {
  constructor() {
    super(
      'access_correlation',
      'Access Control Correlation',
      'Secure zone entry must correlate with valid access control events',
      'critical'
    );
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const { session, monitor } = context;

    // Check if correlation is required
    if (!monitor.accessRules.requireAccessCorrelation) {
      return this.pass(
        'Access correlation not required by policy',
        { required: false }
      );
    }

    // Check if secure zone is configured
    const secureZoneId = monitor.secureEntryZoneId;
    if (!secureZoneId) {
      return this.unknown(
        'No secure entry zone configured',
        { reason: 'no_secure_zone' }
      );
    }

    // Check if access control is available
    if (!session.evidenceAvailability.accessControl) {
      return this.unknown(
        'Access control data not available',
        {
          reason: 'access_control_unavailable',
          secureZoneId,
        }
      );
    }

    // Find personnel who entered secure zone
    const personnelInSecureZone = session.personnel.filter(person =>
      person.zoneHistory.some(z => z.zoneId === secureZoneId)
    );

    if (personnelInSecureZone.length === 0) {
      // No one entered secure zone yet
      return this.unknown(
        'No personnel have entered secure zone yet',
        {
          reason: 'no_secure_zone_entry',
          secureZoneId,
        }
      );
    }

    // Check correlation for each person
    const correlationWindow = monitor.accessRules.accessCorrelationWindowMs;
    const violations: any[] = [];
    const correlations: any[] = [];

    for (const person of personnelInSecureZone) {
      const secureZoneEntry = person.zoneHistory.find(z => z.zoneId === secureZoneId);
      if (!secureZoneEntry) {
        continue;
      }

      // Find access events within correlation window
      const correlatedEvents = session.accessEvents.filter(event => {
        // Must be granted (not denied)
        if (event.type !== 'granted') {
          return false;
        }

        // Must be within time window
        const timeDiff = Math.abs(
          event.timestamp.getTime() - secureZoneEntry.enteredAt.getTime()
        );
        return timeDiff <= correlationWindow;
      });

      if (correlatedEvents.length === 0) {
        // No correlated access event
        violations.push({
          personTrackId: person.trackId,
          identityId: person.identityId,
          zoneEntryTime: secureZoneEntry.enteredAt,
          accessEventsCount: 0,
        });
      } else {
        // Check identity match if required and available
        if (monitor.accessRules.requireAuthorizedIdentity && person.identityId) {
          const identityMatch = correlatedEvents.some(
            event => event.identityId === person.identityId
          );

          if (!identityMatch) {
            violations.push({
              personTrackId: person.trackId,
              identityId: person.identityId,
              zoneEntryTime: secureZoneEntry.enteredAt,
              accessEventsCount: correlatedEvents.length,
              identityMismatch: true,
              credentialIdentities: correlatedEvents
                .filter(e => e.identityId)
                .map(e => e.identityId),
            });
          } else {
            correlations.push({
              personTrackId: person.trackId,
              identityId: person.identityId,
              zoneEntryTime: secureZoneEntry.enteredAt,
              accessEventId: correlatedEvents.find(e => e.identityId === person.identityId)?.eventId,
            });
          }
        } else {
          // Identity match not required or not available
          correlations.push({
            personTrackId: person.trackId,
            identityId: person.identityId,
            zoneEntryTime: secureZoneEntry.enteredAt,
            accessEventId: correlatedEvents[0].eventId,
          });
        }
      }
    }

    // If violations found, fail
    if (violations.length > 0) {
      const message =
        violations[0].identityMismatch
          ? `Access control identity mismatch: ${violations.length} person(s)`
          : `Secure zone entry without access event: ${violations.length} person(s)`;

      return this.fail(
        message,
        {
          violationCount: violations.length,
          violations,
          correlationWindowMs: correlationWindow,
          secureZoneId,
        },
        violations.map(v => ({
          type: 'zone_event' as const,
          id: v.personTrackId,
          timestamp: v.zoneEntryTime,
          metadata: { violation: 'no_access_correlation' },
        }))
      );
    }

    // All entries correlated
    return this.pass(
      `All secure zone entries correlated with access events: ${correlations.length}`,
      {
        correlationCount: correlations.length,
        correlations,
        correlationWindowMs: correlationWindow,
        secureZoneId,
      },
      correlations.map(c => ({
        type: 'access_event' as const,
        id: c.accessEventId,
        timestamp: c.zoneEntryTime,
        confidence: 1.0,
      }))
    );
  }
}
