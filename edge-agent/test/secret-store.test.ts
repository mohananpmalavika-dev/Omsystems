import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStreamSecretStore } from "../src/streaming/secret-store.js";

describe("edge stream secret", () => {
  it("keeps new secrets only in memory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sentinel-edge-secrets-"));
    const path = join(directory, "stream-secrets.json");
    const store = new LocalStreamSecretStore(path);
    try {
      await store.load();
      await store.set("edge://agent/discovery", "rtsp://operator:secret@192.168.1.20/live");
      expect(store.entries()).toHaveLength(1);
      await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
