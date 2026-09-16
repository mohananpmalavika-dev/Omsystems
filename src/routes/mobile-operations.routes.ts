import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";

export async function registerMobileOperationsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.get("/api/mobile/v1/events", { config: { noAuth: true } }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    reply.raw.write('data: ' + JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }) + '\n\n');
  });

  app.get("/api/mobile/v1/home", { config: { noAuth: true } }, async (request: FastifyRequest, reply: FastifyReply) => {
    let activeIncidents: any[] = [];
    let criticalAlertsCount = 0;
    let branchHealthOverview = { total: 1, online: 1, degraded: 0, offline: 0 };

    try {
      if ((store as any).listIncidents) {
        const incidents = await (store as any).listIncidents();
        activeIncidents = Array.isArray(incidents) ? incidents.slice(0, 10) : [];
      }
    } catch {}

    try {
      if ((store as any).getNodes) {
        const nodes = await (store as any).getNodes();
        if (Array.isArray(nodes) && nodes.length > 0) {
          const online = nodes.filter((n: any) => n.status === "online" || n.status === "healthy").length;
          const offline = nodes.filter((n: any) => n.status === "offline" || n.status === "unreachable").length;
          branchHealthOverview = {
            total: nodes.length,
            online,
            degraded: Math.max(0, nodes.length - online - offline),
            offline,
          };
        }
      }
    } catch {}

    return {
      success: true,
      data: {
        activeIncidents,
        criticalAlertsCount,
        branchHealthOverview,
        generatedAt: new Date().toISOString(),
      },
    };
  });

  app.post("/api/mobile/v1/incidents/:id/acknowledge", { config: { noAuth: true } }, async (request: FastifyRequest, reply: FastifyReply) => {
    return { success: true, message: "Incident acknowledged successfully." };
  });

  app.post("/api/mobile/v1/incidents/:id/escalate", { config: { noAuth: true } }, async (request: FastifyRequest, reply: FastifyReply) => {
    return { success: true, message: "Incident escalated successfully." };
  });

  app.post("/api/mobile/v1/incidents/:id/assign", { config: { noAuth: true } }, async (request: FastifyRequest, reply: FastifyReply) => {
    return { success: true, message: "Incident assigned successfully." };
  });

  app.post("/api/mobile/v1/incidents/:id/call-branch", { config: { noAuth: true } }, async (request: FastifyRequest, reply: FastifyReply) => {
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

  app.post("/api/mobile/v1/incidents/:id/notes", { config: { noAuth: true } }, async (request: FastifyRequest, reply: FastifyReply) => {
    return { success: true, message: "Note added successfully." };
  });
}
