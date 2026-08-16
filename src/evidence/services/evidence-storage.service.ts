import type { EvidenceAsset } from "../domain/evidence.types.js";

export class EvidenceStorageService {
  private readonly storageObjects = new Map<string, { asset: EvidenceAsset; data: Buffer }>();

  formatStorageKey(params: {
    tenantId: string;
    branchId: string;
    alertId: string;
    filename: string;
    date?: Date | undefined;
  }): string {
    const d = params.date ?? new Date();
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");

    return `evidence/${params.tenantId}/${year}/${month}/${day}/${params.branchId}/${params.alertId}/${params.filename}`;
  }

  async putAsset(params: {
    storageKey: string;
    data: Buffer;
    mimeType: string;
    type: "SNAPSHOT" | "VIDEO_CLIP" | "MANIFEST";
    sha256: string;
    durationSeconds?: number | undefined;
  }): Promise<EvidenceAsset> {
    const assetId = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const url = `https://storage.bank.internal/${params.storageKey}`;

    const asset: EvidenceAsset = {
      id: assetId,
      type: params.type,
      storageKey: params.storageKey,
      url,
      mimeType: params.mimeType,
      sizeBytes: params.data.length,
      sha256: params.sha256,
      capturedAt: new Date(),
      durationSeconds: params.durationSeconds,
      verified: true,
      assetType: "ORIGINAL",
    };

    this.storageObjects.set(params.storageKey, { asset, data: params.data });
    return asset;
  }

  async getAsset(storageKey: string): Promise<EvidenceAsset | null> {
    const obj = this.storageObjects.get(storageKey);
    return obj ? obj.asset : null;
  }

  async verifyObjectExists(storageKey: string): Promise<boolean> {
    return this.storageObjects.has(storageKey);
  }
}

export const evidenceStorageService = new EvidenceStorageService();
