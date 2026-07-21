import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

const createSchema = z.object({
  incidentNumber: z.string().trim().min(3),
  title: z.string().trim().min(3),
  description: z.string().max(2000).optional(),
  incidentType: z.string().optional(),
  severity: z.string().optional(),
  branchId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().optional(),
});

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), status: z.string().optional() });

export async function registerIncidentsRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  app.post('/v1/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createSchema.parse(request.body);
    const incident = await store.createIncident({
      tenantId: request.currentUser.tenantId,
      incidentNumber: body.incidentNumber,
      title: body.title,
      description: body.description,
      incidentType: body.incidentType,
      severity: body.severity,
      branchId: body.branchId,
      occurredAt: body.occurredAt,
      reportedBy: request.currentUser.id,
    });
    await store.writeAudit({ tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id, action: 'incident.created', resourceNodeId: body.branchId ?? '', outcome: 'success', sourceIp: request.ip, details: { incidentId: incident.id } });
    return reply.code(201).send(incident);
  });

  app.get('/v1/incidents', async (request: FastifyRequest) => {
    const q = listQuery.parse(request.query);
    const incidents = await store.listIncidents(request.currentUser.tenantId, { status: q.status, limit: q.limit });
    return { data: incidents };
  });

  app.get('/v1/incidents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const incident = await store.getIncident(id);
    if (!incident) return reply.code(404).send({ error: 'incident_not_found' });
    return incident;
  });

  app.patch('/v1/incidents/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ status: z.string(), notes: z.string().optional() }).parse(request.body);
    const updated = await store.updateIncidentStatus(id, body.status, request.currentUser.id, body.notes);
    if (!updated) return reply.code(404).send({ error: 'incident_not_found' });
    await store.addIncidentEvent(id, 'status_changed', { status: body.status, notes: body.notes }, request.currentUser.id);
    return updated;
  });

  app.post('/v1/incidents/:id/assign', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ userId: z.string().uuid() }).parse(request.body);
    const updated = await store.assignIncident(id, body.userId);
    if (!updated) return reply.code(404).send({ error: 'incident_not_found' });
    await store.addIncidentEvent(id, 'assigned', { assignedTo: body.userId }, request.currentUser.id);
    return updated;
  });

  app.post('/v1/incidents/:id/video-ranges', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ cameraId: z.string().uuid(), from: z.string().datetime(), to: z.string().datetime() }).parse(request.body);
    const range = await store.addIncidentVideoRange(id, body.cameraId, body.from, body.to);
    if (!range) return reply.code(404).send({ error: 'incident_not_found' });
    await store.addIncidentEvent(id, 'video_range_added', { cameraId: body.cameraId, from: body.from, to: body.to }, request.currentUser.id);
    return reply.code(201).send(range);
  });

  app.get('/v1/incidents/:id/timeline', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const timeline = await store.listIncidentTimeline(id);
    return { data: timeline };
  });
}
