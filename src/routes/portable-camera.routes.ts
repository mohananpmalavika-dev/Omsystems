import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { PortableCameraRepository } from "../portable-camera/portable-camera-repository.js";
import type { PortableCameraLeaseManager } from "../ha/services/portable-camera-lease-manager.service.js";
import { immutableAuditService } from "../security/audit/immutable-audit.service.js";
import type { VideoSourceType } from "../domain/models.js";

export interface PortableCameraRouteOptions {
  store: ControlPlaneStore;
  repository: PortableCameraRepository;
  leaseManager: PortableCameraLeaseManager;
  mediaGatewayUrl?: string;
  mediaGatewaySharedKey?: string;
  recordingEngineUrl?: string;
  recordingEngineSharedKey?: string;
  publicDashboardUrl?: string;
  mediaNodeId?: string;
}

export function registerPortableCameraRoutes(
  app: FastifyInstance,
  options: PortableCameraRouteOptions
) {
  const {
    store,
    repository,
    leaseManager,
    mediaGatewayUrl = process.env.MEDIA_GATEWAY_INTERNAL_URL || "http://127.0.0.1:8090",
    publicDashboardUrl = process.env.PUBLIC_DASHBOARD_URL || "http://127.0.0.1:10000",
    mediaNodeId = process.env.MEDIA_NODE_ID || "media-node-aws-01",
  } = options;

  function getUser(request: FastifyRequest) {
    const user = (request as any).currentUser;
    const headerTenant = request.headers["x-tenant-id"] as string | undefined;
    const tenantId = user?.tenantId || headerTenant || "default-tenant";
    const userId = user?.id || user?.userId || "system-operator";
    const roles = user?.roles || ["operator"];
    return { tenantId, userId, roles, user };
  }

  // 1. Generate Enrollment QR / Token
  app.post("/api/portable-camera/enrollments", async (request, reply) => {
    const { tenantId, userId, roles } = getUser(request);
    const body = z.object({
      branchId: z.string().optional(),
      allowedSourceTypes: z.array(z.string()).optional(),
      requestedPermissions: z.array(z.string()).optional(),
      expiresInSeconds: z.number().int().min(60).max(86400).default(900),
    }).parse(request.body || {});

    const policy = await repository.getPolicy(tenantId);
    if (!policy.enabled) {
      return reply.code(403).send({ error: "portable_camera_disabled_by_policy" });
    }

    const enrollment = await repository.createEnrollment({
      tenantId,
      branchId: body.branchId,
      createdBy: userId,
      allowedSourceTypes: body.allowedSourceTypes as VideoSourceType[] | undefined,
      requestedPermissions: body.requestedPermissions,
      expiresInSeconds: body.expiresInSeconds,
    });

    const host = (request.headers["x-forwarded-host"] as string) || (request.headers["host"] as string);
    const proto = (request.headers["x-forwarded-proto"] as string) || "https";
    const baseUrl = host ? `${proto}://${host}` : publicDashboardUrl.replace(/\/+$/, "");
    const enrollmentUrl = `${baseUrl}/portable-camera/enroll?token=${enrollment.token}`;

    immutableAuditService.append({
      category: "PORTABLE_CAMERA_EVENT",
      tenantId,
      actorUserId: userId,
      actorRoles: roles,
      action: "PORTABLE_DEVICE_ENROLLMENT_CREATED",
      outcome: "SUCCESS",
      targetResourceType: "portable_camera_enrollment",
      targetResourceId: enrollment.id,
      branchId: body.branchId,
      metadata: {
        token: enrollment.token,
        expiresAt: enrollment.expiresAt,
        allowedSourceTypes: enrollment.allowedSourceTypes,
      },
      timestamp: new Date().toISOString(),
    });

    return reply.code(201).send({
      id: enrollment.id,
      token: enrollment.token,
      expiresAt: enrollment.expiresAt,
      enrollmentUrl,
      allowedSourceTypes: enrollment.allowedSourceTypes,
      requestedPermissions: enrollment.requestedPermissions,
    });
  });

  // 2. Validate Enrollment Token (Mobile/Browser landing page)
  app.get("/api/portable-camera/enrollments/:token", { config: { noAuth: true } }, async (request, reply) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(request.params);
    const enrollment = await repository.getEnrollment(token);

    if (!enrollment) {
      return reply.code(404).send({ error: "enrollment_not_found" });
    }

    if (enrollment.status !== "PENDING" || new Date(enrollment.expiresAt).getTime() <= Date.now()) {
      return reply.code(410).send({
        error: "enrollment_expired_or_consumed",
        status: enrollment.status === "PENDING" ? "EXPIRED" : enrollment.status,
      });
    }

    return reply.send({
      valid: true,
      id: enrollment.id,
      tenantId: enrollment.tenantId,
      branchId: enrollment.branchId,
      allowedSourceTypes: enrollment.allowedSourceTypes,
      requestedPermissions: enrollment.requestedPermissions,
      expiresAt: enrollment.expiresAt,
    });
  });

  // 3. Complete Enrollment: Register Device & Create Camera
  app.post("/api/portable-camera/enroll", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      token: z.string().min(1),
      deviceType: z.enum(["ANDROID", "IOS", "WINDOWS", "BROWSER"]),
      deviceName: z.string().min(1).max(200),
      appVersion: z.string().max(50).optional(),
      osVersion: z.string().max(50).optional(),
      branchId: z.string().optional(),
    }).parse(request.body);

    const enrollment = await repository.getEnrollment(body.token);
    if (!enrollment || enrollment.status !== "PENDING" || new Date(enrollment.expiresAt).getTime() <= Date.now()) {
      return reply.code(410).send({ error: "invalid_or_expired_enrollment_token" });
    }

    const branchId =
      body.branchId ||
      enrollment.branchId ||
      (await (store as any).listBranches?.(enrollment.tenantId, {}))?.[0]?.id ||
      "branch-default";

    // Map device type to camera source type
    const sourceTypeMap: Record<string, string> = {
      ANDROID: "android-camera",
      IOS: "ios-camera",
      WINDOWS: "laptop-camera",
      BROWSER: "browser-camera",
    };
    const cameraSourceType = sourceTypeMap[body.deviceType] || "browser-camera";

    // 1. Register device
    const clientIp = request.ip || (request.headers["x-forwarded-for"] as string) || "127.0.0.1";
    const device = await repository.registerDevice({
      tenantId: enrollment.tenantId,
      deviceType: body.deviceType,
      deviceName: body.deviceName,
      enrolledBy: enrollment.createdBy,
      appVersion: body.appVersion,
      osVersion: body.osVersion,
      lastKnownIp: clientIp,
    });

    // 2. Register camera in VMS inventory
    const cameraName = `${body.deviceName} (${body.deviceType})`;
    const camera = await store.createCameraFromManualRegistration(branchId, {
      discoveryId: "",
      name: cameraName,
      channel: 1,
      protocol: "rtsp",
      connectionSecretRef: `rtsp://media-gateway:8554/camera-${device.id}`,
      connectionTransport: "edge-gateway",
      manufacturer: "Portable / KryptonLogic",
      model: body.deviceType,
      sourceType: cameraSourceType as any,
    });

    if (camera) {
      device.cameraId = camera.id;
      // Link camera in device record
      await repository.updateDeviceSeen(device.id, clientIp);
    }

    // 3. Consume token
    await repository.consumeEnrollment(body.token, device.id);

    immutableAuditService.append({
      category: "PORTABLE_CAMERA_EVENT",
      tenantId: enrollment.tenantId,
      actorUserId: enrollment.createdBy,
      actorRoles: ["operator"],
      action: "PORTABLE_DEVICE_ENROLLED",
      outcome: "SUCCESS",
      targetResourceType: "portable_device",
      targetResourceId: device.id,
      branchId,
      metadata: {
        deviceName: body.deviceName,
        deviceType: body.deviceType,
        cameraId: camera?.id,
        ip: clientIp,
      },
      timestamp: new Date().toISOString(),
    });

    return reply.code(201).send({
      success: true,
      device: {
        id: device.id,
        deviceName: device.deviceName,
        type: device.type,
        credentialId: device.credentialId,
        credentialSecret: (device.metadata as any)?.credentialSecret,
      },
      camera: camera ? {
        id: camera.id,
        name: camera.name,
        branchId: camera.branchId,
      } : undefined,
    });
  });

  // 4. Start Portable Camera Live Streaming Session
  app.post("/api/portable-camera/sessions", { config: { noAuth: true } }, async (request, reply) => {
    const { tenantId: authTenantId, userId: authUserId, roles: authRoles } = getUser(request);
    const body = z.object({
      deviceId: z.string().min(1),
      sourceId: z.string().min(1),
      branchId: z.string().optional(),
      recordingPolicy: z.enum([
        "NO_RECORDING",
        "RECORD_WHILE_LIVE",
        "CONTINUOUS_WHILE_SESSION_ACTIVE",
        "MANUAL_RECORDING",
        "INCIDENT_ONLY",
      ]).default("RECORD_WHILE_LIVE"),
      videoCodec: z.string().default("H264"),
      audioCodec: z.string().default("OPUS"),
      resolution: z.object({ width: z.number(), height: z.number() }).optional(),
      fps: z.number().optional(),
      bitrateKbps: z.number().optional(),
    }).parse(request.body);

    const device = await repository.getDevice(body.deviceId);
    if (!device) {
      return reply.code(404).send({ error: "device_not_found" });
    }
    if (device.state !== "ACTIVE") {
      return reply.code(403).send({ error: "device_is_revoked_or_inactive", state: device.state });
    }

    const tenantId = device.tenantId || authTenantId;
    const userId = device.enrolledBy || authUserId;
    const roles = authRoles;

    // 1. Acquire distributed lease on media node
    const sessionId = `pcs_${Date.now()}`;
    const leaseResult = await leaseManager.acquireLease(
      tenantId,
      body.sourceId,
      sessionId,
      mediaNodeId,
      60
    );

    if (!leaseResult.acquired) {
      return reply.code(409).send({
        error: "camera_source_already_owned",
        existingOwner: leaseResult.existingOwner,
        reason: leaseResult.reason,
      });
    }

    // 2. Request Media Gateway to configure WHIP publish path
    let publishDetails: { whipUrl: string; whepUrl: string; publishToken: string; expiresAt: string };
    try {
      const gwRes = await fetch(`${mediaGatewayUrl.replace(/\/+$/, "")}/v1/portable/publish-start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          controlPlaneToken: sessionId,
          cameraId: body.sourceId,
        }),
      });
      if (!gwRes.ok) {
        await leaseManager.releaseLease(tenantId, body.sourceId, sessionId, mediaNodeId);
        return reply.code(502).send({ error: "media_gateway_failed_to_initialize_publish" });
      }
      publishDetails = await gwRes.json();
    } catch (gwErr) {
      // Fallback URLs if internal network differs
      publishDetails = {
        whipUrl: `/webrtc/camera-${body.sourceId}/whip`,
        whepUrl: `/webrtc/camera-${body.sourceId}/whep`,
        publishToken: `pub_${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      };
    }

    // 3. Create authoritative session record
    const session = await repository.createSession({
      tenantId,
      branchId: body.branchId,
      sourceId: body.sourceId,
      deviceId: body.deviceId,
      userId,
      mediaNodeId,
      fencingToken: leaseResult.lease?.fencingToken ?? 1,
      recordingPolicy: body.recordingPolicy,
      videoCodec: body.videoCodec,
      audioCodec: body.audioCodec,
      resolution: body.resolution
        ? { width: body.resolution.width, height: body.resolution.height }
        : undefined,
      fps: body.fps,
      bitrateKbps: body.bitrateKbps,
    });

    // 4. Update camera status to online
    await store.updateCameraStatus(body.sourceId, "online").catch(() => undefined);

    // 5. Trigger recording engine if policy requires recording
    if (["RECORD_WHILE_LIVE", "CONTINUOUS_WHILE_SESSION_ACTIVE"].includes(body.recordingPolicy)) {
      // Best effort trigger recording job
      try {
        await store.upsertRecordingJob?.(body.sourceId, {
          mode: "continuous",
          enabled: true,
          status: "recording",
          retentionDays: 30,
          schedule: { timezone: "UTC", windows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59", enabled: true }] },
          preRollSeconds: 5,
          postRollSeconds: 15,
          minMotionDurationSeconds: 1,
          motionConfidenceThreshold: 0.5,
          cooldownSeconds: 10,
          maxEventDurationSeconds: 300,
          segmentDurationSeconds: 15,
          hotRetentionDays: 7,
          warmRetentionDays: 30,
          coldRetentionDays: 90,
          maxBitrateKbps: body.bitrateKbps ?? 2000,
          critical: false,
          backupRequired: false,
          automaticDeletionEnabled: true,
          evidenceProtection: false,
          recordMainStream: true,
          primaryRecordingStorage: "sentinel-local",
          cloudArchivePolicy: "none",
        });
      } catch {}
    }

    immutableAuditService.append({
      category: "PORTABLE_CAMERA_EVENT",
      tenantId,
      actorUserId: userId,
      actorRoles: roles,
      action: "PORTABLE_CAMERA_STARTED",
      outcome: "SUCCESS",
      targetResourceType: "camera",
      targetResourceId: body.sourceId,
      branchId: body.branchId,
      metadata: {
        sessionId: session.id,
        deviceId: body.deviceId,
        mediaNodeId,
        recordingPolicy: body.recordingPolicy,
      },
      timestamp: new Date().toISOString(),
    });

    return reply.code(201).send({
      session: {
        id: session.id,
        sourceId: session.sourceId,
        deviceId: session.deviceId,
        state: "LIVE",
        mediaNodeId,
        fencingToken: session.fencingToken,
        recordingPolicy: session.recordingPolicy,
      },
      publish: {
        whipUrl: publishDetails.whipUrl,
        whepUrl: publishDetails.whepUrl,
        publishToken: publishDetails.publishToken,
        expiresAt: publishDetails.expiresAt,
      },
    });
  });

  // 5. Get Session Info
  app.get("/api/portable-camera/sessions/:id", { config: { noAuth: true } }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const session = await repository.getSession(id);
    if (!session) {
      return reply.code(404).send({ error: "session_not_found" });
    }
    return reply.send(session);
  });

  // 6. Stop Session
  app.post("/api/portable-camera/sessions/:id/stop", { config: { noAuth: true } }, async (request, reply) => {
    const { tenantId: authTenantId, userId: authUserId, roles: authRoles } = getUser(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ reason: z.string().max(200).optional() }).parse(request.body || {});

    const session = await repository.getSession(id);
    if (!session) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    const tenantId = session.tenantId || authTenantId;
    const userId = session.userId || authUserId;
    const roles = authRoles;

    // Release lease
    await leaseManager.releaseLease(session.tenantId, session.sourceId, session.id, session.mediaNodeId);

    // Update state to ENDED
    await repository.updateSessionState(id, "ENDED", undefined, body.reason || "user_stopped");

    // Update camera status to offline
    await store.updateCameraStatus(session.sourceId, "offline").catch(() => undefined);

    immutableAuditService.append({
      category: "PORTABLE_CAMERA_EVENT",
      tenantId,
      actorUserId: userId,
      actorRoles: roles,
      action: "PORTABLE_CAMERA_STOPPED",
      outcome: "SUCCESS",
      targetResourceType: "camera",
      targetResourceId: session.sourceId,
      metadata: {
        sessionId: id,
        reason: body.reason || "user_stopped",
      },
      timestamp: new Date().toISOString(),
    });

    return reply.send({ success: true, state: "ENDED" });
  });

  // 7. Telemetry / Health Ingestion
  app.post("/api/portable-camera/sessions/:id/health", { config: { noAuth: true } }, async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({
      connectivity: z.enum(["HEALTHY", "DEGRADED", "DISCONNECTED"]).default("HEALTHY"),
      bitrateKbps: z.number().optional(),
      fps: z.number().optional(),
      packetLossPercent: z.number().optional(),
      jitterMs: z.number().optional(),
      rttMs: z.number().optional(),
      reconnectCount: z.number().optional(),
      batteryPercent: z.number().optional(),
      thermalState: z.enum(["nominal", "fair", "serious", "critical"]).optional(),
      recordingState: z.enum(["RECORDING", "PAUSED", "STOPPED", "NOT_CONFIGURED"]).default("RECORDING"),
      location: z.object({
        available: z.boolean(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        accuracyMeters: z.number().optional(),
      }).optional(),
    }).parse(request.body);

    const session = await repository.getSession(id);
    if (!session) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    const healthObj = {
      connectivity: body.connectivity,
      lastFrameAt: new Date().toISOString(),
      bitrateKbps: body.bitrateKbps,
      fps: body.fps,
      packetLossPercent: body.packetLossPercent,
      jitterMs: body.jitterMs,
      rttMs: body.rttMs,
      reconnectCount: body.reconnectCount,
      batteryPercent: body.batteryPercent,
      thermalState: body.thermalState,
      recordingState: body.recordingState,
    };

    await repository.updateSessionState(id, body.connectivity === "DISCONNECTED" ? "DEGRADED" : "LIVE", healthObj);
    await repository.recordSessionEvent(id, "HEALTH_TELEMETRY", { ...healthObj, location: body.location });

    return reply.send({ success: true });
  });

  // 8. Attach Session to Incident
  app.post("/api/portable-camera/sessions/:id/attach-incident", async (request, reply) => {
    const { tenantId, userId, roles } = getUser(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const { incidentId } = z.object({ incidentId: z.string().uuid() }).parse(request.body);

    const session = await repository.getSession(id);
    if (!session) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    await repository.attachIncidentToSession(id, incidentId);

    immutableAuditService.append({
      category: "PORTABLE_CAMERA_EVENT",
      tenantId,
      actorUserId: userId,
      actorRoles: roles,
      action: "PORTABLE_CAMERA_ATTACHED_TO_INCIDENT",
      outcome: "SUCCESS",
      targetResourceType: "incident",
      targetResourceId: incidentId,
      metadata: { sessionId: id, cameraId: session.sourceId },
      timestamp: new Date().toISOString(),
    });

    return reply.send({ success: true, attached: true });
  });

  // 9. List Enrolled Devices
  app.get("/api/portable-camera/devices", async (request, reply) => {
    const { tenantId } = getUser(request);
    const devices = await repository.listDevices(tenantId);
    
    // Augment with active session if present
    const augmented = await Promise.all(
      devices.map(async (dev) => {
        let activeSession = undefined;
        if (dev.cameraId) {
          activeSession = await repository.getActiveSessionForSource(dev.cameraId);
        }
        return {
          ...dev,
          activeSession: activeSession ? {
            id: activeSession.id,
            state: activeSession.state,
            startedAt: activeSession.startedAt,
            fps: activeSession.fps,
            bitrateKbps: activeSession.bitrateKbps,
            recordingPolicy: activeSession.recordingPolicy,
            health: activeSession.health,
          } : null,
        };
      })
    );

    return reply.send({ devices: augmented });
  });

  // 10. Revoke Device
  app.post("/api/portable-camera/devices/:deviceId/revoke", async (request, reply) => {
    const { tenantId, userId, roles } = getUser(request);
    const { deviceId } = z.object({ deviceId: z.string().min(1) }).parse(request.params);

    const device = await repository.getDevice(deviceId);
    if (!device) {
      return reply.code(404).send({ error: "device_not_found" });
    }

    await repository.revokeDevice(deviceId);

    // If device has a camera, stop any active sessions
    if (device.cameraId) {
      const activeSession = await repository.getActiveSessionForSource(device.cameraId);
      if (activeSession) {
        await leaseManager.releaseLease(tenantId, device.cameraId, activeSession.id, activeSession.mediaNodeId);
        await repository.updateSessionState(activeSession.id, "ENDED", undefined, "device_revoked");
        await store.updateCameraStatus(device.cameraId, "offline").catch(() => undefined);
      }
    }

    immutableAuditService.append({
      category: "PORTABLE_CAMERA_EVENT",
      tenantId,
      actorUserId: userId,
      actorRoles: roles,
      action: "PORTABLE_DEVICE_REVOKED",
      outcome: "SUCCESS",
      targetResourceType: "portable_device",
      targetResourceId: deviceId,
      metadata: { deviceName: device.deviceName },
      timestamp: new Date().toISOString(),
    });

    return reply.send({ success: true, state: "REVOKED" });
  });

  // 11. Tenant Policy
  app.get("/api/portable-camera/policy", async (request, reply) => {
    const { tenantId } = getUser(request);
    const policy = await repository.getPolicy(tenantId);
    return reply.send(policy);
  });
}
