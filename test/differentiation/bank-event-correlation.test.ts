import { describe, it, expect } from "vitest";
import { BankEventCorrelationService } from "../../src/correlation/services/bank-event-correlation.service.js";

describe("Bank-Specific Event Correlation Engine (Phase 32)", () => {
  it("correlates ATM tamper vibration breach and loitering into P1 alert", async () => {
    const engine = new BankEventCorrelationService();

    const alert = await engine.evaluateEvent({
      tenantId: "bank-corp",
      branchId: "BR-012",
      category: "ATM_TAMPER",
      cameraIds: ["CAM-ATM-FACIAL", "CAM-ATM-ENCLOSURE"],
      sensorReadings: { tamperFired: true, vibrationExceeded: true },
      dwellTimeSeconds: 140,
      motionDetected: true,
    });

    expect(alert).not.toBeNull();
    expect(alert?.severity).toBe("P1");
    expect(alert?.ruleCode).toBe("BANK_CORR_ATM_001");
    expect(alert?.evidenceCaptureTriggered).toBe(true);
    expect(alert?.correlatedSources.triggers).toContain("VIBRATION_SENSOR_BREACH");
  });

  it("detects vault optical motion while physical door sensor indicates closed", async () => {
    const engine = new BankEventCorrelationService();

    const alert = await engine.evaluateEvent({
      tenantId: "bank-corp",
      branchId: "BR-012",
      category: "VAULT_INTRUSION",
      cameraIds: ["CAM-VAULT-INTERIOR"],
      doorStates: { vaultDoor: "LOCKED" },
      motionDetected: true,
      isAfterHours: true,
    });

    expect(alert).not.toBeNull();
    expect(alert?.severity).toBe("P1");
    expect(alert?.title).toContain("Unscheduled Optical Motion");
    expect(alert?.correlatedSources.triggers).toContain("VAULT_OPTICAL_MOTION");
    expect(alert?.correlatedSources.triggers).toContain("DOOR_SENSOR_MISMATCH");
    expect(alert?.correlatedSources.triggers).toContain("AFTER_HOURS_WINDOW");
  });

  it("detects cash van SOP route violation when transit sequence skips stages", async () => {
    const engine = new BankEventCorrelationService();

    // Van went directly from PERIMETER into STRONGROOM skipping ENTRANCE and CASH_BAY
    const alert = await engine.evaluateEvent({
      tenantId: "bank-corp",
      branchId: "BR-012",
      category: "CASH_VAN_SOP",
      cameraIds: ["CAM-PERIMETER-01", "CAM-STRONGROOM-01"],
      transitSequence: ["PERIMETER", "STRONGROOM", "ENTRANCE"], // out-of-order / broken
      dwellTimeSeconds: 400,
    });

    expect(alert).not.toBeNull();
    expect(alert?.severity).toBe("P1");
    expect(alert?.ruleCode).toBe("BANK_CORR_VAN_003");
    expect(alert?.correlatedSources.triggers).toContain("SOP_PATH_VIOLATION");
  });

  it("detects after-hours strongroom breach outside business hours", async () => {
    const engine = new BankEventCorrelationService();

    const alert = await engine.evaluateEvent({
      tenantId: "bank-corp",
      branchId: "BR-012",
      category: "AFTER_HOURS_STRONGROOM",
      cameraIds: ["CAM-STRONGROOM-INTERIOR"],
      isAfterHours: true,
      motionDetected: true,
    });

    expect(alert).not.toBeNull();
    expect(alert?.severity).toBe("P1");
    expect(alert?.ruleCode).toBe("BANK_CORR_STRONGROOM_004");
  });
});
