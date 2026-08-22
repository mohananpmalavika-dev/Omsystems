import { describe, expect, it } from "vitest";
import { EdgeResourceSampler } from "../src/monitoring/edge-resource-probe.js";

describe("edge resource sampler", () => {
  it("reports real interval CPU, memory, and filesystem utilization", async () => {
    const snapshots = [{ idle: 80, total: 100 }, { idle: 100, total: 200 }];
    const sampler = new EdgeResourceSampler({
      cpuSnapshot: () => snapshots.shift() ?? { idle: 100, total: 200 },
      memorySnapshot: () => ({ free: 75, total: 100 }),
      diskSnapshot: async () => ({ blocks: 100, availableBlocks: 75, blockSize: 4096 }),
    });
    const first = await sampler.sample("/");
    const second = await sampler.sample("/");
    expect(first.cpuUsedPercent).toBeNull();
    expect(first.reasonCodes).toContain("cpu_utilization_warming_up");
    expect(second).toMatchObject({ cpuUsedPercent: 80, memoryUsedPercent: 25, diskUsedPercent: 25, diskFreeBytes: 307_200 });
  });
});
