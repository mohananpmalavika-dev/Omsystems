import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalStreamSecretStore } from "../src/streaming/secret-store.js";

describe("legacy stream secret import", () => {
  const directories: string[] = [];
  afterEach(async () => {
    for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
  });

  it("loads encrypted legacy data and removes both local files after transfer", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sentinel-stream-secrets-"));
    directories.push(directory);
    const path = join(directory, "stream-secrets.json");
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const reference = "edge://agent/old-camera";
    const uri = "rtsp://operator:password@192.168.1.20/live";
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ [reference]: uri })), cipher.final()]);
    await writeFile(path, JSON.stringify({ version: 1, iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") }));
    await writeFile(`${path}.key`, key.toString("base64url"));
    const store = new LocalStreamSecretStore(path);
    await store.load();
    expect(store.entries()).toEqual([{ reference, sourceUri: uri }]);
    await store.removeLegacyFiles();
    await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(`${path}.key`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reads plaintext legacy data without writing it again", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sentinel-stream-secrets-"));
    directories.push(directory);
    const path = join(directory, "stream-secrets.json");
    const reference = "edge://agent/old-camera";
    const uri = "rtsp://operator:password@192.168.1.20/live";
    await writeFile(path, JSON.stringify({ [reference]: uri }));
    const store = new LocalStreamSecretStore(path);
    await store.load();
    expect(store.get(reference)).toBe(uri);
    expect(await readFile(path, "utf8")).toContain(uri);
  });
});
