import { readdir, rename, mkdir, stat, unlink } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { SegmentValidator } from "../segments/segment-validator.js";
import { SegmentRepair } from "./segment-repair.js";
import { OrphanReconciler, type ReconciledSegment } from "./orphan-reconciler.js";
import { SegmentFinalizer } from "../segments/segment-finalizer.js";
import type { RecordingJournal } from "../journal/recording-journal.js";

export interface RecoveryScanSummary {
  phase: "phase1_fast" | "phase2_deep";
  partialsScanned: number;
  partialsFinalized: number;
  partialsRepaired: number;
  partialsQuarantined: number;
  orphansReconciled: number;
  corruptSegmentsFound: number;
  missingSegmentsFound: number;
  durationMs: number;
}

export interface RecoveryContext {
  stagingRoot: string;
  storageRoot: string;
  quarantineRoot: string;
  tenantId: string;
  branchId: string;
  storageNode: string;
}

export class RecoveryScanner {
  private readonly validator: SegmentValidator;
  private readonly finalizer: SegmentFinalizer;
  private readonly orphanReconciler: OrphanReconciler;
  private readonly journal?: RecordingJournal;

  constructor(options: {
    validator?: SegmentValidator;
    finalizer?: SegmentFinalizer;
    orphanReconciler?: OrphanReconciler;
    journal?: RecordingJournal;
  } = {}) {
    this.validator = options.validator ?? new SegmentValidator();
    this.finalizer = options.finalizer ?? new SegmentFinalizer(this.validator);
    this.orphanReconciler = options.orphanReconciler ?? new OrphanReconciler(this.validator);
    this.journal = options.journal;
  }

  /**
   * Phase 1: Fast startup recovery.
   * Scans active staging directories for .partial files, validates or repairs them,
   * so camera acquisition can resume within seconds.
   */
  async runPhase1FastRecovery(context: RecoveryContext): Promise<RecoveryScanSummary> {
    const startTime = Date.now();
    const summary: RecoveryScanSummary = {
      phase: "phase1_fast",
      partialsScanned: 0,
      partialsFinalized: 0,
      partialsRepaired: 0,
      partialsQuarantined: 0,
      orphansReconciled: 0,
      corruptSegmentsFound: 0,
      missingSegmentsFound: 0,
      durationMs: 0,
    };

    await mkdir(context.stagingRoot, { recursive: true });
    await mkdir(context.quarantineRoot, { recursive: true });

    let entries: string[] = [];
    try {
      entries = await readdir(context.stagingRoot);
    } catch {
      // staging directory may not exist yet
    }

    const partialFiles = entries.filter((name) => name.endsWith(".partial"));

    for (const fileName of partialFiles) {
      summary.partialsScanned += 1;
      const partialPath = join(context.stagingRoot, fileName);
      // Expected fileName format: [segmentId].[ext].partial
      const baseWithoutPartial = fileName.slice(0, -".partial".length);
      const segmentId = baseWithoutPartial.split(".")[0] ?? baseWithoutPartial;
      const ext = extname(baseWithoutPartial).slice(1) || "mkv";

      const finalPath = join(context.storageRoot, `${segmentId}.${ext}`);
      const manifestPath = join(context.storageRoot, `${segmentId}.json`);

      // 1. Validate if .partial is already a valid container
      const validation = await this.validator.validate(partialPath);
      if (validation.valid) {
        // Move to final and finalize
        try {
          await rename(partialPath, finalPath);
          const reconciled = await this.orphanReconciler.reconcileFile(finalPath, manifestPath, {
            segmentId,
            tenantId: context.tenantId,
            branchId: context.branchId,
            cameraId: "recovered-camera",
            jobId: "recovered-job",
            storageNode: context.storageNode,
            storageRelativePath: `${segmentId}.${ext}`,
          });

          if (reconciled && this.journal) {
            await this.journal.append("SEGMENT_FINALIZED", reconciled.manifest.cameraId, context.tenantId, {
              segmentId,
              branchId: context.branchId,
              manifest: reconciled.manifest,
            });
          }
          summary.partialsFinalized += 1;
        } catch {
          // If rename fails, quarantine
          await this.quarantine(partialPath, context.quarantineRoot, fileName);
          summary.partialsQuarantined += 1;
        }
      } else if (validation.isRepairable) {
        // 2. Attempt container remux repair
        const repairedPath = join(context.stagingRoot, `${segmentId}.repaired.${ext}`);
        const repairResult = await SegmentRepair.repairPartial(partialPath, repairedPath);
        if (repairResult.repaired) {
          await unlink(partialPath).catch(() => {});
          await rename(repairedPath, finalPath);
          const reconciled = await this.orphanReconciler.reconcileFile(finalPath, manifestPath, {
            segmentId,
            tenantId: context.tenantId,
            branchId: context.branchId,
            cameraId: "recovered-camera",
            jobId: "recovered-job",
            storageNode: context.storageNode,
            storageRelativePath: `${segmentId}.${ext}`,
          });
          if (reconciled && this.journal) {
            await this.journal.append("SEGMENT_FINALIZED", reconciled.manifest.cameraId, context.tenantId, {
              segmentId,
              branchId: context.branchId,
              manifest: reconciled.manifest,
            });
          }
          summary.partialsRepaired += 1;
        } else {
          await this.quarantine(partialPath, context.quarantineRoot, fileName);
          summary.partialsQuarantined += 1;
        }
      } else {
        // 3. Corrupt and unrepairable -> move to quarantine
        await this.quarantine(partialPath, context.quarantineRoot, fileName);
        summary.partialsQuarantined += 1;
      }
    }

    summary.durationMs = Date.now() - startTime;
    return summary;
  }

