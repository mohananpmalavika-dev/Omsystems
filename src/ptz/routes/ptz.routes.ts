/**
 * Enterprise Reliable PTZ REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ptzPriorityManager } from '../services/ptz-priority-manager.service.js';
import { ptzOpticsController } from '../services/ptz-optics-controller.service.js';
import { ptzPresetTourManager } from '../services/ptz-preset-tour-manager.service.js';
import { PtzPriorityRole, PtzPermission } from '../domain/ptz.types.js';

export async function registerReliablePtzRoutes(app: FastifyInstance) {
  // 1. Request Priority Lock
  app.post('/v1/ptz/cameras/:cameraId/lock', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { cameraId: string };
    const body = z.object({
      operatorId: z.string(),
      operatorName: z.string(),
      role: z.enum(['GUARD', 'SUPERVISOR', 'INCIDENT_RESPONSE', 'SYSTEM_ADMIN']).default('GUARD'),
      durationSeconds: z.number().optional(),
    }).parse(request.body);

    const result = ptzPriorityManager.requestLock({
      cameraId: params.cameraId,
      operatorId: body.operatorId,
      operatorName: body.operatorName,
      role: body.role as PtzPriorityRole,
      durationSeconds: body.durationSeconds,
    });

    if (!result.granted) {
      return reply.code(409).send({ success: false, error: result.error, currentOwner: result.currentOwner });
    }

    return reply.status(201).send({ success: true, data: result });
  });

  // 2. Release Lock
  app.post('/v1/ptz/cameras/:cameraId/release', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { cameraId: string };
    const body = z.object({
      operatorId: z.string(),
    }).parse(request.body);

    const released = ptzPriorityManager.releaseLock(params.cameraId, body.operatorId);
    return reply.send({ success: released });
  });

  // 3. Query Coordinates
  app.get('/v1/ptz/cameras/:cameraId/coordinates', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { cameraId: string };
    const coords = ptzOpticsController.getCoordinates(params.cameraId, ['camera.ptz.view']);
    return reply.send({ success: true, data: coords });
  });

  // 4. Move (Pan, Tilt, Zoom)
  app.post('/v1/ptz/cameras/:cameraId/move', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { cameraId: string };
    const body = z.object({
      operatorId: z.string(),
      token: z.string().optional(),
      permissions: z.array(z.string()).default(['camera.ptz.control']),
      movement: z.object({
        panVelocity: z.number().optional(),
        tiltVelocity: z.number().optional(),
        zoomVelocity: z.number().optional(),
      }).optional(),
    }).parse(request.body);

    try {
      const coords = ptzOpticsController.move({
        cameraId: params.cameraId,
        operatorId: body.operatorId,
        token: body.token,
        operatorPermissions: body.permissions as PtzPermission[],
        movement: body.movement,
      });
      return reply.send({ success: true, data: coords });
    } catch (err: any) {
      return reply.code(403).send({ success: false, error: err.message });
    }
  });

  // 5. Optics (Focus & Iris)
  app.post('/v1/ptz/cameras/:cameraId/optics', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { cameraId: string };
    const body = z.object({
      operatorId: z.string(),
      token: z.string().optional(),
      permissions: z.array(z.string()).default(['camera.ptz.control']),
      optics: z.object({
        focus: z.object({
          mode: z.enum(['AUTO', 'MANUAL']).optional(),
          action: z.enum(['NEAR', 'FAR', 'STOP']).optional(),
        }).optional(),
        iris: z.object({
          mode: z.enum(['AUTO', 'MANUAL']).optional(),
          action: z.enum(['OPEN', 'CLOSE', 'RESET']).optional(),
        }).optional(),
      }).optional(),
    }).parse(request.body);

    try {
      const coords = ptzOpticsController.controlOptics({
        cameraId: params.cameraId,
        operatorId: body.operatorId,
        token: body.token,
        operatorPermissions: body.permissions as PtzPermission[],
        optics: body.optics as any,
      });
      return reply.send({ success: true, data: coords });
    } catch (err: any) {
      return reply.code(403).send({ success: false, error: err.message });
    }
  });

  // 6. Presets CRUD & Goto
  app.get('/v1/ptz/cameras/:cameraId/presets', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { cameraId: string };
    const presets = ptzPresetTourManager.listPresets(params.cameraId);
    return reply.send({ success: true, data: presets });
  });

  app.post('/v1/ptz/cameras/:cameraId/presets', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { cameraId: string };
    const body = z.object({
      presetNumber: z.number(),
      name: z.string(),
      pan: z.number(),
      tilt: z.number(),
      zoom: z.number(),
      focus: z.number().optional(),
      iris: z.number().optional(),
    }).parse(request.body);

    const preset = ptzPresetTourManager.storePreset(
      params.cameraId,
      body.presetNumber,
      body.name,
      body.pan,
      body.tilt,
      body.zoom,
      body.focus,
      body.iris
    );
    return reply.status(201).send({ success: true, data: preset });
  });

  app.post('/v1/ptz/cameras/:cameraId/presets/:presetNumber/goto', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { cameraId: string; presetNumber: string };
    const body = z.object({
      operatorId: z.string(),
      token: z.string().optional(),
      permissions: z.array(z.string()).default(['camera.ptz.control']),
    }).parse(request.body);

    try {
      const coords = ptzOpticsController.gotoPreset(
        params.cameraId,
        parseInt(params.presetNumber, 10),
        {
          operatorId: body.operatorId,
          token: body.token,
          operatorPermissions: body.permissions as PtzPermission[],
        }
      );
      return reply.send({ success: true, data: coords });
    } catch (err: any) {
      return reply.code(403).send({ success: false, error: err.message });
    }
  });

  // 7. Home Position
  app.post('/v1/ptz/cameras/:cameraId/home', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { cameraId: string };
    const body = z.object({
      presetNumber: z.number().optional(),
      position: z.object({ pan: z.number(), tilt: z.number(), zoom: z.number() }).optional(),
      autoReturnIdleTimeoutSeconds: z.number().default(30),
      permissions: z.array(z.string()).default(['camera.ptz.admin']),
    }).parse(request.body);

    try {
      const home = ptzOpticsController.setHomePosition(
        params.cameraId,
        {
          cameraId: params.cameraId,
          presetNumber: body.presetNumber,
          position: body.position as any,
          autoReturnIdleTimeoutSeconds: body.autoReturnIdleTimeoutSeconds,
        },
        body.permissions as PtzPermission[]
      );
      return reply.send({ success: true, data: home });
    } catch (err: any) {
      return reply.code(403).send({ success: false, error: err.message });
    }
  });

  app.post('/v1/ptz/cameras/:cameraId/home/goto', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { cameraId: string };
    const coords = ptzOpticsController.returnToHome(params.cameraId);
    return reply.send({ success: true, data: coords });
  });
}
