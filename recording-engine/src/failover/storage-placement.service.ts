/**
 * Multi-Factor Storage Placement Service
 * 
 * Selects the optimal storage node based on health, priority, free capacity headroom,
 * storage tier, branch/camera affinity, and legal constraints.
 */

import type { StorageBackend } from "../backends/storage-backend.interface.js";
import type { RecordingStorageTier } from "../../../packages/contracts/src/storage/storage-types.js";
import { StorageError, StorageErrorCode } from "../../../packages/contracts/src/storage/storage-errors.js";

export interface StoragePlacementContext {
  tier?: RecordingStorageTier;
  estimatedBytes?: number;
  branchId?: string;
  cameraId?: string;
  legalHold?: boolean;
}

export interface StorageCandidateScore {
  nodeId: string;
  backend: StorageBackend;
  score: number;
  reasons: string[];
}

export class StoragePlacementService {
  /**
   * Scores all available storage backends and selects the best candidate.
   */
  async selectOptimalNode(
    backends: StorageBackend[],
    context: StoragePlacementContext = {},
  ): Promise<StorageBackend> {
    if (backends.length === 0) {
      throw new StorageError(
        StorageErrorCode.STORAGE_OFFLINE,
        "StoragePlacementService: No storage backends registered in the cluster.",
      );
    }

    const scoredCandidates: StorageCandidateScore[] = [];

    for (const backend of backends) {
      let score = 1000;
      const reasons: string[] = [];

      try {
        const health = await backend.getHealth();
        const metrics = await backend.getMetrics();

        // 1. Health gating (Hard fail)
        if (health.status === "offline" || !health.isWritable) {
          continue; // Ineligible
        }
        if (health.status === "critical") {
          score -= 500;
          reasons.push("status_critical (-500)");
        } else if (health.status === "warning" || health.status === "degraded") {
          score -= 200;
          reasons.push("status_warning_or_degraded (-200)");
        }

        // 2. Capacity headroom gating
        const acceptCheck = await backend.canAcceptWrite({ estimatedBytes: context.estimatedBytes });
        if (!acceptCheck.allowed) {
          continue; // Ineligible
        }

        if (metrics.capacity.type === "FIXED") {
          // Bonus for ample free headroom
          const freePct = 100 - metrics.capacity.usedPercent;
          score += Math.round(freePct * 2);
          reasons.push(`free_pct_${freePct.toFixed(0)}% (+${Math.round(freePct * 2)})`);
        } else if (metrics.capacity.type === "ELASTIC") {
          // Object storage has elastic capacity
          score += 100;
          reasons.push("elastic_capacity (+100)");
        }

        // 3. Storage Tier matching
        if (context.tier) {
          if (metrics.supportedTiers.includes(context.tier)) {
            score += 200;
            reasons.push(`tier_${context.tier}_match (+200)`);
          } else {
            score -= 300;
            reasons.push(`tier_${context.tier}_mismatch (-300)`);
          }
        }

        // 4. Consecutive failure penalty
        if (health.consecutiveFailures > 0) {
          const penalty = Math.min(health.consecutiveFailures * 50, 400);
          score -= penalty;
          reasons.push(`failures_${health.consecutiveFailures} (-${penalty})`);
        }

        // 5. Legal hold preference (prefer high-durability / object-store if legal hold)
        if (context.legalHold && backend.backendKind === "OBJECT_STORE") {
          score += 150;
          reasons.push("legal_hold_object_store (+150)");
        }

        scoredCandidates.push({
          nodeId: backend.id,
          backend,
          score,
          reasons,
        });
      } catch (err: any) {
        // Node query failed -> skip
        continue;
      }
    }

    if (scoredCandidates.length === 0) {
      throw new StorageError(
        StorageErrorCode.STORAGE_FULL,
        "StoragePlacementService: All storage nodes are full, offline, or failing capacity policy checks.",
      );
    }

    // Sort highest score first
    scoredCandidates.sort((a, b) => b.score - a.score);
    return scoredCandidates[0]!.backend;
  }
}
