import { open, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { SegmentManifest } from "../manifest/segment-manifest.js";

export const journalEntryOperationSchema = z.enum([
  "SEGMENT_FINALIZED",
  "SEGMENT_CORRUPT",
  "GAP_RECORDED",
  "GAP_RESOLVED",
  "STORAGE_NODE_ALERT",
]);

export type JournalEntryOperation = z.infer<typeof journalEntryOperationSchema>;

export const journalEntrySchema = z.object({
  sequence: z.number().int().positive(),
  timestamp: z.string().datetime(),
  operation: journalEntryOperationSchema,
  segmentId: z.string().optional(),
  cameraId: z.string().min(1),
  tenantId: z.string().min(1),
  branchId: z.string().optional(),
  manifest: z.record(z.unknown()).optional(),
  payload: z.record(z.unknown()).optional(),
  replayed: z.boolean().default(false),
});

export type JournalEntry = z.infer<typeof journalEntrySchema>;

export class RecordingJournal {
  private readonly journalDir: string;
  private currentSequence = 0;

  constructor(journalDirectory: string) {
    this.journalDir = journalDirectory;
  }

  async init(): Promise<void> {
    await mkdir(this.journalDir, { recursive: true });
    // Scan existing WAL files to determine latest sequence number
    try {
      const files = await readdir(this.journalDir);
      const walFiles = files.filter((f) => f.endsWith(".wal")).sort();
      for (const file of walFiles) {
        const content = await readFile(join(this.journalDir, file), "utf8");
        const lines = content.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (typeof entry.sequence === "number" && entry.sequence > this.currentSequence) {
              this.currentSequence = entry.sequence;
            }
          } catch {
            // Ignore malformed line
          }
        }
      }
    } catch {
      // directory might be new
    }
  }

  getCurrentSequence(): number {
    return this.currentSequence;
  }

  private getWalFilename(date: Date = new Date()): string {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}.wal`;
  }

  /**
   * Appends an entry to the Write-Ahead Log (WAL) and fsyncs to ensure durability.
   */
  async append(
    operation: JournalEntryOperation,
    cameraId: string,
    tenantId: string,
    data: {
      segmentId?: string;
      branchId?: string;
      manifest?: SegmentManifest;
      payload?: Record<string, unknown>;
    } = {},
  ): Promise<JournalEntry> {
    this.currentSequence += 1;
    const now = new Date();

    const entry: JournalEntry = {
      sequence: this.currentSequence,
      timestamp: now.toISOString(),
      operation,
      segmentId: data.segmentId,
      cameraId,
      tenantId,
      branchId: data.branchId,
      manifest: data.manifest as Record<string, unknown> | undefined,
      payload: data.payload,
      replayed: false,
    };

    const filePath = join(this.journalDir, this.getWalFilename(now));
    const handle = await open(filePath, "a");
    try {
      await handle.writeFile(`${JSON.stringify(entry)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    return entry;
  }

  /**
   * Returns all unplayed journal entries across all WAL files.
   */
  async getUnreplayedEntries(): Promise<JournalEntry[]> {
    const entries: JournalEntry[] = [];
    try {
      const files = await readdir(this.journalDir);
      const walFiles = files.filter((f) => f.endsWith(".wal")).sort();

      for (const file of walFiles) {
        const filePath = join(this.journalDir, file);
        const content = await readFile(filePath, "utf8");
        const lines = content.split(/\r?\n/).filter(Boolean);

        for (const line of lines) {
          try {
            const parsed = journalEntrySchema.parse(JSON.parse(line));
            if (!parsed.replayed) {
              entries.push(parsed);
            }
          } catch {
            // skip invalid line
          }
        }
      }
    } catch {
      // directory might be empty
    }
    return entries;
  }
}
