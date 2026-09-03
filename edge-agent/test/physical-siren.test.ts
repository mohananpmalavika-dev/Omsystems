import { describe, expect, it, vi } from "vitest";
import {
  PhysicalSirenController,
  physicalSirenTriggerFromPayload,
} from "../src/alerts/physical-siren.js";

const alert = {
  alertId: "alert-001",
  branchId: "branch-001",
  severity: "P4",
  detectionType: "motion",
  occurredAt: "2026-09-04T10:00:00.000Z",
};

describe("physical siren controller", () => {
  it("pulses the relay for every alert severity and includes alert context", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const controller = new PhysicalSirenController({
      enabled: true,
      onUrl: "http://192.168.1.50/relay/on",
      offUrl: "http://192.168.1.50/relay/off",
      method: "POST",
      authToken: "relay-token",
      pulseMs: 5_000,
      timeoutMs: 2_000,
    }, fetcher, async () => undefined);

    for (const severity of ["P1", "P2", "P3", "P4", "P5"]) {
      await controller.trigger({ ...alert, alertId: `alert-${severity}`, severity });
    }

    expect(calls).toHaveLength(10);
    expect(calls[0]?.url).toBe("http://192.168.1.50/relay/on");
    expect(calls[1]?.url).toBe("http://192.168.1.50/relay/off");
    expect(calls[0]?.init.headers).toMatchObject({ authorization: "Bearer relay-token" });
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      action: "siren",
      state: "on",
      alertId: "alert-P1",
      severity: "P1",
      pulseMs: 5_000,
    });
  });

  it("does not pulse twice for the same alert", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;
    const controller = new PhysicalSirenController({
      enabled: true,
      onUrl: "http://relay.local/on",
      offUrl: "http://relay.local/off",
      method: "GET",
      pulseMs: 500,
      timeoutMs: 2_000,
    }, fetcher, async () => undefined);

    expect((await controller.trigger(alert)).triggered).toBe(true);
    expect(await controller.trigger(alert)).toMatchObject({
      triggered: false,
      reason: "duplicate_alert",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the relay is disabled or the payload is incomplete", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;
    const controller = new PhysicalSirenController({
      enabled: false,
      method: "POST",
      pulseMs: 500,
      timeoutMs: 2_000,
    }, fetcher, async () => undefined);

    await expect(controller.trigger(alert)).rejects.toThrow("physical_siren_disabled");
    expect(() => physicalSirenTriggerFromPayload({ alertId: "alert-001" }))
      .toThrow("physical_siren_branchId_required");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
