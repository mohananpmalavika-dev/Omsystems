import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface OutboxRequest {
  path: string;
  method: "POST";
  body: string;
  headers?: Record<string, string>;
  payloadType?: "json" | "video_chunk" | "telemetry";
  /** Higher values replay first; critical evidence survives telemetry storms. */
  priority?: number;
  chunkMetadata?: {
    segmentId: string;
    cameraId: string;
    startTime: string;
    endTime: string;
    sizeBytes: number;
    sha256: string;
  };
}

interface OutboxItem extends OutboxRequest {
  id: string;
  queuedAt: string;
  attempts: number;
}

type Envelope = { version: 1; iv: string; tag: string; ciphertext: string };

export class EncryptedOutbox {
  private items: OutboxItem[] = [];
  private operation: Promise<unknown> = Promise.resolve();

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.operation.then(action);
    this.operation = result.catch(() => undefined);
    return result;
  }

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
    if (values.length > this.maxItems) throw new Error("offline_outbox_capacity_exceeded");
    this.items = values as OutboxItem[];
  }

  async enqueue(request: OutboxRequest) {
    return this.serial(async () => {
      if (this.items.length >= this.maxItems) throw new Error("offline_outbox_capacity_exceeded");
      const item = { ...request, priority: requestPriority(request), id: randomUUID(), queuedAt: new Date().toISOString(), attempts: 0 };
      this.items.push(item);
      try { await this.persist(); } catch (error) { this.items = this.items.filter(value => value.id !== item.id); throw error; }
      return this.items.length;
    });
  }

  async enqueueVideoChunk(chunk: {
    segmentId: string;
    cameraId: string;
    startTime: string;
    endTime: string;
    sizeBytes: number;
    sha256: string;
    dataBase64: string;
    incidentEvidence?: boolean;
  }) {
    return this.enqueue({
      path: "/v1/edge/sync/video-chunk",
      method: "POST",
      body: JSON.stringify(chunk),
      headers: { "content-type": "application/json" },
      payloadType: "video_chunk",
      priority: chunk.incidentEvidence ? 90 : 40,
      chunkMetadata: {
        segmentId: chunk.segmentId,
        cameraId: chunk.cameraId,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        sizeBytes: chunk.sizeBytes,
        sha256: chunk.sha256,
      },
    });
  }

  async flush(sender: (request: OutboxRequest) => Promise<void>, limit = 100) {
    return this.serial(async () => {
    let delivered = 0;
    this.items.sort((a, b) => requestPriority(b) - requestPriority(a) || Date.parse(a.queuedAt) - Date.parse(b.queuedAt));
    while (this.items.length > 0 && delivered < limit) {
      const item = this.items[0]!;
      try {
        await sender(item);
        this.items.shift();
        try { await this.persist(); } catch (error) { this.items.unshift(item); throw error; }
        delivered += 1;
      } catch {
        item.attempts += 1;
        break;
      }
    }
    if (delivered > 0 || this.items[0]?.attempts) await this.persist();
    return { delivered, pending: this.items.length };
    });
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

export function requestPriority(request: OutboxRequest): number {
  if (Number.isFinite(request.priority)) return Math.max(0, Math.min(100, request.priority!));
  try {
    const body = JSON.parse(request.body);
    if (body.severity === 'P1' || body.priority === 'P1' || body.incidentEvidence === true ||
      (Array.isArray(body.events) && body.events.some((event: { severity?: string }) => event.severity === 'P1'))) return 100;
  } catch { /* Non-JSON bodies use path/type classification. */ }
  if (/incident|alert/i.test(request.path)) return 90;
  if (/audit/i.test(request.path)) return 80;
  if (/recording|segment/i.test(request.path)) return 60;
  if (request.payloadType === 'video_chunk') return 40;
  if (request.payloadType === 'telemetry' || /telemetry|heartbeat/i.test(request.path)) return 10;
  return 30;
}
