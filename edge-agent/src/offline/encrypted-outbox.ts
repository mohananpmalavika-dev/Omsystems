import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface OutboxRequest {
  path: string;
  method: "POST";
  body: string;
  headers?: Record<string, string>;
}

interface OutboxItem extends OutboxRequest {
  id: string;
  queuedAt: string;
  attempts: number;
}

type Envelope = { version: 1; iv: string; tag: string; ciphertext: string };

export class EncryptedOutbox {
  private items: OutboxItem[] = [];

  constructor(
    private readonly path: string,
    private readonly keyPath: string,
    private readonly maxItems = 10_000,
  ) {}

  async load() {
    let raw: string;
    try { raw = await readFile(this.path, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const envelope = JSON.parse(raw) as Envelope;
    const key = await this.readKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]);
    const values = JSON.parse(plaintext.toString("utf8"));
    if (!Array.isArray(values)) throw new Error("invalid_offline_outbox");
    this.items = values.slice(0, this.maxItems) as OutboxItem[];
  }

  async enqueue(request: OutboxRequest) {
    if (this.items.length >= this.maxItems) throw new Error("offline_outbox_capacity_exceeded");
    this.items.push({ ...request, id: randomUUID(), queuedAt: new Date().toISOString(), attempts: 0 });
    await this.persist();
    return this.items.length;
  }

  async flush(sender: (request: OutboxRequest) => Promise<void>, limit = 100) {
    let delivered = 0;
    while (this.items.length > 0 && delivered < limit) {
      const item = this.items[0]!;
      try {
        await sender(item);
        this.items.shift();
        delivered += 1;
      } catch {
        item.attempts += 1;
        break;
      }
    }
    if (delivered > 0 || this.items[0]?.attempts) await this.persist();
    return { delivered, pending: this.items.length };
  }

  get pending() { return this.items.length; }

  private async persist() {
    const key = await this.loadOrCreateKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(this.items), "utf8"), cipher.final()]);
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
    if (key.length !== 32) throw new Error("invalid_offline_outbox_key");
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
