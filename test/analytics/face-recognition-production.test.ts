import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  calculateCosineSimilarity,
  activeFaceRegistryMatches,
  recordFaceRegistryMatches,
  recordFaceMatchReview,
  localIdentityState,
} from "../../src/analytics/identity-registry.js";
import { LocalFaceMatcherService } from "../../src/ai/services/local-face-matcher.service.js";
import { registerAnalyticsPhase2Routes } from "../../src/routes/analytics-phase2.routes.js";
import { registerLocalAiAnalyticsRoutes } from "../../src/routes/local-ai-analytics.routes.js";
import { MemoryStore } from "../../src/store.js";

function makeUnitVector(seed: number): number[] {
  const vec: number[] = [];
  for (let i = 0; i < 512; i++) {
    vec.push(Math.sin(seed * (i + 1)));
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

describe("Face Recognition & Watchlist Matching Production Hardening", () => {
  describe("Mathematical Cosine Similarity & Normalization Contracts", () => {
    it("computes exact 1.0 similarity for identical vectors", () => {
      const vec = makeUnitVector(0.42);
      const similarity = calculateCosineSimilarity(vec, vec);
      expect(similarity).toBeCloseTo(1.0, 4);
    });

    it("computes near 0 for orthogonal/uncorrelated vectors", () => {
      const vecA = new Array(512).fill(0);
      const vecB = new Array(512).fill(0);
      for (let i = 0; i < 256; i++) vecA[i] = 1 / Math.sqrt(256);
      for (let i = 256; i < 512; i++) vecB[i] = 1 / Math.sqrt(256);

      const similarity = calculateCosineSimilarity(vecA, vecB);
      expect(similarity).toBe(0);
    });

    it("rejects non-512 dimensional vectors in local face matcher", async () => {
      const matcher = new LocalFaceMatcherService();
      await expect(
        matcher.matchFace({
          cameraId: "cam-1",
          branchId: "branch-1",
          embeddingVector: [0.1, 0.2, 0.3],
        }),
      ).rejects.toThrow("exactly 512 finite values");
    });

    it("rejects unnormalized vectors in enrollment", () => {
      const matcher = new LocalFaceMatcherService();
      expect(() =>
        matcher.enrollFace({
          personId: "p-invalid",
          name: "Invalid Vector",
          watchlistType: "SUSPECT",
          embeddingVector: new Array(512).fill(10), // Norm >> 1.1
          enrolledAt: new Date(),
        }),
      ).toThrow("normalized before matching");
    });

    it("rejects threshold outside the [0.50, 0.99] range", async () => {
      const matcher = new LocalFaceMatcherService();
      const validVec = makeUnitVector(0.1);
      await expect(
        matcher.matchFace({
          cameraId: "cam-1",
          branchId: "branch-1",
          embeddingVector: validVec,
          minThreshold: 0.2,
        }),
      ).rejects.toThrow("between 0.50 and 0.99");
    });
  });

  describe("Active Face Registry & Vector Search (In-Memory Engine)", () => {
    let store: MemoryStore;
    const tenantId = "omsystems-bank-hq";

    beforeEach(() => {
      store = new MemoryStore();
      const state = localIdentityState(store);
      state.faceWatchlists = [
        {
          id: "wl-vip-1",
          tenantId,
          name: "High Net Worth VIPs",
          listType: "vip",
          alertSeverity: "P3",
          alertOnMatch: true,
          enabled: true,
        },
        {
          id: "wl-suspect-1",
          tenantId,
          name: "Wanted Suspects",
          listType: "security",
          alertSeverity: "P1",
          alertOnMatch: true,
          enabled: true,
        },
      ];
      state.facePersons = [
        {
          id: "person-vip-1",
          tenantId,
          watchlistId: "wl-vip-1",
          fullName: "Alexander Pierce",
          externalId: "VIP-9901",
          embedding: makeUnitVector(0.123),
          matchCount: 0,
          lastSeenAt: null,
        },
        {
          id: "person-suspect-1",
          tenantId,
          watchlistId: "wl-suspect-1",
          fullName: "Known Intruder",
          externalId: "SUS-007",
          embedding: makeUnitVector(0.888),
          matchCount: 0,
          lastSeenAt: null,
        },
      ];
      state.faceEvents = [];
    });

    it("matches probe vector to exact enrolled identity with > 0.99 similarity", async () => {
      const probeVec = makeUnitVector(0.123);
      const matches = await activeFaceRegistryMatches(store, tenantId, probeVec, {
        minSimilarity: 0.80,
        limit: 5,
      });

      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0]!.personId).toBe("person-vip-1");
      expect(matches[0]!.personName).toBe("Alexander Pierce");
      expect(matches[0]!.watchlistName).toBe("High Net Worth VIPs");
      expect(matches[0]!.similarity).toBeCloseTo(1.0, 2);
    });

    it("filters out candidates below the requested similarity threshold", async () => {
      // Unrelated seed
      const probeVec = makeUnitVector(0.555);
      const matches = await activeFaceRegistryMatches(store, tenantId, probeVec, {
        minSimilarity: 0.85,
      });
      expect(matches).toHaveLength(0);
    });

    it("scopes vector search by watchlistIds filter", async () => {
      const probeVec = makeUnitVector(0.123);
      // Query with only suspect watchlist - should not match VIP
      const matches = await activeFaceRegistryMatches(store, tenantId, probeVec, {
        watchlistIds: ["wl-suspect-1"],
        minSimilarity: 0.50,
      });
      expect(matches.every((m) => m.watchlistId === "wl-suspect-1")).toBe(true);
      expect(matches.some((m) => m.personId === "person-vip-1")).toBe(false);
    });

    it("records face recognition events and updates person lastSeenAt and matchCount", async () => {
      const eventResult = await recordFaceRegistryMatches(store, tenantId, {
        cameraId: "cam-main-entrance",
        watchlistId: "wl-vip-1",
        personId: "person-vip-1",
        similarityScore: 0.942,
        faceBbox: { x: 0.2, y: 0.15, width: 0.12, height: 0.18 },
        occurredAt: "2026-09-11T12:00:00.000Z",
      });

      expect(eventResult.id).toBeDefined();
      expect(eventResult.reviewStatus).toBe("pending");

      // Verify human review workflow
      const reviewResult = await recordFaceMatchReview(store, tenantId, {
        eventId: eventResult.id,
        reviewerId: "user-operator-1",
        decision: "confirmed",
        notes: "Verified identity visually from live camera.",
      });

      expect(reviewResult.status).toBe("confirmed");
      expect(reviewResult.reviewedAt).toBeDefined();
    });
  });

  describe("Fastify REST API Face Recognition Endpoints", () => {
    let app: FastifyInstance;
    let store: MemoryStore;
    const superadmin = { "x-user-id": "user-superadmin-mgdhanyamohan" };

    beforeEach(async () => {
      store = new MemoryStore();
      store.cameras.set("cam-lobby-01", {
        id: "cam-lobby-01",
        name: "Lobby Camera 01",
        branchId: "A005",
        nodeId: "company-1",
        model: "standard-ip",
        ipAddress: "192.168.1.100",
        rtspUrl: "rtsp://192.168.1.100/live",
        status: "online",
        zone: "ENTRANCE",
      } as any);
      app = Fastify();
      app.decorateRequest("currentUser");
      app.addHook("preHandler", async (request, reply) => {
        const identity = request.headers["x-user-id"];
        const user = typeof identity === "string" ? await store.getUser(identity) : undefined;
        if (!user) return reply.code(401).send({ error: "unauthorized" });
        request.currentUser = user;
      });
      await registerAnalyticsPhase2Routes(app, store);
      await registerLocalAiAnalyticsRoutes(app, store);
    });

    afterEach(async () => app.close());

    it("creates a face watchlist, enrols an identity, and matches probe vector via API", async () => {
      // 1. Create face watchlist
      const created = await app.inject({
        method: "POST",
        url: "/v1/analytics/face-watchlists",
        headers: superadmin,
        payload: {
          name: "Executive VIP List",
          listType: "vip",
          alertOnMatch: true,
          alertSeverity: "P2",
        },
      });
      expect(created.statusCode).toBe(201);
      const watchlistId = created.json().data.id;

      const testEmbedding = makeUnitVector(0.777);

      // 2. Enrol person with embedding
      const enrolled = await app.inject({
        method: "POST",
        url: `/v1/analytics/face-watchlists/${watchlistId}/persons`,
        headers: superadmin,
        payload: {
          fullName: "Evelyn Reed",
          gender: "female",
          embedding: testEmbedding,
          metadata: { role: "Board Member" },
        },
      });
      expect(enrolled.statusCode).toBe(201);
      expect(enrolled.json().data.fullName).toBe("Evelyn Reed");

      // 3. Search face match via /v1/analytics/face-match
      const searchRes = await app.inject({
        method: "POST",
        url: "/v1/analytics/face-match",
        headers: superadmin,
        payload: {
          embedding: testEmbedding,
          minSimilarity: 0.85,
        },
      });
      expect(searchRes.statusCode).toBe(200);
      const searchData = searchRes.json().data;
      expect(searchData.matched).toBe(true);
      expect(searchData.bestMatch.personName).toBe("Evelyn Reed");
      expect(searchData.bestMatch.similarity).toBeCloseTo(1.0, 2);

      // 4. Record a face recognition event
      const eventRes = await app.inject({
        method: "POST",
        url: "/v1/analytics/face-events",
        headers: superadmin,
        payload: {
          cameraId: "cam-lobby-01",
          watchlistId,
          personId: enrolled.json().data.id,
          similarityScore: 0.985,
          faceBbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
          faceQuality: 0.96,
          occurredAt: new Date().toISOString(),
        },
      });
      expect(eventRes.statusCode).toBe(201);
      const eventId = eventRes.json().data.id;

      // 5. Submit Human-in-the-loop review
      const reviewRes = await app.inject({
        method: "POST",
        url: `/v1/analytics/face-events/${eventId}/reviews`,
        headers: superadmin,
        payload: {
          decision: "confirmed",
          notes: "Confirmed VIP entry by door attendant.",
        },
      });
      expect(reviewRes.statusCode).toBe(201);
      expect(reviewRes.json().data.status).toBe("confirmed");

      // 6. Query review history
      const reviewListRes = await app.inject({
        method: "GET",
        url: `/v1/analytics/face-events/${eventId}/reviews`,
        headers: superadmin,
      });
      expect(reviewListRes.statusCode).toBe(200);
      expect(reviewListRes.json().data).toHaveLength(1);
      expect(reviewListRes.json().data[0].decision).toBe("confirmed");
    });

    it("verifies /v1/ai/face/match operates cleanly in production without 503 error", async () => {
      const testVec = makeUnitVector(0.333);
      const res = await app.inject({
        method: "POST",
        url: "/v1/ai/face/match",
        headers: superadmin,
        payload: {
          cameraId: "cam-lobby-01",
          branchId: "A005",
          embeddingVector: testVec,
          minThreshold: 0.80,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(res.json().data).toMatchObject({
        matched: expect.any(Boolean),
        confidence: expect.any(Number),
      });
    });
  });
});
