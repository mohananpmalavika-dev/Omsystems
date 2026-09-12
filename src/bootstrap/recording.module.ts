/**
 * Recording Domain Module
 * 
 * Manages recording search index, startup recovery, and continuity ledgers.
 */

import type { Pool } from "pg";
import { moduleRegistry } from "../platform/module-registry.service.js";
import { RecordingStartupRecoveryService } from "../recording/services/recording-startup-recovery.service.js";
import { RecordingContinuityLedgerService } from "../recording/services/recording-continuity-ledger.service.js";
import { AuthoritativeRecordingSearchService } from "../recording/services/authoritative-recording-search.service.js";

export class RecordingModule {
  public recoveryService: RecordingStartupRecoveryService | null = null;
  public continuityService: RecordingContinuityLedgerService | null = null;
  public searchService: AuthoritativeRecordingSearchService | null = null;

  async initialize(pool?: Pool): Promise<void> {
    moduleRegistry.registerModule({
      module: "recordingIndex",
      importance: "CRITICAL",
      state: "STARTING",
      reason: "Initializing recording index and executing crash recovery scanner",
    });

    try {
      this.recoveryService = new RecordingStartupRecoveryService(pool);
      this.continuityService = new RecordingContinuityLedgerService(pool);
      this.searchService = new AuthoritativeRecordingSearchService(pool);

      // Execute crash recovery scan upon startup
      await this.recoveryService.runStartupRecoveryScan().catch(() => {});

      moduleRegistry.updateModuleState("recordingIndex", "READY", "Recording index and recovery scanner active");
    } catch (err: any) {
      moduleRegistry.updateModuleState("recordingIndex", "UNAVAILABLE", err.message);
    }
  }
}

export const recordingModule = new RecordingModule();
