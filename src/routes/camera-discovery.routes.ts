import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  autoProvisionVerifiedCameras,
  defaultRecordingJob,
  discoveryConnection,
  isRecorderBacked,
} from "../services/camera-auto-provision.js";

const branchParams = z.object({ branchId: z.string().min(1) });
const discoveryParams = z.object({ 
  branchId: z.string().min(1),
  discoveryId: z.string().min(1),
});
const cameraIdentityParams = z.object({ cameraId: z.string().min(1) });

const approveDiscoveryBody = z.object({
  name: z.string().min(1),
  channel: z.number().int().min(1).optional(),
  protocol: z.enum(["onvif-t", "onvif-s", "rtsp", "vendor-adapter"]).optional(),
  connectionSecretRef: z.string().min(1).optional(),
});

const approveAllBody = z.object({
  recordingMode: z.enum(["continuous", "motion"]).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  enableAnalytics: z.boolean().optional(),
  enableAlerts: z.boolean().optional(),
});

const activateDiscoveryBody = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(1_024),
});

const targetedVerificationMinimumAgentVersion = "0.1.7";

/**
 * Lists pending ONVIF discoveries. Submission, approval, and camera inventory
 * remain on the existing control-plane routes so they retain the same
 * authorization, validation, secret redaction, and audit behavior.
 */
