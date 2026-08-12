/**
 * Banking Analytics API Routes
 * 
 * REST API for banking analytics configuration and monitoring:
 * - Session queries and real-time status
 * - Monitor configuration (zones, rules, policies)
 * - Expected visit scheduling
 * - Personnel authorization management
 * - Evidence package generation
 * - Summary statistics and reporting
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  BankingAnalyticsService,
  getBankingAnalyticsService,
} from '../banking/banking-analytics.service.js';
import {
  BankingEvidenceService,
  getBankingEvidenceService,
} from '../banking/evidence/evidence.service.js';
import {
  getCashVanMonitorRepository,
  getCashVanSessionRepository,
  getExpectedVisitRepository,
  getPersonnelAuthorizationRepository,
} from '../banking/repositories/index.js';

/**
 * API configuration
 */
export interface BankingAnalyticsApiConfig {
  bankingService?: BankingAnalyticsService;
  evidenceService?: BankingEvidenceService;
}

/**
 * Request schemas
 */
const SessionQuerySchema = z.object({
  tenantId: z.string(),
  branchId: z.string().optional(),
  activeOnly: z.boolean().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  state: z.string().optional(),
  assessment: z.string().optional(),
});

const CreateMonitorSchema = z.object({
  tenantId: z.string(),
  branchId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  arrivalZoneId: z.string(),
  unloadingZoneId: z.string(),
  secureEntryZoneId: z.string().optional(),
  approvedRouteZones: z.array(z.string()).optional(),
});

const UpdateMonitorSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  personnelRules: z.object({
    minimumPersonnel: z.number().optional(),
    minimumGuards: z.number().optional(),
    maximumPersonnel: z.number().optional(),
    requireIdentityVerification: z.boolean().optional(),
    minimumIdentityConfidence: z.number().optional(),
  }).optional(),
  unloadingRules: z.object({
    maxDurationSeconds: z.number().optional(),
    minimumPersonnelNearby: z.number().optional(),
    maxEscortDistanceMeters: z.number().optional(),
    requireGuardEscort: z.boolean().optional(),
  }).optional(),
  accessRules: z.object({
    requireAccessCorrelation: z.boolean().optional(),
    accessCorrelationWindowMs: z.number().optional(),
    requireAuthorizedIdentity: z.boolean().optional(),
  }).optional(),
});

const AddVehicleRuleSchema = z.object({
  plate: z.string().optional(),
  plateRegex: z.string().optional(),
  providerId: z.string().optional(),
  vehicleClass: z.enum(['van', 'truck']).optional(),
  enabled: z.boolean().default(true),
});

const AddScheduleRuleSchema = z.object({
  daysOfWeek: z.array(z.number().min(0).max(6)),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  toleranceMinutes: z.number().default(15),
  enabled: z.boolean().default(true),
});

const CreateVisitSchema = z.object({
  tenantId: z.string(),
  branchId: z.string(),
  expectedPlate: z.string().optional(),
  expectedPlateRegex: z.string().optional(),
  providerId: z.string().optional(),
  providerName: z.string().optional(),
  expectedArrivalStart: z.string().datetime(),
  expectedArrivalEnd: z.string().datetime(),
  expectedPersonnel: z.array(z.object({
    identityId: z.string().optional(),
    role: z.enum(['cash_guard', 'cash_handler', 'driver']),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    required: z.boolean().default(true),
  })).optional(),
  notes: z.string().optional(),
});

const CreatePersonnelSchema = z.object({
  identityId: z.string(),
  tenantId: z.string(),
  organizationId: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  employeeId: z.string().optional(),
  roles: z.array(z.enum([
    'cash_guard',
    'cash_handler',
    'branch_manager',
    'vault_operator',
    'security_officer',
    'cash_van_driver',
  ])),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime().optional(),
});

/**
 * Register banking analytics API routes
 */
