import type { Pool } from "pg";
import { pool as defaultPool } from "../database/pool.js";
import type { EnterpriseStorageHealthState } from "../domain/models.js";
import type {
  RecordingStorage,
  StorageHealthStatus,
  StorageReadOptions,
  StorageTier,
  StorageWriteResult,
} from "./recording-storage.interface.js";
import { LocalDiskStorageProvider } from "./providers/local-disk-storage.provider.js";

export interface EnterpriseStoragePoolConfig {
  defaultHotNodeId?: string;
  defaultWarmNodeId?: string;
  defaultArchiveNodeId?: string;
  spilloverThresholdPercent?: number; // default 95%
}

export class EnterpriseStoragePool {
  private readonly nodes = new Map<string, RecordingStorage>();
  private readonly tierMap = new Map<StorageTier, Set<string>>();
  private readonly pool: Pool;
  private readonly config: EnterpriseStoragePoolConfig;

  constructor(pool: Pool = defaultPool as Pool, config: EnterpriseStoragePoolConfig = {}) {
    this.pool = pool;
    this.config = {
      spilloverThresholdPercent: 95,
      ...config,
    };

    this.tierMap.set("hot", new Set());
    this.tierMap.set("warm", new Set());
    this.tierMap.set("cold", new Set());
    this.tierMap.set("archive", new Set());
  }

  /**
   * Registers a storage provider instance with the pool
   */
  registerNode(storage: RecordingStorage): void {
    this.nodes.set(storage.nodeId, storage);
    const tierSet = this.tierMap.get(storage.storageTier) || new Set();
    tierSet.add(storage.nodeId);
    this.tierMap.set(storage.storageTier, tierSet);
  }

  /**
   * Retrieves a storage node by ID
   */
  getNode(nodeId: string): RecordingStorage | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Lists all registered storage nodes
   */
  listNodes(): RecordingStorage[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Selects the best active healthy storage node for writing new recording segments.
   * If the requested tier node is FULL, OFFLINE, or READ_ONLY, automatically spills over to a healthy secondary node.
   */
  async selectWritableNode(preferredTier: StorageTier = "hot", preferredNodeId?: string): Promise<RecordingStorage> {
    // 1. Try preferredNodeId if supplied
    if (preferredNodeId) {
      const preferred = this.nodes.get(preferredNodeId);
      if (preferred) {
        const health = await preferred.health();
        if (this.isWritableState(health.healthState) && health.usagePercent < (this.config.spilloverThresholdPercent ?? 95)) {
          return preferred;
        }
      }
    }

    // 2. Try healthy nodes in the preferred tier
    const tierNodeIds = this.tierMap.get(preferredTier) || new Set();
    for (const nodeId of tierNodeIds) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;
      const health = await node.health();
      if (this.isWritableState(health.healthState) && health.usagePercent < (this.config.spilloverThresholdPercent ?? 95)) {
        return node;
      }
    }

    // 3. Failover / Spillover: Find any healthy writable node in adjacent tiers
    const fallbackTiers: StorageTier[] = preferredTier === "hot"
      ? ["warm", "cold", "archive"]
      : ["hot", "warm", "cold", "archive"];

    for (const tier of fallbackTiers) {
      const fallbackNodes = this.tierMap.get(tier) || new Set();
      for (const nodeId of fallbackNodes) {
        const node = this.nodes.get(nodeId);
        if (!node) continue;
        const health = await node.health();
        if (this.isWritableState(health.healthState) && health.usagePercent < 98) {
          return node;
        }
      }
    }

    // If nothing registered, create default fallback local storage
    if (this.nodes.size === 0) {
      const defaultLocal = new LocalDiskStorageProvider({
        nodeId: "local-default",
        basePath: "./data/recordings",
        storageTier: "hot",
      });
      this.registerNode(defaultLocal);
      return defaultLocal;
    }

    // Throw error if all nodes in pool are completely unwritable
    throw new Error("No writable storage nodes available in pool (all nodes FULL, OFFLINE, or READ_ONLY)");
  }

  /**
   * Writes a segment with automatic spillover and fallback routing
   */
  async writeSegment(
    key: string,
    data: Buffer,
    preferredTier: StorageTier = "hot",
    metadata?: Record<string, unknown>,
  ): Promise<StorageWriteResult & { assignedNodeId: string }> {
    const node = await this.selectWritableNode(preferredTier);
    const result = await node.writeSegment(key, data, metadata);
    return {
      ...result,
      assignedNodeId: node.nodeId,
    };
  }

  /**
   * Reads a segment from a specific node or searches across all nodes
   */
  async readSegment(key: string, nodeId?: string, range?: StorageReadOptions): Promise<Buffer> {
    if (nodeId) {
      const node = this.nodes.get(nodeId);
      if (!node) throw new Error(`Storage node [${nodeId}] not found in pool`);
      const result = await node.readSegment(key, range);
      if (Buffer.isBuffer(result)) return result;
      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of result) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }

    // Search across all nodes
    for (const node of this.nodes.values()) {
      if (await node.exists(key)) {
        const result = await node.readSegment(key, range);
        if (Buffer.isBuffer(result)) return result;
        const chunks: Buffer[] = [];
        for await (const chunk of result) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      }
    }

    throw new Error(`Segment [${key}] not found in any storage node in pool`);
  }

  /**
   * Gathers aggregated health status across all nodes
   */
  async getAllHealth(): Promise<StorageHealthStatus[]> {
    const reports: StorageHealthStatus[] = [];
    for (const node of this.nodes.values()) {
      reports.push(await node.health());
    }
    return reports;
  }

  /**
   * Migrates a segment between storage nodes (e.g. HOT -> WARM or WARM -> ARCHIVE)
   */
  async migrateSegment(
    segmentKey: string,
    sourceNodeId: string,
    targetNodeId: string,
    metadata?: Record<string, unknown>,
  ): Promise<StorageWriteResult> {
    const sourceNode = this.nodes.get(sourceNodeId);
    const targetNode = this.nodes.get(targetNodeId);

    if (!sourceNode) throw new Error(`Source storage node [${sourceNodeId}] not found`);
    if (!targetNode) throw new Error(`Target storage node [${targetNodeId}] not found`);

    const data = await sourceNode.readSegment(segmentKey);
    const buffer = Buffer.isBuffer(data)
      ? data
      : await (async () => {
          const chunks: Buffer[] = [];
          for await (const chunk of data) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          return Buffer.concat(chunks);
        })();

    const writeResult = await targetNode.writeSegment(segmentKey, buffer, metadata);

    // Verify integrity before deleting from source
    if (await targetNode.exists(segmentKey)) {
      await sourceNode.deleteSegment(segmentKey);
    }

    return writeResult;
  }

  private isWritableState(state: EnterpriseStorageHealthState): boolean {
    return state === "HEALTHY" || state === "DEGRADED" || state === "REBUILDING";
  }
}

export const enterpriseStoragePool = new EnterpriseStoragePool();
