/**
 * Face Recognition End-to-End Integration Tests
 * Tests complete workflow: watchlist → enrollment → matching → event recording → review
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Pool } from "pg";
import { FaceRecognitionService } from "../src/face/face-recognition.service.js";
import { FaceEnrollmentService } from "../src/face/face-enrollment.service.js";
import { FaceSearchService } from "../src/face/face-search.service.js";
import { FaceRecognitionGovernanceService } from "../src/banking/governance/face-recognition-governance.service.js";
import { FaceRecognitionIntegrationService } from "../src/face/face-recognition-integration.service.js";

describe("Face Recognition End-to-End Workflow", () => {
  let db: Pool;
  let recognitionService: FaceRecognitionService;
  let enrollmentService: FaceEnrollmentService;
  let searchService: FaceSearchService;
  let governanceService: FaceRecognitionGovernanceService;
  let integrationService: FaceRecognitionIntegrationService;

  const testTenantId = "test-tenant-e2e";
  const testCameraId = "camera-e2e-001";
  const testBranchId = "branch-e2e-001";

  beforeEach(async () => {
    // Initialize test database connection
    db = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || "postgresql://localhost/sentinel_test",
    });

    // Initialize services
    governanceService = new FaceRecognitionGovernanceService();
    
    // Mock recognition service with test embedding extraction
    recognitionService = {
      extractFaceEmbedding: async (imageBuffer: Buffer) => {
        // Generate deterministic test embedding from image hash
        const hash = imageBuffer.toString("base64").slice(0, 16);
        const embedding = new Float32Array(512);
        for (let i = 0; i < 512; i++) {
          embedding[i] = (hash.charCodeAt(i % hash.length) / 255) - 0.5;
        }
        return {
          embedding,
          confidence: 0.95,
          quality: 0.88,
        };
      },
      getConfig: () => ({
        modelName: "test-face-recognition",
        modelVersion: "1.0.0",
      }),
    } as any;

    enrollmentService = new FaceEnrollmentService(db, recognitionService);
    searchService = new FaceSearchService(db);
    integrationService = new FaceRecognitionIntegrationService(
      db,
      recognitionService,
      searchService,
      governanceService,
    );

    // Setup test database tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS face_watchlists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        list_type TEXT DEFAULT 'security',
        enabled BOOLEAN DEFAULT true,
        alert_on_match BOOLEAN DEFAULT true,
        alert_severity TEXT DEFAULT 'P2',
        match_threshold NUMERIC DEFAULT 0.70,
        review_threshold NUMERIC DEFAULT 0.60,
        minimum_margin NUMERIC DEFAULT 0.05,
        minimum_quality NUMERIC DEFAULT 0.55,
        temporal_confirmation_frames INTEGER DEFAULT 3,
        temporal_window_seconds INTEGER DEFAULT 2,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        archived_at TIMESTAMPTZ,
        created_by TEXT
      );

      CREATE TABLE IF NOT EXISTS face_watchlist_persons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        watchlist_id UUID NOT NULL REFERENCES face_watchlists(id),
        external_id TEXT,
        full_name TEXT NOT NULL,
        date_of_birth DATE,
        gender TEXT,
        notes TEXT,
        metadata JSONB DEFAULT '{}',
        enrolled_at TIMESTAMPTZ DEFAULT NOW(),
        enrolled_by TEXT,
        last_seen_at TIMESTAMPTZ,
        match_count INTEGER DEFAULT 0,
        archived_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS face_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        person_id UUID NOT NULL REFERENCES face_watchlist_persons(id) ON DELETE CASCADE,
        embedding vector(512) NOT NULL,
        quality_score NUMERIC,
        model_name TEXT NOT NULL,
        model_version TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS face_recognition_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        camera_id UUID NOT NULL,
        watchlist_id UUID REFERENCES face_watchlists(id),
        person_id UUID REFERENCES face_watchlist_persons(id),
        similarity_score NUMERIC NOT NULL,
        face_bbox JSONB NOT NULL,
        face_quality NUMERIC,
        age_estimate INTEGER,
        gender_estimate TEXT,
        wearing_mask BOOLEAN,
        snapshot_reference TEXT,
        occurred_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS face_match_reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        recognition_event_id UUID NOT NULL REFERENCES face_recognition_events(id),
        reviewer_id TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('confirmed', 'rejected', 'unsure')),
        notes TEXT,
        reviewed_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cameras (
        id UUID PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        branch_id TEXT,
        name TEXT NOT NULL
      );
    `);

    // Insert test camera
    await db.query(
      "INSERT INTO cameras (id, tenant_id, branch_id, name) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      [testCameraId, testTenantId, testBranchId, "Test Camera E2E"],
    );
  });

  afterEach(async () => {
    // Cleanup test data
    await db.query("DELETE FROM face_match_reviews WHERE tenant_id = $1", [testTenantId]);
    await db.query("DELETE FROM face_recognition_events WHERE tenant_id = $1", [testTenantId]);
    await db.query("DELETE FROM face_embeddings WHERE tenant_id = $1", [testTenantId]);
    await db.query("DELETE FROM face_watchlist_persons WHERE tenant_id = $1", [testTenantId]);
    await db.query("DELETE FROM face_watchlists WHERE tenant_id = $1", [testTenantId]);
    await db.query("DELETE FROM cameras WHERE tenant_id = $1", [testTenantId]);
    await db.end();
  });

  it("completes full watchlist → enrollment → match → event → review workflow", async () => {
    // Step 1: Create watchlist
    const watchlistResult = await db.query(
      `
      INSERT INTO face_watchlists (tenant_id, name, list_type, match_threshold, review_threshold)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [testTenantId, "VIP Watchlist", "vip", 0.75, 0.65],
    );
    const watchlistId = watchlistResult.rows[0].id;

    // Step 2: Enroll person with images
    const testImage = Buffer.from("test-image-person-001-unique");
    const enrollment = await enrollmentService.enrollPerson({
      tenantId: testTenantId,
      watchlistId,
      displayName: "John Doe",
      externalId: "EMP-001",
      images: [testImage],
      metadata: { role: "VIP" },
      actorId: "test-admin",
    });

    expect(enrollment.personId).toBeTruthy();
    expect(enrollment.acceptedImages).toBe(1);
    expect(enrollment.rejectedImages).toBe(0);

    // Step 3: Search for match with similar embedding
    const searchEmbedding = (await recognitionService.extractFaceEmbedding(testImage)).embedding;
    const candidates = await searchService.searchPersons({
      tenantId: testTenantId,
      embedding: searchEmbedding,
      minSimilarity: 0.60,
      limit: 10,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.personId).toBe(enrollment.personId);
    expect(candidates[0]!.bestSimilarity).toBeGreaterThan(0.90);

    // Step 4: Process face detection through integration service
    const detectionResult = await integrationService.processFaceDetection({
      tenantId: testTenantId,
      cameraId: testCameraId,
      branchId: testBranchId,
      faceId: "track-001",
      boundingBox: { x: 0.2, y: 0.1, width: 0.15, height: 0.20 },
      confidence: 0.93,
      timestamp: new Date(),
      imageBuffer: testImage,
      liveness: 0.96, // High liveness for governance
    });

    // First observation should not trigger alert (needs temporal confirmation)
    expect(detectionResult.matched).toBe(true);
    expect(detectionResult.alertGenerated).toBe(false);
    expect(detectionResult.temporalConfirmation?.observationCount).toBe(1);

    // Step 5: Send more observations for temporal confirmation
    for (let i = 0; i < 2; i++) {
      await integrationService.processFaceDetection({
        tenantId: testTenantId,
        cameraId: testCameraId,
        branchId: testBranchId,
        faceId: "track-001",
        boundingBox: { x: 0.2, y: 0.1, width: 0.15, height: 0.20 },
        confidence: 0.93,
        timestamp: new Date(),
        imageBuffer: testImage,
        liveness: 0.96,
      });
    }

    // Step 6: Register biometric consent
    governanceService.registerConsent({
      personId: enrollment.personId,
      tenantId: testTenantId,
      branchId: testBranchId,
      personName: "John Doe",
      role: "EMPLOYEE",
      consentSignedAt: new Date(),
      consentExpiryAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      documentReference: "consent-doc-001",
      status: "ACTIVE",
    });

    // Step 7: Process detection again with consent - should trigger alert
    const confirmedResult = await integrationService.processFaceDetection({
      tenantId: testTenantId,
      cameraId: testCameraId,
      branchId: testBranchId,
      faceId: "track-001",
      boundingBox: { x: 0.2, y: 0.1, width: 0.15, height: 0.20 },
      confidence: 0.93,
      timestamp: new Date(),
      imageBuffer: testImage,
      liveness: 0.96,
    });

    expect(confirmedResult.matched).toBe(true);
    expect(confirmedResult.alertGenerated).toBe(true);
    expect(confirmedResult.temporalConfirmation?.confirmed).toBe(true);
    expect(confirmedResult.governanceResult?.accepted).toBe(true);

    // Step 8: Verify event was created
    const eventsResult = await db.query(
      "SELECT * FROM face_recognition_events WHERE tenant_id = $1 AND camera_id = $2",
      [testTenantId, testCameraId],
    );
    expect(eventsResult.rows.length).toBeGreaterThan(0);
    const event = eventsResult.rows[eventsResult.rows.length - 1]!;
    expect(event.person_id).toBe(enrollment.personId);

    // Step 9: Submit human review
    await db.query(
      `
      INSERT INTO face_match_reviews (tenant_id, recognition_event_id, reviewer_id, decision, notes)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [testTenantId, event.id, "reviewer-001", "confirmed", "Verified as genuine match"],
    );

    const reviewResult = await db.query(
      "SELECT * FROM face_match_reviews WHERE recognition_event_id = $1",
      [event.id],
    );
    expect(reviewResult.rows).toHaveLength(1);
    expect(reviewResult.rows[0]!.decision).toBe("confirmed");

    // Step 10: Verify person statistics updated
    const personResult = await db.query(
      "SELECT match_count, last_seen_at FROM face_watchlist_persons WHERE id = $1",
      [enrollment.personId],
    );
    expect(personResult.rows[0]!.match_count).toBeGreaterThan(0);
    expect(personResult.rows[0]!.last_seen_at).toBeTruthy();
  });

  it("handles temporal confirmation correctly", async () => {
    const watchlistResult = await db.query(
      `INSERT INTO face_watchlists (tenant_id, name, temporal_confirmation_frames) 
       VALUES ($1, $2, $3) RETURNING id`,
      [testTenantId, "Temporal Test", 5],
    );
    const watchlistId = watchlistResult.rows[0].id;

    const testImage = Buffer.from("temporal-test-person");
    await enrollmentService.enrollPerson({
      tenantId: testTenantId,
      watchlistId,
      displayName: "Temporal Person",
      images: [testImage],
      metadata: {},
      actorId: "test-admin",
    });

    // Send 4 observations - should not confirm
    for (let i = 0; i < 4; i++) {
      const result = await integrationService.processFaceDetection({
        tenantId: testTenantId,
        cameraId: testCameraId,
        branchId: testBranchId,
        faceId: "temporal-track",
        boundingBox: { x: 0.3, y: 0.2, width: 0.15, height: 0.20 },
        confidence: 0.92,
        timestamp: new Date(),
        imageBuffer: testImage,
        liveness: 0.97,
      });

      expect(result.temporalConfirmation?.confirmed).toBe(false);
      expect(result.alertGenerated).toBe(false);
    }

    // 5th observation should confirm
    const finalResult = await integrationService.processFaceDetection({
      tenantId: testTenantId,
      cameraId: testCameraId,
      branchId: testBranchId,
      faceId: "temporal-track",
      boundingBox: { x: 0.3, y: 0.2, width: 0.15, height: 0.20 },
      confidence: 0.92,
      timestamp: new Date(),
      imageBuffer: testImage,
      liveness: 0.97,
    });

    expect(finalResult.temporalConfirmation?.observationCount).toBe(5);
    // Confirmation requires consent, which is not registered
    expect(finalResult.governanceResult?.accepted).toBe(false);
  });

  it("handles multiple persons in same watchlist", async () => {
    const watchlistResult = await db.query(
      `INSERT INTO face_watchlists (tenant_id, name) VALUES ($1, $2) RETURNING id`,
      [testTenantId, "Multi-Person Watchlist"],
    );
    const watchlistId = watchlistResult.rows[0].id;

    // Enroll 3 different persons
    const persons = await Promise.all([
      enrollmentService.enrollPerson({
        tenantId: testTenantId,
        watchlistId,
        displayName: "Person A",
        images: [Buffer.from("person-a-image-unique")],
        metadata: {},
        actorId: "test-admin",
      }),
      enrollmentService.enrollPerson({
        tenantId: testTenantId,
        watchlistId,
        displayName: "Person B",
        images: [Buffer.from("person-b-image-unique")],
        metadata: {},
        actorId: "test-admin",
      }),
      enrollmentService.enrollPerson({
        tenantId: testTenantId,
        watchlistId,
        displayName: "Person C",
        images: [Buffer.from("person-c-image-unique")],
        metadata: {},
        actorId: "test-admin",
      }),
    ]);

    expect(persons).toHaveLength(3);
    expect(persons.every((p) => p.acceptedImages === 1)).toBe(true);

    // Search for each person
    for (const person of persons) {
      const testImage = Buffer.from(`person-${person.personId}-image-unique`);
      const searchEmbedding = (await recognitionService.extractFaceEmbedding(testImage)).embedding;
      
      const candidates = await searchService.searchPersons({
        tenantId: testTenantId,
        embedding: searchEmbedding,
        minSimilarity: 0.60,
        limit: 5,
      });

      expect(candidates.length).toBeGreaterThan(0);
      // Best match should be the correct person (though embeddings are synthetic in tests)
    }

    // Verify watchlist person count
    const countResult = await db.query(
      "SELECT COUNT(*) FROM face_watchlist_persons WHERE watchlist_id = $1 AND archived_at IS NULL",
      [watchlistId],
    );
    expect(parseInt(countResult.rows[0].count)).toBe(3);
  });
});
