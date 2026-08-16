import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { DiskHealthService } from "../../backend/src/storage/services/disk-health.service.js";

const diskIdParamSchema = z.object({ id: z.string().min(1) });
const recorderIdParamSchema = z.object({ id: z.string().min(1) });
const branchIdParamSchema = z.object({ id: z.string().min(1) });

export async function registerStorageHealthRoutes(
  app: FastifyInstance,
  store?: ControlPlaneStore,
  customService?: DiskHealthService,
) {
  const service = customService ?? new DiskHealthService();

  const registerEndpoints = (prefix: string) => {
    // 1. List all disks with optional filters
    app.get(`${prefix}/storage/disks`, async (request, reply) => {
      const query = request.query as {
        branchId?: string;
        recorderId?: string;
        state?: string;
        smartStatus?: string;
        risk?: string;
      };

      const list = await service.listDisks(query);
      return reply.code(200).send({
        success: true,
        count: list.length,
        data: list,
      });
    });

    // 2. Get specific disk health snapshot
    app.get(`${prefix}/storage/disks/:id`, async (request, reply) => {
      const { id } = diskIdParamSchema.parse(request.params);
      const snapshot = await service.getDisk(id);

      if (!snapshot) {
        return reply.code(404).send({ success: false, error: "Disk not found" });
      }

      return reply.code(200).send(snapshot);
    });

    // 3. Get disk SMART attributes
    app.get(`${prefix}/storage/disks/:id/smart`, async (request, reply) => {
      const { id } = diskIdParamSchema.parse(request.params);
      const attributes = await service.getDiskSmartAttributes(id);

      return reply.code(200).send({
        diskId: id,
        count: attributes.length,
        attributes,
      });
    });

    // 4. Get disk historical observation trend
    app.get(`${prefix}/storage/disks/:id/history`, async (request, reply) => {
      const { id } = diskIdParamSchema.parse(request.params);
      const history = await service.getDiskHistory(id);

      return reply.code(200).send({
        diskId: id,
        count: history.length,
        observations: history,
      });
    });

    // 5. Get disk predictive failure analysis
    app.get(`${prefix}/storage/disks/:id/prediction`, async (request, reply) => {
      const { id } = diskIdParamSchema.parse(request.params);
      const prediction = await service.getDiskPrediction(id);

      if (!prediction) {
        return reply.code(404).send({ success: false, error: "Prediction not found for disk" });
      }

      return reply.code(200).send(prediction);
    });

    // 6. Get recorder storage aggregation
    app.get(`${prefix}/recorders/:id/storage`, async (request, reply) => {
      const { id } = recorderIdParamSchema.parse(request.params);
      const storage = await service.getRecorderStorage(id);

      return reply.code(200).send(storage);
    });

    // 7. Get branch storage aggregation
    app.get(`${prefix}/branches/:id/storage`, async (request, reply) => {
      const { id } = branchIdParamSchema.parse(request.params);
      const disks = await service.listDisks({ branchId: id });

      const totalDisks = disks.length;
      const healthyDisks = disks.filter((d) => d.state === "HEALTHY").length;
      const warningDisks = disks.filter((d) => d.state === "WARNING").length;
      const failedDisks = disks.filter((d) => d.state === "FAILED" || d.state === "CRITICAL").length;

      const totalCapacityBytes = disks.reduce((sum, d) => sum + (d.totalBytes ?? 0), 0);
      const usedCapacityBytes = disks.reduce((sum, d) => sum + (d.usedBytes ?? 0), 0);
      const freeCapacityBytes = disks.reduce((sum, d) => sum + (d.freeBytes ?? 0), 0);
      const usagePercent = totalCapacityBytes > 0 ? Math.round((usedCapacityBytes / totalCapacityBytes) * 100) : 0;

      return reply.code(200).send({
        branchId: id,
        totalDisks,
        healthyDisks,
        warningDisks,
        failedDisks,
        totalCapacityBytes,
        usedCapacityBytes,
        freeCapacityBytes,
        usagePercent,
        status: failedDisks > 0 ? "CRITICAL" : warningDisks > 0 || usagePercent >= 85 ? "WARNING" : "HEALTHY",
        disks,
      });
    });

    // 8. Get fleet summary statistics
    app.get(`${prefix}/storage/fleet/summary`, async (request, reply) => {
      const summary = await service.getFleetSummary();
      return reply.code(200).send(summary);
    });

    // 9. Get at-risk disks (exception-first)
    app.get(`${prefix}/storage/fleet/risks`, async (request, reply) => {
      const allDisks = await service.listDisks();
      const atRisk = allDisks.filter((d) => d.state !== "HEALTHY" || d.predictedFailure);

      return reply.code(200).send({
        count: atRisk.length,
        data: atRisk,
      });
    });
  };

  registerEndpoints("/v1");
  registerEndpoints("/api/v1");
  registerEndpoints("/api");
}
