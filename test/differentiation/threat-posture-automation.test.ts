import { describe, it, expect } from "vitest";
import {
  ThreatPostureAutomationService,
  POSTURE_PROFILES,
} from "../../src/threat-posture/services/threat-posture-automation.service.js";

describe("Threat-Level Automation & Dynamic Posture (Phase 36)", () => {
  it("defaults to GREEN posture profile with standard 15fps and 90-day retention", () => {
    const service = new ThreatPostureAutomationService();
    const config = service.getCurrentPosture("BR-001");

    expect(config.postureLevel).toBe("GREEN");
    expect(config.recordingFps).toBe(15);
    expect(config.recordingBitrateKbps).toBe(1024);
    expect(config.retentionDays).toBe(90);
    expect(config.wallDispatchPriority).toBe(false);
    expect(config.doorsLockdown).toBe(false);
  });

  it("escalates branch to RED on P1 incident with automated recording boost and video wall dispatch", async () => {
    const service = new ThreatPostureAutomationService();

    const record = await service.evaluateIncidentForAutoEscalation(
      "bank-alpha",
      "BR-001",
      "P1",
      "VAULT_INTRUSION",
      "inc-vault-991"
    );

    expect(record).not.toBeNull();
    expect(record?.postureLevel).toBe("RED");
    expect(record?.executedActions).toContain("BOOST_RECORDING_FPS_30");
    expect(record?.executedActions).toContain("BOOST_BITRATE_4096K");
    expect(record?.executedActions).toContain("EXTEND_RETENTION_180D");
    expect(record?.executedActions).toContain("DISPATCH_TO_EMERGENCY_VIDEO_WALL");

    const current = service.getCurrentPosture("BR-001");
    expect(current.postureLevel).toBe("RED");
    expect(current.retentionDays).toBe(180);
    expect(current.wallDispatchPriority).toBe(true);
  });

  it("triggers BLACK posture with complete door lockdown upon PANIC_BUTTON or ARMED_ROBBERY", async () => {
    const service = new ThreatPostureAutomationService();

    const record = await service.evaluateIncidentForAutoEscalation(
      "bank-alpha",
      "BR-002",
      "P1",
      "ARMED_ROBBERY",
      "inc-robbery-001"
    );

    expect(record).not.toBeNull();
    expect(record?.postureLevel).toBe("BLACK");
    expect(record?.executedActions).toContain("INITIATE_DOORS_LOCKDOWN");
    expect(record?.executedActions).toContain("EXTEND_RETENTION_365D");

    const current = service.getCurrentPosture("BR-002");
    expect(current.doorsLockdown).toBe(true);
    expect(current.retentionDays).toBe(365);
    expect(current.recordingBitrateKbps).toBe(6144);
  });
});
