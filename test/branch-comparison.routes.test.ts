import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

describe("Branch Comparison API", () => {
  let app: FastifyInstance;
  let pool: Pool;
  const tenantId = "test-tenant-001";
  const userId = "test-user-001";
  const branch1Id = "test-branch-001";
  const branch2Id = "test-branch-002";

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
        role: "branch_manager",
      };
    });

    const { registerBranchComparisonRoutes } = await import("../src/routes/branch-comparison.routes.js");
    await registerBranchComparisonRoutes(app, { pool });

    // Clean test data
    await pool.query("DELETE FROM branch_comparison_metrics WHERE tenant_id = $1", [tenantId]);
  });

  afterEach(async () => {
    await app.close();
    await pool.end();
  });

  describe("POST /v1/analytics/branch-comparison/compute", () => {
    beforeEach(async () => {
      // Create mock branches if needed
      // In production, this would aggregate from multiple sources
    });

    it("computes branch metrics successfully", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/analytics/branch-comparison/compute",
        payload: {
          date: new Date().toISOString().split("T")[0],
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain("computed");
      expect(data.data.date).toBeDefined();
    });

    it("prevents duplicate computation for same date", async () => {
      const date = new Date().toISOString().split("T")[0];

      // First computation
      const firstResponse = await app.inject({
        method: "POST",
        url: "/v1/analytics/branch-comparison/compute",
        payload: { date },
      });
      expect(firstResponse.statusCode).toBe(200);

      // Second computation for same date
      const secondResponse = await app.inject({
        method: "POST",
        url: "/v1/analytics/branch-comparison/compute",
        payload: { date },
      });

      // Should either succeed (overwrite) or return 409 conflict
      expect([200, 409]).toContain(secondResponse.statusCode);
    });
  });

  describe("GET /v1/analytics/branch-comparison", () => {
    beforeEach(async () => {
      // Create test metrics
      await pool.query(
        `INSERT INTO branch_comparison_metrics 
        (tenant_id, branch_id, metric_date, cameras_total, cameras_online, cameras_healthy, camera_health_score,
         compliance_overall_score, compliance_recording, compliance_storage, compliance_maintenance,
         security_active_rules, security_today_alerts, security_critical_alerts, security_violation_rate,
         banking_cashvan_sessions, banking_compliant_sessions, banking_violations, banking_compliance_rate,
         performance_avg_response_ms, performance_uptime_percent, performance_last_incident_days,
         rank, trend, created_by)
        VALUES 
        ($1, $2, CURRENT_DATE, 12, 11, 10, 91.7, 92.0, 95.0, 88.0, 94.0, 37, 3, 0, 2.5, 
         5, 5, 0, 100.0, 150, 99.8, 30, 1, 'stable', $3),
        ($1, $4, CURRENT_DATE, 10, 8, 7, 80.0, 78.0, 82.0, 75.0, 80.0, 35, 12, 2, 8.5,
         4, 3, 1, 75.0, 350, 97.5, 5, 2, 'down', $3)`,
        [tenantId, branch1Id, userId, branch2Id]
      );
    });

    it("lists all branch metrics", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.summary).toMatchObject({
        totalBranches: 2,
        needsAttention: 1, // Branch 2 with score < 80
      });
    });

    it("sorts by rank", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison?sortBy=rank",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json().data;
      expect(data[0].rank).toBeLessThan(data[1].rank);
    });

    it("sorts by compliance score", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison?sortBy=compliance",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json().data;
      expect(data[0].compliance.overallScore).toBeGreaterThanOrEqual(data[1].compliance.overallScore);
    });

    it("sorts by camera health", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison?sortBy=health",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json().data;
      expect(data[0].cameras.healthScore).toBeGreaterThanOrEqual(data[1].cameras.healthScore);
    });

    it("sorts by alert count", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison?sortBy=alerts",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json().data;
      expect(data[0].security.todayAlerts).toBeLessThanOrEqual(data[1].security.todayAlerts);
    });

    it("calculates summary metrics correctly", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison",
      });

      const summary = response.json().summary;
      expect(summary.totalBranches).toBe(2);
      expect(summary.avgComplianceScore).toBeCloseTo(85.0, 1); // Average of 92 and 78
      expect(summary.avgCameraHealth).toBeCloseTo(85.85, 1); // Average of 91.7 and 80
      expect(summary.needsAttention).toBe(1); // Only branch 2 has score < 80
      expect(summary.totalAlerts24h).toBe(15); // 3 + 12
    });

    it("identifies top performer", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison",
      });

      const summary = response.json().summary;
      expect(summary.topPerformer).toBeDefined();
      // Should be branch with rank 1
    });
  });

  describe("GET /v1/analytics/branch-comparison/:branchId", () => {
    beforeEach(async () => {
      // Create metrics for multiple days
      await pool.query(
        `INSERT INTO branch_comparison_metrics 
        (tenant_id, branch_id, metric_date, cameras_total, cameras_online, cameras_healthy, camera_health_score,
         compliance_overall_score, compliance_recording, compliance_storage, compliance_maintenance,
         security_active_rules, security_today_alerts, security_critical_alerts, security_violation_rate,
         banking_cashvan_sessions, banking_compliant_sessions, banking_violations, banking_compliance_rate,
         performance_avg_response_ms, performance_uptime_percent, performance_last_incident_days,
         rank, trend, created_by)
        VALUES 
        ($1, $2, CURRENT_DATE, 12, 11, 10, 91.7, 92.0, 95.0, 88.0, 94.0, 37, 3, 0, 2.5,
         5, 5, 0, 100.0, 150, 99.8, 30, 1, 'stable', $3),
        ($1, $2, CURRENT_DATE - INTERVAL '1 day', 12, 11, 9, 90.0, 91.0, 94.0, 87.0, 93.0, 36, 4, 0, 3.0,
         4, 4, 0, 100.0, 160, 99.7, 29, 1, 'up', $3),
        ($1, $2, CURRENT_DATE - INTERVAL '2 days', 12, 10, 9, 88.3, 89.0, 92.0, 85.0, 91.0, 35, 5, 1, 4.0,
         4, 3, 1, 75.0, 170, 99.5, 28, 1, 'stable', $3)`,
        [tenantId, branch1Id, userId]
      );
    });

    it("retrieves detailed metrics for single branch", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/analytics/branch-comparison/${branch1Id}`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        branchId: branch1Id,
        cameras: {
          total: 12,
          online: 11,
          healthy: 10,
        },
      });
    });

    it("retrieves historical data", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/analytics/branch-comparison/${branch1Id}?days=7`,
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.data.history).toBeDefined();
      expect(data.data.history.length).toBeGreaterThanOrEqual(3);
    });

    it("returns 404 for non-existent branch", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison/non-existent-branch",
      });

      expect(response.statusCode).toBe(404);
    });

    it("shows trend over time", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/analytics/branch-comparison/${branch1Id}?days=7`,
      });

      const data = response.json().data;
      expect(data.trend).toBeDefined();
      expect(["up", "down", "stable"]).toContain(data.trend);
    });
  });

  describe("Tenant Isolation", () => {
    beforeEach(async () => {
      // Create metrics for test tenant
      await pool.query(
        `INSERT INTO branch_comparison_metrics 
        (tenant_id, branch_id, metric_date, cameras_total, cameras_online, cameras_healthy, camera_health_score,
         compliance_overall_score, compliance_recording, compliance_storage, compliance_maintenance,
         security_active_rules, security_today_alerts, security_critical_alerts, security_violation_rate,
         banking_cashvan_sessions, banking_compliant_sessions, banking_violations, banking_compliance_rate,
         performance_avg_response_ms, performance_uptime_percent, performance_last_incident_days,
         rank, trend, created_by)
        VALUES ($1, $2, CURRENT_DATE, 10, 10, 10, 100.0, 100.0, 100.0, 100.0, 100.0, 30, 0, 0, 0.0,
         5, 5, 0, 100.0, 100, 100.0, 45, 1, 'stable', $3)`,
        [tenantId, branch1Id, userId]
      );
    });

    it("enforces tenant isolation", async () => {
      const response1 = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison",
      });
      expect(response1.json().data).toHaveLength(1);

      // Change tenant
      app.addHook("preHandler", async (request) => {
        request.currentUser = {
          userId: "other-user",
          tenantId: "other-tenant",
          role: "branch_manager",
        };
      });

      const response2 = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison",
      });
      expect(response2.json().data).toHaveLength(0);
    });
  });

  describe("Performance Ranking", () => {
    beforeEach(async () => {
      // Create metrics for 5 branches with different scores
      const branches = [
        { id: "branch-1", score: 95, alerts: 2, health: 98 },
        { id: "branch-2", score: 88, alerts: 5, health: 90 },
        { id: "branch-3", score: 75, alerts: 15, health: 75 },
        { id: "branch-4", score: 92, alerts: 3, health: 95 },
        { id: "branch-5", score: 68, alerts: 20, health: 65 },
      ];

      for (const branch of branches) {
        await pool.query(
          `INSERT INTO branch_comparison_metrics 
          (tenant_id, branch_id, metric_date, cameras_total, cameras_online, cameras_healthy, camera_health_score,
           compliance_overall_score, compliance_recording, compliance_storage, compliance_maintenance,
           security_active_rules, security_today_alerts, security_critical_alerts, security_violation_rate,
           banking_cashvan_sessions, banking_compliant_sessions, banking_violations, banking_compliance_rate,
           performance_avg_response_ms, performance_uptime_percent, performance_last_incident_days,
           rank, trend, created_by)
          VALUES ($1, $2, CURRENT_DATE, 10, 10, 10, $3, $4, $4, $4, $4, 30, $5, 0, 0.0,
           5, 5, 0, 100.0, 100, 99.0, 30, 0, 'stable', $6)`,
          [tenantId, branch.id, branch.health, branch.score, branch.alerts, userId]
        );
      }

      // Update ranks based on compliance score
      await pool.query(
        `UPDATE branch_comparison_metrics 
         SET rank = subquery.row_num
         FROM (
           SELECT id, ROW_NUMBER() OVER (ORDER BY compliance_overall_score DESC) as row_num
           FROM branch_comparison_metrics
           WHERE tenant_id = $1 AND metric_date = CURRENT_DATE
         ) as subquery
         WHERE branch_comparison_metrics.id = subquery.id`,
        [tenantId]
      );
    });

    it("ranks branches correctly by compliance", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison?sortBy=compliance",
      });

      const data = response.json().data;
      expect(data).toHaveLength(5);
      
      // Verify descending order
      for (let i = 0; i < data.length - 1; i++) {
        expect(data[i].compliance.overallScore).toBeGreaterThanOrEqual(data[i + 1].compliance.overallScore);
      }
    });

    it("identifies branches needing attention", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison",
      });

      const summary = response.json().summary;
      expect(summary.needsAttention).toBe(2); // branch-3 and branch-5 with scores < 80
    });
  });
});
