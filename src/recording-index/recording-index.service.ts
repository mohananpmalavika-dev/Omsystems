import type { Pool } from "pg";
import { pool as defaultPool } from "../database/pool.js";
import { RecordingIndexRepository } from "./recording-index.repository.js";
import { RecordingGapService, recordingGapService } from "./recording-gap.service.js";
import { RecordingKeyframeService } from "./recording-keyframe.service.js";
import { RecordingLocationService } from "./recording-location.service.js";
import { RecordingReconciliationService } from "./recording-reconciliation.service.js";
import { RecordingSearchService } from "./recording-search.service.js";
import type {
  ArchiveState,
  KeyframeLookupResult,
  RecordingRangeResult,
  RecordingSearchRequest,
  RecordingSearchResult,
  RecordingSegmentResult,
  RegisterRecordingSegmentInput,
  SegmentReconciliationSummary,
  StorageTier,
} from "./recording-index.types.js";

export class RecordingIndexService {
  private readonly repository: RecordingIndexRepository;
  private readonly gapService: RecordingGapService;
  private readonly keyframeService: RecordingKeyframeService;
  private readonly locationService: RecordingLocationService;
  private readonly reconciliationService: RecordingReconciliationService;
  private readonly searchService: RecordingSearchService;

  constructor(private readonly dbPool: Pool = defaultPool as Pool) {
    this.repository = new RecordingIndexRepository(this.dbPool);
    this.gapService = recordingGapService;
    this.keyframeService = new RecordingKeyframeService(this.dbPool);
    this.locationService = new RecordingLocationService(this.dbPool);
    this.reconciliationService = new RecordingReconciliationService(this.dbPool);
    this.searchService = new RecordingSearchService(
      this.repository,
      this.gapService,
      this.keyframeService,
    );
  }

  /**
   * Authoritative search across cameras returning segments, calculated gaps, and keyframe metadata.
   */
  async findRecording(query: RecordingSearchRequest): Promise<RecordingSearchResult> {
    return this.searchService.search(query);
  }

  /**
   * Finds the exact segment containing a given timestamp.
   */
  async findSegmentAt(cameraId: string, timestamp: Date): Promise<RecordingSegmentResult | null> {
    return this.repository.findSegmentAt(cameraId, timestamp);
  }

  /**
   * Resolves the nearest earlier keyframe for instant seek and scrub operations.
   */
  async findNearestKeyframe(
    cameraId: string,
    timestamp: Date,
    maxLookbackMs?: number,
  ): Promise<KeyframeLookupResult | null> {
    return this.keyframeService.findNearestKeyframe(cameraId, timestamp, maxLookbackMs);
  }

  /**
   * Retrieves earliest and latest recording bounds and storage metrics for a camera.
   */
  async getRecordingRange(cameraId: string): Promise<RecordingRangeResult> {
    const range = await this.repository.getRecordingRange(cameraId);
    return {
      cameraId,
      ...range,
    };
  }

  /**
   * Authoritatively registers a finalized recording segment and its keyframes.
   */
  async registerSegment(input: RegisterRecordingSegmentInput): Promise<RecordingSegmentResult> {
    // 1. Insert/upsert master segment record
    const segment = await this.repository.upsertSegment(input);

    // 2. Register initial storage tier location
    await this.locationService.registerLocation({
      segmentId: segment.segmentId,
      storageNodeId: input.storageNodeId,
      storageTier: input.storageTier || "HOT",
      storageUri: input.storageUri,
      state: "ONLINE",
    });

    // 3. Store keyframes separately if provided
    if (input.keyframes && input.keyframes.length > 0) {
      await this.keyframeService.batchInsertKeyframes(segment.segmentId, input.keyframes);
    }

    return segment;
  }

  /**
   * Transitions segment storage tier (HOT -> WARM -> ARCHIVE) with audit trail.
   */
  async transitionTier(
    segmentId: string,
    newTier: StorageTier,
    newStorageUri: string,
    storageNodeId?: string,
  ): Promise<void> {
    await this.locationService.transitionTier(segmentId, newTier, newStorageUri, storageNodeId);
  }

  /**
   * Updates the archive state of a segment (e.g. ONLINE, ARCHIVED, LEGAL_HOLD).
   */
  async markArchiveState(segmentId: string, state: ArchiveState): Promise<void> {
    await this.dbPool.query(
      `UPDATE recording_segments 
       SET archive_state = $2, indexed_at = now() 
       WHERE id = $1`,
      [segmentId, state],
    );
  }

  /**
   * Marks a segment as deleted in the index.
   */
  async deleteSegment(segmentId: string): Promise<void> {
    await this.dbPool.query(
      `UPDATE recording_segments 
       SET status = 'deleted', archive_state = 'DELETED', indexed_at = now() 
       WHERE id = $1`,
      [segmentId],
    );
  }

  /**
   * Runs verification & reconciliation between storage files and the index.
   */
  async reconcile(segmentIds?: string[]): Promise<SegmentReconciliationSummary> {
    return this.reconciliationService.reconcileSegments(segmentIds);
  }

  get keyframes(): RecordingKeyframeService {
    return this.keyframeService;
  }

  get locations(): RecordingLocationService {
    return this.locationService;
  }

  get gaps(): RecordingGapService {
    return this.gapService;
  }
}

export const recordingIndexService = new RecordingIndexService();
