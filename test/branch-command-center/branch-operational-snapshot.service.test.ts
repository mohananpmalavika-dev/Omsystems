import { describe, it, expect, beforeEach } from "vitest";
import { BranchOperationalSnapshotService } from "../../src/services/branch-operational-snapshot.service.js";
import { MemoryStore } from "../../src/store.js";

describe("BranchOperationalSnapshotService", () => {
  let store: MemoryStore;
  let service: BranchOperationalSnapshotService;

  beforeEach(() => {
    store = new MemoryStore();
    service = new BranchOperationalSnapshotService(store);
  });

  it("calculates comprehensive operational snapshot for a branch", async () => {
    const tenantId = "tenant-test";
    const branchId = "branch-178";

    // Setup branch node
    store.nodes.set(branchId, {
      id: branchId,
      tenantId,
      name: "Branch 178 — Aluva",
      code: "BR-178",
      type: "branch",
      parentId: null,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const snapshot = await service.getSnapshot(tenantId, branchId);
    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    expect(snapshot.branchId).toBe(branchId);
    expect(snapshot.branchName).toBe("Branch 178 — Aluva");
    expect(snapshot.branchCode).toBe("BR-178");
    expect(snapshot.overallState).toBeDefined();
    expect(snapshot.healthScore).toBeGreaterThanOrEqual(0);
    expect(snapshot.healthScore).toBeLessThanOrEqual(100);

    // Check KPI domains
    expect(snapshot.cameras).toBeDefined();
    expect(snapshot.cameras.total).toBe(16);
    expect(snapshot.recorders).toBeDefined();
    expect(snapshot.recorders.total).toBeGreaterThanOrEqual(1);
    expect(snapshot.storage).toBeDefined();
    expect(snapshot.storage.disks.total).toBeGreaterThanOrEqual(1);
    expect(snapshot.retention).toBeDefined();
    expect(snapshot.retention.requiredDays).toBe(90);
    expect(snapshot.network).toBeDefined();
    expect(snapshot.network.primaryWan.state).toBe("ONLINE");
    expect(snapshot.alerts).toBeDefined();
    expect(snapshot.telemetryFreshness).toBe("CURRENT");
  });

  it("identifies critical reason codes explainable to operators", async () => {
    const tenantId = "tenant-test";
    const branchId = "branch-178";

    store.nodes.set(branchId, {
      id: branchId,
      tenantId,
      name: "Branch 178 — Aluva",
      code: "BR-178",
      type: "branch",
      parentId: null,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const snapshot = await service.getSnapshot(tenantId, branchId);
    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    expect(snapshot.reasons.length).toBeGreaterThan(0);
    expect(snapshot.reasonCodes).toContain("CAMERA_NOT_RECORDING");
    expect(snapshot.reasonCodes).toContain("RETENTION_VIOLATION");
    expect(snapshot.overallState).toBe("CRITICAL");
  });
});
