/**
 * Snapshot Service
 * 
 * Provides lightweight JPEG snapshots for branch mosaic views,
 * preventing unnecessary high-bandwidth video streaming during idle monitoring.
 */

import type { CameraSnapshot } from "../domain/media-session.types.js";

export class SnapshotService {
  private snapshots: Map<string, CameraSnapshot> = new Map(); // key: cameraId

  async getLatestSnapshot(cameraId: string, branchId = "branch-01"): Promise<CameraSnapshot> {
    const existing = this.snapshots.get(cameraId);
    const now = new Date();

    // Cache snapshot for 30 seconds
    if (existing && (now.getTime() - existing.capturedAt.getTime()) < 30_000) {
      return existing;
    }

    // Capture lightweight snapshot
    const snapshot: CameraSnapshot = {
      cameraId,
      branchId,
      capturedAt: now,
      width: 640,
      height: 360,
      objectKey: `snapshots/${branchId}/${cameraId}/latest.jpg`,
      source: "RECORDER",
    };
    this.snapshots.set(cameraId, snapshot);
    return snapshot;
  }

  clear() {
    this.snapshots.clear();
  }
}

export const snapshotService = new SnapshotService();
