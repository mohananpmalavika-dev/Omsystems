/**
 * Federation API Routes
 * REST APIs for federation management, search, playback, and monitoring
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Pool } from 'pg';
import { getFederationManager } from '../services/federation-manager.service.js';
import { getFederationGateway } from '../services/federation-gateway.service.js';
import { getGlobalAuthenticationService } from '../services/global-authentication.service.js';
import { getFederationSearchService } from '../services/federation-search.service.js';
import { getFederationPlaybackService } from '../services/federation-playback.service.js';
import { getGlobalAlertCorrelationService } from '../services/global-alert-correlation.service.js';

const serverRegistrationSchema = z.object({
  externalId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  role: z.enum(['global_command_center', 'regional_control_center', 'backup_server', 'edge_server']),
  countryCode: z.string().length(2),
  region: z.string().min(1).max(100),
  area: z.string().max(100).optional(),
  timezone: z.string().default('UTC'),
  baseUrl: z.string().url(),
  apiUrl: z.string().url(),
  websocketUrl: z.string().url().optional(),
  sharedSecret: z.string().min(32),
  primaryServerId: z.string().uuid().optional(),
  backupServerId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional()
});

const heartbeatSchema = z.object({
  status: z.enum(['online', 'degraded', 'offline', 'maintenance']),
  healthScore: z.number().min(0).max(100),
  responseTimeMs: z.number().optional(),
  cpuUsage: z.number().min(0).max(100).optional(),
  memoryUsage: z.number().min(0).max(100).optional(),
  diskUsage: z.number().min(0).max(100).optional(),
  totalCameras: z.number().int().nonnegative(),
  onlineCameras: z.number().int().nonnegative(),
  offlineCameras: z.number().int().nonnegative().optional(),
  requestsPerMinute: z.number().optional(),
  bandwidthMbps: z.number().optional()
});

const searchQuerySchema = z.object({
  queryType: z.enum(['vehicle', 'face', 'object', 'incident', 'person']),
  timeRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime()
  }),
  filters: z.object({
    vehiclePlate: z.string().optional(),
    vehicleColor: z.string().optional(),
    vehicleType: z.string().optional(),
    objectClass: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    cameraIds: z.array(z.string().uuid()).optional(),
    branchIds: z.array(z.string().uuid()).optional(),
    regions: z.array(z.string()).optional()
  }).optional(),
  limit: z.number().int().positive().max(1000).default(100),
  offset: z.number().int().nonnegative().default(0)
});

const authenticationSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  serverId: z.string().uuid(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional()
});

export async function registerFederationRoutes(
  app: FastifyInstance,
  pool: Pool
): Promise<void> {
  const federationManager = getFederationManager(pool);
  const federationGateway = getFederationGateway(pool);
  const globalAuth = getGlobalAuthenticationService(pool);
  const federationSearch = getFederationSearchService(pool);
  const federationPlayback = getFederationPlaybackService(pool);
  const globalAlertCorrelation = getGlobalAlertCorrelationService(pool);

  // Start services
  await federationManager.start();
  await globalAlertCorrelation.start();

  // ===== Server Management APIs =====

  /**
   * Register a new federated server
   */
  app.post('/v1/federation/servers', async (request, reply) => {
    const body = serverRegistrationSchema.parse(request.body);
    
    const server = await federationManager.registerServer({
      ...body,
      tenantId: request.currentUser.tenantId
    });

    return reply.code(201).send(server);
  });

  /**
   * List all federated servers
   */
  app.get('/v1/federation/servers', async (request, reply) => {
    const query = z.object({
      role: z.enum(['global_command_center', 'regional_control_center', 'backup_server', 'edge_server']).optional(),
      status: z.enum(['online', 'degraded', 'offline', 'maintenance', 'failover_active']).optional(),
      region: z.string().optional()
    }).parse(request.query);

    const servers = await federationManager.listServers(
      request.currentUser.tenantId,
      query
    );

    return { data: servers };
  });

  /**
   * Get server details
   */
  app.get('/v1/federation/servers/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const server = await federationManager.getServerById(id);
    
    if (!server) {
      return reply.code(404).send({ error: 'Server not found' });
    }

    return server;
  });

  /**
   * Process server heartbeat
   */
  app.post('/v1/federation/servers/:externalId/heartbeat', async (request, reply) => {
    const { externalId } = z.object({ externalId: z.string() }).parse(request.params);
    const metrics = heartbeatSchema.parse(request.body);

    const server = await federationManager.processHeartbeat(externalId, metrics);

    return server;
  });

  /**
   * Get federation dashboard summary
   */
  app.get('/v1/federation/dashboard', async (request, reply) => {
    const summary = await federationManager.getDashboardSummary(
      request.currentUser.tenantId
    );

    return summary;
  });

  // ===== Global Authentication APIs =====

  /**
   * Authenticate user and create global session
   */
  app.post('/v1/federation/auth/login', async (request, reply) => {
    const body = authenticationSchema.parse(request.body);

    const result = await globalAuth.authenticateUser(
      request.currentUser.tenantId,
      body.username,
      body.password,
      body.serverId,
      {
        ipAddress: body.ipAddress || request.ip,
        userAgent: body.userAgent || request.headers['user-agent']
      }
    );

    if (!result.success) {
      return reply.code(401).send({ error: result.error });
    }

    return {
      token: result.token,
      user: result.identity,
      session: result.session
    };
  });

  /**
   * Verify token
   */
  app.post('/v1/federation/auth/verify', async (request, reply) => {
    const { token } = z.object({ token: z.string() }).parse(request.body);

    const payload = await globalAuth.verifyToken(token);

    if (!payload) {
      return reply.code(401).send({ error: 'Invalid token' });
    }

    return { valid: true, payload };
  });

  /**
   * Logout (revoke session)
   */
  app.post('/v1/federation/auth/logout', async (request, reply) => {
    const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(request.body);

    const success = await globalAuth.revokeSession(sessionId, 'User logout');

    return { success };
  });

  /**
   * Get active sessions
   */
  app.get('/v1/federation/auth/sessions', async (request, reply) => {
    const { globalUserId } = z.object({ globalUserId: z.string().uuid() }).parse(request.query);

    const sessions = await globalAuth.getUserActiveSessions(globalUserId);

    return { data: sessions };
  });

  // ===== Federation Search APIs =====

  /**
   * Cross-server search
   */
  app.post('/v1/federation/search', async (request, reply) => {
    const searchQuery = searchQuerySchema.parse(request.body);

    const results = await federationSearch.searchAcrossServers(
      request.currentUser.tenantId,
      {
        ...searchQuery,
        timeRange: {
          from: new Date(searchQuery.timeRange.from),
          to: new Date(searchQuery.timeRange.to)
        }
      }
    );

    return results;
  });

  /**
   * Reconstruct entity journey
   */
  app.post('/v1/federation/search/journey', async (request, reply) => {
    const body = z.object({
      entityType: z.enum(['vehicle', 'person', 'face']),
      entityId: z.string(),
      timeRange: z.object({
        from: z.string().datetime(),
        to: z.string().datetime()
      })
    }).parse(request.body);

    const journey = await federationSearch.reconstructJourney(
      request.currentUser.tenantId,
      body.entityType,
      body.entityId,
      {
        from: new Date(body.timeRange.from),
        to: new Date(body.timeRange.to)
      }
    );

    if (!journey) {
      return reply.code(404).send({ error: 'No journey found' });
    }

    return journey;
  });

  // ===== Federation Playback APIs =====

  /**
   * Build cross-server timeline
   */
  app.post('/v1/federation/playback/timeline', async (request, reply) => {
    const body = z.object({
      cameraId: z.string().uuid(),
      timeRange: z.object({
        from: z.string().datetime(),
        to: z.string().datetime()
      })
    }).parse(request.body);

    const timeline = await federationPlayback.buildCrossServerTimeline(
      request.currentUser.tenantId,
      body.cameraId,
      {
        from: new Date(body.timeRange.from),
        to: new Date(body.timeRange.to)
      }
    );

    return timeline;
  });

  /**
   * Build multi-camera playback
   */
  app.post('/v1/federation/playback/multi-camera', async (request, reply) => {
    const body = z.object({
      cameraIds: z.array(z.string().uuid()).min(1).max(16),
      timeRange: z.object({
        from: z.string().datetime(),
        to: z.string().datetime()
      })
    }).parse(request.body);

    const playback = await federationPlayback.buildMultiCameraPlayback(
      request.currentUser.tenantId,
      body.cameraIds,
      {
        from: new Date(body.timeRange.from),
        to: new Date(body.timeRange.to)
      }
    );

    return playback;
  });

  // ===== Global Alert Correlation APIs =====

  /**
   * Get active correlations
   */
  app.get('/v1/federation/correlations', async (request, reply) => {
    const query = z.object({
      severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
      regions: z.string().transform(val => val.split(',')).optional(),
      limit: z.string().transform(val => parseInt(val)).optional()
    }).parse(request.query);

    const correlations = await globalAlertCorrelation.getActiveCorrelations(
      request.currentUser.tenantId,
      {
        severity: query.severity,
        regions: query.regions,
        limit: query.limit
      }
    );

    return { data: correlations };
  });

  /**
   * Mark correlation as investigated
   */
  app.post('/v1/federation/correlations/:id/investigate', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      notes: z.string().optional(),
      createIncident: z.boolean().default(false)
    }).parse(request.body);

    await globalAlertCorrelation.markAsInvestigated(
      id,
      body.notes,
      body.createIncident
    );

    return { success: true };
  });

  // ===== Gateway APIs =====

  /**
   * Route request to specific server
   */
  app.post('/v1/federation/gateway/route', async (request, reply) => {
    const body = z.object({
      scopeNodeId: z.string().uuid().optional(),
      targetServerId: z.string().uuid().optional(),
      path: z.string(),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
      body: z.unknown().optional(),
      query: z.record(z.string()).optional()
    }).parse(request.body);

    const response = await federationGateway.routeRequest({
      tenantId: request.currentUser.tenantId,
      scopeNodeId: body.scopeNodeId,
      targetServerId: body.targetServerId,
      path: body.path,
      method: body.method,
      body: body.body,
      query: body.query
    });

    return response;
  });

  /**
   * Broadcast request to multiple servers
   */
  app.post('/v1/federation/gateway/broadcast', async (request, reply) => {
    const body = z.object({
      path: z.string(),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
      body: z.unknown().optional(),
      regions: z.array(z.string()).optional(),
      serverIds: z.array(z.string().uuid()).optional()
    }).parse(request.body);

    const response = await federationGateway.broadcastRequest(
      request.currentUser.tenantId,
      {
        path: body.path,
        method: body.method,
        body: body.body
      },
      {
        regions: body.regions,
        serverIds: body.serverIds
      }
    );

    return response;
  });

  /**
   * Get circuit breaker status
   */
  app.get('/v1/federation/gateway/circuit-breakers', async (request, reply) => {
    const status = federationGateway.getCircuitBreakerStatus();
    return { data: status };
  });
}
