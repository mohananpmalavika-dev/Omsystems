import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CentralStreamVault } from "../src/security/vault/central-stream-vault.js";
import { encryptCameraPassword, readCameraPassword } from "../src/security/vault/camera-credential-codec.js";

describe("central credential vault", () => {
  const key = randomBytes(32).toString("base64");

  it("encrypts DVR stream URLs and binds them to their reference", () => {
    const vault = new CentralStreamVault(key);
    const reference = "edge://agent-1/hajipur-ch1#sub";
    const sourceUri = "rtsp://admin:secret@172.29.91.100:554/cam/realmonitor?channel=1&subtype=1";
    const encrypted = vault.encrypt(reference, sourceUri);
    expect(encrypted).not.toContain("secret");
    expect(vault.decrypt(reference, encrypted)).toBe(sourceUri);
    expect(() => vault.decrypt("edge://agent-1/hajipur-ch2#sub", encrypted)).toThrow();
  });

  it("rejects altered ciphertext and missing keys", () => {
    const vault = new CentralStreamVault(key);
    const encrypted = Buffer.from(vault.encrypt("ref", "password"), "base64");
    encrypted[encrypted.length - 1] ^= 1;
    expect(() => vault.decrypt("ref", encrypted.toString("base64"))).toThrow();
    expect(() => new CentralStreamVault("")).toThrow("STREAM_VAULT_KEY");
  });

  it("reads encrypted camera passwords and legacy rows during migration", () => {
    const previous = process.env.STREAM_VAULT_KEY;
    process.env.STREAM_VAULT_KEY = key;
    try {
      const encrypted = encryptCameraPassword("credential-1", "camera-password");
      expect(readCameraPassword({ id: "credential-1", password_encrypted: encrypted, password: "" }))
        .toBe("camera-password");
      expect(readCameraPassword({ id: "credential-2", password: "legacy-password" }))
        .toBe("legacy-password");
    } finally {
      if (previous === undefined) delete process.env.STREAM_VAULT_KEY;
      else process.env.STREAM_VAULT_KEY = previous;
    }
  });
});
