import { randomUUID } from "node:crypto";
import type {
  StreamLease,
  StreamLeaseAcquireInput,
  CameraCapabilitiesDurable,
} from "../domain/distributed-lease.types.js";
import type { StreamLeaseRepository } from "../domain/stream-lease-repository.contract.js";
import type { MediaGatewayRegistry } from "../domain/media-gateway-registry.contract.js";
import type { CameraCapabilityRepository } from "../domain/camera-capability-repository.contract.js";
import { MediaMetricsService } from "./media-metrics.service.js";

const DEFAULT_LEASE_RENEWAL_INTERVAL_MS = 10_000; // Renew every 10s for 30s TTL

export interface ActiveStreamSession {
  lease: StreamLease;
  viewers: Set<string>; // sessionIds subscribed to this stream
  renewalTimer?: NodeJS.Timeout;
}

export class GlobalStreamCoordinator {
  private readonly instanceId = `backend-${randomUUID().slice(0, 8)}`;
  private readonly localActiveStreams = new Map<string, ActiveStreamSession>();
  private readonly metrics = MediaMetricsService.getInstance();

  constructor(
    private readonly leaseRepository: StreamLeaseRepository,
    private readonly gatewayRegistry: MediaGatewayRegistry,
    private readonly capabilityRepository: CameraCapabilityRepository,
  ) {}

  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Acquire or join a cluster-wide stream relay.
   * If another backend instance already owns the active relay, returns the shared relay URL
   * without creating a duplicate RTSP/transcode pipeline on the camera or gateway!
   */
  async acquireStream(
    cameraId: string,
    sessionId: string,
    streamProfile: "main" | "sub" | "preview" = "main",
    preferredRegion?: string,
  ): Promise<StreamLease> {
    const streamKey = `${cameraId}:${streamProfile}`;

    // 1. Check if this instance already has an active stream relay for this camera
    const localSession = this.localActiveStreams.get(streamKey);
    if (localSession && localSession.lease.expiresAt > Date.now()) {
      localSession.viewers.add(sessionId);
      return localSession.lease;
    }

    // 2. Check if another cluster instance already owns an active distributed lease in Redis
    const clusterLease = await this.leaseRepository.getByCamera(cameraId, streamProfile);
    if (clusterLease && clusterLease.expiresAt > Date.now()) {
      this.metrics.recordLeaseAcquired();
      // Join the existing cluster lease
      let active = this.localActiveStreams.get(streamKey);
      if (!active) {
        active = { lease: clusterLease, viewers: new Set([sessionId]) };
        this.localActiveStreams.set(streamKey, active);
      } else {
        active.viewers.add(sessionId);
      }
      return clusterLease;
    }

    // 3. Query camera capabilities from multi-tier cache / database
    const capabilities = await this.capabilityRepository.getCapabilities(cameraId);
    const selectedProfile = capabilities?.profiles.find((p) => p.name === streamProfile) || {
      name: streamProfile,
      width: 1920,
      height: 1080,
      fps: 25,
      codec: "H264",
      bitrateKbps: streamProfile === "main" ? 2048 : 512,
    };

    // 4. Select the optimal healthy media gateway in the cluster
    const optimalGateway = await this.gatewayRegistry.selectOptimalGateway(
      preferredRegion,
      (selectedProfile.bitrateKbps || 2048) / 1000,
    );
    const gatewayId = optimalGateway?.gatewayId || "gateway-primary-1";

    // 5. Reserve gateway capacity
    await this.gatewayRegistry.reserveSlot(
      gatewayId,
      cameraId,
      sessionId,
      (selectedProfile.bitrateKbps || 2048) / 1000,
    );

    // 6. Atomically acquire distributed stream lease in Redis with NX/PX & unique token
    const leaseInput: StreamLeaseAcquireInput = {
      cameraId,
      streamProfile,
      sessionId,
      ownerInstanceId: this.instanceId,
      preferredGatewayId: gatewayId,
      ttlMs: 30_000,
      bitrateKbps: selectedProfile.bitrateKbps,
    };

    let acquiredLease = await this.leaseRepository.acquire(leaseInput);

    if (!acquiredLease) {
      // Race condition: another node acquired it concurrently; re-read the winning lease
      this.metrics.recordLeaseConflict();
      const existingLease = await this.leaseRepository.getByCamera(cameraId, streamProfile);
      if (existingLease) {
        let active = this.localActiveStreams.get(streamKey);
        if (!active) {
          active = { lease: existingLease, viewers: new Set([sessionId]) };
          this.localActiveStreams.set(streamKey, active);
        } else {
          active.viewers.add(sessionId);
        }
        return existingLease;
      }
      throw new Error(`Failed to acquire distributed stream lease for camera ${cameraId}`);
    }

    this.metrics.recordLeaseAcquired();
    this.metrics.recordRelayStarted();

    // 7. Track locally and setup automatic lease renewal loop
    const activeStream: ActiveStreamSession = {
      lease: acquiredLease,
      viewers: new Set([sessionId]),
      renewalTimer: this.startLeaseRenewal(acquiredLease),
    };
    this.localActiveStreams.set(streamKey, activeStream);

    return acquiredLease;
  }

  /**
   * Release a stream when a viewer closes a tile or changes channels.
   * If other viewers are still watching, keeps the stream active.
   * When the last viewer disconnects, releases the cluster lease via token-guarded script.
   */
  async releaseStream(
    cameraId: string,
    sessionId: string,
    streamProfile = "main",
  ): Promise<boolean> {
    const streamKey = `${cameraId}:${streamProfile}`;
    const active = this.localActiveStreams.get(streamKey);
    if (!active) return false;

    active.viewers.delete(sessionId);

    // If viewers are still watching locally, keep lease alive
    if (active.viewers.size > 0) {
      return true;
    }

    // No local viewers remaining; clear renewal timer and release distributed lease
    if (active.renewalTimer) {
      clearInterval(active.renewalTimer);
    }
    this.localActiveStreams.delete(streamKey);

    const released = await this.leaseRepository.release(
      active.lease.leaseId,
      active.lease.token,
    );

    if (released) {
      this.metrics.recordLeaseReleased();
      this.metrics.recordRelayStopped();
    }
    return released;
  }

  /**
   * Background renewal loop maintaining Redis TTL while active viewers exist.
   */
  private startLeaseRenewal(lease: StreamLease): NodeJS.Timeout {
    return setInterval(async () => {
      const streamKey = `${lease.cameraId}:${lease.streamProfile}`;
      const active = this.localActiveStreams.get(streamKey);
      if (!active || active.viewers.size === 0) {
        if (active?.renewalTimer) clearInterval(active.renewalTimer);
        return;
      }

      const renewed = await this.leaseRepository.renew(lease.leaseId, lease.token, 30_000);
      if (renewed) {
        this.metrics.recordLeaseRenewed();
        lease.expiresAt = Date.now() + 30_000;
      } else {
        // Token mismatch or lease lost in Redis
        console.warn(`[GlobalStreamCoordinator] Lease renewal failed for camera ${lease.cameraId}`);
      }
    }, DEFAULT_LEASE_RENEWAL_INTERVAL_MS);
  }

  /**
   * Gracefully release all streams owned by this instance during graceful shutdown.
   */
  async shutdown(): Promise<void> {
    for (const [key, active] of this.localActiveStreams.entries()) {
      if (active.renewalTimer) clearInterval(active.renewalTimer);
      try {
        await this.leaseRepository.release(active.lease.leaseId, active.lease.token);
      } catch {
        // ignore on shutdown
      }
    }
    this.localActiveStreams.clear();
  }
}
