import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { surveillancePolicyResolver } from "../surveillance-policy/services/surveillance-policy-resolver.service.js";
import { surveillanceComplianceEvaluator } from "../surveillance-policy/services/surveillance-compliance-evaluator.service.js";

const createPolicySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  version: z.string().default("1.0.0"),
  cameraAvailabilityTarget: z.number().min(0).max(100).default(99.5),
  recordingRequired: z.boolean().default(true),
  retentionDays: z.number().min(1).default(90),
  maxRecordingGapSeconds: z.number().min(0).default(60),
  recorderHeartbeatSeconds: z.number().min(1).default(30),
  cameraHeartbeatSeconds: z.number().min(1).default(30),
  internetHeartbeatSeconds: z.number().min(1).default(30),
  timeDriftToleranceSeconds: z.number().min(0).default(5),
  timeDriftCriticalSeconds: z.number().min(0).default(30),
  diskFreeWarningPercent: z.number().min(0).max(100).default(15),
  diskFreeCriticalPercent: z.number().min(0).max(100).default(5),
  offlineGraceSeconds: z.number().min(0).default(15),
  enabled: z.boolean().default(true),
});

const createAssignmentSchema = z.object({
  tenantId: z.string().default("omsystems"),
  scopeType: z.enum(["TENANT", "REGION", "BRANCH", "DEVICE_TYPE", "DEVICE"]),
  scopeId: z.string().min(1),
  policyId: z.string().optional(),
  overrides: z.record(z.unknown()).optional(),
  priority: z.number().default(0),
  effectiveFrom: z.string().optional(),
  effectiveUntil: z.string().optional(),
  enabled: z.boolean().default(true),
});

const evaluateDeviceSchema = z.object({
  tenantId: z.string().default("omsystems"),
  branchId: z.string(),
  deviceId: z.string(),
  deviceType: z.enum(["CAMERA", "RECORDER"]).default("CAMERA"),
  observation: z.object({
    online: z.boolean().optional(),
    recording: z.boolean().optional(),
    retentionDaysObserved: z.number().optional(),
    maxRecordingGapSeconds: z.number().optional(),
    timeDriftSeconds: z.number().optional(),
    diskFreePercent: z.number().optional(),
    availabilityPercent: z.number().optional(),
    isUnderMaintenance: z.boolean().optional(),
  }),
});

const evaluateBranchSchema = z.object({
  tenantId: z.string().default("omsystems"),
  branchId: z.string(),
  branchName: z.string().optional(),
  recorders: z.array(z.any()).default([]),
  cameras: z.array(z.any()).default([]),
});

export const registerSurveillancePolicyRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // 1. List All Policies
  app.get("/v1/surveillance-policies", async (request, reply) => {
    const tenantId = (request.query as any)?.tenantId ?? "omsystems";
    const policies = await surveillancePolicyResolver.listPolicies(tenantId);
    return reply.code(200).send({ success: true, data: policies });
  });

  // 2. Create Policy
  app.post("/v1/surveillance-policies", async (request, reply) => {
    const tenantId = (request.body as any)?.tenantId ?? "omsystems";
    const body = createPolicySchema.parse(request.body);
    const policy = await surveillancePolicyResolver.createPolicy(tenantId, body as any);
    return reply.code(201).send({ success: true, data: policy });
  });

  // 3. Get Single Policy
  app.get("/v1/surveillance-policies/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const policy = await surveillancePolicyResolver.getPolicy(id);
    if (!policy) {
      return reply.code(404).send({ error: "policy_not_found", message: `Policy ${id} not found` });
    }
    return reply.code(200).send({ success: true, data: policy });
  });

  // 4. Create Policy Assignment (Override or Template)
  app.post("/v1/surveillance-policy-assignments", async (request, reply) => {
    const body = createAssignmentSchema.parse(request.body);
    const assignment = await surveillancePolicyResolver.assignPolicy(body as any);
    return reply.code(201).send({ success: true, data: assignment });
  });

  // 5. Get Effective Policy for Branch (with Provenance)
  app.get("/v1/branches/:branchId/surveillance-policy", async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const tenantId = (request.query as any)?.tenantId ?? "omsystems";
    const regionId = (request.query as any)?.regionId;

    const policy = await surveillancePolicyResolver.resolveEffectivePolicy({
      tenantId,
      branchId,
      regionId,
    });
    return reply.code(200).send({ success: true, data: policy });
  });

  // 6. Get Effective Policy for Device (with Provenance)
  app.get("/v1/devices/:deviceId/surveillance-policy", async (request, reply) => {
    const { deviceId } = request.params as { deviceId: string };
    const tenantId = (request.query as any)?.tenantId ?? "omsystems";
    const branchId = (request.query as any)?.branchId ?? "default-branch";
    const deviceType = (request.query as any)?.deviceType;

    const policy = await surveillancePolicyResolver.resolveEffectivePolicy({
      tenantId,
      branchId,
      deviceId,
      deviceType,
    });
    return reply.code(200).send({ success: true, data: policy });
  });

  // 7. Evaluate Single Device Compliance
  app.post("/v1/compliance/evaluate/device", async (request, reply) => {
    const body = evaluateDeviceSchema.parse(request.body);
    const effectivePolicy = await surveillancePolicyResolver.resolveEffectivePolicy({
      tenantId: body.tenantId,
      branchId: body.branchId,
      deviceId: body.deviceId,
      deviceType: body.deviceType,
    });

    let result;
    if (body.deviceType === "RECORDER") {
      result = surveillanceComplianceEvaluator.evaluateRecorder(
        { recorderId: body.deviceId, branchId: body.branchId, ...body.observation },
        effectivePolicy,
      );
    } else {
      result = surveillanceComplianceEvaluator.evaluateCamera(
        { cameraId: body.deviceId, branchId: body.branchId, ...body.observation },
        effectivePolicy,
      );
    }

    return reply.code(200).send({ success: true, data: result });
  });

  // 8. Evaluate Complete Branch Compliance
  app.post("/v1/compliance/evaluate/branch", async (request, reply) => {
    const body = evaluateBranchSchema.parse(request.body);
    const effectivePolicy = await surveillancePolicyResolver.resolveEffectivePolicy({
      tenantId: body.tenantId,
      branchId: body.branchId,
    });

    const report = surveillanceComplianceEvaluator.evaluateBranch(
      {
        branchId: body.branchId,
        branchName: body.branchName,
        recorders: body.recorders,
        cameras: body.cameras,
      },
      effectivePolicy,
    );

    return reply.code(200).send({ success: true, data: report });
  });
};
