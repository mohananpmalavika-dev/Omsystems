import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  SynchronizedPlaybackService,
  synchronizedPlaybackService,
} from "../../src/vms/services/synchronized-playback.service.js";
import { buildApp } from "../../src/app.js";
import { MemoryStore } from "../../src/store.js";

describe("Production-Ready Multi-Camera Synchronized Playback & Drift Compensation", () => {
  let service: SynchronizedPlaybackService;

  beforeEach(() => {
    service = new SynchronizedPlaybackService();
  });

  describe("Banking Drift Tolerance Classification", () => {
    it("classifies <= 5000ms as SYNCHRONIZED", () => {
      expect(service.classifyDriftStatus(0)).toBe("SYNCHRONIZED");
      expect(service.classifyDriftStatus(250)).toBe("SYNCHRONIZED");
      expect(service.classifyDriftStatus(-1200)).toBe("SYNCHRONIZED");
      expect(service.classifyDriftStatus(5000)).toBe("SYNCHRONIZED");
      expect(service.classifyDriftStatus(-5000)).toBe("SYNCHRONIZED");
    });

    it("classifies 5001ms - 30000ms as DRIFT_WARNING", () => {
      expect(service.classifyDriftStatus(5001)).toBe("DRIFT_WARNING");
      expect(service.classifyDriftStatus(-7500)).toBe("DRIFT_WARNING");
      expect(service.classifyDriftStatus(18000)).toBe("DRIFT_WARNING");
      expect(service.classifyDriftStatus(30000)).toBe("DRIFT_WARNING");
      expect(service.classifyDriftStatus(-30000)).toBe("DRIFT_WARNING");
    });

    it("classifies > 30000ms as DRIFT_CRITICAL", () => {
      expect(service.classifyDriftStatus(30001)).toBe("DRIFT_CRITICAL");
      expect(service.classifyDriftStatus(-45000)).toBe("DRIFT_CRITICAL");
      expect(service.classifyDriftStatus(120000)).toBe("DRIFT_CRITICAL");
    });
  });

  describe("Mathematical Timeline Drift Compensation (T_device = T_master + Delta t)", () => {
    const startTime = "2026-08-17T10:00:00.000Z";
    const endTime = "2026-08-17T11:00:00.000Z";

    it("creates multi-camera session and computes initial device timestamps", async () => {
      const session = await service.createSession({
        tenantId: "TENANT-BANK-01",
        branchId: "BRANCH-NORTH-01",
        title: "Cash Vault Dual Angle Inspection",
        cameraIds: ["CAM-VAULT-01", "CAM-VAULT-02", "CAM-LOBBY-01"],
        startTime,
        endTime,
      });

      expect(session.sessionId).toBeDefined();
      expect(session.tracks.length).toBe(3);
      expect(session.currentTime).toBe(startTime);
      expect(session.driftCompensationEnabled).toBe(true);
      expect(session.state).toBe("PAUSED");
      expect(session.playbackSpeed).toBe(1.0);

      // Verify all tracks initialize with currentAlignedTimestamp = master currentTime
      for (const track of session.tracks) {
        expect(track.currentAlignedTimestamp).toBe(startTime);
        expect(track.currentOffsetMs).toBe(0);
      }
    });

    it("realigns device timestamps with manual drift calibrations", async () => {
      const session = await service.createSession({
        tenantId: "TENANT-BANK-01",
        branchId: "BRANCH-NORTH-01",
        title: "ATM Corridor Investigation",
        cameraIds: ["CAM-ATM-01", "CAM-ATM-02", "CAM-ATM-03"],
        startTime,
        endTime,
      });

      // Calibrate CAM-ATM-01 with +3500ms drift (healthy/SYNCHRONIZED)
      await service.calibrateDrift(session.sessionId, "CAM-ATM-01", 3500, "investigator-1");
      // Calibrate CAM-ATM-02 with -12000ms drift (DRIFT_WARNING)
      await service.calibrateDrift(session.sessionId, "CAM-ATM-02", -12000, "investigator-1");
      // Calibrate CAM-ATM-03 with +45000ms drift (DRIFT_CRITICAL)
      const calibratedSession = await service.calibrateDrift(session.sessionId, "CAM-ATM-03", 45000, "investigator-1");

      const track1 = calibratedSession.tracks.find((t) => t.cameraId === "CAM-ATM-01")!;
      const track2 = calibratedSession.tracks.find((t) => t.cameraId === "CAM-ATM-02")!;
      const track3 = calibratedSession.tracks.find((t) => t.cameraId === "CAM-ATM-03")!;

      expect(track1.measuredDriftMs).toBe(3500);
      expect(track1.driftStatus).toBe("SYNCHRONIZED");
      expect(track2.measuredDriftMs).toBe(-12000);
      expect(track2.driftStatus).toBe("DRIFT_WARNING");
      expect(track3.measuredDriftMs).toBe(45000);
      expect(track3.driftStatus).toBe("DRIFT_CRITICAL");

      // Seek to 10:20:00.000Z (1,200,000 ms into the session)
      const seekTarget = "2026-08-17T10:20:00.000Z";
      const seekTargetMs = new Date(seekTarget).getTime();
      const updated = await service.seek(session.sessionId, seekTarget);

      expect(updated.currentTime).toBe(seekTarget);

      const uTrack1 = updated.tracks.find((t) => t.cameraId === "CAM-ATM-01")!;
      const uTrack2 = updated.tracks.find((t) => t.cameraId === "CAM-ATM-02")!;
      const uTrack3 = updated.tracks.find((t) => t.cameraId === "CAM-ATM-03")!;

      // Master aligned time must be identical across all cameras
      expect(uTrack1.currentAlignedTimestamp).toBe(seekTarget);
      expect(uTrack2.currentAlignedTimestamp).toBe(seekTarget);
      expect(uTrack3.currentAlignedTimestamp).toBe(seekTarget);

      // Device time must satisfy T_device = T_master + Delta t
      expect(new Date(uTrack1.currentDeviceTimestamp).getTime()).toBe(seekTargetMs + 3500);
      expect(new Date(uTrack2.currentDeviceTimestamp).getTime()).toBe(seekTargetMs - 12000);
      expect(new Date(uTrack3.currentDeviceTimestamp).getTime()).toBe(seekTargetMs + 45000);
    });

    it("disables and re-enables drift compensation correctly", async () => {
      const session = await service.createSession({
        tenantId: "TENANT-BANK-01",
        branchId: "BRANCH-NORTH-01",
        title: "Drift Toggle Verification",
        cameraIds: ["CAM-A"],
        startTime,
        endTime,
      });

      await service.calibrateDrift(session.sessionId, "CAM-A", 8000, "operator");

      const seekTarget = "2026-08-17T10:15:00.000Z";
      const seekTargetMs = new Date(seekTarget).getTime();
      await service.seek(session.sessionId, seekTarget);

      // When enabled: compensationOffsetMs = 8000
      let track = (await service.getSession(session.sessionId))!.tracks[0]!;
      expect(track.compensationOffsetMs).toBe(8000);
      expect(new Date(track.currentDeviceTimestamp).getTime()).toBe(seekTargetMs + 8000);

      // Disable drift compensation: compensationOffsetMs becomes 0, device timestamp = master timestamp
      const disabledSession = await service.toggleDriftCompensation(session.sessionId, false);
      expect(disabledSession.driftCompensationEnabled).toBe(false);
      track = disabledSession.tracks[0]!;
      expect(track.compensationOffsetMs).toBe(0);
      expect(new Date(track.currentDeviceTimestamp).getTime()).toBe(seekTargetMs);

      // Re-enable drift compensation: restores compensation
      const reEnabledSession = await service.toggleDriftCompensation(session.sessionId, true);
      expect(reEnabledSession.driftCompensationEnabled).toBe(true);
      track = reEnabledSession.tracks[0]!;
      expect(track.compensationOffsetMs).toBe(8000);
      expect(new Date(track.currentDeviceTimestamp).getTime()).toBe(seekTargetMs + 8000);
    });

    it("validates timeline bounds on seek", async () => {
      const session = await service.createSession({
        tenantId: "TENANT-01",
        branchId: "BRANCH-01",
        title: "Bounds Test",
        cameraIds: ["CAM-01"],
        startTime,
        endTime,
      });

      // Before start time
      await expect(
        service.seek(session.sessionId, "2026-08-17T09:59:59.000Z")
      ).rejects.toThrow(/outside session bounds/);

      // After end time
      await expect(
        service.seek(session.sessionId, "2026-08-17T11:00:01.000Z")
      ).rejects.toThrow(/outside session bounds/);
    });
  });

  describe("Sub-Second Barrier Frame Stepping (40ms = 25fps)", () => {
    const startTime = "2026-08-17T10:00:00.000Z";
    const endTime = "2026-08-17T10:10:00.000Z";

    it("steps forward and backward by exactly 40ms at 25fps", async () => {
      const session = await service.createSession({
        tenantId: "TENANT-01",
        branchId: "BRANCH-01",
        title: "Frame Step Test",
        cameraIds: ["CAM-01", "CAM-02"],
        startTime,
        endTime,
      });

      // Seek to 10:05:00.000Z (300,000ms from start)
      const baseTime = "2026-08-17T10:05:00.000Z";
      const baseMs = new Date(baseTime).getTime();
      await service.seek(session.sessionId, baseTime);

      // Step Forward 1 frame at 25fps (+40ms)
      const stepForward = await service.stepFrame(session.sessionId, "FORWARD", 25);
      expect(new Date(stepForward.currentTime).getTime()).toBe(baseMs + 40);
      expect(stepForward.currentTime).toBe("2026-08-17T10:05:00.040Z");
      expect(stepForward.state).toBe("PAUSED");

      // Step Forward another frame (+40ms -> +80ms total)
      const stepForward2 = await service.stepFrame(session.sessionId, "FORWARD", 25);
      expect(new Date(stepForward2.currentTime).getTime()).toBe(baseMs + 80);

      // Step Backward 1 frame (-40ms -> +40ms)
      const stepBackward = await service.stepFrame(session.sessionId, "BACKWARD", 25);
      expect(new Date(stepBackward.currentTime).getTime()).toBe(baseMs + 40);

      // Step Backward again (-40ms -> 0ms offset from base)
      const stepBackward2 = await service.stepFrame(session.sessionId, "BACKWARD", 25);
      expect(new Date(stepBackward2.currentTime).getTime()).toBe(baseMs);
    });

    it("supports high frame rates (50fps = 20ms)", async () => {
      const session = await service.createSession({
        tenantId: "TENANT-01",
        branchId: "BRANCH-01",
        title: "50fps Frame Step",
        cameraIds: ["CAM-01"],
        startTime,
        endTime,
      });

      const baseTime = "2026-08-17T10:05:00.000Z";
      const baseMs = new Date(baseTime).getTime();
      await service.seek(session.sessionId, baseTime);

      const step50 = await service.stepFrame(session.sessionId, "FORWARD", 50);
      expect(new Date(step50.currentTime).getTime()).toBe(baseMs + 20);
    });

    it("clamps frame stepping at timeline boundaries", async () => {
      const session = await service.createSession({
        tenantId: "TENANT-01",
        branchId: "BRANCH-01",
        title: "Boundary Clamp Step",
        cameraIds: ["CAM-01"],
        startTime,
        endTime,
      });

      // At startTime: step backward should clamp at startTime
      const steppedAtStart = await service.stepFrame(session.sessionId, "BACKWARD", 25);
      expect(steppedAtStart.currentTime).toBe(startTime);

      // Seek to endTime: step forward should clamp at endTime
      await service.seek(session.sessionId, endTime);
      const steppedAtEnd = await service.stepFrame(session.sessionId, "FORWARD", 25);
      expect(steppedAtEnd.currentTime).toBe(endTime);
    });
  });

  describe("Playback State and Speed Multipliers", () => {
    it("updates playback state and variable speed rates", async () => {
      const session = await service.createSession({
        tenantId: "TENANT-01",
        branchId: "BRANCH-01",
        title: "Playback Control",
        cameraIds: ["CAM-01"],
        startTime: "2026-08-17T10:00:00.000Z",
        endTime: "2026-08-17T11:00:00.000Z",
      });

      // PLAYING at 2x
      const playing = await service.setPlaybackState(session.sessionId, "PLAYING", 2.0);
      expect(playing.state).toBe("PLAYING");
      expect(playing.playbackSpeed).toBe(2.0);

      // Fast forward 16x
      const fastForward = await service.setPlaybackState(session.sessionId, "PLAYING", 16.0);
      expect(fastForward.playbackSpeed).toBe(16.0);

      // Slow motion 0.25x
      const slowMo = await service.setPlaybackState(session.sessionId, "PLAYING", 0.25);
      expect(slowMo.playbackSpeed).toBe(0.25);

      // PAUSED
      const paused = await service.setPlaybackState(session.sessionId, "PAUSED", 1.0);
      expect(paused.state).toBe("PAUSED");
      expect(paused.playbackSpeed).toBe(1.0);
    });
  });

  describe("Multi-Angle Forensic Timeline Bookmarks", () => {
    it("captures state snapshots across all cameras at bookmark point", async () => {
      const session = await service.createSession({
        tenantId: "TENANT-BANK-01",
        branchId: "BRANCH-01",
        title: "Forensic Bookmark Testing",
        cameraIds: ["CAM-01", "CAM-02"],
        startTime: "2026-08-17T10:00:00.000Z",
        endTime: "2026-08-17T11:00:00.000Z",
      });

      // Calibrate CAM-02 with +2500ms drift
      await service.calibrateDrift(session.sessionId, "CAM-02", 2500, "operator-1");

      const bookmarkTime = "2026-08-17T10:18:42.120Z";
      const bookmarked = await service.addBookmark(
        session.sessionId,
        bookmarkTime,
        "Person of interest forced open rear fire exit",
        "chief-investigator",
        "Subject in black hoodie carrying duffle bag"
      );

      expect(bookmarked.bookmarks.length).toBe(1);
      const bm = bookmarked.bookmarks[0]!;
      expect(bm.bookmarkId).toBeDefined();
      expect(bm.timestamp).toBe(bookmarkTime);
      expect(bm.label).toContain("Person of interest");
      expect(bm.notes).toContain("black hoodie");
      expect(bm.createdByUser).toBe("chief-investigator");

      // Verify snapshots for both cameras
      expect(bm.cameraSnapshots).toBeDefined();
      expect(bm.cameraSnapshots!.length).toBe(2);

      const snap1 = bm.cameraSnapshots!.find((s) => s.cameraId === "CAM-01")!;
      const snap2 = bm.cameraSnapshots!.find((s) => s.cameraId === "CAM-02")!;

      expect(snap1.alignedTimestamp).toBe(session.currentTime);
      expect(snap2.driftOffsetMs).toBe(2500);

      const retrieved = await service.getBookmarks(session.sessionId);
      expect(retrieved.length).toBe(1);
      expect(retrieved[0]!.bookmarkId).toBe(bm.bookmarkId);
    });
  });

  describe("PostgreSQL Database Persistence & Recovery", () => {
    it("persists sessions and tracks to PostgreSQL when pool is provided", async () => {
      const queryMock = vi.fn().mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes("SELECT id, name")) {
          return {
            rows: [
              { id: "CAM-01", name: "North Gate Cam", location: "Gate 1", branch_id: "BR-01" },
              { id: "CAM-02", name: "South Gate Cam", location: "Gate 2", branch_id: "BR-01" },
            ],
          };
        }
        if (sql.includes("SELECT DISTINCT ON (node_id)")) {
          return {
            rows: [
              { node_id: "CAM-01", offset_ms: 150, status: "SYNCHRONIZED" },
              { node_id: "CAM-02", offset_ms: 6200, status: "DRIFT_WARNING" },
            ],
          };
        }
        if (sql.includes("SELECT * FROM synchronized_playback_sessions")) {
          return {
            rows: [
              {
                id: params[0],
                tenant_id: "TENANT-01",
                branch_id: "BR-01",
                title: "Persisted Session",
                start_time: "2026-08-17T10:00:00.000Z",
                end_time: "2026-08-17T11:00:00.000Z",
                current_master_time: "2026-08-17T10:15:00.000Z",
                master_camera_id: "CAM-01",
                layout: "2x2",
                playback_speed: 1.0,
                state: "PAUSED",
                drift_compensation_enabled: true,
                created_at: "2026-08-17T10:00:00.000Z",
                updated_at: "2026-08-17T10:15:00.000Z",
              },
            ],
          };
        }
        if (sql.includes("SELECT * FROM synchronized_playback_tracks")) {
          return {
            rows: [
              {
                session_id: params[0],
                camera_id: "CAM-01",
                camera_name: "North Gate Cam",
                channel_index: 1,
                has_coverage: true,
                measured_drift_ms: 150,
                compensation_offset_ms: 150,
                drift_status: "SYNCHRONIZED",
                current_aligned_timestamp: "2026-08-17T10:15:00.000Z",
                current_device_timestamp: "2026-08-17T10:15:00.150Z",
                keyframe_offset_bytes: 1024,
                keyframe_pts: 90000,
                is_in_gap: false,
              },
            ],
          };
        }
        if (sql.includes("SELECT * FROM synchronized_playback_bookmarks")) {
          return { rows: [] };
        }
        if (sql.includes("DELETE FROM synchronized_playback_sessions")) {
          return { rowCount: 1 };
        }
        return { rows: [] };
      });

      const mockPool = { query: queryMock } as any;
      const pgService = new SynchronizedPlaybackService(mockPool);

      const session = await pgService.createSession({
        tenantId: "TENANT-01",
        branchId: "BR-01",
        title: "DB Persisted Session",
        cameraIds: ["CAM-01", "CAM-02"],
        startTime: "2026-08-17T10:00:00.000Z",
        endTime: "2026-08-17T11:00:00.000Z",
      });

      expect(queryMock).toHaveBeenCalled();
      // Verified camera name was picked from DB
      const track1 = session.tracks.find((t) => t.cameraId === "CAM-01");
      expect(track1?.cameraName).toBe("North Gate Cam");
      expect(track1?.measuredDriftMs).toBe(150);

      const track2 = session.tracks.find((t) => t.cameraId === "CAM-02");
      expect(track2?.measuredDriftMs).toBe(6200);
      expect(track2?.driftStatus).toBe("DRIFT_WARNING");

      // Test deleteSession cleans up in DB
      const deleted = await pgService.deleteSession(session.sessionId);
      expect(deleted).toBe(true);
    });
  });

  describe("Fastify REST API Route Integration", () => {
    let app: FastifyInstance;
    let store: MemoryStore;

    beforeEach(async () => {
      store = new MemoryStore();
      app = await buildApp({ store, mediaGatewaySharedKey: "test-shared-key" });
    });

    afterEach(async () => {
      await app.close();
    });

    it("manages complete synchronized playback lifecycle via REST API", async () => {
      const authHeaders = { "x-user-id": "user-global-admin", "x-tenant-id": "00000000-0000-4000-8000-000000000000" };

      // 1. POST /v1/playback/sync/sessions - Create Session
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/playback/sync/sessions",
        headers: authHeaders,
        payload: {
          branchId: "BRANCH-NORTH",
          title: "Forensic Multi-Angle Audit",
          cameraIds: ["CAM-01", "CAM-02"],
          startTime: "2026-08-17T10:00:00.000Z",
          endTime: "2026-08-17T11:00:00.000Z",
          layout: "2x2",
          driftCompensationEnabled: true,
        },
      });

      expect(createRes.statusCode).toBe(201);
      const session = createRes.json().data;
      expect(session.sessionId).toBeDefined();
      expect(session.tracks.length).toBe(2);
      expect(session.currentTime).toBe("2026-08-17T10:00:00.000Z");

      const sessionId = session.sessionId;

      // 2. GET /v1/playback/sync/sessions - List Sessions
      const listRes = await app.inject({
        method: "GET",
        url: "/v1/playback/sync/sessions?branchId=BRANCH-NORTH",
        headers: authHeaders,
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().data.length).toBeGreaterThanOrEqual(1);

      // 3. GET /v1/playback/sync/sessions/:id - Get Session
      const getRes = await app.inject({
        method: "GET",
        url: `/v1/playback/sync/sessions/${sessionId}`,
        headers: authHeaders,
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().data.sessionId).toBe(sessionId);

      // 4. POST /v1/playback/sync/sessions/:id/calibrate - Calibrate Drift
      const calibrateRes = await app.inject({
        method: "POST",
        url: `/v1/playback/sync/sessions/${sessionId}/calibrate`,
        headers: authHeaders,
        payload: {
          cameraId: "CAM-02",
          manualOffsetMs: 4200,
        },
      });
      expect(calibrateRes.statusCode).toBe(200);
      const calTrack = calibrateRes.json().data.tracks.find((t: any) => t.cameraId === "CAM-02");
      expect(calTrack.measuredDriftMs).toBe(4200);
      expect(calTrack.driftStatus).toBe("SYNCHRONIZED");

      // 5. POST /v1/playback/sync/sessions/:id/seek - Seek Timeline
      const seekRes = await app.inject({
        method: "POST",
        url: `/v1/playback/sync/sessions/${sessionId}/seek`,
        headers: authHeaders,
        payload: {
          targetTimestamp: "2026-08-17T10:30:00.000Z",
        },
      });
      expect(seekRes.statusCode).toBe(200);
      const seeked = seekRes.json().data;
      expect(seeked.currentTime).toBe("2026-08-17T10:30:00.000Z");
      const seekTrack2 = seeked.tracks.find((t: any) => t.cameraId === "CAM-02");
      expect(seekTrack2.currentAlignedTimestamp).toBe("2026-08-17T10:30:00.000Z");
      expect(seekTrack2.currentDeviceTimestamp).toBe("2026-08-17T10:30:04.200Z");

      // 6. POST /v1/playback/sync/sessions/:id/step - Step Frame (+40ms)
      const stepRes = await app.inject({
        method: "POST",
        url: `/v1/playback/sync/sessions/${sessionId}/step`,
        headers: authHeaders,
        payload: {
          direction: "FORWARD",
          fps: 25,
        },
      });
      expect(stepRes.statusCode).toBe(200);
      expect(stepRes.json().data.currentTime).toBe("2026-08-17T10:30:00.040Z");

      // 7. POST /v1/playback/sync/sessions/:id/state - Update Playback State
      const stateRes = await app.inject({
        method: "POST",
        url: `/v1/playback/sync/sessions/${sessionId}/state`,
        headers: authHeaders,
        payload: {
          state: "PLAYING",
          speed: 4.0,
        },
      });
      expect(stateRes.statusCode).toBe(200);
      expect(stateRes.json().data.state).toBe("PLAYING");
      expect(stateRes.json().data.playbackSpeed).toBe(4.0);

      // 8. POST /v1/playback/sync/sessions/:id/drift-toggle - Toggle Drift Compensation
      const toggleRes = await app.inject({
        method: "POST",
        url: `/v1/playback/sync/sessions/${sessionId}/drift-toggle`,
        headers: authHeaders,
        payload: { enabled: false },
      });
      expect(toggleRes.statusCode).toBe(200);
      expect(toggleRes.json().data.driftCompensationEnabled).toBe(false);

      // 9. POST /v1/playback/sync/sessions/:id/bookmarks - Add Bookmark
      const bmRes = await app.inject({
        method: "POST",
        url: `/v1/playback/sync/sessions/${sessionId}/bookmarks`,
        headers: authHeaders,
        payload: {
          timestamp: "2026-08-17T10:30:00.040Z",
          label: "Suspicious activity detected near server rack",
          notes: "Technician bypassed biometric scanner",
        },
      });
      expect(bmRes.statusCode).toBe(201);
      expect(bmRes.json().data.bookmarks.length).toBe(1);

      // 10. GET /v1/playback/sync/sessions/:id/bookmarks - List Bookmarks
      const listBmRes = await app.inject({
        method: "GET",
        url: `/v1/playback/sync/sessions/${sessionId}/bookmarks`,
        headers: authHeaders,
      });
      expect(listBmRes.statusCode).toBe(200);
      expect(listBmRes.json().data.length).toBe(1);

      // 11. DELETE /v1/playback/sync/sessions/:id - Terminate Session
      const delRes = await app.inject({
        method: "DELETE",
        url: `/v1/playback/sync/sessions/${sessionId}`,
        headers: authHeaders,
      });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().success).toBe(true);
    });
  });
});
