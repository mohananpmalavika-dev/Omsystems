import { describe, expect, it, vi } from "vitest";
import { NotificationService } from "../src/notifications/application/notification.service.js";

describe("NotificationService destinations", () => {
  it("does not enqueue external notifications for recipients without configured destinations", async () => {
    const enqueue = vi.fn(async (input) => input);
    const service = new NotificationService(
      { evaluate: () => ({ channels: ["email", "sms", "voice", "push", "dashboard"] }) } as never,
      { resolve: async () => [{ userId: "user-1", name: "Unprovisioned operator" }] } as never,
      { render: () => ({}) } as never,
      { enqueue } as never,
      { processBatch: vi.fn() } as never,
    );

    const jobs = await service.notifyAlert({
      tenantId: "tenant-1", alertId: "alert-1", priority: "P1",
    } as never, false);

    expect(jobs).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      channel: "dashboard",
      destination: "control-room-websocket",
    }));
  });
});
