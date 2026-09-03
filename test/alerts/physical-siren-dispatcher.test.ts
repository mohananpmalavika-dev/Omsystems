import { describe, expect, it, vi } from "vitest";
import type { ControlPlaneStore } from "../../src/control-plane-store.js";
import { queuePhysicalSiren } from "../../src/alerts/physical-siren-dispatcher.js";

describe("physical siren alert dispatch", () => {
  it("queues one branch command for every alert severity", async () => {
    const createEdgeCommand = vi.fn(async (input: any) => ({ id: `command-${input.payload.alertId}`, ...input }));
    const store = {
      getCamera: vi.fn(async () => ({ id: "camera-1", branchId: "branch-1", edgeAgentId: "edge-1" })),
      getNode: vi.fn(async () => ({ id: "branch-1", tenantId: "tenant-1" })),
      listEdgeAgentsByBranch: vi.fn(async () => [{
        id: "edge-1", status: "online", credentialStatus: "active", version: "0.1.18",
      }]),
      createEdgeCommand,
    } as unknown as ControlPlaneStore;

    for (const severity of ["P1", "P2", "P3", "P4", "P5"]) {
      const result = await queuePhysicalSiren(store, {
        alertId: `alert-${severity}`,
        tenantId: "tenant-1",
        cameraId: "camera-1",
        severity,
        detectionType: "test-alert",
        occurredAt: "2026-09-04T10:00:00.000Z",
      });
      expect(result.queued).toBe(true);
    }

    expect(createEdgeCommand).toHaveBeenCalledTimes(5);
    expect(createEdgeCommand).toHaveBeenLastCalledWith(expect.objectContaining({
      edgeAgentId: "edge-1",
      type: "trigger-siren",
      requestedBy: "system:alert-siren",
      payload: expect.objectContaining({ alertId: "alert-P5", severity: "P5" }),
    }));
  });

  it("does not route an alert across tenant boundaries", async () => {
    const createEdgeCommand = vi.fn();
    const store = {
      getCamera: vi.fn(async () => ({ id: "camera-1", branchId: "branch-1" })),
      getNode: vi.fn(async () => ({ id: "branch-1", tenantId: "another-tenant" })),
      createEdgeCommand,
    } as unknown as ControlPlaneStore;

    await expect(queuePhysicalSiren(store, {
      alertId: "alert-1",
      tenantId: "tenant-1",
      cameraId: "camera-1",
      severity: "P1",
      detectionType: "intrusion",
      occurredAt: "2026-09-04T10:00:00.000Z",
    })).resolves.toEqual({ queued: false, reason: "tenant_mismatch" });
    expect(createEdgeCommand).not.toHaveBeenCalled();
  });
});
