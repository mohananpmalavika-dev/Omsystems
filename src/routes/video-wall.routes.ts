import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { pool } from "../database/pool.js";
import { VideoWallDispatcherService } from "../media/services/video-wall-dispatcher.service.js";

const gridSizes = ["1x1","2x2","3x3","4x4","5x5","6x6","7x7","8x8","9x9","10x10","11x11","12x12"] as const;
const capacities = Object.fromEntries(gridSizes.map((size) => [size, Number(size.split("x")[0]) ** 2]));

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  gridSize: z.enum(gridSizes),
  cameraPositions: z.array(z.object({
    position: z.number().int().min(0).max(143),
    cameraId: z.string().min(1),
    stream: z.enum(["main", "sub"]),
  })).max(144),
});

const registerDisplaySchema = z.object({
  displayCode: z.string().trim().min(2).max(100),
  name: z.string().trim().min(1).max(200),
  resolution: z.string().optional(),
  location: z.string().optional(),
  activeLayout: z.string().optional(),
});

const dispatchSchema = z.object({
  displayCode: z.string().trim().min(2).max(100),
  layout: z.string().trim().min(1).max(50),
  assignedCameras: z.array(z.string().min(1)).max(144),
  reason: z.string().optional(),
});

export const videoWallDispatcherService = new VideoWallDispatcherService(pool || undefined);

export async function registerVideoWallRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  dispatcher: VideoWallDispatcherService = videoWallDispatcherService
) {
  // Existing layout routes
  app.get("/v1/video-wall/layouts", async (request) => ({
    data: await store.listVideoWallLayouts(request.currentUser.tenantId, request.currentUser.id),
  }));

  app.post("/v1/video-wall/layouts", async (request, reply) => {
    const input = createSchema.parse(request.body);
    const cameraPositions = input.cameraPositions.map((position) => ({
      position: position.position!,
      cameraId: position.cameraId!,
      stream: position.stream!,
    }));
    const capacity = capacities[input.gridSize]!;
    if (new Set(cameraPositions.map((item) => item.position)).size !== cameraPositions.length ||
        cameraPositions.some((item) => item.position >= capacity)) {
      return reply.code(400).send({ error: "invalid_layout_positions" });
    }
    for (const position of cameraPositions) {
      const camera = await store.getCamera(position.cameraId);
      if (!camera) return reply.code(404).send({ error: "camera_not_found", cameraId: position.cameraId });
      const decision = await store.checkAccess(request.currentUser, "live:view", camera.nodeId);
      if (!decision?.allowed) return reply.code(403).send({ error: "camera_forbidden", cameraId: position.cameraId });
    }
    const layout = await store.createVideoWallLayout({
      tenantId: request.currentUser.tenantId,
      userId: request.currentUser.id,
      name: input.name,
      gridSize: input.gridSize,
      cameraPositions,
    });
    return reply.code(201).send(layout);
  });

  // Physical Video Wall Display Nodes & Matrix Dispatching
  app.get("/v1/video-wall/displays", async (request) => {
    const displays = await dispatcher.listDisplays(request.currentUser.tenantId);
    return { success: true, count: displays.length, displays };
  });

  app.post("/v1/video-wall/displays/register", async (request, reply) => {
    const body = registerDisplaySchema.parse(request.body);
    const display = await dispatcher.registerDisplay({
      tenantId: request.currentUser.tenantId,
      displayCode: body.displayCode,
      name: body.name,
      resolution: body.resolution,
      location: body.location,
      activeLayout: body.activeLayout,
    });
    return reply.code(201).send({ success: true, display });
  });

  app.get("/v1/video-wall/displays/:displayCode", async (request, reply) => {
    const params = request.params as { displayCode: string };
    const display = await dispatcher.getDisplay(params.displayCode);
    if (!display || display.tenantId !== request.currentUser.tenantId) {
      return reply.code(404).send({ error: "display_not_found" });
    }
    return reply.code(200).send({ success: true, display });
  });

  app.post("/v1/video-wall/displays/:displayCode/heartbeat", async (request, reply) => {
    const params = request.params as { displayCode: string };
    const ok = await dispatcher.recordHeartbeat(params.displayCode);
    if (!ok) {
      return reply.code(404).send({ error: "display_not_found" });
    }
    return reply.code(200).send({ success: true, status: "online" });
  });

  app.post("/v1/video-wall/dispatch", async (request, reply) => {
    const body = dispatchSchema.parse(request.body);
    const updated = await dispatcher.dispatchMatrix({
      tenantId: request.currentUser.tenantId,
      displayCode: body.displayCode,
      layout: body.layout,
      assignedCameras: body.assignedCameras,
      dispatchedBy: request.currentUser.username || request.currentUser.id,
      reason: body.reason,
    });
    return reply.code(200).send({ success: true, display: updated });
  });
}
