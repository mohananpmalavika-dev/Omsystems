/**
 * QA Worker Pool
 *
 * In-memory pool managing active worker threads, event subscriptions,
 * cancellation handles, and live status registry.
 */

import { QARunWorker } from "./qa-run.worker.js";
import type { QARunConfig, QARunProgressEvent } from "../types/qa.types.js";

export class QAWorkerPool {
  private static instance: QAWorkerPool | null = null;
  private activeWorkers = new Map<string, QARunWorker>();
  private progressListeners = new Map<string, Set<(event: QARunProgressEvent) => void>>();
  private cachedLatestEvents = new Map<string, QARunProgressEvent>();

  static getInstance(): QAWorkerPool {
    if (!QAWorkerPool.instance) {
      QAWorkerPool.instance = new QAWorkerPool();
    }
    return QAWorkerPool.instance;
  }

  /**
   * Start a new audit worker
   */
  startWorker(config: QARunConfig, onComplete?: (result: any) => Promise<void>): QARunWorker {
    // If worker already exists, cancel old
    if (this.activeWorkers.has(config.id)) {
      this.cancelWorker(config.id);
    }

    const worker = new QARunWorker(config);
    this.activeWorkers.set(config.id, worker);

    worker.on("progress", (event: QARunProgressEvent) => {
      this.cachedLatestEvents.set(config.id, event);
      const listeners = this.progressListeners.get(config.id);
      if (listeners) {
        listeners.forEach((listener) => {
          try {
            listener(event);
          } catch (err) {
            console.warn("[QAWorkerPool] Progress listener error:", err);
          }
        });
      }
    });

    // Execute in background
    (async () => {
      try {
        const result = await worker.execute();
        if (onComplete) {
          await onComplete({ ...result, entities: worker.getEntities() });
        }
      } catch (err) {
        console.error(`[QAWorkerPool] Worker ${config.id} unhandled error:`, err);
      } finally {
        this.activeWorkers.delete(config.id);
      }
    })();

    return worker;
  }

  /**
   * Get active worker instance
   */
  getWorker(runId: string): QARunWorker | undefined {
    return this.activeWorkers.get(runId);
  }

  /**
   * Pause worker
   */
  pauseWorker(runId: string): boolean {
    const worker = this.activeWorkers.get(runId);
    if (worker) {
      worker.pause();
      return true;
    }
    return false;
  }

  /**
   * Resume worker
   */
  resumeWorker(runId: string): boolean {
    const worker = this.activeWorkers.get(runId);
    if (worker) {
      worker.resume();
      return true;
    }
    return false;
  }

  /**
   * Cancel worker
   */
  async cancelWorker(runId: string): Promise<boolean> {
    const worker = this.activeWorkers.get(runId);
    if (worker) {
      await worker.cancel();
      this.activeWorkers.delete(runId);
      return true;
    }
    return false;
  }

  /**
   * Subscribe to live progress events
   */
  subscribeProgress(runId: string, listener: (event: QARunProgressEvent) => void): () => void {
    if (!this.progressListeners.has(runId)) {
      this.progressListeners.set(runId, new Set());
    }
    this.progressListeners.get(runId)!.add(listener);

    // Replay latest event if available
    const latest = this.cachedLatestEvents.get(runId);
    if (latest) {
      listener(latest);
    }

    return () => {
      const listeners = this.progressListeners.get(runId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.progressListeners.delete(runId);
        }
      }
    };
  }
}
