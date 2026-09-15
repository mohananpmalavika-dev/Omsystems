import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface InstanceLockResult {
  acquired: boolean;
  lockPath: string;
  existingPid?: number;
  release: () => void;
}

export function isPidRunning(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function reclaimDeadOwner(lockPath: string): boolean {
  // Serialize stale-lock removal so two recovering processes cannot unlink
  // a new owner's lock based on the same obsolete PID.
  const recoveryPath = `${lockPath}.reclaim`;
  try { writeFileSync(recoveryPath, String(process.pid), { flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    const current = JSON.parse(readFileSync(lockPath, "utf8"));
    if (!Number.isSafeInteger(current.pid) || current.pid <= 0 || isPidRunning(current.pid)) return false;
    unlinkSync(lockPath);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  } finally {
    unlinkSync(recoveryPath);
  }
}

/** Exclusive creation prevents simultaneous launches from both claiming the lock. */
export function acquireSingleInstanceLock(homeDirectory: string): InstanceLockResult {
  const dataDir = join(homeDirectory, "data");
  mkdirSync(dataDir, { recursive: true });
  const lockPath = join(dataDir, "edge-agent.lock");
  const payload = JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
    executable: process.execPath,
  }, null, 2);

  for (let attempt = 0; ; attempt++) {
    try {
      writeFileSync(lockPath, payload, { encoding: "utf8", flag: "wx" });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // A partial or inaccessible lock is not proof of a dead owner.
      let existingPid: number | undefined;
      let stale = false;
      try {
        const existing = JSON.parse(readFileSync(lockPath, "utf8"));
        if (Number.isSafeInteger(existing.pid) && existing.pid > 0) {
          existingPid = existing.pid;
          stale = !isPidRunning(existing.pid);
        }
      } catch { /* Fail closed while another process writes its lock. */ }
      if (!stale || attempt > 0 || !reclaimDeadOwner(lockPath)) {
        return { acquired: false, lockPath, ...(existingPid === undefined ? {} : { existingPid }), release: () => {} };
      }
    }
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.off("exit", release);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    try {
      if (readFileSync(lockPath, "utf8") === payload) unlinkSync(lockPath);
    } catch { /* The lock may already have been removed during shutdown. */ }
  };
  const onSignal = () => { release(); process.exit(0); };
  process.once("exit", release);
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  return { acquired: true, lockPath, release };
}
