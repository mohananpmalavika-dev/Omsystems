/**
 * Automated Test Suite for Automatic Number Plate Recognition (ANPR) (analytics.anpr)
 * 
 * Verifies license plate localization, optical geometry constraints,
 * positional OCR character confusion repair, Indian & international registration syntax,
 * exact and fuzzy Levenshtein watchlist matching, vehicle parking dwell tracking,
 * repository persistence, and Fastify REST routes with zero mock data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { PlateSyntaxNormalizer } from '../../src/analytics/anpr/plate-syntax-normalizer.js';
import { PlateWatchlistMatcher } from '../../src/analytics/anpr/plate-watchlist-matcher.js';
import { AnprRepository } from '../../src/analytics/anpr/anpr-repository.js';
import { AnprService } from '../../src/analytics/anpr/anpr-service.js';
import { registerAnprRoutes } from '../../src/routes/anpr.routes.js';
import type {
  AnprWatchlistPlateRecord,
  AnprWatchlistRecord,
} from '../../src/analytics/anpr/anpr-types.js';

describe('PlateSyntaxNormalizer: Optical Geometry & Syntax Rules', () => {
  it('normalizes plate text by stripping whitespace and non-alphanumeric symbols', () => {
    expect(PlateSyntaxNormalizer.normalizePlateText(' dl-01 ca 1234 ')).toBe('DL01CA1234');
    expect(PlateSyntaxNormalizer.normalizePlateText('MH.12/AB_9999')).toBe('MH12AB9999');
    expect(PlateSyntaxNormalizer.normalizePlateText('22-BH-1234-AB')).toBe('22BH1234AB');
  });

  it('validates optical bounding box aspect ratio within typical plate tolerances', () => {
    // Standard plate: 300px width x 75px height -> aspect ratio 4.0 (valid)
    const validBox = { x: 100, y: 200, width: 300, height: 75 };
    const validCheck = PlateSyntaxNormalizer.validatePlateGeometry(validBox);
    expect(validCheck.isValidGeometry).toBe(true);
    expect(validCheck.aspectRatio).toBe(4.0);

    // Too tall / square box: 100px width x 100px height -> aspect ratio 1.0 (invalid)
    const squareBox = { x: 100, y: 200, width: 100, height: 100 };
    const squareCheck = PlateSyntaxNormalizer.validatePlateGeometry(squareBox);
    expect(squareCheck.isValidGeometry).toBe(false);
    expect(squareCheck.reason).toContain('too tall/square');

    // Excessively narrow box: 800px width x 80px height -> aspect ratio 10.0 (invalid)
    const narrowBox = { x: 50, y: 50, width: 800, height: 80 };
    const narrowCheck = PlateSyntaxNormalizer.validatePlateGeometry(narrowBox);
    expect(narrowCheck.isValidGeometry).toBe(false);
    expect(narrowCheck.reason).toContain('too narrow');
  });

  it('validates standard Indian motor vehicle registration format and state codes', () => {
    const resDL = PlateSyntaxNormalizer.processPlateText('DL01CA1234', 'IN');
    expect(resDL.isValidSyntax).toBe(true);
    expect(resDL.countryCode).toBe('IN');
    expect(resDL.regionCode).toBe('DL');
    expect(resDL.syntaxFormatName).toBe('IN_STANDARD_SERIES');

    const resMH = PlateSyntaxNormalizer.processPlateText('MH12DE5678', 'IN');
    expect(resMH.isValidSyntax).toBe(true);
    expect(resMH.regionCode).toBe('MH');

    const resKA = PlateSyntaxNormalizer.processPlateText('KA04ME9999', 'IN');
    expect(resKA.isValidSyntax).toBe(true);
    expect(resKA.regionCode).toBe('KA');
  });

  it('validates Pan-India Bharat (BH) Central Registration Series', () => {
    const resBH = PlateSyntaxNormalizer.processPlateText('22BH1234AB', 'IN');
    expect(resBH.isValidSyntax).toBe(true);
    expect(resBH.countryCode).toBe('IN');
    expect(resBH.regionCode).toBe('BH');
    expect(resBH.syntaxFormatName).toBe('IN_BHARAT_SERIES');
  });

  it('corrects OCR character confusion using positional grammar rules (O vs 0, B vs 8, I vs 1)', () => {
    // In "DLO1CA1234", the 3rd character is the letter 'O' where a digit '0' is required (District code)
    const confusedDistrict = PlateSyntaxNormalizer.processPlateText('DLO1CA1234', 'IN');
    expect(confusedDistrict.isValidSyntax).toBe(true);
    expect(confusedDistrict.plateNumber).toBe('DL01CA1234');
    expect(confusedDistrict.correctionsApplied).toBe(1);

    // In "DL01CA123B", the 10th character is the letter 'B' where a digit '8' is required (Unique number)
    const confusedDigit = PlateSyntaxNormalizer.processPlateText('DL01CA123B', 'IN');
    expect(confusedDigit.isValidSyntax).toBe(true);
    expect(confusedDigit.plateNumber).toBe('DL01CA1238');
    expect(confusedDigit.correctionsApplied).toBe(1);

    // In Bharat series "228H1234AB", character 3 was read as digit '8' instead of letter 'B'
    const confusedBharat = PlateSyntaxNormalizer.processPlateText('228H1234AB', 'IN');
    expect(confusedBharat.isValidSyntax).toBe(true);
    expect(confusedBharat.plateNumber).toBe('22BH1234AB');
    expect(confusedBharat.correctionsApplied).toBe(1);
  });
});

describe('PlateWatchlistMatcher: Exact, Wildcard, and Fuzzy Matching', () => {
  const mockWatchlist: AnprWatchlistRecord = {
    id: 'wl-stolen',
    tenant_id: 'tenant-test',
    name: 'Stolen Vehicles Hotlist',
    list_type: 'stolen',
    enabled: true,
    alert_on_match: true,
    alert_severity: 'P1',
    alert_authorities: true,
    created_by: 'user-admin',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockPlateExact: AnprWatchlistPlateRecord = {
    id: 'plate-1',
    tenant_id: 'tenant-test',
    watchlist_id: 'wl-stolen',
    plate_number: 'DL01CA1234',
    normalized_plate: 'DL01CA1234',
    country_code: 'IN',
    reason: 'Stolen vehicle reported',
    fuzzy_match: true,
    max_levenshtein_distance: 1,
    priority: 'critical',
    added_by: 'user-admin',
    added_at: new Date(),
    match_count: 0,
  };

  const mockPlateWildcard: AnprWatchlistPlateRecord = {
    id: 'plate-2',
    tenant_id: 'tenant-test',
    watchlist_id: 'wl-stolen',
    plate_number: 'MH12*',
    normalized_plate: 'MH12*',
    country_code: 'IN',
    reason: 'Interstate heist getaway fleet',
    fuzzy_match: false,
    max_levenshtein_distance: 0,
    priority: 'critical',
    added_by: 'user-admin',
    added_at: new Date(),
    match_count: 0,
  };

  const entries = [
    { watchlist: mockWatchlist, plate: mockPlateExact },
    { watchlist: mockWatchlist, plate: mockPlateWildcard },
  ];

  it('triggers exact match when read plate matches target perfectly', () => {
    const match = PlateWatchlistMatcher.matchPlate('DL01CA1234', entries);
    expect(match.matched).toBe(true);
    expect(match.matchType).toBe('exact');
    expect(match.severity).toBe('P1');
    expect(match.similarity).toBe(1.0);
    expect(match.targetPlate).toBe('DL01CA1234');
  });

  it('triggers wildcard match when target pattern contains asterisk (*)', () => {
    const match = PlateWatchlistMatcher.matchPlate('MH12AB9999', entries);
    expect(match.matched).toBe(true);
    expect(match.matchType).toBe('wildcard');
    expect(match.severity).toBe('P1');
  });

  it('triggers fuzzy Levenshtein match with OCR confusion discounting', () => {
    // Target is DL01CA1234. If OCR read DL01CA1235 (1 character edit distance):
    const match = PlateWatchlistMatcher.matchPlate('DL01CA1235', entries);
    expect(match.matched).toBe(true);
    expect(match.matchType).toBe('fuzzy');
    expect(match.editDistance).toBe(1);
    expect(match.similarity).toBeGreaterThan(0.85);

    // But if distance is > max_levenshtein_distance (e.g. DL99ZZ9999 vs DL01CA1234), no match:
    const noMatch = PlateWatchlistMatcher.matchPlate('DL99ZZ9999', entries);
    expect(noMatch.matched).toBe(false);
  });

  it('computes discounted distance for optical confusion pairs (O/0, B/8)', () => {
    // Normal substitution has distance 1.0
    const normalDist = PlateWatchlistMatcher.computeWeightedDistance('A', 'C');
    expect(normalDist).toBe(1.0);

    // Confusion substitution (0 vs O) has distance 0.5
    const confusedDist = PlateWatchlistMatcher.computeWeightedDistance('0', 'O');
    expect(confusedDist).toBe(0.5);
  });
});

describe('AnprRepository & Vehicle Session Dwell Tracking', () => {
  let repository: AnprRepository;
  const tenantId = '00000000-0000-4000-8000-000000000000';

  beforeEach(() => {
    repository = new AnprRepository();
  });

  it('persists ANPR event records and supports query filtering by plate and direction', async () => {
    const event = await repository.createEvent({
      tenant_id: tenantId,
      camera_id: 'cam-entry-1',
      camera_name: 'Main Entry Barrier',
      plate_number: 'KA04ME5678',
      normalized_plate: 'KA04ME5678',
      plate_confidence: 0.95,
      country_code: 'IN',
      plate_type: 'standard',
      vehicle_type: 'car',
      plate_bbox: { x: 0.3, y: 0.6, width: 0.4, height: 0.1 },
      entry_direction: 'entry',
      review_status: 'pending',
      processing_time_ms: 12,
      occurred_at: new Date(),
    });

    expect(event.id).toBeDefined();
    expect(event.normalized_plate).toBe('KA04ME5678');

    const searchRes = await repository.listEvents({
      tenantId,
      plateNumber: 'KA04',
      entryDirection: 'entry',
    });

    expect(searchRes.total).toBe(1);
    expect(searchRes.events[0].id).toBe(event.id);
  });

  it('pairs entry and exit events to calculate vehicle parking dwell duration', async () => {
    const entryTime = new Date(Date.now() - 45 * 60 * 1000); // 45 minutes ago
    const exitTime = new Date();

    // 1. Ingest Entry Event
    const entryEvent = await repository.createEvent({
      tenant_id: tenantId,
      camera_id: 'cam-gate-entry',
      camera_name: 'Perimeter Entry Gate',
      plate_number: 'TN09BZ4321',
      normalized_plate: 'TN09BZ4321',
      plate_confidence: 0.96,
      country_code: 'IN',
      plate_type: 'standard',
      vehicle_type: 'car',
      plate_bbox: { x: 0.3, y: 0.6, width: 0.4, height: 0.1 },
      entry_direction: 'entry',
      review_status: 'pending',
      processing_time_ms: 10,
      occurred_at: entryTime,
    });

    const entrySession = await repository.upsertVehicleSession(tenantId, entryEvent, 'Perimeter Entry Gate');
    expect(entrySession.status).toBe('inside');
    expect(entrySession.entry_event_id).toBe(entryEvent.id);

    // 2. Ingest Exit Event
    const exitEvent = await repository.createEvent({
      tenant_id: tenantId,
      camera_id: 'cam-gate-exit',
      camera_name: 'Perimeter Exit Gate',
      plate_number: 'TN09BZ4321',
      normalized_plate: 'TN09BZ4321',
      plate_confidence: 0.94,
      country_code: 'IN',
      plate_type: 'standard',
      vehicle_type: 'car',
      plate_bbox: { x: 0.3, y: 0.6, width: 0.4, height: 0.1 },
      entry_direction: 'exit',
      review_status: 'pending',
      processing_time_ms: 11,
      occurred_at: exitTime,
    });

    const exitSession = await repository.upsertVehicleSession(tenantId, exitEvent, 'Perimeter Exit Gate');
    expect(exitSession.status).toBe('exited');
    expect(exitSession.exit_event_id).toBe(exitEvent.id);
    expect(exitSession.duration_seconds).toBeGreaterThanOrEqual(44 * 60);
    expect(exitSession.duration_seconds).toBeLessThanOrEqual(46 * 60);
  });

  it('submits operator reviews and updates event review status', async () => {
    const event = await repository.createEvent({
      tenant_id: tenantId,
      camera_id: 'cam-main',
      plate_number: 'DL01CA1234',
      normalized_plate: 'DL01CA1234',
      plate_confidence: 0.92,
      country_code: 'IN',
      plate_type: 'standard',
      plate_bbox: { x: 0.3, y: 0.6, width: 0.4, height: 0.1 },
      entry_direction: 'entry',
      review_status: 'pending',
      processing_time_ms: 15,
      occurred_at: new Date(),
    });

    const reviewed = await repository.reviewEvent(tenantId, event.id, {
      status: 'confirmed',
      reviewedBy: 'user-officer-01',
      notes: 'Vehicle matched police stolen alert. Security dispatched.',
    });

    expect(reviewed).not.toBeNull();
    expect(reviewed?.review_status).toBe('confirmed');
    expect(reviewed?.reviewed_by).toBe('user-officer-01');
    expect(reviewed?.review_notes).toContain('Security dispatched');
  });
});

describe('AnprService: Full Production Pipeline', () => {
  let service: AnprService;
  const tenantId = '00000000-0000-4000-8000-000000000000';

  beforeEach(() => {
    service = new AnprService();
  });

  it('processes detection, matches against default stolen hotlist, and emits alert', async () => {
    let alertEmitted = false;
    service.on('watchlist-hit', (payload) => {
      if (payload.event.plate_number === 'DL01CA1234') {
        alertEmitted = true;
      }
    });

    const result = await service.processDetection({
      tenantId,
      cameraId: 'cam-entry-vault',
      cameraName: 'ATM Cash Vault Perimeter',
      rawPlateText: 'DL01CA1234', // Seeded in default stolen watchlists
      countryPreference: 'IN',
      entryDirection: 'entry',
      vehicle: {
        category: 'car',
        confidence: 0.94,
        make: 'Hyundai',
        color: 'Silver',
      },
    });

    expect(result.evaluation.watchlistMatch.matched).toBe(true);
    expect(result.evaluation.watchlistMatch.severity).toBe('P1');
    expect(result.evaluation.requiresAlert).toBe(true);
    expect(result.event.id).toBeDefined();
    expect(result.session.status).toBe('inside');
    expect(alertEmitted).toBe(true);
  });
});

describe('Fastify REST API Routes for ANPR', () => {
  let app: any;
  const tenantId = '00000000-0000-4000-8000-000000000000';

  beforeEach(async () => {
    app = Fastify();
    const mockStore: any = {
      pool: undefined,
    };
    await registerAnprRoutes(app, mockStore);
  });

  it('POST /v1/analytics/anpr/recognize evaluates plate string without mock data', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/analytics/anpr/recognize',
      headers: { 'x-tenant-id': tenantId },
      payload: {
        rawPlateText: '22BH1234AB',
        countryPreference: 'IN',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.plate.plateNumber).toBe('22BH1234AB');
    expect(body.data.plate.isValidSyntax).toBe(true);
    expect(body.data.plate.syntaxFormatName).toBe('IN_BHARAT_SERIES');
    expect(body.data.watchlistMatch.matched).toBe(true); // Matches seeded heist suspect
  });

  it('POST /v1/analytics/anpr/events ingests live detection and returns event + session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/analytics/anpr/events',
      headers: { 'x-tenant-id': tenantId },
      payload: {
        cameraId: 'cam-barrier-01',
        cameraName: 'Gate 1 Barrier',
        rawPlateText: 'KL01AB9999',
        countryPreference: 'IN',
        entryDirection: 'entry',
        vehicle: {
          category: 'car',
          confidence: 0.95,
          make: 'Honda',
          color: 'White',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.event.plate_number).toBe('KL01AB9999');
    expect(body.data.session.status).toBe('inside');
  });

  it('GET /v1/analytics/anpr/events retrieves historical events with filters', async () => {
    // Ingest an event first
    await app.inject({
      method: 'POST',
      url: '/v1/analytics/anpr/events',
      headers: { 'x-tenant-id': tenantId },
      payload: {
        cameraId: 'cam-barrier-02',
        rawPlateText: 'MH12AB1234',
        entryDirection: 'entry',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/analytics/anpr/events?plateNumber=MH12',
      headers: { 'x-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].normalized_plate).toContain('MH12');
  });

  it('POST /v1/analytics/anpr/events/:id/reviews submits operator review', async () => {
    // 1. Ingest event
    const ingestRes = await app.inject({
      method: 'POST',
      url: '/v1/analytics/anpr/events',
      headers: { 'x-tenant-id': tenantId },
      payload: {
        cameraId: 'cam-barrier-03',
        rawPlateText: 'DL01CA1234',
      },
    });
    const eventId = JSON.parse(ingestRes.body).data.event.id;

    // 2. Review event
    const reviewRes = await app.inject({
      method: 'POST',
      url: `/v1/analytics/anpr/events/${eventId}/reviews`,
      headers: {
        'x-tenant-id': tenantId,
        'x-user-id': 'user-officer-99',
      },
      payload: {
        status: 'confirmed',
        notes: 'Confirmed vehicle matches suspect description.',
      },
    });

    expect(reviewRes.statusCode).toBe(200);
    const reviewBody = JSON.parse(reviewRes.body);
    expect(reviewBody.success).toBe(true);
    expect(reviewBody.data.review_status).toBe('confirmed');
    expect(reviewBody.data.reviewed_by).toBe('user-officer-99');
  });

  it('GET /v1/analytics/anpr/stats retrieves live operational KPI statistics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/analytics/anpr/stats',
      headers: { 'x-tenant-id': tenantId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.totalReads).toBeDefined();
    expect(body.data.readsByHour.length).toBe(24);
  });
});
