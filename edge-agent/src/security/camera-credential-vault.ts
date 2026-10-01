import {
  constants,
  createDecipheriv,
  privateDecrypt,
} from "node:crypto";
import { readFile, unlink } from "node:fs/promises";

export interface CameraCredential {
  username: string;
  password: string;
  updatedAt: string;
}

export interface SealedCommandEnvelope {
  algorithm: "RSA-OAEP-256+A256GCM";
  wrappedKey: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

type Envelope = { version: 1; iv: string; tag: string; ciphertext: string };

export class CameraCredentialVault {
  private values: Record<string, CameraCredential> = {};

  constructor(private readonly path: string, private readonly keyPath: string) {}

  async load() {
    let raw: string;
    try { raw = await readFile(this.path, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const envelope = JSON.parse(raw) as Envelope;
    if (envelope.version !== 1) throw new Error("unsupported_camera_credential_vault");
    const key = await this.readKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]);
    const parsed = JSON.parse(plaintext.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_camera_credential_vault");
    this.values = parsed as Record<string, CameraCredential>;
  }

  get(host: string): CameraCredential | undefined {
    return this.values[`host:${host}`];
  }

  entries(): Array<{ host: string; username: string; password: string }> {
    return Object.entries(this.values)
      .filter(([key]) => key.startsWith("host:"))
      .map(([key, value]) => ({ host: key.slice(5), username: value.username, password: value.password }));
  }

  async removeLegacyFiles() {
    for (const path of [this.path, this.keyPath]) {
      await unlink(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    this.values = {};
  }

  private async readKey() {
    const key = Buffer.from((await readFile(this.keyPath, "utf8")).trim(), "base64url");
    if (key.length !== 32) throw new Error("invalid_camera_credential_vault_key");
    return key;
  }

}

export function openSealedCommand<T>(envelope: SealedCommandEnvelope, privateKeyPem: string): T {
  if (envelope.algorithm !== "RSA-OAEP-256+A256GCM") throw new Error("unsupported_command_envelope");
  const contentKey = privateDecrypt({
    key: privateKeyPem,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  }, Buffer.from(envelope.wrappedKey, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", contentKey, Buffer.from(envelope.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
