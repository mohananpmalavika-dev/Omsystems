/**
 * Automatic Number Plate Recognition (ANPR) Orchestrator Service
 * 
 * Coordinates optical character syntax normalization, OCR confusion correction,
 * multi-tenant fuzzy watchlist matching, vehicle dwell session pairing,
 * and security alert dispatching.
 */

import { EventEmitter } from 'node:events';
import type { Pool } from 'pg';
import { AnprRepository } from './anpr-repository.js';
import { PlateSyntaxNormalizer } from './plate-syntax-normalizer.js';
import { PlateWatchlistMatcher } from './plate-watchlist-matcher.js';
import type {
  AnprEvaluationResult,
  AnprEventRecord,
  AnprStats,
  AnprVehicleSessionRecord,
  AnprWatchlistPlateRecord,
  AnprWatchlistRecord,
  BoundingBox,
  CharacterReading,
  DirectionType,
  ListAnprEventsFilter,
  ListVehicleSessionsFilter,
  PlateReading,
  ReviewStatus,
  VehicleAttributes,
} from './anpr-types.js';

export interface ProcessDetectionInput {
  tenantId: string;
  cameraId: string;
  cameraName?: string;
  branchId?: string | null;
  rawPlateText: string;
  plateConfidence?: number;
  countryPreference?: string;
  plateBbox?: BoundingBox;
  characters?: CharacterReading[];
  vehicle?: VehicleAttributes;
  entryDirection?: DirectionType;
  snapshotReference?: string;
  plateCropUrl?: string;
  occurredAt?: Date;
}

export interface RecognizePlateInput {
  tenantId: string;
  rawPlateText: string;
  countryPreference?: string;
  plateConfidence?: number;
  plateBbox?: BoundingBox;
  characters?: CharacterReading[];
  vehicle?: VehicleAttributes;
}

export class AnprService extends EventEmitter {
  private readonly repository: AnprRepository;

  constructor(pool?: Pool) {
    super();
    this.repository = new AnprRepository(pool);
  }

  public getRepository(): AnprRepository {
    return this.repository;
  }

  /**
   * Evaluates plate text in-memory through syntax normalization and watchlist matching
   * without saving an event record (ideal for instant test bench or probe verification).
   */
  public async evaluatePlate(input: RecognizePlateInput): Promise<AnprEvaluationResult> {
    const startTime = Date.now();
    const {
      tenantId,
      rawPlateText,
      countryPreference = 'IN',
      plateConfidence = 0.88,
      plateBbox = { x: 0.3, y: 0.6, width: 0.4, height: 0.12 },
      characters = [],
      vehicle,
    } = input;

    // 1. Process plate text: clean, positional grammar repair, and syntax checking
    const processed = PlateSyntaxNormalizer.processPlateText(
      rawPlateText,
      countryPreference,
      characters
    );

    // 2. Optical geometry validation
    const geometry = PlateSyntaxNormalizer.validatePlateGeometry(plateBbox);

    const plateReading: PlateReading = {
      plateNumber: processed.plateNumber,
      normalizedPlate: processed.normalizedPlate,
      confidence: plateConfidence,
      countryCode: processed.countryCode,
      regionCode: processed.regionCode,
      plateType: processed.plateType,
      characters: processed.correctedCharacters,
      plateBbox,
      isValidSyntax: processed.isValidSyntax,
      syntaxFormatName: processed.syntaxFormatName,
      correctionsApplied: processed.correctionsApplied,
      contrastScore: geometry.isValidGeometry ? 0.92 : 0.45,
    };

    // 3. Query active watchlist entries for tenant
    const watchlistEntries = await this.repository.getActiveWatchlistEntries(tenantId);

    // 4. Run exact, wildcard, and fuzzy Levenshtein watchlist matcher
    const match = PlateWatchlistMatcher.matchPlate(processed.normalizedPlate, watchlistEntries);

    const processingTimeMs = Math.max(1, Date.now() - startTime);

    return {
      plate: plateReading,
      vehicle,
      watchlistMatch: match,
      processingTimeMs,
      requiresAlert: match.matched && (match.severity === 'P1' || match.severity === 'P2'),
      observedAt: new Date(),
    };
  }

