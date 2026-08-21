import type {
  DriftPolicy,
  DriftRemediationResult,
  BranchConfigurationState,
} from '../domain/signed-config.types.js';
import { signedConfigService } from './signed-config.service.js';
import { branchConfigurationAgentService } from './branch-configuration-agent.service.js';

export class ConfigReconciliationService {
  private defaultPolicy: DriftPolicy = 'REPORT_ONLY';

  /**
   * Run fleetwide configuration drift audit.
   */
  async runFleetReconciliation(
    policy: DriftPolicy = this.defaultPolicy,
    tenantId?: string,
  ): Promise<{
    evaluatedBranches: number;
    driftedCount: number;
    remediatedCount: number;
    results: DriftRemediationResult[];
  }> {
    const states = signedConfigService.listFleetStates(tenantId);
    const activeVersion = signedConfigService.getActiveSignedVersion(tenantId);
    const results: DriftRemediationResult[] = [];

    let driftedCount = 0;
    let remediatedCount = 0;

    for (const state of states) {
      if (state.status === 'DRIFTED') {
        driftedCount++;

        if (policy === 'AUTO_REMEDIATE' && activeVersion && activeVersion.signature) {
          // Attempt automatic remediation by pushing active signed package to branch agent
          const applyRes = await branchConfigurationAgentService.reconcileBranch({
            branchId: state.branchId,
            gatewayId: state.gatewayId,
            manifest: activeVersion.signature,
            config: activeVersion.config,
          });

          if (applyRes.overallStatus === 'VERIFIED') {
            remediatedCount++;
            results.push({
              branchId: state.branchId,
              remediated: true,
              actionTaken: `Auto-remediated drift to signed v${activeVersion.version}`,
              appliedVersion: activeVersion.version,
            });
          } else {
            results.push({
              branchId: state.branchId,
              remediated: false,
              actionTaken: `Auto-remediation failed: ${applyRes.components[0]?.errorMessage}`,
            });
          }
        } else if (policy === 'REQUIRE_APPROVAL') {
          results.push({
            branchId: state.branchId,
            remediated: false,
            actionTaken: 'Flagged for SOC review & approval',
          });
        } else {
          results.push({
            branchId: state.branchId,
            remediated: false,
            actionTaken: 'Reported drift only',
          });
        }
      }
    }

    return {
      evaluatedBranches: states.length,
      driftedCount,
      remediatedCount,
      results,
    };
  }

  setPolicy(policy: DriftPolicy): void {
    this.defaultPolicy = policy;
  }

  getPolicy(): DriftPolicy {
    return this.defaultPolicy;
  }
}

export const configReconciliationService = new ConfigReconciliationService();
