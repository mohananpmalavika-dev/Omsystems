import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { enterpriseStoragePool, EnterpriseStoragePool } from "../storage/enterprise-storage-pool.js";
import { storageTelemetryService, StorageTelemetryService } from "../storage/storage-telemetry.service.js";
import { digitalTwinStorageService, DigitalTwinStorageService } from "../digital-twin/digital-twin-storage.service.js";
import type { StorageTier } from "../storage/recording-storage.interface.js";

const migrateSegmentSchema = z.object({
  segmentKey: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export async function registerEnterpriseStorageRoutes(
  app: FastifyInstance,
  options: {
    storagePool?: EnterpriseStoragePool;
    telemetryService?: StorageTelemetryService;
    twinStorageService?: DigitalTwinStorageService;
  } = {},
): Promise<void> {
  const pool = options.storagePool || enterpriseStoragePool;
  const telemetry = options.telemetryService || storageTelemetryService;
  const twinStorage = options.twinStorageService || digitalTwinStorageService;

  /**
   * GET /api/v1/storage/nodes
   * Lists all enterprise storage nodes and their live health summary
   */
  app.get("/api/v1/storage/nodes", async (_request: FastifyRequest, reply: FastifyReply) => {
    const healthReports = await pool.getAllHealth();
    return reply.code(200).send({
      success: true,
      data: healthReports,
    });
  });

  /**
   * GET /api/v1/storage/nodes/:nodeId/health
   * Retrieves detailed health diagnostics for a specific node
   */
  app.get("/api/v1/storage/nodes/:nodeId/health", async (request: FastifyRequest, reply: FastifyReply) => {
    const { nodeId } = z.object({ nodeId: z.string().min(1) }).parse(request.params);
    const node = pool.getNode(nodeId);
    if (!node) {
      return reply.code(404).send({ success: false, error: "storage_node_not_found" });
    }

    const health = await node.health();
    return reply.code(200).send({
      success: true,
      data: health,
    });
  });

  /**
   * POST /api/v1/storage/telemetry/collect
   * Triggers telemetry collection and persistence
   */
  app.post("/api/v1/storage/telemetry/collect", async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = z.object({
      tenantId: z.string().uuid().default("00000000-0000-0000-0000-000000000000"),
    }).parse(request.body || {});

    const reports = await telemetry.collectAndPersistTelemetry(tenantId);
    return reply.code(200).send({
      success: true,
      data: {
        nodeCount: reports.length,
        reports,
      },
    });
  });

  /**
   * POST /api/v1/storage/migrate
   * Migrates a recording segment from one tier/node to another (e.g. HOT -> WARM)
   */
  app.post("/api/v1/storage/migrate", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = migrateSegmentSchema.parse(request.body);
    const result = await pool.migrateSegment(
      body.segmentKey,
      body.sourceNodeId,
      body.targetNodeId,
      body.metadata,
    );

    return reply.code(200).send({
      success: true,
      data: result,
    });
  });

  /**
   * GET /api/v1/storage/digital-twin/topology
   * Returns live storage topology and heatmap for the Digital Twin
   */
  app.get("/api/v1/storage/digital-twin/topology", async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = z.object({
      tenantId: z.string().uuid().default("00000000-0000-0000-0000-000000000000"),
    }).parse(request.query || {});

    const topology = await twinStorage.getStorageTopology(tenantId);
    return reply.code(200).send({
      success: true,
      data: topology,
    });
  });
}
