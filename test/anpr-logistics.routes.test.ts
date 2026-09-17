import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

describe("ANPR Logistics API", () => {
  let app: FastifyInstance;
  let pool: Pool;
  const tenantId = "test-tenant-001";
  const userId = "test-user-001";
  const branchId = "test-branch-001";

  beforeEach(async () => {
    // Setup test database connection
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

    // Import and register routes
    const { registerAnprLogisticsRoutes } = await import("../src/routes/anpr-logistics.routes.js");
    await registerAnprLogisticsRoutes(app, { pool });

    // Clean test data
    await pool.query("DELETE FROM anpr_logistics_sessions WHERE tenant_id = $1", [tenantId]);
    await pool.query("DELETE FROM anpr_detection_points WHERE tenant_id = $1", [tenantId]);
    await pool.query("DELETE FROM anpr_logistics_violations WHERE tenant_id = $1", [tenantId]);
  });

  afterEach(async () => {
    await app.close();
    await pool.end();
  });

  describe("POST /v1/logistics/anpr-sessions", () => {
    it("creates a new cash-van session successfully", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/logistics/anpr-sessions",
        payload: {
          vehiclePlate: "KA 01 AB 1234",
          vehicleType: "cash_van",
          branchId,
          routeId: "route-001",
          scheduledDeparture: new Date().toISOString(),
          scheduledArrival: new Date(Date.now() + 3600000).toISOString(),
          provider: "SecureTransit Ltd",
          authorized: true,
        },
      });

      expect(response.statusCode).toBe(201);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        vehiclePlate: "KA 01 AB 1234",
        vehicleType: "cash_van",
        status: "scheduled",
      });
      expect(data.data.id).toBeDefined();
    });

    it("rejects invalid vehicle type", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/logistics/anpr-sessions",
        payload: {
          vehiclePlate: "KA 01 AB 1234",
          vehicleType: "invalid_type",
          branchId,
          scheduledDeparture: new Date().toISOString(),
          scheduledArrival: new Date(Date.now() + 3600000).toISOString(),
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("enforces tenant isolation", async () => {
      // Create session as test-tenant-001
      const createResponse = await app.inject({
        method: "POST",
        url: "/v1/logistics/anpr-sessions",
        payload: {
          vehiclePlate: "KA 01 AB 1234",
          vehicleType: "cash_van",
          branchId,
          scheduledDeparture: new Date().toISOString(),
          scheduledArrival: new Date(Date.now() + 3600000).toISOString(),
        },
      });
      expect(createResponse.statusCode).toBe(201);

      // Try to list as different tenant
      app.addHook("preHandler", async (request) => {
        request.currentUser = {
          userId: "other-user",
          tenantId: "other-tenant",
          role: "security_officer",
        };
      });

      const listResponse = await app.inject({
        method: "GET",
        url: "/v1/logistics/anpr-sessions",
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().data).toHaveLength(0); // Should not see other tenant's data
    });
  });

  describe("GET /v1/logistics/anpr-sessions", () => {
    beforeEach(async () => {
      // Create test sessions
      await pool.query(
        `INSERT INTO anpr_logistics_sessions 
        (tenant_id, branch_id, vehicle_plate, vehicle_type, status, route_compliance, 
         scheduled_departure, scheduled_arrival, created_by)
        VALUES 
        ($1, $2, 'KA 01 AB 1234', 'cash_van', 'on_route', 'compliant', NOW(), NOW() + INTERVAL '1 hour', $3),
        ($1, $2, 'KA 02 CD 5678', 'armored', 'overdue', 'delayed', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', $3)`,
        [tenantId, branchId, userId]
      );
    });

    it("lists all sessions without filters", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/logistics/anpr-sessions",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.summary).toMatchObject({
        totalVehicles: 2,
        onRoute: 1,
        overdue: 1,
      });
    });

    it("filters by branch", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/logistics/anpr-sessions?branchId=${branchId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(2);
    });

    it("filters by status", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/logistics/anpr-sessions?status=on_route",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json().data;
      expect(data).toHaveLength(1);
      expect(data[0].status).toBe("on_route");
    });

    it("filters by vehicle type", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/logistics/anpr-sessions?vehicleType=cash_van",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json().data;
      expect(data).toHaveLength(1);
      expect(data[0].vehicleType).toBe("cash_van");
    });
  });

  describe("PATCH /v1/logistics/anpr-sessions/:id", () => {
    let sessionId: string;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO anpr_logistics_sessions 
        (tenant_id, branch_id, vehicle_plate, vehicle_type, status, scheduled_departure, scheduled_arrival, created_by)
        VALUES ($1, $2, 'KA 01 AB 1234', 'cash_van', 'scheduled', NOW(), NOW() + INTERVAL '1 hour', $3)
        RETURNING id`,
        [tenantId, branchId, userId]
      );
      sessionId = result.rows[0].id;
    });

    it("updates session status successfully", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: `/v1/logistics/anpr-sessions/${sessionId}`,
        payload: {
          status: "on_route",
          actualDeparture: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe("on_route");
      expect(data.data.actualDeparture).toBeDefined();
    });

    it("returns 404 for non-existent session", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/v1/logistics/anpr-sessions/00000000-0000-0000-0000-000000000000",
        payload: {
          status: "on_route",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /v1/logistics/anpr-detections", () => {
    let sessionId: string;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO anpr_logistics_sessions 
        (tenant_id, branch_id, vehicle_plate, vehicle_type, status, scheduled_departure, scheduled_arrival, created_by)
        VALUES ($1, $2, 'KA 01 AB 1234', 'cash_van', 'on_route', NOW(), NOW() + INTERVAL '1 hour', $3)
        RETURNING id`,
        [tenantId, branchId, userId]
      );
      sessionId = result.rows[0].id;
    });

    it("adds detection point successfully", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/logistics/anpr-detections",
        payload: {
          sessionId,
          cameraId: "cam-001",
          vehiclePlate: "KA 01 AB 1234",
          confidence: 0.95,
          location: "Checkpoint A",
          timestamp: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(201);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        sessionId,
        cameraId: "cam-001",
        confidence: 0.95,
      });
    });

    it("rejects low confidence detections", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/logistics/anpr-detections",
        payload: {
          sessionId,
          cameraId: "cam-001",
          vehiclePlate: "KA 01 AB 1234",
          confidence: 0.3, // Too low
          location: "Checkpoint A",
          timestamp: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /v1/logistics/anpr-violations", () => {
    let sessionId: string;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO anpr_logistics_sessions 
        (tenant_id, branch_id, vehicle_plate, vehicle_type, status, scheduled_departure, scheduled_arrival, created_by)
        VALUES ($1, $2, 'KA 01 AB 1234', 'cash_van', 'on_route', NOW(), NOW() + INTERVAL '1 hour', $3)
        RETURNING id`,
        [tenantId, branchId, userId]
      );
      sessionId = result.rows[0].id;
    });

    it("reports violation successfully", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/logistics/anpr-violations",
        payload: {
          sessionId,
          violationCode: "UNAUTHORIZED_STOP",
          severity: "high",
          description: "Vehicle stopped at unauthorized location",
          location: "Unknown checkpoint",
          timestamp: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(201);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        violationCode: "UNAUTHORIZED_STOP",
        severity: "high",
      });
    });
  });

  describe("GET /v1/logistics/anpr-sessions/summary", () => {
    beforeEach(async () => {
      await pool.query(
        `INSERT INTO anpr_logistics_sessions 
        (tenant_id, branch_id, vehicle_plate, vehicle_type, status, route_compliance, 
         scheduled_departure, scheduled_arrival, created_by)
        VALUES 
        ($1, $2, 'KA 01 AB 1234', 'cash_van', 'on_route', 'compliant', NOW(), NOW() + INTERVAL '1 hour', $3),
        ($1, $2, 'KA 02 CD 5678', 'armored', 'overdue', 'delayed', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', $3),
        ($1, $2, 'KA 03 EF 9012', 'courier', 'arrived', 'compliant', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours', $3)`,
        [tenantId, branchId, userId]
      );
    });

    it("returns accurate summary metrics", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/logistics/anpr-sessions/summary",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.summary).toMatchObject({
        totalVehicles: 3,
        onRoute: 1,
        arrived: 1,
        overdue: 1,
        compliantRoutes: 2,
      });
    });
  });

  describe("POST /v1/logistics/check-overdue", () => {
    beforeEach(async () => {
      // Create overdue session
      await pool.query(
        `INSERT INTO anpr_logistics_sessions 
        (tenant_id, branch_id, vehicle_plate, vehicle_type, status, route_compliance,
         scheduled_departure, scheduled_arrival, created_by)
        VALUES ($1, $2, 'KA 01 AB 1234', 'cash_van', 'on_route', 'compliant', 
                NOW() - INTERVAL '3 hours', NOW() - INTERVAL '30 minutes', $3)`,
        [tenantId, branchId, userId]
      );
    });

    it("identifies and updates overdue sessions", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/logistics/check-overdue",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data.overdueCount).toBeGreaterThan(0);
      expect(data.data.updatedCount).toBeGreaterThan(0);
    });
  });
});
