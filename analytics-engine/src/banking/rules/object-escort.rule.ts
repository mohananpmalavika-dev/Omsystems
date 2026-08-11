/**
 * Object Escort Rule
 * 
 * Verifies that transfer objects remain escorted by authorized personnel
 */

import { BaseRule, RuleContext, RuleResult } from './rule-engine';

export class ObjectEscortRule extends BaseRule {
  constructor() {
    super(
      'object_escort',
      'Cash Object Escort',
      'Transfer objects must remain escorted by authorized personnel',
      'high'
    );
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const { session, monitor } = context;

    // Check if escort is required
    if (!monitor.unloadingRules.requireGuardEscort) {
      return this.pass(
        'Guard escort not required by policy',
        { required: false }
      );
    }

    // Check if transfer objects exist
    if (session.transferObjects.length === 0) {
      return this.unknown(
        'No transfer objects observed yet',
        { reason: 'no_transfer_objects' }
      );
    }

    // Check if we can verify escort (need person tracking)
    if (!session.evidenceAvailability.personTracking) {
      return this.unknown(
        'Person tracking not available - cannot verify escort',
        {
          reason: 'person_tracking_unavailable',
          transferObjectsCount: session.transferObjects.length,
        }
      );
    }

    // Get authorized guards
    const authorizedGuards = session.personnel.filter(person => {
      if (!person.associatedWithVehicle) {
        return false;
      }
      
      // If identity verification is required, check roles
      if (monitor.personnelRules.requireIdentityVerification) {
        return person.roles?.includes('cash_guard') || person.roles?.includes('cash_handler');
      }
      
      // Otherwise, all associated personnel count as potential escorts
      return true;
    });

    if (authorizedGuards.length === 0) {
      return this.fail(
        'No authorized escorts available',
        {
          transferObjectsCount: session.transferObjects.length,
          personnelCount: session.personnel.length,
          authorizedCount: 0,
        }
      );
    }

    // Check for unattended objects
    const unattendedObjects: any[] = [];
    const maxDistance = monitor.unloadingRules.maxEscortDistanceMeters;

    for (const obj of session.transferObjects) {
      // Check if currently carried
      if (obj.carriedBy) {
        const carrier = session.personnel.find(p => p.trackId === obj.carriedBy);
        if (carrier && authorizedGuards.some(g => g.trackId === carrier.trackId)) {
          // Being carried by authorized person - good
          continue;
        }
      }

      // Check if marked unattended
      if (obj.unattendedSince) {
        const unattendedDurationMs = context.now.getTime() - obj.unattendedSince.getTime();
        const unattendedSeconds = Math.floor(unattendedDurationMs / 1000);

        unattendedObjects.push({
          trackId: obj.trackId,
          objectType: obj.objectType,
          currentZone: obj.currentZoneId,
          unattendedSince: obj.unattendedSince,
          unattendedSeconds,
        });
      }
    }

    // If unattended objects found, fail
    if (unattendedObjects.length > 0) {
      return this.fail(
        `Unattended transfer objects detected: ${unattendedObjects.length}`,
        {
          unattendedCount: unattendedObjects.length,
          totalObjects: session.transferObjects.length,
          unattendedObjects,
          maxEscortDistance: maxDistance,
        },
        unattendedObjects.map(obj => ({
          type: 'detection' as const,
          id: obj.trackId,
          timestamp: obj.unattendedSince,
          metadata: { violation: 'unattended_object' },
        }))
      );
    }

    // All objects properly escorted
    const carriedObjects = session.transferObjects.filter(o => o.carriedBy);
    
    return this.pass(
      `All transfer objects properly escorted`,
      {
        totalObjects: session.transferObjects.length,
        carriedObjects: carriedObjects.length,
        authorizedEscorts: authorizedGuards.length,
        maxEscortDistance: maxDistance,
        objects: session.transferObjects.map(o => ({
          trackId: o.trackId,
          type: o.objectType,
          carriedBy: o.carriedBy,
          unattended: !!o.unattendedSince,
        })),
      },
      carriedObjects.map(o => ({
        type: 'track' as const,
        id: o.trackId,
        confidence: o.confidence,
        timestamp: o.lastSeenAt,
      }))
    );
  }
}
