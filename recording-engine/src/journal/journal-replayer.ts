import type { RecordingJournal, JournalEntry } from "./recording-journal.js";

export interface ControlPlaneClient {
  submitSegmentIndex(manifest: Record<string, unknown>): Promise<void>;
  recordGap(gapPayload: Record<string, unknown>): Promise<void>;
}

export class JournalReplayer {
  private readonly journal: RecordingJournal;
  private readonly client: ControlPlaneClient;
  private isReplaying = false;
  private replayedSequences = new Set<number>();

  constructor(journal: RecordingJournal, client: ControlPlaneClient) {
    this.journal = journal;
    this.client = client;
  }

  /**
   * Replays pending WAL entries to the Control Plane index.
   * Returns the count of successfully synced entries.
   */
  async replayPending(): Promise<number> {
    if (this.isReplaying) return 0;
    this.isReplaying = true;

    let syncedCount = 0;
    try {
      const entries = await this.journal.getUnreplayedEntries();

      for (const entry of entries) {
        if (this.replayedSequences.has(entry.sequence)) continue;

        try {
          if (entry.operation === "SEGMENT_FINALIZED" && entry.manifest) {
            await this.client.submitSegmentIndex(entry.manifest);
            this.replayedSequences.add(entry.sequence);
            syncedCount += 1;
          } else if ((entry.operation === "GAP_RECORDED" || entry.operation === "GAP_RESOLVED") && entry.payload) {
            await this.client.recordGap(entry.payload);
            this.replayedSequences.add(entry.sequence);
            syncedCount += 1;
          }
        } catch (err) {
          // If network / DB fails, stop replaying current batch and retry next cycle
          break;
        }
      }
    } finally {
      this.isReplaying = false;
    }

    return syncedCount;
  }

  getPendingCount(): Promise<number> {
    return this.journal.getUnreplayedEntries().then(
      (entries) => entries.filter((e) => !this.replayedSequences.has(e.sequence)).length,
    );
  }
}
