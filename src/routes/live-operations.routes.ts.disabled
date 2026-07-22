import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  hasExtendedInfrastructure,
  type ControlPlaneStore,
} from "../control-plane-store.js";
import type { Action, Camera } from "../domain/models.js";

const cameraParams = z.object({ id: z.string().min(1) });
const incidentParams = z.object({
  id: z.string().min(1),
  incidentId: z.string().min(1),
});
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const bookmarkSchema = z.object({
  bookmarkedAt: z.string().datetime().default(() => new Date().toISOString()),
  reason: z.enum([
    "suspicious-activity",
    "cash-discrepancy",
    "unauthorized-entry",
    "customer-dispute",
    "equipment-failure",
    "safety-incident",
    "other",
  ]),
  notes: z.string().trim().min(3).max(2000).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  recordingSegmentId: z.string().uuid().optional(),
  snapshotReference: z.string().trim().min(3).max(2000).optional(),
});
const incidentSchema = z.object({
  title: z.string().trim().min(3).max(160),
  notes: z.string().trim().min(3).max(2000).optional(),
  priority: z.enum(["P1", "P2", "P3", "P4", "P5"]).default("P3"),
  occurredAt: z.string().datetime().default(() => new Date().toISOString()),
  preRollSeconds: z.number().int().min(0).max(120).default(60),
  postRollSeconds: z.number().int().min(30).max(600).default(300),
});
const incidentStatusSchema = z.object({
  status: z.enum([
    "new",
    "acknowledged",
    "investigating",
    "escalated",
    "resolved",
    "false-alarm",
  ]),
});

export async function registerLiveOperationsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.get("/v1/cameras/:id/bookmarks", async (request, reply) => {
    const { id } = cameraParams.parse(request.params);
    const { limit } = listQuery.parse(request.query);
    const camera = await getAuthorizedCamera(
      request, reply, store, id, "recording:view",
    );
    if (!camera) return;
    return { data: await store.listLiveBookmarks(id, limit) };
  });

  app.post("/v1/cameras/:id/bookmarks", async (request, reply) => {
    const { id } = cameraParams.parse(request.params);
    const body = bookmarkSchema.parse(request.body);
    const camera = await getAuthorizedCamera(request, reply, store, id, "live:view");
    if (!camera) return;
    const bookmark = await store.createLiveBookmark({
      tenantId: request.currentUser.tenantId,
      cameraId: id,
      operatorId: request.currentUser.id,
      ...body,
    });
    await audit(request, store, "live.bookmark_created", camera.nodeId, {
      cameraId: id,
      bookmarkId: bookmark.id,
      reason: bookmark.reason,
      priority: bookmark.priority,
    });
    return reply.code(201).send(bookmark);
  });

  app.get("/v1/cameras/:id/incidents", async (request, reply) => {
    const { id } = cameraParams.parse(request.params);
    const { limit } = listQuery.parse(request.query);
    const camera = await getAuthorizedCamera(request, reply, store, id, "live:view");
    if (!camera) return;
    return { data: await store.listLiveIncidents(id, limit) };
  });

  app.post("/v1/cameras/:id/incidents", async (request, reply) => {
    const { id } = cameraParams.parse(request.params);
    const body = incidentSchema.parse(request.body);
    const camera = await getAuthorizedCamera(
      request, reply, store, id, "alarm:acknowledge",
    );
    if (!camera) return;
    const incident = await store.createLiveIncident({
      tenantId: request.currentUser.tenantId,
      cameraId: id,
      createdBy: request.currentUser.id,
      ...body,
    });
    await audit(request, store, "live.incident_created", camera.nodeId, {
      cameraId: id,
      incidentId: incident.id,
      legalHoldId: incident.legalHoldId,
      priority: incident.priority,
      recordingFrom: incident.recordingFrom,
      recordingTo: incident.recordingTo,
    });
    return reply.code(201).send(incident);
  });

  app.patch("/v1/cameras/:id/incidents/:incidentId", async (request, reply) => {
    const { id, incidentId } = incidentParams.parse(request.params);
    const { status } = incidentStatusSchema.parse(request.body);
    const camera = await getAuthorizedCamera(
      request, reply, store, id, "alarm:acknowledge",
    );
    if (!camera) return;
    const incident = await store.updateLiveIncidentStatus(
      incidentId,
      request.currentUser.tenantId,
      id,
      status,
    );
    if (!incident) return reply.code(404).send({ error: "incident_not_found" });
    await audit(request, store, "live.incident_status_changed", camera.nodeId, {
      cameraId: id,
      incidentId,
      status,
    });
    return incident;
  });
}

async function getAuthorizedCamera(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  cameraId: string,
  action: Action,
): Promise<Camera | undefined> {
  const camera = await store.getCamera(cameraId);
  if (!camera) {
    await reply.code(404).send({ error: "camera_not_found" });
    return undefined;
  }
  const decision = hasExtendedInfrastructure(store)
    ? await store.checkCameraAccess(request.currentUser.id, camera.id, action)
    : await store.checkAccess(request.currentUser, action, camera.nodeId);
  if (!decision?.allowed) {
    const requiresApproval = Boolean(
      decision && "requiresApproval" in decision && decision.requiresApproval,
    );
    await reply.code(403).send({
      error: requiresApproval ? "approval_required" : "forbidden",
      reason: decision?.reason,
    });
    return undefined;
  }
  return camera;
}

async function audit(
  request: FastifyRequest,
  store: ControlPlaneStore,
  action: string,
  resourceNodeId: string,
  details: Record<string, unknown>,
) {
  await store.writeAudit({
    tenantId: request.currentUser.tenantId,
    actorUserId: request.currentUser.id,
    action,
    resourceNodeId,
    outcome: "success",
    sourceIp: request.ip,
    details,
  });
}
