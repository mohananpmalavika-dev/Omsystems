/**
 * Escort Verification Rule
 * 
 * Verifies that required security guards/escorts are present and identified
 */

import { BaseRule, RuleContext, RuleResult } from './rule-engine';

export class EscortVerificationRule extends BaseRule {
  constructor() {
    super(
      'escort_verification',
      'Cash Escort Verification',
      'Required number of authorized guards must be present and identified',
      'high'
    );
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const { session, monitor } = context;

    const rules = monitor.personnelRules;

    // If identity verification is not required, only check count
    if (!rules.requireIdentityVerification) {
      const personnelCount = session.personnel.filter(p => p.associatedWithVehicle).length;
      
      if (personnelCount >= rules.minimumGuards) {
        return this.pass(
          `Minimum personnel present (identity verification not required): ${personnelCount}`,
          {
            observed: personnelCount,
            required: rules.minimumGuards,
            identityVerificationRequired: false,
          }
        );
      } else {
        return this.fail(
          `Insufficient personnel: ${personnelCount} observed, ${rules.minimumGuards} required`,
          {
            observed: personnelCount,
            required: rules.minimumGuards,
          }
        );
      }
    }

    // Identity verification is required
    if (!session.evidenceAvailability.faceRecognition) {
      return this.unknown(
        'Face recognition not available - cannot verify guard identities',
        {
          reason: 'face_recognition_unavailable',
          personnelObserved: session.personnel.filter(p => p.associatedWithVehicle).length,
          minimumGuardsRequired: rules.minimumGuards,
        }
      );
    }

    // Get identified guards
    const identifiedGuards = session.personnel.filter(person => {
      // Must be associated with vehicle
      if (!person.associatedWithVehicle) {
        return false;
      }

      // Must have identity
      if (!person.identityId) {
        return false;
      }

      // Must meet confidence threshold
      if (
        person.identityConfidence !== undefined &&
        person.identityConfidence < rules.minimumIdentityConfidence
      ) {
        return false;
      }

      // Must have guard role
      return person.roles?.includes('cash_guard');
    });

    const guardCount = identifiedGuards.length;
    const requiredGuards = rules.minimumGuards;

    // Check if we have enough identified guards
    if (guardCount < requiredGuards) {
      // Check if we have unidentified personnel
      const unidentifiedCount = session.personnel.filter(
        p => p.associatedWithVehicle && !p.identityId
      ).length;

      const message =
        unidentifiedCount > 0
          ? `Insufficient identified guards: ${guardCount} identified, ${requiredGuards} required (${unidentifiedCount} unidentified)`
          : `Insufficient guards: ${guardCount} identified, ${requiredGuards} required`;

      return this.fail(
        message,
        {
          identifiedGuards: guardCount,
          required: requiredGuards,
          unidentified: unidentifiedCount,
          guardIdentities: identifiedGuards.map(g => ({
            identityId: g.identityId,
            confidence: g.identityConfidence,
            trackId: g.trackId,
          })),
        },
        identifiedGuards.map(g => ({
          type: 'identity_match' as const,
          id: g.identityId!,
          confidence: g.identityConfidence,
          timestamp: g.firstSeenAt,
        }))
      );
    }

    // Check for unauthorized roles
    const unauthorizedPersonnel = session.personnel.filter(person => {
      if (!person.associatedWithVehicle || !person.identityId) {
        return false;
      }

      // Check if any role is allowed
      if (!person.roles || person.roles.length === 0) {
        return true; // No roles = unauthorized
      }

      return !person.roles.some(role => rules.allowedRoles.includes(role));
    });

    if (unauthorizedPersonnel.length > 0) {
      return this.fail(
        `Unauthorized personnel detected: ${unauthorizedPersonnel.length} person(s) with unauthorized roles`,
        {
          identifiedGuards: guardCount,
          unauthorizedCount: unauthorizedPersonnel.length,
          unauthorizedIdentities: unauthorizedPersonnel.map(p => ({
            identityId: p.identityId,
            roles: p.roles,
            trackId: p.trackId,
          })),
        },
        unauthorizedPersonnel.map(p => ({
          type: 'identity_match' as const,
          id: p.identityId!,
          confidence: p.identityConfidence,
          timestamp: p.firstSeenAt,
        })),
        0.95
      );
    }

    // All good - guards verified
    const avgConfidence =
      identifiedGuards.reduce((sum, g) => sum + (g.identityConfidence || 1), 0) /
      identifiedGuards.length;

    return this.pass(
      `${guardCount} authorized guards verified`,
      {
        identifiedGuards: guardCount,
        required: requiredGuards,
        averageConfidence: avgConfidence,
        guardIdentities: identifiedGuards.map(g => ({
          identityId: g.identityId,
          name: `${g.firstName || ''} ${g.lastName || ''}`.trim(),
          roles: g.roles,
          confidence: g.identityConfidence,
          trackId: g.trackId,
        })),
      },
      identifiedGuards.map(g => ({
        type: 'identity_match' as const,
        id: g.identityId!,
        confidence: g.identityConfidence,
        timestamp: g.firstSeenAt,
      }))
    );
  }
}
