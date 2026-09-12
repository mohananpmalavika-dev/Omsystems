import { describe, expect, it, beforeEach } from "vitest";
import { MemoryStore } from "../../src/store.js";
import { TalkbackRepository } from "../../src/talkback/repositories/talkback.repository.js";
import { TalkbackService, TalkbackServiceError } from "../../src/talkback/services/talkback.service.js";

describe("TalkbackService and TalkbackRepository", () => {
  let store: MemoryStore;
  let repository: TalkbackRepository;
  let service: TalkbackService;

  const mockUser = {
    id: "user-operator-1",
    tenantId: "tenant-om-01",
    role: "operator" as const,
    username: "operator1",
    fullName: "Operator One",
    passwordHash: "hash",
    status: "active" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    store = new MemoryStore();
    repository = new TalkbackRepository(); // uses in-memory mode
    service = new TalkbackService(repository, store as any);
  });

  it("successfully acquires single-talker lease and initiates talk session for supported camera", async () => {
    const result = await service.initiateTalkSession({
      cameraId: "cam-001",
      user: mockUser,
      clientIp: "192.168.1.50",
      userAgent: "Sentinel-Console/1.0",
      ttlMs: 30_000,
    });

    expect(result.session).toBeDefined();
    expect(result.session.camera_id).toBe("cam-001");
    expect(result.session.user_id).toBe("user-operator-1");
    expect(result.session.status).toBe("initiating");
    expect(result.session.adapter).toBe("hikvision-isapi-talkback");
    expect(result.liveSession.token).toBeDefined();

    // Verify lease is active
    const active = await service.getActiveSession("cam-001");
    expect(active.active).toBe(true);
    expect(active.lease?.session_id).toBe(result.session.id);
  });

  it("rejects second concurrent operator with talkback_busy (Single-Talker Mutex)", async () => {
    // First operator starts talking
    await service.initiateTalkSession({
      cameraId: "cam-001",
      user: mockUser,
      ttlMs: 30_000,
    });

    // Second operator tries to talk on same camera
    const secondUser = {
      ...mockUser,
      id: "user-operator-2",
      username: "operator2",
    };

    await expect(
      service.initiateTalkSession({
        cameraId: "cam-001",
        user: secondUser,
        ttlMs: 30_000,
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "talkback_busy",
        statusCode: 409,
      })
    );
  });

  it("rejects camera with no audio/talkback capability with talkback_not_supported", async () => {
    await expect(
      service.initiateTalkSession({
        cameraId: "cam-002", // video-only camera added to seedCameras
        user: mockUser,
        ttlMs: 30_000,
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "talkback_not_supported",
        statusCode: 409,
      })
    );
  });

  it("renews lease on heartbeat and releases cleanly on end", async () => {
    const started = await service.initiateTalkSession({
      cameraId: "cam-001",
      user: mockUser,
      ttlMs: 15_000,
    });

    // Heartbeat
    const renewed = await service.heartbeatSession("cam-001", started.session.id, 30_000);
    expect(renewed).toBe(true);

    // End talk session
    const ended = await service.endTalkSession("cam-001", started.session.id, mockUser);
    expect(ended).toBeDefined();
    expect(ended?.status).toBe("terminated");

    // Camera lease should now be free
    const active = await service.getActiveSession("cam-001");
    expect(active.active).toBe(false);
  });

  it("allows supervisor emergency termination", async () => {
    const started = await service.initiateTalkSession({
      cameraId: "cam-001",
      user: mockUser,
      ttlMs: 30_000,
    });

    const terminated = await service.terminateSession({
      sessionId: started.session.id,
      terminatedByUserId: "user-supervisor-99",
      reason: "Urgent channel override",
    });

    expect(terminated).toBeDefined();
    expect(terminated?.status).toBe("terminated");
    expect(terminated?.error_message).toBe("Urgent channel override");

    const active = await service.getActiveSession("cam-001");
    expect(active.active).toBe(false);
  });

  it("tracks telemetry metrics and historical sessions", async () => {
    const started = await service.initiateTalkSession({
      cameraId: "cam-001",
      user: mockUser,
      ttlMs: 30_000,
    });

    await service.handleEdgeCompletion(started.session.id, {
      cameraId: "cam-001",
      userId: mockUser.id,
      agentId: "agent-1",
      sessionId: started.session.id,
      outcome: "success",
      durationMs: 4500,
      bytesSent: 36000,
      packetsSent: 45,
      adapter: "onvif-rtsp-backchannel",
      codec: "PCMA",
    });

    const history = await service.listHistory({
      tenantId: mockUser.tenantId,
      cameraId: "cam-001",
    });
    expect(history.total).toBe(1);
    expect(history.sessions[0]?.bytes_sent).toBe(36000);
    expect(history.sessions[0]?.status).toBe("completed");

    const stats = await service.getTelemetryStats(mockUser.tenantId);
    expect(stats.totalSessions).toBe(1);
    expect(stats.completedSessions).toBe(1);
    expect(stats.totalDurationMs).toBe(4500);
    expect(stats.totalBytesSent).toBe(36000);
  });

  it("probes camera talkback capability correctly", async () => {
    const capability = await service.getDeviceCapability("cam-001");
    expect(capability.supported).toBe(true);
    expect(capability.codecs).toContain("PCMA");
    expect(capability.sample_rates).toContain(8000);

    const videoOnlyCap = await service.getDeviceCapability("cam-002");
    expect(videoOnlyCap.supported).toBe(false);
  });
});
