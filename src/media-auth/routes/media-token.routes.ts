/**
 * Media Authorization REST API Routes (Control-Plane)
 * Issues short-lived signed tokens for media stream access without proxying video.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { mediaTokenIssuer } from '../services/media-token-issuer.service.js';
import { mediaTokenValidator } from '../services/media-token-validator.service.js';
import { mediaPlaneRegistry } from '../services/media-plane-registry.service.js';
import { MediaAccessPermission, StreamTransportProtocol } from '../domain/media-token.types.js';

export async function registerMediaTokenRoutes(app: FastifyInstance) {
  // 1. Issue Media Access Token
  app.post('/v1/media/token', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      userId: z.string(),
      tenantId: z.string().optional(),
      branchId: z.string(),
      cameraId: z.string(),
      cameraName: z.string().optional(),
      userPermissions: z.array(z.string()).default(['camera.live.view']),
      requestedPermission: z.enum(['live.view', 'recording.playback', 'ptz.control', 'evidence.export']).default('live.view'),
      streamProfile: z.enum(['main', 'sub', 'preview']).default('main'),
      transport: z.enum(['WEBRTC', 'HLS', 'RTSP', 'WS_RAW']).default('WEBRTC'),
      purpose: z.enum(['LIVE_VIEW', 'INCIDENT_INVESTIGATION', 'PLAYBACK', 'VIDEO_WALL']).default('LIVE_VIEW'),
      preferredRegion: z.string().optional(),
      ttlSeconds: z.number().int().min(30).max(3600).default(300),
    }).parse(request.body);

    const clientIp = request.ip;
    const result = mediaTokenIssuer.issueMediaToken({
      ...body,
      requestedPermission: body.requestedPermission as MediaAccessPermission,
      transport: body.transport as StreamTransportProtocol,
      clientIp,
    } as any);

    if (!result.success) {
      return reply.code(403).send({ success: false, error: result.error });
    }

    return reply.status(201).send({ success: true, data: result });
  });

  // 2. Validate Token (Media Plane Edge helper)
  app.post('/v1/media/token/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      mediaToken: z.string(),
      expectedCameraId: z.string().optional(),
      requiredPermission: z.enum(['live.view', 'recording.playback', 'ptz.control', 'evidence.export']).optional(),
    }).parse(request.body);

    const result = mediaTokenValidator.validateToken(
      body.mediaToken,
      body.expectedCameraId,
      body.requiredPermission as MediaAccessPermission | undefined
    );

    if (!result.isValid) {
      return reply.code(401).send({ success: false, error: result.error, errorCode: result.errorCode });
    }

    return reply.send({ success: true, data: result.claims });
  });

  // 3. Revoke Media Token
  app.post('/v1/media/token/revoke', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      jti: z.string(),
      reason: z.string().optional(),
    }).parse(request.body);

    mediaTokenValidator.revokeToken(body.jti);
    return reply.send({ success: true, message: `Token ${body.jti} revoked` });
  });

  // 4. List Media Plane Nodes
  app.get('/v1/media/nodes', async (_request: FastifyRequest, reply: FastifyReply) => {
    const nodes = mediaPlaneRegistry.listNodes();
    return reply.send({ success: true, data: nodes });
  });

  // 5. Media Plane Node Heartbeat
  app.post('/v1/media/nodes/heartbeat', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      nodeId: z.string(),
      activeStreams: z.number().int().optional(),
      ingressMbps: z.number().optional(),
    }).parse(request.body);

    const ok = mediaPlaneRegistry.heartbeat(body.nodeId, body.activeStreams, body.ingressMbps);
    if (!ok) {
      return reply.code(404).send({ success: false, error: 'MEDIA_NODE_NOT_FOUND' });
    }

    return reply.send({ success: true });
  });
}
