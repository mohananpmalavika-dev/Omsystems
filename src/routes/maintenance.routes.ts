import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

function cleanObject<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const idParams = z.object({ id: z.string().uuid() });
const assetCategorySchema = z.enum(["camera", "recorder", "storage", "network", "power", "accessory"]);
const workOrderStatusSchema = z.enum(["open", "assigned", "in_progress", "resolved", "closed"]);
const listAssetsQuery = z.object({ category: assetCategorySchema.optional() });
const listWorkOrdersQuery = z.object({ status: workOrderStatusSchema.optional() });
const listAmcQuery = z.object({ vendorId: z.string().uuid().optional() });

const assetSchema = z.object({
  category: assetCategorySchema,
  assetType: z.string().trim().min(2).max(200),
  serialNumber: z.string().trim().max(200).nullable().optional(),
  make: z.string().trim().max(200).nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  firmwareVersion: z.string().trim().max(200).nullable().optional(),
  warrantyExpiresAt: z.string().nullable().optional(),
  purchaseDate: z.string().nullable().optional(),
  installationDate: z.string().nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  branchNodeId: z.string().uuid().nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  mountingHeight: z.string().trim().max(100).nullable().optional(),
  status: z.enum(["operational", "degraded", "maintenance_due", "offline", "retired"]).default("operational"),
  notes: z.string().max(2000).nullable().optional(),
});

const workOrderSchema = z.object({
  workOrderNumber: z.string().trim().min(2).max(200).optional(),
  assetId: z.string().uuid().nullable().optional(),
  branchNodeId: z.string().uuid().nullable().optional(),
  problem: z.string().trim().min(5).max(2000),
  severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  technician: z.string().trim().max(200).nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  slaDueAt: z.string().datetime().nullable().optional(),
  eta: z.string().datetime().nullable().optional(),
  parts: z.array(z.string().trim().max(200)).nullable().optional(),
  cost: z.number().nonnegative().nullable().optional(),
  rootCause: z.string().max(2000).nullable().optional(),
  actionTaken: z.string().max(2000).nullable().optional(),
  verification: z.string().max(2000).nullable().optional(),
  status: workOrderStatusSchema.default("open"),
});

const vendorSchema = z.object({
  name: z.string().trim().min(2).max(200),
  contact: z.string().trim().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(50).optional(),
  address: z.string().max(500).optional(),
  gstNumber: z.string().trim().max(50).optional(),
  serviceCenters: z.array(z.string().trim().max(200)).optional(),
  escalationMatrix: z.record(z.unknown()).optional(),
  notes: z.string().max(2000).optional(),
});

const amcSchema = z.object({
  contractNumber: z.string().trim().min(2).max(200),
  vendorId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  warranty: z.string().max(500).optional(),
  coverage: z.string().max(2000).optional(),
  exclusions: z.string().max(2000).optional(),
  paymentTerms: z.string().max(1000).optional(),
  cost: z.number().nonnegative().optional(),
  renewal: z.string().max(200).optional(),
  sla: z.string().max(1000).optional(),
  status: z.string().trim().max(100).default("active"),
  notes: z.string().max(2000).optional(),
});

