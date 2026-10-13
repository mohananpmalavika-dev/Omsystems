import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { MobileWorkflowService, MobileWorkflowError } from "../mobile/services/mobile-workflow.service.js";

const idSchema = z.object({ id: z.string().min(1).max(200) });
const acknowledgeSchema = z.object({ deviceId: z.string().max(500).optional() });
const escalateSchema = z.object({ reason: z.string().trim().min(10).max(1000), recipients: z.array(z.string().email()).max(50).default([]) });
const assignSchema = z.object({ userId: z.string().min(1).max(200) });
const structuredNotes = {
  FALSE_ALARM: "Operator reports a false alarm.", BRANCH_CONTACTED: "Operator reports branch contact.",
  POLICE_CONTACTED: "Operator reports emergency-service contact.", SECURITY_DISPATCHED: "Operator reports security dispatch.",
  MAINTENANCE_ACTIVITY: "Operator reports maintenance activity.", PERSON_CONFIRMED: "Operator reports a confirmed person.",
  CAMERA_FAILURE: "Operator reports a camera failure.",
} as const;
const noteSchema = z.object({
  noteType: z.enum(["CUSTOM_NOTE", ...Object.keys(structuredNotes)] as [string, ...string[]]).default("CUSTOM_NOTE"),
  text: z.string().trim().max(5000).optional(), content: z.string().trim().max(5000).optional(),
}).transform(body => ({ content: [structuredNotes[body.noteType as keyof typeof structuredNotes], body.text ?? body.content].filter(Boolean).join(" ") }))
  .refine(body => body.content.length > 0 && body.content.length <= 5000, "A note is required.");

export async function registerMobileOperationsRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  const workflow = new MobileWorkflowService(store);
  const streams = new Set<Readable>();
  app.addHook("onClose", async () => { for (const stream of streams) stream.destroy(); });
  function fail(request: FastifyRequest, reply: FastifyReply, error: unknown) {
    if (error instanceof MobileWorkflowError) return reply.code(error.statusCode).send({ success: false, error: error.code, message: error.code });
    if (error instanceof z.ZodError) return reply.code(400).send({ success: false, error: "invalid_mobile_request", message: "Check the submitted fields." });
    request.log.error({ err: error }, "Mobile operation failed");
    return reply.code(503).send({ success: false, error: "mobile_operation_unavailable", message: "Operation could not be confirmed. Refresh before retrying." });
  }

  app.get("/api/mobile/v1/home", async (request, reply) => {
    reply.header("cache-control", "no-store");
    try {
      const user = await workflow.activeUser(request.currentUser);
      return { success: true, data: await workflow.home(user) };
    } catch (error) { return fail(request, reply, error); }
  });

  for (const operation of ["acknowledge", "escalate", "assign", "notes"] as const) {
    app.post(`/api/mobile/v1/incidents/:id/${operation}`, async (request, reply) => {
      reply.header("cache-control", "no-store");
      try {
        const user = await workflow.activeUser(request.currentUser);
        const { id } = idSchema.parse(request.params);
        const schema = operation === "acknowledge" ? acknowledgeSchema : operation === "escalate" ? escalateSchema : operation === "assign" ? assignSchema : noteSchema;
        const body = schema.parse(request.body ?? {});
        return await workflow.mutate(user, id, operation, body, request.ip);
      } catch (error) { return fail(request, reply, error); }
    });
  }

  app.post("/api/mobile/v1/incidents/:id/call-branch", async (request, reply) => {
    reply.header("cache-control", "no-store");
    try {
      const user = await workflow.activeUser(request.currentUser);
      return await workflow.contact(user, idSchema.parse(request.params).id, request.ip);
    } catch (error) { return fail(request, reply, error); }
  });

  // Scoped snapshot reconciliation survives reconnects and works across API replicas.
  // This is not a durable replay of every historical alert event.
  app.get("/api/mobile/v1/events", async (request, reply) => {
    try {
      let user = await workflow.activeUser(request.currentUser);
      const initial = await workflow.list(user);
      let signature = JSON.stringify(initial.records.map(incident => [incident.id, incident.updatedAt, incident.status, incident.assignedTo]));
      const stream = new Readable({ read() {} });
      streams.add(stream);
      let stopped = false, running = false;
      const send = (type: string, payload: unknown) => {
        if (!stream.destroyed) {
          if (stream.readableLength > 64 * 1024) { stream.destroy(); return; }
          stream.push(`id: ${randomUUID()}\nevent: ${type}\ndata: ${JSON.stringify({ type, payload, timestamp: new Date().toISOString() })}\n\n`);
        }
      };
      send("HEARTBEAT", {});
      send("RECONCILE", { countsComplete: initial.countsComplete });
      // Reconnect periodically so the normal authentication hook revalidates session expiry/revocation.
      const lease = setTimeout(() => { stream.push(null); }, 60_000);
      lease.unref();
      const timer = setInterval(async () => {
        if (stopped || running) return;
        running = true;
        try {
          user = await workflow.activeUser(user);
          const current = await workflow.list(user);
          const next = JSON.stringify(current.records.map(incident => [incident.id, incident.updatedAt, incident.status, incident.assignedTo]));
          if (next !== signature) { send("INCIDENT_UPDATED", { reconcile: true, countsComplete: current.countsComplete }); signature = next; }
          send("HEARTBEAT", {});
        } catch (error) {
          send("UNAVAILABLE", { error: error instanceof MobileWorkflowError ? error.code : "mobile_events_unavailable" });
          stream.push(null);
        } finally { running = false; }
      }, 15_000);
      timer.unref();
      const cleanup = () => { if (stopped) return; stopped = true; clearInterval(timer); clearTimeout(lease); streams.delete(stream); stream.destroy(); };
      stream.on("close", cleanup);
      reply.raw.on("close", cleanup);
      return reply.header("content-type", "text/event-stream; charset=utf-8")
        .header("cache-control", "no-cache, no-transform").header("x-accel-buffering", "no").send(stream);
    } catch (error) { return fail(request, reply, error); }
  });
}
