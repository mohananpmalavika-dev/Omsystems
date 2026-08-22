import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireSingleInstanceLock, isPidRunning } from "../src/security/instance-lock.js";

describe("Single Instance Lock for Edge Agent", () => {
  it("verifies current process PID is running", () => {
    expect(isPidRunning(process.pid)).toBe(true);
    expect(isPidRunning(999999999)).toBe(false);
  });

  it("acquires single instance lock and blocks duplicate instances", () => {
    const testDir = mkdtempSync(join(tmpdir(), "sentinel-instance-lock-"));
    try {
      const first = acquireSingleInstanceLock(testDir);
      expect(first.acquired).toBe(true);

      // Second attempt while first is holding lock
      const second = acquireSingleInstanceLock(testDir);
      expect(second.acquired).toBe(false);
      expect(second.existingPid).toBe(process.pid);

      // Release first
      first.release();

      // Third attempt after release
      const third = acquireSingleInstanceLock(testDir);
      expect(third.acquired).toBe(true);
      third.release();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
