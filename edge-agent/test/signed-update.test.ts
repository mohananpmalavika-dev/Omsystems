import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EdgeUpdateRelease } from "../src/registration/gateway-client.js";
import {
  activateSignedUpdate,
  confirmActiveSignedUpdate,
  rejectActiveSignedUpdate,
  resolveActiveSignedUpdate,
  stageSignedUpdate,
  verifyManifest,
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

  it("rejects an artifact changed after staging before it can be activated", async () => {
    const root = await mkdtemp(join(tmpdir(), "sentinel-edge-update-"));
    temporaryRoots.push(root);
    const payload = Buffer.from("verified patch", "utf8");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const release = signedRelease(payload, privateKey);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(payload, { status: 200 })));
    const staged = await stageSignedUpdate(release, publicKey.export({ type: "spki", format: "pem" }).toString(), root);
    await writeFile(staged.artifactPath, "replaced after staging", "utf8");

    await expect(activateSignedUpdate(release, staged, root)).rejects.toThrow("staged_update_artifact_invalid");
  });

  it("rejects a redirect that resolves to an insecure artifact URL", async () => {
    const root = await mkdtemp(join(tmpdir(), "sentinel-edge-update-"));
    temporaryRoots.push(root);
    const payload = Buffer.from("verified patch", "utf8");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const release = signedRelease(payload, privateKey);
    vi.stubGlobal("fetch", vi.fn(async () => {
      const response = new Response(payload, { status: 200 });
      Object.defineProperty(response, "url", { value: "http://updates.example/edge-agent.bundle" });
      return response;
    }));

    await expect(stageSignedUpdate(release, publicKey.export({ type: "spki", format: "pem" }).toString(), root))
      .rejects.toThrow("update_artifact_requires_https");
  });

  it("rejects non-canonical signatures and any signed-field mutation before download", async () => {
    const payload = Buffer.from("verified patch", "utf8");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const release = signedRelease(payload, privateKey);
    const key = publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(verifyManifest(release, key)).toBe(true);
    expect(verifyManifest({ ...release, signature: `${release.signature}=` }, key)).toBe(false);
    expect(verifyManifest({ ...release, notes: "payload switched after signing" }, key)).toBe(false);

    const root = await mkdtemp(join(tmpdir(), "sentinel-edge-update-"));
    temporaryRoots.push(root);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(stageSignedUpdate({ ...release, artifactUrl: "https://evil.example/payload" }, key, root))
      .rejects.toThrow("update_signature_invalid");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not activate a downgrade and leaves the committed pointer intact", async () => {
    const root = await mkdtemp(join(tmpdir(), "sentinel-edge-update-"));
    temporaryRoots.push(root);
    const payload = Buffer.from("verified patch", "utf8");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const release = signedRelease(payload, privateKey);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(payload, { status: 200 })));
    const key = publicKey.export({ type: "spki", format: "pem" }).toString();
    const staged = await stageSignedUpdate(release, key, root);

    await expect(activateSignedUpdate(release, staged, root, "1.1.0"))
      .rejects.toThrow("update_downgrade_rejected");
    await expect(resolveActiveSignedUpdate(root, key, "1.0.0")).resolves.toBeUndefined();
  });

  it("atomically replaces a prior active release only with a newer one", async () => {
    const root = await mkdtemp(join(tmpdir(), "sentinel-edge-update-"));
    temporaryRoots.push(root);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const key = publicKey.export({ type: "spki", format: "pem" }).toString();
    const v110 = signedRelease(Buffer.from("v1.1.0"), privateKey);
    const v120 = {
      ...signedRelease(Buffer.from("v1.2.0"), privateKey),
      version: "1.2.0",
      artifactUrl: "https://updates.example/v120.bundle",
    };
    v120.signature = sign(null, Buffer.from(JSON.stringify({
      artifactUrl: v120.artifactUrl, notes: v120.notes, sha256: v120.sha256, version: v120.version,
    }), "utf8"), privateKey).toString("base64url");
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => new Response(
      String(url).includes("v120") ? Buffer.from("v1.2.0") : Buffer.from("v1.1.0"), { status: 200 },
    )));

    const first = await stageSignedUpdate(v110, key, root);
    await activateSignedUpdate(v110, first, root, "1.0.0");
    const second = await stageSignedUpdate(v120, key, root);
    await activateSignedUpdate(v120, second, root, "1.1.0");

    await expect(resolveActiveSignedUpdate(root, key, "1.0.0")).resolves.toMatchObject({ version: "1.2.0" });
    const transaction = JSON.parse(await readFile(join(root, "transaction.json"), "utf8"));
    expect(transaction).toMatchObject({ version: "1.2.0", state: "ACTIVE" });
  });

  it("automatically restores the previously working patch when a trial fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "sentinel-edge-update-"));
    temporaryRoots.push(root);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const key = publicKey.export({ type: "spki", format: "pem" }).toString();
    const stable = signedRelease(Buffer.from("stable"), privateKey);
    const trial = {
      ...signedRelease(Buffer.from("trial"), privateKey),
      version: "1.2.0",
      artifactUrl: "https://updates.example/trial.bundle",
    };
    trial.signature = sign(null, Buffer.from(JSON.stringify({
      artifactUrl: trial.artifactUrl, notes: trial.notes, sha256: trial.sha256, version: trial.version,
    }), "utf8"), privateKey).toString("base64url");
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => new Response(
      String(url).includes("trial") ? Buffer.from("trial") : Buffer.from("stable"), { status: 200 },
    )));

    const stableStaged = await stageSignedUpdate(stable, key, root);
    await activateSignedUpdate(stable, stableStaged, root, "1.0.0");
    const trialStaged = await stageSignedUpdate(trial, key, root);
    await activateSignedUpdate(trial, trialStaged, root, "1.1.0");

    await expect(rejectActiveSignedUpdate(root, "health-check-failed"))
      .resolves.toMatchObject({ rolledBack: true, version: "1.1.0" });
    await expect(resolveActiveSignedUpdate(root, key, "1.0.0"))
      .resolves.toMatchObject({ version: "1.1.0" });
    const transaction = JSON.parse(await readFile(join(root, "transaction.json"), "utf8"));
    expect(transaction).toMatchObject({ version: "1.1.0", state: "ROLLED_BACK", reason: "health-check-failed" });
  });

  it("commits a trial only after its first successful health confirmation", async () => {
    const root = await mkdtemp(join(tmpdir(), "sentinel-edge-update-"));
    temporaryRoots.push(root);
    const payload = Buffer.from("verified patch", "utf8");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const key = publicKey.export({ type: "spki", format: "pem" }).toString();
    const release = signedRelease(payload, privateKey);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(payload, { status: 200 })));
    const staged = await stageSignedUpdate(release, key, root);
    await activateSignedUpdate(release, staged, root, "1.0.0");

    await expect(confirmActiveSignedUpdate(root, "1.1.0")).resolves.toBe(true);
    const transaction = JSON.parse(await readFile(join(root, "transaction.json"), "utf8"));
    expect(transaction).toMatchObject({ version: "1.1.0", state: "CONFIRMED" });
  });
});

function signedRelease(payload: Buffer, privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"]): EdgeUpdateRelease {
  const sha256 = createHash("sha256").update(payload).digest("hex");
  const release: EdgeUpdateRelease = {
    id: "release-1", version: "1.1.0", artifactUrl: "https://updates.example/edge-agent.bundle",
    sha256, notes: "Application patch only", signature: "",
  };
  release.signature = sign(null, Buffer.from(JSON.stringify({
    artifactUrl: release.artifactUrl, notes: release.notes, sha256, version: release.version,
  }), "utf8"), privateKey).toString("base64url");
  return release;
}
