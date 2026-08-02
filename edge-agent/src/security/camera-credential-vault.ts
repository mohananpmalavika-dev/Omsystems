import {
  constants,
  createCipheriv,
  createDecipheriv,
  privateDecrypt,
  randomBytes,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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
    return this.values[`host:${host}`] ?? this.values.default;
  }

  async set(input: { username: string; password: string; host?: string }) {
    const key = input.host ? `host:${input.host}` : "default";
    this.values[key] = { username: input.username, password: input.password, updatedAt: new Date().toISOString() };
    await this.persist();
    return { scope: input.host ? "single-camera" : "branch-default", updatedAt: this.values[key]!.updatedAt };
  }

  private async persist() {
    const key = await this.loadOrCreateKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(this.values), "utf8"), cipher.final()]);
    const envelope: Envelope = {
      version: 1, iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url"),
    };
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(envelope), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.path);
  }

  private async readKey() {
    const key = Buffer.from((await readFile(this.keyPath, "utf8")).trim(), "base64url");
    if (key.length !== 32) throw new Error("invalid_camera_credential_vault_key");
    return key;
  }

  private async loadOrCreateKey() {
    try { return await this.readKey(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const key = randomBytes(32);
    await mkdir(dirname(this.keyPath), { recursive: true });
    await writeFile(this.keyPath, key.toString("base64url"), { encoding: "utf8", mode: 0o600, flag: "wx" })
      .catch(async (error) => { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; });
    return this.readKey();
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
