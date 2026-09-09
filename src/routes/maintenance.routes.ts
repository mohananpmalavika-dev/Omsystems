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
const listWorkOrdersQuery = z.object({
  status: workOrderStatusSchema.optional(),
  branchNodeId: z.string().min(1).max(200).optional(),
});
const listAmcQuery = z.object({ vendorId: z.string().uuid().optional() });
const calendarDate = z.string().date();

const assetSchema = z.object({
  category: assetCategorySchema,
  assetType: z.string().trim().min(2).max(200),
  serialNumber: z.string().trim().max(200).nullable().optional(),
  make: z.string().trim().max(200).nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  firmwareVersion: z.string().trim().max(200).nullable().optional(),
  warrantyExpiresAt: calendarDate.nullable().optional(),
  purchaseDate: calendarDate.nullable().optional(),
  installationDate: calendarDate.nullable().optional(),
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
  contact: z.string().trim().min(2).max(200).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().min(5).max(50).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  gstNumber: z.string().trim().max(50).nullable().optional(),
  serviceCenters: z.array(z.string().trim().min(2).max(200)).max(100).nullable().optional(),
  escalationMatrix: z.record(z.unknown()).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const amcStatusSchema = z.enum(["pending", "active", "suspended", "expired", "cancelled"]);
const amcContractFields = z.object({
  contractNumber: z.string().trim().min(2).max(200),
  vendorId: z.string().uuid(),
  startDate: calendarDate,
  endDate: calendarDate,
  warranty: z.string().trim().max(500).nullable().optional(),
  coverage: z.string().trim().min(5).max(2000),
  exclusions: z.string().trim().max(2000).nullable().optional(),
  paymentTerms: z.string().trim().max(1000).nullable().optional(),
  cost: z.number().nonnegative().nullable().optional(),
  renewal: z.string().trim().max(200).nullable().optional(),
  sla: z.string().trim().max(1000).nullable().optional(),
  status: amcStatusSchema.default("pending"),
  notes: z.string().trim().max(2000).nullable().optional(),
});
const amcSchema = amcContractFields.refine((value) => value.endDate >= value.startDate, {
  path: ["endDate"], message: "end_date_must_not_precede_start_date",
});
const amcPatchSchema = amcContractFields.partial();

async function requireBranchAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  branchNodeId: string,
) {
  const branch = await store.getNode(branchNodeId);
  // Never allow a tenant-scoped registry record to be attached to a branch
  // owned by another tenant, even if an overly broad role was configured.
  if (!branch || branch.type !== "branch" || branch.tenantId !== request.currentUser.tenantId) {
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

function normalizedSerial(value: string | null | undefined) {
  const serial = value?.trim().toLocaleUpperCase();
  return serial || undefined;
}

function normalizedVendorName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase();
}

function normalizedContractNumber(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase();
}

async function ensureUniqueAmcContractNumber(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  contractNumber: string,
  excludeContractId?: string,
) {
  const normalized = normalizedContractNumber(contractNumber);
  const contracts = await store.listAmcContracts(request.currentUser.tenantId);
  if (contracts.some((contract) => contract.id !== excludeContractId && normalizedContractNumber(contract.contractNumber) === normalized)) {
    await reply.code(409).send({ error: "amc_contract_number_already_registered" });
    return false;
  }
  return true;
}

function validAmcStatusTransition(current: string, next: string) {
  const allowed: Record<string, readonly string[]> = {
    pending: ["active", "cancelled"],
    active: ["suspended", "expired", "cancelled"],
    suspended: ["active", "expired", "cancelled"],
    expired: [],
    cancelled: [],
  };
  return current === next || Boolean(allowed[current]?.includes(next));
}

async function ensureUniqueVendorName(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  name: string,
  excludeVendorId?: string,
) {
  const normalized = normalizedVendorName(name);
  const vendors = await store.listMaintenanceVendors(request.currentUser.tenantId);
  if (vendors.some((vendor) => vendor.id !== excludeVendorId && normalizedVendorName(vendor.name) === normalized)) {
    await reply.code(409).send({ error: "vendor_name_already_registered" });
    return false;
  }
  return true;
}

async function ensureUniqueAssetSerial(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  serialNumber: string | null | undefined,
  excludeAssetId?: string,
) {
  const serial = normalizedSerial(serialNumber);
  if (!serial) return true;
  const assets = await store.listMaintenanceAssets(request.currentUser.tenantId);
  if (assets.some((asset) => asset.id !== excludeAssetId && normalizedSerial(asset.serialNumber) === serial)) {
    await reply.code(409).send({ error: "asset_serial_already_registered" });
    return false;
  }
  return true;
}

function generateWorkOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `WO-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

const permittedWorkOrderTransitions: Record<string, readonly string[]> = {
  open: ["assigned"],
  assigned: ["open", "in_progress"],
  in_progress: ["assigned", "resolved"],
  resolved: ["in_progress", "closed"],
  closed: [],
};

function normalizedWorkOrderNumber(value: string) {
  return value.trim().toLocaleUpperCase();
}

async function ensureUniqueWorkOrderNumber(
  request: FastifyRequest,
  reply: FastifyReply,
  store: ControlPlaneStore,
  workOrderNumber: string,
  excludeWorkOrderId?: string,
) {
  const number = normalizedWorkOrderNumber(workOrderNumber);
  const orders = await store.listWorkOrders(request.currentUser.tenantId);
  if (orders.some((order) => order.id !== excludeWorkOrderId && normalizedWorkOrderNumber(order.workOrderNumber) === number)) {
    await reply.code(409).send({ error: "workorder_number_already_registered" });
    return false;
  }
  return true;
}

function validateWorkOrderTransition(
  reply: FastifyReply,
  existing: { status: string; technician?: string; actionTaken?: string; verification?: string },
  update: { status?: string; technician?: string | null; actionTaken?: string | null; verification?: string | null },
) {
  const nextStatus = update.status ?? existing.status;
  if (nextStatus !== existing.status && !permittedWorkOrderTransitions[existing.status]?.includes(nextStatus)) {
    reply.code(409).send({ error: "invalid_workorder_status_transition", from: existing.status, to: nextStatus });
    return false;
  }
  const technician = update.technician === undefined ? existing.technician : update.technician;
  if (["assigned", "in_progress"].includes(nextStatus) && !technician?.trim()) {
    reply.code(400).send({ error: "workorder_assignee_required" });
    return false;
  }
  const actionTaken = update.actionTaken === undefined ? existing.actionTaken : update.actionTaken;
  const verification = update.verification === undefined ? existing.verification : update.verification;
  if (["resolved", "closed"].includes(nextStatus) && (!actionTaken?.trim() || !verification?.trim())) {
    reply.code(400).send({ error: "workorder_resolution_evidence_required" });
    return false;
  }
  return true;
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
    const parsed = assetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const body = parsed.data;
    if (body.branchNodeId && !(await requireBranchAccess(request, reply, store, body.branchNodeId))) return;
    if (body.vendorId && !(await getTenantMaintenanceVendor(request, reply, store, body.vendorId))) return;
    if (!(await ensureUniqueAssetSerial(request, reply, store, body.serialNumber))) return;
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
    const parsed = assetSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const body = parsed.data;
    const existing = await getAccessibleMaintenanceAsset(request, reply, store, id);
    if (!existing) return;
    if (body.branchNodeId && !(await requireBranchAccess(request, reply, store, body.branchNodeId))) return;
    if (body.vendorId && !(await getTenantMaintenanceVendor(request, reply, store, body.vendorId))) return;
    if (body.serialNumber !== undefined && !(await ensureUniqueAssetSerial(request, reply, store, body.serialNumber, id))) return;
    const payload = cleanObject(body);
    const asset = await store.updateMaintenanceAsset(id, payload as any);
    if (!asset) return reply.code(404).send({ error: "asset_not_found" });
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "maintenance.asset_updated",
      resourceNodeId: asset.branchNodeId ?? "",
      outcome: "success",
      details: { assetId: asset.id, changedFields: Object.keys(payload) },
    });
    return asset;
  });

  app.get("/v1/maintenance/workorders", async (request) => {
    const query = listWorkOrdersQuery.parse(request.query);
    const workOrders = await store.listWorkOrders(request.currentUser.tenantId, query.status);
    const accessibleBranchIds = await listAccessibleBranchIds(request, store);
    return {
      data: workOrders.filter(
        (workOrder) => (!query.branchNodeId || workOrder.branchNodeId === query.branchNodeId)
          && (!workOrder.branchNodeId || accessibleBranchIds.has(workOrder.branchNodeId)),
      ),
    };
  });

  app.post("/v1/maintenance/workorders", async (request, reply) => {
    const parsed = workOrderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const body = parsed.data;
    if (body.status !== "open") return reply.code(400).send({ error: "workorder_must_start_open" });
    const asset = await resolveWorkOrderAsset(request, reply, store, body.assetId ?? undefined);
    if (asset === null) return;
    if (!(await validateWorkOrderVendor(request, reply, store, body.vendorId ?? undefined))) return;
    if (body.branchNodeId && asset?.branchNodeId && body.branchNodeId !== asset.branchNodeId) {
      return reply.code(400).send({ error: "asset_branch_mismatch" });
    }
    const branchNodeId = body.branchNodeId ?? asset?.branchNodeId;
    if (branchNodeId && !(await requireBranchAccess(request, reply, store, branchNodeId))) return;
    const workOrderNumber = normalizedWorkOrderNumber(body.workOrderNumber ?? generateWorkOrderNumber());
    if (!(await ensureUniqueWorkOrderNumber(request, reply, store, workOrderNumber))) return;
    const payload = {
      tenantId: request.currentUser.tenantId,
      ...cleanObject(body),
      workOrderNumber,
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
    const parsed = workOrderSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const body = parsed.data;
    const existing = await getAccessibleWorkOrder(request, reply, store, id);
    if (!existing) return;
    if (!validateWorkOrderTransition(reply, existing, body)) return;
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
    const branchNodeId = body.branchNodeId !== undefined
      ? body.branchNodeId
      : asset?.branchNodeId ?? effectiveAsset?.branchNodeId ?? existing.branchNodeId;
    if (effectiveAsset?.branchNodeId && branchNodeId !== effectiveAsset.branchNodeId) {
      return reply.code(400).send({ error: "asset_branch_mismatch" });
    }
    if (branchNodeId && !(await requireBranchAccess(request, reply, store, branchNodeId))) return;
    if (body.workOrderNumber !== undefined && !(await ensureUniqueWorkOrderNumber(request, reply, store, body.workOrderNumber, id))) return;
    const payload = {
      ...cleanObject(body),
      ...(body.workOrderNumber !== undefined ? { workOrderNumber: normalizedWorkOrderNumber(body.workOrderNumber) } : {}),
      ...(branchNodeId ? { branchNodeId } : {}),
    };
    const workOrder = await store.updateWorkOrder(id, payload as any);
    if (!workOrder) return reply.code(404).send({ error: "workorder_not_found" });
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "maintenance.workorder_updated",
      resourceNodeId: workOrder.branchNodeId ?? "",
      outcome: "success",
      details: { workOrderId: workOrder.id, changedFields: Object.keys(payload), previousStatus: existing.status, status: workOrder.status },
    });
    return workOrder;
  });

  app.get("/v1/maintenance/vendors", async (request) => {
    return { data: await store.listMaintenanceVendors(request.currentUser.tenantId) };
  });

  app.post("/v1/maintenance/vendors", async (request, reply) => {
    const parsed = vendorSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const body = parsed.data;
    if (!(await ensureUniqueVendorName(request, reply, store, body.name))) return;
    const payload = { tenantId: request.currentUser.tenantId, ...cleanObject(body), name: body.name.trim().replace(/\s+/g, " "), createdBy: request.currentUser.id };
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
    const parsed = vendorSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const body = parsed.data;
    const existing = await getTenantMaintenanceVendor(request, reply, store, id);
    if (!existing) return;
    if (body.name !== undefined && !(await ensureUniqueVendorName(request, reply, store, body.name, id))) return;
    const payload = cleanObject(body);
    const vendor = await store.updateMaintenanceVendor(id, payload as any);
    if (!vendor) return reply.code(404).send({ error: "vendor_not_found" });
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "maintenance.vendor_updated",
      resourceNodeId: request.currentUser.tenantId,
      outcome: "success",
      details: { vendorId: vendor.id, changedFields: Object.keys(payload) },
    });
    return vendor;
  });

  app.get("/v1/maintenance/amc", async (request) => {
    const query = listAmcQuery.parse(request.query);
    return { data: await store.listAmcContracts(request.currentUser.tenantId, query.vendorId) };
  });

  app.post("/v1/maintenance/amc", async (request, reply) => {
    const parsed = amcSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const body = parsed.data;
    if (!(await getTenantMaintenanceVendor(request, reply, store, body.vendorId))) return;
    if (!(await ensureUniqueAmcContractNumber(request, reply, store, body.contractNumber))) return;
    const payload = { tenantId: request.currentUser.tenantId, ...cleanObject(body), contractNumber: normalizedContractNumber(body.contractNumber), createdBy: request.currentUser.id };
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
    const parsed = amcPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const body = parsed.data;
    const existing = await getTenantAmcContract(request, reply, store, id);
    if (!existing) return;
    if (body.vendorId && !(await getTenantMaintenanceVendor(request, reply, store, body.vendorId))) return;
    const startDate = body.startDate ?? existing.startDate;
    const endDate = body.endDate ?? existing.endDate;
    if (endDate < startDate) return reply.code(400).send({ error: "end_date_must_not_precede_start_date" });
    if (body.status !== undefined && !validAmcStatusTransition(existing.status, body.status)) {
      return reply.code(409).send({ error: "invalid_amc_status_transition", from: existing.status, to: body.status });
    }
    if (body.contractNumber !== undefined && !(await ensureUniqueAmcContractNumber(request, reply, store, body.contractNumber, id))) return;
    const payload = cleanObject(body);
    if (body.contractNumber !== undefined) payload.contractNumber = normalizedContractNumber(body.contractNumber);
    const contract = await store.updateAmcContract(id, payload as any);
    if (!contract) return reply.code(404).send({ error: "amc_not_found" });
    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "maintenance.amc_updated",
      resourceNodeId: request.currentUser.tenantId,
      outcome: "success",
      details: { amcId: contract.id, changedFields: Object.keys(payload), previousStatus: existing.status, status: contract.status },
    });
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
