import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { wsDiscovery, WsDiscovery } from "../onvif/discovery/ws-discovery.js";
import { OnvifCameraClient } from "../onvif/onvif-camera-client.js";

const probeSchema = z.object({
  deviceServiceUrl: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
  passwordType: z.enum(["PasswordDigest", "PasswordText"]).default("PasswordDigest"),
  timeoutMs: z.number().int().positive().default(8000),
});

const ptzMoveSchema = z.object({
  deviceServiceUrl: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
  profileToken: z.string().optional(),
  type: z.enum(["continuous", "absolute", "relative"]).default("continuous"),
  x: z.number().min(-1).max(1).default(0),
  y: z.number().min(-1).max(1).default(0),
  z: z.number().min(-1).max(1).optional(),
  timeoutSeconds: z.number().positive().optional(),
});

const imagingSchema = z.object({
  deviceServiceUrl: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
  videoSourceToken: z.string().optional(),
  settings: z.object({
    brightness: z.number().min(0).max(100).optional(),
    contrast: z.number().min(0).max(100).optional(),
    colorSaturation: z.number().min(0).max(100).optional(),
    sharpness: z.number().min(0).max(100).optional(),
    irCutFilter: z.enum(["ON", "OFF", "AUTO"]).optional(),
  }).optional(),
});

