/**
 * Analog Camera CSV Export Tests
 * Unit tests for analog camera analytics CSV serialization
 */

import { describe, it, expect } from "vitest";
import {
  serializeAnalogCameraCsv,
  boolToYesNo,
  joinForCsv,
  type AnalogCameraExportRow,
} from "../analog-camera-csv.js";

describe("Analog Camera CSV Export", () => {
  describe("boolToYesNo", () => {
    it("should convert true to Yes", () => {
      expect(boolToYesNo(true)).toBe("Yes");
    });

    it("should convert false to No", () => {
      expect(boolToYesNo(false)).toBe("No");
    });

    it("should convert undefined to empty string", () => {
      expect(boolToYesNo(undefined)).toBe("");
    });
  });

  describe("joinForCsv", () => {
    it("should join array with semicolons", () => {
      expect(joinForCsv(["a", "b", "c"])).toBe("a; b; c");
    });

    it("should handle empty array", () => {
      expect(joinForCsv([])).toBe("");
    });

    it("should handle undefined", () => {
      expect(joinForCsv(undefined)).toBe("");
    });

    it("should handle single item", () => {
      expect(joinForCsv(["only"])).toBe("only");
    });

    it("should handle items with commas safely", () => {
      // Using semicolons prevents issues with CSV commas
      expect(joinForCsv(["item, with, commas", "normal"])).toBe(
        "item, with, commas; normal"
      );
    });
  });

  describe("serializeAnalogCameraCsv", () => {
    it("should return only headers for empty data", () => {
      const csv = serializeAnalogCameraCsv([]);
      const lines = csv.split("\r\n");

      expect(lines.length).toBe(1);
      expect(lines[0]).toContain("Camera ID");
      expect(lines[0]).toContain("Camera Name");
      expect(lines[0]).toContain("Video Quality Score");
      expect(lines[0]).toContain("AI Accuracy Estimate");
    });

    it("should serialize minimal camera data", () => {
      const cameras: AnalogCameraExportRow[] = [
        {
          cameraId: "cam_001",
          cameraType: "standard-analog",
        },
      ];

      const csv = serializeAnalogCameraCsv(cameras);
      const lines = csv.split("\r\n");

      expect(lines.length).toBe(2); // header + 1 data row
      expect(lines[1]).toContain("cam_001");
      expect(lines[1]).toContain("standard-analog");
    });

    it("should serialize complete camera data", () => {
      const cameras: AnalogCameraExportRow[] = [
        {
          cameraId: "cam_001",
          cameraName: "Lobby Camera",
          location: "Building A - Entrance",
          cameraType: "hd-analog",
          analogStandard: "hd-tvi",
          signalType: "analog",
          connectionType: "dvr-channel",
          resolutionWidth: 1920,
          resolutionHeight: 1080,
          resolutionMegapixels: 2.1,
          videoQualityScore: 85,
          brightness: 120,
          contrast: 65,
          sharpness: 75,
          noiseLevel: 12,
          colorSaturation: 80,
          interlacing: 5,
          qualityIssues: "snow; weak-signal",
          qualityIssueCount: 2,
          mostSevereIssue: "weak-signal (medium)",
          degradationTrend: "stable",
          aiAccuracyEstimate: 78,
          aiCapabilities: "person-detection; vehicle-detection",
          estimatedAgeYears: 3.5,
          healthScore: 82,
          failureRiskScore: 25,
          replacementPriority: 40,
          maintenanceRecommendation: "Clean lens and check signal cable",
          maintenancePriority: "medium",
          estimatedMaintenanceCostUSD: 150,
          maintenanceUrgencyDays: 30,
          upgradeRecommendation: "Consider IP camera upgrade for better AI accuracy",
          recommendedUpgradeType: "ip-camera",
          upgradeAccuracyGain: 22,
          upgradeCostUSD: 250,
          upgradeROIPriority: "high",
          dvrId: "dvr_05",
          dvrName: "DVR Building A",
          channelNumber: 3,
          channelStatus: "healthy",
          nightVision: "Yes",
          wdr: "No",
          ptz: "No",
          colorMode: "day-night",
          status: "ONLINE",
          lastSeenAt: new Date("2026-08-11T10:30:00Z"),
          lastQualityCheckAt: new Date("2026-08-11T10:25:00Z"),
          firstSeenAt: new Date("2023-01-15T08:00:00Z"),
          installationDate: new Date("2023-01-15T08:00:00Z"),
        },
      ];

      const csv = serializeAnalogCameraCsv(cameras);
      const lines = csv.split("\r\n");

      expect(lines.length).toBe(2);

      const dataRow = lines[1];
      expect(dataRow).toContain("cam_001");
      expect(dataRow).toContain("Lobby Camera");
      expect(dataRow).toContain("hd-analog");
      expect(dataRow).toContain("1920");
      expect(dataRow).toContain("1080");
      expect(dataRow).toContain("85");
      expect(dataRow).toContain("78");
      expect(dataRow).toContain("dvr_05");
      expect(dataRow).toContain("Yes"); // night vision
      expect(dataRow).toContain("2026-08-11T10:30:00.000Z");
    });

    it("should handle camera names with commas", () => {
      const cameras: AnalogCameraExportRow[] = [
        {
          cameraId: "cam_001",
          cameraName: "Lobby, East Entrance",
          cameraType: "standard-analog",
        },
      ];

      const csv = serializeAnalogCameraCsv(cameras);
      const lines = csv.split("\r\n");

      // Camera name should be quoted because it contains a comma
      expect(lines[1]).toContain('"Lobby, East Entrance"');
    });

    it("should handle camera names with quotes", () => {
      const cameras: AnalogCameraExportRow[] = [
        {
          cameraId: "cam_001",
          cameraName: 'Camera "Alpha"',
          cameraType: "standard-analog",
        },
      ];

      const csv = serializeAnalogCameraCsv(cameras);
      const lines = csv.split("\r\n");

      // Quotes should be escaped
      expect(lines[1]).toContain('Camera ""Alpha""');
    });

    it("should handle undefined optional fields", () => {
      const cameras: AnalogCameraExportRow[] = [
        {
          cameraId: "cam_001",
          cameraType: "unknown",
          // All optional fields are undefined
        },
      ];

      const csv = serializeAnalogCameraCsv(cameras);
      const lines = csv.split("\r\n");

      expect(lines.length).toBe(2);
      expect(lines[1]).toContain("cam_001");

      // Count commas - should have correct number of columns
      const commaCount = (lines[1].match(/,/g) || []).length;
      const headerCommaCount = (lines[0].match(/,/g) || []).length;
      expect(commaCount).toBe(headerCommaCount);
    });

    it("should handle multiple cameras", () => {
      const cameras: AnalogCameraExportRow[] = [
        {
          cameraId: "cam_001",
          cameraName: "Camera 1",
          cameraType: "standard-analog",
          videoQualityScore: 75,
        },
        {
          cameraId: "cam_002",
          cameraName: "Camera 2",
          cameraType: "hd-analog",
          videoQualityScore: 85,
        },
        {
          cameraId: "cam_003",
          cameraName: "Camera 3",
          cameraType: "ip-camera",
          videoQualityScore: 95,
        },
      ];

      const csv = serializeAnalogCameraCsv(cameras);
      const lines = csv.split("\r\n");

      expect(lines.length).toBe(4); // header + 3 rows
      expect(lines[1]).toContain("cam_001");
      expect(lines[2]).toContain("cam_002");
      expect(lines[3]).toContain("cam_003");
    });

    it("should handle formula injection in camera names", () => {
      const cameras: AnalogCameraExportRow[] = [
        {
          cameraId: "cam_001",
          cameraName: "=SUM(A1:A10)",
          cameraType: "standard-analog",
        },
      ];

      const csv = serializeAnalogCameraCsv(cameras);
      const lines = csv.split("\r\n");

      // Should be prefixed with single quote to neutralize formula
      expect(lines[1]).toContain("'=SUM");
    });

    it("should handle null dates", () => {
      const cameras: AnalogCameraExportRow[] = [
        {
          cameraId: "cam_001",
          cameraType: "standard-analog",
          lastSeenAt: null,
          installationDate: null,
        },
      ];

      const csv = serializeAnalogCameraCsv(cameras);
      const lines = csv.split("\r\n");

      expect(lines.length).toBe(2);
      // Null dates should become empty fields
      expect(lines[1]).toContain(",,"); // consecutive commas for empty fields
    });

    it("should format dates consistently", () => {
      const cameras: AnalogCameraExportRow[] = [
        {
          cameraId: "cam_001",
          cameraType: "standard-analog",
          lastSeenAt: new Date("2026-08-11T15:30:20.123Z"),
        },
      ];

      const csv = serializeAnalogCameraCsv(cameras);

      // Should use ISO 8601 format
      expect(csv).toContain("2026-08-11T15:30:20.123Z");
    });

    it("should have deterministic column order", () => {
      const cameras: AnalogCameraExportRow[] = [
        {
          cameraId: "cam_001",
          cameraType: "standard-analog",
        },
      ];

      const csv1 = serializeAnalogCameraCsv(cameras);
      const csv2 = serializeAnalogCameraCsv(cameras);

      // Multiple exports should produce identical output
      expect(csv1).toBe(csv2);
    });

    it("should handle special characters in location", () => {
      const cameras: AnalogCameraExportRow[] = [
        {
          cameraId: "cam_001",
          location: "Building A\nFloor 2\r\nRoom 205",
          cameraType: "standard-analog",
        },
      ];

      const csv = serializeAnalogCameraCsv(cameras);

      // Newlines in data should be quoted
      expect(csv).toContain('"Building A\nFloor 2\r\nRoom 205"');
    });

    it("should handle numeric values correctly", () => {
      const cameras: AnalogCameraExportRow[] = [
        {
          cameraId: "cam_001",
          cameraType: "standard-analog",
          videoQualityScore: 0, // Zero should be preserved
          resolutionWidth: 1920,
          resolutionHeight: 1080,
          channelNumber: 1,
        },
      ];

      const csv = serializeAnalogCameraCsv(cameras);
      const lines = csv.split("\r\n");

      expect(lines[1]).toContain("0"); // Zero should appear, not empty
      expect(lines[1]).toContain("1920");
      expect(lines[1]).toContain("1080");
    });

    it("should preserve precision for decimal numbers", () => {
      const cameras: AnalogCameraExportRow[] = [
        {
          cameraId: "cam_001",
          cameraType: "standard-analog",
          resolutionMegapixels: 2.073,
          estimatedAgeYears: 3.5,
        },
      ];

      const csv = serializeAnalogCameraCsv(cameras);

      expect(csv).toContain("2.073");
      expect(csv).toContain("3.5");
    });
  });
});
