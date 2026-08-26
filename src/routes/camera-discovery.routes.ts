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
import { sealEdgeCommandPayload } from "../security/edge-command-envelope.js";

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
  discoveryIds: z.array(z.string().min(1)).min(1).max(256).optional(),
  recordingMode: z.enum(["continuous", "motion"]).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  enableAnalytics: z.boolean().optional(),
  enableAlerts: z.boolean().optional(),
});

const activateDiscoveryBody = z.object({
  username: z.string().trim().min(1).max(128),
  // A number of cameras/DVRs use an account with no password. Keep the
  // internal credential contract string-based, but accept JSON null from
  // discovery clients and normalize it before storage/encryption.
  password: z.string().max(1_024).nullable().transform((value) => value ?? ""),
});

const targetedVerificationMinimumAgentVersion = "0.1.7";
// v0.1.15 invalidates the scanner's cached database credentials before it
// performs the targeted verification scan. Older agents receive a follow-up
// scan job so an existing installation can still verify the newly submitted
// login after the encrypted command is processed.
const encryptedRtspVaultMinimumAgentVersion = "0.1.15";
const recorderChannelVerificationMinimumAgentVersion = "0.1.12";

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
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") return reply.code(404).send({ error: "branch_not_found" });
    if (!request.edgeAgentAuthenticated) {
      const access = await store.checkAccess(request.currentUser, "device:configure", branchId);
      if (!access?.allowed) return reply.code(403).send({ error: "forbidden", reason: access?.reason ?? "no_matching_grant" });
    }
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
      if (request.edgeAgentAuthenticated && request.edgeAgentId !== itemAgentId) {
        results.push({ status: "error", error: "discovery_edge_agent_identity_mismatch" });
        continue;
      }

      // Some older scanners report vendor="other" while the device identity
      // still contains the real manufacturer (for example CPPLUS without a
      // space). Include every available hint so the control plane can recover
      // the vendor instead of persisting a generic classification.
      const rawVendor = [item.vendor, item.manufacturer, item.model, item.type]
        .filter(isPresent)
        .join(" ")
        .toLowerCase();
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
      const allowedDiscoveryLayers = new Set([
        "network-discovery", "onvif-discovery", "onvif-authentication", "get-capabilities",
        "get-profiles", "get-stream-uri", "rtsp-verification", "vendor-adapter", "fingerprint", "register",
      ]);
      const allowedLayerStatuses = new Set(["passed", "failed", "fallback", "skipped"]);
      const discoveryLayers = Array.isArray(item.discoveryLayers)
        ? item.discoveryLayers.slice(0, 20).filter((layer: any) =>
          layer && allowedDiscoveryLayers.has(layer.layer) && allowedLayerStatuses.has(layer.status)
        ).map((layer: any) => ({
          layer: layer.layer,
          status: layer.status,
          detail: String(layer.detail ?? "").slice(0, 1_000),
        }))
        : undefined;

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
        discoveryLayers,
        mediaProfiles: profiles,
        onvifEndpointReference: item.onvifEndpointReference,
        onvifUuid: item.onvifUuid,
        sourceType: (item.sourceType === "analog-dvr-channel" || item.sourceType === "nvr-channel" ? item.sourceType : "ip-camera") as any,
        recorderId: item.recorderId || (item.sourceType === "analog-dvr-channel" ? `recorder-${(item.ipAddress || item.ip || "dvr").replace(/\./g, "-")}` : undefined),
        recorderChannel: item.recorderChannel ? Number(item.recorderChannel) : (item.channel ? Number(item.channel) : undefined),
        recorderSerialNumber: item.recorderSerialNumber,
        // Keep the edge agent's authentication evidence intact. The dashboard
        // uses this flag to offer a host-specific credential prompt instead of
        // hiding an otherwise reachable device.
        credentialsRequired: item.credentialsRequired === undefined ? undefined : Boolean(item.credentialsRequired),
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
    if (discovered.duplicateStatus === "duplicate") {
      return reply.code(409).send({ error: "duplicate_discovery_cannot_be_approved" });
    }
    if (discovered.compatibilityStatus === "incompatible") {
      return reply.code(409).send({ error: "incompatible_discovery_cannot_be_approved" });
    }
    if (discovered.credentialsRequired === true) {
      return reply.code(409).send({ error: "camera_credentials_must_be_verified_before_approval" });
    }
    if (discovered.streamVerified !== true) {
      return reply.code(409).send({ error: "camera_stream_must_be_verified_before_approval" });
    }

    const connection = await discoveryConnection(store, branchId, discovered);
    let camera: any = null;
    try {
      camera = await store.approveCamera(branchId, {
        discoveryId,
        name: body.name,
        // A recorder channel is not automatically tied to its vendor API.
        // Keep its ONVIF/RTSP evidence usable across OEM models and reserve
        // the vendor adapter for a legacy source with neither standard path.
        protocol: body.protocol ?? (
          discovered.onvifSupport === true
            ? "onvif-t"
            : discovered.rtspValidated || discovered.onvifSupport === false
              ? "rtsp"
              : isRecorderBacked(discovered)
                ? "vendor-adapter"
                : "onvif-t"
        ),
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
          protocol: body.protocol ?? (
            discovered.onvifSupport === true
              ? "onvif-t"
              : discovered.rtspValidated || discovered.onvifSupport === false
                ? "rtsp"
                : isRecorderBacked(discovered)
                  ? "vendor-adapter"
                  : "onvif-t"
          ),
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
    if (looksLikeRecorderDiscovery(discovered) &&
        !supportsAgentVersion(agent.version, recorderChannelVerificationMinimumAgentVersion)) {
      return reply.code(409).send({
        error: "edge_agent_update_required",
        minimumVersion: recorderChannelVerificationMinimumAgentVersion,
        message: "Repair the Sentinel Grid Scanner before verifying this recorder so every DVR/NVR channel is enumerated.",
      });
    }

    const commandPublicKey = await store.getEdgeAgentCommandPublicKey(discovered.edgeAgentId);
    if (!commandPublicKey) {
      return reply.code(409).send({
        error: "gateway_secure_command_key_missing",
        message: "Repair this legacy branch scanner once before sending device credentials.",
      });
    }

    // v0.1.10 still reads host-scoped RTSP credentials from this bootstrap
    // table. Newer agents prefer their encrypted local vault, but retaining
    // this compatibility write lets an already-installed scanner verify the
    // device without requiring another download.
    if (pool) {
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
          `UPDATE camera_discoveries
           SET stream_verified = false,
               rtsp_validated = false
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
    }

    const envelope = sealEdgeCommandPayload({
      username: body.username,
      password: body.password,
      scope: { host: discovered.ipAddress },
      issuedAt: new Date().toISOString(),
    }, commandPublicKey);
    const command = await store.createEdgeCommand({
      edgeAgentId: discovered.edgeAgentId,
      type: "update-credentials",
      payload: {
        envelope,
        target: { discoveryId: discovered.id, ipAddress: discovered.ipAddress },
      },
      requestedBy: request.currentUser.id,
    });
    // Older scanners need a device-scoped follow-up job because they can
    // finish the encrypted command before refreshing their database
    // credential cache. The job is claimed immediately after the command.
    const compatibilityScan = supportsAgentVersion(agent.version, encryptedRtspVaultMinimumAgentVersion)
      ? undefined
      : await store.createEdgeScanJob(branchId, discovered.edgeAgentId, {
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
        commandId: command.id,
        credentialScope: "host-specific",
        delivery: "gateway-encrypted-command",
        targetIpAddress: discovered.ipAddress,
      },
    });
    return reply.code(202).send({
      commandId: command.id,
      ...(compatibilityScan ? { scanId: compatibilityScan.id } : {}),
      status: command.status,
      scope: "device",
      targetDiscoveryId: discovered.id,
      message: "Credentials were encrypted for the connected edge agent. The dialog will remain open until this device has been verified.",
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
      ...(body.discoveryIds ? { discoveryIds: body.discoveryIds } : {}),
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

  app.post("/v1/cameras/probe-direct/range", async (request, reply) => {
    const body = z.object({
      branchId: z.string().min(1),
      ipAddresses: z.array(z.string().ip({ version: "v4" })).min(1).max(256),
      rtspPort: z.number().int().positive().max(65_535).default(554),
      username: z.string().max(256).optional().default("admin"),
      password: z.string().max(1_024).nullable().transform((value) => value ?? "").default(""),
    }).parse(request.body);
    const branch = await store.getNode(body.branchId);
    if (!branch || branch.type !== "branch") return reply.code(404).send({ error: "branch_not_found" });
    const access = await store.checkAccess(request.currentUser, "device:configure", body.branchId);
    if (!access?.allowed) return reply.code(403).send({ error: "forbidden", reason: access?.reason ?? "no_matching_grant" });
    if (body.ipAddresses.some((address) => !isPrivateProbeAddress(address))) {
      return reply.code(400).send({ error: "direct_probe_requires_private_or_vpn_address" });
    }

    const results = await probeNetworkCameras(body.ipAddresses, body.rtspPort, body.username, body.password);
    return {
      results,
      scanned: results.length,
      online: results.filter((result) => result.online).length,
      authenticated: results.filter((result) => result.authenticated === true).length,
    };
  });

  app.post("/v1/cameras/probe-direct", async (request, reply) => {
    const body = z.object({
      branchId: z.string().min(1),
      ipAddress: z.string().ip({ version: "v4" }),
      rtspPort: z.number().int().positive(),
      username: z.string().min(1),
      password: z.string().max(1_024).nullable().transform((value) => value ?? ""),
    }).parse(request.body);
    const branch = await store.getNode(body.branchId);
    if (!branch || branch.type !== "branch") return reply.code(404).send({ error: "branch_not_found" });
    const access = await store.checkAccess(request.currentUser, "device:configure", body.branchId);
    if (!access?.allowed) return reply.code(403).send({ error: "forbidden", reason: access?.reason ?? "no_matching_grant" });
    if (!isPrivateProbeAddress(body.ipAddress)) {
      return reply.code(400).send({ error: "direct_probe_requires_private_or_vpn_address" });
    }

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

type DirectProbeResult = {
  online: boolean;
  ipAddress: string;
  rtspPort?: number;
  server?: string;
  vendor?: string;
  model?: string;
  authenticated?: boolean;
  authRequired?: boolean;
  authType?: string;
  error?: string;
  streamUrl?: string;
  substreamUrl?: string;
  capabilities?: { ptz: boolean; audio: boolean; motion: boolean };
};

export async function probeNetworkCamera(ip: string, port = 554, user = "admin", pass = ""): Promise<DirectProbeResult> {
  return new Promise<DirectProbeResult>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3500);
    const uri = `rtsp://${ip}:${port}/stream1`;

    let serverBanner = "Standard RTSP";
    let isHappytime = false;
    let authType = "None";
    let authRequired = false;
    let authAttempted = false;
    let settled = false;
    let buffer = "";

    const finish = (result: DirectProbeResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const deviceResult = (result: Partial<DirectProbeResult>): DirectProbeResult => ({
      online: true,
      ipAddress: ip,
      rtspPort: port,
      server: serverBanner,
      vendor: isHappytime ? "Trueview / TrueCloud" : "ONVIF / RTSP Device",
      model: isHappytime ? "T18061-W (3MP Wi-Fi Robot)" : "Generic IP Camera",
      authRequired,
      authType,
      streamUrl: `rtsp://${ip}:${port}/stream1`,
      substreamUrl: `rtsp://${ip}:${port}/stream2`,
      capabilities: { ptz: isHappytime, audio: true, motion: true },
      ...result,
    });

    const sendDescribe = (sequence: number, authorization?: string) => {
      socket.write([
        `DESCRIBE ${uri} RTSP/1.0`,
        `CSeq: ${sequence}`,
        "User-Agent: SentinelGrid/2.0",
        "Accept: application/sdp",
        ...(authorization ? [`Authorization: ${authorization}`] : []),
        "",
        "",
      ].join("\r\n"));
    };

    socket.connect(port, ip, () => {
      sendDescribe(1);
    });

    socket.on("data", (data) => {
      buffer += data.toString();
      while (!settled) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd < 0) return;
        const headerBlock = buffer.slice(0, headerEnd);
        const lines = headerBlock.split("\r\n");
        const statusMatch = lines[0]?.match(/^RTSP\/1\.0\s+(\d{3})/i);
        if (!statusMatch) {
          finish({ online: false, ipAddress: ip, error: "Invalid RTSP response" });
          return;
        }
        const headers = new Map<string, string>();
        for (const line of lines.slice(1)) {
          const separator = line.indexOf(":");
          if (separator > 0) headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
        }
        const contentLength = Number(headers.get("content-length") ?? 0);
        const responseLength = headerEnd + 4 + (Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0);
        if (buffer.length < responseLength) return;
        buffer = buffer.slice(responseLength);

        const server = headers.get("server");
        if (server) {
          serverBanner = server;
          isHappytime = server.toLowerCase().includes("happytime");
        }
        const status = Number(statusMatch[1]);
        if (status === 200) {
          finish(deviceResult({ authenticated: true }));
          return;
        }
        if (status === 401) {
          authRequired = true;
          if (authAttempted) {
            finish(deviceResult({ authenticated: false, error: "Invalid camera username or password" }));
            return;
          }
          const challenge = headers.get("www-authenticate") ?? "";
          authType = /^digest\b/i.test(challenge) ? "Digest" : /^basic\b/i.test(challenge) ? "Basic" : "Unsupported";
          const authorization = buildRtspAuthorization(challenge, user, pass, "DESCRIBE", uri);
          if (!authorization) {
            finish(deviceResult({ authenticated: false, error: challenge ? "Camera uses an unsupported RTSP authentication challenge" : "Camera login is required" }));
            return;
          }
          authAttempted = true;
          sendDescribe(2, authorization);
          continue;
        }
        if (status === 403) {
          authRequired = true;
          finish(deviceResult({ authenticated: false, error: "Camera rejected this login" }));
          return;
        }
        finish(deviceResult({
          authenticated: false,
          error: status === 404
            ? "RTSP service responded, but this stream path was not found. Use Branch Gateway discovery to detect the model-specific profile."
            : `RTSP service returned status ${status}`,
        }));
        return;
      }
    });

    socket.on("error", (err) => {
      finish({ online: false, ipAddress: ip, error: err.message });
    });

    socket.on("timeout", () => {
      finish({ online: false, ipAddress: ip, error: "Connection timed out" });
    });

    socket.on("close", () => {
      if (!settled) finish({ online: false, ipAddress: ip, error: "RTSP service closed the connection before verification" });
    });
  });
}

