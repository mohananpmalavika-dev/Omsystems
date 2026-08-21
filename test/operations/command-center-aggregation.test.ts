import { describe, expect, it } from "vitest";
import { unifiedOperationsService } from "../../src/operations/index.js";
import { MemoryStore } from "../../src/store.js";

describe("unified command center camera aggregation", () => {
  it("counts only authorized branches and classifies camera health without zero-value fallbacks", async () => {
    const store = new MemoryStore();
    const user = await store.getUser("user-branch-manager");
    expect(user).toBeDefined();

    const cameras = [...store.cameras.values()];
    cameras[0]!.status = "online";
    cameras[1]!.status = "offline";
    cameras[2]!.status = "degraded";
    cameras[3]!.status = "unknown";

    const branches = await unifiedOperationsService.getFleetBranchSummaries("tenant-default", store, user);
    expect(branches).toHaveLength(1);
    expect(branches[0]!.cameras).toMatchObject({
      total: 8,
      working: 5,
      healthy: 5,
      notWorking: 3,
      offline: 1,
      degraded: 1,
      unknown: 1,
    });

    const summary = await unifiedOperationsService.getCommandCenterSummary("tenant-default", store, user);
    expect(summary.branches.total).toBe(1);
    expect(summary.cameras).toMatchObject({ total: 8, working: 5, notWorking: 3 });
  });

  it("does not fall back to the full organization when a user has no live-view access", async () => {
    const store = new MemoryStore();
    const user = await store.getUser("user-evidence-officer");
    const branches = await unifiedOperationsService.getFleetBranchSummaries("tenant-default", store, user);

    expect(branches).toHaveLength(0);
  });
});
