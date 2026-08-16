/**
 * Central Privacy Decision Service
 * 
 * Determines whether a user receives UNMASKED, MASKED, or DENIED video/media:
 * 1. Evaluates user permissions (video.unmasked.live, video.unmasked.playback, evidence.unredacted.export)
 * 2. Checks active temporary unmasking grants (PrivacyOverrideGrant)
 * 3. Applies mandatory vs overrideable static privacy zones
 * 4. Configures dynamic face/person/plate redaction and audio muting
 * 5. Injects security watermarks on unmasked privileged viewing
 * 6. Enforces fail-closed security principle
 */

import type { SecurityPrincipal } from '../../identity/domain/identity.types.js';
import { BankingPermissions } from '../../identity/domain/identity.types.js';
import type {
  PrivacyDecision,
  PrivacyZone,
} from '../domain/privacy.types.js';
import { privacyPolicyService } from './privacy-policy.service.js';
import { privacyOverrideService } from './privacy-override.service.js';

export interface PrivacyDecisionRequest {
  principal: SecurityPrincipal;
  cameraId: string;
  branchId?: string;
  operation: 'LIVE_VIEW' | 'PLAYBACK' | 'EXPORT';
  incidentId?: string;
  caseNumber?: string;
  sourceIp?: string;
}

export class PrivacyDecisionService {
  /**
   * Primary decision point for live viewing, playback, and export pipelines
   */
  async evaluate(req: PrivacyDecisionRequest): Promise<PrivacyDecision> {
    try {
      const policy = privacyPolicyService.resolvePolicy({
        tenantId: req.principal.tenantId,
        branchId: req.branchId,
        cameraId: req.cameraId,
      });

      const staticZones = privacyPolicyService.getStaticZones(req.cameraId);

      // Check mandatory un-overrideable static zones (e.g. employee changing area, PIN keypad)
      const mandatoryZones = staticZones.filter((z) => z.mandatory && !z.overrideAllowed);

      // 1. Check for unmasking privilege
      let isUnmasked = false;
      let activeGrantId: string | undefined;

      const opType = req.operation === 'LIVE_VIEW' ? 'LIVE' : 'PLAYBACK';
      const activeGrant = privacyOverrideService.getActiveGrant(req.principal.userId, req.cameraId, opType);

      if (activeGrant) {
        isUnmasked = true;
        activeGrantId = activeGrant.id;
      } else if (req.operation === 'LIVE_VIEW' && req.principal.permissions.includes(BankingPermissions.VIDEO_UNMASKED_LIVE)) {
        isUnmasked = true;
      } else if (req.operation === 'PLAYBACK' && req.principal.permissions.includes(BankingPermissions.VIDEO_UNMASKED_PLAYBACK)) {
        isUnmasked = true;
      } else if (req.operation === 'EXPORT' && req.principal.permissions.includes(BankingPermissions.EVIDENCE_UNREDACTED_EXPORT)) {
        isUnmasked = true;
      }

      if (isUnmasked) {
        // Record unmasked access in audit log
        privacyOverrideService.recordAudit({
          id: Math.random().toString(36).substring(2),
          tenantId: req.principal.tenantId,
          userId: req.principal.userId,
          username: req.principal.username,
          event: req.operation === 'LIVE_VIEW' ? 'PRIVACY_UNMASKED_LIVE_VIEW' : req.operation === 'PLAYBACK' ? 'PRIVACY_UNMASKED_PLAYBACK' : 'PRIVACY_UNREDACTED_EXPORT',
          branchId: req.branchId,
          cameraId: req.cameraId,
          operation: req.operation === 'LIVE_VIEW' ? 'LIVE' : req.operation === 'PLAYBACK' ? 'PLAYBACK' : 'EXPORT',
          incidentId: req.incidentId,
          caseNumber: req.caseNumber,
          policyId: policy.id,
          policyVersion: policy.version,
          sourceIp: req.sourceIp,
          timestamp: new Date().toISOString(),
        });

        return {
          allow: true,
          mode: 'UNMASKED',
          transformations: {
            staticZones: mandatoryZones.length > 0, // Mandatory zones always stay masked
            faceBlur: false,
            personBlur: false,
            plateBlur: false,
            muteAudio: false,
            removeAudioTrack: false,
          },
          zonesToApply: mandatoryZones,
          watermarkText: `UNMASKED | USER: ${req.principal.username} | ${new Date().toISOString()}`,
          grantId: activeGrantId,
          auditRequired: true,
          policyId: policy.id,
          policyVersion: policy.version,
        };
      }

      // 2. Standard Masked Mode
      const isExport = req.operation === 'EXPORT';
      return {
        allow: true,
        mode: 'MASKED',
        transformations: {
          staticZones: staticZones.length > 0,
          faceBlur: policy.dynamicRedaction.faceBlur !== 'NONE',
          personBlur: policy.dynamicRedaction.personBlur !== 'NONE',
          plateBlur: policy.dynamicRedaction.licensePlateBlur !== 'NONE',
          muteAudio: isExport ? policy.audio.exportAction === 'MUTE' : req.operation === 'LIVE_VIEW' ? policy.audio.liveMute : policy.audio.playbackMute,
          removeAudioTrack: isExport && policy.audio.exportAction === 'REMOVE_TRACK',
        },
        zonesToApply: staticZones,
        auditRequired: false,
        policyId: policy.id,
        policyVersion: policy.version,
      };
    } catch (err: any) {
      // Fail closed: On any decision error, deny unmasked video
      return {
        allow: false,
        mode: 'DENIED',
        transformations: {
          staticZones: true,
          faceBlur: true,
          personBlur: true,
          plateBlur: true,
          muteAudio: true,
          removeAudioTrack: true,
        },
        zonesToApply: [],
        auditRequired: true,
        policyId: 'FAIL_CLOSED_DEFAULT',
        policyVersion: 1,
        reason: `Privacy decision failed closed: ${err?.message || 'Unknown error'}`,
      };
    }
  }
}

export const privacyDecisionService = new PrivacyDecisionService();
