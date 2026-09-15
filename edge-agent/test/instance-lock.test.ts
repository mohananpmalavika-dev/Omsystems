import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireSingleInstanceLock, isPidRunning } from "../src/security/instance-lock.js";

describe("Single Instance Lock for Edge Agent", () => {
  it("does not terminate or overwrite a live owner", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
    await once(child, "spawn");
    const testDir = mkdtempSync(join(tmpdir(), "sentinel-instance-lock-"));
    const dataDir = join(testDir, "data");
    mkdirSync(dataDir);
    const lockPath = join(dataDir, "edge-agent.lock");
    const payload = JSON.stringify({ pid: child.pid });
    writeFileSync(lockPath, payload);
    try {
      const result = acquireSingleInstanceLock(testDir);
      expect(result.acquired).toBe(false);
      expect(result.existingPid).toBe(child.pid);
      expect(isPidRunning(child.pid!)).toBe(true);
      expect(readFileSync(lockPath, "utf8")).toBe(payload);
    } finally {
      const exited = once(child, "exit");
      child.kill();
      await exited;
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("recovers a dead owner's lock but preserves an incomplete lock", () => {
    const testDir = mkdtempSync(join(tmpdir(), "sentinel-instance-lock-"));
    mkdirSync(join(testDir, "data"));
    const lockPath = join(testDir, "data", "edge-agent.lock");
    try {
      writeFileSync(lockPath, JSON.stringify({ pid: 999999999 }));
      const recovered = acquireSingleInstanceLock(testDir);
      expect(recovered.acquired).toBe(true);
      recovered.release();
      writeFileSync(lockPath, "{");
      expect(acquireSingleInstanceLock(testDir).acquired).toBe(false);
      expect(readFileSync(lockPath, "utf8")).toBe("{");
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

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
