import { describe, expect, it } from 'vitest';
import { correlateBranchDiagnoses } from '../src/services/command-center/correlation.js';
import type { CommandCenterDiagnosis } from '../src/services/command-center/types.js';

function diagnosis(branchId: string, confidence: number): CommandCenterDiagnosis {
  return {
    caseId: `case-${branchId}`,
    caseFingerprint: `fingerprint-${branchId}`,
    branch: { id: branchId, name: branchId },
    status: { label: 'Offline', certainty: 'confirmed', explanation: 'Verified network evidence' },
    rootCause: {
      code: 'wan_unavailable', label: 'WAN unavailable', certainty: 'confirmed',
      confidence, explanation: 'The edge probe cannot reach the WAN.', evidenceIds: [`evidence-${branchId}`],
    },
    evidence: [{
      id: `evidence-${branchId}`, certainty: 'confirmed', assertion: 'WAN unreachable',
      entityId: `network:${branchId}:wan`, observedAt: '2026-08-30T00:00:00.000Z',
      source: 'system', quality: 'verified', raw: {},
    }],
    impact: {
      unavailableCameras: 2, totalCameras: 2, offlineRecorders: 1,
      affectedEntityIds: [`network:${branchId}:wan`], statement: 'Branch WAN is unavailable.',
    },
    currentRecoveryActivity: [],
    recoveryEstimate: {
      available: false, automatedMinutes: null, engineerAssistedMinutes: null,
      confidence: 'insufficient', basis: [], missingInputs: [], statement: 'No estimate available.',
    },
    recommendedActions: [],
    alternativeCauses: [],
    missingEvidence: [],
    lastUpdatedAt: '2026-08-30T00:00:00.000Z',
    graph: {
      branch: { id: branchId, name: branchId, status: 'offline' },
      entities: [{
        id: `network:${branchId}:wan`, entityType: 'network', name: 'WAN', status: 'offline',
        observedAt: '2026-08-30T00:00:00.000Z', source: 'system', quality: 'verified',
        reasonCodes: ['wan_unreachable'], metrics: { connectivity: false },
      }],
      dependencies: [],
      summary: {
        totalEntities: 1, unhealthyEntities: 1, totalCameras: 0, unavailableCameras: 0,
        recorders: 0, offlineRecorders: 0, networks: 1, availableNetworks: 0,
      },
      generatedAt: '2026-08-30T00:00:00.000Z',
    },
    timeline: [],
  };
}

describe('command-center cross-branch correlation', () => {
  it('clusters shared causes and emits only signals affecting multiple branches', () => {
    const result = correlateBranchDiagnoses([
      diagnosis('branch-1', 0.9),
      diagnosis('branch-2', 0.8),
    ]);

    expect(result.branches).toHaveLength(2);
    expect(result.rootCauseClusters).toEqual([expect.objectContaining({
      code: 'wan_unavailable', branchCount: 2, averageConfidence: 0.85,
    })]);
    expect(result.crossBranchSignals).toEqual([expect.objectContaining({
      entityType: 'network', signal: 'wan_unreachable', branchCount: 2,
      branchIds: ['branch-1', 'branch-2'],
    })]);
  });
});
