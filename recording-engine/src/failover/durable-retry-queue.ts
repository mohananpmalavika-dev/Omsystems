/**
 * Durable Storage Retry Queue
 * 
 * Persists store-and-forward retry jobs durably on disk to survive process crashes.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeAtomic } from "../staging/atomic-write-helper.js";

export type RetryJobState = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "DEAD_LETTER";

export interface RetryQueueEntry {
  jobId: string;
  segmentId: string;
  recordingId: string;
  cameraId: string;
  tenantId: string;
  branchId: string;
  sourcePath: string; // Local staging file path
  targetNodeId: string;
  targetTier: string;
  expectedSha256: string;
  expectedSizeBytes: number;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  createdAt: string;
  lastAttemptAt?: string;
  lastError?: string;
  state: RetryJobState;
}

export class DurableRetryQueue {
  private queueFile: string;
  private entries: Map<string, RetryQueueEntry> = new Map();
  private isLoaded = false;

  constructor(storageDir: string) {
    this.queueFile = join(storageDir, "storage-retry-queue.json");
  }

  async init(): Promise<void> {
    if (this.isLoaded) return;
    await mkdir(dirname(this.queueFile), { recursive: true });

    try {
      const data = await readFile(this.queueFile, "utf8");
      const list: RetryQueueEntry[] = JSON.parse(data);
      for (const item of list) {
        // Reset running jobs from crashed process back to PENDING
        if (item.state === "RUNNING") {
          item.state = "PENDING";
        }
        this.entries.set(item.jobId, item);
      }
    } catch {
      // File doesn't exist yet -> start clean
      this.entries.clear();
    }

    this.isLoaded = true;
  }

  private async persist(): Promise<void> {
    const list = Array.from(this.entries.values());
    const payload = Buffer.from(JSON.stringify(list, null, 2), "utf8");
    await writeAtomic(this.queueFile, payload);
  }

  async enqueue(
    entry: Omit<RetryQueueEntry, "jobId" | "attempts" | "state" | "createdAt" | "nextAttemptAt">,
  ): Promise<RetryQueueEntry> {
    await this.init();

    const jobId = `job-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const fullEntry: RetryQueueEntry = {
      ...entry,
      jobId,
      attempts: 0,
      state: "PENDING",
      createdAt: new Date().toISOString(),
      nextAttemptAt: new Date().toISOString(),
    };

    this.entries.set(jobId, fullEntry);
    await this.persist();
    return fullEntry;
  }

  async getNextPending(): Promise<RetryQueueEntry | undefined> {
    await this.init();
    const now = new Date().toISOString();

    for (const item of this.entries.values()) {
      if (item.state === "PENDING" && item.nextAttemptAt <= now) {
        item.state = "RUNNING";
        item.lastAttemptAt = now;
        item.attempts++;
        await this.persist();
        return item;
      }
    }

    return undefined;
  }

  async markSucceeded(jobId: string): Promise<void> {
    await this.init();
    const item = this.entries.get(jobId);
    if (item) {
      item.state = "SUCCEEDED";
      this.entries.delete(jobId); // Remove completed job
      await this.persist();
    }
  }

  async markFailed(jobId: string, error: string): Promise<void> {
    await this.init();
    const item = this.entries.get(jobId);
    if (item) {
      item.lastError = error;
      if (item.attempts >= item.maxAttempts) {
        item.state = "DEAD_LETTER";
      } else {
        item.state = "PENDING";
        // Exponential backoff
        const delaySeconds = Math.min(Math.pow(2, item.attempts) * 10, 3600);
        item.nextAttemptAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
      }
      await this.persist();
    }
  }

  async getDepth(): Promise<{ pending: number; running: number; deadLetter: number; total: number }> {
    await this.init();
    let pending = 0;
    let running = 0;
    let deadLetter = 0;

    for (const item of this.entries.values()) {
      if (item.state === "PENDING") pending++;
      else if (item.state === "RUNNING") running++;
      else if (item.state === "DEAD_LETTER") deadLetter++;
    }

    return {
      pending,
      running,
      deadLetter,
      total: this.entries.size,
    };
  }

  async getAll(): Promise<RetryQueueEntry[]> {
    await this.init();
    return Array.from(this.entries.values());
  }
}
