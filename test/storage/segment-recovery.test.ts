import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { SegmentRecoveryService } from "../../recording-engine/src/recovery/segment-recovery.service.js";

const TEST_DIR = join(process.cwd(), "test-scratch", `test-recovery-${Date.now()}`);

describe("Segment Recovery Service", () => {
  let stagingDir: string;
  let quarantineDir: string;
  let recoveryService: SegmentRecoveryService;

  beforeEach(async () => {
    stagingDir = join(TEST_DIR, "staging");
    quarantineDir = join(TEST_DIR, "quarantine");
    await mkdir(stagingDir, { recursive: true });
    await mkdir(quarantineDir, { recursive: true });
    recoveryService = new SegmentRecoveryService(stagingDir, quarantineDir);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("recovers valid partial segments (> 1KB) and finalizes them", async () => {
    const validPartial = join(stagingDir, "seg-valid-01.mkv.partial");
    const validPayload = Buffer.alloc(2048, "VALID_MEDIA_STREAM_CONTENT");
    await writeFile(validPartial, validPayload);

    const summary = await recoveryService.runStartupRecovery();
    expect(summary.foundPartialCount).toBe(1);
    expect(summary.recoveredCount).toBe(1);
    expect(summary.finalizedCount).toBe(1);

    const recoveredItem = summary.items.find((i) => i.status === "FINALIZED");
    expect(recoveredItem).toBeDefined();
    expect(recoveredItem!.sizeBytes).toBe(2048);
    expect(recoveredItem!.sha256).toHaveLength(64);

    const stats = await stat(recoveredItem!.filePath);
    expect(stats.isFile()).toBe(true);
  });

  it("quarantines tiny corrupted fragments (< 1KB) without deleting them silently", async () => {
    const tinyPartial = join(stagingDir, "seg-corrupt-02.mkv.partial");
    const tinyPayload = Buffer.from("TINY_FRAGMENT");
    await writeFile(tinyPartial, tinyPayload);

    const summary = await recoveryService.runStartupRecovery();
    expect(summary.quarantinedCount).toBe(1);

    const quarantined = summary.items.find((i) => i.status === "QUARANTINED");
    expect(quarantined).toBeDefined();
    expect(quarantined!.details).toContain("quarantine");

    const stats = await stat(quarantined!.filePath);
    expect(stats.isFile()).toBe(true);
  });

  it("removes zero-byte abandoned partial files", async () => {
    const zeroByte = join(stagingDir, "seg-zero-03.mkv.partial");
    await writeFile(zeroByte, Buffer.alloc(0));

    const summary = await recoveryService.runStartupRecovery();
    expect(summary.unrecoverableCount).toBe(1);

    const item = summary.items.find((i) => i.status === "UNRECOVERABLE");
    expect(item).toBeDefined();
    expect(item!.sizeBytes).toBe(0);
  });
});
