import { createDecipheriv } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";

export class LocalStreamSecretStore {
  private values: Record<string, string> = {};

  constructor(private readonly path: string) {}

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as unknown;
      if (isEncryptedStore(parsed)) {
        const key = await this.readKey();
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64url"));
        decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
        const plaintext = Buffer.concat([
          decipher.update(Buffer.from(parsed.ciphertext, "base64url")), decipher.final(),
        ]);
        this.values = parseSecretRecord(JSON.parse(plaintext.toString("utf8")));
      } else {
        this.values = parseSecretRecord(parsed);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async set(reference: string, sourceUri: string) {
    this.values[reference] = sourceUri;
  }

  get(reference: string) {
    return this.values[reference];
  }

  entries() {
    return Object.entries(this.values).map(([reference, sourceUri]) => ({ reference, sourceUri }));
  }

  async removeLegacyFiles() {
    await unlink(this.path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    await unlink(`${this.path}.key`).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    this.values = {};
  }

  private async readKey() {
    const key = Buffer.from((await readFile(`${this.path}.key`, "utf8")).trim(), "base64url");
    if (key.length !== 32) throw new Error("invalid_stream_secret_store_key");
    return key;
  }
}

function isEncryptedStore(value: unknown): value is { version: 1; iv: string; tag: string; ciphertext: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Reflect.get(value, "version") === 1 &&
    ["iv", "tag", "ciphertext"].every((key) => typeof Reflect.get(value, key) === "string");
}

function parseSecretRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      !Object.entries(value).every(([key, uri]) => key.startsWith("edge://") && typeof uri === "string")) {
    throw new Error("invalid_stream_secret_store");
  }
  return value as Record<string, string>;
}
