import { describe, expect, it } from "vitest";
import { CAMERA_AI_RULE_BUNDLE, ensureCameraAiBundle } from "../src/analytics/camera-ai-bundle.js";

describe("banking camera AI bundle", () => {
  it("contains every catalogued banking alert with an enabled camera rule", () => {
    expect(CAMERA_AI_RULE_BUNDLE).toHaveLength(35);
    expect(CAMERA_AI_RULE_BUNDLE.filter((rule) => rule.name.startsWith("Banking AI -")).map((rule) => rule.detectionType)).toEqual([
      "person-in-vault-after-hours", "cash-counter-monitoring", "teller-presence",
      "vault-door-monitoring", "atm-queue", "atm-tampering", "atm-skimming",
      "cash-van-arrival", "strong-room-entry", "cash-tray-left-open", "dual-control-verification",
    ]);
  });

  it("creates missing banking rules and re-enables disabled ones idempotently", async () => {
    const rules = [{ id: "atm-rule", detectionType: "atm-tampering", enabled: false }];
    const store: any = {
      listAnalyticsRules: async () => rules,
      createAnalyticsRule: async (_tenantId: string, _cameraId: string, _createdBy: string | undefined, input: { detectionType: string; enabled: boolean }) => {
        rules.push({ id: input.detectionType, detectionType: input.detectionType, enabled: input.enabled });
      },
      updateAnalyticsRule: async (id: string, _tenantId: string, _cameraId: string, input: { enabled?: boolean }) => {
        const rule = rules.find((candidate) => candidate.id === id);
        if (rule && input.enabled !== undefined) rule.enabled = input.enabled;
      },
    };
    const first = await ensureCameraAiBundle(store, "tenant", "camera", "operator");
    expect(first).toMatchObject({ total: 35, created: 34, enabled: 1, unchanged: 0 });
    const second = await ensureCameraAiBundle(store, "tenant", "camera", "operator");
    expect(second).toMatchObject({ total: 35, created: 0, enabled: 0, unchanged: 35 });
  });
});
