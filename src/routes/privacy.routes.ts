import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  CameraPrivacyControlInput,
  CameraPrivacyPurposeAssignmentInput,
  ControlPlaneStore,
  PrivacyBreachInput,
  PrivacyPurposeInput,
} from "../control-plane-store.js";

const idParams = z.object({ id: z.string().uuid() });
const cameraParams = z.object({ cameraId: z.string().uuid() });

const privacyPurposeSchema = z.object({
  name: z.string().trim().min(2).max(200),
  lawfulBasis: z.string().trim().min(2).max(300),
  description: z.string().max(2000).optional(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  dataCategories: z.array(z.string().max(100)).default([]),
  active: z.boolean().default(true),
});

const cameraPurposeAssignmentSchema = z.object({
  purposeId: z.string().uuid(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

const cameraPrivacyControlsSchema = z.object({
  audioRecordingApproved: z.boolean().optional(),
  encryptionEnabled: z.boolean().optional(),
  disposalPlan: z.string().max(2000).optional(),
  dataProtectionOfficer: z.string().max(200).optional(),
  lastReviewedAt: z.string().datetime().optional(),
});

const privacyBreachSchema = z.object({
  branchNodeId: z.string().uuid().optional(),
  cameraId: z.string().uuid().optional(),
  breachType: z.string().trim().min(3).max(200),
  severity: z.enum(["low", "medium", "high", "critical"]),
  discoveredAt: z.string().datetime(),
  description: z.string().max(2000).optional(),
  remediation: z.string().max(2000).optional(),
});

const breachStatusSchema = z.object({
  status: z.enum(["reported", "investigating", "contained", "resolved", "closed"]),
});

async function requireCameraConfigure(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  cameraId: string,
) {
  const camera = await store.getCamera(cameraId);
  if (!camera) {
    await reply.code(404).send({ error: "camera_not_found" });
    return null;
  }

  const decision = await store.checkAccess(
    request.currentUser,
    "device:configure",
    camera.nodeId,
  );

  if (!decision || !decision.allowed) {
    await reply.code(403).send({ error: "forbidden", reason: decision?.reason ?? "access_denied" });
    return null;
  }

  return camera;
}

export async function registerPrivacyRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.get("/v1/privacy/summary", async (request) => {
    return await store.getPrivacySummary(request.currentUser.tenantId);
  });

  app.get("/v1/privacy/purposes", async (request) => {
    return { data: await store.listPrivacyPurposes(request.currentUser.tenantId) };
  });

  app.post("/v1/privacy/purposes", async (request, reply) => {
    const body = privacyPurposeSchema.parse(request.body);
    const purpose = await store.createPrivacyPurpose({
      tenantId: request.currentUser.tenantId,
      name: body.name,
      lawfulBasis: body.lawfulBasis,
      description: body.description,
      riskLevel: body.riskLevel,
      dataCategories: body.dataCategories,
      active: body.active,
      createdBy: request.currentUser.id,
    });

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "privacy.purpose_created",
      resourceNodeId: "",
      outcome: "success",
      details: { purposeId: purpose.id },
    });

    return reply.code(201).send(purpose);
  });

  app.get("/v1/privacy/purposes/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const purpose = await store.getPrivacyPurpose(id);
    if (!purpose) return reply.code(404).send({ error: "purpose_not_found" });
    return purpose;
  });

  app.patch("/v1/privacy/purposes/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = privacyPurposeSchema.partial().parse(request.body);
    const purpose = await store.updatePrivacyPurpose(id, {
      tenantId: request.currentUser.tenantId,
      name: body.name ?? undefined,
      lawfulBasis: body.lawfulBasis ?? undefined,
      description: body.description ?? undefined,
      riskLevel: body.riskLevel ?? undefined,
      dataCategories: body.dataCategories ?? undefined,
      active: body.active ?? undefined,
      createdBy: request.currentUser.id,
    });
    if (!purpose) return reply.code(404).send({ error: "purpose_not_found" });
    return purpose;
  });

  app.get("/v1/privacy/cameras/:cameraId/purposes", async (request, reply) => {
    const { cameraId } = cameraParams.parse(request.params);
    const camera = await store.getCamera(cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    return { data: await store.listCameraPrivacyPurposes(cameraId) };
  });

  app.post("/v1/privacy/cameras/:cameraId/purposes", async (request, reply) => {
    const { cameraId } = cameraParams.parse(request.params);
    const body = cameraPurposeAssignmentSchema.parse(request.body);
    const camera = await requireCameraConfigure(request, reply, store, cameraId);
    if (!camera) return;

    const assignment = await store.assignCameraPrivacyPurpose(
      cameraId,
      body.purposeId,
      request.currentUser.id,
      body.startDate,
      body.endDate,
      body.notes,
    );

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "privacy.purpose_assigned",
      resourceNodeId: camera.nodeId,
      outcome: "success",
      details: { cameraId, purposeId: body.purposeId },
    });

    return reply.code(201).send(assignment);
  });

  app.get("/v1/privacy/cameras/:cameraId/control", async (request, reply) => {
    const { cameraId } = cameraParams.parse(request.params);
    const camera = await store.getCamera(cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    const controls = await store.getCameraPrivacyControls(cameraId);
    return controls || {
      cameraId,
      audioRecordingApproved: false,
      encryptionEnabled: false,
      disposalPlan: null,
      dataProtectionOfficer: null,
      lastReviewedAt: null,
      updatedAt: new Date().toISOString(),
    };
  });

  app.put("/v1/privacy/cameras/:cameraId/control", async (request, reply) => {
    const { cameraId } = cameraParams.parse(request.params);
    const body = cameraPrivacyControlsSchema.partial().parse(request.body);
    const camera = await requireCameraConfigure(request, reply, store, cameraId);
    if (!camera) return;

    const controls = await store.upsertCameraPrivacyControls(cameraId, body);
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "privacy.camera_controls_updated",
      resourceNodeId: camera.nodeId,
      outcome: "success",
      details: { cameraId, controls: body },
    });

    return controls;
  });

  app.get("/v1/privacy/breaches", async (request) => {
    const query = z.object({ status: z.string().optional() }).parse(request.query);
    return {
      data: await store.listPrivacyBreaches(request.currentUser.tenantId, query.status),
    };
  });

  app.post("/v1/privacy/breaches", async (request, reply) => {
    const body = privacyBreachSchema.parse(request.body);
    const breach = await store.reportPrivacyBreach({
      tenantId: request.currentUser.tenantId,
      branchNodeId: body.branchNodeId,
      cameraId: body.cameraId,
      breachType: body.breachType,
      severity: body.severity,
      discoveredAt: body.discoveredAt,
      description: body.description,
      remediation: body.remediation,
      createdBy: request.currentUser.id,
    });

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "privacy.breach_reported",
      resourceNodeId: body.cameraId ? (await store.getCamera(body.cameraId))?.nodeId ?? "" : "",
      outcome: "success",
      details: { breachId: breach.id },
    });

    return reply.code(201).send(breach);
  });

  app.patch("/v1/privacy/breaches/:id/status", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = breachStatusSchema.parse(request.body);
    const breach = await store.updatePrivacyBreachStatus(id, body.status, request.currentUser.id);
    if (!breach) return reply.code(404).send({ error: "breach_not_found" });

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "privacy.breach_status_updated",
      resourceNodeId: breach.cameraId ? (await store.getCamera(breach.cameraId))?.nodeId ?? "" : "",
      outcome: "success",
      details: { breachId: breach.id, status: body.status },
    });

    return breach;
  });
}
