import { describe, it, expect, beforeEach } from 'vitest';
import { privacyPolicyService } from '../src/privacy/services/privacy-policy.service.js';
import { privacyDecisionService } from '../src/privacy/services/privacy-decision.service.js';
import { privacyOverrideService } from '../src/privacy/services/privacy-override.service.js';
import { BankingPermissions, type SecurityPrincipal } from '../src/identity/domain/identity.types.js';

describe('Privacy Masking & Redaction Governance Subsystem', () => {
  const mockOperatorPrincipal: SecurityPrincipal = {
    userId: 'usr-operator-01',
    tenantId: 'BANK-001',
    username: 'operator.anand',
    email: 'anand@bank.internal',
    displayName: 'Anand Operator',
    roles: ['BANK_OPERATOR'],
    permissions: [BankingPermissions.CAMERA_LIVE_VIEW, BankingPermissions.CAMERA_PLAYBACK_VIEW],
    scope: { type: 'ALL_BRANCHES' },
    authMethod: 'LOCAL',
    sessionId: 'sess-01',
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
  };

  const mockInvestigatorPrincipal: SecurityPrincipal = {
    ...mockOperatorPrincipal,
    userId: 'usr-investigator-01',
    username: 'investigator.dhanya',
    roles: ['SECURITY_OFFICER'],
    permissions: [
      BankingPermissions.CAMERA_LIVE_VIEW,
      BankingPermissions.CAMERA_PLAYBACK_VIEW,
      BankingPermissions.VIDEO_UNMASKED_LIVE,
      BankingPermissions.VIDEO_UNMASKED_PLAYBACK,
    ],
  };

  it('configures static privacy zones with normalized coordinates', async () => {
    const zone = await privacyPolicyService.setStaticZone({
      cameraId: 'CAM-ATM-01',
      name: 'ATM Keypad Mask',
      shape: 'rectangle',
      coordinates: [
        { x: 0.45, y: 0.65 },
        { x: 0.55, y: 0.65 },
        { x: 0.55, y: 0.85 },
        { x: 0.45, y: 0.85 },
      ],
      mode: 'solid',
      appliesTo: 'all',
      mandatory: true,
      overrideAllowed: false,
      enabled: true,
    });

    expect(zone.id).toBeDefined();
    const activeZones = privacyPolicyService.getStaticZones('CAM-ATM-01');
    expect(activeZones.length).toBeGreaterThanOrEqual(1);
    expect(activeZones[0]?.name).toBe('ATM Keypad Mask');
  });

  it('evaluates MASKED decision for standard operators and enables face/plate blur', async () => {
    const decision = await privacyDecisionService.evaluate({
      principal: mockOperatorPrincipal,
      cameraId: 'CAM-ATM-01',
      operation: 'LIVE_VIEW',
    });

    expect(decision.allow).toBe(true);
    expect(decision.mode).toBe('MASKED');
    expect(decision.transformations.faceBlur).toBe(true);
    expect(decision.transformations.plateBlur).toBe(true);
    expect(decision.zonesToApply.length).toBeGreaterThanOrEqual(1);
  });

  it('evaluates UNMASKED decision with viewer watermark for authorized investigators', async () => {
    const decision = await privacyDecisionService.evaluate({
      principal: mockInvestigatorPrincipal,
      cameraId: 'CAM-ATM-01',
      operation: 'LIVE_VIEW',
    });

    expect(decision.allow).toBe(true);
    expect(decision.mode).toBe('UNMASKED');
    expect(decision.transformations.faceBlur).toBe(false);
    expect(decision.watermarkText).toContain('UNMASKED | USER: investigator.dhanya');
    // Mandatory un-overrideable zones remain applied even for investigators
    expect(decision.transformations.staticZones).toBe(true);
  });

  it('supports temporary privileged unmasking grants with mandatory reason and case number', async () => {
    // 1. Initially operator is masked
    const initialDecision = await privacyDecisionService.evaluate({
      principal: mockOperatorPrincipal,
      cameraId: 'CAM-VAULT-02',
      operation: 'PLAYBACK',
    });
    expect(initialDecision.mode).toBe('MASKED');

    // 2. Request temporary 15-minute unmasking grant
    const grant = await privacyOverrideService.requestUnmask({
      tenantId: 'BANK-001',
      userId: mockOperatorPrincipal.userId,
      username: mockOperatorPrincipal.username,
      cameraId: 'CAM-VAULT-02',
      operation: 'PLAYBACK',
      reason: 'Urgent cash dispute investigation with branch manager',
      caseNumber: 'CASE-2026-9901',
      incidentId: 'INC-2026-1029',
      durationMinutes: 15,
    });

    expect(grant.id).toBeDefined();
    expect(grant.status).toBe('ACTIVE');

    // 3. Now operator receives temporary UNMASKED stream
    const grantedDecision = await privacyDecisionService.evaluate({
      principal: mockOperatorPrincipal,
      cameraId: 'CAM-VAULT-02',
      operation: 'PLAYBACK',
    });

    expect(grantedDecision.mode).toBe('UNMASKED');
    expect(grantedDecision.grantId).toBe(grant.id);

    // 4. Audit trail contains structured event
    const auditLogs = privacyOverrideService.getAuditLogs('BANK-001');
    expect(auditLogs.some((l) => l.event === 'PRIVACY_UNMASK_APPROVED' && l.caseNumber === 'CASE-2026-9901')).toBe(true);
  });
});
