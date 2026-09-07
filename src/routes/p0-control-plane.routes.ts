import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { UnifiedOperationsService } from "../operations/services/unified-operations.service.js";
import { recorderDriverFactory } from "../recorder-drivers/services/recorder-driver-factory.service.js";
import { branchMosaicService } from "../branch-mosaic/services/branch-mosaic.service.js";
import { cameraVerificationService } from "../camera-verification/services/camera-verification.service.js";

const probeDriverSchema = z.object({
  recorderId: z.string().min(1),
  branchId: z.string().min(1),
  vendor: z.enum(["CP_PLUS", "DAHUA", "HIKVISION", "ONVIF"]),
  host: z.string().ip(),
  port: z.number().int().min(1).max(65535),
  targetRetentionDays: z.number().int().positive(),
});

interface P0ControlPlaneOptions {
  store?: ControlPlaneStore;
}

export async function registerP0ControlPlaneRoutes(
  app: FastifyInstance,
  options?: P0ControlPlaneOptions,
): Promise<void> {
  const operations = new UnifiedOperationsService();

  app.get("/v1/mosaic/branches", async (request, reply) => {
    const user = request.currentUser;

    if (user && options?.store) {
      const startedAt = performance.now();
      const branches = await operations.getFleetBranchSummaries(
        user.tenantId,
        options.store,
        user,
      );
      if (branches.length > 0) {
        const data = branches.map((branch) => ({
          branchId: branch.branchId,
          branchCode: branch.branchCode,
          branchName: branch.name,
          overallState: branch.operationalState,
          internet: {
            state: branch.internet.state,
            latencyMs: branch.internet.latencyMs,
            lastVerifiedAt: branch.telemetry.lastReportedAt?.toISOString() ?? null,
          },
          recorder: branch.recorders,
          cameras: branch.cameras,
          storage: branch.storage,
          recording: branch.recording,
          retention: branch.retention,
          alerts: branch.alerts,
          lastObservedAt: branch.telemetry.lastReportedAt?.toISOString() ?? null,
        }));

        return reply.send({
          success: true,
          data: {
            branches: data,
            summary: {
              totalBranches: branches.length,
              healthyBranches: branches.filter((branch) => branch.operationalState === "HEALTHY").length,
              unhealthyBranches: branches.filter((branch) =>
                ["WARNING", "CRITICAL", "OFFLINE"].includes(branch.operationalState)
              ).length,
              unknownBranches: branches.filter((branch) =>
                ["UNKNOWN", "STALE", "MONITORING_INCOMPLETE", "NOT_PROVISIONED"].includes(branch.operationalState)
              ).length,
              activeP1Alerts: branches.reduce((total, branch) => total + branch.alerts.p1, 0),
              activeP2Alerts: branches.reduce((total, branch) => total + branch.alerts.p2, 0),
            },
            queryDurationMs: Number((performance.now() - startedAt).toFixed(2)),
          },
        });
      }
    }

    const mosaic = await branchMosaicService.getMosaicProjections(user?.tenantId ?? "omsystems");
    return reply.send({
      success: true,
      data: mosaic,
    });
  });

  app.get("/v1/mosaic/branches/:branchId/drilldown", async (request, reply) => {
    const user = request.currentUser;
    const { branchId } = request.params as { branchId: string };

    if (user && options?.store) {
      const detail = await operations.getBranch360Workspace(
        branchId,
        user.tenantId,
        options.store,
        user,
      );
      if (detail) return reply.send({ success: true, data: detail });
    }

    const drilldown = await branchMosaicService.getBranchDrilldown(branchId);
    if (!drilldown) return reply.code(404).send({ error: "branch_not_found" });
    return reply.send({ success: true, data: drilldown });
  });

  app.post("/v1/recorders/drivers/probe", async (request, reply) => {
    const user = request.currentUser;
    if (user && user.role !== "super_admin" && user.role !== "company_admin" && user.role !== "hq_admin") {
      return reply.code(403).send({ error: "admin_role_required" });
    }

    const body = probeDriverSchema.parse(request.body);
    if (user && options?.store) {
      const accessible = await options.store.listCamerasByBranch(user, body.branchId, "live:view");
      if (accessible.length === 0) {
        return reply.code(404).send({ error: "branch_not_found_or_not_authorized" });
      }
    }

    const driver = recorderDriverFactory.createDriver({
      recorderId: body.recorderId,
      branchId: body.branchId,
      vendor: body.vendor,
      host: body.host,
      port: body.port,
    });
    const observation = await driver.buildAuthoritativeObservation(body.targetRetentionDays);
    return reply.send({ success: true, data: observation });
  });

  app.post("/v1/cameras/verify", async (request, reply) => {
    const body = request.body as any;
    const result = cameraVerificationService.evaluateCameraHealth(body);
    return reply.send({
      success: true,
      data: result,
    });
  });
}
