import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

const lifecycleStates = [
  "discovered",
  "pending-approval",
  "approved",
  "configured",
  "operational",
  "maintenance",
  "suspended",
  "decommissioned",
] as const;

const deviceInventorySchema = z.object({
  deviceId: z.string().trim().min(1).max(120),
  tenant: z.string().trim().min(1).max(200).optional(),
  region: z.string().trim().min(1).max(200),
  branch: z.string().trim().min(1).max(200),
  deviceType: z.enum([
    "ip-camera",
    "analog-camera-dvr",
    "nvr",
    "dvr",
    "encoder",
    "edge-server",
    "storage-device",
    "network-switch",
    "ups",
    "access-control-panel",
    "alarm-panel",
  ]),
  manufacturer: z.string().trim().min(1).max(200),
  model: z.string().trim().min(1).max(200),
  serialNumber: z.string().trim().max(200).optional(),
  macAddress: z.string().trim().max(80).optional(),
  ipAddress: z.string().trim().max(100).optional(),
  firmwareVersion: z.string().trim().max(200).optional(),
  onvifVersion: z.string().trim().max(100).optional(),
  capabilities: z.array(z.string().trim().min(1).max(100)).default([]),
  credentialReference: z.string().trim().max(500).optional(),
  installationDate: z.string().trim().max(100).optional(),
  warranty: z.string().trim().max(200).optional(),
  amcContract: z.string().trim().max(200).optional(),
  healthStatus: z.string().trim().max(100).default("unknown"),
  lastCommunication: z.string().trim().max(100).optional(),
  configurationTemplate: z.string().trim().max(200).optional(),
  riskClassification: z.string().trim().max(100).default("medium"),
  lifecycleState: z.enum(lifecycleStates).default("discovered"),
}).strict();

const updateDeviceInventorySchema = deviceInventorySchema.partial().extend({
  capabilities: z.array(z.string().trim().min(1).max(100)).optional(),
});

const listQuerySchema = z.object({
  branch: z.string().trim().min(1).max(200).optional(),
  tenant: z.string().trim().min(1).max(200).optional(),
});

async function ensureBranchAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  branchNodeId: string,
  action: "live:view" | "device:configure" = "live:view",
) {
  const branch = await store.getNode(branchNodeId);
  if (!branch || branch.type !== "branch") {
    await reply.code(404).send({ error: "branch_not_found" });
    return false;
  }
  const decision = await store.checkAccess(request.currentUser, action, branchNodeId);
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

export async function registerDeviceInventoryRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.get("/v1/device-inventory", async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    const tenantId = query.tenant ?? request.currentUser.tenantId;
    if (query.branch) {
      if (!(await ensureBranchAccess(request, reply, store, query.branch, "live:view"))) return;
    }
    return { data: await store.listDeviceInventory(tenantId, query.branch) };
  });

  app.post("/v1/device-inventory", async (request, reply) => {
    const body = deviceInventorySchema.parse(request.body);
    if (!(await ensureBranchAccess(request, reply, store, body.branch, "device:configure"))) return;

    const record = await store.createDeviceInventoryRecord({
      tenantId: request.currentUser.tenantId,
      tenant: body.tenant ?? request.currentUser.tenantId,
      ...body,
    });

    return reply.code(201).send(record);
  });

  app.get("/v1/device-inventory/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const record = await store.getDeviceInventory(id);
    if (!record) return reply.code(404).send({ error: "device_not_found" });
    if (!(await ensureBranchAccess(request, reply, store, record.branch, "live:view"))) return;
    return record;
  });

  app.patch("/v1/device-inventory/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = updateDeviceInventorySchema.parse(request.body);
    const existing = await store.getDeviceInventory(id);
    if (!existing) return reply.code(404).send({ error: "device_not_found" });
    if (!(await ensureBranchAccess(request, reply, store, existing.branch, "device:configure"))) return;

    const updated = await store.updateDeviceInventory(id, {
      ...body,
      tenantId: request.currentUser.tenantId,
      tenant: body.tenant ?? existing.tenant,
    });

    return updated ?? reply.code(404).send({ error: "device_not_found" });
  });
}