async function requireBranchAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  branchNodeId: string,
) {
  const branch = await store.getNode(branchNodeId);
  if (!branch || branch.type !== "branch") {
    await reply.code(404).send({ error: "branch_not_found" });
    return false;
  }
  const decision = await store.checkAccess(request.currentUser, "device:configure", branchNodeId);
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

function generateWorkOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `WO-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function getAccessibleWorkOrder(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  id: string,
) {
  const workOrder = await store.getWorkOrder(id);
  if (!workOrder || workOrder.tenantId !== request.currentUser.tenantId) {
    await reply.code(404).send({ error: "workorder_not_found" });
    return undefined;
  }
  if (
    workOrder.branchNodeId
    && !(await requireBranchAccess(request, reply, store, workOrder.branchNodeId))
  ) {
    return undefined;
  }
  return workOrder;
}

async function listAccessibleBranchIds(request: FastifyRequest, store: ControlPlaneStore) {
  const branches = await store.listAccessibleNodes(request.currentUser, "device:configure", "branch");
  return new Set(branches.map((branch) => branch.id));
}

async function getAccessibleMaintenanceAsset(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  id: string,
) {
  const asset = await store.getMaintenanceAsset(id);
  if (!asset || asset.tenantId !== request.currentUser.tenantId) {
    await reply.code(404).send({ error: "asset_not_found" });
    return undefined;
  }
  if (
    asset.branchNodeId
    && !(await requireBranchAccess(request, reply, store, asset.branchNodeId))
  ) {
    return undefined;
  }
  return asset;
}

async function getTenantMaintenanceVendor(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  id: string,
) {
  const vendor = await store.getMaintenanceVendor(id);
  if (!vendor || vendor.tenantId !== request.currentUser.tenantId) {
    await reply.code(404).send({ error: "vendor_not_found" });
    return undefined;
  }
  return vendor;
}

async function getTenantAmcContract(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  id: string,
) {
  const contract = await store.getAmcContract(id);
  if (!contract || contract.tenantId !== request.currentUser.tenantId) {
    await reply.code(404).send({ error: "amc_not_found" });
    return undefined;
  }
  return contract;
}

async function resolveWorkOrderAsset(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  assetId: string | undefined,
) {
  if (!assetId) return undefined;
  const asset = await store.getMaintenanceAsset(assetId);
  if (!asset || asset.tenantId !== request.currentUser.tenantId) {
    await reply.code(404).send({ error: "asset_not_found" });
    return null;
  }
  return asset;
}

async function validateWorkOrderVendor(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  vendorId: string | undefined,
) {
  if (!vendorId) return true;
  const vendor = await store.getMaintenanceVendor(vendorId);
  if (!vendor || vendor.tenantId !== request.currentUser.tenantId) {
    await reply.code(404).send({ error: "vendor_not_found" });
    return false;
  }
  return true;
}

export async function registerMaintenanceRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.get("/v1/maintenance/assets", async (request) => {
    const query = listAssetsQuery.parse(request.query);
    const assets = await store.listMaintenanceAssets(request.currentUser.tenantId, query.category);
    const accessibleBranchIds = await listAccessibleBranchIds(request, store);
    return {
      data: assets.filter((asset) => !asset.branchNodeId || accessibleBranchIds.has(asset.branchNodeId)),
    };
  });

  app.post("/v1/maintenance/assets", async (request, reply) => {
    const body = assetSchema.parse(request.body);
    if (body.branchNodeId && !(await requireBranchAccess(request, reply, store, body.branchNodeId))) return;
    if (body.vendorId && !(await getTenantMaintenanceVendor(request, reply, store, body.vendorId))) return;
    const payload = { tenantId: request.currentUser.tenantId, ...cleanObject(body), createdBy: request.currentUser.id };
    const asset = await store.createMaintenanceAsset(payload as any);
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "maintenance.asset_created",
      resourceNodeId: body.branchNodeId ?? "",
      outcome: "success",
      details: { assetId: asset.id },
    });
    return reply.code(201).send(asset);
  });

  app.get("/v1/maintenance/assets/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    return getAccessibleMaintenanceAsset(request, reply, store, id);
  });

  app.patch("/v1/maintenance/assets/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = assetSchema.partial().parse(request.body);
    const existing = await getAccessibleMaintenanceAsset(request, reply, store, id);
    if (!existing) return;
    if (body.branchNodeId && !(await requireBranchAccess(request, reply, store, body.branchNodeId))) return;
    if (body.vendorId && !(await getTenantMaintenanceVendor(request, reply, store, body.vendorId))) return;
    const payload = cleanObject(body);
    const asset = await store.updateMaintenanceAsset(id, payload as any);
    if (!asset) return reply.code(404).send({ error: "asset_not_found" });
    return asset;
  });

  app.get("/v1/maintenance/workorders", async (request) => {
    const query = listWorkOrdersQuery.parse(request.query);
    const workOrders = await store.listWorkOrders(request.currentUser.tenantId, query.status);
    const accessibleBranchIds = await listAccessibleBranchIds(request, store);
    return {
      data: workOrders.filter(
        (workOrder) => !workOrder.branchNodeId || accessibleBranchIds.has(workOrder.branchNodeId),
      ),
    };
  });

  app.post("/v1/maintenance/workorders", async (request, reply) => {
    const body = workOrderSchema.parse(request.body);
    const asset = await resolveWorkOrderAsset(request, reply, store, body.assetId ?? undefined);
    if (asset === null) return;
    if (!(await validateWorkOrderVendor(request, reply, store, body.vendorId ?? undefined))) return;
    if (body.branchNodeId && asset?.branchNodeId && body.branchNodeId !== asset.branchNodeId) {
      return reply.code(400).send({ error: "asset_branch_mismatch" });
    }
    const branchNodeId = body.branchNodeId ?? asset?.branchNodeId;
    if (branchNodeId && !(await requireBranchAccess(request, reply, store, branchNodeId))) return;
    const payload = {
      tenantId: request.currentUser.tenantId,
      ...cleanObject(body),
      workOrderNumber: body.workOrderNumber ?? generateWorkOrderNumber(),
      ...(branchNodeId ? { branchNodeId } : {}),
      createdBy: request.currentUser.id,
    };
    const workOrder = await store.createWorkOrder(payload as any);
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "maintenance.workorder_created",
      resourceNodeId: branchNodeId ?? "",
      outcome: "success",
      details: { workOrderId: workOrder.id },
    });
    return reply.code(201).send(workOrder);
  });

  app.get("/v1/maintenance/workorders/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    return getAccessibleWorkOrder(request, reply, store, id);
  });

  app.patch("/v1/maintenance/workorders/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = workOrderSchema.partial().parse(request.body);
    const existing = await getAccessibleWorkOrder(request, reply, store, id);
    if (!existing) return;
    const asset = await resolveWorkOrderAsset(request, reply, store, body.assetId ?? undefined);
    if (asset === null) return;
    if (!(await validateWorkOrderVendor(request, reply, store, body.vendorId ?? undefined))) return;
    const effectiveAsset = asset
      ?? (existing.assetId ? await resolveWorkOrderAsset(request, reply, store, existing.assetId) : undefined);
    if (effectiveAsset === null) return;
    if (
      body.branchNodeId
      && effectiveAsset?.branchNodeId
      && body.branchNodeId !== effectiveAsset.branchNodeId
    ) {
      return reply.code(400).send({ error: "asset_branch_mismatch" });
    }
    const branchNodeId = body.branchNodeId ?? asset?.branchNodeId;
    if (branchNodeId && !(await requireBranchAccess(request, reply, store, branchNodeId))) return;
    const payload = {
      ...cleanObject(body),
      ...(branchNodeId ? { branchNodeId } : {}),
    };
    const workOrder = await store.updateWorkOrder(id, payload as any);
    if (!workOrder) return reply.code(404).send({ error: "workorder_not_found" });
    return workOrder;
  });

  app.get("/v1/maintenance/vendors", async (request) => {
    return { data: await store.listMaintenanceVendors(request.currentUser.tenantId) };
  });

  app.post("/v1/maintenance/vendors", async (request, reply) => {
    const body = vendorSchema.parse(request.body);
    const payload = { tenantId: request.currentUser.tenantId, ...cleanObject(body), createdBy: request.currentUser.id };
    const vendor = await store.createMaintenanceVendor(payload as any);
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "maintenance.vendor_created",
      resourceNodeId: request.currentUser.tenantId,
      outcome: "success",
      details: { vendorId: vendor.id },
    });
    return reply.code(201).send(vendor);
  });

  app.get("/v1/maintenance/vendors/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    return getTenantMaintenanceVendor(request, reply, store, id);
  });

  app.patch("/v1/maintenance/vendors/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = vendorSchema.partial().parse(request.body);
    const existing = await getTenantMaintenanceVendor(request, reply, store, id);
    if (!existing) return;
    const payload = cleanObject(body);
    const vendor = await store.updateMaintenanceVendor(id, payload as any);
    if (!vendor) return reply.code(404).send({ error: "vendor_not_found" });
    return vendor;
  });

  app.get("/v1/maintenance/amc", async (request) => {
    const query = listAmcQuery.parse(request.query);
    return { data: await store.listAmcContracts(request.currentUser.tenantId, query.vendorId) };
  });

  app.post("/v1/maintenance/amc", async (request, reply) => {
    const body = amcSchema.parse(request.body);
    if (!(await getTenantMaintenanceVendor(request, reply, store, body.vendorId))) return;
    const payload = { tenantId: request.currentUser.tenantId, ...cleanObject(body), createdBy: request.currentUser.id };
    const contract = await store.createAmcContract(payload as any);
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "maintenance.amc_created",
      resourceNodeId: request.currentUser.tenantId,
      outcome: "success",
      details: { amcId: contract.id },
    });
    return reply.code(201).send(contract);
  });

  app.get("/v1/maintenance/amc/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    return getTenantAmcContract(request, reply, store, id);
  });

  app.patch("/v1/maintenance/amc/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = amcSchema.partial().parse(request.body);
    const existing = await getTenantAmcContract(request, reply, store, id);
    if (!existing) return;
    if (body.vendorId && !(await getTenantMaintenanceVendor(request, reply, store, body.vendorId))) return;
    const payload = cleanObject(body);
    const contract = await store.updateAmcContract(id, payload as any);
    if (!contract) return reply.code(404).send({ error: "amc_not_found" });
    return contract;
  });

  // Maintenance plans and schedules
  app.post("/v1/maintenance/plans", async (request, reply) => {
    const body = z.object({ name: z.string().min(2), cadence: z.enum(["daily","weekly","monthly","quarterly","annual"]), checklistTemplate: z.record(z.unknown()).optional(), startDate: z.string().optional(), endDate: z.string().optional() }).parse(request.body);
    const plan = await store.createMaintenancePlan({ 
      tenantId: request.currentUser.tenantId, 
      name: body.name, 
      cadence: body.cadence, 
      ...(body.checklistTemplate && { checklistTemplate: body.checklistTemplate }),
      ...(body.startDate && { startDate: body.startDate }),
      ...(body.endDate && { endDate: body.endDate }),
      createdBy: request.currentUser.id 
    });
    await store.writeAudit({ tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id, action: 'maintenance.plan_created', resourceNodeId: null, outcome: 'success', details: { planId: plan.id } });
    return reply.code(201).send(plan);
  });

  app.get("/v1/maintenance/plans", async (request) => ({ data: await store.listMaintenancePlans(request.currentUser.tenantId) }));

  app.post("/v1/maintenance/schedules", async (request, reply) => {
    const body = z.object({ planId: z.string().min(1), branchNodeId: z.string().uuid().optional(), assetId: z.string().uuid().optional(), nextRunAt: z.string().datetime(), cadence: z.string().min(1) }).parse(request.body);
    if (body.branchNodeId && !(await requireBranchAccess(request, reply, store, body.branchNodeId))) return;
    const sched = await store.createMaintenanceSchedule({ 
      tenantId: request.currentUser.tenantId, 
      planId: body.planId, 
      ...(body.branchNodeId && { branchNodeId: body.branchNodeId }),
      ...(body.assetId && { assetId: body.assetId }),
      nextRunAt: body.nextRunAt, 
      cadence: body.cadence, 
      createdBy: request.currentUser.id 
    });
    await store.writeAudit({ tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id, action: 'maintenance.schedule_created', resourceNodeId: body.branchNodeId ?? null, outcome: 'success', details: { scheduleId: sched.id } });
    return reply.code(201).send(sched);
  });

  app.get("/v1/maintenance/schedules", async (request) => ({ data: await store.listMaintenanceSchedules(request.currentUser.tenantId) }));

  app.post("/v1/maintenance/visits", async (request, reply) => {
    const body = z.object({ scheduleId: z.string().min(1), assignedTo: z.string().optional(), dueAt: z.string().datetime() }).parse(request.body);
    const visit = await store.createMaintenanceVisit({ 
      tenantId: request.currentUser.tenantId, 
      scheduleId: body.scheduleId, 
      ...(body.assignedTo && { assignedTo: body.assignedTo }),
      dueAt: body.dueAt, 
      createdBy: request.currentUser.id 
    });
    await store.writeAudit({ tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id, action: 'maintenance.visit_created', resourceNodeId: null, outcome: 'success', details: { visitId: visit.id } });
    return reply.code(201).send(visit);
  });

  app.get("/v1/maintenance/visits", async (request) => {
    const query = z.object({ status: z.string().optional() }).parse(request.query);
    return { data: await store.listMaintenanceVisits(request.currentUser.tenantId, { status: query.status }) };
  });

  app.patch("/v1/maintenance/visits/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = z.object({ status: z.string().optional(), assignedTo: z.string().optional(), verification: z.string().optional(), notes: z.string().optional() }).parse(request.body);
    const updated = await store.updateMaintenanceVisit(id, { ...body, updatedBy: request.currentUser.id });
    if (!updated) return reply.code(404).send({ error: 'visit_not_found' });
    return updated;
  });

  // Predictive alerts ingestion
  app.post('/v1/maintenance/predictive-alerts', async (request, reply) => {
    const body = z.object({ assetId: z.string().uuid().optional(), type: z.string().min(1), score: z.number().min(0).max(1), details: z.record(z.unknown()).optional(), detectedAt: z.string().datetime() }).parse(request.body);
    const rec = await store.ingestPredictiveAlert({ 
      tenantId: request.currentUser.tenantId, 
      ...(body.assetId && { assetId: body.assetId }),
      type: body.type, 
      score: body.score, 
      ...(body.details && { details: body.details }),
      detectedAt: body.detectedAt 
    });
    await store.writeAudit({ tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id, action: 'maintenance.predictive_alert_ingested', resourceNodeId: body.assetId ?? null, outcome: 'success', details: { alertId: rec.id } });
    return reply.code(201).send(rec);
  });

  app.get('/v1/maintenance/predictive-alerts', async (request) => ({ data: await store.listPredictiveAlerts(request.currentUser.tenantId) }));
}
