import type {
  ChaosAssertionResult,
  ChaosExperimentReport,
  ChaosScenarioType,
} from "../domain/chaos-engine.types.js";

export class ResiliencyAssessorService {
  /**
   * Asserts all 6 core recovery guarantees with scenario-specific SLA criteria.
   */
  assessExperiment(report: ChaosExperimentReport): {
    passed: boolean;
    assertionChecks: Array<{
      name: string;
      question: string;
      passed: boolean;
      expected: string;
      actual: string;
    }>;
  } {
    const a = report.assertions;
    const maxAllowedLostSeconds = this.getMaxAllowedLostSeconds(report.scenario);
    const requiresOwnershipTransfer = this.isOwnershipTransferRequired(report.scenario);

    const checks = [
      {
        name: "didRecordingRecover",
        question: "Did recording recover?",
        passed: a.didRecordingRecover === true,
        expected: "true",
        actual: String(a.didRecordingRecover),
      },
      {
        name: "secondsLost",
        question: "How many seconds were lost?",
        passed: a.secondsLost <= maxAllowedLostSeconds,
        expected: `<= ${maxAllowedLostSeconds}s`,
        actual: `${a.secondsLost}s lost`,
      },
      {
        name: "wasAlertGenerated",
        question: "Was an alert generated?",
        passed: a.wasAlertGenerated === true && Boolean(a.alertId),
        expected: "true (with valid alertId)",
        actual: a.wasAlertGenerated ? `Generated: ${a.alertId} (${a.alertSeverity})` : "false",
      },
      {
        name: "didOwnershipTransfer",
        question: "Did ownership transfer?",
        passed: requiresOwnershipTransfer ? a.didOwnershipTransfer === true : true,
        expected: requiresOwnershipTransfer ? "true" : "N/A or Optional",
        actual: a.didOwnershipTransfer ? `Transferred to ${a.newOwnerNodeId}` : "None",
      },
      {
        name: "didOperatorSeeFailure",
        question: "Did the operator see the failure?",
        passed: a.didOperatorSeeFailure === true && (a.operatorNotificationLatencyMs ?? 0) <= 2000,
        expected: "true (latency <= 2000ms)",
        actual: a.didOperatorSeeFailure ? `Notified in ${a.operatorNotificationLatencyMs}ms` : "false",
      },
      {
        name: "wasIncidentRecorded",
        question: "Was the incident recorded?",
        passed: a.wasIncidentRecorded === true && Boolean(a.incidentId),
        expected: "true (with valid incidentId)",
        actual: a.wasIncidentRecorded ? `Recorded: ${a.incidentId}` : "false",
      },
    ];

    const allPassed = checks.every((c) => c.passed);
    return {
      passed: allPassed,
      assertionChecks: checks,
    };
  }

  private getMaxAllowedLostSeconds(scenario: ChaosScenarioType): number {
    switch (scenario) {
      case "KILL_RECORDING_SERVICE":
        return 3.0; // Fast supervisor restart < 3s
      case "DISCONNECT_CAMERA":
        return 10.0; // Limited by physical disconnect duration
      case "CHANGE_CAMERA_PASSWORD":
        return 5.0; // Re-auth reconciliation < 5s
      case "REMOVE_STORAGE":
        return 2.0; // Storage target failover < 2s
      case "CORRUPT_SEGMENT":
        return 2.0; // Keyframe fallback < 2s
      case "KILL_REDIS":
      case "KILL_POSTGRES":
      case "REBOOT_NVR":
      case "FILL_DISK":
      case "ADD_PACKET_LOSS":
      case "ADD_LATENCY":
      case "DISCONNECT_BRANCH_WAN":
      case "KILL_MEDIA_SERVER":
        return 0.5; // Seamless failovers must lose near-zero seconds
      default:
        return 5.0;
    }
  }

  private isOwnershipTransferRequired(scenario: ChaosScenarioType): boolean {
    switch (scenario) {
      case "KILL_RECORDING_SERVICE":
      case "KILL_REDIS":
      case "KILL_POSTGRES":
      case "REBOOT_NVR":
      case "FILL_DISK":
      case "REMOVE_STORAGE":
      case "DISCONNECT_BRANCH_WAN":
      case "KILL_MEDIA_SERVER":
        return true;
      default:
        return false;
    }
  }
}

export const resiliencyAssessorService = new ResiliencyAssessorService();
