/**
 * Fastify Routes for Video Timeline Bookmarks (video.bookmarks)
 * 
 * Production endpoints for operator timeline tagging, notes, priority levels,
 * multi-incident associations, forensic verification, and scrub bar integration.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import {
  VideoBookmarkService,
  createBookmarkSchema,
  updateBookmarkSchema,
  listBookmarksQuerySchema,
  associateIncidentSchema,
  createIncidentFromBookmarkSchema,
} from '../video/bookmarks/index.js';

export async function registerVideoBookmarkRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  const pool = (store as any).pool || (store as any).db;

  if (!pool) {
    app.log.warn('[VideoBookmarkRoutes] No PostgreSQL pool available on store; video bookmark routes disabled');
    return;
  }

  const bookmarkService = new VideoBookmarkService(pool, store);

  const getTenantId = (req: FastifyRequest): string => {
    const user = (req as any).currentUser || (req as any).user;
    return (
      user?.tenantId ||
      (req.headers['x-tenant-id'] as string) ||
      '00000000-0000-4000-8000-000000000000'
    );
  };

  const getUserId = (req: FastifyRequest): string => {
    const user = (req as any).currentUser || (req as any).user;
    return (
      user?.id ||
      (req.headers['x-user-id'] as string) ||
      '00000000-0000-4000-8000-000000000001'
    );
  };

  // 1. Create a Timeline Bookmark
  app.post('/v1/video/bookmarks', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const operatorId = getUserId(request);
      const body = createBookmarkSchema.parse(request.body);

      const bookmark = await bookmarkService.createBookmark(tenantId, operatorId, body);
      return reply.code(201).send({ success: true, data: bookmark });
    } catch (error) {
      request.log.error({ error }, 'Failed to create video bookmark');
      const status = error instanceof z.ZodError ? 400 : 500;
      return reply.code(status).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 2. List & Query Bookmarks with multi-filtering
  app.get('/v1/video/bookmarks', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = listBookmarksQuerySchema.parse(request.query);

      const result = await bookmarkService.listBookmarks(tenantId, query);
      return reply.send({
        success: true,
        data: result.bookmarks,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to list video bookmarks');
      const status = error instanceof z.ZodError ? 400 : 500;
      return reply.code(status).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 3. Get Bookmark Telemetry Metrics
  app.get('/v1/video/bookmarks/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const query = z.object({ cameraId: z.string().uuid().optional() }).parse(request.query);

      const metrics = await bookmarkService.getBookmarkMetrics(tenantId, query.cameraId);
      return reply.send({ success: true, data: metrics });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 4. Export Bookmarks (CSV or JSON) with SHA-256 seal
  app.get('/v1/video/bookmarks/export', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const exportSchema = listBookmarksQuerySchema.extend({
        format: z.enum(['csv', 'json']).default('json'),
      });
      const query = exportSchema.parse(request.query);

      const result = await bookmarkService.exportBookmarks(tenantId, query.format, query);

      reply.header('Content-Type', result.mimeType);
      reply.header('Content-Disposition', `attachment; filename="${result.filename}"`);
      reply.header('X-Checksum-SHA256', result.sha256);

      return reply.send(result.data);
    } catch (error) {
      request.log.error({ error }, 'Failed to export bookmarks');
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 5. Get Single Bookmark by ID
  app.get('/v1/video/bookmarks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

      const bookmark = await bookmarkService.getBookmarkById(id, tenantId);
      if (!bookmark) {
        return reply.code(404).send({ success: false, error: 'Bookmark not found' });
      }

      return reply.send({ success: true, data: bookmark });
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 500;
      return reply.code(status).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 6. Update Bookmark
  app.patch('/v1/video/bookmarks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const operatorId = getUserId(request);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = updateBookmarkSchema.parse(request.body);

      const updated = await bookmarkService.updateBookmark(id, tenantId, operatorId, body);
      if (!updated) {
        return reply.code(404).send({ success: false, error: 'Bookmark not found' });
      }

      return reply.send({ success: true, data: updated });
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 500;
      return reply.code(status).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 7. Delete Bookmark
  app.delete('/v1/video/bookmarks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const operatorId = getUserId(request);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

      const deleted = await bookmarkService.deleteBookmark(id, tenantId, operatorId);
      if (!deleted) {
        return reply.code(404).send({ success: false, error: 'Bookmark not found' });
      }

      return reply.send({ success: true, message: 'Bookmark deleted' });
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 500;
      return reply.code(status).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 8. Associate Incident with Bookmark
  app.post('/v1/video/bookmarks/:id/incidents', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const operatorId = getUserId(request);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = associateIncidentSchema.parse(request.body);

      const association = await bookmarkService.associateIncident(
        id,
        tenantId,
        body.incidentId,
        body.incidentTable,
        operatorId,
        body.associationNotes
      );

      return reply.code(201).send({ success: true, data: association });
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 500;
      return reply.code(status).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 9. Disassociate Incident from Bookmark
  app.delete('/v1/video/bookmarks/:id/incidents/:incidentId', async (request: FastifyRequest<{ Params: { id: string; incidentId: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const operatorId = getUserId(request);
      const { id, incidentId } = z.object({
        id: z.string().uuid(),
        incidentId: z.string().uuid(),
      }).parse(request.params);

      const disassociated = await bookmarkService.disassociateIncident(id, tenantId, incidentId, operatorId);
      if (!disassociated) {
        return reply.code(404).send({ success: false, error: 'Incident association not found' });
      }

      return reply.send({ success: true, message: 'Incident disassociated' });
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 500;
      return reply.code(status).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 10. Direct Promotion: Create Incident from Bookmark with Legal Hold
  app.post('/v1/video/bookmarks/:id/create-incident', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const operatorId = getUserId(request);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = createIncidentFromBookmarkSchema.parse(request.body);

      const result = await bookmarkService.createIncidentFromBookmark(id, tenantId, operatorId, body);
      return reply.code(201).send({ success: true, data: result });
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 500;
      return reply.code(status).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 11. Get Incidents Associated with Bookmark
  app.get('/v1/video/bookmarks/:id/incidents', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

      const bookmark = await bookmarkService.getBookmarkById(id, tenantId);
      if (!bookmark) {
        return reply.code(404).send({ success: false, error: 'Bookmark not found' });
      }

      return reply.send({ success: true, data: bookmark.incidentAssociations });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 12. Get Bookmarks Associated with an Incident
  app.get('/v1/incidents/:id/bookmarks', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

      const bookmarks = await bookmarkService.getBookmarksForIncident(id, tenantId);
      return reply.send({ success: true, data: bookmarks });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 13. Camera Playback Timeline Markers (for video player scrub bar)
  app.get('/v1/cameras/:id/timeline-bookmarks', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const query = z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      }).parse(request.query);

      const markers = await bookmarkService.getTimelineMarkers(tenantId, id, query.from, query.to);
      return reply.send({ success: true, data: markers });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // 14. Verify Bookmark for Legal/Admissibility Evidence
  app.post('/v1/video/bookmarks/:id/verify', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const tenantId = getTenantId(request);
      const verifiedBy = getUserId(request);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

      const bookmark = await bookmarkService.verifyBookmark(id, tenantId, verifiedBy);
      if (!bookmark) {
        return reply.code(404).send({ success: false, error: 'Bookmark not found' });
      }

      return reply.send({ success: true, data: bookmark });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });
}
