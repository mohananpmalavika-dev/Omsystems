import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { createMediaSession } from "../services/media-session.service.js";

const mediaSessionSchema = z.object({
  cameraId: z.string().min(1),
  purpose: z.enum(["MONITORING", "INVESTIGATION", "PLAYBACK", "TALK"]).default("MONITORING"),
});

export async function registerMediaSessionRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  app.post("/v1/media-sessions", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = mediaSessionSchema.parse(request.body);

    // Minimal authorization / existence checks
    const camera = await store.getCamera(body.cameraId);
    if (!camera) return reply.code(404).send({ error: "camera_not_found" });

    if (!request.currentUser) return reply.code(401).send({ error: "unauthenticated" });

    try {
      const session = await createMediaSession(store, {
        cameraId: body.cameraId,
        userId: request.currentUser.id,
        purpose: body.purpose,
      });
      return reply.code(201).send({ session });
    } catch (err) {
      request.log.error({ err }, "failed to create media session stub");
      return reply.code(500).send({ error: "failed_to_create_media_session" });
    }
  });
}