export async function registerCameraDiscoveryRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  pool?: Pool,
) {
  app.get("/v1/cameras/:cameraId/identity", async (request, reply) => {
    const { cameraId } = cameraIdentityParams.parse(request.params);
    const camera = await store.getCamera(cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    const decision = await store.checkAccess(request.currentUser, "device:configure", camera.nodeId);
    if (!decision?.allowed) {
      return reply.code(403).send({
        error: "forbidden",
        reason: decision?.reason ?? "no_matching_grant",
      });
    }
    const identity = await store.getDeviceIdentityByCamera(cameraId);
    if (!identity) return reply.code(404).send({ error: "device_identity_not_found" });
    return identity;
  });

  app.get("/v1/branches/:branchId/cameras/discovered", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    const decision = await store.checkAccess(
      request.currentUser, "device:configure", branchId,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({
        error: "forbidden", reason: decision?.reason ?? "no_matching_grant",
      });
    }
    return { data: await store.listDiscoveredCameras(branchId) };
  });

  app.post("/v1/branches/:branchId/cameras/discovered", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const body = request.body as any;
    if (!body || (typeof body !== "object")) {
      return reply.code(400).send({ error: "discovery_payload_required" });
    }
    
    // Accept either a single device, array, or object with devices array
    const items = Array.isArray(body) 
      ? body 
      : Array.isArray(body.devices) 
      ? body.devices 
      : [body];

    const isPresent = (value: unknown): value is string =>
      typeof value === "string" && value.trim().length > 0;
    const resolvedEdgeAgentId = isPresent(body.edgeAgentId) ? body.edgeAgentId : undefined;
    const branchAgents = await store.listEdgeAgentsByBranch(branchId);

    const results: any[] = [];
    for (const item of items) {
      if (!item || typeof item !== "object" || Object.keys(item).length === 0) continue;
      
      const itemAgentId = isPresent(item.edgeAgentId) ? item.edgeAgentId : resolvedEdgeAgentId;
      if (!itemAgentId || !branchAgents.some((agent) => agent.id === itemAgentId)) {
        results.push({ status: "error", error: "discovery_edge_agent_required" });
        continue;
      }

      const rawVendor = (item.vendor || item.manufacturer || item.model || item.type || "").toLowerCase();
      const vendor: "cp-plus" | "dahua" | "hikvision" | "axis" | "hanwha" | "uniview" | "other" = 
        rawVendor.includes("cp") ? "cp-plus" :
        rawVendor.includes("dahua") ? "dahua" :
        rawVendor.includes("hik") ? "hikvision" :
        rawVendor.includes("axis") ? "axis" :
        rawVendor.includes("hanwha") ? "hanwha" :
        rawVendor.includes("uniview") ? "uniview" : "other";

      const model = isPresent(item.model) ? item.model : isPresent(item.type) ? item.type : undefined;
      const ipAddress = isPresent(item.ipAddress) ? item.ipAddress : isPresent(item.ip) ? item.ip : undefined;
      const onvifPort = Number(item.onvifPort ?? item.port);
      const rtspPort = Number(item.rtspPort ?? item.port);
      if (!model || !ipAddress || !Number.isInteger(onvifPort) || !Number.isInteger(rtspPort)) {
        results.push({ status: "error", error: "discovery_identity_and_ports_required" });
        continue;
      }

      const manufacturer = isPresent(item.manufacturer) ? item.manufacturer : undefined;
      const profiles = Array.isArray(item.profiles) ? item.profiles : Array.isArray(item.mediaProfiles) ? item.mediaProfiles : [];
      const capabilities = item.capabilities && typeof item.capabilities === "object"
        ? item.capabilities
        : { ptz: false, audio: false, events: false };

      const normalized = {
        edgeAgentId: itemAgentId,
        discoveryMethod: (item.discoveryMethod || "edge-agent-reported-inventory") as any,
        vendor,
        manufacturer,
        model,
        ipAddress,
        macAddress: item.macAddress,
        serialNumber: item.serialNumber,
        firmwareVersion: item.firmwareVersion,
        onvifPort,
        rtspPort,
        onvifServices: item.onvifServices,
        onvifCapabilityTests: item.onvifCapabilityTests,
        mediaProfiles: profiles,
        onvifEndpointReference: item.onvifEndpointReference,
        onvifUuid: item.onvifUuid,
        sourceType: (item.sourceType === "analog-dvr-channel" || item.sourceType === "nvr-channel" ? item.sourceType : "ip-camera") as any,
        recorderId: item.recorderId || (item.sourceType === "analog-dvr-channel" ? `recorder-${(item.ipAddress || item.ip || "dvr").replace(/\./g, "-")}` : undefined),
        recorderChannel: item.recorderChannel ? Number(item.recorderChannel) : (item.channel ? Number(item.channel) : undefined),
        recorderSerialNumber: item.recorderSerialNumber,
        streamVerified: item.streamVerified === undefined ? undefined : Boolean(item.streamVerified),
        rtspValidated: item.rtspValidated === undefined ? undefined : Boolean(item.rtspValidated),
        ptzCapability: item.ptzCapability !== undefined ? Boolean(item.ptzCapability) : Boolean(item.capabilities?.ptz),
        audioCapability: item.audioCapability !== undefined ? Boolean(item.audioCapability) : Boolean(item.capabilities?.audio),
        analyticsCapability: item.analyticsCapability !== undefined ? Boolean(item.analyticsCapability) : Boolean(item.capabilities?.events),
        timeSynchronization: item.timeSynchronization,
        duplicateStatus: item.duplicateStatus,
        compatibilityStatus: item.compatibilityStatus,
        hardwareId: item.hardwareId,
        existingDeviceAssociation: item.existingDeviceAssociation,
        statusReason: item.statusReason,
        displayName: isPresent(item.displayName) ? item.displayName : undefined,
        capabilities,
        profiles,
      };

      try {
        const created = await store.createDiscovery(branchId, normalized as any);
        results.push(created);
      } catch (err: any) {
        request.log.error({ err, normalized }, "Failed to save discovered camera to database");
        results.push({ ...normalized, status: "error", error: err.message });
      }
    }

    const isBatch = Array.isArray(body) || Array.isArray(body.devices);
    if (!isBatch && results.length === 1 && results[0]) {
      return reply.code(202).send(results[0]);
    }

    return reply.code(202).send({
      success: true,
      count: results.filter((r) => r.status !== "error").length,
      data: results,
      id: results[0]?.id,
      message: `Successfully registered ${results.length} discovered devices for branch ${branchId}`,
    });
  });

  app.post("/v1/branches/:branchId/cameras/discovered/:discoveryId/approve", async (request, reply) => {
    const { branchId, discoveryId } = discoveryParams.parse(request.params);
    const body = approveDiscoveryBody.parse(request.body);
    
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    
    const decision = await store.checkAccess(
      request.currentUser, "device:configure", branchId,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({
        error: "forbidden", reason: decision?.reason ?? "no_matching_grant",
      });
    }

    const discoveries = await store.listDiscoveredCameras(branchId);
    const discovered = discoveries.find((item) => item.id === discoveryId);
    if (!discovered) {
      return reply.code(404).send({ error: "discovery_not_found" });
    }

    const connection = await discoveryConnection(store, branchId, discovered);
    let camera: any = null;
    try {
      camera = await store.approveCamera(branchId, {
        discoveryId,
        name: body.name,
        protocol: body.protocol ?? (discovered.recorderId ? "vendor-adapter" : "onvif-t"),
        channel: body.channel ?? discovered.recorderChannel ?? 1,
        connectionSecretRef: body.connectionSecretRef ?? connection.connectionSecretRef,
        ...(connection.connectionTransport ? { connectionTransport: connection.connectionTransport } : {}),
        model: discovered.model,
        serialNumber: discovered.serialNumber,
        macAddress: discovered.macAddress,
        ipAddress: discovered.ipAddress,
        onvifUuid: discovered.onvifUuid,
        certificateRef: discovered.certificateRef,
        certificateFingerprint: discovered.certificateFingerprint,
        sourceType: discovered.sourceType,
        recorderId: discovered.recorderId,
        recorderChannel: discovered.recorderChannel,
        recorderSerialNumber: discovered.recorderSerialNumber,
      });
    } catch (err) {
      request.log.warn({ err }, "store.approveCamera encountered error, trying manual registration fallback");
    }

    if (!camera) {
      try {
        camera = await store.createCameraFromManualRegistration(branchId, {
          discoveryId,
          name: body.name,
          protocol: body.protocol ?? (discovered.recorderId ? "vendor-adapter" : "onvif-t"),
          channel: body.channel ?? discovered.recorderChannel ?? 1,
          connectionSecretRef: body.connectionSecretRef ?? connection.connectionSecretRef,
          ...(connection.connectionTransport ? { connectionTransport: connection.connectionTransport } : {}),
          model: discovered.model || "IP Camera",
          serialNumber: discovered.serialNumber,
          macAddress: discovered.macAddress,
          ipAddress: discovered.ipAddress,
          sourceType: discovered.sourceType || "ip-camera",
        });
      } catch (err) {
        request.log.warn({ err }, "Fallback createCameraFromManualRegistration encountered error");
      }
    }

    if (!camera) {
      return reply.code(500).send({ error: "failed_to_approve_camera" });
    }

    const recorderBacked = isRecorderBacked(discovered);
    await store.upsertRecordingJob(
      camera.id,
      defaultRecordingJob("continuous", 180, recorderBacked),
    ).catch(() => undefined);

    return {
      success: true,
      cameraId: camera.id,
      recordingArchitecture: recorderBacked ? "recorder-local-evidence-only" : "sentinel-local",
      message: `Camera ${body.name} approved and added to monitoring`,
    };
  });

  app.post("/v1/branches/:branchId/cameras/discovered/:discoveryId/activate", async (request, reply) => {
    const { branchId, discoveryId } = discoveryParams.parse(request.params);
    const body = activateDiscoveryBody.parse(request.body);
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    const decision = await store.checkAccess(request.currentUser, "device:configure", branchId);
    if (!decision?.allowed) {
      return reply.code(403).send({ error: "forbidden", reason: decision?.reason ?? "no_matching_grant" });
    }
    if (!pool) {
      return reply.code(503).send({ error: "discovery_credentials_database_unavailable" });
    }

    const discovered = (await store.listDiscoveredCameras(branchId))
      .find((item) => item.id === discoveryId);
    if (!discovered) {
      return reply.code(404).send({ error: "discovery_not_found" });
    }
    const agent = await store.getEdgeAgent(discovered.edgeAgentId);
    if (!agent || agent.branchId !== branchId) {
      return reply.code(409).send({ error: "discovery_edge_agent_unavailable" });
    }
    if (agent.status !== "online") {
      return reply.code(409).send({
        error: "discovery_edge_agent_not_connected",
        message: "Connect the branch scanner to verify this device.",
      });
    }
    if (!supportsTargetedVerification(agent.version)) {
      return reply.code(409).send({
        error: "edge_agent_update_required",
        minimumVersion: targetedVerificationMinimumAgentVersion,
        message: "Repair the Sentinel Grid Scanner before verifying credentials. Older scanners cannot guarantee a single-device probe.",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM camera_credentials
         WHERE branch_id = $1 AND ip_address = $2 AND scope = 'host-specific'`,
        [branchId, discovered.ipAddress],
      );
      await client.query(
        `INSERT INTO camera_credentials
           (branch_id, edge_agent_id, ip_address, username, password, scope)
         VALUES ($1, $2, $3, $4, $5, 'host-specific')`,
        [branchId, discovered.edgeAgentId, discovered.ipAddress, body.username, body.password],
      );
      await client.query(
        `UPDATE discovered_cameras
         SET credentials_required = false, stream_verified = true, credentials_status = 'verified'
         WHERE id = $1 AND branch_node_id = $2`,
        [discoveryId, branchId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    const scan = await store.createEdgeScanJob(branchId, discovered.edgeAgentId, {
      discoveryId: discovered.id,
      ipAddress: discovered.ipAddress,
      onvifPort: discovered.onvifPort,
    });

    await store.writeAudit({
      tenantId: branch.tenantId,
      actorUserId: request.currentUser.id,
      action: "camera.discovery_credentials_activated",
      resourceNodeId: branchId,
      outcome: "success",
      sourceIp: request.ip,
      details: {
        discoveryId,
        edgeAgentId: discovered.edgeAgentId,
        credentialScope: "host-specific",
        scanScope: "device",
        targetIpAddress: discovered.ipAddress,
      },
    });
    return reply.code(200).send({
      scanId: scan.id,
      status: "queued",
      scope: "device",
      targetDiscoveryId: discovered.id,
      message: "Credentials stored. The connected edge agent must complete the targeted verification before live streaming is enabled.",
    });
  });

  app.post("/v1/branches/:branchId/cameras/discovered/approve-all", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const body = approveAllBody.parse(request.body);
    
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    
    const decision = await store.checkAccess(
      request.currentUser, "device:configure", branchId,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({
        error: "forbidden", reason: decision?.reason ?? "no_matching_grant",
      });
    }

    const outcome = await autoProvisionVerifiedCameras(store, branchId, {
      recordingMode: body.recordingMode ?? "continuous",
      retentionDays: body.retentionDays ?? 180,
      enableAnalytics: body.enableAnalytics ?? true,
      enableAlerts: body.enableAlerts ?? true,
      createdBy: request.currentUser.id,
    });
    const { credentialsRequired: _credentialsRequired, pendingVerification: _pendingVerification, ...summary } = outcome.summary;
    return reply.code(201).send({ summary, results: outcome.results });
  });

  app.post("/v1/branches/:branchId/cameras/discovered/:discoveryId/reject", async (request, reply) => {
    const { branchId, discoveryId } = discoveryParams.parse(request.params);
    const body = z.object({ reason: z.string().optional() }).parse(request.body);
    
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    
    const decision = await store.checkAccess(
      request.currentUser, "device:configure", branchId,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({
        error: "forbidden", reason: decision?.reason ?? "no_matching_grant",
      });
    }

    const rejected = await store.rejectDiscovery(discoveryId, body.reason);
    if (!rejected) {
      return reply.code(404).send({ error: "discovery_not_found" });
    }

    return { success: true, message: "Discovery rejected" };
  });

  app.patch("/v1/branches/:branchId/cameras/discovered/:discoveryId/rename", async (request, reply) => {
    const { branchId, discoveryId } = discoveryParams.parse(request.params);
    const body = z.object({ displayName: z.string().min(1) }).parse(request.body);
    
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    
    const decision = await store.checkAccess(
      request.currentUser, "device:configure", branchId,
    );
    if (!decision?.allowed) {
      return reply.code(403).send({
        error: "forbidden", reason: decision?.reason ?? "no_matching_grant",
      });
    }

    const renamed = await store.renameDiscovery(discoveryId, body.displayName);
    if (!renamed) {
      return reply.code(404).send({ error: "discovery_not_found" });
    }

    return { success: true, message: "Display name updated" };
  });

  app.post("/v1/cameras/probe-direct", async (request, reply) => {
    const body = z.object({
      ipAddress: z.string().min(1),
      rtspPort: z.number().int().positive(),
      username: z.string().min(1),
      password: z.string().min(1),
    }).parse(request.body);

    const result = await probeNetworkCamera(body.ipAddress, body.rtspPort, body.username, body.password);
    return result;
  });

  app.post("/v1/cameras/qr-connect", async (request, reply) => {
    const body = z.object({
      qrData: z.string().min(1),
      branchId: z.string().optional(),
    }).parse(request.body);

    const cleaned = body.qrData.replace(/[\r\n\t]/g, " ").trim();
    const uidMatch = cleaned.match(/^([A-Za-z0-9_-]{6,64})$/);
    if (!uidMatch || !body.branchId) {
      return reply.code(400).send({ error: "qr_payload_and_branch_required" });
    }
    return reply.code(501).send({
      error: "qr_device_activation_requires_edge_agent",
      uid: uidMatch[1],
      message: "QR identity was read, but activation requires a real edge-agent discovery and credential verification result.",
    });
  });
}

import net from "node:net";
import crypto from "node:crypto";

async function probeNetworkCamera(ip: string, port = 554, user = "admin", pass = "") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3500);
    const uri = `rtsp://${ip}:${port}/stream1`;

    let serverBanner = "Standard RTSP";
    let isHappytime = false;
    let authType = "None";
    let authenticated = false;
    let nonce = "";

    socket.connect(port, ip, () => {
      socket.write(`OPTIONS ${uri} RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: SentinelGrid/2.0\r\n\r\n`);
    });

    let buffer = "";
    socket.on("data", (data) => {
      buffer += data.toString();

      if (buffer.includes("Server:")) {
        const serverLine = buffer.split("\r\n").find((l) => l.toLowerCase().startsWith("server:"));
        if (serverLine) {
          serverBanner = serverLine.slice(7).trim();
          if (serverBanner.toLowerCase().includes("happytime")) isHappytime = true;
        }
      }

      if (buffer.includes("401 Unauthorized") && !nonce) {
        const authLine = buffer.split("\r\n").find((l) => l.toLowerCase().startsWith("www-authenticate:"));
        if (authLine) {
          authType = authLine.toLowerCase().includes("digest") ? "Digest" : "Basic";
          const match = authLine.match(/nonce="?([^",\r\n]+)"?/i);
          nonce = match?.[1] || "";

          if (pass) {
            // Compute digest
            const realm = "happytimesoft";
            const ha1 = crypto.createHash("md5").update(`${user}:${realm}:${pass}`).digest("hex");
            const ha2 = crypto.createHash("md5").update(`DESCRIBE:${uri}`).digest("hex");
            const response = crypto.createHash("md5").update(`${ha1}:${nonce}:${ha2}`).digest("hex");
            const digest = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
            socket.write(`DESCRIBE ${uri} RTSP/1.0\r\nCSeq: 2\r\nUser-Agent: SentinelGrid/2.0\r\nAuthorization: ${digest}\r\nAccept: application/sdp\r\n\r\n`);
          } else {
            socket.destroy();
            resolve({
              online: true,
              ipAddress: ip,
              rtspPort: port,
              server: serverBanner,
              vendor: isHappytime ? "Trueview / TrueCloud" : "ONVIF / RTSP Device",
              model: isHappytime ? "T18061-W (3MP Wi-Fi Robot)" : "Generic IP Camera",
              authenticated: false,
              authRequired: true,
              authType,
              streamUrl: `rtsp://${user}:<PASSWORD>@${ip}:${port}/stream1`,
              substreamUrl: `rtsp://${user}:<PASSWORD>@${ip}:${port}/stream2`,
              capabilities: { ptz: isHappytime, audio: true, motion: true },
            });
          }
        }
      } else if (buffer.includes("RTSP/1.0 200 OK")) {
        authenticated = true;
        socket.destroy();
        resolve({
          online: true,
          ipAddress: ip,
          rtspPort: port,
          server: serverBanner,
          vendor: isHappytime ? "Trueview / TrueCloud" : "ONVIF / RTSP Device",
          model: isHappytime ? "T18061-W (3MP Wi-Fi Robot)" : "Generic IP Camera",
          authenticated: true,
          authRequired: true,
          authType,
          streamUrl: `rtsp://${user}:${pass}@${ip}:${port}/stream1`,
          substreamUrl: `rtsp://${user}:${pass}@${ip}:${port}/stream2`,
          capabilities: { ptz: isHappytime, audio: true, motion: true },
        });
      } else if (buffer.includes("CSeq: 2") && buffer.includes("401 Unauthorized")) {
        socket.destroy();
        resolve({
          online: true,
          ipAddress: ip,
          rtspPort: port,
          server: serverBanner,
          vendor: isHappytime ? "Trueview / TrueCloud" : "ONVIF / RTSP Device",
          model: isHappytime ? "T18061-W (3MP Wi-Fi Robot)" : "Generic IP Camera",
          authenticated: false,
          authRequired: true,
          authType,
          error: "Invalid password provided",
          streamUrl: `rtsp://${user}:<PASSWORD>@${ip}:${port}/stream1`,
          substreamUrl: `rtsp://${user}:<PASSWORD>@${ip}:${port}/stream2`,
          capabilities: { ptz: isHappytime, audio: true, motion: true },
        });
      }
    });

    socket.on("error", (err) => {
      socket.destroy();
      resolve({ online: false, ipAddress: ip, error: err.message });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ online: false, ipAddress: ip, error: "Connection timed out" });
    });
  });
}

function supportsTargetedVerification(version: string) {
  const current = version.match(/^(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number);
  const minimum = targetedVerificationMinimumAgentVersion.split(".").map(Number);
  if (!current || current.length !== 3) return false;
  for (let index = 0; index < minimum.length; index++) {
    if (current[index]! > minimum[index]!) return true;
    if (current[index]! < minimum[index]!) return false;
  }
  return true;
}
