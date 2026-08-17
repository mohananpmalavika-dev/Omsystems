/**
 * Fencing Token & Authoritative Epoch Verification Service
 * Ensures split-brain writes are rejected and generates immutable segment paths
 */

import type { SegmentWriteRequest, SegmentWriteResult } from "./camera-lease.types.js";

export class FencingTokenService {
  private readonly cameraRuntimeEpochs = new Map<string, number>();

  /**
   * Generates immutable recording path containing ownership epoch and nodeId
   * Example: recordings/tenant-01/CAM-101/2026/08/17/16/42/00-18452-media03.mkv
   */
  generateImmutableSegmentPath(
    tenantId: string,
    cameraId: string,
    fencingToken: number,
    nodeId: string,
    startTime = new Date().toISOString(),
  ): string {
    const date = new Date(startTime);
    const yyyy = date.getUTCFullYear().toString();
    const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
    const dd = date.getUTCDate().toString().padStart(2, "0");
    const hh = date.getUTCHours().toString().padStart(2, "0");
    const min = date.getUTCMinutes().toString().padStart(2, "0");
    const ss = date.getUTCSeconds().toString().padStart(2, "0");

    const sanitizedNode = nodeId.replace(/[^a-zA-Z0-9_-]/g, "");
    return `recordings/${tenantId}/${cameraId}/${yyyy}/${mm}/${dd}/${hh}/${min}/${ss}-${fencingToken}-${sanitizedNode}.mkv`;
  }

  /**
   * Validates incoming recording segment against the camera's authoritative epoch
   */
  verifyAndCommitSegment(request: SegmentWriteRequest): SegmentWriteResult {
    const key = `${request.tenantId}:${request.cameraId}`;
    const currentEpoch = this.cameraRuntimeEpochs.get(key) ?? 0;

    // Reject stale writes if a newer epoch has already taken over
    if (request.fencingToken < currentEpoch) {
      return {
        accepted: false,
        authoritativePath: "",
        currentAuthoritativeEpoch: currentEpoch,
        rejectionReason: "STALE_OWNER_REJECTED",
      };
    }

    // Advance authoritative epoch to the incoming valid token
    this.cameraRuntimeEpochs.set(key, request.fencingToken);

    const authoritativePath =
      request.storagePath ||
      this.generateImmutableSegmentPath(
        request.tenantId,
        request.cameraId,
        request.fencingToken,
        request.nodeId,
        request.startTime,
      );

    return {
      accepted: true,
      authoritativePath,
      currentAuthoritativeEpoch: request.fencingToken,
    };
  }

  getAuthoritativeEpoch(tenantId: string, cameraId: string): number {
    return this.cameraRuntimeEpochs.get(`${tenantId}:${cameraId}`) ?? 0;
  }

  setAuthoritativeEpoch(tenantId: string, cameraId: string, epoch: number): void {
    this.cameraRuntimeEpochs.set(`${tenantId}:${cameraId}`, epoch);
  }
}

export const fencingTokenService = new FencingTokenService();
