import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Encrypts complete source URLs, including embedded camera passwords. */
export class CentralStreamVault {
  private readonly key: Buffer;

  constructor(encodedKey = process.env.STREAM_VAULT_KEY) {
    if (!encodedKey || !/^[A-Za-z0-9+/]{43}=$/.test(encodedKey)) {
      throw new Error("STREAM_VAULT_KEY must be a base64-encoded 32-byte key");
    }
    this.key = Buffer.from(encodedKey, "base64");
    if (this.key.length !== 32) throw new Error("STREAM_VAULT_KEY must contain exactly 32 bytes");
  }

  encrypt(reference: string, sourceUri: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(reference));
    const ciphertext = Buffer.concat([cipher.update(sourceUri, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
  }

  decrypt(reference: string, encrypted: string): string {
    const payload = Buffer.from(encrypted, "base64");
    if (payload.length < 28) throw new Error("Invalid encrypted stream secret");
    const decipher = createDecipheriv("aes-256-gcm", this.key, payload.subarray(0, 12));
    decipher.setAAD(Buffer.from(reference));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
  }
}