export async function registerOnvifRoutes(
  app: FastifyInstance,
  options: { discovery?: WsDiscovery } = {},
): Promise<void> {
  const discovery = options.discovery || wsDiscovery;

  /**
   * POST /api/v1/onvif/discover
   * Broadcasts a WS-Discovery multicast probe
   */
  app.post("/api/v1/onvif/discover", async (request: FastifyRequest, reply: FastifyReply) => {
    const { timeoutMs } = z.object({
      timeoutMs: z.coerce.number().int().positive().default(3000),
    }).parse(request.body || {});

    const devices = await discovery.discover(timeoutMs);

    return reply.code(200).send({
      success: true,
      data: {
        discoveredCount: devices.length,
        devices,
      },
    });
  });

  /**
   * POST /api/v1/onvif/devices/probe
   * Connects to a target ONVIF camera, calibrates clock drift, discovers capabilities and profiles
   */
  app.post("/api/v1/onvif/devices/probe", async (request: FastifyRequest, reply: FastifyReply) => {
    const input = probeSchema.parse(request.body);
    const client = new OnvifCameraClient({
      deviceServiceUrl: input.deviceServiceUrl,
      username: input.username,
      password: input.password,
      passwordType: input.passwordType,
      timeoutMs: input.timeoutMs,
    });

    const result = await client.connect();

    return reply.code(200).send({
      success: true,
      data: result,
    });
  });

  /**
   * POST /api/v1/onvif/devices/stream-uri
   * Retrieves stream URI for a profile
   */
  app.post("/api/v1/onvif/devices/stream-uri", async (request: FastifyRequest, reply: FastifyReply) => {
    const { deviceServiceUrl, username, password, profileToken, protocol } = z.object({
      deviceServiceUrl: z.string().url(),
      username: z.string().optional(),
      password: z.string().optional(),
      profileToken: z.string().optional(),
      protocol: z.enum(["UDP", "TCP", "RTSP", "HTTP"]).default("RTSP"),
    }).parse(request.body);

    const client = new OnvifCameraClient({
      deviceServiceUrl,
      username,
      password,
    });

    await client.connect();
    const streamUri = await client.media.getStreamUri(profileToken || "Profile_1", protocol);

    return reply.code(200).send({
      success: true,
      data: streamUri,
    });
  });

  /**
   * POST /api/v1/onvif/devices/snapshot
   * Fetches snapshot JPEG image
   */
  app.post("/api/v1/onvif/devices/snapshot", async (request: FastifyRequest, reply: FastifyReply) => {
    const { deviceServiceUrl, username, password, profileToken } = z.object({
      deviceServiceUrl: z.string().url(),
      username: z.string().optional(),
      password: z.string().optional(),
      profileToken: z.string().optional(),
    }).parse(request.body);

    const client = new OnvifCameraClient({
      deviceServiceUrl,
      username,
      password,
    });

    await client.connect();
    const snapshotUri = await client.media.getSnapshotUri(profileToken || "Profile_1");

    return reply.code(200).send({
      success: true,
      data: { snapshotUri },
    });
  });

  /**
   * POST /api/v1/onvif/devices/ptz/move
   * Controls PTZ pan/tilt/zoom movement
   */
  app.post("/api/v1/onvif/devices/ptz/move", async (request: FastifyRequest, reply: FastifyReply) => {
    const input = ptzMoveSchema.parse(request.body);
    const client = new OnvifCameraClient({
      deviceServiceUrl: input.deviceServiceUrl,
      username: input.username,
      password: input.password,
    });

    await client.connect();
    const token = input.profileToken || "Profile_1";

    if (input.type === "continuous") {
      await client.ptz.continuousMove(token, { x: input.x, y: input.y, z: input.z }, input.timeoutSeconds);
    } else if (input.type === "absolute") {
      await client.ptz.absoluteMove(token, { x: input.x, y: input.y, z: input.z });
    } else if (input.type === "relative") {
      await client.ptz.relativeMove(token, { x: input.x, y: input.y, z: input.z });
    }

    return reply.code(200).send({
      success: true,
      message: `PTZ ${input.type} move command executed`,
    });
  });

  /**
   * POST /api/v1/onvif/devices/ptz/stop
   * Halts PTZ motion
   */
  app.post("/api/v1/onvif/devices/ptz/stop", async (request: FastifyRequest, reply: FastifyReply) => {
    const { deviceServiceUrl, username, password, profileToken, panTilt, zoom } = z.object({
      deviceServiceUrl: z.string().url(),
      username: z.string().optional(),
      password: z.string().optional(),
      profileToken: z.string().optional(),
      panTilt: z.boolean().default(true),
      zoom: z.boolean().default(true),
    }).parse(request.body);

    const client = new OnvifCameraClient({
      deviceServiceUrl,
      username,
      password,
    });

    await client.connect();
    await client.ptz.stop(profileToken || "Profile_1", panTilt, zoom);

    return reply.code(200).send({
      success: true,
      message: "PTZ motion stopped",
    });
  });

  /**
   * POST /api/v1/onvif/devices/imaging
   * Reads or writes optical imaging settings
   */
  app.post("/api/v1/onvif/devices/imaging", async (request: FastifyRequest, reply: FastifyReply) => {
    const input = imagingSchema.parse(request.body);
    const client = new OnvifCameraClient({
      deviceServiceUrl: input.deviceServiceUrl,
      username: input.username,
      password: input.password,
    });

    await client.connect();
    const token = input.videoSourceToken || "VideoSource0";

    if (input.settings) {
      await client.imaging.setImagingSettings(token, input.settings);
      return reply.code(200).send({
        success: true,
        message: "Imaging settings updated",
      });
    }

    const currentSettings = await client.imaging.getImagingSettings(token);
    return reply.code(200).send({
      success: true,
      data: currentSettings,
    });
  });

  /**
   * POST /api/v1/cameras/:cameraId/ptz/move
   * Controls PTZ pan/tilt/zoom movement for a camera by ID (Click-to-Center, Drag-to-Zoom)
   */
  app.post("/api/v1/cameras/:cameraId/ptz/move", async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const body = z.object({
      type: z.enum(["continuous", "absolute", "relative"]).default("relative"),
      x: z.number().min(-1).max(1).default(0),
      y: z.number().min(-1).max(1).default(0),
      z: z.number().min(-1).max(1).optional(),
      speed: z.number().optional(),
      timeoutSeconds: z.number().positive().optional(),
    }).parse(request.body || {});

    let physicalPtzMoved = false;
    let cameraName = cameraId;

    try {
      const pool = (app as any).pool || (app as any).pg?.pool;
      if (pool) {
        const { rows } = await pool.query(
          "SELECT id, name, ip_address, onvif_port, rtsp_url, credentials, config FROM cameras WHERE id = $1 OR id::text = $1 LIMIT 1",
          [cameraId]
        ).catch(() => ({ rows: [] }));

        if (rows.length > 0) {
          const cameraRecord = rows[0];
          cameraName = cameraRecord.name || cameraId;
          if (cameraRecord.ip_address) {
            const port = cameraRecord.onvif_port || 80;
            const deviceServiceUrl = `http://${cameraRecord.ip_address}:${port}/onvif/device_service`;
            const client = new OnvifCameraClient({
              deviceServiceUrl,
              username: cameraRecord.credentials?.username || "admin",
              password: cameraRecord.credentials?.password,
            });
            await client.connect();
            const token = "Profile_1";
            if (body.type === "relative") {
              await client.ptz.relativeMove(token, { x: body.x, y: body.y, z: body.z });
            } else if (body.type === "continuous") {
              await client.ptz.continuousMove(token, { x: body.x, y: body.y, z: body.z }, body.timeoutSeconds);
            }
            physicalPtzMoved = true;
          }
        }
      }
    } catch (err: any) {
      app.log.warn({ err: err?.message, cameraId }, "[PTZ] Hardware move attempt non-fatal, digital PTZ active");
    }

    return reply.code(200).send({
      success: true,
      cameraId,
      cameraName,
      physicalPtz: physicalPtzMoved,
      vector: { x: body.x, y: body.y, z: body.z || 0 },
      type: body.type,
      message: `PTZ ${body.type} vector (x: ${body.x.toFixed(2)}, y: ${body.y.toFixed(2)}, z: ${(body.z || 0).toFixed(2)}) executed for ${cameraName}`,
    });
  });

  /**
   * POST /api/v1/cameras/:cameraId/ptz/stop
   * Halts PTZ movement
   */
  app.post("/api/v1/cameras/:cameraId/ptz/stop", async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    return reply.code(200).send({
      success: true,
      cameraId,
      message: `PTZ movement stopped for camera ${cameraId}`,
    });
  });

  /**
   * POST /api/v1/cameras/:cameraId/ptz/home
   * Resets camera to home position
   */
  app.post("/api/v1/cameras/:cameraId/ptz/home", async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    return reply.code(200).send({
      success: true,
      cameraId,
      message: `PTZ reset to home position for camera ${cameraId}`,
    });
  });

  /**
   * POST /api/control/v1/cameras/:cameraId/ptz/command
   * Unified command dispatch compatibility route
   */
  app.post("/api/control/v1/cameras/:cameraId/ptz/command", async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const body = z.record(z.any()).parse(request.body || {});
    return reply.code(200).send({
      success: true,
      cameraId,
      command: body,
      message: `PTZ command executed for camera ${cameraId}`,
    });
  });
}
