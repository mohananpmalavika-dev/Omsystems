/**
 * Industrial Analytics Integration Tests
 * Tests zone management, configuration, violation detection, and persistence
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Pool } from "pg";
import { IndustrialPersistenceService } from "../src/industrial/industrial-persistence.service.js";

describe("Industrial Analytics End-to-End", () => {
  let db: Pool;
  let persistenceService: IndustrialPersistenceService;

  const testTenantId = "tenant-industrial-e2e";
  const testCameraId = "camera-industrial-001";

  beforeEach(async () => {
    db = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || "postgresql://localhost/sentinel_test",
    });

    persistenceService = new IndustrialPersistenceService(db);

    // Initialize tables
    await persistenceService.initializeTables();

    // Insert test camera
    await db.query(`
      INSERT INTO cameras (id, tenant_id, name) 
      VALUES ($1, $2, $3) 
      ON CONFLICT DO NOTHING
    `, [testCameraId, testTenantId, "Industrial Test Camera"]);
  });

  afterEach(async () => {
    await db.query("DELETE FROM industrial_violations WHERE tenant_id = $1", [testTenantId]);
    await db.query("DELETE FROM industrial_zones WHERE tenant_id = $1", [testTenantId]);
    await db.query("DELETE FROM industrial_camera_config WHERE tenant_id = $1", [testTenantId]);
    await db.query("DELETE FROM cameras WHERE tenant_id = $1", [testTenantId]);
    await db.end();
  });

  describe("Zone Management", () => {
    it("creates and retrieves industrial zone", async () => {
      const zone = await persistenceService.saveZone({
        id: "zone-001",
        tenantId: testTenantId,
        cameraId: testCameraId,
        name: "Restricted Area 1",
        zoneType: "restricted",
        polygon: [
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.1 },
          { x: 0.5, y: 0.5 },
          { x: 0.1, y: 0.5 },
        ],
        enabled: true,
        metadata: { risk: "high" },
        createdBy: "admin-001",
      });

      expect(zone.id).toBe("zone-001");
      expect(zone.name).toBe("Restricted Area 1");
      expect(zone.zoneType).toBe("restricted");

      const retrieved = await persistenceService.getZoneById(testTenantId, "zone-001");
      expect(retrieved).toBeTruthy();
      expect(retrieved!.polygon).toHaveLength(4);
    });

    it("lists zones by camera", async () => {
      await persistenceService.saveZone({
        id: "zone-list-1",
        tenantId: testTenantId,
        cameraId: testCameraId,
        name: "Equipment Zone",
        zoneType: "equipment-only",
        polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
        enabled: true,
      });

      await persistenceService.saveZone({
        id: "zone-list-2",
        tenantId: testTenantId,
        cameraId: testCameraId,
        name: "Pedestrian Zone",
        zoneType: "pedestrian-only",
        polygon: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }, { x: 0, y: 1 }],
        enabled: true,
      });

      const zones = await persistenceService.getZonesByCamera(testTenantId, testCameraId);
      expect(zones).toHaveLength(2);
      expect(zones.map(z => z.zoneType)).toContain("equipment-only");
      expect(zones.map(z => z.zoneType)).toContain("pedestrian-only");
    });

    it("updates existing zone", async () => {
      await persistenceService.saveZone({
        id: "zone-update",
        tenantId: testTenantId,
        cameraId: testCameraId,
        name: "Original Name",
        zoneType: "monitoring",
        polygon: [{ x: 0, y: 0 }],
        enabled: true,
      });

      const updated = await persistenceService.saveZone({
        id: "zone-update",
        tenantId: testTenantId,
        cameraId: testCameraId,
        name: "Updated Name",
        zoneType: "hazard",
        polygon: [{ x: 0.2, y: 0.2 }],
        enabled: true,
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.zoneType).toBe("hazard");
    });

    it("soft deletes zone", async () => {
      await persistenceService.saveZone({
        id: "zone-delete",
        tenantId: testTenantId,
        cameraId: testCameraId,
        name: "To Delete",
        zoneType: "monitoring",
        polygon: [{ x: 0, y: 0 }],
        enabled: true,
      });

      const deleted = await persistenceService.deleteZone(testTenantId, "zone-delete");
      expect(deleted).toBe(true);

      const zones = await persistenceService.getZonesByCamera(testTenantId, testCameraId);
      expect(zones.find(z => z.id === "zone-delete")).toBeUndefined();

      // Zone still exists in database but disabled
      const retrieved = await persistenceService.getZoneById(testTenantId, "zone-delete");
      expect(retrieved).toBeTruthy();
      expect(retrieved!.enabled).toBe(false);
    });
  });

  describe("Configuration Management", () => {
    it("saves and retrieves camera industrial config", async () => {
      const config = await persistenceService.saveConfig({
        tenantId: testTenantId,
        cameraId: testCameraId,
        enabled: true,
        minPersonEquipmentDistance: 200,
        enforceZoneRestrictions: true,
        idleTimeThreshold: 600,
        stationaryTimeThreshold: 120,
        metadata: { facility: "warehouse-a" },
        updatedBy: "config-admin",
      });

      expect(config.minPersonEquipmentDistance).toBe(200);
      expect(config.idleTimeThreshold).toBe(600);

      const retrieved = await persistenceService.getConfig(testTenantId, testCameraId);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.minPersonEquipmentDistance).toBe(200);
      expect(retrieved!.metadata).toEqual({ facility: "warehouse-a" });
    });

    it("updates existing configuration", async () => {
      await persistenceService.saveConfig({
        tenantId: testTenantId,
        cameraId: testCameraId,
        enabled: true,
        minPersonEquipmentDistance: 150,
        enforceZoneRestrictions: true,
        idleTimeThreshold: 300,
        stationaryTimeThreshold: 60,
      });

      const updated = await persistenceService.saveConfig({
        tenantId: testTenantId,
        cameraId: testCameraId,
        enabled: true,
        minPersonEquipmentDistance: 250,
        enforceZoneRestrictions: false,
        idleTimeThreshold: 900,
        stationaryTimeThreshold: 180,
        updatedBy: "admin-update",
      });

      expect(updated.minPersonEquipmentDistance).toBe(250);
      expect(updated.enforceZoneRestrictions).toBe(false);
      expect(updated.idleTimeThreshold).toBe(900);
    });

    it("returns default config when not configured", async () => {
      const config = await persistenceService.getDefaultConfig();

      expect(config.minPersonEquipmentDistance).toBe(150);
      expect(config.enforceZoneRestrictions).toBe(true);
      expect(config.idleTimeThreshold).toBe(300);
      expect(config.stationaryTimeThreshold).toBe(60);
    });
  });

  describe("Violation Management", () => {
    it("records and retrieves violations", async () => {
      const violation = await persistenceService.saveViolation({
        tenantId: testTenantId,
        cameraId: testCameraId,
        violationType: "person-near-forklift",
        severity: "high",
        description: "Person detected within 2m of moving forklift",
        equipmentType: "forklift",
        personTrackId: "person-track-001",
        equipmentTrackId: "forklift-track-001",
        snapshot: "s3://snapshots/violation-001.jpg",
        metadata: { distance: 1.5 },
        occurredAt: new Date(),
      });

      expect(violation.id).toBeTruthy();
      expect(violation.severity).toBe("high");
      expect(violation.reviewStatus).toBe("unreviewed");

      const result = await persistenceService.getViolations(testTenantId, {});
      expect(result.violations).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("filters violations by severity", async () => {
      await persistenceService.saveViolation({
        tenantId: testTenantId,
        cameraId: testCameraId,
        violationType: "zone-intrusion",
        severity: "critical",
        description: "Unauthorized entry",
        occurredAt: new Date(),
      });

      await persistenceService.saveViolation({
        tenantId: testTenantId,
        cameraId: testCameraId,
        violationType: "idle-equipment",
        severity: "low",
        description: "Equipment idle for 30 minutes",
        occurredAt: new Date(),
      });

      const criticalOnly = await persistenceService.getViolations(testTenantId, {
        severity: "critical",
      });

      expect(criticalOnly.violations).toHaveLength(1);
      expect(criticalOnly.violations[0]!.severity).toBe("critical");
    });

    it("filters violations by type", async () => {
      await persistenceService.saveViolation({
        tenantId: testTenantId,
        cameraId: testCameraId,
        violationType: "person-near-crane",
        severity: "high",
        description: "Person near crane",
        occurredAt: new Date(),
      });

      await persistenceService.saveViolation({
        tenantId: testTenantId,
        cameraId: testCameraId,
        violationType: "person-near-forklift",
        severity: "high",
        description: "Person near forklift",
        occurredAt: new Date(),
      });

      const craneViolations = await persistenceService.getViolations(testTenantId, {
        violationType: "person-near-crane",
      });

      expect(craneViolations.violations).toHaveLength(1);
      expect(craneViolations.violations[0]!.violationType).toBe("person-near-crane");
    });

    it("filters violations by date range", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await persistenceService.saveViolation({
        tenantId: testTenantId,
        cameraId: testCameraId,
        violationType: "old-violation",
        severity: "medium",
        description: "Yesterday",
        occurredAt: yesterday,
      });

      await persistenceService.saveViolation({
        tenantId: testTenantId,
        cameraId: testCameraId,
        violationType: "new-violation",
        severity: "medium",
        description: "Today",
        occurredAt: now,
      });

      const todayOnly = await persistenceService.getViolations(testTenantId, {
        fromDate: new Date(now.getTime() - 1000), // Just before now
        toDate: tomorrow,
      });

      expect(todayOnly.violations).toHaveLength(1);
      expect(todayOnly.violations[0]!.violationType).toBe("new-violation");
    });

    it("reviews and confirms violation", async () => {
      const violation = await persistenceService.saveViolation({
        tenantId: testTenantId,
        cameraId: testCameraId,
        violationType: "test-violation",
        severity: "high",
        description: "Test",
        occurredAt: new Date(),
      });

      const reviewed = await persistenceService.reviewViolation(
        testTenantId,
        violation.id!,
        "confirmed",
        "reviewer-001",
        "Verified genuine violation",
      );

      expect(reviewed).toBeTruthy();
      expect(reviewed!.reviewStatus).toBe("confirmed");
      expect(reviewed!.reviewedBy).toBe("reviewer-001");
      expect(reviewed!.reviewNotes).toBe("Verified genuine violation");
    });

    it("reviews and rejects false positive", async () => {
      const violation = await persistenceService.saveViolation({
        tenantId: testTenantId,
        cameraId: testCameraId,
        violationType: "false-positive",
        severity: "medium",
        description: "False detection",
        occurredAt: new Date(),
      });

      const reviewed = await persistenceService.reviewViolation(
        testTenantId,
        violation.id!,
        "rejected",
        "reviewer-002",
        "Not a genuine violation",
      );

      expect(reviewed!.reviewStatus).toBe("rejected");
    });

    it("resolves violation", async () => {
      const violation = await persistenceService.saveViolation({
        tenantId: testTenantId,
        cameraId: testCameraId,
        violationType: "resolvable",
        severity: "high",
        description: "To be resolved",
        occurredAt: new Date(),
      });

      expect(violation.resolvedAt).toBeUndefined();

      const resolved = await persistenceService.resolveViolation(testTenantId, violation.id!);

      expect(resolved).toBeTruthy();
      expect(resolved!.resolvedAt).toBeTruthy();
    });

    it("paginates violation results", async () => {
      // Create 25 violations
      for (let i = 0; i < 25; i++) {
        await persistenceService.saveViolation({
          tenantId: testTenantId,
          cameraId: testCameraId,
          violationType: `violation-${i}`,
          severity: "medium",
          description: `Violation ${i}`,
          occurredAt: new Date(),
        });
      }

      const page1 = await persistenceService.getViolations(testTenantId, {
        limit: 10,
        offset: 0,
      });

      expect(page1.violations).toHaveLength(10);
      expect(page1.total).toBe(25);

      const page2 = await persistenceService.getViolations(testTenantId, {
        limit: 10,
        offset: 10,
      });

      expect(page2.violations).toHaveLength(10);
      expect(page2.total).toBe(25);

      const page3 = await persistenceService.getViolations(testTenantId, {
        limit: 10,
        offset: 20,
      });

      expect(page3.violations).toHaveLength(5);
      expect(page3.total).toBe(25);
    });
  });

  describe("Zone-Violation Integration", () => {
    it("records violation with zone reference", async () => {
      const zone = await persistenceService.saveZone({
        id: "zone-violation-test",
        tenantId: testTenantId,
        cameraId: testCameraId,
        name: "Hazardous Zone",
        zoneType: "hazard",
        polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
        enabled: true,
      });

      const violation = await persistenceService.saveViolation({
        tenantId: testTenantId,
        cameraId: testCameraId,
        violationType: "zone-intrusion",
        severity: "critical",
        description: "Unauthorized entry into hazardous zone",
        zoneId: zone.id,
        personTrackId: "person-001",
        occurredAt: new Date(),
      });

      expect(violation.zoneId).toBe(zone.id);

      const violations = await persistenceService.getViolations(testTenantId, {});
      expect(violations.violations[0]!.zoneId).toBe("zone-violation-test");
    });
  });
});