  /**
   * Full production detection pipeline: processes OCR reading, verifies watchlists,
   * stores incident event in database, updates vehicle parking dwell session, and emits alerts.
   */
  public async processDetection(input: ProcessDetectionInput): Promise<{
    evaluation: AnprEvaluationResult;
    event: AnprEventRecord;
    session: AnprVehicleSessionRecord;
  }> {
    const startTime = Date.now();
    const {
      tenantId,
      cameraId,
      cameraName,
      branchId,
      rawPlateText,
      plateConfidence = 0.92,
      countryPreference = 'IN',
      plateBbox = { x: 0.35, y: 0.65, width: 0.3, height: 0.09 },
      characters = [],
      vehicle,
      entryDirection = 'unknown',
      snapshotReference,
      plateCropUrl,
      occurredAt = new Date(),
    } = input;

    // 1. Run evaluation
    const evaluation = await this.evaluatePlate({
      tenantId,
      rawPlateText,
      countryPreference,
      plateConfidence,
      plateBbox,
      characters,
      vehicle,
    });

    const processingTimeMs = Math.max(1, Date.now() - startTime);

    // 2. Increment match count if watchlist hit
    if (evaluation.watchlistMatch.matched && evaluation.watchlistMatch.plateId) {
      await this.repository.incrementPlateMatchCount(tenantId, evaluation.watchlistMatch.plateId);
    }

    // 3. Persist ANPR event record
    const event = await this.repository.createEvent({
      tenant_id: tenantId,
      camera_id: cameraId,
      branch_id: branchId,
      camera_name: cameraName,
      watchlist_id: evaluation.watchlistMatch.watchlistId,
      watchlist_name: evaluation.watchlistMatch.watchlistName,
      plate_id: evaluation.watchlistMatch.plateId,
      plate_number: evaluation.plate.plateNumber,
      normalized_plate: evaluation.plate.normalizedPlate,
      plate_confidence: evaluation.plate.confidence,
      country_code: evaluation.plate.countryCode,
      region_code: evaluation.plate.regionCode,
      plate_type: evaluation.plate.plateType,
      vehicle_type: vehicle?.category,
      vehicle_color: vehicle?.color,
      vehicle_make: vehicle?.make,
      vehicle_model: vehicle?.model,
      vehicle_bbox: vehicle?.bbox,
      plate_bbox: evaluation.plate.plateBbox,
      ocr_details: {
        characters: evaluation.plate.characters,
        correctionsApplied: evaluation.plate.correctionsApplied,
        syntaxFormat: evaluation.plate.syntaxFormatName,
      },
      snapshot_reference: snapshotReference,
      plate_crop_url: plateCropUrl,
      entry_direction: entryDirection,
      review_status: 'pending',
      processing_time_ms: processingTimeMs,
      occurred_at: occurredAt,
    });

    // 4. Update vehicle dwell session tracking (entry/exit pairing)
    const session = await this.repository.upsertVehicleSession(tenantId, event, cameraName);

    // 5. Emit alert if watchlist match occurred
    if (evaluation.requiresAlert) {
      this.emit('watchlist-hit', {
        tenantId,
        event,
        watchlistMatch: evaluation.watchlistMatch,
        severity: evaluation.watchlistMatch.severity,
      });
    }

    this.emit('detection', { tenantId, event, session });

    return { evaluation, event, session };
  }

  // ==========================================================================
  // DELEGATED OPERATIONS
  // ==========================================================================

  public async listEvents(filter: ListAnprEventsFilter) {
    return this.repository.listEvents(filter);
  }

  public async getEventById(tenantId: string, id: string) {
    return this.repository.getEventById(tenantId, id);
  }

  public async submitReview(
    tenantId: string,
    eventId: string,
    review: { status: ReviewStatus; reviewedBy: string; notes?: string }
  ) {
    return this.repository.reviewEvent(tenantId, eventId, review);
  }

  public async listSessions(filter: ListVehicleSessionsFilter) {
    return this.repository.listSessions(filter);
  }

  public async listWatchlists(tenantId: string) {
    return this.repository.listWatchlists(tenantId);
  }

  public async getWatchlistById(tenantId: string, id: string) {
    return this.repository.getWatchlistById(tenantId, id);
  }

  public async createWatchlist(
    data: Omit<AnprWatchlistRecord, 'id' | 'created_at' | 'updated_at'>
  ) {
    return this.repository.createWatchlist(data);
  }

  public async updateWatchlist(
    tenantId: string,
    id: string,
    patch: Partial<Pick<AnprWatchlistRecord, 'name' | 'description' | 'enabled' | 'alert_on_match' | 'alert_severity' | 'alert_authorities'>>
  ) {
    return this.repository.updateWatchlist(tenantId, id, patch);
  }

  public async deleteWatchlist(tenantId: string, id: string) {
    return this.repository.deleteWatchlist(tenantId, id);
  }

  public async listPlates(tenantId: string, watchlistId: string) {
    return this.repository.listPlates(tenantId, watchlistId);
  }

  public async addPlate(
    data: Omit<AnprWatchlistPlateRecord, 'id' | 'added_at' | 'match_count'>
  ) {
    return this.repository.addPlate(data);
  }

  public async removePlate(tenantId: string, watchlistId: string, plateId: string) {
    return this.repository.removePlate(tenantId, watchlistId, plateId);
  }

  public async getStats(tenantId: string, cameraId?: string): Promise<AnprStats> {
    return this.repository.getStats(tenantId, cameraId);
  }
}
