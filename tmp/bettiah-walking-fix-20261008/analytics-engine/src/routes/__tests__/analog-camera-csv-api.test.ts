/**
 * Analog Camera CSV API Integration Tests
 * Tests for /v1/analog/report CSV export endpoint
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerAnalogCameraApiRoutes } from "../analog-camera-api.js";
import type { AnalyticsPipeline } from "../../analytics-pipeline.js";

// Mock analytics pipeline for testing
const createMockPipeline = (): AnalyticsPipeline => {
  return {
    getAnalogVideoQualityDetector: () => ({
      getCamerasWithIssues: () => [
        {
          cameraId: "cam_001",
          qualityScore: 75,
          issues: [
            { type: "snow", severity: "medium", confidence: 0.85, description: "Snow detected" },
            { type: "weak-signal", severity: "low", confidence: 0.75, description: "Weak signal" },
          ],
          metrics: {
            brightness: 120,
            contrast: 65,
            sharpness: 75,
            noise: 12,
            colorSaturation: 80,
            interlacing: 5,
          },
          degradationTrend: "stable",
          status: "ONLINE",
          lastSeen: "2026-08-11T10:30:00Z",
          lastCheck: "2026-08-11T10:25:00Z",
        },
      ],
    }),
    getCameraAgingDetector: () => ({
      getCamerasByReplacementPriority: () => [
        {
          cameraId: "cam_001",
          estimatedAgeYears: 3.5,
          healthScore: 82,
          failureRiskScore: 25,
          replacementPriority: 40,
          firstSeen: "2023-01-15T08:00:00Z",
          installationDate: "2023-01-15T08:00:00Z",
          maintenanceRecommendations: [
            {
              action: "Clean lens and check signal cable",
              priority: "medium",
              estimatedCostUSD: 150,
              urgencyDays: 30,
            },
          ],
        },
      ],
    }),
    getCameraTypeClassifier: () => ({
      getAllClassifications: () => [
        {
          cameraId: "cam_001",
          cameraName: "Lobby Camera",
          location: "Building A - Entrance",
          cameraType: "hd-analog",
          analogStandard: "hd-tvi",
          signalType: "analog",
          connectionType: "dvr-channel",
          estimatedResolution: {
            width: 1920,
            height: 1080,
            megapixels: 2.1,
          },
          aiAccuracyEstimate: 78,
          features: {
            nightVision: true,
            wdr: false,
            ptz: false,
            colorMode: "day-night",
          },
          capabilities: ["person-detection", "vehicle-detection"],
        },
      ],
      getAllUpgradeRecommendations: () => [
        {
          cameraId: "cam_001",
          reason: "Consider IP camera upgrade for better AI accuracy",
          recommendedUpgrade: {
            type: "ip-camera",
            estimatedCostUSD: 250,
          },
          roi: {
            accuracyGainPercent: 22,
            priority: "high",
          },
        },
      ],
      getUpgradeSummary: () => ({
        totalCameras: 1,
        needsUpgrade: 1,
        highPriorityUpgrades: 1,
        mediumPriorityUpgrades: 0,
        totalEstimatedCostUSD: 250,
        averageAccuracyGain: 22,
      }),
    }),
    getDVRChannelHealthDetector: () => ({
      getAllChannelStatuses: () => [
        {
          cameraId: "cam_001",
          dvrId: "dvr_05",
          dvrName: "DVR Building A",
          channelNumber: 3,
          status: "healthy",
        },
      ],
    }),
  } as any;
};

describe("Analog Camera CSV API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    const mockPipeline = createMockPipeline();
    await registerAnalogCameraApiRoutes(app, mockPipeline);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /v1/analog/report", () => {
    it("should return JSON by default", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analog/report",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("generatedAt");
      expect(body).toHaveProperty("reportType");
      expect(body.reportType).toBe("analog-camera-analytics");
    });

    it("should return CSV with proper headers", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analog/report?format=csv",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
      expect(response.headers["content-disposition"]).toMatch(
        /^attachment; filename="analog-camera-report-.*\.csv"$/
      );
    });

    it("should return valid CSV content", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analog/report?format=csv",
      });

      expect(response.statusCode).toBe(200);

      const body = response.body;
      expect(body).not.toBe("CSV export not yet implemented");

      const lines = body.split("\r\n");
      expect(lines.length).toBeGreaterThan(1);

      // Verify header row
      const header = lines[0];
      expect(header).toContain("Camera ID");
      expect(header).toContain("Camera Name");
      expect(header).toContain("Camera Type");
      expect(header).toContain("Video Quality Score");
      expect(header).toContain("AI Accuracy Estimate");
      expect(header).toContain("Health Score");
    });

    it("should include camera data in CSV", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analog/report?format=csv",
      });

      expect(response.statusCode).toBe(200);

      const body = response.body;
      const lines = body.split("\r\n");

      // Should have header + at least 1 data row
      expect(lines.length).toBeGreaterThanOrEqual(2);

      const dataRow = lines[1];
      expect(dataRow).toContain("cam_001");
      expect(dataRow).toContain("Lobby Camera");
      expect(dataRow).toContain("hd-analog");
    });

    it("should use CRLF line endings", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analog/report?format=csv",
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("\r\n");
    });

    it("should have timestamped filename", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analog/report?format=csv",
      });

      expect(response.statusCode).toBe(200);

      const disposition = response.headers["content-disposition"];
      expect(disposition).toMatch(/analog-camera-report-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv/);
    });

    it("should respect includeQuality parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analog/report?format=json&includeQuality=false",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).not.toHaveProperty("qualityAnalysis");
    });

    it("should respect includeAging parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analog/report?format=json&includeAging=false",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).not.toHaveProperty("agingAnalysis");
    });

    it("should respect includeUpgrades parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analog/report?format=json&includeUpgrades=false",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).not.toHaveProperty("upgradeRecommendations");
      expect(body).not.toHaveProperty("upgradeSummary");
    });

    it("should respect includeDvr parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analog/report?format=json&includeDvr=false",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).not.toHaveProperty("dvrChannelStatus");
    });

    it("should reject invalid format", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/analog/report?format=excel",
      });

      // Zod validation error gets caught by general error handler
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("error");
    });

    it("should handle errors gracefully", async () => {
      // Create a pipeline that throws an error
      const errorPipeline = {
        getAnalogVideoQualityDetector: () => {
          throw new Error("Detector error");
        },
        getCameraAgingDetector: () => null,
        getCameraTypeClassifier: () => null,
        getDVRChannelHealthDetector: () => null,
      } as any;

      const errorApp = Fastify({ logger: false });
      await registerAnalogCameraApiRoutes(errorApp, errorPipeline);
      await errorApp.ready();

      const response = await errorApp.inject({
        method: "GET",
        url: "/v1/analog/report?format=csv",
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("error");
      expect(body.error).toBe("report_generation_failed");

      await errorApp.close();
    });
  });

  describe("CSV Data Integrity", () => {
    it("should properly escape camera names with commas", async () => {
      const pipelineWithCommas = createMockPipeline();
      pipelineWithCommas.getCameraTypeClassifier = () => ({
        getAllClassifications: () => [
          {
            cameraId: "cam_001",
            cameraName: "Lobby, East Entrance",
            cameraType: "standard-analog",
          },
        ],
        getAllUpgradeRecommendations: () => [],
        getUpgradeSummary: () => null,
      }) as any;

      const testApp = Fastify({ logger: false });
      await registerAnalogCameraApiRoutes(testApp, pipelineWithCommas);
      await testApp.ready();

      const response = await testApp.inject({
        method: "GET",
        url: "/v1/analog/report?format=csv",
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('"Lobby, East Entrance"');

      await testApp.close();
    });

    it("should prevent formula injection", async () => {
      const pipelineWithFormula = createMockPipeline();
      pipelineWithFormula.getCameraTypeClassifier = () => ({
        getAllClassifications: () => [
          {
            cameraId: "cam_001",
            cameraName: "=SUM(A1:A10)",
            cameraType: "standard-analog",
          },
        ],
        getAllUpgradeRecommendations: () => [],
        getUpgradeSummary: () => null,
      }) as any;

      const testApp = Fastify({ logger: false });
      await registerAnalogCameraApiRoutes(testApp, pipelineWithFormula);
      await testApp.ready();

      const response = await testApp.inject({
        method: "GET",
        url: "/v1/analog/report?format=csv",
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("'=SUM");

      await testApp.close();
    });

    it("should return valid CSV even with no cameras", async () => {
      const emptyPipeline = {
        getAnalogVideoQualityDetector: () => ({
          getCamerasWithIssues: () => [],
        }),
        getCameraAgingDetector: () => ({
          getCamerasByReplacementPriority: () => [],
        }),
        getCameraTypeClassifier: () => ({
          getAllClassifications: () => [],
          getAllUpgradeRecommendations: () => [],
          getUpgradeSummary: () => null,
        }),
        getDVRChannelHealthDetector: () => ({
          getAllChannelStatuses: () => [],
        }),
      } as any;

      const testApp = Fastify({ logger: false });
      await registerAnalogCameraApiRoutes(testApp, emptyPipeline);
      await testApp.ready();

      const response = await testApp.inject({
        method: "GET",
        url: "/v1/analog/report?format=csv",
      });

      expect(response.statusCode).toBe(200);

      const lines = response.body.split("\r\n");
      expect(lines.length).toBe(1); // Only header row
      expect(lines[0]).toContain("Camera ID");

      await testApp.close();
    });
  });
});
