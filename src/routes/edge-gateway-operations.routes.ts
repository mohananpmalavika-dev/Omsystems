import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { EdgeUpdateRelease } from "../domain/models.js";
import { edgeUpdatePublicKey, signEdgeUpdateManifest } from "../security/edge-update-signing.js";
import { sealEdgeCommandPayload } from "../security/edge-command-envelope.js";
import type { ManagedEdgeTunnelProvider } from "../platform/managed-edge-tunnel.js";
import { autoProvisionVerifiedCameras } from "../services/camera-auto-provision.js";
import {
  ensureManagedEdgeTunnel,
  managedGatewayMediaBootstrap,
} from "../services/managed-edge-tunnel.js";

const branchAgentParams = z.object({ branchId: z.string().min(1), id: z.string().min(1) });
const agentParams = z.object({ id: z.string().min(1) });
const commandParams = z.object({ id: z.string().min(1), commandId: z.string().min(1) });
const commandTypes = [
  "rediscover", "restart-media", "restart-agent", "probe-camera",
  "recover-camera", "probe-recorder", "collect-logs", "apply-update",
] as const;
const patchRuntimeMinimumVersion = "0.1.16";

function normalizeCameraIp(value: string) {
  const input = value.trim();
  if (!input) return "";
  try {
    const parsed = input.includes("://") ? new URL(input) : new URL(`rtsp://${input}`);
    return parsed.hostname;
  } catch {
    return input.split(/[/?#]/, 1)[0]?.replace(/:\d+$/, "") ?? "";
  }
}

export async function registerEdgeGatewayOperationsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  options: {
    controlPlanePublicUrl?: string;
    updateSigningPrivateKey?: string;
    artifactRoot?: string;
    tunnelProvider?: ManagedEdgeTunnelProvider;
    requireManagedTunnel?: boolean;
  } = {},
) {
  const updateForAgent = async (edgeAgentId: string, currentVersion: string) => {
    const assigned = await store.getEdgeUpdateReleaseForAgent(edgeAgentId, currentVersion);
    if (assigned && compareVersions(assigned.version, currentVersion) > 0) return assigned;
    return packagedEdgeUpdate(options, currentVersion);
  };
  app.post("/v1/branches/:branchId/edge-activations", async (request, reply) => {
    const { branchId } = z.object({ branchId: z.string().min(1) }).parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const body = z.object({
      agentName: z.string().trim().min(2).max(120).default("Sentinel Branch Gateway"),
      ttlMinutes: z.number().int().min(5).max(1440).default(60),
    }).parse(request.body ?? {});
    if (options.requireManagedTunnel && !options.tunnelProvider) {
      return reply.code(503).send({
        error: "managed_tunnel_not_configured",
        message: "Configure the Cloudflare account, zone, API token, and media domain before enrolling production gateways.",
      });
    }
    let tunnel = await store.getEdgeManagedTunnel(branchId);
    if (options.tunnelProvider && (!tunnel || tunnel.status === "revoked")) {
      try {
        const branch = await store.getNode(branchId);
        if (!branch) return reply.code(404).send({ error: "branch_not_found" });
        tunnel = await ensureManagedEdgeTunnel(store, options.tunnelProvider, branch);
      } catch (error) {
        app.log.error({ err: error, branchId }, "Managed branch tunnel provisioning failed");
        return reply.code(502).send({ error: "managed_tunnel_provisioning_failed" });
      }
    }
    const activationCode = `sgact_${randomBytes(32).toString("base64url")}`;
    const activation = await store.createEdgeActivation({
      branchId, agentName: body.agentName, createdBy: request.currentUser.id,
      expiresAt: new Date(Date.now() + body.ttlMinutes * 60_000).toISOString(),
      tokenHash: hashSecret(activationCode),
    });
    await writeGatewayAudit(request, store, branchId, "edge_gateway.activation_created", {
      activationId: activation.id, expiresAt: activation.expiresAt,
    });
    return reply.code(201).header("cache-control", "no-store").send({
      ...activation,
      activationCode,
      bootstrap: {
        controlPlaneUrl: options.controlPlanePublicUrl ?? "",
        message: "This one-time code is shown once and is consumed automatically by the gateway.",
        media: tunnel ? {
          managed: true,
          mode: "named",
          publicUrl: `https://${tunnel.hostname}`,
          tunnelStatus: tunnel.status,
          credentialsDeliveredTo: "gateway-only",
        } : {
          managed: false,
          mode: "disabled",
          tunnelStatus: "not-configured",
        },
      },
    });
  });

  app.post("/v1/edge-enrollment/activate", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      activationCode: z.string().startsWith("sgact_").min(40).max(200),
      deviceUuid: z.string().uuid(),
      version: z.string().trim().min(1).max(40),
      commandPublicKey: z.string().includes("BEGIN PUBLIC KEY").max(8_000).optional(),
    }).parse(request.body);
    const credential = `sggw_${randomBytes(32).toString("base64url")}`;
    try {
      const enrollment = await store.activateEdgeAgent({
        tokenHash: hashSecret(body.activationCode), credentialHash: hashSecret(credential),
        deviceUuid: body.deviceUuid, version: body.version, commandPublicKey: body.commandPublicKey,
      });
      const media = await managedGatewayMediaBootstrap(
        store,
        options.tunnelProvider,
        enrollment.agent.branchId,
      ).catch((error) => {
        app.log.error({ err: error, branchId: enrollment.agent.branchId }, "Gateway media bootstrap delivery failed");
        return undefined;
      });
      await store.writeAudit({
        tenantId: enrollment.tenantId, actorUserId: null, action: "edge_gateway.activated",
        resourceNodeId: enrollment.agent.branchId, outcome: "success", sourceIp: request.ip,
        details: { edgeAgentId: enrollment.agent.id, deviceUuid: body.deviceUuid, version: body.version },
      });
      return reply.code(201).header("cache-control", "no-store").send({
        agentId: enrollment.agent.id,
        branchId: enrollment.agent.branchId,
        agentName: enrollment.agent.name,
        credential,
        ...(media ? { media } : {}),
        ...(options.updateSigningPrivateKey
          ? { updatePublicKey: edgeUpdatePublicKey(options.updateSigningPrivateKey) }
          : {}),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "activation_failed";
      if (code === "activation_invalid_or_expired") return reply.code(401).send({ error: code });
      if (code === "device_already_enrolled") return reply.code(409).send({ error: code });
      throw error;
    }
  });

  app.post("/v1/branches/:branchId/edge-agents/:id/revoke", async (request, reply) => {
    const { branchId, id } = branchAgentParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const agent = (await store.listEdgeAgentsByBranch(branchId)).find((item) => item.id === id);
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    const revoked = await store.revokeEdgeAgentCredential(id);
    const tunnel = await store.getEdgeManagedTunnel(branchId);
    if (tunnel && options.tunnelProvider) {
      await options.tunnelProvider.revoke(tunnel.providerTunnelId, tunnel.hostname);
      await store.updateEdgeManagedTunnelStatus(branchId, "revoked");
    }
    await writeGatewayAudit(request, store, branchId, "edge_gateway.credential_revoked", { edgeAgentId: id });
    return revoked;
  });

  /**
   * Revoke a pending edge activation
   * Keeps the activation record for auditability while marking it inactive.
   */
  app.delete("/v1/branches/:branchId/edge-activations/:id", async (request, reply) => {
    const { branchId, id } = branchAgentParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    
    try {
      const result = await (store as any).pool.query(
        `UPDATE edge_activations
         SET revoked_at = now()
         WHERE id = $1 AND branch_id = $2 AND consumed_at IS NULL AND revoked_at IS NULL
         RETURNING id`,
        [id, branchId]
      );
      
      if (result.rowCount === 0) {
        return reply.code(404).send({ 
          error: "activation_not_found",
          message: "Activation not found, already consumed, or already revoked"
        });
      }
      
      await writeGatewayAudit(request, store, branchId, "edge_gateway.activation_revoked", { activationId: id });
      return reply.code(204).send();
    } catch (error) {
      app.log.error({ err: error, activationId: id }, "Failed to revoke edge activation");
      return reply.code(500).send({ 
        error: "activation_delete_failed",
        message: error instanceof Error ? error.message : "Failed to revoke activation"
      });
    }
  });

  /**
   * Revoke gateway endpoint (inactive-only semantics)
   * Provides DELETE /v1/edge-agents/:id for gateway deactivation
   */
  app.delete("/v1/edge-agents/:id", async (request, reply) => {
    const { id } = agentParams.parse(request.params);
    
    try {
      // Get the agent to find its branch
      const agent = await store.getEdgeAgent(id);
      
      if (!agent) {
        return reply.code(404).send({ 
          error: "edge_agent_not_found",
          message: "Gateway not found" 
        });
      }
      
      // Check permissions
      if (!(await requireDeviceAccess(request, reply, store, agent.branchId))) {
        return;
      }
      
      // Revocation is the durable state change. The gateway remains in the
      // audit history, but it can no longer authenticate to the control plane.
      const revoked = await store.revokeEdgeAgentCredential(id);
      if (!revoked) {
        return reply.code(404).send({
          error: "edge_agent_not_found",
          message: "Gateway not found",
        });
      }
      
      // Tunnel cleanup is ancillary. Once the credential is revoked, a
      // cleanup outage must not turn a successful removal into a misleading
      // 500 response that encourages the operator to retry it.
      try {
        const tunnel = await store.getEdgeManagedTunnel(agent.branchId);
        if (tunnel && options.tunnelProvider) {
          await options.tunnelProvider.revoke(tunnel.providerTunnelId, tunnel.hostname);
          await store.updateEdgeManagedTunnelStatus(agent.branchId, "revoked");
        }
      } catch (err) {
        app.log.error({ err, agentId: id }, "Failed to clean up managed gateway tunnel");
      }
      
      try {
        await writeGatewayAudit(request, store, agent.branchId, "edge_gateway.deleted", {
          edgeAgentId: id,
          gatewayName: agent.name,
          deviceUuid: agent.deviceUuid,
        });
      } catch (err) {
        app.log.error({ err, agentId: id }, "Failed to write gateway removal audit event");
      }
      
      return reply.code(204).send();
      
    } catch (error) {
      app.log.error({ err: error, agentId: id }, "Failed to delete gateway");
      
      return reply.code(500).send({
        error: "gateway_delete_failed",
        message: error instanceof Error ? error.message : "Failed to delete gateway",
        details: {
          agentId: id,
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  app.get("/v1/edge-agents/:id/bootstrap", async (request, reply) => {
    const { id } = agentParams.parse(request.params);
    const agent = await store.getEdgeAgent(id);
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    const media = await managedGatewayMediaBootstrap(store, options.tunnelProvider, agent.branchId);
    return reply.header("cache-control", "no-store").send({
      controlPlaneUrl: options.controlPlanePublicUrl ?? "",
      ...(media ? { media } : {}),
    });
  });

  app.post("/v1/branches/:branchId/edge-agents/:id/camera-credentials", async (request, reply) => {
    const { branchId, id } = branchAgentParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const agent = (await store.listEdgeAgentsByBranch(branchId)).find((item) => item.id === id);
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    const parsedBody = z.object({
      username: z.string().trim().min(1).max(128),
      password: z.string().max(1_024).nullable().transform((value) => value ?? ""),
      cameraIp: z.string().trim().transform(normalizeCameraIp).refine((value) => isIP(value) > 0, "Invalid camera or recorder IP address"),
      cameraId: z.string().min(1).optional(),
      channel: z.number().int().positive().optional(),
      recorderId: z.string().min(1).optional(),
    }).safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "invalid_camera_credential_request",
        message: "A username and one camera or recorder IP address are required; password may be null for passwordless devices.",
      });
    }
    const body = parsedBody.data;
    if (body.cameraId) {
      const camera = await store.getCamera(body.cameraId);
      if (!camera || camera.branchId !== branchId || (camera.edgeAgentId && camera.edgeAgentId !== id)) {
        return reply.code(404).send({ error: "camera_not_found", message: "The selected device is not assigned to this branch gateway." });
      }
      if (camera.ipAddress && normalizeCameraIp(camera.ipAddress) !== body.cameraIp) {
        return reply.code(409).send({ error: "camera_identity_mismatch", message: "The selected device number does not match its saved IP address." });
      }
    }
    const commandPublicKey = await store.getEdgeAgentCommandPublicKey(id);
    if (!commandPublicKey) {
      return reply.code(409).send({
        error: "gateway_secure_command_key_missing",
        message: "Re-enroll this legacy gateway before sending camera credentials.",
      });
    }
    const envelope = sealEdgeCommandPayload({
      username: body.username,
      password: body.password,
      scope: { host: body.cameraIp },
      issuedAt: new Date().toISOString(),
    }, commandPublicKey);
    const command = await store.createEdgeCommand({
      edgeAgentId: id,
      type: "update-credentials",
      payload: { envelope, target: {
        ipAddress: body.cameraIp,
        ...(body.cameraId ? { cameraId: body.cameraId } : {}),
        ...(body.channel ? { channel: body.channel } : {}),
        ...(body.recorderId ? { recorderId: body.recorderId } : {}),
      } },
      requestedBy: request.currentUser.id,
    });
    await writeGatewayAudit(request, store, branchId, "edge_gateway.camera_credentials_requested", {
      edgeAgentId: id,
      commandId: command.id,
      scope: "single-camera",
    });
    return reply.code(202).send({
      commandId: command.id,
      status: command.status,
      scope: "single-camera",
      message: "Credentials were encrypted for this gateway and queued only for this camera or recorder.",
    });
  });

  app.post("/v1/branches/:branchId/edge-agents/:id/commands", async (request, reply) => {
    const { branchId, id } = branchAgentParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const agent = (await store.listEdgeAgentsByBranch(branchId)).find((item) => item.id === id);
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    const body = z.object({
      type: z.enum(commandTypes),
      payload: z.record(z.unknown()).default({}),
    }).parse(request.body);
    const sensitiveKey = sensitiveCommandPayloadKey(body.payload);
    if (sensitiveKey) return reply.code(400).send({ error: "sensitive_command_payload_forbidden", key: sensitiveKey });
    if (Buffer.byteLength(JSON.stringify(body.payload)) > 16_384) {
      return reply.code(413).send({ error: "command_payload_too_large" });
    }
    if (body.type === "apply-update") {
      if (compareVersions(agent.version, patchRuntimeMinimumVersion) < 0) {
        return reply.code(409).send({
          error: "edge_patch_base_required",
          message: `Install the v${patchRuntimeMinimumVersion} full Repair package once. Later releases can use patch-only updates.`,
        });
      }
      const release = await updateForAgent(id, agent.version);
      if (!release) {
        return reply.code(409).send({
          error: "edge_update_not_available",
          message: `No application patch is available for scanner v${agent.version}.`,
        });
      }
    }
    const command = await store.createEdgeCommand({
      edgeAgentId: id, type: body.type, payload: body.payload, requestedBy: request.currentUser.id,
    });
    await writeGatewayAudit(request, store, branchId, "edge_gateway.command_requested", {
      edgeAgentId: id, commandId: command.id, commandType: command.type,
    });
    return reply.code(202).send(command);
  });

  app.post("/v1/branches/:branchId/cameras/:cameraId/recovery", async (request, reply) => {
    const { branchId, cameraId } = z.object({ branchId: z.string().min(1), cameraId: z.string().min(1) }).parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const camera = await store.getCamera(cameraId);
    if (!camera || camera.branchId !== branchId) return reply.code(404).send({ error: "camera_not_found" });
    if (!camera.edgeAgentId) {
      return reply.code(409).send({
        error: "camera_recovery_requires_edge_agent",
        message: "Assign this camera to an online Branch Gateway before requesting automatic recovery.",
      });
    }
    const agent = await store.getEdgeAgent(camera.edgeAgentId);
    if (!agent || agent.branchId !== branchId || agent.status !== "online") {
      return reply.code(409).send({
        error: "edge_agent_not_connected",
        message: "The Branch Gateway that can reach this camera is not online.",
      });
    }
    const command = await store.createEdgeCommand({
      edgeAgentId: agent.id,
      type: "recover-camera",
      payload: { cameraId },
      requestedBy: request.currentUser.id,
    });
    await writeGatewayAudit(request, store, branchId, "edge_gateway.camera_recovery_requested", {
      edgeAgentId: agent.id,
      cameraId,
      commandId: command.id,
    });
    return reply.code(202).send(command);
  });

  app.get("/v1/branches/:branchId/edge-commands", async (request, reply) => {
    const { branchId } = z.object({ branchId: z.string().min(1) }).parse(request.params);
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(request.query);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    return { data: await store.listEdgeCommands(branchId, limit) };
  });

  app.get("/v1/edge-agents/:id/commands/next", async (request) => {
    const { id } = agentParams.parse(request.params);
    return await store.claimEdgeCommand(id) ?? null;
  });

  app.post("/v1/edge-agents/:id/commands/:commandId/complete", async (request, reply) => {
    const { id, commandId } = commandParams.parse(request.params);
    const body = z.object({
      status: z.enum(["succeeded", "failed"]),
      result: z.record(z.unknown()).optional(),
      error: z.string().trim().max(2_000).optional(),
    }).parse(request.body);
    const completed = await store.completeEdgeCommand(id, commandId, {
      status: body.status!,
      ...(body.result ? { result: body.result } : {}),
      ...(body.error ? { error: body.error } : {}),
    });
    if (!completed) return reply.code(404).send({ error: "edge_command_not_found" });
    let activation: Awaited<ReturnType<typeof autoProvisionVerifiedCameras>> | undefined;
    let activationError: string | undefined;
    if (completed.type === "update-credentials" && completed.status === "succeeded") {
      try {
        const target = completed.payload.target as { ipAddress?: unknown } | undefined;
        const targetIpAddress = typeof target?.ipAddress === "string" ? target.ipAddress : undefined;
        activation = await autoProvisionVerifiedCameras(store, completed.branchId, {
          edgeAgentId: id,
          ...(targetIpAddress ? { ipAddresses: [targetIpAddress] } : {}),
        });
      } catch (error) {
        activationError = error instanceof Error ? error.message : String(error);
      }
    }
    await store.writeAudit({
      tenantId: completed.tenantId, actorUserId: null, action: "edge_gateway.command_completed",
      resourceNodeId: completed.branchId, outcome: completed.status === "succeeded" ? "success" : "failure",
      sourceIp: request.ip, details: {
        edgeAgentId: id, commandId, commandType: completed.type,
        ...(completed.error ? { error: completed.error } : {}),
        ...(activation ? {
          provisionedCount: activation.summary.provisioned,
          credentialsRequiredCount: activation.summary.credentialsRequired,
          pendingVerificationCount: activation.summary.pendingVerification,
        } : {}),
        ...(activationError ? { activationError } : {}),
      },
    });
    return {
      ...completed,
      ...(activation ? { activation } : {}),
      ...(activationError ? { activationError } : {}),
    };
  });

  app.post("/v1/edge-updates/releases", async (request, reply) => {
    const companies = await store.listAccessibleNodes(request.currentUser, "device:configure", "company");
    if (companies.length === 0) return reply.code(403).send({ error: "forbidden" });
    if (!options.updateSigningPrivateKey) {
      return reply.code(503).send({ error: "edge_update_signing_not_configured" });
    }
    const body = z.object({
      version: z.string().trim().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
      artifactUrl: z.string().url(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      notes: z.string().trim().max(5_000).default(""),
      rolloutPercentage: z.number().int().min(0).max(100).default(0),
      enabled: z.boolean().default(false),
    }).parse(request.body);
    const manifest = {
      version: body.version!, artifactUrl: body.artifactUrl!, sha256: body.sha256!, notes: body.notes!,
    };
    const signature = signEdgeUpdateManifest(manifest, options.updateSigningPrivateKey);
    const release = await store.createEdgeUpdateRelease({
      ...manifest, signature, createdBy: request.currentUser.id,
      rolloutPercentage: body.rolloutPercentage!, enabled: body.enabled!,
    });
    for (const company of companies) {
      await writeGatewayAudit(request, store, company.id, "edge_gateway.update_release_created", {
        releaseId: release.id, version: release.version, rolloutPercentage: release.rolloutPercentage,
      });
    }
    return reply.code(201).send(release);
  });

  app.get("/v1/edge-agents/:id/updates/next", async (request) => {
    const { id } = agentParams.parse(request.params);
    const { version } = z.object({ version: z.string().min(1).max(40) }).parse(request.query);
    return await updateForAgent(id, version) ?? null;
  });
}

async function packagedEdgeUpdate(
  options: { controlPlanePublicUrl?: string; updateSigningPrivateKey?: string; artifactRoot?: string },
  currentVersion: string,
): Promise<EdgeUpdateRelease | undefined> {
  if (!options.controlPlanePublicUrl || !options.updateSigningPrivateKey) return undefined;
  const root = await findEdgeAgentRoot(options.artifactRoot);
  if (!root) return undefined;
  try {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version?: string };
    const version = packageJson.version;
    if (!version || compareVersions(version, currentVersion) <= 0) return undefined;
    const artifactPath = join(root, "release", "updates", version, "edge-agent.bundle");
    const [artifact, metadata] = await Promise.all([readFile(artifactPath), stat(artifactPath)]);
    if (!metadata.isFile() || artifact.length <= 0) return undefined;
    const sha256 = createHash("sha256").update(artifact).digest("hex");
    const baseUrl = options.controlPlanePublicUrl.replace(/\/+$/, "");
    const artifactUrl = `${baseUrl}/v1/edge-updates/artifacts/${encodeURIComponent(version)}/edge-agent.bundle`;
    const notes = `Sentinel Grid Edge Agent application patch v${version}`;
    const signature = signEdgeUpdateManifest({ version, artifactUrl, sha256, notes }, options.updateSigningPrivateKey);
    return {
      id: `packaged-${version}-${sha256.slice(0, 12)}`,
      version,
      artifactUrl,
      sha256,
      signature,
      notes,
      rolloutPercentage: 100,
      enabled: true,
      createdBy: "packaged-release",
      createdAt: metadata.mtime.toISOString(),
    };
  } catch {
    return undefined;
  }
}

async function findEdgeAgentRoot(preferredRoot?: string) {
  const routeDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    ...(preferredRoot ? [preferredRoot] : []),
    join(process.cwd(), "edge-agent"),
    join(routeDirectory, "..", "..", "edge-agent"),
    join(routeDirectory, "..", "..", "..", "edge-agent"),
  ];
  for (const candidate of candidates) {
    try {
      if ((await stat(join(candidate, "package.json"))).isFile()) return candidate;
    } catch {
      // Try the next source or production layout.
    }
  }
  return undefined;
}

function compareVersions(left: string, right: string) {
  const parse = (value: string) => value.split(/[.+-]/, 3).map((part) => Number.parseInt(part, 10) || 0);
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.localeCompare(right);
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sensitiveCommandPayloadKey(payload: Record<string, unknown>) {
  return Object.keys(payload).find((key) => /password|secret|token|credential|private.?key/i.test(key));
}

async function requireDeviceAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  branchId: string,
) {
  const decision = await store.checkAccess(request.currentUser, "device:configure", branchId);
  if (!decision) { await reply.code(404).send({ error: "resource_not_found" }); return false; }
  if (!decision.allowed) { await reply.code(403).send({ error: "forbidden", reason: decision.reason }); return false; }
  return true;
}

async function writeGatewayAudit(
  request: FastifyRequest,
  store: ControlPlaneStore,
  branchId: string,
  action: string,
  details: Record<string, unknown>,
) {
  const branch = await store.getNode(branchId);
  if (!branch) return;
  await store.writeAudit({
    tenantId: branch.tenantId, actorUserId: request.currentUser.id, action,
    resourceNodeId: branchId, outcome: "success", sourceIp: request.ip, details,
  });
}
