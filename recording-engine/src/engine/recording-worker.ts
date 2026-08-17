import { RecordingSession, type RecordingSessionConfig } from "./recording-session.js";
import type { RecordingJournal } from "../journal/recording-journal.js";
import type { RecordingGapTracker } from "../gaps/recording-gap-tracker.js";
import type { StorageNodeManager } from "../storage/storage-node-manager.js";

export interface ManagedWorker {
  session: RecordingSession;
  config: RecordingSessionConfig;
  startedAt: Date;
}

export class RecordingWorkerPool {
  private workers = new Map<string, ManagedWorker>();

  constructor(
    private readonly dependencies: {
      journal: RecordingJournal;
      gapTracker: RecordingGapTracker;
      storageManager: StorageNodeManager;
    },
  ) {}

  async startWorker(config: RecordingSessionConfig): Promise<ManagedWorker> {
    await this.stopWorker(config.cameraId);

    const session = new RecordingSession(config, this.dependencies);
    const worker: ManagedWorker = {
      session,
      config,
      startedAt: new Date(),
    };

    this.workers.set(config.cameraId, worker);
    await session.start();
    return worker;
  }

  async stopWorker(cameraId: string): Promise<void> {
    const existing = this.workers.get(cameraId);
    if (existing) {
      await existing.session.stop();
      this.workers.delete(cameraId);
    }
  }

  getWorker(cameraId: string): ManagedWorker | undefined {
    return this.workers.get(cameraId);
  }

  getAllWorkers(): ManagedWorker[] {
    return [...this.workers.values()];
  }

  async stopAll(): Promise<void> {
    for (const cameraId of this.workers.keys()) {
      await this.stopWorker(cameraId);
    }
  }
}
