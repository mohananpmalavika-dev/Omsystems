import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AlertEvidenceCaptureService } from "./alert-evidence-capture.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("AlertEvidenceCaptureService", () => {
  it("persists snapshot and clip evidence through a bounded queue", async () => {
    const root = await mkdtemp(join(tmpdir(), "sentinel-alert-evidence-"));
    roots.push(root);
    let active = 0;
    let maximumActive = 0;
    const service = new AlertEvidenceCaptureService(root, 1, async (_input, output) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await writeFile(output.snapshotPath, "jpeg");
      await writeFile(output.clipPath, "mp4");
      active -= 1;
    });
    const alertIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    await Promise.all(alertIds.map((alertId) => service.request({
      alertId, cameraId: "cam-001", occurredAt: new Date().toISOString(),
      sourceUri: "rtsp://secret:password@camera/live", clipSeconds: 20,
    })));
    await waitFor(async () => (await Promise.all(alertIds.map((id) => service.getStatus(id))))
      .every((status) => status?.state === "ready"));
    expect(maximumActive).toBe(1);
    expect((await service.openAsset(alertIds[0]!, "snapshot")).contentType).toBe("image/jpeg");
    expect((await service.openAsset(alertIds[0]!, "clip")).contentType).toBe("video/mp4");
  });

  it("redacts camera credentials from persisted capture failures", async () => {
    const root = await mkdtemp(join(tmpdir(), "sentinel-alert-evidence-"));
    roots.push(root);
    const sourceUri = "rtsp://operator:top-secret@camera/live";
    const alertId = "44444444-4444-4444-8444-444444444444";
    const service = new AlertEvidenceCaptureService(root, 1, async () => {
      throw new Error(`Unable to open ${sourceUri}`);
    });
    await service.request({
      alertId, cameraId: "cam-001", occurredAt: new Date().toISOString(), sourceUri, clipSeconds: 20,
    });
    await waitFor(async () => (await service.getStatus(alertId))?.state === "failed");
    const status = await service.getStatus(alertId);
    expect(status?.error).toContain("[camera-source]");
    expect(status?.error).not.toContain("top-secret");
  });

  it("requeues a capture left in progress by a previous process", async () => {
    const root = await mkdtemp(join(tmpdir(), "sentinel-alert-evidence-"));
    roots.push(root);
    const alertId = "55555555-5555-4555-8555-555555555555";
    const folder = join(root, createHash("sha256").update(alertId).digest("hex"));
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "status.json"), JSON.stringify({
      alertId, cameraId: "cam-001", state: "capturing",
      requestedAt: new Date(Date.now() - 120_000).toISOString(),
      snapshotAvailable: false, clipAvailable: false,
    }));
    let resumed = false;
    const service = new AlertEvidenceCaptureService(root, 1, async (_input, output) => {
      resumed = true;
      await writeFile(output.snapshotPath, "jpeg");
      await writeFile(output.clipPath, "mp4");
    });
    await service.request({
      alertId, cameraId: "cam-001", occurredAt: new Date().toISOString(),
      sourceUri: "rtsp://camera/live", clipSeconds: 20,
    });
    await waitFor(async () => (await service.getStatus(alertId))?.state === "ready");
    expect(resumed).toBe(true);
  });

  it("archives evidence and reports an archive failure when cloud storage is mandatory", async () => {
    const root = await mkdtemp(join(tmpdir(), "sentinel-alert-evidence-"));
    roots.push(root);
    const alertId = "66666666-6666-4666-8666-666666666666";
    const service = new AlertEvidenceCaptureService(
      root,
      1,
      async (_input, output) => {
        await writeFile(output.snapshotPath, "jpeg");
        await writeFile(output.clipPath, "mp4");
      },
      {
        async archiveAsset(input) {
          if (input.kind === "clip") throw new Error("object_store_unavailable");
          return { provider: "s3", key: `evidence/${input.alertId}/snapshot.jpg` };
        },
      },
      true,
    );
    await service.request({
      alertId, cameraId: "cam-001", occurredAt: new Date().toISOString(),
      sourceUri: "rtsp://camera/live", clipSeconds: 20,
    });
    await waitFor(async () => (await service.getStatus(alertId))?.state === "partial");
    const status = await service.getStatus(alertId);
    expect(status?.snapshotAvailable).toBe(true);
    expect(status?.clipAvailable).toBe(true);
    expect(status?.archive?.state).toBe("partial");
    expect(status?.archive?.snapshotKey).toContain("snapshot.jpg");
    expect(status?.archive?.error).toContain("object_store_unavailable");
  });
});

async function waitFor(predicate: () => Promise<boolean>) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("timed_out_waiting_for_evidence_capture");
}
