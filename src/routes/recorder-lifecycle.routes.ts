import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { buildRecorderReplacementPlan } from "../services/recorder-replacement.js";
import { ensureCameraAiBundle } from "../analytics/camera-ai-bundle.js";

const paramsSchema = z.object({ branchId: z.string().min(1) });
const replacementSchema = z.object({
  oldRecorderSerialNumber: z.string().trim().min(1).max(200),
  newRecorderSerialNumber: z.string().trim().min(1).max(200),
});
const applySchema = replacementSchema.extend({
  confirmPreserveCameraIds: z.literal(true),
  expectedMappingCount: z.number().int().positive(),
});

export async function registerRecorderLifecycleRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  app.post("/v1/branches/:branchId/recorders/replacements/plan", async (request, reply) => {
    const { branchId } = paramsSchema.parse(request.params);
    const body = replacementSchema.parse(request.body);
    const context = await replacementContext(store, request.currentUser, branchId);
    if (context.error) return reply.code(context.error.status).send({ error: context.error.code });
    return buildRecorderReplacementPlan({
      branchId,
      oldRecorderSerialNumber: body.oldRecorderSerialNumber,
      newRecorderSerialNumber: body.newRecorderSerialNumber,
      cameras: context.cameras!,
      discoveries: context.discoveries!,
    });
  });

  app.post("/v1/branches/:branchId/recorders/replacements/apply", async (request, reply) => {
    const { branchId } = paramsSchema.parse(request.params);
    const body = applySchema.parse(request.body);
    const context = await replacementContext(store, request.currentUser, branchId);
    if (context.error) return reply.code(context.error.status).send({ error: context.error.code });
    const plan = buildRecorderReplacementPlan({
      branchId,
      oldRecorderSerialNumber: body.oldRecorderSerialNumber,
      newRecorderSerialNumber: body.newRecorderSerialNumber,
      cameras: context.cameras!,
      discoveries: context.discoveries!,
    });
    if (plan.status !== "ready") return reply.code(409).send({ error: "recorder_replacement_not_ready", plan });
    if (plan.mappings.length !== body.expectedMappingCount) {
      return reply.code(409).send({ error: "recorder_replacement_plan_changed", plan });
    }
    try {
      const result = await store.replaceRecorderChannels({
        branchId,
        oldRecorderSerialNumber: plan.oldRecorderSerialNumber,
        newRecorderSerialNumber: plan.newRecorderSerialNumber,
        mappings: plan.mappings.map(({ cameraId, discoveryId, sourceChannel }) => ({ cameraId, discoveryId, sourceChannel })),
        actorUserId: request.currentUser.id,
      });
      await store.writeAudit({
        tenantId: context.branch!.tenantId,
        actorUserId: request.currentUser.id,
        action: "recorder.replacement.apply",
        resourceNodeId: branchId,
        outcome: "success",
        sourceIp: request.ip,
        details: {
          replacementId: result.replacementId,
          oldRecorderSerialNumber: result.oldRecorderSerialNumber,
          newRecorderSerialNumber: result.newRecorderSerialNumber,
          updatedCameraIds: result.updatedCameraIds,
        },
      });
      if (result.updatedCameraIds?.length) {
        for (const cameraId of result.updatedCameraIds) {
          await ensureCameraAiBundle(store, context.branch!.tenantId, cameraId, request.currentUser.id).catch(() => undefined);
        }
      }
      return reply.code(201).send(result);
    } catch (error) {
      const code = error instanceof Error ? error.message : "recorder_replacement_failed";
      return reply.code(code === "recorder_replacement_mapping_changed" ? 409 : 400).send({ error: code });
    }
  });
}

async function replacementContext(store: ControlPlaneStore, user: Parameters<ControlPlaneStore["listCamerasByBranch"]>[0], branchId: string) {
  const branch = await store.getNode(branchId);
  if (!branch || branch.type !== "branch") return { error: { status: 404, code: "branch_not_found" } };
  const decision = await store.checkAccess(user, "device:configure", branchId);
  if (!decision?.allowed) return { error: { status: 403, code: "forbidden" } };
  const [cameras, discoveries] = await Promise.all([
    store.listCamerasByBranch(user, branchId, "device:configure"),
    store.listDiscoveredCameras(branchId),
  ]);
  return { branch, cameras, discoveries };
}
