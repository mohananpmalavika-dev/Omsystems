import type { Pool } from "pg";
import { pool as defaultPool } from "../database/pool.js";
import { InvestigationEventRepository } from "./investigation-event.repository.js";
import { TimelineAggregationService, timelineAggregationService } from "./timeline-aggregation.service.js";
import { recordingIndexService, RecordingIndexService } from "../recording-index/recording-index.service.js";
import type {
  CreateInvestigationEventInput,
  InvestigationSearchRequest,
  InvestigationSearchResult,
  TimelineBucket,
} from "./investigation.types.js";
import type { DbInvestigationEvent } from "../domain/models.js";

export class InvestigationSearchService {
  private readonly eventRepo: InvestigationEventRepository;
  private readonly aggregationService: TimelineAggregationService;
  private readonly recordingIndex: RecordingIndexService;

  constructor(
    pool: Pool = defaultPool as Pool,
    options: {
      eventRepo?: InvestigationEventRepository;
      aggregationService?: TimelineAggregationService;
      recordingIndex?: RecordingIndexService;
    } = {},
  ) {
    this.eventRepo = options.eventRepo || new InvestigationEventRepository(pool);
    this.aggregationService = options.aggregationService || timelineAggregationService;
    this.recordingIndex = options.recordingIndex || (pool ? new RecordingIndexService(pool) : recordingIndexService);
  }

  /**
   * Unified investigation search: correlates video recording intervals, gaps, and timeline events
   */
  async search(request: InvestigationSearchRequest): Promise<InvestigationSearchResult> {
    // 1. Fetch video recording coverage & gaps from authoritative RecordingIndex if cameraIds are given
    const videoCoverage = request.cameraIds && request.cameraIds.length > 0
      ? (await this.recordingIndex.findRecording({
          tenantId: request.tenantId,
          cameraIds: request.cameraIds,
          from: request.from,
          to: request.to,
          includeGaps: true,
          includeKeyframes: false,
        })).cameras
      : [];

    // 2. Fetch correlated investigation events from EventIndex
    const events = await this.eventRepo.queryEvents(request);

    // 3. Compute event summary counts
    const eventSummary: Record<string, number> = {};
    for (const ev of events) {
      eventSummary[ev.eventType] = (eventSummary[ev.eventType] || 0) + 1;
      if (ev.objectType) {
        const objKey = `object.${ev.objectType.toLowerCase()}`;
        eventSummary[objKey] = (eventSummary[objKey] || 0) + 1;
      }
    }

    // 4. Optionally generate resolution-aware timeline buckets
    let timelineBuckets: TimelineBucket[] | undefined;
    if (request.resolutionSeconds && request.resolutionSeconds > 0) {
      timelineBuckets = this.aggregationService.aggregate(
        request.from,
        request.to,
        request.resolutionSeconds,
        events,
        videoCoverage,
      );
    }

    return {
      from: request.from,
      to: request.to,
      videoCoverage,
      events,
      eventSummary,
      timelineBuckets,
    };
  }

  /**
   * Ingests a new forensic investigation event
   */
  async recordEvent(input: CreateInvestigationEventInput): Promise<DbInvestigationEvent> {
    return this.eventRepo.insertEvent(input);
  }

  get repository(): InvestigationEventRepository {
    return this.eventRepo;
  }
}

export const investigationSearchService = new InvestigationSearchService();
