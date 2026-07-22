import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStreamSecretStore, startSecretProvider } from "../src/streaming/secret-store.js";

describe("branch-local stream secret store", () => {
  it("persists camera URLs locally and serves only authenticated resolution", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sentinel-edge-secrets-"));
    const path = join(directory, "stream-secrets.json");
    const store = new LocalStreamSecretStore(path);
    const reference = "edge://agent-1/discovery-1";
    const sourceUri = "rtsp://operator:secret@192.168.1.20/live";
    const key = "branch-media-key-that-is-at-least-32-bytes";
    await store.load();
    await store.set(reference, sourceUri);
    const server = await startSecretProvider({ store, host: "127.0.0.1", port: 0, sharedKey: key });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server unavailable");
    const url = new URL(`http://127.0.0.1:${address.port}/v1/secrets/resolve`);
    url.searchParams.set("ref", reference);
    try {
      expect((await readFile(path, "utf8"))).toContain(sourceUri);
      expect((await fetch(url)).status).toBe(401);
      const response = await fetch(url, { headers: { "x-edge-media-key": key } });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ sourceUri });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve())
      );
      await rm(directory, { recursive: true, force: true });
    }
  });
});
