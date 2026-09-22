import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";

describe("Branch Comparison API", () => {
  let app: FastifyInstance;
  let mockPool: any;
  const tenantId = "test-tenant-001";
  const userId = "test-user-001";
  const branch1Id = "test-branch-001";
  const branch2Id = "test-branch-002";

  let metricsStore: any[] = [];
  let branchesStore: any[] = [];

  function createMockPool(): Pool {
    return {
      query: async (sql: string, params?: any[]) => {
        const text = sql.trim();

        // DELETE
        if (text.startsWith("DELETE FROM branch_comparison_metrics")) {
          const tId = params?.[0];
          metricsStore = metricsStore.filter((m) => m.tenant_id !== tId);
          return { rows: [], rowCount: 0 };
        }

        // INSERT into branch_comparison_metrics
        if (text.includes("INSERT INTO branch_comparison_metrics")) {
          const isRouteInsert = text.includes("ON CONFLICT");
          if (isRouteInsert && params) {
            const [
              tId, bId, bName, bCode, mDate,
              overallScore, recComp, storHealth, maintScore,
              camHealthScore, camsTotal, camsOnline, camsHealthy,
              actRules, todAlerts, critAlerts, violRate,
              cvSessions, compSessions, bankViol, bankCompRate,
              avgRespTime, uptime, lastIncDays,
              bRank, trend,
            ] = params;

            const existingIdx = metricsStore.findIndex(
              (m) => m.tenant_id === tId && m.branch_id === bId && m.metric_date === mDate
            );
            const row = {
              tenant_id: tId,
              branch_id: bId,
              branch_name: bName,
              branch_code: bCode,
              metric_date: mDate,
              overall_compliance_score: overallScore,
              recording_compliance: recComp,
              storage_health: storHealth,
              maintenance_score: maintScore,
              camera_health_score: camHealthScore,
              cameras_total: camsTotal,
              cameras_online: camsOnline,
              cameras_healthy: camsHealthy,
              active_rules: actRules,
              today_alerts: todAlerts,
              critical_alerts: critAlerts,
              violation_rate: violRate,
              cash_van_sessions: cvSessions,
              compliant_sessions: compSessions,
              banking_violations: bankViol,
              banking_compliance_rate: bankCompRate,
              avg_response_time_ms: avgRespTime,
              uptime_percent: uptime,
              last_incident_days: lastIncDays,
              branch_rank: bRank,
              trend: trend || "stable",
              computed_at: new Date(),
            };
            if (existingIdx >= 0) {
              metricsStore[existingIdx] = row;
            } else {
              metricsStore.push(row);
            }
            return { rows: [row], rowCount: 1 };
          }

          // Test insert (legacy columns or test columns)
          if (params) {
            const tId = params[0];
            const bId = params[1];
            // Handle parameterized test inserts
            const is5BranchTest = params.length >= 6 && typeof params[2] === "number";
            if (is5BranchTest) {
              const camHealth = params[2];
              const score = params[3];
              const alerts = params[4];
              const row = {
                tenant_id: tId,
                branch_id: bId,
                branch_name: `Branch ${bId}`,
                branch_code: bId,
                metric_date: new Date().toISOString().split("T")[0],
                cameras_total: 10,
                cameras_online: 10,
                cameras_healthy: 10,
                camera_health_score: camHealth,
                overall_compliance_score: score,
                recording_compliance: score,
                storage_health: score,
                maintenance_score: score,
                active_rules: 30,
                today_alerts: alerts,
                critical_alerts: 0,
                violation_rate: 0,
                cash_van_sessions: 5,
                compliant_sessions: 5,
                banking_violations: 0,
                banking_compliance_rate: 100,
                avg_response_time_ms: 100,
                uptime_percent: 99,
                last_incident_days: 30,
                branch_rank: 0,
                trend: "stable",
                computed_at: new Date(),
              };
              metricsStore.push(row);
              return { rows: [row], rowCount: 1 };
            }

            // Multi-day insert for single branch test
            const isMultiDay = text.includes("INTERVAL '1 day'") || text.includes("INTERVAL '2 days'");
            if (isMultiDay) {
              const today = new Date();
              const d1 = new Date(today);
              d1.setDate(d1.getDate() - 1);
              const d2 = new Date(today);
              d2.setDate(d2.getDate() - 2);

              const rowToday = {
                tenant_id: tId,
                branch_id: bId,
                branch_name: "Branch Alpha",
                branch_code: bId,
                metric_date: today.toISOString().split("T")[0],
                cameras_total: 12,
                cameras_online: 11,
                cameras_healthy: 10,
                camera_health_score: 91.7,
                overall_compliance_score: 92.0,
                recording_compliance: 95.0,
                storage_health: 88.0,
                maintenance_score: 94.0,
                active_rules: 37,
                today_alerts: 3,
                critical_alerts: 0,
                violation_rate: 2.5,
                cash_van_sessions: 5,
                compliant_sessions: 5,
                banking_violations: 0,
                banking_compliance_rate: 100.0,
                avg_response_time_ms: 150,
                uptime_percent: 99.8,
                last_incident_days: 30,
                branch_rank: 1,
                trend: "stable",
                computed_at: new Date(),
              };
              const rowDay1 = {
                ...rowToday,
                metric_date: d1.toISOString().split("T")[0],
                camera_health_score: 90.0,
                overall_compliance_score: 91.0,
                today_alerts: 4,
                trend: "up",
              };
              const rowDay2 = {
                ...rowToday,
                metric_date: d2.toISOString().split("T")[0],
                camera_health_score: 88.3,
                overall_compliance_score: 89.0,
                today_alerts: 5,
                trend: "stable",
              };
              metricsStore.push(rowToday, rowDay1, rowDay2);
              return { rows: [rowToday, rowDay1, rowDay2], rowCount: 3 };
            }

            // 3-param insert (Tenant Isolation test)
            if (params.length === 3) {
              const row = {
                tenant_id: tId,
                branch_id: bId,
                branch_name: "Branch Alpha",
                branch_code: bId,
                metric_date: new Date().toISOString().split("T")[0],
                cameras_total: 10,
                cameras_online: 10,
                cameras_healthy: 10,
                camera_health_score: 100.0,
                overall_compliance_score: 100.0,
                recording_compliance: 100.0,
                storage_health: 100.0,
                maintenance_score: 100.0,
                active_rules: 30,
                today_alerts: 0,
                critical_alerts: 0,
                violation_rate: 0.0,
                cash_van_sessions: 5,
                compliant_sessions: 5,
                banking_violations: 0,
                banking_compliance_rate: 100.0,
                avg_response_time_ms: 100,
                uptime_percent: 100.0,
                last_incident_days: 45,
                branch_rank: 1,
                trend: "stable",
                computed_at: new Date(),
              };
              metricsStore.push(row);
              return { rows: [row], rowCount: 1 };
            }

            // Normal test insert with branch1/branch2
            if (params.length >= 4) {
              const row1 = {
                tenant_id: tId,
                branch_id: bId,
                branch_name: "Branch Alpha",
                branch_code: bId,
                metric_date: new Date().toISOString().split("T")[0],
                cameras_total: 12,
                cameras_online: 11,
                cameras_healthy: 10,
                camera_health_score: 91.7,
                overall_compliance_score: 92.0,
                recording_compliance: 95.0,
                storage_health: 88.0,
                maintenance_score: 94.0,
                active_rules: 37,
                today_alerts: 3,
                critical_alerts: 0,
                violation_rate: 2.5,
                cash_van_sessions: 5,
                compliant_sessions: 5,
                banking_violations: 0,
                banking_compliance_rate: 100.0,
                avg_response_time_ms: 150,
                uptime_percent: 99.8,
                last_incident_days: 30,
                branch_rank: 1,
                trend: "stable",
                computed_at: new Date(),
              };
              const row2 = {
                tenant_id: tId,
                branch_id: params[3],
                branch_name: "Branch Beta",
                branch_code: params[3],
                metric_date: new Date().toISOString().split("T")[0],
                cameras_total: 10,
                cameras_online: 8,
                cameras_healthy: 7,
                camera_health_score: 80.0,
                overall_compliance_score: 78.0,
                recording_compliance: 82.0,
                storage_health: 75.0,
                maintenance_score: 80.0,
                active_rules: 35,
                today_alerts: 12,
                critical_alerts: 2,
                violation_rate: 8.5,
                cash_van_sessions: 4,
                compliant_sessions: 3,
                banking_violations: 1,
                banking_compliance_rate: 75.0,
                avg_response_time_ms: 350,
                uptime_percent: 97.5,
                last_incident_days: 5,
                branch_rank: 2,
                trend: "down",
                computed_at: new Date(),
              };
              metricsStore.push(row1, row2);
              return { rows: [row1, row2], rowCount: 2 };
            }
          }
        }

        // UPDATE branch_comparison_metrics SET rank = ...
        if (text.startsWith("UPDATE branch_comparison_metrics")) {
          metricsStore.sort((a, b) => b.overall_compliance_score - a.overall_compliance_score);
          metricsStore.forEach((m, idx) => {
            m.branch_rank = idx + 1;
          });
          return { rows: [], rowCount: metricsStore.length };
        }

        // SELECT branches
        if (text.includes("FROM branches")) {
          const tId = params?.[0];
          const rows = branchesStore.filter((b) => b.tenant_id === tId);
          return { rows, rowCount: rows.length };
        }

        // SELECT cameras
        if (text.includes("FROM cameras")) {
          return {
            rows: [{ total: 10, online: 9, healthy: 9 }],
            rowCount: 1,
          };
        }

        // SELECT camera_health_checks / recording / storage / maintenance / etc.
        if (text.includes("FROM recording_verification_jobs")) {
          return { rows: [{ recording_compliance: 95.0 }], rowCount: 1 };
        }
        if (text.includes("FROM storage_health_checks")) {
          return { rows: [{ storage_health: 90.0 }], rowCount: 1 };
        }
        if (text.includes("FROM maintenance_work_orders")) {
          return { rows: [{ open_orders: 1, urgent_orders: 0 }], rowCount: 1 };
        }
        if (text.includes("FROM nbfc_analytics_rules")) {
          return { rows: [{ count: 5 }], rowCount: 1 };
        }
        if (text.includes("FROM alerts")) {
          return { rows: [{ today_alerts: 2, critical_alerts: 0 }], rowCount: 1 };
        }
        if (text.includes("FROM anpr_logistics_sessions")) {
          return { rows: [{ total_sessions: 4, compliant_sessions: 4, violations: 0 }], rowCount: 1 };
        }
        if (text.includes("FROM incidents")) {
          return { rows: [{ avg_response_time: 120, last_incident_days: 15 }], rowCount: 1 };
        }

        // SELECT * FROM branch_comparison_metrics
        if (text.includes("FROM branch_comparison_metrics")) {
          const tId = params?.[0];
          let matches = metricsStore.filter((m) => m.tenant_id === tId);

          // Filtering by branchId (for single branch query)
          if (text.includes("branch_id::text = $2") || text.includes("branch_id = $2")) {
            const bId = params?.[1];
            matches = matches.filter((m) => m.branch_id === bId || m.branch_code === bId);
            return { rows: matches, rowCount: matches.length };
          }

          // Sorting
          const sortMode = params?.[2] || "rank";
          if (sortMode === "rank") {
            matches.sort((a, b) => a.branch_rank - b.branch_rank);
          } else if (sortMode === "compliance") {
            matches.sort((a, b) => b.overall_compliance_score - a.overall_compliance_score);
          } else if (sortMode === "health") {
            matches.sort((a, b) => b.camera_health_score - a.camera_health_score);
          } else if (sortMode === "alerts") {
            matches.sort((a, b) => a.today_alerts - b.today_alerts);
          }

          return { rows: matches, rowCount: matches.length };
        }

        return { rows: [], rowCount: 0 };
      },
      end: async () => {},
    } as unknown as Pool;
  }

  beforeEach(async () => {
    metricsStore = [];
    branchesStore = [
      { id: branch1Id, tenant_id: tenantId, name: "Branch Alpha", code: "A001" },
      { id: branch2Id, tenant_id: tenantId, name: "Branch Beta", code: "A002" },
    ];
    mockPool = createMockPool();

    app = Fastify();
    app.decorateRequest("currentUser");
    app.addHook("preHandler", async (request) => {
      request.currentUser = {
        userId: (request.headers["x-user-id"] as string) || userId,
        tenantId: (request.headers["x-tenant-id"] as string) || tenantId,
        role: "branch_manager",
      };
    });

    const { registerBranchComparisonRoutes } = await import("../src/routes/branch-comparison.routes.js");
    await registerBranchComparisonRoutes(app, { pool: mockPool });
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /v1/analytics/branch-comparison/compute", () => {
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

      expect([200, 409]).toContain(secondResponse.statusCode);
    });
  });

  describe("GET /v1/analytics/branch-comparison", () => {
    beforeEach(async () => {
      await mockPool.query(
        `INSERT INTO branch_comparison_metrics VALUES ($1, $2, CURRENT_DATE, 12, 11, 10, 91.7)`,
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
      expect(summary.avgComplianceScore).toBeCloseTo(85.0, 1);
      expect(summary.avgCameraHealth).toBeCloseTo(85.85, 1);
      expect(summary.needsAttention).toBe(1);
      expect(summary.totalAlerts24h).toBe(15);
    });

    it("identifies top performer", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison",
      });

      const summary = response.json().summary;
      expect(summary.topPerformer).toBeDefined();
    });
  });

  describe("GET /v1/analytics/branch-comparison/:branchId", () => {
    beforeEach(async () => {
      await mockPool.query(
        `INSERT INTO branch_comparison_metrics VALUES ($1, $2, CURRENT_DATE - INTERVAL '1 day')`,
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
      await mockPool.query(
        `INSERT INTO branch_comparison_metrics VALUES ($1, $2, CURRENT_DATE)`,
        [tenantId, branch1Id, userId]
      );
    });

    it("enforces tenant isolation", async () => {
      const response1 = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison",
      });
      expect(response1.json().data).toHaveLength(1);

      // Change tenant via header
      const response2 = await app.inject({
        method: "GET",
        url: "/v1/analytics/branch-comparison",
        headers: {
          "x-tenant-id": "other-tenant",
          "x-user-id": "other-user",
        },
      });
      expect(response2.json().data).toHaveLength(0);
    });
  });

  describe("Performance Ranking", () => {
    beforeEach(async () => {
      const branches = [
        { id: "branch-1", score: 95, alerts: 2, health: 98 },
        { id: "branch-2", score: 88, alerts: 5, health: 90 },
        { id: "branch-3", score: 75, alerts: 15, health: 75 },
        { id: "branch-4", score: 92, alerts: 3, health: 95 },
        { id: "branch-5", score: 68, alerts: 20, health: 65 },
      ];

      for (const branch of branches) {
        await mockPool.query(
          `INSERT INTO branch_comparison_metrics VALUES ($1, $2, $3, $4, $5, $6)`,
          [tenantId, branch.id, branch.health, branch.score, branch.alerts, userId]
        );
      }

      await mockPool.query(`UPDATE branch_comparison_metrics SET rank = subquery.row_num`);
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
      expect(summary.needsAttention).toBe(2);
    });
  });
});
