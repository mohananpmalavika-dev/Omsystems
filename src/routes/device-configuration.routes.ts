/**
 * Device Configuration Center Routes
 * 
 * Exposes standardized REST endpoints for DVR/NVR and IP Camera Configuration.
 * Enforces:
 * - Authentication (request.currentUser)
 * - Tenant & Node authorization (store.checkAccess)
 * - Standardized error status codes (400, 403, 404, 422, 500)
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  DeviceConfigurationService,
  ConfigurationError,
} from "../services/device-configuration.service.js";
import type {
  RecordingSchedule,
  ChannelVideoConfig,
  DeviceTimeConfig,
  DeviceNetworkConfig,
  TemplateTargetClassification,
  GoldenTemplateSettings,
} from "../types/device-configuration.types.js";
import { DeviceTemplateService } from "../services/device-template-service.js";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

const querySchema = z.object({
  tenantId: z.string().trim().optional(),
  channelId: z.string().trim().optional(),
  profileToken: z.string().trim().optional(),
});

const setVideoConfigSchema = z.object({
  codec: z.enum(["H264", "H265", "MJPEG", "MPEG4"]),
  resolution: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  fps: z.number().int().min(1).max(120),
  bitrateKbps: z.number().int().min(32).max(100_000),
  quality: z.number().int().min(1).max(100).optional(),
  govLength: z.number().int().min(1).max(1000).optional(),
  h264Profile: z.enum(["Baseline", "Main", "Extended", "High"]).optional(),
  streamProfileToken: z.string().optional(),
});

const setImagingConfigSchema = z.object({
  brightness: z.number().min(0).max(100).optional(),
  contrast: z.number().min(0).max(100).optional(),
  colorSaturation: z.number().min(0).max(100).optional(),
  sharpness: z.number().min(0).max(100).optional(),
  irCutFilter: z.enum(["ON", "OFF", "AUTO"]).optional(),
  exposure: z
    .object({
      mode: z.enum(["AUTO", "MANUAL"]).optional(),
      exposureTime: z.number().positive().optional(),
      gain: z.number().min(0).optional(),
      iris: z.number().min(0).optional(),
    })
    .optional(),
  wideDynamicRange: z
    .object({
      mode: z.enum(["OFF", "ON"]).optional(),
      level: z.number().min(0).max(100).optional(),
    })
    .optional(),
  whiteBalance: z
    .object({
      mode: z.enum(["AUTO", "MANUAL"]).optional(),
      crGain: z.number().min(0).optional(),
      cbGain: z.number().min(0).optional(),
    })
    .optional(),
});

const rollbackSchema = z.object({
  snapshotId: z.string().min(1),
});

const setTimeConfigSchema = z.object({
  dateTimeType: z.enum(["Manual", "NTP"]),
  timeZone: z.string().trim().min(1).optional(),
  ntpServer: z.string().trim().min(1).optional(),
  utcDateTime: z.string().trim().optional(),
  daylightSavings: z.boolean().optional(),
});

const channelParamsSchema = z.object({
  id: z.string().trim().min(1),
  channelId: z.string().trim().min(1),
});

const schedulePeriodSchema = z
  .object({
    startHour: z.number().int().min(0).max(23),
    startMinute: z.number().int().min(0).max(59),
    endHour: z.number().int().min(0).max(24),
    endMinute: z.number().int().min(0).max(59),
    type: z.enum(["CONTINUOUS", "MOTION", "ALARM", "OFF"]),
  })
  .refine(
    (p) => p.startHour * 60 + p.startMinute <= p.endHour * 60 + p.endMinute,
    { message: "start time must be before or equal to end time" }
  );

const dailyScheduleSchema = z.object({
  day: z.enum([
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ]),
  periods: z.array(schedulePeriodSchema),
});

const setRecordingScheduleSchema = z.object({
  channelNumber: z.number().int().positive().optional(),
  enabled: z.boolean(),
  schedule: z.array(dailyScheduleSchema),
  preRecordSeconds: z.number().int().min(0).max(30).optional(),
  postRecordSeconds: z.number().int().min(5).max(300).optional(),
  audioRecording: z.boolean().optional(),
  streamType: z.enum(["main", "sub"]).optional(),
});

const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;

const setNetworkConfigSchema = z.object({
  dhcpEnabled: z.boolean(),
  ipAddress: z.string().trim().regex(ipv4Regex, "Invalid IPv4 address format"),
  subnetMask: z.string().trim().regex(ipv4Regex, "Invalid subnet mask format"),
  gateway: z.string().trim().regex(ipv4Regex, "Invalid default gateway format"),
  dnsServers: z.array(z.string().trim().regex(ipv4Regex, "Invalid DNS server IP format")).optional(),
  httpPort: z.number().int().min(1).max(65535).optional(),
  httpsPort: z.number().int().min(1).max(65535).optional(),
  rtspPort: z.number().int().min(1).max(65535).optional(),
  onvifPort: z.number().int().min(1).max(65535).optional(),
  confirmNetworkChange: z.boolean().optional(),
});

export async function registerDeviceConfigurationRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  configService?: DeviceConfigurationService
) {
  const service = configService ?? new DeviceConfigurationService({ store });
  const templateService = new DeviceTemplateService(store as any, service);

  function getTenantId(request: any): string {
    const q = querySchema.parse(request.query || {});
    return q.tenantId || request.currentUser?.tenantId || "omsystems";
  }

  function handleRouteError(reply: any, err: unknown) {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({
        error: "INVALID_REQUEST_PAYLOAD",
        message: "Request validation failed",
        issues: err.issues,
      });
    }

    if (err instanceof ConfigurationError) {
      return reply.code(err.statusCode).send({
        error: err.code,
        message: err.message,
        details: err.details,
      });
    }

    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not authorized") || message.includes("permission")) {
      return reply.code(403).send({ error: "FORBIDDEN", message });
    }
    if (message.includes("not found")) {
      return reply.code(404).send({ error: "NOT_FOUND", message });
    }

    return reply.code(500).send({
      error: "INTERNAL_ERROR",
      message,
    });
  }

  // =========================================================================
  // DEVICE OVERALL CONFIGURATION & SNAPSHOT MANAGEMENT
  // =========================================================================

  app.get("/v1/devices/:id/configuration", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);

      const config = await service.readDeviceConfiguration(
        tenantId,
        id,
        request.currentUser
      );

      return reply.send({ success: true, data: config });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.get("/v1/devices/:id/configuration/snapshots", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);

      const snapshots = await service.listSnapshots(id);

      return reply.send({ success: true, data: snapshots });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.post("/v1/devices/:id/configuration/snapshots", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);

      const snapshot = await service.captureSnapshot(
        tenantId,
        id,
        request.currentUser
      );

      return reply.send({ success: true, data: snapshot });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // =========================================================================
  // CAMERA CONFIGURATION: VIDEO
  // =========================================================================

  app.get("/v1/devices/:id/configuration/video", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const q = querySchema.parse(request.query || {});
      const tenantId = getTenantId(request);

      const config = await service.getVideoConfiguration(
        tenantId,
        id,
        request.currentUser,
        q.profileToken
      );

      return reply.send({ success: true, data: config });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.get("/v1/devices/:id/configuration/video/options", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const q = querySchema.parse(request.query || {});
      const tenantId = getTenantId(request);

      const options = await service.getVideoOptions(
        tenantId,
        id,
        request.currentUser,
        q.profileToken
      );

      return reply.send({ success: true, data: options });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.post("/v1/devices/:id/configuration/video", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);
      const body = setVideoConfigSchema.parse(request.body);

      const result = await service.setVideoConfiguration(
        tenantId,
        id,
        request.currentUser,
        body as ChannelVideoConfig
      );

      return reply.send({ success: result.success, data: result });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.post("/v1/devices/:id/configuration/rollback", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);
      const body = rollbackSchema.parse(request.body);

      const result = await service.rollback(
        tenantId,
        id,
        request.currentUser,
        body.snapshotId
      );

      return reply.send({ success: result.success, data: result });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // =========================================================================
  // CAMERA CONFIGURATION: IMAGING
  // =========================================================================

  app.get("/v1/devices/:id/configuration/imaging", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);

      const config = await service.getImagingConfiguration(
        tenantId,
        id,
        request.currentUser
      );

      return reply.send({ success: true, data: config });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.get("/v1/devices/:id/configuration/imaging/options", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);

      const options = await service.getImagingOptions(
        tenantId,
        id,
        request.currentUser
      );

      return reply.send({ success: true, data: options });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.post("/v1/devices/:id/configuration/imaging", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);
      const body = setImagingConfigSchema.parse(request.body);

      const result = await service.setImagingConfiguration(
        tenantId,
        id,
        request.currentUser,
        body
      );

      return reply.send({ success: result.success, data: result });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // =========================================================================
  // CAMERA CONFIGURATION: TIME & NETWORK
  // =========================================================================

  app.get("/v1/devices/:id/configuration/time", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);

      const timeStatus = await service.getTimeConfiguration(
        tenantId,
        id,
        request.currentUser
      );

      return reply.send({ success: true, data: timeStatus });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.post("/v1/devices/:id/configuration/time", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);
      const body = setTimeConfigSchema.parse(request.body);

      const result = await service.setTimeConfiguration(
        tenantId,
        id,
        request.currentUser,
        body as DeviceTimeConfig
      );

      return reply.send({ success: result.success, data: result });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // =========================================================================
  // RECORDER CONFIGURATION: CHANNELS, RECORDING, STORAGE
  // =========================================================================

  app.get("/v1/recorders/:id/configuration/channels", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);

      const data = await service.getRecorderChannels(
        tenantId,
        id,
        request.currentUser
      );

      return reply.send({ success: true, data });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.get("/v1/recorders/:id/configuration/recording", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const q = querySchema.parse(request.query || {});
      const tenantId = getTenantId(request);

      const data = await service.getRecorderRecording(
        tenantId,
        id,
        request.currentUser,
        q.channelId
      );

      return reply.send({ success: true, data });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.get("/v1/recorders/:id/configuration/storage", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);

      const data = await service.getRecorderStorage(
        tenantId,
        id,
        request.currentUser
      );

      return reply.send({ success: true, data });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.get("/v1/recorders/:id/configuration/time", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);

      const data = await service.getRecorderTime(
        tenantId,
        id,
        request.currentUser
      );

      return reply.send({ success: true, data });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.post("/v1/recorders/:id/configuration/time", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);
      const body = setTimeConfigSchema.parse(request.body);

      const result = await service.setRecorderTime(
        tenantId,
        id,
        request.currentUser,
        body as DeviceTimeConfig
      );

      return reply.send({ success: result.success, data: result });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // =========================================================================
  // RECORDER CHANNELS: SCHEDULE & ENCODING
  // =========================================================================

  app.get(
    "/v1/recorders/:id/configuration/channels/:channelId/schedule",
    async (request, reply) => {
      try {
        const { id, channelId } = channelParamsSchema.parse(request.params);
        const tenantId = getTenantId(request);

        const schedule = await service.getRecorderSchedule(
          tenantId,
          id,
          channelId,
          request.currentUser
        );

        return reply.send({ success: true, data: schedule });
      } catch (err) {
        return handleRouteError(reply, err);
      }
    }
  );

  const handleSetSchedule = async (request: any, reply: any) => {
    try {
      const { id, channelId } = channelParamsSchema.parse(request.params);
      const tenantId = getTenantId(request);
      const body = setRecordingScheduleSchema.parse(request.body);

      const schedule: RecordingSchedule = {
        ...(body as any),
        channelNumber: body.channelNumber ?? (parseInt(channelId, 10) || 1),
      };

      const result = await service.setRecorderSchedule(
        tenantId,
        id,
        channelId,
        request.currentUser,
        schedule
      );

      return reply.send({ success: result.success, data: result });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  };

  app.put(
    "/v1/recorders/:id/configuration/channels/:channelId/schedule",
    handleSetSchedule
  );
  app.post(
    "/v1/recorders/:id/configuration/channels/:channelId/schedule",
    handleSetSchedule
  );

  app.get(
    "/v1/recorders/:id/configuration/channels/:channelId/encoding",
    async (request, reply) => {
      try {
        const { id, channelId } = channelParamsSchema.parse(request.params);
        const tenantId = getTenantId(request);

        const encoding = await service.getRecorderChannelEncoding(
          tenantId,
          id,
          channelId,
          request.currentUser
        );

        return reply.send({ success: true, data: encoding });
      } catch (err) {
        return handleRouteError(reply, err);
      }
    }
  );

  const handleSetEncoding = async (request: any, reply: any) => {
    try {
      const { id, channelId } = channelParamsSchema.parse(request.params);
      const tenantId = getTenantId(request);
      const body = setVideoConfigSchema.parse(request.body);

      const result = await service.setRecorderChannelEncoding(
        tenantId,
        id,
        channelId,
        request.currentUser,
        body as ChannelVideoConfig
      );

      return reply.send({ success: result.success, data: result });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  };

  app.put(
    "/v1/recorders/:id/configuration/channels/:channelId/encoding",
    handleSetEncoding
  );
  app.post(
    "/v1/recorders/:id/configuration/channels/:channelId/encoding",
    handleSetEncoding
  );

  // =========================================================================
  // NETWORK CONFIGURATION (CAMERAS & RECORDERS)
  // =========================================================================

  app.get("/v1/devices/:id/configuration/network", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);

      const config = await service.getNetworkConfiguration(
        tenantId,
        id,
        request.currentUser
      );

      return reply.send({ success: true, data: config });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  const handleSetDeviceNetwork = async (request: any, reply: any) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);
      const body = setNetworkConfigSchema.parse(request.body);

      const result = await service.setNetworkConfiguration(
        tenantId,
        id,
        request.currentUser,
        body as DeviceNetworkConfig,
        body.confirmNetworkChange
      );

      return reply.send({ success: result.success, data: result });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  };

  app.put("/v1/devices/:id/configuration/network", handleSetDeviceNetwork);
  app.post("/v1/devices/:id/configuration/network", handleSetDeviceNetwork);

  app.get("/v1/recorders/:id/configuration/network", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);

      const config = await service.getRecorderNetwork(
        tenantId,
        id,
        request.currentUser
      );

      return reply.send({ success: true, data: config });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  const handleSetRecorderNetwork = async (request: any, reply: any) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);
      const body = setNetworkConfigSchema.parse(request.body);

      const result = await service.setRecorderNetwork(
        tenantId,
        id,
        request.currentUser,
        body as DeviceNetworkConfig,
        body.confirmNetworkChange
      );

      return reply.send({ success: result.success, data: result });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  };

  app.put("/v1/recorders/:id/configuration/network", handleSetRecorderNetwork);
  app.post("/v1/recorders/:id/configuration/network", handleSetRecorderNetwork);

  // =========================================================================
  // GOLDEN CONFIGURATION TEMPLATES & FLEET COMPLIANCE
  // =========================================================================

  const createGoldenTemplateSchema = z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().optional(),
    targetType: z.enum(["camera", "recorder"]).default("camera"),
    classification: z.enum([
      "branch_entrance",
      "cash_counter",
      "strongroom_vault",
      "atm_vestibule",
      "perimeter",
      "universal",
    ]),
    settings: z.record(z.unknown()),
  });

  const updateGoldenTemplateSchema = z.object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    classification: z.enum([
      "branch_entrance",
      "cash_counter",
      "strongroom_vault",
      "atm_vestibule",
      "perimeter",
      "universal",
    ]).optional(),
    settings: z.record(z.unknown()).optional(),
    status: z.enum(["draft", "published", "deprecated"]).optional(),
  });

  const goldenTemplateApplySchema = z.object({
    scope: z.enum(["single", "branch", "classification", "fleet"]),
    deviceId: z.string().trim().optional(),
    branchId: z.string().trim().optional(),
    classification: z.enum([
      "branch_entrance",
      "cash_counter",
      "strongroom_vault",
      "atm_vestibule",
      "perimeter",
      "universal",
    ]).optional(),
    confirmNetworkChange: z.boolean().optional(),
  });

  const remediateComplianceSchema = z.object({
    templateId: z.string().trim().min(1),
    deviceIds: z.array(z.string().trim().min(1)).optional(),
  });

  app.get("/v1/device-configuration/templates", async (request, reply) => {
    try {
      const tenantId = getTenantId(request);
      const templates = await templateService.listGoldenTemplates(tenantId);
      return reply.send({ success: true, data: templates });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.post("/v1/device-configuration/templates", async (request, reply) => {
    try {
      const tenantId = getTenantId(request);
      const body = createGoldenTemplateSchema.parse(request.body);

      const template = await templateService.createGoldenTemplate({
        tenantId,
        name: body.name,
        description: body.description,
        targetType: body.targetType,
        classification: body.classification as TemplateTargetClassification,
        settings: body.settings as GoldenTemplateSettings,
        createdBy: request.currentUser?.id || "system",
      });

      return reply.code(201).send({ success: true, data: template });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.get("/v1/device-configuration/templates/:id", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);

      const template = await templateService.getGoldenTemplate(id, tenantId);
      if (!template) {
        return reply.code(404).send({ error: "NOT_FOUND", message: `Template ${id} not found` });
      }

      return reply.send({ success: true, data: template });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.put("/v1/device-configuration/templates/:id", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const body = updateGoldenTemplateSchema.parse(request.body);

      const template = await templateService.updateGoldenTemplate(
        id,
        {
          name: body.name,
          description: body.description,
          classification: body.classification as TemplateTargetClassification,
          settings: body.settings as GoldenTemplateSettings,
          status: body.status,
        },
        request.currentUser
      );

      if (!template) {
        return reply.code(404).send({ error: "NOT_FOUND", message: `Template ${id} not found` });
      }

      return reply.send({ success: true, data: template });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.post("/v1/device-configuration/templates/:id/apply", async (request, reply) => {
    try {
      const { id } = paramsSchema.parse(request.params);
      const tenantId = getTenantId(request);
      const body = goldenTemplateApplySchema.parse(request.body);

      const result = await templateService.applyGoldenTemplate(
        tenantId,
        id,
        {
          scope: body.scope,
          deviceId: body.deviceId,
          branchId: body.branchId,
          classification: body.classification as TemplateTargetClassification,
        },
        request.currentUser,
        { confirmNetworkChange: body.confirmNetworkChange }
      );

      return reply.send({ success: true, data: result });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.get("/v1/device-configuration/compliance", async (request, reply) => {
    try {
      const tenantId = getTenantId(request);
      const q = z.object({ templateId: z.string().optional() }).parse(request.query || {});

      const report = await templateService.calculateFleetCompliance(tenantId, q.templateId, request.currentUser);
      return reply.send({ success: true, data: report });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  app.post("/v1/device-configuration/compliance/remediate", async (request, reply) => {
    try {
      const tenantId = getTenantId(request);
      const body = remediateComplianceSchema.parse(request.body);

      const result = await templateService.remediateDrift(
        tenantId,
        body.templateId,
        request.currentUser,
        body.deviceIds
      );

      return reply.send({ success: true, data: result });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });
}
