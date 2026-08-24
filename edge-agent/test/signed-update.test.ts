import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EdgeUpdateRelease } from "../src/registration/gateway-client.js";
import {
  activateSignedUpdate,
  resolveActiveSignedUpdate,
  stageSignedUpdate,
} from "../src/updates/signed-update.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("signed application-only edge updates", () => {
  it("downloads, activates and re-verifies a lightweight patch", async () => {
    const root = await mkdtemp(join(tmpdir(), "sentinel-edge-update-"));
    temporaryRoots.push(root);
    const payload = Buffer.from("module.exports={runEdgeAgent:async()=>undefined};", "utf8");
    const sha256 = createHash("sha256").update(payload).digest("hex");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const release: EdgeUpdateRelease = {
      id: "release-1",
      version: "1.1.0",
      artifactUrl: "https://updates.example/edge-agent.bundle",
      sha256,
      notes: "Application patch only",
      signature: "",
    };
    release.signature = sign(null, Buffer.from(JSON.stringify({
      artifactUrl: release.artifactUrl,
      notes: release.notes,
      sha256,
      version: release.version,
    }), "utf8"), privateKey).toString("base64url");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(payload, {
      status: 200,
      headers: { "content-length": String(payload.length) },
    })));

    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const staged = await stageSignedUpdate(release, publicKeyPem, root);
    expect(staged).toMatchObject({ version: "1.1.0", bytes: payload.length, sha256 });
    await activateSignedUpdate(release, staged, root);

    await expect(resolveActiveSignedUpdate(root, publicKeyPem, "1.0.0")).resolves.toMatchObject({
      version: "1.1.0",
      releaseId: "release-1",
    });
    expect(await readFile(staged.artifactPath, "utf8")).toBe(payload.toString("utf8"));

    await writeFile(staged.artifactPath, "tampered", "utf8");
    await expect(resolveActiveSignedUpdate(root, publicKeyPem, "1.0.0")).resolves.toBeUndefined();
  });
});
