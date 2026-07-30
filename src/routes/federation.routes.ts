import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { Action } from "../domain/models.js";
import {
  EmptyFederationLocalSearchProvider,
  type FederationLocalSearchProvider,
  FederationManager,
} from "../federation/manager.js";

const serverRole = z.enum(["global_command_center", "regional_control_center", "backup_server", "edge_server"]);
const heartbeatStatus = z.enum(["online", "degraded", "maintenance"]);
const searchType = z.enum(["vehicle", "face", "object", "incident", "recording"]);
const federationUrl = z.string().url().refine((value) => {
  const parsed = new URL(value);
  return parsed.protocol === "https:"
    || (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname));
}, "Federation endpoints must use HTTPS (HTTP is allowed only for loopback development)");

const registerBody = z.object({
  externalId: z.string().trim().min(3).max(120).regex(/^[a-zA-Z0-9._:-]+$/),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  role: serverRole,
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  region: z.string().trim().min(2).max(120),
  area: z.string().trim().max(120).optional(),
  timezone: z.string().trim().min(1).max(80).default("UTC"),
  baseUrl: federationUrl,
  apiUrl: federationUrl,
  websocketUrl: z.string().url().optional(),
  sharedSecret: z.string().min(32).max(512),
  primaryServerId: z.string().uuid().optional(),
  backupServerId: z.string().uuid().optional(),
  failoverPriority: z.number().int().min(1).max(1000).default(100),
  autoFailoverEnabled: z.boolean().default(true),
  syncEnabled: z.boolean().default(true),
  syncIntervalSeconds: z.number().int().min(5).max(86_400).default(60),
  metadata: z.record(z.unknown()).default({}),
  scopeNodeIds: z.array(z.string().min(1)).max(1000).default([]),
}).superRefine((body, context) => {
  if (body.role === "backup_server" && !body.primaryServerId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["primaryServerId"], message: "Backup servers require a primaryServerId" });
  }
});

const heartbeatBody = z.object({
  status: heartbeatStatus,
  healthScore: z.number().min(0).max(100),
  totalCameras: z.number().int().min(0),
  onlineCameras: z.number().int().min(0),
  totalBranches: z.number().int().min(0),
  storageCapacityGb: z.number().int().min(0).optional(),
  storageUsedGb: z.number().int().min(0).optional(),
  avgResponseTimeMs: z.number().int().min(0).optional(),
  requestsPerMinute: z.number().int().min(0).optional(),
  bandwidthMbps: z.number().int().min(0).optional(),
  cpuUsage: z.number().min(0).max(100).optional(),
  memoryUsage: z.number().min(0).max(100).optional(),
  diskUsage: z.number().min(0).max(100).optional(),
  activeConnections: z.number().int().min(0).optional(),
  errorCount: z.number().int().min(0).optional(),
  warningCount: z.number().int().min(0).optional(),
}).refine((body) => body.onlineCameras <= body.totalCameras, {
  path: ["onlineCameras"], message: "onlineCameras cannot exceed totalCameras",
}).refine((body) => body.storageUsedGb == null || body.storageCapacityGb == null || body.storageUsedGb <= body.storageCapacityGb, {
  path: ["storageUsedGb"], message: "storageUsedGb cannot exceed storageCapacityGb",
});

const searchQuery = z.object({
  type: searchType.default("object"),
  term: z.string().trim().min(1).max(200),
  from: z.string().datetime(),
  to: z.string().datetime(),
  regions: z.string().optional().transform(csv),
  countryCodes: z.string().optional().transform((value) => csv(value)?.map((item) => item.toUpperCase())),
  limit: z.coerce.number().int().min(1).max(500).default(100),
}).refine((query) => new Date(query.from) < new Date(query.to), {
  path: ["to"], message: "to must be after from",
});

const internalSearchBody = z.object({
  tenantId: z.string().min(1),
  query: z.object({
    type: searchType,
    term: z.string().trim().min(1).max(200),
    from: z.string().datetime(),
    to: z.string().datetime(),
    regions: z.array(z.string()).optional(),
    countryCodes: z.array(z.string().length(2)).optional(),
    limit: z.number().int().min(1).max(500),
  }),
});

