import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("control-plane API", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildApp({ store });
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires a development identity", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/branches" });
    expect(response.statusCode).toBe(401);
  });

  it("keeps user authentication separate from the edge bridge identity", async () => {
    const bridgeKey = "b".repeat(43);
    const bridgedApp = await buildApp({ edgeBridgeSharedKey: bridgeKey });
    try {
      const userRequest = await bridgedApp.inject({
        method: "GET",
        url: "/v1/branches",
        headers: { "x-user-id": "user-global-admin" },
      });
      expect(userRequest.statusCode).toBe(200);

      const bridgeCannotActAsUser = await bridgedApp.inject({
        method: "GET",
        url: "/v1/branches",
        headers: { "x-edge-bridge-key": bridgeKey },
      });
      expect(bridgeCannotActAsUser.statusCode).toBe(401);
    } finally {
      await bridgedApp.close();
    }
  });

  it("accepts only the valid edge bridge key on production agent ingress routes", async () => {
    const bridgeKey = "e".repeat(43);
    const agent = await store.registerEdgeAgent("A005", "Production edge", "0.1.0");
    store.cameras.get("cam-001")!.edgeAgentId = agent.id;
    const productionApp = await buildApp({
      store,
      authMode: "session",
      edgeBridgeSharedKey: bridgeKey,
    });
    try {
      const heartbeat = await productionApp.inject({
        method: "POST",
        url: `/v1/edge-agents/${agent.id}/heartbeat`,
        headers: { "x-edge-bridge-key": bridgeKey },
        payload: { version: "0.1.0" },
      });
      expect(heartbeat.statusCode).toBe(200);

      const discovery = await productionApp.inject({
        method: "POST",
        url: "/v1/branches/A005/cameras/discovered",
        headers: { "x-edge-bridge-key": bridgeKey },
        payload: {
          edgeAgentId: agent.id,
          vendor: "hikvision",
          model: "DS-2CD-Test",
          ipAddress: "192.168.50.20",
          onvifPort: 80,
          rtspPort: 554,
          profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
          capabilities: { ptz: false, audio: false, events: true },
        },
      });
      expect(discovery.statusCode).toBe(202);
      expect(store.auditEvents.at(-1)?.actorUserId).toBeNull();

      const liveSession = await store.createLiveSession("cam-001", "user-global-admin");
      const consumedSession = await productionApp.inject({
        method: "POST",
        url: `/v1/edge-agents/${agent.id}/live-sessions/consume`,
        headers: { "x-edge-bridge-key": bridgeKey },
        payload: { token: liveSession.token },
      });
      expect(consumedSession.statusCode).toBe(200);
      expect(consumedSession.json()).toMatchObject({
        cameraId: "cam-001",
        connectionSecretRef: "secret://cam-001",
      });

      const invalidKey = await productionApp.inject({
        method: "POST",
        url: `/v1/edge-agents/${agent.id}/heartbeat`,
        headers: { "x-edge-bridge-key": "x".repeat(43) },
        payload: { version: "0.1.0" },
      });
      expect(invalidKey.statusCode).toBe(401);
      expect(invalidKey.json().error).toBe("invalid_bridge_identity");

      const missingKey = await productionApp.inject({
        method: "POST",
        url: `/v1/edge-agents/${agent.id}/heartbeat`,
        payload: { version: "0.1.0" },
      });
      expect(missingKey.statusCode).toBe(401);

      const bridgeDoesNotOverrideBadUserSession = await productionApp.inject({
        method: "POST",
        url: `/v1/edge-agents/${agent.id}/heartbeat`,
        headers: {
          authorization: "Bearer invalid-employee-session",
          "x-edge-bridge-key": bridgeKey,
        },
        payload: { version: "0.1.0" },
      });
      expect(bridgeDoesNotOverrideBadUserSession.statusCode).toBe(401);

      const bridgeCannotReadDashboard = await productionApp.inject({
        method: "GET",
        url: "/v1/branches",
        headers: { "x-edge-bridge-key": bridgeKey },
      });
      expect(bridgeCannotReadDashboard.statusCode).toBe(401);
    } finally {
      await productionApp.close();
    }
  });

  it("filters cameras according to camera-group restrictions", async () => {
    store.cameras.set("cam-denied", {
      ...structuredClone(store.cameras.get("cam-001")!),
      id: "cam-denied",
      deviceIdentityId: "device-denied",
      nodeId: "camera-cash-room",
      name: "Denied cash-room camera",
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/branches/A005/cameras",
      headers: { "x-user-id": "user-branch-manager" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((camera: { id: string }) => camera.id)).toContain("cam-001");
    expect(response.json().data.map((camera: { id: string }) => camera.id)).not.toContain("cam-denied");
    expect(response.body).not.toContain("connectionSecretRef");
  });

  it("lists only branches the employee may configure", async () => {
    const allowed = await app.inject({
      method: "GET",
      url: "/v1/branches?action=device%3Aconfigure",
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().data).toHaveLength(10);

    const denied = await app.inject({
      method: "GET",
      url: "/v1/branches?action=device%3Aconfigure",
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(denied.statusCode).toBe(200);
    expect(denied.json().data).toHaveLength(0);
  });

  it("returns an operations summary for report dashboards", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/reports/summary/operations",
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json).toHaveProperty("branchCount");
    expect(json).toHaveProperty("cameraCount");
    expect(json).toHaveProperty("branchSummaries");
    expect(Array.isArray(json.branchSummaries)).toBe(true);
  });

  it.skip("returns a capacity assessment based on actual deployment", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/capacity/assessment",
      headers: { "x-user-id": "user-global-admin" },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.capability).toBe("Support approximately 400 branches / 5,000 cameras");
    expect(json.status).toBe("Evidence harness available; production certification pending");
    expect(json.verifiedCompletion).toBe(65);
    expect(json.metrics).toMatchObject({ branches: 400, cameras: 5000 });
    expect(json.evidence.loadTestCompleted).toBe(false);
    expect(json.evidence.contractAccurateHarnessAvailable).toBe(true);
    expect(json.evidence.measuredMetricsOnly).toBe(true);
    expect(json.evidence.productionBenchmarkCompleted).toBe(false);
  });

  it("returns dashboard storage health metrics for control-room cards", async () => {
    await store.upsertRecordingStorageNode({
      tenantId: "omsystems",
      externalId: "disk-001",
      name: "Record-01",
      supportedTiers: ["hot", "warm", "cold"],
      capacityBytes: 8_000_000_000,
      usedBytes: 3_000_000_000,
      availableBytes: 5_000_000_000,
      status: "warning",
      smart: {
        overallStatus: "failed",
        reallocatedSectors: 3,
        pendingSectors: 0,
        uncorrectableSectors: 0,
        readErrors: 2,
        writeErrors: 0,
        interfaceCrcErrors: 0,
      },
      raid: {
        status: "degraded",
        level: "RAID1",
        memberDisks: ["sda", "sdb"],
        failedMembers: ["sdb"],
      },
      lastWriteProbe: {
        status: "failed",
        latencyMs: 24,
        bytesWritten: 128,
        checksum: "abc123",
        error: "write probe failed",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/dashboard/stats",
      headers: { "x-user-id": "user-global-admin" },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.storageNodes).toHaveLength(1);
    expect(json.storageSummary).toMatchObject({
      warningCount: 1,
      smartIssueCount: 1,
      raidIssueCount: 1,
      writeProbeFailureCount: 1,
    });
    expect(json.storageNodes[0]).toMatchObject({
      externalId: "disk-001",
      smart: { overallStatus: "failed" },
      raid: { status: "degraded" },
      lastWriteProbe: { status: "failed" },
    });
  });

  it("returns a privacy summary for report dashboards", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/reports/summary/privacy",
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json).toHaveProperty("activePurposes");
    expect(json).toHaveProperty("assignedPurposes");
    expect(json).toHaveProperty("openBreaches");
  });

  it("returns an incident summary for report dashboards", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/reports/summary/incidents",
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json).toHaveProperty("incidentCount");
    expect(json).toHaveProperty("openIncidentCount");
    expect(json).toHaveProperty("recentIncidents");
    expect(Array.isArray(json.recentIncidents)).toBe(true);
  });

  it("supports edge registration, discovery, approval and live sessions", async () => {
    const headers = { "x-user-id": "user-global-admin" };
    const agentResponse = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/edge-agents/register",
      headers,
      payload: { name: "BLR-001 Edge", version: "0.1.0" },
    });
    expect(agentResponse.statusCode).toBe(201);
    const agent = agentResponse.json();

    const agentList = await app.inject({
      method: "GET",
      url: "/v1/branches/branch-blr-001/edge-agents",
      headers,
    });
    expect(agentList.statusCode).toBe(200);
    expect(agentList.json().data).toEqual([agent]);

    const deniedAgentList = await app.inject({
      method: "GET",
      url: "/v1/branches/branch-blr-001/edge-agents",
      headers: { "x-user-id": "user-south-operator" },
    });
    expect(deniedAgentList.statusCode).toBe(403);

    const heartbeat = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${agent.id}/heartbeat`,
      headers,
      payload: { version: "0.1.0" },
    });
    expect(heartbeat.statusCode).toBe(200);
    expect(heartbeat.json().status).toBe("online");

    const requestedScan = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/scan-jobs",
      headers,
      payload: { edgeAgentId: agent.id },
    });
    expect(requestedScan.statusCode).toBe(202);
    const scan = requestedScan.json();
    expect(scan.status).toBe("queued");

    const claimedScan = await app.inject({
      method: "GET",
      url: `/v1/edge-agents/${agent.id}/scan-jobs/next`,
      headers: { ...headers, "x-edge-agent-version": "0.1.0" },
    });
    expect(claimedScan.statusCode).toBe(200);
    expect(claimedScan.json().id).toBe(scan.id);
    expect(claimedScan.json().status).toBe("running");

    const completedScan = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${agent.id}/scan-jobs/${scan.id}/complete`,
      headers,
      payload: { status: "completed", resultCount: 1 },
    });
    expect(completedScan.statusCode).toBe(200);
    expect(completedScan.json().status).toBe("completed");

    const discoveryResponse = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers,
      payload: {
        edgeAgentId: agent.id,
        vendor: "hikvision",
        model: "DS-2CD-Test",
        ipAddress: "192.168.10.20",
        onvifPort: 80,
        rtspPort: 554,
        profiles: [
          { name: "main", codec: "H264", width: 1920, height: 1080 },
        ],
        capabilities: { ptz: false, audio: true, events: true },
      },
    });
    expect(discoveryResponse.statusCode).toBe(202);
    const discovery = discoveryResponse.json();

    const approvalResponse = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras",
      headers,
      payload: {
        discoveryId: discovery.id,
        name: "Pilot Entrance",
        channel: 3,
        protocol: "onvif-t",
        connectionSecretRef: "vault://pilot/camera-003",
      },
    });
    expect(approvalResponse.statusCode).toBe(201);
    expect(approvalResponse.body).not.toContain("connectionSecretRef");
    const camera = approvalResponse.json();

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/v1/cameras/${camera.id}/live-sessions`,
      headers,
    });
    expect(sessionResponse.statusCode).toBe(201);
    expect(sessionResponse.json().token).toHaveLength(43);
  });

  it("publishes the complete AI catalog and answers private operations queries", async () => {
    const headers = { "x-user-id": "user-global-admin" };
    const catalog = await app.inject({ method: "GET", url: "/v1/analytics/capabilities", headers });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().summary.domains).toBe(16);
    expect(catalog.json().summary.capabilities).toBeGreaterThan(100);
    expect(catalog.json().domains.map((domain: any) => domain.id)).toEqual(
      expect.arrayContaining(["human", "vehicle", "face", "banking", "search", "assistant"]),
    );

    const assistant = await app.inject({
      method: "POST", url: "/v1/analytics/assistant/query", headers,
      payload: { query: "Show cameras not recording" },
    });
    expect(assistant.statusCode).toBe(200);
    expect(assistant.json()).toMatchObject({ intent: "cameras-not-recording" });
    expect(Array.isArray(assistant.json().data)).toBe(true);
  });

  it("auto-provisions every eligible discovery with recording, AI and alerts", async () => {
    const headers = { "x-user-id": "user-global-admin" };
    const agent = (await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/edge-agents/register",
      headers,
      payload: { name: "BLR Auto Edge", version: "0.1.0" },
    })).json();
    const discover = (ipAddress: string, extra: Record<string, unknown> = {}) =>
      app.inject({
        method: "POST",
        url: "/v1/branches/branch-blr-001/cameras/discovered",
        headers,
        payload: {
          edgeAgentId: agent.id,
          discoveryMethod: "onvif-ws-discovery",
          vendor: "hikvision",
          manufacturer: "Hikvision",
          model: "DS-2CD-Auto",
          ipAddress,
          onvifPort: 80,
          rtspPort: 554,
          streamVerified: true,
          rtspValidated: true,
          credentialsRequired: false,
          compatibilityStatus: "compatible",
          duplicateStatus: "unique",
          profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
          capabilities: { ptz: false, audio: true, events: true },
          ...extra,
        },
      });
    expect((await discover("192.168.10.30")).statusCode).toBe(202);
    expect((await discover("192.168.10.31", {
      streamVerified: false,
      credentialsRequired: true,
    })).statusCode).toBe(202);

    const provision = await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered/approve-all",
      headers,
      payload: {},
    });
    expect(provision.statusCode).toBe(201);
    expect(provision.json().summary).toEqual({
      total: 2,
      provisioned: 1,
      partial: 0,
      needsAttention: 1,
      failed: 0,
    });
    const provisioned = provision.json().results.find(
      (result: any) => result.status === "provisioned",
    );
    expect(provisioned.stages).toMatchObject({
      approved: true,
      recording: "configured",
      analytics: "active",
      alerts: "enabled",
    });
    expect(await store.getRecordingJob(provisioned.cameraId)).toMatchObject({
      enabled: true,
      mode: "continuous",
      retentionDays: 180,
    });
    const rules = await store.listAnalyticsRules(provisioned.cameraId);
    expect(rules.length).toBeGreaterThanOrEqual(10);
    expect(rules.every((rule) => rule.enabled)).toBe(true);
  });

  it("activates verified scan results and leaves rejected credentials for the operator", async () => {
    const headers = { "x-user-id": "user-global-admin" };
    const agent = (await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/edge-agents/register",
      headers,
      payload: { name: "Zero-touch edge", version: "0.1.0" },
    })).json();
    await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${agent.id}/heartbeat`,
      headers,
      payload: { version: "0.1.0" },
    });
    const scan = (await app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/scan-jobs",
      headers,
      payload: { edgeAgentId: agent.id },
    })).json();
    await app.inject({
      method: "GET",
      url: `/v1/edge-agents/${agent.id}/scan-jobs/next`,
      headers,
    });

    const discover = (ipAddress: string, credentialsRequired: boolean) => app.inject({
      method: "POST",
      url: "/v1/branches/branch-blr-001/cameras/discovered",
      headers,
      payload: {
        edgeAgentId: agent.id,
        discoveryMethod: "rtsp-network-scan",
        vendor: "other",
        manufacturer: "Camera vendor",
        model: "Network camera",
        ipAddress,
        onvifSupport: false,
        onvifPort: 80,
        rtspPort: 554,
        streamVerified: !credentialsRequired,
        rtspValidated: !credentialsRequired,
        credentialsRequired,
        compatibility: "compatible",
        compatibilityStatus: "compatible",
        duplicateStatus: "unique",
        profiles: [{ name: "main", codec: "H264", width: 1920, height: 1080 }],
        capabilities: { ptz: false, audio: false, events: false },
      },
    });
    expect((await discover("192.168.60.20", false)).statusCode).toBe(202);
    expect((await discover("192.168.60.21", true)).statusCode).toBe(202);

    const completed = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${agent.id}/scan-jobs/${scan.id}/complete`,
      headers,
      payload: { status: "completed", resultCount: 2 },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({
      status: "completed",
      resultCount: 2,
      provisionedCount: 1,
      credentialsRequiredCount: 1,
      pendingVerificationCount: 0,
    });

    const activated = [...store.cameras.values()].find((camera) => camera.ipAddress === "192.168.60.20");
    expect(activated).toMatchObject({ protocol: "rtsp", status: "unknown" });
    expect(await store.getRecordingJob(activated!.id)).toMatchObject({
      enabled: true,
      mode: "continuous",
    });
    const pending = await store.listDiscoveredCameras("branch-blr-001");
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ ipAddress: "192.168.60.21", credentialsRequired: true });

    const cameraCount = store.cameras.size;
    const repeated = await app.inject({
      method: "POST",
      url: `/v1/edge-agents/${agent.id}/scan-jobs/${scan.id}/complete`,
      headers,
      payload: { status: "completed", resultCount: 2 },
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().provisionedCount).toBe(1);
    expect(store.cameras.size).toBe(cameraCount);
  });

  it("creates bookmarks and protects incident recording windows", async () => {
    const headers = { "x-user-id": "user-global-admin" };
    const bookmarkResponse = await app.inject({
      method: "POST",
      url: "/v1/cameras/cam-001/bookmarks",
      headers,
      payload: {
        bookmarkedAt: "2026-07-21T10:00:00.000Z",
        reason: "unauthorized-entry",
        notes: "Person entered through the restricted door",
        priority: "high",
      },
    });
    expect(bookmarkResponse.statusCode).toBe(201);
    expect(bookmarkResponse.json()).toMatchObject({
      cameraId: "cam-001",
      reason: "unauthorized-entry",
      priority: "high",
    });

    const incidentResponse = await app.inject({
      method: "POST",
      url: "/v1/cameras/cam-001/incidents",
      headers,
      payload: {
        occurredAt: "2026-07-21T10:05:00.000Z",
        title: "Restricted entrance opened",
        notes: "Operator observed an unknown person",
        priority: "P1",
        preRollSeconds: 60,
        postRollSeconds: 300,
      },
    });
    expect(incidentResponse.statusCode).toBe(201);
    expect(incidentResponse.json()).toMatchObject({
      cameraId: "cam-001",
      priority: "P1",
      status: "new",
      recordingFrom: "2026-07-21T10:04:00.000Z",
      recordingTo: "2026-07-21T10:10:00.000Z",
    });
    const incident = incidentResponse.json();
    expect(store.recordingLegalHolds).toContainEqual(expect.objectContaining({
      id: incident.legalHoldId,
      cameraId: "cam-001",
      fromAt: incident.recordingFrom,
      toAt: incident.recordingTo,
    }));
    expect(store.liveBookmarks).toContainEqual(expect.objectContaining({
      id: incident.bookmarkId,
      incidentId: incident.id,
      priority: "critical",
    }));
    expect(store.auditEvents.map((event) => event.action)).toEqual(
      expect.arrayContaining(["live.bookmark_created", "live.incident_created"]),
    );

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/cameras/cam-001/incidents",
      headers,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data).toHaveLength(1);

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/v1/cameras/cam-001/incidents/${incident.id}`,
      headers,
      payload: { status: "investigating" },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().status).toBe("investigating");
  });

  it("denies incident creation without alarm acknowledgement permission", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/cameras/cam-001/incidents",
      headers: { "x-user-id": "user-branch-manager" },
      payload: {
        title: "Test incident",
        priority: "P3",
        preRollSeconds: 60,
        postRollSeconds: 300,
      },
    });
    expect(response.statusCode).toBe(403);
    expect(store.liveIncidents).toHaveLength(0);
  });
});
