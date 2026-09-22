import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { AutoStorageTelemetryService } from "../services/auto-storage-telemetry.service.js";

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

const updateDeviceInventorySchema = deviceInventorySchema.partial().omit({
  // Identity and placement changes need an explicit, audited migration flow.
  // Accepting them in a generic PATCH can move a device across a tenant or
  // branch without checking access to the new scope.
  deviceId: true,
  tenant: true,
  branch: true,
}).extend({
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
  if (!branch || branch.type !== "branch" || branch.tenantId !== request.currentUser.tenantId) {
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
  // Initialize auto storage telemetry service
  const pool = (store as any).pool || (store as any).db;
  const autoStorageService = pool ? new AutoStorageTelemetryService(pool) : null;
  
  if (!autoStorageService) {
    app.log.warn('Auto storage telemetry service not initialized - database pool not available');
  }
  app.get("/v1/device-inventory", async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    if (query.tenant && query.tenant !== request.currentUser.tenantId) {
      return reply.code(403).send({ error: "cross_tenant_inventory_access_denied" });
    }
    const tenantId = request.currentUser.tenantId;
    if (query.branch) {
      if (!(await ensureBranchAccess(request, reply, store, query.branch, "live:view"))) return;
    }
    return { data: await store.listDeviceInventory(tenantId, query.branch) };
  });

  app.post("/v1/device-inventory", async (request, reply) => {
    const body = deviceInventorySchema.parse(request.body);
    if (body.tenant && body.tenant !== request.currentUser.tenantId) {
      return reply.code(400).send({ error: "tenant_must_match_authenticated_tenant" });
    }
    if (!(await ensureBranchAccess(request, reply, store, body.branch, "device:configure"))) return;

    const record = await store.createDeviceInventoryRecord({
      tenantId: request.currentUser.tenantId,
      tenant: request.currentUser.tenantId,
      deviceId: body.deviceId,
      region: body.region,
      branch: body.branch,
      deviceType: body.deviceType,
      manufacturer: body.manufacturer,
      model: body.model,
      serialNumber: body.serialNumber,
      macAddress: body.macAddress,
      ipAddress: body.ipAddress,
      firmwareVersion: body.firmwareVersion,
      onvifVersion: body.onvifVersion,
      capabilities: body.capabilities,
      credentialReference: body.credentialReference,
      installationDate: body.installationDate,
      warranty: body.warranty,
      amcContract: body.amcContract,
      healthStatus: body.healthStatus,
      lastCommunication: body.lastCommunication,
      configurationTemplate: body.configurationTemplate,
      riskClassification: body.riskClassification,
      lifecycleState: body.lifecycleState,
    });

    // Automatically collect storage telemetry for NVR/DVR/Storage devices
    if (autoStorageService && ['nvr', 'dvr', 'storage-device'].includes(body.deviceType)) {
      try {
        const telemetryCount = await autoStorageService.collectStorageTelemetryForDevice(record);
        app.log.info({
          deviceId: record.deviceId,
          deviceType: record.deviceType,
          telemetryCount,
        }, 'Auto-collected storage telemetry for new device');
      } catch (error) {
        app.log.error({ error, deviceId: record.deviceId }, 'Failed to auto-collect storage telemetry');
        // Don't fail the device creation if telemetry collection fails
      }
    }

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
    const parsedBody = updateDeviceInventorySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "invalid_device_inventory_update",
        message: "Device identity and branch placement cannot be changed through this endpoint",
      });
    }
    const body = parsedBody.data;
    const existing = await store.getDeviceInventory(id);
    if (!existing) return reply.code(404).send({ error: "device_not_found" });
    if (existing.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: "device_not_found" });
    }
    if (!(await ensureBranchAccess(request, reply, store, existing.branch, "device:configure"))) return;

    const updated = await store.updateDeviceInventory(id, {
      ...body,
      tenantId: request.currentUser.tenantId,
      tenant: existing.tenant,
    });

    // If lifecycle state changed to operational, collect storage telemetry
    if (autoStorageService && 
        body.lifecycleState === 'operational' && 
        existing.lifecycleState !== 'operational' &&
        ['nvr', 'dvr', 'storage-device'].includes(existing.deviceType)) {
      try {
        const telemetryCount = await autoStorageService.collectStorageTelemetryForDevice({
          ...existing,
          lifecycleState: 'operational',
        });
        app.log.info({
          deviceId: existing.deviceId,
          deviceType: existing.deviceType,
          telemetryCount,
        }, 'Auto-collected storage telemetry when device became operational');
      } catch (error) {
        app.log.error({ error, deviceId: existing.deviceId }, 'Failed to auto-collect storage telemetry on state change');
      }
    }

    return updated ?? reply.code(404).send({ error: "device_not_found" });
  });

  // Manual storage telemetry refresh endpoint
  app.post("/v1/device-inventory/:id/refresh-storage", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    
    if (!autoStorageService) {
      return reply.code(503).send({ 
        error: "service_unavailable", 
        message: "Auto storage telemetry service not available" 
      });
    }
    
    const existing = await store.getDeviceInventory(id);
    if (!existing) return reply.code(404).send({ error: "device_not_found" });
    if (existing.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: "device_not_found" });
    }
    if (!(await ensureBranchAccess(request, reply, store, existing.branch, "device:configure"))) return;

    if (!['nvr', 'dvr', 'storage-device'].includes(existing.deviceType)) {
      return reply.code(400).send({ 
        error: "invalid_device_type",
        message: "Storage telemetry refresh is only available for NVR, DVR, and storage devices"
      });
    }

    try {
      const telemetryCount = await autoStorageService.refreshStorageTelemetry(
        existing.deviceId,
        existing.branch,
        existing.tenantId
      );

      return {
        success: true,
        message: "Storage telemetry refreshed",
        deviceId: existing.deviceId,
        telemetryRecordsCreated: telemetryCount,
      };
    } catch (error) {
      app.log.error({ error, deviceId: existing.deviceId }, 'Failed to refresh storage telemetry');
      return reply.code(500).send({
        error: "refresh_failed",
        message: error instanceof Error ? error.message : "Failed to refresh storage telemetry"
      });
    }
  });
}