export async function registerFederationRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  manager: FederationManager,
  options: {
    federationSharedKey?: string;
    localSearchProvider?: FederationLocalSearchProvider;
  } = {},
) {
  const localSearch = options.localSearchProvider ?? new EmptyFederationLocalSearchProvider();

  app.get("/v1/federation/servers", async (request, reply) => {
    if (!(await requireFederationAccess(request, reply, store, "audit:view"))) return;
    const query = z.object({ region: z.string().trim().optional(), countryCode: z.string().length(2).optional() }).parse(request.query);
    return { data: await manager.listServers(request.currentUser.tenantId, {
      ...(query.region ? { region: query.region } : {}),
      ...(query.countryCode ? { countryCode: query.countryCode.toUpperCase() } : {}),
    }) };
  });

  app.post("/v1/federation/register", async (request, reply) => {
    if (!(await requireFederationAccess(request, reply, store, "org:manage"))) return;
    const body = registerBody.parse(request.body);
    const server = await manager.register({
      ...body,
      tenantId: request.currentUser.tenantId,
      createdBy: request.currentUser.id,
    });
    await federationAudit(request, store, "federation.server_registered", { serverId: server.id, externalId: server.externalId });
    return reply.code(201).send(server);
  });

  app.post("/internal/federation/heartbeat", async (request, reply) => {
    const externalId = header(request, "x-federation-server-id");
    const secret = header(request, "x-federation-server-key");
    if (!externalId || !secret) return reply.code(401).send({ error: "invalid_federation_identity" });
    try {
      return await manager.heartbeat(externalId, secret, heartbeatBody.parse(request.body));
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_federation_identity") {
        return reply.code(401).send({ error: error.message });
      }
      throw error;
    }
  });

  const dashboardHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireFederationAccess(request, reply, store, "audit:view"))) return;
    return manager.getDashboard(request.currentUser.tenantId);
  };
  app.get("/v1/federation/dashboard", dashboardHandler);
  app.get("/v1/global/dashboard", dashboardHandler);
  app.get("/v1/federation/health", dashboardHandler);

  app.get("/v1/federation/search", async (request, reply) => {
    if (!(await requireFederationAccess(request, reply, store, "recording:view"))) return;
    const query = searchQuery.parse(request.query);
    const result = await manager.search(request.currentUser.tenantId, query);
    await federationAudit(request, store, "federation.search", {
      type: query.type, term: query.term, searchedServers: result.searchedServers,
      failedServers: result.failedServers, resultCount: result.total,
    });
    return result;
  });

  app.post("/internal/federation/search", async (request, reply) => {
    if (!options.federationSharedKey) return reply.code(503).send({ error: "federation_peer_auth_not_configured" });
    const supplied = header(request, "x-federation-key");
    if (!supplied || !secureEqual(supplied, options.federationSharedKey)) {
      return reply.code(401).send({ error: "invalid_federation_peer" });
    }
    const body = internalSearchBody.parse(request.body);
    return { data: await localSearch.search(body.tenantId, body.query) };
  });

  app.get("/v1/federation/route/:resourceNodeId", async (request, reply) => {
    if (!(await requireFederationAccess(request, reply, store, "live:view"))) return;
    const { resourceNodeId } = z.object({ resourceNodeId: z.string().min(1) }).parse(request.params);
    const decision = await store.checkAccess(request.currentUser, "live:view", resourceNodeId);
    if (!decision?.allowed) return reply.code(decision ? 403 : 404).send({ error: decision ? "forbidden" : "resource_not_found" });
    const server = await manager.resolveServer(request.currentUser.tenantId, resourceNodeId);
    if (!server) return reply.code(404).send({ error: "federation_route_not_found" });
    return { server };
  });

  app.post("/v1/federation/failover", async (request, reply) => {
    if (!(await requireFederationAccess(request, reply, store, "org:manage"))) return;
    const body = z.object({
      failedServerId: z.string().uuid(),
      activeServerId: z.string().uuid(),
      eventType: z.enum(["manual", "planned"]).default("manual"),
      reason: z.string().trim().min(5).max(1000),
    }).parse(request.body);
    try {
      const event = await manager.failover({
        ...body,
        tenantId: request.currentUser.tenantId,
        triggeredBy: request.currentUser.id,
      });
      await federationAudit(request, store, "federation.failover_activated", {
        eventId: event.id, failedServerId: event.failedServerId, activeServerId: event.activeServerId,
      });
      return reply.code(202).send(event);
    } catch (error) {
      if (error instanceof Error && error.message === "federation_server_not_found") {
        return reply.code(404).send({ error: error.message });
      }
      if (error instanceof Error && error.message === "invalid_failover_pair") {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get("/v1/federation/correlations", async (request, reply) => {
    if (!(await requireFederationAccess(request, reply, store, "analytics:view"))) return;
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query);
    return { data: await manager.listCorrelations(request.currentUser.tenantId, limit) };
  });
}

async function requireFederationAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  action: Action,
) {
  const nodes = await store.listAccessibleNodes(request.currentUser, action);
  if (nodes.length > 0) return true;
  await reply.code(403).send({ error: "forbidden" });
  return false;
}

async function federationAudit(
  request: FastifyRequest,
  store: ControlPlaneStore,
  action: string,
  details: Record<string, unknown>,
) {
  await store.writeAudit({
    tenantId: request.currentUser.tenantId,
    actorUserId: request.currentUser.id,
    action,
    resourceNodeId: null,
    outcome: "success",
    sourceIp: request.ip,
    details,
  });
}

function header(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function csv(value: string | undefined) {
  const items = value?.split(",").map((item) => item.trim()).filter(Boolean);
  return items?.length ? [...new Set(items)] : undefined;
}

