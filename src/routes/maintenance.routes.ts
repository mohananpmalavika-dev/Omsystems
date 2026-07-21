import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

function cleanObject<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const idParams = z.object({ id: z.string().uuid() });
const listAssetsQuery = z.object({ category: z.string().optional() });
const listWorkOrdersQuery = z.object({ status: z.string().optional() });
const listAmcQuery = z.object({ vendorId: z.string().uuid().optional() });

const assetSchema = z.object({
  category: z.enum(["camera", "recorder", "storage", "network", "power", "accessory"]),
  assetType: z.string().trim().min(2).max(200),
  serialNumber: z.string().trim().max(200).optional(),
  make: z.string().trim().max(200).optional(),
  model: z.string().trim().max(200).optional(),
  firmwareVersion: z.string().trim().max(200).optional(),
  warrantyExpiresAt: z.string().optional(),
  purchaseDate: z.string().optional(),
  installationDate: z.string().optional(),
  vendorId: z.string().uuid().optional(),
  branchNodeId: z.string().uuid().optional(),
  location: z.string().trim().max(200).optional(),
  mountingHeight: z.string().trim().max(100).optional(),
  status: z.enum(["operational", "degraded", "maintenance_due", "offline", "retired"]).default("operational"),
  notes: z.string().max(2000).optional(),
});

