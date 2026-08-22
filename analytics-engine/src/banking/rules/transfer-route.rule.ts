/**
 * Transfer Route Rule
 * 
 * Verifies that cash transfer follows approved route through zones
 */

import { BaseRule, RuleContext, RuleResult } from './rule-engine.js';

export class TransferRouteRule extends BaseRule {
  constructor() {
    super(
      'transfer_route',
      'Transfer Route Compliance',
      'Cash containers must follow approved route through designated zones',
      'critical'
    );
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const { session, monitor } = context;

    // Check if approved route is configured
    if (!monitor.approvedRouteZones || monitor.approvedRouteZones.length === 0) {
      return this.unknown(
        'No approved route configured',
        { reason: 'no_route_configured' }
      );
    }

    // Check if transfer objects are being tracked
    if (!session.evidenceAvailability.transferObjectDetection) {
      return this.unknown(
        'Transfer object detection not available',
        { reason: 'object_detection_unavailable' }
      );
    }

    // Check if any transfer objects have been observed
    if (session.transferObjects.length === 0) {
      return this.unknown(
        'No transfer objects observed yet',
        { reason: 'no_transfer_objects' }
      );
    }

    const approvedZones = new Set(monitor.approvedRouteZones);
    const violations: any[] = [];

    // Check each transfer object's route
    for (const obj of session.transferObjects) {
      for (const visit of obj.zoneHistory) {
        if (!approvedZones.has(visit.zoneId)) {
          violations.push({
            objectTrackId: obj.trackId,
            objectType: obj.objectType,
            unauthorizedZone: visit.zoneId,
            enteredAt: visit.enteredAt,
            exitedAt: visit.exitedAt,
          });
        }
      }
    }

    // If violations found, fail
    if (violations.length > 0) {
      return this.fail(
        `Route deviation detected: ${violations.length} unauthorized zone entry(s)`,
        {
          violationCount: violations.length,
          violations,
          approvedZones: Array.from(approvedZones),
          transferObjects: session.transferObjects.map(o => ({
            trackId: o.trackId,
            type: o.objectType,
            zones: o.zoneHistory.map(z => z.zoneId),
          })),
        },
        violations.map(v => ({
          type: 'zone_event' as const,
          id: v.objectTrackId,
          timestamp: v.enteredAt,
          metadata: { zoneId: v.unauthorizedZone },
        }))
      );
    }

    // Check if objects completed the route
    const secureZoneId = monitor.secureEntryZoneId;
    if (secureZoneId && monitor.unloadingRules.requireSecureZoneCompletion) {
      const objectsInSecureZone = session.transferObjects.filter(obj =>
        obj.zoneHistory.some(z => z.zoneId === secureZoneId)
      );

      if (objectsInSecureZone.length < session.transferObjects.length) {
        const incompleteCount = session.transferObjects.length - objectsInSecureZone.length;
        
        return this.fail(
          `Transfer incomplete: ${incompleteCount} object(s) not yet in secure zone`,
          {
            totalObjects: session.transferObjects.length,
            inSecureZone: objectsInSecureZone.length,
            incomplete: incompleteCount,
            secureZoneId,
            objects: session.transferObjects.map(o => ({
              trackId: o.trackId,
              inSecureZone: objectsInSecureZone.some(sz => sz.trackId === o.trackId),
              currentZone: o.currentZoneId,
            })),
          },
          [],
          0.9
        );
      }
    }

    // All objects followed approved route
    return this.pass(
      `All transfer objects followed approved route`,
      {
        transferObjectCount: session.transferObjects.length,
        approvedZones: Array.from(approvedZones),
        objects: session.transferObjects.map(o => ({
          trackId: o.trackId,
          type: o.objectType,
          routeTaken: o.zoneHistory.map(z => z.zoneId),
          inSecureZone: secureZoneId ? o.zoneHistory.some(z => z.zoneId === secureZoneId) : undefined,
        })),
      },
      session.transferObjects.flatMap(o =>
        o.zoneHistory.map(z => ({
          type: 'zone_event' as const,
          id: o.trackId,
          timestamp: z.enteredAt,
          metadata: { zoneId: z.zoneId },
        }))
      )
    );
  }
}
