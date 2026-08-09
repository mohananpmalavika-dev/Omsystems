import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DeviceIdentityStore } from "../src/security/device-identity.js";
import { EncryptedOutbox } from "../src/offline/encrypted-outbox.js";
import { CameraCredentialVault, openSealedCommand } from "../src/security/camera-credential-vault.js";
import { constants, createCipheriv, publicEncrypt, randomBytes } from "node:crypto";

describe("encrypted gateway state", () => {
  const directories: string[] = [];
  afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

  it("encrypts and restores the unique gateway identity", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sentinel-identity-"));
    directories.push(directory);
    const path = join(directory, "identity.enc");
    const store = new DeviceIdentityStore(path, join(directory, "identity.key"));
    const identity = {
      deviceUuid: "11111111-1111-4111-8111-111111111111",
      agentId: "agent-1", branchId: "branch-1", credential: "sggw_super-secret",
      enrolledAt: new Date().toISOString(),
    };
    await store.save(identity);
    expect(await readFile(path, "utf8")).not.toContain(identity.credential);
    await expect(new DeviceIdentityStore(path, join(directory, "identity.key")).load())
      .resolves.toEqual(identity);
  });

  it("persists telemetry offline and replays it in order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sentinel-outbox-"));
    directories.push(directory);
    const path = join(directory, "outbox.enc");
    const keyPath = join(directory, "outbox.key");
    const outbox = new EncryptedOutbox(path, keyPath, 100);
    await outbox.load();
    await outbox.enqueue({ path: "/telemetry/1", method: "POST", body: "secret-body-1" });
    await outbox.enqueue({ path: "/telemetry/2", method: "POST", body: "secret-body-2" });
    expect(await readFile(path, "utf8")).not.toContain("secret-body");

    const restored = new EncryptedOutbox(path, keyPath, 100);
    await restored.load();
    const delivered: string[] = [];
    const result = await restored.flush(async (item) => { delivered.push(item.path); });
    expect(delivered).toEqual(["/telemetry/1", "/telemetry/2"]);
    expect(result).toEqual({ delivered: 2, pending: 0 });
  });

  it("keeps an item queued when replay still cannot reach the cloud", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sentinel-outbox-fail-"));
    directories.push(directory);
    const outbox = new EncryptedOutbox(join(directory, "outbox.enc"), join(directory, "outbox.key"), 100);
    await outbox.load();
    await outbox.enqueue({ path: "/telemetry", method: "POST", body: "{}" });
    await expect(outbox.flush(async () => { throw new Error("offline"); }))
      .resolves.toEqual({ delivered: 0, pending: 1 });
  });

  it("decrypts gateway-only credential commands into an encrypted local vault", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sentinel-camera-vault-"));
    directories.push(directory);
    const pair = DeviceIdentityStore.newCommandKeyPair();
    const envelope = sealForTest({
      username: "operator", password: "camera-secret", scope: { host: "192.168.1.20" },
    }, pair.publicKey);
    const command = openSealedCommand<{
      username: string; password: string; scope: { host: string };
    }>(envelope, pair.privateKey);
    const path = join(directory, "credentials.enc");
    const keyPath = join(directory, "credentials.key");
    const vault = new CameraCredentialVault(path, keyPath);
    await vault.load();
    await vault.set({ ...command, host: command.scope.host });
    expect(await readFile(path, "utf8")).not.toContain("camera-secret");
    const restored = new CameraCredentialVault(path, keyPath);
    await restored.load();
    expect(restored.get("192.168.1.20")).toMatchObject({ username: "operator", password: "camera-secret" });
    expect(restored.get("192.168.1.21")).toBeUndefined();
  });
});

function sealForTest(payload: Record<string, unknown>, publicKey: string) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return {
    algorithm: "RSA-OAEP-256+A256GCM" as const,
    wrappedKey: publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key).toString("base64url"),
    iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}
