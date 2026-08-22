/**
 * Control Room Alert Audio Subsystem - Automated Verification Test Runner
 */

import {
  ALERT_AUDIO_POLICIES,
  ALERT_PRIORITIES,
  AlertAudioService,
  type AlertSeverity,
} from "../../dashboard/services/alert-audio/index.js";
import { app } from "../../src/app.js";

async function runAlertAudioTests() {
  console.log("================================================================================");
  console.log("  CONTROL ROOM ALERT AUDIO SUBSYSTEM - COMPREHENSIVE VERIFICATION RUNNER");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string, extra?: unknown) {
    if (condition) {
      console.log(`  [PASS] ${description}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${description}`);
      if (extra !== undefined) console.error(`         Details:`, extra);
      failed++;
    }
  }

  const audioService = new AlertAudioService();

  // Suite 1: Audio State Model & Autoplay Invariant
  console.log("Suite 1: Audio State Model & Autoplay Invariant");
  const initialStatus = audioService.getAudioStatus();
  assert(initialStatus.state === "LOCKED", "Initial audio state is LOCKED (enforces browser gesture invariant)");
  assert(initialStatus.enabled === false, "Audio is initially not enabled");

  // Suite 2: Severity Policies & Volume Multipliers
  console.log("\nSuite 2: Severity Policies & Volume Multipliers");
  const p1Policy = ALERT_AUDIO_POLICIES.P1;
  assert(p1Policy.volumeMultiplier === 1.0, "P1 volume multiplier is 1.0 (Full Volume)");
  assert(p1Policy.repeatIntervalMs === 15_000, "P1 repeats every 15,000ms (15s)");
  assert(p1Policy.allowPermanentMute === false, "P1 permanently muting is DISALLOWED (safety invariant)");
  assert(p1Policy.stopOnAcknowledge === true, "P1 stops immediately on acknowledgement");

  const p2Policy = ALERT_AUDIO_POLICIES.P2;
  assert(p2Policy.volumeMultiplier === 0.8, "P2 volume multiplier is 0.8");
  assert(p2Policy.repeatIntervalMs === 60_000, "P2 repeats every 60s");
  assert(p2Policy.maxRepeats === 5, "P2 bounded by max 5 repeats");

  const p3Policy = ALERT_AUDIO_POLICIES.P3;
  assert(p3Policy.repeatIntervalMs === undefined, "P3 does not repeat indefinitely");
  assert(p3Policy.maxRepeats === 1, "P3 plays exactly once");

  // Suite 3: Priority Arbitration
  console.log("\nSuite 3: Priority Arbitration & Severity Ranking");
  assert(ALERT_PRIORITIES.P1 > ALERT_PRIORITIES.P2, "P1 priority (4) > P2 priority (3)");
  assert(ALERT_PRIORITIES.P2 > ALERT_PRIORITIES.P3, "P2 priority (3) > P3 priority (2)");
  assert(ALERT_PRIORITIES.P3 > ALERT_PRIORITIES.P4, "P3 priority (2) > P4 priority (1)");

  // Suite 4: Multi-Alert Coalescing & Deduplication
  console.log("\nSuite 4: Multi-Alert Coalescing & Deduplication");
  await audioService.playAlert({ alertId: "alt-p1-01", severity: "P1", title: "Intrusion Vault" });
  await audioService.playAlert({ alertId: "alt-p1-02", severity: "P1", title: "Panic Button Cash Desk" });
  await audioService.playAlert({ alertId: "alt-p1-03", severity: "P1", title: "Perimeter Breach" });

  const statusAfter3P1 = audioService.getAudioStatus();
  assert(statusAfter3P1.activeP1Count === 3, "Tracks 3 active unacknowledged P1 alerts");
  assert(statusAfter3P1.highestAudibleSeverity === "P1", "Highest audible severity is P1");

  // Suite 5: Acknowledgement Stoppage & Lifecycle Synchronization
  console.log("\nSuite 5: Acknowledgement Stoppage & Lifecycle Synchronization");
  audioService.stopAlert("alt-p1-01");
  const statusAfterAck1 = audioService.getAudioStatus();
  assert(statusAfterAck1.activeP1Count === 2, "Active P1 count decrements to 2 on ACK");

  audioService.stopAlert("alt-p1-02");
  audioService.stopAlert("alt-p1-03");
  const statusAfterAllAck = audioService.getAudioStatus();
  assert(statusAfterAllAck.activeP1Count === 0, "Active P1 count reaches 0 when all alerts acknowledged");
  assert(statusAfterAllAck.highestAudibleSeverity === null, "Highest audible severity resets to null");

  // Suite 6: Temporary Silence vs Permanent Mute Protection
  console.log("\nSuite 6: Temporary Silence vs Permanent Mute Protection");
  audioService.silenceTemporarily(30);
  const statusSilenced = audioService.getAudioStatus();
  assert(statusSilenced.temporarySilenceUntil !== undefined, "Sets temporary silence expiration timestamp");
  const silenceExpiry = new Date(statusSilenced.temporarySilenceUntil!).getTime();
  assert(silenceExpiry > Date.now() + 25_000, "Silence window is 30 seconds");

  // Suite 7: REST API Endpoints Verification
  console.log("\nSuite 7: REST API Endpoints Verification");
  await app.ready();

  const auditResp = await app.inject({
    method: "POST",
    url: "/api/v1/alerts/audio/audit",
    payload: {
      userId: "OP-104",
      action: "AUDIO_TESTED",
      severityTested: "P1",
      workstationId: "HO-Console-01",
    },
  });
  assert(auditResp.statusCode === 201, "POST /api/v1/alerts/audio/audit returns 201 Created");
  const auditBody = JSON.parse(auditResp.body).data;
  assert(auditBody.action === "AUDIO_TESTED", "Audit record stores AUDIO_TESTED action");
  assert(auditBody.severityTested === "P1", "Audit record stores P1 severity test");

  const statusResp = await app.inject({
    method: "GET",
    url: "/api/v1/alerts/audio/status",
  });
  assert(statusResp.statusCode === 200, "GET /api/v1/alerts/audio/status returns 200 OK");
  const statusData = JSON.parse(statusResp.body).data;
  assert(statusData.consoles.length >= 4, "Returns fleet operator console audio health statuses");
  assert(statusData.consoles[0].audioState === "READY", "Console HO-01 audio state is READY");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAlertAudioTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
