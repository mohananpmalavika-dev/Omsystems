import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

describe("NBFC Watchlist API", () => {
  let app: FastifyInstance;
  let pool: Pool;
  const tenantId = "test-tenant-001";
  const userId = "test-user-001";
  const branchId = "test-branch-001";

  beforeEach(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/sentinel_test",
    });

    app = Fastify();
    app.decorateRequest("currentUser");
    app.addHook("preHandler", async (request) => {
      request.currentUser = {
        userId,
        tenantId,
        role: "security_officer",
      };
    });

    const { registerNbfcWatchlistRoutes } = await import("../src/routes/nbfc-watchlist.routes.js");
    await registerNbfcWatchlistRoutes(app, { pool });

    // Clean test data
    await pool.query("DELETE FROM nbfc_watchlist_entries WHERE tenant_id = $1", [tenantId]);
    await pool.query("DELETE FROM nbfc_watchlist_detections WHERE tenant_id = $1", [tenantId]);
  });

  afterEach(async () => {
    await app.close();
    await pool.end();
  });

  describe("POST /v1/watchlist/nbfc", () => {
    it("creates authorized person entry successfully", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/watchlist/nbfc",
        payload: {
          fullName: "Rajesh Kumar",
          employeeCode: "EMP001",
          designation: "Branch Manager",
          watchlistType: "authorized",
          branchIds: [branchId],
          areaAccess: ["vault", "cash_counter", "locker"],
          validFrom: new Date().toISOString(),
          validUntil: new Date(Date.now() + 365 * 86400000).toISOString(),
          reason: "Branch management authorization",
        },
      });

      expect(response.statusCode).toBe(201);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        fullName: "Rajesh Kumar",
        employeeCode: "EMP001",
        watchlistType: "authorized",
        status: "active",
      });
      expect(data.data.id).toBeDefined();
    });

    it("creates blacklist entry successfully", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/watchlist/nbfc",
        payload: {
          fullName: "Unknown Individual",
          watchlistType: "blacklist",
          branchIds: [branchId],
          areaAccess: [],
          validFrom: new Date().toISOString(),
          reason: "Security incident - unauthorized access attempt",
          notes: "Alert all branches immediately if detected",
        },
      });

      expect(response.statusCode).toBe(201);
      const data = response.json();
      expect(data.data.watchlistType).toBe("blacklist");
    });

    it("creates VIP visitor entry", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/watchlist/nbfc",
        payload: {
          fullName: "Dr. Amit Sharma",
          designation: "Board Member",
          watchlistType: "vip",
          branchIds: [branchId],
          areaAccess: ["executive_lounge", "board_room"],
          validFrom: new Date().toISOString(),
          validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
          reason: "Board meeting attendance",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.watchlistType).toBe("vip");
    });

    it("validates watchlist type", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/watchlist/nbfc",
        payload: {
          fullName: "Test Person",
          watchlistType: "invalid_type",
          branchIds: [branchId],
          validFrom: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("enforces tenant isolation", async () => {
      const createResponse = await app.inject({
        method: "POST",
        url: "/v1/watchlist/nbfc",
        payload: {
          fullName: "Test Person",
          watchlistType: "authorized",
          branchIds: [branchId],
          validFrom: new Date().toISOString(),
        },
      });
      expect(createResponse.statusCode).toBe(201);

      // Change tenant
      app.addHook("preHandler", async (request) => {
        request.currentUser = {
          userId: "other-user",
          tenantId: "other-tenant",
          role: "security_officer",
        };
      });

      const listResponse = await app.inject({
        method: "GET",
        url: "/v1/watchlist/nbfc",
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().data).toHaveLength(0);
    });
  });

  describe("GET /v1/watchlist/nbfc", () => {
    beforeEach(async () => {
      // Create test entries
      await pool.query(
        `INSERT INTO nbfc_watchlist_entries 
        (tenant_id, full_name, employee_code, watchlist_type, status, branch_ids, area_access, 
         valid_from, valid_until, reason, face_enrolled, created_by)
        VALUES 
        ($1, 'Rajesh Kumar', 'EMP001', 'authorized', 'active', ARRAY[$2], ARRAY['vault', 'cash_counter'], 
         NOW(), NOW() + INTERVAL '1 year', 'Branch authorization', true, $3),
        ($1, 'Unknown Person', NULL, 'blacklist', 'active', ARRAY[$2], ARRAY[]::text[], 
         NOW(), NULL, 'Security alert', true, $3),
        ($1, 'Dr. Amit Sharma', NULL, 'vip', 'active', ARRAY[$2], ARRAY['executive_lounge'], 
         NOW(), NOW() + INTERVAL '30 days', 'VIP visitor', false, $3),
        ($1, 'Expired Person', 'EMP999', 'visitor', 'expired', ARRAY[$2], ARRAY[]::text[], 
         NOW() - INTERVAL '60 days', NOW() - INTERVAL '30 days', 'Temporary visitor', false, $3)`,
        [tenantId, branchId, userId]
      );
    });

    it("lists all watchlist entries", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/watchlist/nbfc",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(4);
      expect(data.summary).toMatchObject({
        totalEntries: 4,
        authorizedPersons: 1,
        blacklistedPersons: 1,
        vipPersons: 1,
        visitors: 1,
        activeEntries: 3,
        expiredEntries: 1,
      });
    });

    it("filters by watchlist type", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/watchlist/nbfc?type=authorized",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json().data;
      expect(data).toHaveLength(1);
      expect(data[0].watchlistType).toBe("authorized");
    });

    it("filters by branch", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/watchlist/nbfc?branchId=${branchId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.length).toBeGreaterThanOrEqual(4);
    });

    it("filters by status", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/watchlist/nbfc?status=active",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json().data;
      expect(data).toHaveLength(3);
      expect(data.every((entry: any) => entry.status === "active")).toBe(true);
    });
  });

  describe("GET /v1/watchlist/nbfc/:id", () => {
    let entryId: string;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO nbfc_watchlist_entries 
        (tenant_id, full_name, watchlist_type, status, branch_ids, valid_from, reason, created_by)
        VALUES ($1, 'Test Person', 'authorized', 'active', ARRAY[$2], NOW(), 'Test', $3)
        RETURNING id`,
        [tenantId, branchId, userId]
      );
      entryId = result.rows[0].id;
    });

    it("retrieves single entry successfully", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/watchlist/nbfc/${entryId}`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        id: entryId,
        fullName: "Test Person",
      });
    });

    it("returns 404 for non-existent entry", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/watchlist/nbfc/00000000-0000-0000-0000-000000000000",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PATCH /v1/watchlist/nbfc/:id", () => {
    let entryId: string;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO nbfc_watchlist_entries 
        (tenant_id, full_name, employee_code, watchlist_type, status, branch_ids, valid_from, reason, created_by)
        VALUES ($1, 'Original Name', 'EMP001', 'authorized', 'active', ARRAY[$2], NOW(), 'Test', $3)
        RETURNING id`,
        [tenantId, branchId, userId]
      );
      entryId = result.rows[0].id;
    });

    it("updates entry successfully", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: `/v1/watchlist/nbfc/${entryId}`,
        payload: {
          fullName: "Updated Name",
          designation: "Senior Manager",
          areaAccess: ["vault", "cash_counter", "locker", "strong_room"],
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        fullName: "Updated Name",
        designation: "Senior Manager",
      });
    });

    it("updates status to expired", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: `/v1/watchlist/nbfc/${entryId}`,
        payload: {
          status: "expired",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.status).toBe("expired");
    });

    it("returns 404 for non-existent entry", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/v1/watchlist/nbfc/00000000-0000-0000-0000-000000000000",
        payload: {
          fullName: "New Name",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /v1/watchlist/nbfc/:id", () => {
    let entryId: string;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO nbfc_watchlist_entries 
        (tenant_id, full_name, watchlist_type, status, branch_ids, valid_from, reason, created_by)
        VALUES ($1, 'To Delete', 'visitor', 'active', ARRAY[$2], NOW(), 'Test', $3)
        RETURNING id`,
        [tenantId, branchId, userId]
      );
      entryId = result.rows[0].id;
    });

    it("deletes entry successfully", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: `/v1/watchlist/nbfc/${entryId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);

      // Verify deletion
      const getResponse = await app.inject({
        method: "GET",
        url: `/v1/watchlist/nbfc/${entryId}`,
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it("returns 404 for non-existent entry", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/v1/watchlist/nbfc/00000000-0000-0000-0000-000000000000",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /v1/watchlist/nbfc/detections", () => {
    let entryId: string;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO nbfc_watchlist_entries 
        (tenant_id, person_id, full_name, watchlist_type, status, branch_ids, valid_from, reason, face_enrolled, created_by)
        VALUES ($1, 'person-001', 'Test Person', 'authorized', 'active', ARRAY[$2], NOW(), 'Test', true, $3)
        RETURNING id`,
        [tenantId, branchId, userId]
      );
      entryId = result.rows[0].id;
    });

    it("records detection successfully", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/watchlist/nbfc/detections",
        payload: {
          entryId,
          personId: "person-001",
          branchId,
          cameraId: "cam-001",
          confidence: 0.96,
          timestamp: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(201);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        entryId,
        confidence: 0.96,
      });
    });

    it("rejects low confidence detections", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/watchlist/nbfc/detections",
        payload: {
          entryId,
          personId: "person-001",
          branchId,
          cameraId: "cam-001",
          confidence: 0.5, // Too low
          timestamp: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("alerts on blacklist detection", async () => {
      // Create blacklist entry
      const blacklistResult = await pool.query(
        `INSERT INTO nbfc_watchlist_entries 
        (tenant_id, person_id, full_name, watchlist_type, status, branch_ids, valid_from, reason, face_enrolled, created_by)
        VALUES ($1, 'person-blacklist', 'Blacklisted Person', 'blacklist', 'active', ARRAY[$2], NOW(), 'Security alert', true, $3)
        RETURNING id`,
        [tenantId, branchId, userId]
      );
      const blacklistId = blacklistResult.rows[0].id;

      const response = await app.inject({
        method: "POST",
        url: "/v1/watchlist/nbfc/detections",
        payload: {
          entryId: blacklistId,
          personId: "person-blacklist",
          branchId,
          cameraId: "cam-001",
          confidence: 0.98,
          timestamp: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(201);
      const data = response.json();
      expect(data.data.alertGenerated).toBe(true); // Should generate alert for blacklist
    });
  });

  describe("GET /v1/watchlist/nbfc/:id/detections", () => {
    let entryId: string;

    beforeEach(async () => {
      const entryResult = await pool.query(
        `INSERT INTO nbfc_watchlist_entries 
        (tenant_id, person_id, full_name, watchlist_type, status, branch_ids, valid_from, reason, created_by)
        VALUES ($1, 'person-001', 'Test Person', 'authorized', 'active', ARRAY[$2], NOW(), 'Test', $3)
        RETURNING id`,
        [tenantId, branchId, userId]
      );
      entryId = entryResult.rows[0].id;

      // Create detections
      await pool.query(
        `INSERT INTO nbfc_watchlist_detections 
        (tenant_id, entry_id, person_id, branch_id, camera_id, confidence, detected_at, created_by)
        VALUES 
        ($1, $2, 'person-001', $3, 'cam-001', 0.96, NOW() - INTERVAL '1 hour', $4),
        ($1, $2, 'person-001', $3, 'cam-002', 0.94, NOW(), $4)`,
        [tenantId, entryId, branchId, userId]
      );
    });

    it("retrieves detection history", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/watchlist/nbfc/${entryId}/detections`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("filters detections by date range", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/watchlist/nbfc/${entryId}/detections?startDate=${new Date(Date.now() - 3600000).toISOString()}&endDate=${new Date().toISOString()}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("POST /v1/watchlist/check-expired", () => {
    beforeEach(async () => {
      // Create expired entries
      await pool.query(
        `INSERT INTO nbfc_watchlist_entries 
        (tenant_id, full_name, watchlist_type, status, branch_ids, valid_from, valid_until, reason, created_by)
        VALUES 
        ($1, 'Expired Visitor 1', 'visitor', 'active', ARRAY[$2], NOW() - INTERVAL '60 days', NOW() - INTERVAL '1 day', 'Test', $3),
        ($1, 'Expired Visitor 2', 'vip', 'active', ARRAY[$2], NOW() - INTERVAL '90 days', NOW() - INTERVAL '5 days', 'Test', $3)`,
        [tenantId, branchId, userId]
      );
    });

    it("identifies and updates expired entries", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/watchlist/check-expired",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data.expiredCount).toBeGreaterThanOrEqual(2);
      expect(data.data.updatedCount).toBeGreaterThanOrEqual(2);
    });
  });
});
