import { describe, it, expect } from "vitest";
import { SmartMotionSearchService } from "../src/recording-index/smart-motion-search.service.js";
import { VideoWallDispatcherService } from "../src/media/services/video-wall-dispatcher.service.js";
import { EdgeReplenishmentService } from "../src/recording-continuity/services/edge-replenishment.service.js";

describe("Industry-Leading Features Unit Tests", () => {
  describe("Smart ROI Post-Recording Motion Search", () => {
    const service = new SmartMotionSearchService();

    it("generates correct spatial bitmasks for normalized ROI bounding boxes", () => {
      // Top-left quadrant: x in [0, 0.5], y in [0, 0.5] -> cells x in [0, 8], y in [0, 8]
      const mask = service.generateRoiBitmask({ x1: 0.0, y1: 0.0, x2: 0.5, y2: 0.5 }, 16, 16);
      expect(mask).toBeInstanceOf(Buffer);
      expect(mask.length).toBe(32); // 16x16 / 8 = 32 bytes

      // Bit at cell (0, 0) should be set: byte 0 bit 0 = 1
      expect((mask[0]! & 0x01)).toBe(0x01);
    });

    it("detects spatial overlap between overlapping bitmasks and rejects non-overlapping masks", () => {
      const maskTopLeft = service.generateRoiBitmask({ x1: 0.0, y1: 0.0, x2: 0.3, y2: 0.3 }, 16, 16);
      const maskBottomRight = service.generateRoiBitmask({ x1: 0.7, y1: 0.7, x2: 1.0, y2: 1.0 }, 16, 16);
      const maskCenter = service.generateRoiBitmask({ x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.8 }, 16, 16);

      // Top-left and bottom-right should not overlap
      expect(service.hasBitmaskOverlap(maskTopLeft, maskBottomRight)).toBe(false);

      // Center overlaps both top-left and bottom-right
      expect(service.hasBitmaskOverlap(maskCenter, maskTopLeft)).toBe(true);
      expect(service.hasBitmaskOverlap(maskCenter, maskBottomRight)).toBe(true);
    });
  });

  describe("Remote Video Wall / Matrix Dispatcher Service", () => {
    const service = new VideoWallDispatcherService();
    const tenantId = "tenant-soc-01";

    it("registers and retrieves physical display nodes", async () => {
      const display = await service.registerDisplay({
        tenantId,
        displayCode: "WALL-SOC-01",
        name: "Main Monitoring Screen",
        resolution: "3840x2160",
        location: "Central SOC Room",
        activeLayout: "grid-4",
      });

      expect(display.displayCode).toBe("WALL-SOC-01");
      expect(display.isOnline).toBe(true);

      const retrieved = await service.getDisplay("WALL-SOC-01");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe("Main Monitoring Screen");
    });

    it("records display heartbeats", async () => {
      const ok = await service.recordHeartbeat("WALL-SOC-01");
      expect(ok).toBe(true);
    });

    it("dispatches layout and assigned cameras to display node", async () => {
      const updated = await service.dispatchMatrix({
        tenantId,
        displayCode: "WALL-SOC-01",
        layout: "grid-9",
        assignedCameras: ["cam-vault-1", "cam-vault-2", "cam-entrance"],
        dispatchedBy: "operator-admin",
        reason: "Vault alarm investigation",
      });

      expect(updated.activeLayout).toBe("grid-9");
      expect(updated.assignedCameras).toEqual(["cam-vault-1", "cam-vault-2", "cam-entrance"]);
    });
  });

  describe("Edge Recording Replenishment (Trickle Sync)", () => {
    const service = new EdgeReplenishmentService();
    const tenantId = "tenant-branch-01";

    it("enqueues and updates replenishment jobs", async () => {
      const gapStart = new Date("2026-09-16T10:00:00Z");
      const gapEnd = new Date("2026-09-16T12:00:00Z");

      const job = await service.queueJob({
        tenantId,
        cameraId: "cam-rural-branch-01",
        gapStart,
        gapEnd,
        throttleKbps: 750,
        totalBytesEstimate: 52428800, // 50 MB
      });

      expect(job.id).toBeDefined();
      expect(job.status).toBe("PENDING");
      expect(job.throttleKbps).toBe(750);

      // Update progress
      const progressUpdated = await service.updateProgress(job.id, 26214400, 52428800, "IN_PROGRESS");
      expect(progressUpdated).toBe(true);

      const jobsList = await service.listJobs(tenantId, "IN_PROGRESS");
      expect(jobsList.length).toBe(1);
      expect(jobsList[0]?.bytesTransferred).toBe(26214400);

      // Complete job
      await service.updateProgress(job.id, 52428800, 52428800, "COMPLETED");
      const completedList = await service.listJobs(tenantId, "COMPLETED");
      expect(completedList.length).toBe(1);
    });
  });
});