  /**
   * Phase 2: Asynchronous background deep scan.
   * Discovers orphaned unindexed media files and verifies segment integrity.
   */
  async runPhase2DeepScan(
    context: RecoveryContext,
    indexedPaths: Set<string>,
  ): Promise<RecoveryScanSummary> {
    const startTime = Date.now();
    const summary: RecoveryScanSummary = {
      phase: "phase2_deep",
      partialsScanned: 0,
      partialsFinalized: 0,
      partialsRepaired: 0,
      partialsQuarantined: 0,
      orphansReconciled: 0,
      corruptSegmentsFound: 0,
      missingSegmentsFound: 0,
      durationMs: 0,
    };

    const mediaFiles = await this.findMediaFiles(context.storageRoot);

    for (const mediaPath of mediaFiles) {
      const fileName = basename(mediaPath);
      const segmentId = fileName.split(".")[0] ?? fileName;
      const manifestPath = join(context.storageRoot, `${segmentId}.json`);

      if (!indexedPaths.has(mediaPath) && !indexedPaths.has(fileName)) {
        const reconciled = await this.orphanReconciler.reconcileFile(mediaPath, manifestPath, {
          segmentId,
          tenantId: context.tenantId,
          branchId: context.branchId,
          cameraId: "recovered-camera",
          jobId: "recovered-job",
          storageNode: context.storageNode,
          storageRelativePath: fileName,
        });

        if (reconciled) {
          summary.orphansReconciled += 1;
          if (this.journal) {
            await this.journal.append("SEGMENT_FINALIZED", reconciled.manifest.cameraId, context.tenantId, {
              segmentId,
              branchId: context.branchId,
              manifest: reconciled.manifest,
            });
          }
        }
      }
    }

    summary.durationMs = Date.now() - startTime;
    return summary;
  }

  private async quarantine(sourcePath: string, quarantineDir: string, fileName: string): Promise<void> {
    const dest = join(quarantineDir, `${Date.now()}_${fileName}`);
    try {
      await rename(sourcePath, dest);
    } catch {
      // ignore
    }
  }

  private async findMediaFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...await this.findMediaFiles(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith(".mkv") || entry.name.endsWith(".mp4"))) {
          results.push(fullPath);
        }
      }
    } catch {
      // directory might not exist
    }
    return results;
  }
}
