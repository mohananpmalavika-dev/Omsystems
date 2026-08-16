/**
 * Alert Incidents & Storm Suppression REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { alertIncidentRepository, incidentRecoveryService } from "../incidents/index.js";

export async function registerAlertIncidentsRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/incidents
   */
  const handleGetIncidents = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query as any) || {};
    const list = await alertIncidentRepository.list({
      tenantId: query.tenantId,
      branchId: query.branchId,
      status: query.status,
    });
    return reply.send({ success: true, count: list.length, data: list });
  };

  app.get("/api/v1/incidents", handleGetIncidents);
  app.get("/v1/incidents", handleGetIncidents);

  /**
   * GET /api/v1/incidents/:id
   */
  const handleGetIncident = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const incident = await alertIncidentRepository.findById(params.id);
    if (!incident) {
      return reply.status(404).send({ success: false, error: "Incident not found" });
    }
    const relationships = await alertIncidentRepository.getRelationshipsForIncident(params.id);
    return reply.send({ success: true, data: { ...incident, relationships } });
  };

  app.get("/api/v1/incidents/:id", handleGetIncident);
  app.get("/v1/incidents/:id", handleGetIncident);

  /**
   * POST /api/v1/incidents/:id/acknowledge
   */
  const handleAcknowledgeIncident = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const body = (request.body as any) || {};
    const incident = await alertIncidentRepository.findById(params.id);
    if (!incident) {
      return reply.status(404).send({ success: false, error: "Incident not found" });
    }

    incident.status = "ACKNOWLEDGED";
    incident.acknowledgedAt = new Date();
    incident.acknowledgedBy = body.operatorId || "operator-control-room";
    await alertIncidentRepository.update(incident);

    return reply.send({ success: true, data: incident });
  };

  app.post("/api/v1/incidents/:id/acknowledge", handleAcknowledgeIncident);
  app.post("/v1/incidents/:id/acknowledge", handleAcknowledgeIncident);

  /**
   * POST /api/v1/incidents/:id/resolve
   */
  const handleResolveIncident = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    const body = (request.body as any) || {};
    const res = await incidentRecoveryService.handleRootCauseRecovery(params.id, body.unrecoveredNodeIds || []);
    return reply.send({ success: true, data: res });
  };

  app.post("/api/v1/incidents/:id/resolve", handleResolveIncident);
  app.post("/v1/incidents/:id/resolve", handleResolveIncident);

  /**
   * GET /api/v1/incidents/storm-stats
   */
  const handleGetStormStats = async (request: FastifyRequest, reply: FastifyReply) => {
    const incidents = await alertIncidentRepository.list();
    const totalIncidents = incidents.length;
    let totalSuppressed = 0;
    for (const inc of incidents) {
      totalSuppressed += inc.suppressedAlertCount;
    }

    return reply.send({
      success: true,
      data: {
        totalIncidents,
        activeIncidents: incidents.filter((i) => i.status !== "RESOLVED").length,
        totalSuppressedAlerts: totalSuppressed,
        suppressionEfficiencyPct: totalIncidents + totalSuppressed === 0 ? 100 : Math.round((totalSuppressed / (totalIncidents + totalSuppressed)) * 100),
        topRootCauses: [
          { category: "CONNECTIVITY_OUTAGE", percentage: 54 },
          { category: "RECORDER_FAILURE", percentage: 26 },
          { category: "STORAGE_CRITICAL", percentage: 12 },
          { category: "POWER_FAILURE", percentage: 8 },
        ],
      },
    });
  };

  app.get("/api/v1/incidents/storm-stats", handleGetStormStats);
  app.get("/v1/incidents/storm-stats", handleGetStormStats);
}
