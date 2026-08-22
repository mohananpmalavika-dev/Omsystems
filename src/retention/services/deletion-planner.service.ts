/**
 * Safe Deletion Planner & Prioritizer
 * Selects eligible segments for purge, ranks candidates by priority, and fails loud under storage exhaustion.
 */

import { RetentionSegmentMetadata, RetentionPriority } from '../domain/retention-policy-engine.types.js';

export interface DeletionPlanResult {
  eligibleSegments: RetentionSegmentMetadata[];
  totalReclaimableBytes: number;
  unreclaimableProtectedBytes: number;
  storageExhaustionRisk: boolean;
  exhaustionWarningMessage?: string;
}

export class DeletionPlannerService {
  private static PRIORITY_WEIGHTS: Record<RetentionPriority, number> = {
    LOW: 1,
    NORMAL: 2,
    HIGH: 3,
    CRITICAL: 4,
  };

  /**
   * Checks if a segment can be legally and safely deleted.
   */
  static canDeleteSegment(segment: RetentionSegmentMetadata, now: Date = new Date()): boolean {
    // 1. Must have passed minimum retention date
    if (segment.minimumRetainUntil.getTime() > now.getTime()) {
      return false;
    }

    // 2. Must not be under active legal hold
    if (segment.legalHoldCount > 0) {
      return false;
    }

    // 3. Must not be locked as forensic evidence
    if (segment.isEvidenceLocked) {
      return false;
    }

    return true;
  }

  /**
   * Builds an ordered deletion plan ranking candidates:
   * 1. Expired longest ago
   * 2. Lowest recording priority (LOW -> NORMAL -> HIGH -> CRITICAL)
   */
  static planDeletion(
    segments: RetentionSegmentMetadata[],
    targetReclaimBytes: number = 0,
    now: Date = new Date()
  ): DeletionPlanResult {
    let unreclaimableProtectedBytes = 0;
    const eligible: RetentionSegmentMetadata[] = [];

    for (const seg of segments) {
      if (this.canDeleteSegment(seg, now)) {
        eligible.push(seg);
      } else {
        unreclaimableProtectedBytes += seg.sizeBytes;
      }
    }

    // Sort eligible candidates: Lowest priority first, then expired longest ago
    eligible.sort((a, b) => {
      const weightA = this.PRIORITY_WEIGHTS[a.priority] || 2;
      const weightB = this.PRIORITY_WEIGHTS[b.priority] || 2;

      if (weightA !== weightB) {
        return weightA - weightB; // Lower priority deleted first
      }

      // If same priority, delete oldest expired first
      return a.minimumRetainUntil.getTime() - b.minimumRetainUntil.getTime();
    });

    let accumulatedReclaimBytes = 0;
    const selectedSegments: RetentionSegmentMetadata[] = [];

    for (const seg of eligible) {
      selectedSegments.push(seg);
      accumulatedReclaimBytes += seg.sizeBytes;
      if (targetReclaimBytes > 0 && accumulatedReclaimBytes >= targetReclaimBytes) {
        break;
      }
    }

    // Fail-loud check: If target reclaim was requested but eligible is 0 despite storage pressure
    const storageExhaustionRisk = targetReclaimBytes > 0 && accumulatedReclaimBytes < targetReclaimBytes;
    const exhaustionWarningMessage = storageExhaustionRisk
      ? `CRITICAL: Storage pressure cannot be relieved. All ${unreclaimableProtectedBytes} bytes are legally protected under minimum retention policies or legal holds. Refusing to delete active evidence.`
      : undefined;

    return {
      eligibleSegments: selectedSegments,
      totalReclaimableBytes: accumulatedReclaimBytes,
      unreclaimableProtectedBytes,
      storageExhaustionRisk,
      exhaustionWarningMessage,
    };
  }
}
