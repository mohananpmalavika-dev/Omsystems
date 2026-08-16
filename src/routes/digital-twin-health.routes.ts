import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  BranchHealthProjectionService,
  branchHealthProjectionService,
} from "../digital-twin/services/branch-health-projection.service.js";
import {
  DigitalTwinTopologyService,
  digitalTwinTopologyService,
} from "../digital-twin/services/digital-twin-topology.service.js";
import {
  TwinObservationConsumerService,
  twinObservationConsumerService,
} from "../digital-twin/services/twin-observation-consumer.service.js";
import {
  TwinRootCauseAnalyzerService,
  twinRootCauseAnalyzerService,
} from "../digital-twin/services/twin-root-cause-analyzer.service.js";

const idParamSchema = z.object({ id: z.string().min(1) });

export async function registerDigitalTwinHealthRoutes(
  app: FastifyInstance,
  store?: ControlPlaneStore,
  customTopology?: DigitalTwinTopologyService,
  customConsumer?: TwinObservationConsumerService,
  customAnalyzer?: TwinRootCauseAnalyzerService,
  customProjection?: BranchHealthProjectionService,
) {
  const topology = customTopology ?? digitalTwinTopologyService;
  const consumer = customConsumer ?? twinObservationConsumerService;
  const analyzer = customAnalyzer ?? twinRootCauseAnalyzerService;
  const projection = customProjection ?? branchHealthProjectionService;

  const registerEndpoints = (prefix: string) => {
    // 1. Control Room Branch Health List
    app.get(`${prefix}/control-room/branches`, async (request, reply) => {
      const list = projection.listControlRoomBranches();
      return reply.code(200).send({
        success: true,
        count: list.length,
        data: list,
      });
    });

    // 2. Branch Health Projection
    app.get(`${prefix}/branches/:id/twin/health`, async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const proj = projection.getBranchProjection(id);
      return reply.code(200).send({
        success: true,
        data: proj,
      });
    });

    // 3. Branch Topology Graph (Nodes & Relationships)
    app.get(`${prefix}/branches/:id/twin/topology`, async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const nodes = topology.listNodes(id);
      const relationships = topology.getRelationships(id);
      return reply.code(200).send({
        success: true,
        data: {
          branchId: id,
          nodeCount: nodes.length,
          relationshipCount: relationships.length,
          nodes,
          relationships,
        },
      });
    });

    // 4. Current Active Infrastructure Incident & Impacted Services
    app.get(`${prefix}/branches/:id/twin/incidents/current`, async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const incident = analyzer.getActiveIncident(id);
      if (!incident) {
        return reply.code(200).send({
          success: true,
          data: null,
          message: "No active infrastructure incidents for this branch",
        });
      }
      return reply.code(200).send({
        success: true,
        data: incident,
      });
    });

    // 5. Ingest Collector Observation
    app.post(`${prefix}/twin/observations`, async (request, reply) => {
      const body = request.body as any;
      if (!body || !body.nodeId || !body.metric) {
        return reply.code(400).send({
          success: false,
          error: "nodeId and metric are required",
        });
      }

      const obs = {
        id: body.id ?? `obs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId: body.tenantId ?? "tenant-bank-01",
        branchId: body.branchId ?? "branch-118",
        nodeId: body.nodeId,
        metric: body.metric,
        value: body.value,
        observedAt: body.observedAt ? new Date(body.observedAt) : new Date(),
        source: body.source ?? "collector-network",
        confidence: body.confidence ?? 1.0,
      };

      const res = consumer.consumeObservation(obs);
      // Run root cause analyzer after state changes
      if (res.stateChanged && res.node) {
        analyzer.analyzeBranch(res.node.branchId, obs.observedAt);
      }

      return reply.code(200).send({
        success: true,
        data: res,
      });
    });
  };

  registerEndpoints("/v1");
  registerEndpoints("/api/v1");
  registerEndpoints("/api");
}
