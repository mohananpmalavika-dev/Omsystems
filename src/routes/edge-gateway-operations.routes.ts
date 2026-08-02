import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { edgeUpdatePublicKey, signEdgeUpdateManifest } from "../security/edge-update-signing.js";
import { sealEdgeCommandPayload } from "../security/edge-command-envelope.js";

const branchAgentParams = z.object({ branchId: z.string().min(1), id: z.string().min(1) });
const agentParams = z.object({ id: z.string().min(1) });
const commandParams = z.object({ id: z.string().min(1), commandId: z.string().min(1) });
const commandTypes = [
  "rediscover", "restart-media", "restart-agent", "probe-camera",
  "probe-recorder", "collect-logs", "apply-update",
] as const;

export async function registerEdgeGatewayOperationsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  options: { controlPlanePublicUrl?: string; updateSigningPrivateKey?: string } = {},
) {
  app.post("/v1/branches/:branchId/edge-activations", async (request, reply) => {
    const { branchId } = z.object({ branchId: z.string().min(1) }).parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const body = z.object({
      agentName: z.string().trim().min(2).max(120).default("Sentinel Branch Gateway"),
      ttlMinutes: z.number().int().min(5).max(1440).default(60),
    }).parse(request.body ?? {});
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
    await writeGatewayAudit(request, store, branchId, "edge_gateway.credential_revoked", { edgeAgentId: id });
    return revoked;
  });

  app.post("/v1/branches/:branchId/edge-agents/:id/camera-credentials", async (request, reply) => {
    const { branchId, id } = branchAgentParams.parse(request.params);
    if (!(await requireDeviceAccess(request, reply, store, branchId))) return;
    const agent = (await store.listEdgeAgentsByBranch(branchId)).find((item) => item.id === id);
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    const body = z.object({
      username: z.string().trim().min(1).max(128),
      password: z.string().max(1_024),
      cameraIp: z.string().ip().optional(),
    }).parse(request.body);
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
      scope: body.cameraIp ? { host: body.cameraIp } : { default: true },
      issuedAt: new Date().toISOString(),
    }, commandPublicKey);
    const command = await store.createEdgeCommand({
      edgeAgentId: id,
      type: "update-credentials",
      payload: { envelope },
      requestedBy: request.currentUser.id,
    });
    await writeGatewayAudit(request, store, branchId, "edge_gateway.camera_credentials_requested", {
      edgeAgentId: id,
      commandId: command.id,
      scope: body.cameraIp ? "single-camera" : "branch-default",
    });
    return reply.code(202).send({
      commandId: command.id,
      status: command.status,
      scope: body.cameraIp ? "single-camera" : "branch-default",
      message: "Credentials were encrypted for this gateway and queued for delivery.",
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
    const command = await store.createEdgeCommand({
      edgeAgentId: id, type: body.type, payload: body.payload, requestedBy: request.currentUser.id,
    });
    await writeGatewayAudit(request, store, branchId, "edge_gateway.command_requested", {
      edgeAgentId: id, commandId: command.id, commandType: command.type,
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
    await store.writeAudit({
      tenantId: completed.tenantId, actorUserId: null, action: "edge_gateway.command_completed",
      resourceNodeId: completed.branchId, outcome: completed.status === "succeeded" ? "success" : "failure",
      sourceIp: request.ip, details: {
        edgeAgentId: id, commandId, commandType: completed.type,
        ...(completed.error ? { error: completed.error } : {}),
      },
    });
    return completed;
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
    return await store.getEdgeUpdateReleaseForAgent(id, version) ?? null;
  });
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
