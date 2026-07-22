import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Pool } from "pg";
import { PlaybackEngine } from "./playback-engine.js";

describe("PlaybackEngine", () => {
  let mockPool: Pool;
  let engine: PlaybackEngine;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    engine = new PlaybackEngine(mockPool);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe("createPlaybackSession", () => {
    it("should create a new playback session", async () => {
      const mockSession = {
        id: "session-1",
        user_id: "user-1",
        segment_id: "seg-1",
        camera_id: "cam-1",
        created_at: new Date().toISOString(),
        status: "active",
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockSession],
      } as any);

      const result = await engine.createPlaybackSession(
        "user-1",
        "seg-1",
        "cam-1",
        "case-1"
      );

      expect(result.id).toBe("session-1");
      expect(result.status).toBe("active");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO playback_sessions"),
        expect.arrayContaining(["user-1", "seg-1", "cam-1"])
      );
    });

    it("should associate session with evidence case", async () => {
      const mockSession = {
        id: "session-1",
        user_id: "user-1",
        segment_id: "seg-1",
        camera_id: "cam-1",
        evidence_case_id: "case-1",
        created_at: new Date().toISOString(),
        status: "active",
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockSession],
      } as any);

      const result = await engine.createPlaybackSession(
        "user-1",
        "seg-1",
        "cam-1",
        "case-1"
      );

      expect(result.evidence_case_id).toBe("case-1");
    });
  });

  describe("trackPlaybackProgress", () => {
    it("should track playback progress", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ success: true }],
      } as any);

      await engine.trackPlaybackProgress("session-1", 120.5);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE playback_sessions"),
        expect.arrayContaining(["session-1", 120.5])
      );
    });

    it("should update last_activity timestamp", async () => {
      const before = Date.now();
      
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ last_activity: new Date().toISOString() }],
      } as any);

      await engine.trackPlaybackProgress("session-1", 60);

      const after = Date.now();
      const callArgs = vi.mocked(mockPool.query).mock.calls[0];
      
      expect(callArgs[0]).toContain("last_activity");
    });
  });

  describe("endPlaybackSession", () => {
    it("should end playback session", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ id: "session-1", status: "completed" }],
      } as any);

      await engine.endPlaybackSession("session-1");

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE playback_sessions"),
        expect.arrayContaining(["session-1"])
      );
    });

    it("should set ended_at timestamp", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ 
          id: "session-1", 
          status: "completed",
          ended_at: new Date().toISOString(),
        }],
      } as any);

      await engine.endPlaybackSession("session-1");

      const callArgs = vi.mocked(mockPool.query).mock.calls[0];
      expect(callArgs[0]).toContain("ended_at");
      expect(callArgs[0]).toContain("status = 'completed'");
    });
  });

  describe("getActiveSession", () => {
    it("should retrieve active session", async () => {
      const mockSession = {
        id: "session-1",
        user_id: "user-1",
        segment_id: "seg-1",
        status: "active",
        current_position: 45.5,
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockSession],
      } as any);

      const result = await engine.getActiveSession("session-1");

      expect(result).toEqual(mockSession);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE id = $1 AND status = 'active'"),
        ["session-1"]
      );
    });

    it("should return null for non-existent session", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any);

      const result = await engine.getActiveSession("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("createSyncGroup", () => {
    it("should create synchronized playback group", async () => {
      const mockGroup = {
        id: "group-1",
        name: "Multi-camera Investigation",
        master_session_id: "session-1",
        created_at: new Date().toISOString(),
      };

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [mockGroup] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await engine.createSyncGroup(
        "Multi-camera Investigation",
        ["session-1", "session-2", "session-3"],
        "session-1"
      );

      expect(result.id).toBe("group-1");
      expect(result.master_session_id).toBe("session-1");
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it("should add sessions to sync group", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ id: "group-1" }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await engine.createSyncGroup(
        "Test Group",
        ["session-1", "session-2"],
        "session-1"
      );

      const addSessionsCall = vi.mocked(mockPool.query).mock.calls[1];
      expect(addSessionsCall[0]).toContain("INSERT INTO sync_group_sessions");
    });
  });

  describe("syncGroupProgress", () => {
    it("should sync progress across group sessions", async () => {
      const mockSessions = [
        { session_id: "session-1", is_master: true },
        { session_id: "session-2", is_master: false },
        { session_id: "session-3", is_master: false },
      ];

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: mockSessions } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await engine.syncGroupProgress("group-1", 150.5);

      expect(mockPool.query).toHaveBeenCalledTimes(2);
      const updateCall = vi.mocked(mockPool.query).mock.calls[1];
      expect(updateCall[0]).toContain("UPDATE playback_sessions");
      expect(updateCall[0]).toContain("current_position");
    });

    it("should only update non-master sessions", async () => {
      const mockSessions = [
        { session_id: "session-1", is_master: true },
        { session_id: "session-2", is_master: false },
      ];

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: mockSessions } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await engine.syncGroupProgress("group-1", 100);

      const updateCall = vi.mocked(mockPool.query).mock.calls[1];
      expect(updateCall[1]).not.toContain("session-1");
    });
  });

  describe("getPlaybackHistory", () => {
    it("should retrieve user playback history", async () => {
      const mockHistory = [
        {
          id: "session-1",
          segment_id: "seg-1",
          camera_id: "cam-1",
          camera_name: "Front Entrance",
          created_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
          duration_seconds: 1800,
        },
        {
          id: "session-2",
          segment_id: "seg-2",
          camera_id: "cam-2",
          camera_name: "Back Exit",
          created_at: "2024-01-01T11:00:00Z",
          ended_at: "2024-01-01T11:15:00Z",
          duration_seconds: 900,
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockHistory,
      } as any);

      const result = await engine.getPlaybackHistory("user-1", 10);

      expect(result).toHaveLength(2);
      expect(result[0].camera_name).toBe("Front Entrance");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY created_at DESC"),
        expect.arrayContaining(["user-1", 10])
      );
    });

    it("should limit results by count", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any);

      await engine.getPlaybackHistory("user-1", 5);

      const callArgs = vi.mocked(mockPool.query).mock.calls[0];
      expect(callArgs[0]).toContain("LIMIT");
      expect(callArgs[1]).toContain(5);
    });
  });

  describe("getSessionStatistics", () => {
    it("should calculate session statistics", async () => {
      const mockStats = {
        total_sessions: 50,
        total_playback_time: 36000,
        avg_session_duration: 720,
        most_viewed_camera: "cam-1",
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockStats],
      } as any);

      const result = await engine.getSessionStatistics("user-1");

      expect(result.total_sessions).toBe(50);
      expect(result.total_playback_time).toBe(36000);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("COUNT(*)"),
        ["user-1"]
      );
    });
  });

  describe("cleanupInactiveSessions", () => {
    it("should cleanup sessions inactive for specified duration", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ count: 5 }],
      } as any);

      const result = await engine.cleanupInactiveSessions(3600);

      expect(result).toBe(5);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("last_activity < NOW() - INTERVAL"),
        expect.arrayContaining([3600])
      );
    });

    it("should only cleanup active sessions", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ count: 3 }],
      } as any);

      await engine.cleanupInactiveSessions(1800);

      const callArgs = vi.mocked(mockPool.query).mock.calls[0];
      expect(callArgs[0]).toContain("status = 'active'");
    });
  });

  describe("getActiveSessionsByCam era", () => {
    it("should retrieve all active sessions for a camera", async () => {
      const mockSessions = [
        {
          id: "session-1",
          user_id: "user-1",
          camera_id: "cam-1",
          created_at: "2024-01-01T10:00:00Z",
        },
        {
          id: "session-2",
          user_id: "user-2",
          camera_id: "cam-1",
          created_at: "2024-01-01T10:15:00Z",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSessions,
      } as any);

      const result = await engine.getActiveSessionsByCamera("cam-1");

      expect(result).toHaveLength(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("camera_id = $1 AND status = 'active'"),
        ["cam-1"]
      );
    });
  });

  describe("updatePlaybackSpeed", () => {
    it("should update playback speed for session", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ id: "session-1", playback_speed: 2.0 }],
      } as any);

      await engine.updatePlaybackSpeed("session-1", 2.0);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("playback_speed"),
        expect.arrayContaining(["session-1", 2.0])
      );
    });

    it("should validate playback speed range", async () => {
      const invalidSpeeds = [0, -1, 20, 0.1];

      for (const speed of invalidSpeeds) {
        await expect(
          engine.updatePlaybackSpeed("session-1", speed)
        ).rejects.toThrow();
      }
    });
  });

  describe("addBookmark", () => {
    it("should add bookmark to playback session", async () => {
      const mockBookmark = {
        id: "bookmark-1",
        session_id: "session-1",
        timestamp_seconds: 120.5,
        description: "Person entering",
        created_at: new Date().toISOString(),
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockBookmark],
      } as any);

      const result = await engine.addBookmark(
        "session-1",
        120.5,
        "Person entering"
      );

      expect(result.timestamp_seconds).toBe(120.5);
      expect(result.description).toBe("Person entering");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO playback_bookmarks"),
        expect.arrayContaining(["session-1", 120.5, "Person entering"])
      );
    });
  });

  describe("getSessionBookmarks", () => {
    it("should retrieve all bookmarks for a session", async () => {
      const mockBookmarks = [
        {
          id: "bookmark-1",
          timestamp_seconds: 30,
          description: "Event 1",
        },
        {
          id: "bookmark-2",
          timestamp_seconds: 90,
          description: "Event 2",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockBookmarks,
      } as any);

      const result = await engine.getSessionBookmarks("session-1");

      expect(result).toHaveLength(2);
      expect(result[0].timestamp_seconds).toBe(30);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY timestamp_seconds"),
        ["session-1"]
      );
    });
  });
});
