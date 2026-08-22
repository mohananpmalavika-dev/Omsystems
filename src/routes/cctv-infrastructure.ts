import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  CctvInfrastructureStore,
  ControlPlaneStore,
} from "../control-plane-store.js";

const idParams = z.object({ id: z.string().min(1) });
const branchParams = z.object({ branchId: z.string().min(1) });

const cameraSpecificationsSchema = z.object({
  resolutionMp: z.number().positive(),
  resolutionWidth: z.number().int().positive(),
  resolutionHeight: z.number().int().positive(),
  frameRate: z.number().int().positive().max(120).default(25),
  videoCodec: z.enum(["H264", "H265", "H265+", "MJPEG", "MPEG4", "Smart264"]).default("H264"),
  bitrateKbps: z.number().int().positive().optional(),
  fieldOfViewHorizontal: z.number().int().min(1).max(360).optional(),
  fieldOfViewVertical: z.number().int().min(1).max(180).optional(),
  focalLengthMm: z.number().positive().optional(),
  lensType: z.string().max(100).optional(),
  hasNightVision: z.boolean().default(false),
  irDistanceMeters: z.number().int().min(0).optional(),
  hasWdr: z.boolean().default(false),
  minIlluminationLux: z.number().positive().optional(),
  weatherproofRating: z.enum([
    "IP20", "IP33", "IP44", "IP54", "IP65", "IP66", "IP67", "IP68"
  ]).optional(),
  operatingTempMin: z.number().int().optional(),
  operatingTempMax: z.number().int().optional(),
  vandalResistant: z.boolean().default(false),
  powerConsumptionWatts: z.number().positive().optional(),
  powerSupplyType: z.string().max(100).optional(),
  poeClass: z.string().max(50).optional(),
  storageDays: z.number().int().positive().default(30),
  avgStoragePerDayGb: z.number().positive().optional(),
  hasTwoWayAudio: z.boolean().default(false),
  hasMotionDetection: z.boolean().default(false),
  hasAnalytics: z.boolean().default(false),
  analyticsFeatures: z.array(z.string()).default([]),
});

const cameraInstallationComplianceSchema = z.object({
  meetsResolutionRequirement: z.boolean().default(false),
  meetsFrameRateRequirement: z.boolean().default(false),
  meetsCoverageRequirement: z.boolean().default(false),
  meetsRetentionRequirement: z.boolean().default(false),
  properLighting: z.boolean().default(false),
  properAngle: z.boolean().default(false),
  complianceNotes: z.string().max(2000).optional(),
  lastInspectionDate: z.string().date().optional(),
  nextInspectionDate: z.string().date().optional(),
  inspectorName: z.string().max(200).optional(),
  audioRecordingCompliant: z.boolean().default(true),
  privacyMaskConfigured: z.boolean().default(false),
  signageInstalled: z.boolean().default(false),
});

