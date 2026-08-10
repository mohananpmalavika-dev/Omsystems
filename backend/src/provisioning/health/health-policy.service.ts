/**
 * Health Policy Service
 * Manages health check policies and activation gates
 */

import { BranchHealthResult, HealthIssue } from '../models/provisioning-result';
import { HealthPolicyConfig } from '../models/provisioning-context';

export interface ActivationGateResult {
  canActivate: boolean;
  blockingReasons: string[];
  warnings: string[];
}

export class HealthPolicyService {
  /**
   * Check if branch can be activated based on health policy
   */
  checkActivationGates(
    health: BranchHealthResult,
    policy: HealthPolicyConfig
  ): ActivationGateResult {
    const blockingReasons: string[] = [];
    const warnings: string[] = [];

    // Hard blockers
    if (health.blockingIssues.length > 0) {
      blockingReasons.push(
        ...health.blockingIssues.map(issue => issue.message)
      );
    }

    // Component-specific gates
    const networkGate = this.checkNetworkGate(health, policy);
    if (!networkGate.passed) {
      blockingReasons.push(...networkGate.reasons);
    }

    const cameraGate = this.checkCameraGate(health, policy);
    if (!cameraGate.passed) {
      blockingReasons.push(...cameraGate.reasons);
    }

    const storageGate = this.checkStorageGate(health, policy);
    if (!storageGate.passed) {
      blockingReasons.push(...storageGate.reasons);
    }

    const recordingGate = this.checkRecordingGate(health, policy);
    if (!recordingGate.passed) {
      blockingReasons.push(...recordingGate.reasons);
    }

    // Collect warnings from non-blocking issues
    warnings.push(
      ...health.warnings.map(issue => `${issue.component}: ${issue.message}`)
    );

    return {
      canActivate: blockingReasons.length === 0,
      blockingReasons,
      warnings,
    };
  }

  /**
   * Check network activation gate
   */
  private checkNetworkGate(
    health: BranchHealthResult,
    policy: HealthPolicyConfig
  ): { passed: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const network = health.components.network;

    if (policy.network.gatewayRequired && !network.metadata?.gatewayReachable) {
      reasons.push('Gateway must be reachable');
    }

    if (policy.network.dnsRequired && !network.metadata?.dnsWorking) {
      reasons.push('DNS must be working');
    }

    if (policy.network.ntpRequired && !network.metadata?.ntpWorking) {
      reasons.push('NTP must be configured and working');
    }

    return {
      passed: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Check cameras activation gate
   */
  private checkCameraGate(
    health: BranchHealthResult,
    policy: HealthPolicyConfig
  ): { passed: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const cameras = health.components.cameras;

    if (!cameras.metadata) {
      reasons.push('Camera discovery must be completed');
      return { passed: false, reasons };
    }

    const successRate = cameras.metadata.successRate as number;
    if (successRate < policy.cameras.minimumOperationalPercent) {
      reasons.push(
        `At least ${policy.cameras.minimumOperationalPercent}% of cameras must be operational`
      );
    }

    if (policy.cameras.requireStreamValidation) {
      const hasUnvalidatedStreams = cameras.issues.some(
        i => i.code === 'STREAMS_NOT_VALIDATED'
      );
      if (hasUnvalidatedStreams) {
        reasons.push('All camera streams must be validated');
      }
    }

    if (policy.cameras.blockOnDefaultCredentials) {
      const hasDefaultCredentials = cameras.issues.some(
        i => i.code === 'DEFAULT_CREDENTIALS_DETECTED'
      );
      if (hasDefaultCredentials) {
        reasons.push('All cameras must have secure credentials (no defaults)');
      }
    }

    return {
      passed: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Check storage activation gate
   */
  private checkStorageGate(
    health: BranchHealthResult,
    policy: HealthPolicyConfig
  ): { passed: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const storage = health.components.storage;

    if (!storage.metadata) {
      reasons.push('Storage must be provisioned');
      return { passed: false, reasons };
    }

    if (policy.storage.writableRequired && !storage.metadata.retentionAchievable) {
      reasons.push('Storage must be writable and meet retention requirements');
    }

    const retentionDays = storage.metadata.retentionDays as number;
    if (retentionDays < policy.storage.minimumRetentionDays) {
      reasons.push(
        `Storage must support at least ${policy.storage.minimumRetentionDays} days retention`
      );
    }

    return {
      passed: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Check recording activation gate
   */
  private checkRecordingGate(
    health: BranchHealthResult,
    policy: HealthPolicyConfig
  ): { passed: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const recording = health.components.recording;

    if (policy.recording.verifiedRequired) {
      if (!recording.metadata) {
        reasons.push('Recording must be verified before activation');
        return { passed: false, reasons };
      }

      const successRate = recording.metadata.successRate as number;
      if (successRate < policy.recording.minimumSuccessPercent) {
        reasons.push(
          `Recording success rate must be at least ${policy.recording.minimumSuccessPercent}%`
        );
      }

      const allCriticalPassed = recording.metadata.allCriticalPassed as boolean;
      if (!allCriticalPassed) {
        reasons.push('All critical recording tests must pass');
      }
    }

    return {
      passed: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Get issue severity weight for prioritization
   */
  getIssueSeverityWeight(severity: HealthIssue['severity']): number {
    switch (severity) {
      case 'critical':
        return 100;
      case 'high':
        return 75;
      case 'medium':
        return 50;
      case 'low':
        return 25;
      default:
        return 0;
    }
  }

  /**
   * Prioritize issues by severity and blocking status
   */
  prioritizeIssues(issues: HealthIssue[]): HealthIssue[] {
    return issues.sort((a, b) => {
      // Blocking issues first
      if (a.blocking && !b.blocking) return -1;
      if (!a.blocking && b.blocking) return 1;

      // Then by severity
      return (
        this.getIssueSeverityWeight(b.severity) -
        this.getIssueSeverityWeight(a.severity)
      );
    });
  }

  /**
   * Generate health report summary
   */
  generateHealthReport(health: BranchHealthResult): string {
    const lines: string[] = [];

    lines.push(`Branch Health Report`);
    lines.push(`Overall Status: ${health.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    lines.push(`Health Score: ${health.score}/100`);
    lines.push('');

    lines.push('Component Status:');
    for (const [name, component] of Object.entries(health.components)) {
      const status = component.status.toUpperCase();
      const emoji =
        component.status === 'pass'
          ? '✓'
          : component.status === 'fail'
          ? '✗'
          : '⚠';
      lines.push(
        `  ${emoji} ${name.charAt(0).toUpperCase() + name.slice(1)}: ${status} (${component.score}/100)`
      );
    }

    if (health.blockingIssues.length > 0) {
      lines.push('');
      lines.push('Blocking Issues:');
      for (const issue of health.blockingIssues) {
        lines.push(`  - [${issue.severity.toUpperCase()}] ${issue.message}`);
        if (issue.remediation) {
          lines.push(`    Remediation: ${issue.remediation}`);
        }
      }
    }

    if (health.warnings.length > 0) {
      lines.push('');
      lines.push('Warnings:');
      for (const warning of health.warnings.slice(0, 5)) {
        lines.push(`  - ${warning.message}`);
      }
      if (health.warnings.length > 5) {
        lines.push(`  ... and ${health.warnings.length - 5} more warnings`);
      }
    }

    return lines.join('\n');
  }
}
