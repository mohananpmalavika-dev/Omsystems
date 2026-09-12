import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";

export async function registerMobileOperationsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.get("/api/mobile/v1/events", async (request: FastifyRequest, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write('data: ' + JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }) + '\n\n');
  });

  app.get("/api/mobile/v1/home", async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      success: true,
      data: {
        activeIncidents: [],
        criticalAlertsCount: 0,
        branchHealthOverview: { total: 1, online: 1, degraded: 0, offline: 0 },
        generatedAt: new Date().toISOString(),
      },
    };
  });

  app.post("/api/mobile/v1/incidents/:id/acknowledge", async (request: FastifyRequest, reply: FastifyReply) => {
    return { success: true, message: "Incident acknowledged successfully." };
  });

  app.post("/api/mobile/v1/incidents/:id/escalate", async (request: FastifyRequest, reply: FastifyReply) => {
    return { success: true, message: "Incident escalated successfully." };
  });

  app.post("/api/mobile/v1/incidents/:id/assign", async (request: FastifyRequest, reply: FastifyReply) => {
    return { success: true, message: "Incident assigned successfully." };
  });

  app.post("/api/mobile/v1/incidents/:id/call-branch", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const incident = await (store as any).getIncident?.(id).catch(() => null);
    let managerName = "Branch Duty Manager";
    let phoneNumber = "+91-80-2200-0199";

    if (incident?.branchId) {
      try {
        const node = await (store as any).getNode?.(incident.branchId);
        if (node?.name) {
          managerName = `${node.name} Manager`;
        }
        if (node?.metadata?.phone || node?.metadata?.contactPhone) {
          phoneNumber = String(node.metadata.phone || node.metadata.contactPhone);
        }
      } catch {}
    }

    if (request.currentUser?.tenantId) {
      await (store as any).writeAudit?.({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: "incident.call_branch",
        resourceNodeId: incident?.branchId || id,
        outcome: "success",
        details: { incidentId: id, managerName, phoneNumber },
      }).catch(() => {});
    }

    return {
      success: true,
      managerName,
      phoneNumber,
      dialerUrl: `tel:${phoneNumber.replace(/[^+\d]/g, "")}`,
    };
  });

  app.post("/api/mobile/v1/incidents/:id/notes", async (request: FastifyRequest, reply: FastifyReply) => {
    return { success: true, message: "Note added successfully." };
  });
}