const branchCameraRequirementSchema = z.object({
  locationType: z.enum([
    "branch-entrance", "branch-exit", "cash-counter", "manager-cabin",
    "strong-room", "vault", "locker-room", "atm-cabin", "parking-area",
    "perimeter-fence", "staircase", "corridor", "server-room", "lobby",
    "teller-area", "safe-deposit", "other"
  ]),
  requiredCount: z.number().int().positive().default(1),
  minResolutionMp: z.number().positive().default(2.0),
  minFrameRate: z.number().int().positive().default(25),
  requiresNightVision: z.boolean().default(false),
  requiresAudio: z.boolean().default(false),
  requiresPtz: z.boolean().default(false),
  requiresLpr: z.boolean().default(false),
  priority: z.number().int().min(1).max(5).default(3),
  isRegulatoryRequirement: z.boolean().default(false),
  complianceStandard: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

const updateCameraDetailsSchema = z.object({
  locationType: z.enum([
    "branch-entrance", "branch-exit", "cash-counter", "manager-cabin",
    "strong-room", "vault", "locker-room", "atm-cabin", "parking-area",
    "perimeter-fence", "staircase", "corridor", "server-room", "lobby",
    "teller-area", "safe-deposit", "other"
  ]).optional(),
  physicalType: z.enum([
    "dome-indoor", "dome-outdoor", "bullet-indoor", "bullet-outdoor",
    "ptz", "fixed", "thermal", "license-plate-recognition", "panoramic", "fisheye"
  ]).optional(),
  installationDate: z.string().date().optional(),
  warrantyExpiresAt: z.string().date().optional(),
  serialNumber: z.string().max(200).optional(),
  macAddress: z.string().max(17).optional(),
  firmwareVersion: z.string().max(100).optional(),
  ipAddress: z.string().ip().optional(),
  installationNotes: z.string().max(2000).optional(),
});

/**
 * Register CCTV Infrastructure routes
 */
export async function registerCctvInfrastructureRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore & CctvInfrastructureStore,
) {
  // Get camera specifications
  app.get("/v1/cameras/:id/specifications", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    
    // Check access
    if (!(await hasAccess(request, reply, store, "live:view", camera.nodeId))) {
      return;
    }
    
    const specs = await store.getCameraSpecifications(id);
    if (!specs) {
      return reply.code(404).send({ error: "specifications_not_found" });
    }
    
    return specs;
  });

  // Create or update camera specifications
  app.put("/v1/cameras/:id/specifications", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = cameraSpecificationsSchema.parse(request.body);
    
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    
    // Check access
    if (!(await hasAccess(request, reply, store, "device:configure", camera.nodeId))) {
      return;
    }
    
    // Filter out undefined values to match the input interface
    const specificationsInput: any = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined)
    );
    
    const specs = await store.upsertCameraSpecifications(id, specificationsInput);
    
    await audit(request, store, "camera.specifications_updated", camera.nodeId, "success", {
      cameraId: id,
    });
    
    return specs;
  });

  // Get camera compliance status
  app.get("/v1/cameras/:id/compliance", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    
    // Check access
    if (!(await hasAccess(request, reply, store, "live:view", camera.nodeId))) {
      return;
    }
    
    const compliance = await store.getCameraCompliance(id);
    if (!compliance) {
      return reply.code(404).send({ error: "compliance_not_found" });
    }
    
    return compliance;
  });

  // Update camera compliance status
  app.put("/v1/cameras/:id/compliance", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = cameraInstallationComplianceSchema.parse(request.body);
    
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    
    // Check access (requires device:configure permission)
    if (!(await hasAccess(request, reply, store, "device:configure", camera.nodeId))) {
      return;
    }
    
    // Filter out undefined values to match the input interface
    const complianceInput: any = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined)
    );
    
    const compliance = await store.upsertCameraCompliance(id, complianceInput);
    
    await audit(request, store, "camera.compliance_updated", camera.nodeId, "success", {
      cameraId: id,
    });
    
    return compliance;
  });

  // Update camera installation details
  app.patch("/v1/cameras/:id/details", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = updateCameraDetailsSchema.parse(request.body);
    
    const camera = await store.getCamera(id);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });
    
    // Check access
    if (!(await hasAccess(request, reply, store, "device:configure", camera.nodeId))) {
      return;
    }
    
    const updated = await store.updateCameraDetails(id, body);
    
    await audit(request, store, "camera.details_updated", camera.nodeId, "success", {
      cameraId: id,
    });
    
    const { connectionSecretRef: _secret, ...safe } = updated;
    return safe;
  });

  // Get branch camera requirements
  app.get("/v1/branches/:branchId/camera-requirements", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    
    // Check access
    if (!(await hasAccess(request, reply, store, "live:view", branchId))) {
      return;
    }
    
    const requirements = await store.getBranchCameraRequirements(branchId);
    return { data: requirements };
  });

  // Create or update branch camera requirement
  app.put("/v1/branches/:branchId/camera-requirements", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const body = branchCameraRequirementSchema.parse(request.body);
    
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    
    // Check access
    if (!(await hasAccess(request, reply, store, "device:configure", branchId))) {
      return;
    }
    
    // Filter out undefined values to match the input interface
    const requirementInput: any = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined)
    );
    
    const requirement = await store.upsertBranchCameraRequirement(branchId, requirementInput);
    
    await audit(request, store, "branch.camera_requirement_updated", branchId, "success", {
      locationType: body.locationType,
    });
    
    return requirement;
  });

  // Initialize standard requirements for a branch
  app.post("/v1/branches/:branchId/camera-requirements/initialize", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    
    // Check access
    if (!(await hasAccess(request, reply, store, "device:configure", branchId))) {
      return;
    }
    
    await store.initializeBranchCameraRequirements(branchId);
    
    await audit(request, store, "branch.camera_requirements_initialized", branchId, "success");
    
    return { message: "Standard camera requirements initialized" };
  });

  // Get branch camera coverage gaps
  app.get("/v1/branches/:branchId/coverage-gaps", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    
    // Check access
    if (!(await hasAccess(request, reply, store, "live:view", branchId))) {
      return;
    }
    
    const gaps = await store.getBranchCoverageGaps(branchId);
    return { data: gaps };
  });

  // Get compliance summary for a branch
  app.get("/v1/branches/:branchId/compliance-summary", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    
    // Check access
    if (!(await hasAccess(request, reply, store, "audit:view", branchId))) {
      return;
    }
    
    const summary = await store.getBranchComplianceSummary(branchId);
    return { data: summary };
  });

  // Get cameras due for inspection
  app.get("/v1/inspections/due", async (request, reply) => {
    const query = z.object({
      days: z.coerce.number().int().positive().default(30),
    }).parse(request.query);
    
    // Check if user has audit:view permission at any level
    const branches = await store.listAccessibleNodes(
      request.currentUser,
      "audit:view",
      "branch",
    );
    
    if (branches.length === 0) {
      return reply.code(403).send({ error: "forbidden" });
    }
    
    const dueInspections = await store.getCamerasDueForInspection(query.days);
    
    // Filter to only branches the user can access
    const branchIds = new Set(branches.map(b => b.id));
    const filtered = dueInspections.filter(camera => 
      branchIds.has(camera.branchNodeId)
    );
    
    return { data: filtered };
  });
}

async function hasAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  action: string,
  resourceNodeId: string,
) {
  const decision = await store.checkAccess(
    request.currentUser,
    action as any,
    resourceNodeId,
  );
  
  if (!decision) {
    await reply.code(404).send({ error: "resource_not_found" });
    return false;
  }
  
  if (!decision.allowed) {
    await reply.code(403).send({ error: "forbidden", reason: decision.reason });
    return false;
  }
  
  return true;
}

async function audit(
  request: FastifyRequest,
  store: ControlPlaneStore,
  action: string,
  resourceNodeId: string | null,
  outcome: "success" | "denied" | "failure",
  details?: Record<string, unknown>,
) {
  await store.writeAudit({
    tenantId: request.currentUser.tenantId,
    actorUserId: request.currentUser.id,
    action,
    resourceNodeId,
    outcome,
    sourceIp: request.ip,
    ...(details ? { details } : {}),
  });
}
