import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { SmbStorageBackend } from "../../recording-engine/src/backends/smb-storage.backend.js";

const TEST_DIR = join(process.cwd(), "test-scratch", `test-smb-${Date.now()}`);

describe("SMB / CIFS Storage Backend & Reconnect State Machine", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("initializes with mounted or UNC configuration", () => {
    const smb = new SmbStorageBackend({
      id: "node-smb-test",
      recordingRoot: TEST_DIR,
      smbConfig: {
        mode: "MOUNTED",
        mountPath: TEST_DIR,
        host: "smb-server.local",
        share: "recordings",
      },
    });

    expect(smb.type).toBe("smb");
    expect(smb.getConnectionState()).toBe("CONNECTED");
  });

  it("executes write probe successfully on connected share", async () => {
    const smb = new SmbStorageBackend({
      id: "node-smb-test-2",
      recordingRoot: TEST_DIR,
      smbConfig: {
        mode: "MOUNTED",
        mountPath: TEST_DIR,
      },
    });

    const probe = await smb.runWriteProbe();
    expect(probe.status).toBe("passed");
    expect(probe.latencyMs).toBeGreaterThanOrEqual(0);
    expect(probe.checksum).toHaveLength(64);
  });

  it("transitions connection state and attempts reconnection with probe verification", async () => {
    const smb = new SmbStorageBackend({
      id: "node-smb-test-3",
      recordingRoot: TEST_DIR,
      smbConfig: {
        mode: "MOUNTED",
        mountPath: TEST_DIR,
      },
    });

    // Reconnection verifies probe and restores CONNECTED
    const success = await smb.attemptReconnect();
    expect(success).toBe(true);
    expect(smb.getConnectionState()).toBe("CONNECTED");
  });
});
