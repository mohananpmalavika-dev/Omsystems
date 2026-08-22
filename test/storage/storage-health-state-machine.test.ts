import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorageProvider } from "../../src/storage/providers/local-disk-storage.provider.js";
import { SanStorageProvider } from "../../src/storage/providers/san-storage.provider.js";

describe("Storage Health State Machine Suite", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "vms-health-test-"));
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("evaluates HEALTHY state under normal operational parameters", async () => {
    const local = new LocalDiskStorageProvider({
      nodeId: "local-01",
      basePath: join(tempDir, "local-01"),
      simulatedCapacityBytes: 1_000_000_000,
      simulatedUsedBytes: 200_000_000, // 20%
    });

    const health = await local.health();
    expect(health.healthState).toBe("HEALTHY");
    expect(health.usagePercent).toBe(20);
  });

  it("transitions to DEGRADED state on SMART pre-fail / excessive bad sectors", async () => {
    const local = new LocalDiskStorageProvider({
      nodeId: "local-02",
      basePath: join(tempDir, "local-02"),
      mockSmart: {
        overallStatus: "failed",
        reallocatedSectors: 180,
        pendingSectors: 24,
        uncorrectableSectors: 12,
        readErrors: 45,
        writeErrors: 10,
        interfaceCrcErrors: 3,
      },
    });

    const health = await local.health();
    expect(health.healthState).toBe("DEGRADED");
    expect(health.warnings.length).toBeGreaterThan(0);
  });

  it("transitions to DEGRADED state on SAN multipath link failure", async () => {
    const san = new SanStorageProvider({
      nodeId: "san-01",
      volumeMountPath: join(tempDir, "san-01"),
      multipathActivePaths: 2,
      multipathTotalPaths: 4, // 2 paths down
    });

    const health = await san.health();
    expect(health.healthState).toBe("DEGRADED");
    expect(health.warnings.some((w) => w.includes("multipath degraded"))).toBe(true);
  });

  it("transitions to FULL state when disk usage reaches >= 95%", async () => {
    const local = new LocalDiskStorageProvider({
      nodeId: "local-03",
      basePath: join(tempDir, "local-03"),
      simulatedCapacityBytes: 1_000_000_000,
      simulatedUsedBytes: 960_000_000, // 96%
    });

    const health = await local.health();
    expect(health.healthState).toBe("FULL");
    expect(health.usagePercent).toBe(96);
  });

  it("transitions to READ_ONLY state when forced or filesystem is locked", async () => {
    const local = new LocalDiskStorageProvider({
      nodeId: "local-04",
      basePath: join(tempDir, "local-04"),
      forceReadOnly: true,
    });

    const health = await local.health();
    expect(health.healthState).toBe("READ_ONLY");

    // Write should be rejected
    await expect(
      local.writeSegment("cam-01/test.mkv", Buffer.from("data")),
    ).rejects.toThrow("READ_ONLY");
  });

  it("transitions to REBUILDING state when RAID array is syncing", async () => {
    const local = new LocalDiskStorageProvider({
      nodeId: "local-05",
      basePath: join(tempDir, "local-05"),
      mockRaid: {
        status: "rebuilding",
        level: "RAID6",
        memberDisks: ["/dev/sda", "/dev/sdb", "/dev/sdc", "/dev/sdd"],
        failedMembers: ["/dev/sdb"],
        rebuildProgressPercent: 42.5,
      },
    });

    const health = await local.health();
    expect(health.healthState).toBe("REBUILDING");
    expect(health.raid?.rebuildProgressPercent).toBe(42.5);
  });

  it("transitions to OFFLINE state when node is unreachable", async () => {
    const local = new LocalDiskStorageProvider({
      nodeId: "local-06",
      basePath: join(tempDir, "local-06"),
      forceOffline: true,
    });

    const health = await local.health();
    expect(health.healthState).toBe("OFFLINE");
    expect(health.errors.length).toBeGreaterThan(0);

    // All read/write operations fail
    await expect(
      local.writeSegment("cam-01/test.mkv", Buffer.from("data")),
    ).rejects.toThrow("OFFLINE");
  });
});
