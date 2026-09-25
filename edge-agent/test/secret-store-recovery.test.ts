import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalStreamSecretStore } from "../src/streaming/secret-store.js";

describe("local stream secret persistence", () => {
  const directories: string[] = [];
  afterEach(async () => {
    for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
  });

  it("retains every discovery reference after concurrent channel writes and a restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sentinel-stream-secrets-"));
    directories.push(directory);
    const path = join(directory, "data", "stream-secrets.json");
    const first = new LocalStreamSecretStore(path);
    await Promise.all(Array.from({ length: 40 }, (_, channel) =>
      first.set(`edge://agent/discovery-${channel}`, `rtsp://example.invalid/channel/${channel}`)));

    const restarted = new LocalStreamSecretStore(path);
    await restarted.load();
    for (let channel = 0; channel < 40; channel++) {
      expect(restarted.get(`edge://agent/discovery-${channel}`))
        .toBe(`rtsp://example.invalid/channel/${channel}`);
    }
    expect(Object.keys(JSON.parse(await readFile(path, "utf8")))).toHaveLength(40);
  });
});
