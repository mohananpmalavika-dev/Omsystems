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

/**
 * The node-local bridge to the real ingest process.  Ownership alone is never
 * treated as a running stream: the bridge must resolve only after the target
 * node has accepted the worker and can report it ready.
 */
export type CameraWorkerLauncher = (context: CameraExecutionContext) => Promise<void>;

export class CameraSupervisorService {
  private readonly workers = new Map<string, ActiveCameraWorker>();
  private readonly renewIntervalMs = 5_000;
  private readonly leaseTtlMs = 15_000;

  constructor(
    private readonly leaseManager: CameraLeaseManager,
    private readonly onLeaseLostCallback?: (lease: CameraLease) => void,
    private readonly launchWorker?: CameraWorkerLauncher,
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

    return this.activateLease(lease);
  }

  /** Activates a lease that was atomically transferred by the failover coordinator. */
  async activateLease(lease: CameraLease): Promise<ActiveCameraWorker | null> {
    const workerKey = `${lease.tenantId}:${lease.cameraId}`;
    const existing = this.workers.get(workerKey);
    if (existing?.lease.leaseId === lease.leaseId && existing.state === "STREAMING") return existing;

    // Build execution context with AbortController.
    const abortController = new AbortController();
    const context: CameraExecutionContext = {
      tenantId: lease.tenantId,
      cameraId: lease.cameraId,
      leaseId: lease.leaseId,
      fencingToken: lease.fencingToken,
      acquiredAt: lease.acquiredAt,
      abortController,
      isOwnerActive: () => !abortController.signal.aborted,
    };

    const worker: ActiveCameraWorker = {
      tenantId: lease.tenantId,
      cameraId: lease.cameraId,
      lease,
      state: "OWNED",
      context,
      startedAt: new Date().toISOString(),
    };

    // A lease proves ownership only; it is not evidence that the camera stream
    // is connected. Fail closed when a deployment did not provide the real
    // node-local launcher.
    worker.state = "CONNECTING";
    if (!this.launchWorker) return this.failActivation(worker, "MEDIA_INGEST_WORKER_NOT_CONFIGURED");

    try {
      await this.launchWorker(context);
      if (context.abortController.signal.aborted) return this.failActivation(worker, "MEDIA_INGEST_WORKER_ABORTED");
      worker.state = "STREAMING";
      this.workers.set(workerKey, worker);
      worker.renewIntervalTimer = setInterval(() => {
        void this.leaseManager.renew(lease, this.leaseTtlMs).then((renewed) => {
          if (!renewed) this.terminateWorker(lease.tenantId, lease.cameraId, "LEASE_RENEWAL_FAILED");
        }).catch(() => this.terminateWorker(lease.tenantId, lease.cameraId, "LEASE_RENEWAL_FAILED"));
      }, this.renewIntervalMs);
      worker.renewIntervalTimer.unref?.();
      return worker;
    } catch {
      return this.failActivation(worker, "MEDIA_INGEST_WORKER_START_FAILED");
    }

  }

  private async failActivation(worker: ActiveCameraWorker, reason: string): Promise<null> {
    await this.leaseManager.release(worker.lease);
    worker.context.abortController.abort(reason);
    return null;
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
