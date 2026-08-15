import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { RecorderDeviceProfile } from "../types/recorder-profile.types.js";

export class RecorderProfileRepository {
  private readonly memoryCache = new Map<string, RecorderDeviceProfile>();

  constructor(private readonly storageFilePath?: string) {}

  async load(): Promise<void> {
    if (!this.storageFilePath) return;
    try {
      const content = await readFile(this.storageFilePath, "utf-8");
      const list: RecorderDeviceProfile[] = JSON.parse(content);
      for (const p of list) {
        this.memoryCache.set(p.recorderId, p);
      }
    } catch {
      // File doesn't exist yet or is empty
    }
  }

  async get(recorderId: string): Promise<RecorderDeviceProfile | null> {
    return this.memoryCache.get(recorderId) ?? null;
  }

  async upsert(profile: RecorderDeviceProfile): Promise<void> {
    this.memoryCache.set(profile.recorderId, profile);
    await this.persist();
  }

  async list(): Promise<RecorderDeviceProfile[]> {
    return Array.from(this.memoryCache.values());
  }

  isExpired(profile: RecorderDeviceProfile): boolean {
    const nextAt = new Date(profile.nextFingerprintAt).getTime();
    return Number.isFinite(nextAt) && Date.now() > nextAt;
  }

  private async persist(): Promise<void> {
    if (!this.storageFilePath) return;
    try {
      await mkdir(dirname(this.storageFilePath), { recursive: true });
      const list = Array.from(this.memoryCache.values());
      await writeFile(this.storageFilePath, JSON.stringify(list, null, 2), "utf-8");
    } catch {
      // Ignore disk write errors in non-persistent environments
    }
  }
}
