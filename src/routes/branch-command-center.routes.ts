import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { BranchOperationalSnapshotService } from "../services/branch-operational-snapshot.production.service.js";

const branchIdParamSchema = z.object({ branchId: z.string().min(1) });
const camerasQuerySchema = z.object({
  filter: z.enum(["all", "online", "offline", "recording", "not-recording", "no-record", "no_record", "problem", "retention-violation", "stream-loss", "live"]).optional(),
  sortBy: z.enum(["number", "health", "name"]).optional().default("number"),
});
const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  severity: z.enum(["INFO", "WARNING", "HIGH", "CRITICAL"]).optional(),
  type: z.string().optional(),
});

export async function registerBranchCommandCenterRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  const snapshots = new BranchOperationalSnapshotService(store);

  async function authorizeBranch(request: FastifyRequest, reply: FastifyReply, branchId: string) {
    const currentUser = request.currentUser;
    if (!currentUser) {
      reply.code(401).send({ success: false, error: "Authentication required" });
      return null;
    }
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch" || branch.tenantId !== currentUser.tenantId) {
      reply.code(404).send({ success: false, error: "Branch not found or access denied" });
      return null;
    }
    const decision = await store.checkAccess(currentUser, "recording:view", branchId);
    if (!decision?.allowed) {
      reply.code(403).send({ success: false, error: "Access denied" });
      return null;
    }
    return { branch, tenantId: currentUser.tenantId, user: currentUser };
  }

  const operationalState = async (request: FastifyRequest, reply: FastifyReply) => {
    const { branchId } = branchIdParamSchema.parse(request.params);
    const auth = await authorizeBranch(request, reply, branchId);
    if (!auth) return;
    const snapshot = await snapshots.getBranchSnapshot(auth.tenantId, branchId, false, auth.user);
    if (!snapshot) return reply.code(404).send({ success: false, error: "Branch not found" });
    const capacity = snapshot.storage.capacity;
    return reply.send({
      branchId: snapshot.branchId,
      branchCode: snapshot.branchCode,
      branchName: snapshot.branchName,
      overallStatus: snapshot.overallState,
      internet: {
        status: snapshot.network.state,
        latencyMs: snapshot.network.primaryWan.latencyMs,
        packetLossPercent: snapshot.network.primaryWan.packetLossPct,
        activeWan: snapshot.network.state === "FAILOVER" ? "secondary" : snapshot.network.state === "UNKNOWN" ? undefined : "primary",
        lastSeenAt: snapshot.network.observedAt || undefined,
      },
      gateway: {
        status: snapshot.network.edgeAgent ? (snapshot.network.edgeAgent.connected ? "ONLINE" : "OFFLINE") : "UNKNOWN",
        lastHeartbeatAt: snapshot.network.edgeAgent?.lastHeartbeat,
        version: snapshot.network.edgeAgent?.version,
      },
      recorder: {
        total: snapshot.recorders.total,
        online: snapshot.recorders.online,
        offline: snapshot.recorders.offline,
        status: snapshot.recorders.state === "HEALTHY" ? "ONLINE" : snapshot.recorders.state === "WARNING" ? "WARNING" : snapshot.recorders.state === "CRITICAL" ? "OFFLINE" : "UNKNOWN",
      },
      cameras: {
        total: snapshot.cameras.total,
        online: snapshot.cameras.online,
        offline: snapshot.cameras.offline,
        recording: snapshot.cameras.recording,
        notRecording: snapshot.cameras.notRecording,
        unknown: (snapshot.cameraList ?? []).filter((camera) => camera.state === "UNKNOWN").length,
      },
      storage: {
        status: snapshot.storage.state,
        totalBytes: capacity ? capacity.totalGB * 1024 ** 3 : undefined,
        freeBytes: capacity ? capacity.availableGB * 1024 ** 3 : undefined,
        disksHealthy: snapshot.storage.disks.healthy,
        disksWarning: snapshot.storage.disks.warning,
        disksFailed: snapshot.storage.disks.failed,
      },
      retention: {
        requiredDays: snapshot.retention.requiredDays,
        actualDays: snapshot.retention.minimumVerifiedDays,
        status: snapshot.retention.state,
      },
      lastHealthPollAt: snapshot.lastTelemetryAt ?? snapshot.computedAt,
    });
  };
  app.get("/v1/branches/:branchId/operational-state", operationalState);
  app.get("/api/v1/branches/:branchId/operational-state", operationalState);

  const cameraHealthSummary = async (request: FastifyRequest, reply: FastifyReply) => {
    const { branchId } = branchIdParamSchema.parse(request.params);
    const auth = await authorizeBranch(request, reply, branchId);
    if (!auth) return;
    const snapshot = await snapshots.getBranchSnapshot(auth.tenantId, branchId, false, auth.user);
    if (!snapshot) return reply.code(404).send({ success: false, error: "Branch not found" });
    return reply.send({
      branchId,
      observedAt: snapshot.lastTelemetryAt,
      totalCameras: snapshot.cameras.total,
      healthyCameras: snapshot.cameras.healthyCount,
      degradedCameras: snapshot.cameras.warningCount,
      criticalCameras: snapshot.cameras.criticalCount,
      unknownCameras: (snapshot.cameraList ?? []).filter((camera) => camera.state === "UNKNOWN").length,
      streamingCoverage: { active: (snapshot.cameraList ?? []).filter((camera) => camera.streamAvailable).length, total: snapshot.cameras.total },
      recordingCoverage: { active: snapshot.cameras.recording, total: snapshot.cameras.total },
      cameras: snapshot.cameraList ?? [],
    });
  };
  app.get("/v1/branches/:branchId/cameras/health", cameraHealthSummary);
  app.get("/api/v1/branches/:branchId/cameras/health", cameraHealthSummary);

  const singleCameraHealth = async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string().min(1) }).parse(request.params);
    const camera = await store.getCamera(cameraId);
    if (!camera) return reply.code(404).send({ success: false, error: "Camera not found" });
    const auth = await authorizeBranch(request, reply, camera.branchId);
    if (!auth) return;
    const snapshot = await snapshots.getBranchSnapshot(auth.tenantId, camera.branchId, false, auth.user);
    const health = snapshot?.cameraList?.find((item) => item.id === cameraId);
    if (!health) return reply.code(404).send({ success: false, error: "Camera health telemetry not found" });
    return reply.send(health);
  };
  app.get("/v1/cameras/:cameraId/health", singleCameraHealth);
  app.get("/api/v1/cameras/:cameraId/health", singleCameraHealth);

  const canonicalCameras = async (request: FastifyRequest, reply: FastifyReply) => {
    const { branchId } = branchIdParamSchema.parse(request.params);
    const auth = await authorizeBranch(request, reply, branchId);
    if (!auth) return;
    const snapshot = await snapshots.getBranchSnapshot(auth.tenantId, branchId, false, auth.user);
    if (!snapshot) return reply.code(404).send({ success: false, error: "Branch not found" });
    return reply.send((snapshot.cameraList ?? []).map((camera) => ({
      cameraId: camera.id,
      name: camera.name,
      channelNumber: Number(camera.channelNumber.replace(/\D/g, "")) || 0,
      health: {
        connectivity: camera.onlineStatus === "online" ? "ONLINE" : camera.onlineStatus === "offline" ? "OFFLINE" : "UNKNOWN",
        recording: camera.recordingStatus === "recording" ? "RECORDING" : camera.recordingStatus === "unknown" ? "UNKNOWN" : "NOT_RECORDING",
        stream: camera.state === "UNKNOWN" ? "UNKNOWN" : camera.streamAvailable ? "AVAILABLE" : "UNAVAILABLE",
        videoLoss: camera.state === "UNKNOWN" ? "UNKNOWN" : camera.videoLoss ? "DETECTED" : "NORMAL",
        tamper: camera.state === "UNKNOWN" ? "UNKNOWN" : camera.tamperingDetected ? "DETECTED" : "NORMAL",
      },
      lastSeenAt: camera.lastHeartbeat,
      ptzSupported: camera.ptzSupported,
      retentionDays: camera.retentionDays,
    })));
  };
  app.get("/api/v1/branches/:branchId/cameras", canonicalCameras);

  app.get("/v1/branches/:branchId/operational-snapshot", async (request, reply) => {
    const { branchId } = branchIdParamSchema.parse(request.params);
    const auth = await authorizeBranch(request, reply, branchId);
    if (!auth) return;
    const snapshot = await snapshots.getBranchSnapshot(auth.tenantId, branchId, false, auth.user);
    if (!snapshot) return reply.code(404).send({ success: false, error: "Branch not found" });
    return reply.send({ success: true, data: snapshot });
  });

  app.get("/v1/branches/:branchId/command-center/cameras", async (request, reply) => {
    const { branchId } = branchIdParamSchema.parse(request.params);
    const query = camerasQuerySchema.parse(request.query);
    const auth = await authorizeBranch(request, reply, branchId);
    if (!auth) return;
    const snapshot = await snapshots.getBranchSnapshot(auth.tenantId, branchId, false, auth.user);
    if (!snapshot) return reply.code(404).send({ success: false, error: "Branch not found" });
    let cameras = [...(snapshot.cameraList ?? [])];
    const filter = query.filter;
    if (filter === "online" || filter === "live") cameras = cameras.filter((camera) => camera.onlineStatus === "online");
    if (filter === "offline") cameras = cameras.filter((camera) => camera.onlineStatus === "offline");
    if (filter === "recording") cameras = cameras.filter((camera) => camera.recordingStatus === "recording");
    if (["not-recording", "no-record", "no_record"].includes(filter ?? "")) cameras = cameras.filter((camera) => camera.recordingStatus === "stopped" || camera.recordingStatus === "error");
    if (filter === "problem") cameras = cameras.filter((camera) => !["LIVE", "ONLINE"].includes(camera.state));
    if (filter === "retention-violation") cameras = cameras.filter((camera) => camera.retentionState === "VIOLATION");
    if (filter === "stream-loss") cameras = cameras.filter((camera) => camera.state === "STREAM_LOSS");
    if (query.sortBy === "health") cameras.sort((a, b) => a.healthScore - b.healthScore);
    if (query.sortBy === "name") cameras.sort((a, b) => a.name.localeCompare(b.name));
    return reply.send({ success: true, data: { cameras, total: cameras.length, summary: snapshot.cameras } });
  });

  app.get("/v1/branches/:branchId/command-center/events", async (request, reply) => {
    const { branchId } = branchIdParamSchema.parse(request.params);
    const query = eventsQuerySchema.parse(request.query);
    const auth = await authorizeBranch(request, reply, branchId);
    if (!auth) return;
    const result = await snapshots.getBranchEvents(branchId, query, auth.user);
    return reply.send({ success: true, data: { ...result, limit: query.limit, offset: query.offset } });
  });

  const snapshotSection = (section: "recorders" | "storage" | "retention" | "network" | "alerts") =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { branchId } = branchIdParamSchema.parse(request.params);
      const auth = await authorizeBranch(request, reply, branchId);
      if (!auth) return;
      const snapshot = await snapshots.getBranchSnapshot(auth.tenantId, branchId, false, auth.user);
      if (!snapshot) return reply.code(404).send({ success: false, error: "Branch not found" });
      return reply.send({ success: true, data: snapshot[section] });
    };
  app.get("/v1/branches/:branchId/recorders", snapshotSection("recorders"));
  app.get("/v1/branches/:branchId/storage", snapshotSection("storage"));
  app.get("/v1/branches/:branchId/retention", snapshotSection("retention"));
  app.get("/v1/branches/:branchId/network-health", snapshotSection("network"));
  app.get("/v1/branches/:branchId/alerts", snapshotSection("alerts"));

  app.post("/v1/branches/:branchId/refresh", async (request, reply) => {
    const { branchId } = branchIdParamSchema.parse(request.params);
    const auth = await authorizeBranch(request, reply, branchId);
    if (!auth) return;
    const snapshot = await snapshots.getBranchSnapshot(auth.tenantId, branchId, true, auth.user);
    return reply.send({ success: true, data: snapshot, message: "Branch snapshot recomputed from current telemetry" });
  });
}
