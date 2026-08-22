import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { BranchConnectivityService } from "../connectivity/services/branch-connectivity.service.js";

const branchIdParamSchema = z.object({ id: z.string().min(1) });
const edgeAgentIdParamSchema = z.object({ id: z.string().min(1) });

export async function registerConnectivityHealthRoutes(
  app: FastifyInstance,
  store?: ControlPlaneStore,
  customService?: BranchConnectivityService,
) {
  const service = customService ?? new BranchConnectivityService();

  const registerEndpoints = (prefix: string) => {
    // 1. Get Fleet Network Summary
    app.get(`${prefix}/operational-health/network`, async (_request, reply) => {
      const summary = await service.getFleetNetworkSummary();
      return reply.code(200).send(summary);
    });

    // 2. Get Branch Connectivity Snapshot
    app.get(`${prefix}/branches/:id/connectivity`, async (request, reply) => {
      const { id } = branchIdParamSchema.parse(request.params);
      const snapshot = await service.getBranchConnectivity(id);

      if (!snapshot) {
        return reply.code(404).send({ success: false, error: "Branch connectivity data not found" });
      }

      return reply.code(200).send(snapshot);
    });

    // 3. Get Branch Connectivity History
    app.get(`${prefix}/branches/:id/connectivity/history`, async (request, reply) => {
      const { id } = branchIdParamSchema.parse(request.params);
      const history = await service.getBranchHistory(id);

      return reply.code(200).send({
        branchId: id,
        count: history.length,
        data: history,
      });
    });

    // 4. Get Branch Network Outage Log
    app.get(`${prefix}/branches/:id/connectivity/outages`, async (request, reply) => {
      const { id } = branchIdParamSchema.parse(request.params);
      const outages = await service.getBranchOutages(id);

      return reply.code(200).send({
        branchId: id,
        count: outages.length,
        outages,
      });
    });

    // 5. Get Branch Network SLA Analytics
    app.get(`${prefix}/branches/:id/connectivity/sla`, async (request, reply) => {
      const { id } = branchIdParamSchema.parse(request.params);
      const query = request.query as { period?: string };
      const sla = await service.calculateBranchSla(id, query.period);

      return reply.code(200).send(sla);
    });

    // 6. Ingest Telemetry from Edge Agent
    app.post(`${prefix}/edge-agents/:id/connectivity/telemetry`, async (request, reply) => {
      const { id } = edgeAgentIdParamSchema.parse(request.params);
      const body = request.body as any;

      if (!body || !body.branchId) {
        return reply.code(400).send({ success: false, error: "Missing required branchId in connectivity payload" });
      }

      const result = await service.ingestTelemetry(body);
      return reply.code(200).send({
        success: true,
        acknowledgedState: result.state,
        failoverActive: result.failoverActive,
      });
    });
  };

  registerEndpoints("/v1");
  registerEndpoints("/api/v1");
  registerEndpoints("/api");
}
