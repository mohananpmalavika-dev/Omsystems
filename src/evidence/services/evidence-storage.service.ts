import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { EvidenceAsset } from "../domain/evidence.types.js";

type StoredAsset = Omit<EvidenceAsset, "capturedAt"> & { capturedAt: string };

/** Durable local evidence storage. An explicit mount path is required. */
export class EvidenceStorageService {
  private readonly basePath = process.env.EVIDENCE_STORAGE_PATH
    ? resolve(process.env.EVIDENCE_STORAGE_PATH)
    : undefined;

  formatStorageKey(params: { tenantId: string; branchId: string; alertId: string; filename: string; date?: Date }): string {
    const date = params.date ?? new Date();
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `evidence/${safePart(params.tenantId)}/${year}/${month}/${day}/${safePart(params.branchId)}/${safePart(params.alertId)}/${safePart(params.filename)}`;
  }

  async putAsset(params: {
    storageKey: string;
    data: Buffer;
    mimeType: string;
    type: "SNAPSHOT" | "VIDEO_CLIP" | "MANIFEST";
    sha256: string;
    durationSeconds?: number;
  }): Promise<EvidenceAsset> {
    const target = this.resolveStorageKey(params.storageKey);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.partial-${randomUUID()}`;
    await writeFile(temporary, params.data, { flag: "wx" });
    await rename(temporary, target);
    const asset: EvidenceAsset = {
      id: `asset-${randomUUID()}`,
      type: params.type,
      storageKey: params.storageKey,
      url: `evidence://${params.storageKey}`,
      mimeType: params.mimeType,
      sizeBytes: params.data.length,
      sha256: params.sha256,
      capturedAt: new Date(),
      durationSeconds: params.durationSeconds,
      verified: true,
      assetType: "ORIGINAL",
    };
    const metadata: StoredAsset = { ...asset, capturedAt: asset.capturedAt.toISOString() };
    await writeFile(`${target}.json`, JSON.stringify(metadata), { encoding: "utf8", flag: "wx" });
    return asset;
  }

  async getAsset(storageKey: string): Promise<EvidenceAsset | null> {
    try {
      const target = this.resolveStorageKey(storageKey);
      const metadata = JSON.parse(await readFile(`${target}.json`, "utf8")) as StoredAsset;
      return { ...metadata, capturedAt: new Date(metadata.capturedAt) };
    } catch {
      return null;
    }
  }

  async verifyObjectExists(storageKey: string): Promise<boolean> {
    try {
      return (await stat(this.resolveStorageKey(storageKey))).isFile();
    } catch {
      return false;
    }
  }

  private resolveStorageKey(storageKey: string): string {
    if (!this.basePath) throw new Error("EVIDENCE_STORAGE_PATH is not configured");
    const target = resolve(this.basePath, storageKey.replace(/\\/g, "/"));
    if (target !== this.basePath && !target.startsWith(`${this.basePath}${sep}`)) {
      throw new Error("Invalid evidence storage key");
    }
    return target;
  }
}

function safePart(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!normalized || normalized === "." || normalized === "..") throw new Error("Invalid evidence storage identifier");
  return normalized;
}

export const evidenceStorageService = new EvidenceStorageService();