const workOrderSchema = z.object({
  workOrderNumber: z.string().trim().min(2).max(200),
  assetId: z.string().uuid().optional(),
  branchNodeId: z.string().uuid().optional(),
  problem: z.string().trim().min(5).max(2000),
  severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  technician: z.string().trim().max(200).optional(),
  vendorId: z.string().uuid().optional(),
  slaDueAt: z.string().datetime().optional(),
  eta: z.string().datetime().optional(),
  parts: z.array(z.string().trim().max(200)).optional(),
  cost: z.number().nonnegative().optional(),
  rootCause: z.string().max(2000).optional(),
  actionTaken: z.string().max(2000).optional(),
  verification: z.string().max(2000).optional(),
  status: z.enum(["open", "assigned", "in_progress", "resolved", "closed"]).default("open"),
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

export async function registerMaintenanceRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.get("/v1/maintenance/assets", async (request) => {
    const query = listAssetsQuery.parse(request.query);
    return { data: await store.listMaintenanceAssets(request.currentUser.tenantId, query.category as any) };
  });

  app.post("/v1/maintenance/assets", async (request, reply) => {
    const body = assetSchema.parse(request.body);
    if (body.branchNodeId && !(await requireBranchAccess(request, reply, store, body.branchNodeId))) return;
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
    const asset = await store.getMaintenanceAsset(id);
    if (!asset) return reply.code(404).send({ error: "asset_not_found" });
    return asset;
  });

  app.patch("/v1/maintenance/assets/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = assetSchema.partial().parse(request.body);
    if (body.branchNodeId && !(await requireBranchAccess(request, reply, store, body.branchNodeId))) return;
    const payload = { ...cleanObject(body), tenantId: request.currentUser.tenantId, createdBy: request.currentUser.id };
    const asset = await store.updateMaintenanceAsset(id, payload as any);
    if (!asset) return reply.code(404).send({ error: "asset_not_found" });
    return asset;
  });

  app.get("/v1/maintenance/workorders", async (request) => {
    const query = listWorkOrdersQuery.parse(request.query);
    return { data: await store.listWorkOrders(request.currentUser.tenantId, query.status as any) };
  });

  app.post("/v1/maintenance/workorders", async (request, reply) => {
    const body = workOrderSchema.parse(request.body);
    if (body.branchNodeId && !(await requireBranchAccess(request, reply, store, body.branchNodeId))) return;
    const payload = { tenantId: request.currentUser.tenantId, ...cleanObject(body), createdBy: request.currentUser.id };
    const workOrder = await store.createWorkOrder(payload as any);
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "maintenance.workorder_created",
      resourceNodeId: body.branchNodeId ?? "",
      outcome: "success",
      details: { workOrderId: workOrder.id },
    });
    return reply.code(201).send(workOrder);
  });

  app.get("/v1/maintenance/workorders/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const workOrder = await store.getWorkOrder(id);
    if (!workOrder) return reply.code(404).send({ error: "workorder_not_found" });
    return workOrder;
  });

  app.patch("/v1/maintenance/workorders/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = workOrderSchema.partial().parse(request.body);
    if (body.branchNodeId && !(await requireBranchAccess(request, reply, store, body.branchNodeId))) return;
    const payload = { ...cleanObject(body), tenantId: request.currentUser.tenantId, createdBy: request.currentUser.id };
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
    const vendor = await store.getMaintenanceVendor(id);
    if (!vendor) return reply.code(404).send({ error: "vendor_not_found" });
    return vendor;
  });

  app.patch("/v1/maintenance/vendors/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = vendorSchema.partial().parse(request.body);
    const payload = { ...cleanObject(body), tenantId: request.currentUser.tenantId, createdBy: request.currentUser.id };
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
    const contract = await store.getAmcContract(id);
    if (!contract) return reply.code(404).send({ error: "amc_not_found" });
    return contract;
  });

  app.patch("/v1/maintenance/amc/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = amcSchema.partial().parse(request.body);
    const payload = { ...cleanObject(body), tenantId: request.currentUser.tenantId, createdBy: request.currentUser.id };
    const contract = await store.updateAmcContract(id, payload as any);
    if (!contract) return reply.code(404).send({ error: "amc_not_found" });
    return contract;
  });

  // Maintenance plans and schedules
  app.post("/v1/maintenance/plans", async (request, reply) => {
    const body = z.object({ name: z.string().min(2), cadence: z.enum(["daily","weekly","monthly","quarterly","annual"]), checklistTemplate: z.record(z.unknown()).optional(), startDate: z.string().optional(), endDate: z.string().optional() }).parse(request.body);
    const plan = await store.createMaintenancePlan({ tenantId: request.currentUser.tenantId, name: body.name, cadence: body.cadence, checklistTemplate: body.checklistTemplate, startDate: body.startDate, endDate: body.endDate, createdBy: request.currentUser.id });
    await store.writeAudit({ tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id, action: 'maintenance.plan_created', resourceNodeId: null, outcome: 'success', details: { planId: plan.id } });
    return reply.code(201).send(plan);
  });

  app.get("/v1/maintenance/plans", async (request) => ({ data: await store.listMaintenancePlans(request.currentUser.tenantId) }));

  app.post("/v1/maintenance/schedules", async (request, reply) => {
    const body = z.object({ planId: z.string().min(1), branchNodeId: z.string().uuid().optional(), assetId: z.string().uuid().optional(), nextRunAt: z.string().datetime(), cadence: z.string().min(1) }).parse(request.body);
    if (body.branchNodeId && !(await requireBranchAccess(request, reply, store, body.branchNodeId))) return;
    const sched = await store.createMaintenanceSchedule({ tenantId: request.currentUser.tenantId, planId: body.planId, branchNodeId: body.branchNodeId, assetId: body.assetId, nextRunAt: body.nextRunAt, cadence: body.cadence, createdBy: request.currentUser.id });
    await store.writeAudit({ tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id, action: 'maintenance.schedule_created', resourceNodeId: body.branchNodeId ?? null, outcome: 'success', details: { scheduleId: sched.id } });
    return reply.code(201).send(sched);
  });

  app.get("/v1/maintenance/schedules", async (request) => ({ data: await store.listMaintenanceSchedules(request.currentUser.tenantId) }));

  app.post("/v1/maintenance/visits", async (request, reply) => {
    const body = z.object({ scheduleId: z.string().min(1), assignedTo: z.string().optional(), dueAt: z.string().datetime() }).parse(request.body);
    const visit = await store.createMaintenanceVisit({ tenantId: request.currentUser.tenantId, scheduleId: body.scheduleId, assignedTo: body.assignedTo, dueAt: body.dueAt, createdBy: request.currentUser.id });
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
    const rec = await store.ingestPredictiveAlert({ tenantId: request.currentUser.tenantId, assetId: body.assetId, type: body.type, score: body.score, details: body.details, detectedAt: body.detectedAt });
    await store.writeAudit({ tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id, action: 'maintenance.predictive_alert_ingested', resourceNodeId: body.assetId ?? null, outcome: 'success', details: { alertId: rec.id } });
    return reply.code(201).send(rec);
  });

  app.get('/v1/maintenance/predictive-alerts', async (request) => ({ data: await store.listPredictiveAlerts(request.currentUser.tenantId) }));
}
