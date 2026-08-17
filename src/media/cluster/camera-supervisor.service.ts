/**
 * Camera Supervisor & Stream Worker Lifecycle Manager
 * Controls camera worker execution contexts, background renewal, and immediate AbortController cancellation upon lease loss
 */

import type { CameraLease, CameraLeaseManager, CameraExecutionContext } from "./camera-lease.types.js";

export type CameraWorkerState =
  | "UNASSIGNED"
  | "ACQUIRING_LEASE"
  | "OWNED"
  | "CONNECTING"
  | "STREAMING"
  | "STOPPING";

export interface ActiveCameraWorker {
  tenantId: string;
  cameraId: string;
  lease: CameraLease;
  state: CameraWorkerState;
  context: CameraExecutionContext;
  renewIntervalTimer?: NodeJS.Timeout;
  startedAt: string;
  lastFrameAt?: string;
  lastKeyframeAt?: string;
}

export class CameraSupervisorService {
  private readonly workers = new Map<string, ActiveCameraWorker>();
  private readonly renewIntervalMs = 5_000;
  private readonly leaseTtlMs = 15_000;

  constructor(
    private readonly leaseManager: CameraLeaseManager,
    private readonly onLeaseLostCallback?: (lease: CameraLease) => void,
  ) {}

  /**
   * Starts a supervised camera worker with atomic lease acquisition
   */
  async startWorker(
    tenantId: string,
    cameraId: string,
    nodeId: string,
    instanceId: string,
  ): Promise<ActiveCameraWorker | null> {
    const workerKey = `${tenantId}:${cameraId}`;
    const existing = this.workers.get(workerKey);
    if (existing && existing.state === "STREAMING") {
      return existing;
    }

    // 1. Acquire Lease atomically
    const lease = await this.leaseManager.acquire(tenantId, cameraId, nodeId, instanceId, this.leaseTtlMs);
    if (!lease) {
      return null;
    }

    // 2. Build execution context with AbortController
    const abortController = new AbortController();
    const context: CameraExecutionContext = {
      tenantId,
      cameraId,
      leaseId: lease.leaseId,
      fencingToken: lease.fencingToken,
      acquiredAt: lease.acquiredAt,
      abortController,
      isOwnerActive: () => !abortController.signal.aborted,
    };

    const worker: ActiveCameraWorker = {
      tenantId,
      cameraId,
      lease,
      state: "OWNED",
      context,
      startedAt: new Date().toISOString(),
    };

    // Transition state machine
    worker.state = "CONNECTING";
    // Simulate stream connection
    worker.state = "STREAMING";
    worker.lastFrameAt = new Date().toISOString();
    worker.lastKeyframeAt = new Date().toISOString();

    // 3. Setup periodic renewal loop
    worker.renewIntervalTimer = setInterval(async () => {
      if (abortController.signal.aborted) {
        clearInterval(worker.renewIntervalTimer);
        return;
      }

      const renewed = await this.leaseManager.renew(lease, this.leaseTtlMs);
      if (!renewed) {
        // LEASE LOST -> Instantly abort all active worker operations
        this.terminateWorker(tenantId, cameraId, "LEASE_RENEWAL_FAILED");
      }
    }, this.renewIntervalMs);

    this.workers.set(workerKey, worker);
    return worker;
  }

  /**
   * Instantly stops a camera worker and signals all pipeline consumers via AbortController
   */
  terminateWorker(tenantId: string, cameraId: string, reason = "MANUAL_STOP"): void {
    const workerKey = `${tenantId}:${cameraId}`;
    const worker = this.workers.get(workerKey);
    if (!worker) return;

    worker.state = "STOPPING";
    if (worker.renewIntervalTimer) {
      clearInterval(worker.renewIntervalTimer);
    }

    // Trigger AbortController signal -> cancels RTSP ingest, segment writing, live routes
    worker.context.abortController.abort(reason);

    worker.state = "UNASSIGNED";
    this.workers.delete(workerKey);

    if (this.onLeaseLostCallback) {
      this.onLeaseLostCallback(worker.lease);
    }
  }

  getWorker(tenantId: string, cameraId: string): ActiveCameraWorker | undefined {
    return this.workers.get(`${tenantId}:${cameraId}`);
  }

  listActiveWorkers(): ActiveCameraWorker[] {
    return Array.from(this.workers.values());
  }
}