export async function registerBankingAnalyticsApiRoutes(
  app: FastifyInstance,
  config: BankingAnalyticsApiConfig = {}
) {
  const bankingService = config.bankingService || getBankingAnalyticsService();
  const evidenceService = config.evidenceService || getBankingEvidenceService();
  const monitorRepo = getCashVanMonitorRepository();
  const sessionRepo = getCashVanSessionRepository();
  const visitRepo = getExpectedVisitRepository();
  const personnelRepo = getPersonnelAuthorizationRepository();

  // Initialize service
  await bankingService.initialize();

  // ============================================================================
  // Session Endpoints
  // ============================================================================

  /**
   * Get all sessions with filters
   * GET /v1/banking/sessions
   */
  app.get('/v1/banking/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = SessionQuerySchema.parse(request.query);
      
      const sessions = await sessionRepo.query({
        tenantId: query.tenantId,
        branchId: query.branchId,
        activeOnly: query.activeOnly,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        state: query.state as any,
        assessment: query.assessment as any,
      });

      return reply.send({
        success: true,
        data: sessions,
        count: sessions.length,
      });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  /**
   * Get specific session
   * GET /v1/banking/sessions/:sessionId
   */
  app.get('/v1/banking/sessions/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const session = await sessionRepo.findById(sessionId);

      if (!session) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found',
        });
      }

      return reply.send({
        success: true,
        data: session,
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  /**
   * Get session summary statistics
   * GET /v1/banking/sessions/summary
   */
  app.get('/v1/banking/sessions/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, branchId } = request.query as { tenantId: string; branchId?: string };
      
      if (!tenantId) {
        return reply.status(400).send({
          success: false,
          error: 'tenantId is required',
        });
      }

      const summary = await bankingService.getSummary(tenantId, branchId);

      return reply.send({
        success: true,
        data: summary,
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // ============================================================================
  // Monitor Configuration Endpoints
  // ============================================================================

  /**
   * Get all monitors for a branch
   * GET /v1/banking/monitors
   */
  app.get('/v1/banking/monitors', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, branchId } = request.query as { tenantId: string; branchId: string };
      
      if (!tenantId || !branchId) {
        return reply.status(400).send({
          success: false,
          error: 'tenantId and branchId are required',
        });
      }

      const monitors = await monitorRepo.findByBranch(tenantId, branchId);

      return reply.send({
        success: true,
        data: monitors,
        count: monitors.length,
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  /**
   * Get specific monitor
   * GET /v1/banking/monitors/:monitorId
   */
  app.get('/v1/banking/monitors/:monitorId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { monitorId } = request.params as { monitorId: string };
      const monitor = await monitorRepo.findById(monitorId);

      if (!monitor) {
        return reply.status(404).send({
          success: false,
          error: 'Monitor not found',
        });
      }

      return reply.send({
        success: true,
        data: monitor,
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  /**
   * Create new monitor
   * POST /v1/banking/monitors
   */
  app.post('/v1/banking/monitors', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = CreateMonitorSchema.parse(request.body);
      
      const monitor = await monitorRepo.create({
        tenantId: data.tenantId,
        branchId: data.branchId,
        name: data.name,
        description: data.description,
        arrivalZoneId: data.arrivalZoneId,
        unloadingZoneId: data.unloadingZoneId,
        secureEntryZoneId: data.secureEntryZoneId,
        approvedRouteZones: data.approvedRouteZones,
      });

      return reply.status(201).send({
        success: true,
        data: monitor,
      });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  /**
   * Update monitor
   * PATCH /v1/banking/monitors/:monitorId
   */
  app.patch('/v1/banking/monitors/:monitorId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { monitorId } = request.params as { monitorId: string };
      const updates = UpdateMonitorSchema.parse(request.body);

      const monitor = await monitorRepo.update(monitorId, updates as any);

      if (!monitor) {
        return reply.status(404).send({
          success: false,
          error: 'Monitor not found',
        });
      }

      return reply.send({
        success: true,
        data: monitor,
      });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  /**
   * Delete monitor
   * DELETE /v1/banking/monitors/:monitorId
   */
  app.delete('/v1/banking/monitors/:monitorId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { monitorId } = request.params as { monitorId: string };
      const deleted = await monitorRepo.delete(monitorId);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: 'Monitor not found',
        });
      }

      return reply.send({
        success: true,
        message: 'Monitor deleted',
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  /**
   * Add vehicle rule to monitor
   * POST /v1/banking/monitors/:monitorId/vehicle-rules
   */
  app.post('/v1/banking/monitors/:monitorId/vehicle-rules', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { monitorId } = request.params as { monitorId: string };
      const rule = AddVehicleRuleSchema.parse(request.body);

      const monitor = await monitorRepo.addVehicleRule(monitorId, rule as any);

      if (!monitor) {
        return reply.status(404).send({
          success: false,
          error: 'Monitor not found',
        });
      }

      return reply.status(201).send({
        success: true,
        data: monitor,
      });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  /**
   * Add schedule rule to monitor
   * POST /v1/banking/monitors/:monitorId/schedule-rules
   */
  app.post('/v1/banking/monitors/:monitorId/schedule-rules', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { monitorId } = request.params as { monitorId: string };
      const rule = AddScheduleRuleSchema.parse(request.body);

      const monitor = await monitorRepo.addScheduleRule(monitorId, rule as any);

      if (!monitor) {
        return reply.status(404).send({
          success: false,
          error: 'Monitor not found',
        });
      }

      return reply.status(201).send({
        success: true,
        data: monitor,
      });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  // ============================================================================
  // Expected Visit Endpoints
  // ============================================================================

  /**
   * Get expected visits
   * GET /v1/banking/visits
   */
  app.get('/v1/banking/visits', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { branchId, startDate, endDate } = request.query as {
        branchId: string;
        startDate?: string;
        endDate?: string;
      };

      if (!branchId) {
        return reply.status(400).send({
          success: false,
          error: 'branchId is required',
        });
      }

      const start = startDate ? new Date(startDate) : new Date();
      const end = endDate ? new Date(endDate) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

      const visits = await visitRepo.findByBranchAndDateRange(branchId, start, end);

      return reply.send({
        success: true,
        data: visits,
        count: visits.length,
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  /**
   * Create expected visit
   * POST /v1/banking/visits
   */
  app.post('/v1/banking/visits', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = CreateVisitSchema.parse(request.body);

      const visit = await visitRepo.create({
        tenantId: data.tenantId,
        branchId: data.branchId,
        expectedPlate: data.expectedPlate,
        expectedPlateRegex: data.expectedPlateRegex,
        providerId: data.providerId,
        providerName: data.providerName,
        expectedArrivalStart: new Date(data.expectedArrivalStart),
        expectedArrivalEnd: new Date(data.expectedArrivalEnd),
        expectedPersonnel: (data.expectedPersonnel || []).map((p: any) => ({
        identityId: p.identityId,
        firstName: p.firstName,
        lastName: p.lastName,
        required: p.required ?? true,
        role: p.role || 'cash_handler' // Ensure role is always set with a valid value
      })) as any, // Type assertion to bypass strict type checking
        notes: data.notes,
      });

      return reply.status(201).send({
        success: true,
        data: visit,
      });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  /**
   * Update visit
   * PATCH /v1/banking/visits/:visitId
   */
  app.patch('/v1/banking/visits/:visitId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { visitId } = request.params as { visitId: string };
      const updates = request.body as any;

      const visit = await visitRepo.update(visitId, updates);

      if (!visit) {
        return reply.status(404).send({
          success: false,
          error: 'Visit not found',
        });
      }

      return reply.send({
        success: true,
        data: visit,
      });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  /**
   * Delete visit
   * DELETE /v1/banking/visits/:visitId
   */
  app.delete('/v1/banking/visits/:visitId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { visitId } = request.params as { visitId: string };
      const deleted = await visitRepo.delete(visitId);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: 'Visit not found',
        });
      }

      return reply.send({
        success: true,
        message: 'Visit deleted',
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // ============================================================================
  // Personnel Authorization Endpoints
  // ============================================================================

  /**
   * Get personnel by role
   * GET /v1/banking/personnel
   */
  app.get('/v1/banking/personnel', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { tenantId, role } = request.query as { tenantId: string; role?: string };

      if (!tenantId) {
        return reply.status(400).send({
          success: false,
          error: 'tenantId is required',
        });
      }

      if (role) {
        const personnel = await personnelRepo.findByRole(tenantId, role as any);
        return reply.send({
          success: true,
          data: personnel,
          count: personnel.length,
        });
      }

      // Return all personnel (in production, paginate this)
      return reply.send({
        success: true,
        data: [],
        count: 0,
        message: 'Use role parameter to filter personnel',
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  /**
   * Create personnel authorization
   * POST /v1/banking/personnel
   */
  app.post('/v1/banking/personnel', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = CreatePersonnelSchema.parse(request.body);

      const personnel = await personnelRepo.create({
        identityId: data.identityId,
        tenantId: data.tenantId,
        organizationId: data.organizationId,
        firstName: data.firstName,
        lastName: data.lastName,
        employeeId: data.employeeId,
        roles: data.roles,
        validFrom: new Date(data.validFrom),
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
      });

      return reply.status(201).send({
        success: true,
        data: personnel,
      });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
      });
    }
  });

  /**
   * Get personnel by identity
   * GET /v1/banking/personnel/:identityId
   */
  app.get('/v1/banking/personnel/:identityId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { identityId } = request.params as { identityId: string };
      const personnel = await personnelRepo.findByIdentityId(identityId);

      if (!personnel) {
        return reply.status(404).send({
          success: false,
          error: 'Personnel not found',
        });
      }

      return reply.send({
        success: true,
        data: personnel,
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  // ============================================================================
  // Evidence Endpoints
  // ============================================================================

  /**
   * Generate evidence package for session
   * POST /v1/banking/sessions/:sessionId/evidence
   */
  app.post('/v1/banking/sessions/:sessionId/evidence', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      
      const evidencePackage = await evidenceService.generateEvidencePackage(sessionId);

      return reply.send({
        success: true,
        data: evidencePackage,
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  /**
   * Get forensic replay for session
   * GET /v1/banking/sessions/:sessionId/replay
   */
  app.get('/v1/banking/sessions/:sessionId/replay', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const { fps } = request.query as { fps?: string };
      
      const fpsValue = fps ? parseInt(fps, 10) : 1;
      const replay = await evidenceService.getForensicReplay(sessionId, fpsValue);

      return reply.send({
        success: true,
        data: {
          sessionId,
          fps: fpsValue,
          frameCount: replay.length,
          frames: replay,
        },
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  });

  console.log('[BankingAnalyticsAPI] Routes registered');
}
