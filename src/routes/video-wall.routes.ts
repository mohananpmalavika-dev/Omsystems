import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

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

export async function registerVideoWallRoutes(app: FastifyInstance, store: ControlPlaneStore) {
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
}