function buildRtspAuthorization(challenge: string, user: string, pass: string, method: string, uri: string) {
  if (/^basic\b/i.test(challenge)) {
    return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  }
  if (!/^digest\b/i.test(challenge)) return undefined;

  const parameter = (name: string) => {
    const match = challenge.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^,\\s]+))`, "i"));
    return match?.[1] ?? match?.[2];
  };
  const realm = parameter("realm");
  const nonce = parameter("nonce");
  if (!realm || !nonce) return undefined;
  const algorithm = (parameter("algorithm") ?? "MD5").toUpperCase();
  if (algorithm !== "MD5" && algorithm !== "MD5-SESS") return undefined;

  const qopOptions = (parameter("qop") ?? "").split(",").map((value) => value.trim().toLowerCase());
  const qop = qopOptions.includes("auth") ? "auth" : undefined;
  const nonceCount = "00000001";
  const cnonce = crypto.randomBytes(8).toString("hex");
  const md5 = (value: string) => crypto.createHash("md5").update(value).digest("hex");
  const initialHa1 = md5(`${user}:${realm}:${pass}`);
  const ha1 = algorithm === "MD5-SESS" ? md5(`${initialHa1}:${nonce}:${cnonce}`) : initialHa1;
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nonceCount}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);
  const quote = (value: string) => value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const opaque = parameter("opaque");
  return [
    `Digest username="${quote(user)}"`,
    `realm="${quote(realm)}"`,
    `nonce="${quote(nonce)}"`,
    `uri="${quote(uri)}"`,
    `response="${response}"`,
    `algorithm=${algorithm}`,
    ...(opaque ? [`opaque="${quote(opaque)}"`] : []),
    ...(qop ? [`qop=${qop}`, `nc=${nonceCount}`, `cnonce="${cnonce}"`] : algorithm === "MD5-SESS" ? [`cnonce="${cnonce}"`] : []),
  ].join(", ");
}

async function probeNetworkCameras(ipAddresses: string[], port: number, user: string, pass: string) {
  const results: DirectProbeResult[] = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < ipAddresses.length) {
      const index = nextIndex++;
      const ipAddress = ipAddresses[index];
      if (!ipAddress) continue;
      results[index] = await probeNetworkCamera(ipAddress, port, user, pass);
    }
  };

  await Promise.all(Array.from({ length: Math.min(16, ipAddresses.length) }, () => worker()));
  return results.filter(Boolean);
}

function isPrivateProbeAddress(value: string) {
  const parts = value.split(".");
  const first = Number(parts[0]);
  const second = Number(parts[1]);
  return first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127);
}

function supportsTargetedVerification(version: string) {
  return supportsAgentVersion(version, targetedVerificationMinimumAgentVersion);
}

function looksLikeRecorderDiscovery(discovered: {
  recorderId?: string;
  sourceType?: string;
  manufacturer?: string;
  model?: string;
  displayName?: string;
}) {
  return Boolean(discovered.recorderId) ||
    discovered.sourceType === "analog-dvr-channel" ||
    discovered.sourceType === "nvr-channel" ||
    /\b(?:dvr|nvr|xvr|recorder)\b/i.test([
      discovered.manufacturer,
      discovered.model,
      discovered.displayName,
    ].filter(Boolean).join(" "));
}

function supportsAgentVersion(version: string, minimumVersion: string) {
  const current = version.match(/^(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number);
  const minimum = minimumVersion.split(".").map(Number);
  if (!current || current.length !== 3) return false;
  for (let index = 0; index < minimum.length; index++) {
    if (current[index]! > minimum[index]!) return true;
    if (current[index]! < minimum[index]!) return false;
  }
  return true;
}
