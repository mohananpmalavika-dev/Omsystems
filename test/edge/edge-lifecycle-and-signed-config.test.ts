import { describe, it, expect } from "vitest";
import { EdgeLifecycleService } from "../../src/edge/services/edge-lifecycle.service.js";
import { SignedConfigurationService } from "../../src/edge/services/signed-configuration.service.js";

describe("Edge Agent Lifecycle & Signed Configuration", () => {
  it("computes canary target rollout quotas properly", () => {
    const edge = new EdgeLifecycleService();
    const totalGateways = 400; // 400 branches

    expect(edge.computeCanaryTargets(totalGateways, "CANARY_5")).toBe(20);
    expect(edge.computeCanaryTargets(totalGateways, "CANARY_25")).toBe(100);
    expect(edge.computeCanaryTargets(totalGateways, "CANARY_50")).toBe(200);
    expect(edge.computeCanaryTargets(totalGateways, "GENERAL_100")).toBe(400);
  });

  it("triggers automatic rollback on failed health check during canary probe", async () => {
    const edge = new EdgeLifecycleService();

    const unhealthyHeartbeat = await edge.processHeartbeat({
      edgeId: "edge-branch-101",
      agentVersion: "2.5.0-rc1",
      cpuPercent: 98.5, // CPU spiked
      ramPercent: 95.0,
      diskPercent: 40.0,
      uptimeSeconds: 60,
      configVersion: 12,
      upgradeStatus: "HEALTH_CHECK",
      camerasOnline: 0, // All cameras down!
      camerasTotal: 16,
      recordingHealth: "CRITICAL",
      internetStatus: "CONNECTED",
      heartbeatAt: new Date(),
    });

    expect(unhealthyHeartbeat.nextAction).toBe("ROLLBACK");
  });

  it("cryptographically signs configuration and detects configuration drift", () => {
    const configService = new SignedConfigurationService();

    const desiredConfig = configService.signConfiguration({
      edgeId: "edge-branch-101",
      version: 34,
      payload: {
        nvrIp: "10.0.14.50",
        resolution: "1080P",
        fps: 25,
        bitrateKbps: 4096,
      },
      signerIdentity: "security-architect@bank.internal",
    });

    expect(desiredConfig.signature).toBeDefined();
    expect(desiredConfig.payloadHash).toBeDefined();

    // Verify signature passes
    const isValid = configService.verifyConfigurationSignature(desiredConfig);
    expect(isValid).toBe(true);

    // Drift Detection: Edge is running version 32
    const driftCheck1 = configService.detectDrift(desiredConfig, {
      appliedVersion: 32,
    });
    expect(driftCheck1.isDrifted).toBe(true);
    expect(driftCheck1.status).toBe("DRIFTED");

    // Edge is running version 34 with identical hash
    const driftCheck2 = configService.detectDrift(desiredConfig, {
      appliedVersion: 34,
      actualPayloadHash: desiredConfig.payloadHash,
    });
    expect(driftCheck2.isDrifted).toBe(false);
    expect(driftCheck2.status).toBe("IN_SYNC");
  });
});
