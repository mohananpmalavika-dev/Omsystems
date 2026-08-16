import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface InstanceLockResult {
  acquired: boolean;
  lockPath: string;
  existingPid?: number;
  release: () => void;
}

interface LockFilePayload {
  pid: number;
  startedAt: string;
  executable: string;
  updatedAt: string;
}

/**
 * Checks if a process with the given PID is currently active.
 */
export function isPidRunning(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    // Sending signal 0 checks for process existence without killing it.
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    // ESRCH means no such process exists.
    // EPERM means the process exists but we lack permission to send signals to it (still running).
    return error?.code === "EPERM";
  }
}

const activeHeldLocks = new Set<string>();

/**
 * Acquires a single-instance lock for the Edge Agent.
 * If another instance is running, returns acquired: false with the existing PID.
 */
export function acquireSingleInstanceLock(homeDirectory: string): InstanceLockResult {
  const dataDir = join(homeDirectory, "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const lockPath = join(dataDir, "edge-agent.lock");

  if (activeHeldLocks.has(lockPath)) {
    return {
      acquired: false,
      lockPath,
      existingPid: process.pid,
      release: () => {},
    };
  }

  // Check existing lock
  if (existsSync(lockPath)) {
    try {
      const content = readFileSync(lockPath, "utf8");
      const data: LockFilePayload = JSON.parse(content);
      if (data.pid && isPidRunning(data.pid)) {
        return {
          acquired: false,
          lockPath,
          existingPid: data.pid,
          release: () => {},
        };
      }
    } catch {
      // Invalid or corrupted lockfile; will be overwritten
    }
  }

  // Write new lock
  const payload: LockFilePayload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    executable: process.execPath,
    updatedAt: new Date().toISOString(),
  };

  try {
    writeFileSync(lockPath, JSON.stringify(payload, null, 2), { encoding: "utf8", flag: "w" });
    activeHeldLocks.add(lockPath);
  } catch (err) {
    console.error("[InstanceLock] Warning: Could not write lockfile:", err);
  }

  // Periodic heartbeat update on the lock file
  const heartbeatTimer = setInterval(() => {
    try {
      if (existsSync(lockPath)) {
        payload.updatedAt = new Date().toISOString();
        writeFileSync(lockPath, JSON.stringify(payload, null, 2), "utf8");
      }
    } catch {}
  }, 15_000);
  heartbeatTimer.unref();

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeHeldLocks.delete(lockPath);
    clearInterval(heartbeatTimer);
    try {
      if (existsSync(lockPath)) {
        const content = readFileSync(lockPath, "utf8");
        const data: LockFilePayload = JSON.parse(content);
        if (data.pid === process.pid) {
          unlinkSync(lockPath);
        }
      }
    } catch {}
  };

  process.once("exit", release);
  process.once("SIGINT", () => {
    release();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    release();
    process.exit(0);
  });

  return {
    acquired: true,
    lockPath,
    release,
  };
}
