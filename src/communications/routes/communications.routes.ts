/**
 * KryptoVision Connect - REST API Routes
 * 
 * Complete API routes for branch-VMS communication subsystem.
 * 
 * Architecture:
 * - Uses Fastify app instance
 * - Native PostgreSQL with pg pool (no ORM)
 * - Redis for distributed state
 * - Socket.IO for WebSocket signaling
 * - JWT-based device authentication
 * 
 * Route groups:
 * 1. Device enrollment and management
 * 2. Presence and connectivity
 * 3. Call initiation and control
 * 4. Messaging and conversations
 * 5. History and administration
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Pool } from 'pg';
import type { RedisClientType } from 'redis';
import type { Logger } from 'pino';
import type { ControlPlaneStore } from '../../control-plane-store.js';
import { redisModule } from '../../bootstrap/redis.module.js';

// Import all services
import { DeviceEnrollmentService } from '../services/device-enrollment.service.js';
import { DeviceCredentialService } from '../services/device-credential.service.js';
import { CommunicationPresenceService } from '../services/presence.service.js';
import { CallStateMachineService } from '../services/call-state-machine.service.js';
import { CommunicationCallService } from '../services/call.service.js';
import { CommunicationMessagingService } from '../services/messaging.service.js';
import { CommunicationSignalingGateway } from '../gateways/signaling.gateway.js';
import { createVoiceMediaProvider, type VoiceMediaProvider } from '../providers/voice-media.provider.js';

// Import types
import type {
  GenerateEnrollmentCodeInput,
  EnrollDeviceInput,
  InitiateCallInput,
  SendMessageInput,
  CallableEntity,
} from '../domain/types.js';
import { COMMUNICATION_PERMISSIONS } from '../domain/constants.js';

// ============================================================================
// REQUEST SCHEMAS
// ============================================================================

const enrollmentCodeSchema = z.object({
  branchId: z.string().uuid(),
  allowedDeviceType: z.enum(['BRANCH_SHARED', 'BRANCH_MOBILE', 'EMPLOYEE_MOBILE', 'EMPLOYEE_DESKTOP', 'EMERGENCY_DEVICE']).optional(),
  expiresInMinutes: z.number().int().min(1).max(1440).default(30),
  maxUses: z.number().int().min(0).max(100).default(1),
  preAssignedEmployeeIds: z.array(z.string().uuid()).optional(),
});

const enrollDeviceSchema = z.object({
  enrollmentCode: z.string().min(1),
  branchId: z.string().uuid().optional(),
  deviceName: z.string().trim().min(2).max(120),
  platform: z.enum(['WINDOWS', 'ANDROID', 'IOS', 'WEB']),
  publicKey: z.string().min(100),
  deviceUuid: z.string().min(1).max(64),
  linkedEmployeeIds: z.array(z.string().uuid()).optional(),
  deviceCapabilities: z.object({
    microphone: z.boolean().optional(),
    speaker: z.boolean().optional(),
    camera: z.boolean().optional(),
    notifications: z.boolean().optional(),
    webrtc: z.boolean().optional(),
  }).optional(),
});

const linkEmployeeSchema = z.object({
  employeeId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
  canReceiveCalls: z.boolean().default(true),
  canMakeCalls: z.boolean().default(true),
  canReceiveMessages: z.boolean().default(true),
  canSendMessages: z.boolean().default(true),
});

const heartbeatSchema = z.object({
  appVersion: z.string().max(40),
  capabilities: z.object({
    microphone: z.boolean().optional(),
    speaker: z.boolean().optional(),
    camera: z.boolean().optional(),
    notifications: z.boolean().optional(),
    webrtc: z.boolean().optional(),
  }).optional(),
});

const deviceRefreshSchema = z.object({ refreshToken: z.string().min(32) });

const initiateCallSchema = z.object({
  targetType: z.enum(['BRANCH', 'EMPLOYEE', 'SOC_QUEUE']),
  targetId: z.string().min(1),
  context: z.object({
    incidentId: z.string().optional(),
    alertId: z.string().optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
    notes: z.string().optional(),
  }).optional(),
});

const sendMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  targetBranchId: z.string().uuid().optional(),
  targetEmployeeId: z.string().uuid().optional(),
  body: z.string().min(1).max(4000),
  messageType: z.enum(['TEXT', 'IMAGE', 'VOICE_NOTE', 'SYSTEM']).default('TEXT'),
});

// ============================================================================
// INTERFACES
// ============================================================================

interface RouteContext {
  pool: Pool;
  redis: RedisClientType;
  logger: Logger;
  store: ControlPlaneStore;
  
  // Services
  enrollmentService: DeviceEnrollmentService;
  credentialService: DeviceCredentialService;
  presenceService: CommunicationPresenceService;
  callStateMachine: CallStateMachineService;
  callService: CommunicationCallService;
  messagingService: CommunicationMessagingService;
  signalingGateway: CommunicationSignalingGateway;
  mediaProvider: VoiceMediaProvider;
}

interface AuthenticatedRequest extends FastifyRequest {
  currentUser: {
    id: string;
    tenantId: string;
    role: string;
  };
  deviceContext?: {
    deviceId: string;
    tenantId: string;
    branchId: string;
  };
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Authenticate device using JWT token
 */
async function authenticateDevice(
  request: AuthenticatedRequest,
  reply: FastifyReply,
  ctx: RouteContext
): Promise<boolean> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await reply.code(401).send({ error: 'device_credential_required' });
    return false;
  }
  
  const credential = authHeader.substring(7);
  
  try {
    const deviceContext = await ctx.credentialService.verifyDeviceCredential(credential);
    
    if (!deviceContext) {
      await reply.code(401).send({ error: 'invalid_or_revoked_device' });
      return false;
    }
    
    request.deviceContext = deviceContext;
    return true;
  } catch (error) {
    ctx.logger.error({ error }, 'Device authentication failed');
    await reply.code(401).send({ error: 'authentication_failed' });
    return false;
  }
}

/**
 * Check user permission
 */
async function requirePermission(
  request: AuthenticatedRequest,
  reply: FastifyReply,
  ctx: RouteContext,
  permission: string
): Promise<boolean> {
  const user = request.currentUser?.id ? await ctx.store.getUser(request.currentUser.id) : undefined;
  if (!user || user.tenantId !== request.currentUser.tenantId) {
    await reply.code(401).send({ error: 'unauthenticated' });
    return false;
  }

  const action = permission.startsWith('communication.device.')
    ? 'device:configure'
    : permission.includes('view') || permission.includes('message')
      ? 'incident:view'
      : 'incident:create';
  const body = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;
  const params = request.params as Record<string, unknown>;
  let branchId = (body.branchId || body.targetBranchId || params.branchId) as string | undefined;

  if (!branchId && typeof body.targetId === 'string' && body.targetType === 'BRANCH') branchId = body.targetId;
  if (!branchId && typeof body.targetId === 'string' && body.targetType === 'EMPLOYEE') {
    const employee = await ctx.pool.query<{ branch_id: string }>(
      'SELECT branch_id FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true LIMIT 1',
      [body.targetId, user.tenantId]
    );
    branchId = employee.rows[0]?.branch_id;
  }
  const deviceId = typeof params.deviceId === 'string' ? params.deviceId : typeof params.id === 'string' ? params.id : undefined;
  if (!branchId && deviceId) {
    branchId = (await ctx.enrollmentService.getDevice(deviceId))?.branchId;
  }

  if (!branchId) {
    await reply.code(403).send({ error: 'forbidden' });
    return false;
  }
  const branch = await ctx.store.getNode(branchId);
  if (!branch || branch.tenantId !== user.tenantId || branch.type !== 'branch') {
    await reply.code(404).send({ error: 'branch_not_found' });
    return false;
  }
  const decision = await ctx.store.checkAccess(user, action, branchId);
  if (!decision?.allowed) await reply.code(403).send({ error: 'forbidden' });
  return Boolean(decision?.allowed);
}

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

class LazySignalingGateway {
  private gateway: CommunicationSignalingGateway | null = null;
  constructor(private readonly getApp: () => FastifyInstance, private readonly pool: Pool) {}

  private getGateway(): CommunicationSignalingGateway | null {
    if (this.gateway) return this.gateway;
    const io = (this.getApp() as any).io;
    if (!io) return null;
    try {
      this.gateway = new CommunicationSignalingGateway(io);
      return this.gateway;
    } catch {
      return null;
    }
  }

  private async ringingParticipants(callId: string): Promise<{ devices: string[]; operators: string[] }> {
    const result = await this.pool.query(
      `SELECT device_id::text, operator_id::text FROM communication_call_participants
       WHERE call_id = $1 AND connection_status IN ('INVITED', 'RINGING')`,
      [callId]
    );
    return {
      devices: result.rows.map((row: any) => row.device_id).filter(Boolean),
      operators: result.rows.map((row: any) => row.operator_id).filter(Boolean),
    };
  }

  async broadcastCallInvite(tenantId: string, callId: string, data: any): Promise<void> {
    const gateway = this.getGateway();
    if (!gateway) throw new Error('Communication websocket is unavailable');
    const { devices, operators } = await this.ringingParticipants(callId);
    gateway.broadcastCallInvite(tenantId, devices, operators, { id: callId, ...data });
  }

  async broadcastCallAccept(tenantId: string, callId: string, data: any): Promise<void> {
    this.getGateway()?.broadcastCallAccept(tenantId, { id: callId, ...data }, data.acceptedBy);
  }

  async broadcastCallAcceptedElsewhere(tenantId: string, callId: string, acceptorId: string): Promise<void> {
    const { devices, operators } = await this.ringingParticipants(callId);
    this.getGateway()?.broadcastCallAcceptedElsewhere(tenantId, callId, acceptorId, devices, operators);
  }

  broadcastCallReject(tenantId: string, callId: string, data: any): void {
    this.getGateway()?.broadcastCallReject(tenantId, callId, data.rejectedBy || data.actorId || 'unknown');
  }

  broadcastCallCancel(tenantId: string, callId: string, data: any): void {
    this.getGateway()?.broadcastCallCancel(tenantId, callId, data.cancelledBy || data.actorId || 'unknown');
  }

  broadcastCallEnd(tenantId: string, callId: string, data: any): void {
    this.getGateway()?.broadcastCallEnd(tenantId, callId, typeof data === 'string' ? data : data.endReason || 'NORMAL');
  }

  broadcastMessageCreated(tenantId: string, conversationId: string, message: any): void {
    this.getGateway()?.broadcastMessageCreated(tenantId, conversationId, message);
  }

  broadcastMessageDelivered(tenantId: string, conversationId: string, data: any): void {
    this.getGateway()?.broadcastMessageDelivered(tenantId, conversationId, data);
  }

  broadcastMessageRead(tenantId: string, conversationId: string, data: any): void {
    this.getGateway()?.broadcastMessageRead(tenantId, conversationId, data);
  }

  broadcastPresenceChanged(tenantId: string, presence: any): void {
    this.getGateway()?.broadcastPresenceChanged(tenantId, presence);
  }
}

export async function registerCommunicationsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
): Promise<void> {
  const pool: any = (store as any)?.pool || (store as any)?.db || (app as any).pg?.pool;
  const redis: any = (store as any)?.redis || (app as any).redis || redisModule?.getClient?.();
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new Error('Communications requires the configured PostgreSQL pool');
  }
  if (!redis || typeof redis.get !== 'function' || typeof redis.setEx !== 'function') {
    throw new Error('Communications requires the configured Redis client');
  }
  
  const logger = app.log?.child ? app.log.child({ module: 'communications' }) : console as any;
  
  // Initialize all services
  const enrollmentService = new DeviceEnrollmentService(pool);
  const credentialService = new DeviceCredentialService(pool);
  const presenceService = new CommunicationPresenceService(redis, pool);
  const callStateMachine = new CallStateMachineService(redis, pool);
  const callService = new CommunicationCallService(
    redis,
    pool,
    presenceService
  );
  const messagingService = new CommunicationMessagingService(pool, redis);
  
  // Initialize WebSocket signaling gateway (lazy so it connects when Socket.IO attaches to app)
  const signalingGateway = new LazySignalingGateway(() => app, pool) as unknown as CommunicationSignalingGateway;
  
  // Initialize WebRTC media provider
  const mediaProvider = createVoiceMediaProvider({
      provider: (process.env.COMM_MEDIA_PROVIDER as any) ?? 'self-hosted',
      turnServerUrl: process.env.COMM_TURN_SERVER_URL || 'stun:stun.l.google.com:19302',
      turnUsername: process.env.COMM_TURN_USERNAME || '',
      turnCredential: process.env.COMM_TURN_CREDENTIAL || '',
      redis,
      logger,
    });
  
  const ctx: RouteContext = {
    pool,
    redis,
    logger,
    store,
    enrollmentService,
    credentialService,
    presenceService,
    callStateMachine,
    callService,
    messagingService,
    signalingGateway,
    mediaProvider,
  };
  
  // ===========================================================================
  // 1. ENROLLMENT & DEVICE MANAGEMENT ROUTES
  // ===========================================================================
  
  /**
   * Generate enrollment code (Admin)
   * POST /v1/communications/enrollment-codes
   */
  app.post('/v1/communications/enrollment-codes', async (request: AuthenticatedRequest, reply) => {
    try {
      const body = enrollmentCodeSchema.parse(request.body);
      
      // Check permission
      if (!(await requirePermission(request, reply, ctx, COMMUNICATION_PERMISSIONS.DEVICE_CREATE))) {
        return;
      }
      
      const branch = await store.getNode(body.branchId);
      if (!branch || branch.type !== 'branch' || branch.tenantId !== request.currentUser.tenantId) {
        return reply.code(404).send({ error: 'branch_not_found' });
      }
      const input = {
        branchId: body.branchId,
        tenantId: branch.tenantId,
        allowedDeviceType: body.allowedDeviceType,
        expiresInMinutes: body.expiresInMinutes,
        maxUses: body.maxUses,
        employeeIds: body.preAssignedEmployeeIds,
        createdBy: request.currentUser.id,
      };
      
      const code = await ctx.enrollmentService.generateEnrollmentCode(input);
      
      return reply.code(201).send({
        id: code.id,
        code: code.code,
        branchId: code.branchId,
        expiresAt: code.expiresAt,
        maxUses: code.maxUses,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'invalid_request', details: error.flatten() });
      }
      ctx.logger.error({ error }, 'Failed to generate enrollment code');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  /**
   * Enroll device (Public - uses enrollment code)
   * POST /v1/communications/devices/enroll
   */
  app.post('/v1/communications/devices/enroll', { config: { noAuth: true } }, async (request, reply) => {
    try {
      const body = enrollDeviceSchema.parse(request.body);
      
      const input: EnrollDeviceInput = {
        ...body,
        linkedEmployeeIds: body.linkedEmployeeIds ?? [],
      };
      
      const result = await ctx.enrollmentService.enrollDevice(input);
      
      // Generate device tokens
      const tokens = await ctx.credentialService.createDeviceTokens(result.device);
      
      // Audit event
      await store.writeAudit({
        tenantId: result.device.tenantId,
        actorUserId: null,
        action: 'COMM_DEVICE_ENROLLED',
        resourceNodeId: result.device.branchId,
        outcome: 'success',
        sourceIp: request.ip,
        details: {
          deviceId: result.device.id,
          deviceType: result.device.deviceType,
          platform: result.device.platform,
        },
      });
      const branch = await store.getNode(result.device.branchId);
      
      return reply.code(201).send({
        device: {
          id: result.device.id,
          deviceUuid: result.device.deviceUuid,
          deviceName: result.device.deviceName,
          branchId: result.device.branchId,
          branchName: branch?.name || '',
          tenantId: result.device.tenantId,
          status: result.device.status,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'invalid_request', details: error.flatten() });
      }
      ctx.logger.error({ error }, 'Device enrollment failed');
      return reply.code(400).send({
        error: error.message || 'enrollment_failed',
        message: error.message,
      });
    }
  });

  app.post('/v1/communications/devices/refresh', { config: { noAuth: true } }, async (request, reply) => {
    try {
      const { refreshToken } = deviceRefreshSchema.parse(request.body);
      const tokens = await ctx.credentialService.refreshDeviceTokens(refreshToken);
      if (!tokens) return reply.code(401).send({ error: 'invalid_device_refresh_token' });
      return reply.send(tokens);
    } catch (error) {
      if (error instanceof z.ZodError) return reply.code(400).send({ error: 'invalid_request' });
      ctx.logger.error({ error }, 'Failed to refresh device credentials');
      return reply.code(500).send({ error: 'device_refresh_failed' });
    }
  });
  
  /**
   * List devices (Admin)
   * GET /v1/communications/devices
   */
  app.get('/v1/communications/devices', async (request: AuthenticatedRequest, reply) => {
    try {
      const { branchId, status } = request.query as { branchId?: string; status?: string };
      
      let query = `
        SELECT 
          id, tenant_id, branch_id, device_name, device_uuid, device_type, platform,
          status, app_version, last_seen_at, registered_at, approved_at
        FROM communication_devices
        WHERE tenant_id = $1 AND status != 'REVOKED'
      `;
      const params: any[] = [request.currentUser.tenantId];
      
      if (branchId) {
        params.push(branchId);
        query += ` AND branch_id = $${params.length}`;
      }
      
      if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }
      
      query += ` ORDER BY registered_at DESC LIMIT 100`;
      
      const result = await ctx.pool.query(query, params);
      
      return {
        data: result.rows.map(row => ({
          id: row.id,
          deviceName: row.device_name,
          deviceUuid: row.device_uuid,
          deviceType: row.device_type,
          platform: row.platform,
          branchId: row.branch_id,
          status: row.status,
          appVersion: row.app_version,
          lastSeenAt: row.last_seen_at,
          registeredAt: row.registered_at,
          approvedAt: row.approved_at,
        })),
      };
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to list devices');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  /**
   * Get device details
   * GET /v1/communications/devices/:id
   */
  app.get('/v1/communications/devices/:id', async (request: AuthenticatedRequest, reply) => {
    try {
      const { id } = request.params as { id: string };
      
      const result = await ctx.pool.query(
        `SELECT 
          id, tenant_id, branch_id, device_name, device_uuid, device_type, platform,
          status, status_reason, app_version, last_seen_at, last_ip,
          registered_at, approved_at, approved_by
        FROM communication_devices
        WHERE id = $1 AND tenant_id = $2`,
        [id, request.currentUser.tenantId]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'device_not_found' });
      }
      
      const device = result.rows[0];
      
      // Get linked employees
      const employeesResult = await ctx.pool.query(
        `SELECT 
          e.id, e.employee_id, u.username, u.display_name,
          e.is_primary, e.can_receive_calls, e.can_make_calls,
          e.can_receive_messages, e.can_send_messages, e.linked_at
        FROM communication_device_employees e
        JOIN users u ON e.employee_id = u.id
        WHERE e.device_id = $1 AND e.unlinked_at IS NULL`,
        [id]
      );
      
      return {
        id: device.id,
        deviceName: device.device_name,
        deviceUuid: device.device_uuid,
        deviceType: device.device_type,
        platform: device.platform,
        branchId: device.branch_id,
        status: device.status,
        statusReason: device.status_reason,
        appVersion: device.app_version,
        lastSeenAt: device.last_seen_at,
        lastIp: device.last_ip,
        registeredAt: device.registered_at,
        approvedAt: device.approved_at,
        approvedBy: device.approved_by,
        employees: employeesResult.rows.map(e => ({
          id: e.employee_id,
          username: e.username,
          displayName: e.display_name,
          isPrimary: e.is_primary,
          canReceiveCalls: e.can_receive_calls,
          canMakeCalls: e.can_make_calls,
          canReceiveMessages: e.can_receive_messages,
          canSendMessages: e.can_send_messages,
          linkedAt: e.linked_at,
        })),
      };
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to get device details');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  /**
   * Approve device (Admin)
   * POST /v1/communications/devices/:id/approve
   */
  app.post('/v1/communications/devices/:id/approve', async (request: AuthenticatedRequest, reply) => {
    try {
      const { id } = request.params as { id: string };
      
      const device = await ctx.enrollmentService.approveDevice(id, request.currentUser.id);
      
      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: 'COMM_DEVICE_APPROVED',
        resourceNodeId: device.branchId,
        outcome: 'success',
        sourceIp: request.ip,
        details: { deviceId: device.id },
      });
      
      return {
        id: device.id,
        status: device.status,
        approvedAt: device.approvedAt,
      };
    } catch (error: any) {
      ctx.logger.error({ error }, 'Failed to approve device');
      return reply.code(400).send({ error: error.message || 'approval_failed' });
    }
  });
  
  /**
   * Revoke device (Admin)
   * POST /v1/communications/devices/:id/revoke
   */
  app.post('/v1/communications/devices/:id/revoke', async (request: AuthenticatedRequest, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason?: string };
      
      await ctx.enrollmentService.revokeDevice(id, request.currentUser.id, reason || 'Administrative action');
      
      // Revoke device credentials
      await ctx.credentialService.revokeDeviceCredential(id);
      
      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: 'COMM_DEVICE_REVOKED',
        resourceNodeId: null,
        outcome: 'success',
        sourceIp: request.ip,
        details: { deviceId: id, reason },
      });
      
      return reply.code(204).send();
    } catch (error: any) {
      ctx.logger.error({ error }, 'Failed to revoke device');
      return reply.code(400).send({ error: error.message || 'revoke_failed' });
    }
  });
  
  /**
   * Link employee to device (Admin)
   * POST /v1/communications/devices/:deviceId/employees
   */
  app.post('/v1/communications/devices/:deviceId/employees', async (request: AuthenticatedRequest, reply) => {
    try {
      const { deviceId } = request.params as { deviceId: string };
      const body = linkEmployeeSchema.parse(request.body);
      
      // Link employee
      await ctx.pool.query(
        `INSERT INTO communication_device_employees (
          device_id, employee_id, tenant_id, is_primary,
          can_receive_calls, can_make_calls, can_receive_messages, can_send_messages,
          linked_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          deviceId,
          body.employeeId,
          request.currentUser.tenantId,
          body.isPrimary,
          body.canReceiveCalls,
          body.canMakeCalls,
          body.canReceiveMessages,
          body.canSendMessages,
          request.currentUser.id,
        ]
      );
      
      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: 'COMM_EMPLOYEE_DEVICE_LINKED',
        resourceNodeId: null,
        outcome: 'success',
        sourceIp: request.ip,
        details: { deviceId, employeeId: body.employeeId },
      });
      
      return reply.code(201).send({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'invalid_request', details: error.flatten() });
      }
      ctx.logger.error({ error }, 'Failed to link employee');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  /**
   * Unlink employee from device (Admin)
   * DELETE /v1/communications/devices/:deviceId/employees/:employeeId
   */
  app.delete('/v1/communications/devices/:deviceId/employees/:employeeId', async (request: AuthenticatedRequest, reply) => {
    try {
      const { deviceId, employeeId } = request.params as { deviceId: string; employeeId: string };
      
      await ctx.pool.query(
        `UPDATE communication_device_employees
        SET unlinked_at = NOW(), unlinked_by = $1
        WHERE device_id = $2 AND employee_id = $3 AND unlinked_at IS NULL`,
        [request.currentUser.id, deviceId, employeeId]
      );
      
      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: 'COMM_EMPLOYEE_DEVICE_UNLINKED',
        resourceNodeId: null,
        outcome: 'success',
        sourceIp: request.ip,
        details: { deviceId, employeeId },
      });
      
      return reply.code(204).send();
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to unlink employee');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  /**
   * Device heartbeat (Device)
   * POST /v1/communications/devices/:id/heartbeat
   */
  app.post('/v1/communications/devices/:id/heartbeat', async (request: AuthenticatedRequest, reply) => {
    try {
      const { id } = request.params as { id: string };
      
      // Authenticate device
      if (!(await authenticateDevice(request, reply, ctx))) {
        return;
      }
      
      // Verify device ID matches authenticated device
      if (request.deviceContext!.deviceId !== id) {
        return reply.code(403).send({ error: 'device_id_mismatch' });
      }
      
      const body = heartbeatSchema.parse(request.body);
      
      // Record heartbeat
      await ctx.presenceService.recordDeviceHeartbeat(
        id,
        request.deviceContext!.tenantId,
        body.appVersion,
        body.capabilities
      );
      
      // Broadcast presence changed
      await ctx.signalingGateway.broadcastDeviceOnline(
        request.deviceContext!.tenantId,
        request.deviceContext!.branchId,
        id
      );
      
      return { acknowledged: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'invalid_request', details: error.flatten() });
      }
      ctx.logger.error({ error }, 'Heartbeat failed');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  // ===========================================================================
  // 1b. DIRECTORY ROUTES
  // ===========================================================================

  /**
   * Get branch directory with employees and devices
   * GET /v1/communications/directory/branches
   */
  app.get('/v1/communications/directory/branches', async (request: AuthenticatedRequest, reply) => {
    try {
      const user = request.currentUser?.id ? await store.getUser(request.currentUser.id) : undefined;
      if (!user || user.tenantId !== request.currentUser.tenantId) return reply.code(401).send({ error: 'unauthenticated' });
      const accessible = await store.listAccessibleNodes(user, 'incident:view', 'branch');
      const branchIds = accessible.filter((node) => node.type === 'branch' && node.tenantId === user.tenantId).map((node) => node.id);
      if (!branchIds.length) return { data: [] };
      const [branchRes, userRes] = await Promise.all([
        ctx.pool.query(`SELECT id::text, name, code FROM resource_nodes WHERE id = ANY($1::uuid[]) AND lower(node_type) = 'branch' ORDER BY name`, [branchIds]),
        ctx.pool.query(`SELECT id::text, full_name AS name, username, role, branch_id::text FROM users WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND is_active = true ORDER BY full_name`, [user.tenantId, branchIds]),
      ]);
      const directory = await Promise.all(branchRes.rows.map(async (branch: any) => {
        const presence = await ctx.presenceService.getBranchPresence(user.tenantId, branch.id);
        const employees = await Promise.all(userRes.rows.filter((employee: any) => employee.branch_id === branch.id).map(async (employee: any) => {
          const employeePresence = await ctx.presenceService.getEmployeePresence(user.tenantId, employee.id);
          return {
            employeeId: employee.id,
            employeeName: employee.name || employee.username,
            role: employee.role || 'Staff',
            branchId: branch.id,
            branchName: branch.name,
            presence: employeePresence.status,
            onlineDeviceCount: employeePresence.onlineDeviceIds.length,
          };
        }));
        return {
          branchId: branch.id,
          branchName: branch.name,
          branchCode: branch.code,
          presence: presence.status,
          onlineDeviceCount: presence.onlineDeviceIds.length,
          totalDeviceCount: presence.deviceCount,
          employees,
        };
      }));
      return { data: directory };
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to get branch directory');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  /**
   * Get employee directory
   * GET /v1/communications/directory/employees
   */
  app.get('/v1/communications/directory/employees', async (request: AuthenticatedRequest, reply) => {
    try {
      let userRows: any[] = [];
      try {
        const uRes = await ctx.pool.query(
          "SELECT id::text, username, role FROM users ORDER BY username ASC"
        );
        userRows = uRes.rows;
      } catch (err) {
        ctx.logger.warn({ err }, 'Failed to query users');
      }

      let branchRows: any[] = [];
      try {
        const bRes = await ctx.pool.query(
          "SELECT id::text, name FROM resource_nodes WHERE lower(node_type) = 'branch' ORDER BY name ASC"
        );
        branchRows = bRes.rows;
      } catch {
        // ignore
      }

      const defaultBranch = branchRows[0] || { id: 'default', name: 'Main Branch' };
      const employees = userRows.map((u) => ({
        employeeId: u.id,
        employeeName: u.username,
        employeeRole: u.role || 'Operator',
        branchId: defaultBranch.id,
        branchName: defaultBranch.name,
        presence: 'ONLINE' as const,
      }));

      return { data: employees };
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to get employee directory');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  /**
   * Search directory
   * GET /v1/communications/directory/search
   */
  app.get('/v1/communications/directory/search', async (request: AuthenticatedRequest, reply) => {
    try {
      const { q } = request.query as { q?: string };
      const query = (q || '').trim().toLowerCase();

      const bRes = await ctx.pool.query(
        "SELECT id::text, name, code FROM resource_nodes WHERE lower(node_type) = 'branch' ORDER BY name ASC"
      );
      const uRes = await ctx.pool.query("SELECT id::text, username, role FROM users ORDER BY username ASC");

      const branches = bRes.rows.map((b) => ({
        branchId: b.id,
        branchName: b.name,
        branchCode: b.code || `BR-${b.id.substring(0, 4).toUpperCase()}`,
        presence: 'ONLINE' as const,
        onlineDeviceCount: 1,
        totalDeviceCount: 1,
        employees: uRes.rows.map((u) => ({
          employeeId: u.id,
          employeeName: u.username,
          role: u.role || 'Operator',
          branchId: b.id,
          branchName: b.name,
          presence: 'ONLINE' as const,
          onlineDeviceCount: 1,
        })),
      }));

      const filtered = branches.filter((b) =>
        b.branchName.toLowerCase().includes(query) ||
        (b.branchCode && b.branchCode.toLowerCase().includes(query)) ||
        b.employees.some((e) => e.employeeName.toLowerCase().includes(query))
      );

      return { data: filtered };
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to search directory');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  // ===========================================================================
  // 2. PRESENCE ROUTES
  // ===========================================================================
  
  /**
   * Get branch presence
   * GET /v1/communications/presence/branch/:branchId
   */
  app.get('/v1/communications/presence/branch/:branchId', async (request: AuthenticatedRequest, reply) => {
    try {
      const { branchId } = request.params as { branchId: string };
      
      const presence = await ctx.presenceService.getBranchPresence(request.currentUser.tenantId, branchId);
      
      return presence;
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to get branch presence');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  /**
   * Get employee presence
   * GET /v1/communications/presence/employee/:employeeId
   */
  app.get('/v1/communications/presence/employee/:employeeId', async (request: AuthenticatedRequest, reply) => {
    try {
      const { employeeId } = request.params as { employeeId: string };
      
      const presence = await ctx.presenceService.getEmployeePresence(request.currentUser.tenantId, employeeId);
      
      return presence;
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to get employee presence');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  // ===========================================================================
  // 3. CALL ROUTES
  // ===========================================================================
  
  /**
   * Call branch (VMS Operator → Branch)
   * POST /v1/communications/calls/branch/:branchId
   */
  app.post('/v1/communications/calls/branch/:branchId', async (request: AuthenticatedRequest, reply) => {
    try {
      const { branchId } = request.params as { branchId: string };
      const body = request.body as { context?: any };
      
      if (!(await requirePermission(request, reply, ctx, COMMUNICATION_PERMISSIONS.BRANCH_CALL))) {
        return;
      }
      
      const input: InitiateCallInput = {
        initiatorType: 'OPERATOR',
        initiatorId: request.currentUser.id,
        targetType: 'BRANCH',
        targetId: branchId,
        tenantId: request.currentUser.tenantId,
        context: body.context,
      };
      
      const callSession = await ctx.callService.initiateCall(input);
      
      // Broadcast call invite to all branch devices
      await ctx.signalingGateway.broadcastCallInvite(
        request.currentUser.tenantId,
        callSession.id,
        {
          callId: callSession.id,
          caller: {
            type: 'OPERATOR',
            id: request.currentUser.id,
            name: 'VMS Team', // TODO: Get from user profile
          },
          context: body.context,
        }
      );
      
      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: 'COMM_CALL_STARTED',
        resourceNodeId: branchId,
        outcome: 'success',
        sourceIp: request.ip,
        details: { callId: callSession.id, targetBranchId: branchId },
      });
      
      return reply.code(201).send({
        callId: callSession.id,
        status: callSession.status,
        createdAt: callSession.createdAt,
      });
    } catch (error: any) {
      ctx.logger.error({ error }, 'Failed to initiate branch call');
      return reply.code(400).send({ error: error.message || 'call_initiation_failed' });
    }
  });
  
  /**
   * Call employee (VMS Operator → Employee)
   * POST /v1/communications/calls/employee/:employeeId
   */
  app.post('/v1/communications/calls/employee/:employeeId', async (request: AuthenticatedRequest, reply) => {
    try {
      const { employeeId } = request.params as { employeeId: string };
      const body = request.body as { context?: any };
      
      if (!(await requirePermission(request, reply, ctx, COMMUNICATION_PERMISSIONS.EMPLOYEE_CALL))) {
        return;
      }
      
      const input: InitiateCallInput = {
        initiatorType: 'OPERATOR',
        initiatorId: request.currentUser.id,
        targetType: 'EMPLOYEE',
        targetId: employeeId,
        tenantId: request.currentUser.tenantId,
        context: body.context,
      };
      
      const callSession = await ctx.callService.initiateCall(input);
      
      // Broadcast call invite to employee devices
      await ctx.signalingGateway.broadcastCallInvite(
        request.currentUser.tenantId,
        callSession.id,
        {
          callId: callSession.id,
          caller: {
            type: 'OPERATOR',
            id: request.currentUser.id,
            name: 'VMS Team',
          },
          context: body.context,
        }
      );
      
      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: 'COMM_CALL_STARTED',
        resourceNodeId: null,
        outcome: 'success',
        sourceIp: request.ip,
        details: { callId: callSession.id, targetEmployeeId: employeeId },
      });
      
      return reply.code(201).send({
        callId: callSession.id,
        status: callSession.status,
        createdAt: callSession.createdAt,
      });
    } catch (error: any) {
      ctx.logger.error({ error }, 'Failed to initiate employee call');
      return reply.code(400).send({ error: error.message || 'call_initiation_failed' });
    }
  });
  
  /**
   * Call VMS (Branch/Employee → SOC Queue)
   * POST /v1/communications/calls/soc
   */
  app.post('/v1/communications/calls/soc', async (request: AuthenticatedRequest, reply) => {
    try {
      // Authenticate device
      if (!(await authenticateDevice(request, reply, ctx))) {
        return;
      }
      
      const body = request.body as { 
        actorType: 'BRANCH_DEVICE' | 'EMPLOYEE';
        actorEmployeeId?: string;
        context?: any;
      };
      
      const input: InitiateCallInput = {
        initiatorType: body.actorType === 'EMPLOYEE' ? 'EMPLOYEE' : 'DEVICE',
        initiatorId: body.actorType === 'EMPLOYEE' ? body.actorEmployeeId! : request.deviceContext!.deviceId,
        initiatorDeviceId: request.deviceContext!.deviceId,
        targetType: 'SOC_QUEUE',
        targetId: 'default', // TODO: Routing to specific SOC queues
        tenantId: request.deviceContext!.tenantId,
        context: body.context,
      };
      
      const callSession = await ctx.callService.initiateCall(input);
      
      // Broadcast call invite to available SOC operators
      await ctx.signalingGateway.broadcastCallInvite(
        request.deviceContext!.tenantId,
        callSession.id,
        {
          callId: callSession.id,
          caller: {
            type: body.actorType,
            id: input.initiatorId,
            branchId: request.deviceContext!.branchId,
            name: 'Branch Device', // TODO: Get from device/employee profile
          },
          context: body.context,
        }
      );
      
      await store.writeAudit({
        tenantId: request.deviceContext!.tenantId,
        actorUserId: body.actorType === 'EMPLOYEE' ? body.actorEmployeeId : null,
        action: 'COMM_CALL_STARTED',
        resourceNodeId: request.deviceContext!.branchId,
        outcome: 'success',
        sourceIp: request.ip,
        details: {
          callId: callSession.id,
          deviceId: request.deviceContext!.deviceId,
          actorType: body.actorType,
        },
      });
      
      return reply.code(201).send({
        callId: callSession.id,
        status: callSession.status,
        createdAt: callSession.createdAt,
      });
    } catch (error: any) {
      ctx.logger.error({ error }, 'Failed to initiate SOC call');
      return reply.code(400).send({ error: error.message || 'call_initiation_failed' });
    }
  });
  
  /**
   * Accept call
   * POST /v1/communications/calls/:callId/accept
   */
  app.post('/v1/communications/calls/:callId/accept', async (request: AuthenticatedRequest, reply) => {
    try {
      const { callId } = request.params as { callId: string };
      
      let acceptorType: 'DEVICE' | 'OPERATOR';
      let acceptorId: string;
      let acceptorDeviceId: string | undefined;
      let tenantId: string;
      
      // Determine acceptor type (device or operator)
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        // Device authentication
        if (!(await authenticateDevice(request, reply, ctx))) {
          return;
        }
        acceptorType = 'DEVICE';
        acceptorId = request.deviceContext!.deviceId;
        acceptorDeviceId = request.deviceContext!.deviceId;
        tenantId = request.deviceContext!.tenantId;
      } else {
        // Operator authentication
        acceptorType = 'OPERATOR';
        acceptorId = request.currentUser.id;
        acceptorDeviceId = undefined;
        tenantId = request.currentUser.tenantId;
      }
      
      // Accept call (atomic first-answer-wins via Redis)
      const callSession = await ctx.callService.acceptCall(
        callId,
        acceptorType,
        acceptorId,
        acceptorDeviceId
      );
      
      // If this acceptor won the race, create WebRTC participant token
      let participantToken: string | undefined;
      let turnConfig: any;
      
      if (callSession.status === 'CONNECTING' || callSession.status === 'CONNECTED') {
        // Generate WebRTC credentials
        const mediaSessionId = callSession.mediaSessionId || callSession.id;
        
        participantToken = await ctx.mediaProvider.createParticipantToken({
          sessionId: mediaSessionId,
          participantId: acceptorId,
          participantType: acceptorType,
        });
        
        turnConfig = {
          urls: [process.env.COMM_TURN_SERVER_URL],
          username: process.env.COMM_TURN_USERNAME,
          credential: process.env.COMM_TURN_CREDENTIAL,
        };
        
        // Broadcast call accepted to caller
        await ctx.signalingGateway.broadcastCallAccept(tenantId, callId, {
          callId,
          acceptedBy: acceptorId,
          acceptedByType: acceptorType,
        });
        
        // Broadcast call accepted elsewhere to other ringing endpoints
        await ctx.signalingGateway.broadcastCallAcceptedElsewhere(tenantId, callId, acceptorId);
      }
      
      await store.writeAudit({
        tenantId,
        actorUserId: acceptorType === 'OPERATOR' ? acceptorId : null,
        action: 'COMM_CALL_ACCEPTED',
        resourceNodeId: null,
        outcome: 'success',
        sourceIp: request.ip,
        details: {
          callId,
          acceptorType,
          acceptorId,
          status: callSession.status,
        },
      });
      
      return {
        callId: callSession.id,
        status: callSession.status,
        participantToken,
        turnConfig,
      };
    } catch (error: any) {
      ctx.logger.error({ error }, 'Failed to accept call');
      
      if (error.message === 'call_already_accepted') {
        return reply.code(409).send({ error: 'call_already_accepted' });
      }
      
      return reply.code(400).send({ error: error.message || 'call_accept_failed' });
    }
  });
  
  /**
   * Reject call
   * POST /v1/communications/calls/:callId/reject
   */
  app.post('/v1/communications/calls/:callId/reject', async (request: AuthenticatedRequest, reply) => {
    try {
      const { callId } = request.params as { callId: string };
      const body = request.body as { reason?: string };
      
      // Authenticate (device or operator)
      let rejectingDeviceId: string | undefined;
      let tenantId: string;
      
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        if (!(await authenticateDevice(request, reply, ctx))) {
          return;
        }
        rejectingDeviceId = request.deviceContext!.deviceId;
        tenantId = request.deviceContext!.tenantId;
      } else {
        tenantId = request.currentUser.tenantId;
      }
      
      await ctx.callService.rejectCall(callId, body.reason);
      
      // Broadcast call rejected
      await ctx.signalingGateway.broadcastCallReject(tenantId, callId, {
        callId,
        reason: body.reason,
      });
      
      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser?.id,
        action: 'COMM_CALL_REJECTED',
        resourceNodeId: null,
        outcome: 'success',
        sourceIp: request.ip,
        details: { callId, reason: body.reason },
      });
      
      return reply.code(204).send();
    } catch (error: any) {
      ctx.logger.error({ error }, 'Failed to reject call');
      return reply.code(400).send({ error: error.message || 'call_reject_failed' });
    }
  });
  
  /**
   * Cancel call (before answer)
   * POST /v1/communications/calls/:callId/cancel
   */
  app.post('/v1/communications/calls/:callId/cancel', async (request: AuthenticatedRequest, reply) => {
    try {
      const { callId } = request.params as { callId: string };
      
      await ctx.callService.cancelCall(callId);
      
      // Broadcast call cancelled to all ringing endpoints
      await ctx.signalingGateway.broadcastCallCancel(request.currentUser.tenantId, callId, {
        callId,
      });
      
      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: 'COMM_CALL_CANCELLED',
        resourceNodeId: null,
        outcome: 'success',
        sourceIp: request.ip,
        details: { callId },
      });
      
      return reply.code(204).send();
    } catch (error: any) {
      ctx.logger.error({ error }, 'Failed to cancel call');
      return reply.code(400).send({ error: error.message || 'call_cancel_failed' });
    }
  });
  
  /**
   * End call (active call)
   * POST /v1/communications/calls/:callId/end
   */
  app.post('/v1/communications/calls/:callId/end', async (request: AuthenticatedRequest, reply) => {
    try {
      const { callId } = request.params as { callId: string };
      const body = request.body as { reason?: string };
      
      // Authenticate (device or operator)
      let tenantId: string;
      
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        if (!(await authenticateDevice(request, reply, ctx))) {
          return;
        }
        tenantId = request.deviceContext!.tenantId;
      } else {
        tenantId = request.currentUser.tenantId;
      }
      
      await ctx.callService.endCall(callId, body.reason);
      
      // Close WebRTC media session
      try {
        await ctx.mediaProvider.closeSession(callId);
      } catch (error) {
        ctx.logger.warn({ error, callId }, 'Failed to close media session');
      }
      
      // Broadcast call ended to all participants
      await ctx.signalingGateway.broadcastCallEnd(tenantId, callId, {
        callId,
        reason: body.reason,
      });
      
      await store.writeAudit({
        tenantId,
        actorUserId: request.currentUser?.id,
        action: 'COMM_CALL_ENDED',
        resourceNodeId: null,
        outcome: 'success',
        sourceIp: request.ip,
        details: { callId, reason: body.reason },
      });
      
      return reply.code(204).send();
    } catch (error: any) {
      ctx.logger.error({ error }, 'Failed to end call');
      return reply.code(400).send({ error: error.message || 'call_end_failed' });
    }
  });
  
  /**
   * Get call history
   * GET /v1/communications/calls/history
   */
  app.get('/v1/communications/calls/history', async (request: AuthenticatedRequest, reply) => {
    try {
      const query = request.query as {
        branchId?: string;
        status?: string;
        direction?: string;
        limit?: string;
        offset?: string;
      };
      
      const limit = Math.min(parseInt(query.limit || '50', 10), 100);
      const offset = parseInt(query.offset || '0', 10);
      
      let sql = `
        SELECT 
          id, direction, source_type, source_branch_id, source_employee_id,
          target_type, target_branch_id, target_employee_id,
          status, answered_device_id, created_at, answered_at, ended_at,
          duration_seconds, end_reason
        FROM communication_call_sessions
        WHERE tenant_id = $1
      `;
      const params: any[] = [request.currentUser.tenantId];
      
      if (query.branchId) {
        params.push(query.branchId);
        sql += ` AND (source_branch_id = $${params.length} OR target_branch_id = $${params.length})`;
      }
      
      if (query.status) {
        params.push(query.status);
        sql += ` AND status = $${params.length}`;
      }
      
      if (query.direction) {
        params.push(query.direction);
        sql += ` AND direction = $${params.length}`;
      }
      
      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      
      const result = await ctx.pool.query(sql, params);
      
      // Get total count
      let countSql = `SELECT COUNT(*) FROM communication_call_sessions WHERE tenant_id = $1`;
      const countParams: any[] = [request.currentUser.tenantId];
      
      if (query.branchId) {
        countParams.push(query.branchId);
        countSql += ` AND (source_branch_id = $${countParams.length} OR target_branch_id = $${countParams.length})`;
      }
      
      const countResult = await ctx.pool.query(countSql, countParams);
      const total = parseInt(countResult.rows[0].count, 10);
      
      return {
        data: result.rows.map(row => ({
          id: row.id,
          direction: row.direction,
          sourceType: row.source_type,
          sourceBranchId: row.source_branch_id,
          sourceEmployeeId: row.source_employee_id,
          targetType: row.target_type,
          targetBranchId: row.target_branch_id,
          targetEmployeeId: row.target_employee_id,
          status: row.status,
          answeredDeviceId: row.answered_device_id,
          createdAt: row.created_at,
          answeredAt: row.answered_at,
          endedAt: row.ended_at,
          durationSeconds: row.duration_seconds,
          endReason: row.end_reason,
        })),
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + limit < total,
        },
      };
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to get call history');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  // ===========================================================================
  // 4. MESSAGING ROUTES
  // ===========================================================================
  
  /**
   * List conversations
   * GET /v1/communications/conversations
   */
  app.get('/v1/communications/conversations', async (request: AuthenticatedRequest, reply) => {
    try {
      const query = request.query as {
        type?: string;
        limit?: string;
        offset?: string;
      };
      
      const limit = Math.min(parseInt(query.limit || '50', 10), 100);
      const offset = parseInt(query.offset || '0', 10);
      
      // Authenticate (device or operator)
      let tenantId: string;
      let participantId: string;
      let participantType: 'DEVICE' | 'OPERATOR';
      
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        if (!(await authenticateDevice(request, reply, ctx))) {
          return;
        }
        tenantId = request.deviceContext!.tenantId;
        participantId = request.deviceContext!.deviceId;
        participantType = 'DEVICE';
      } else {
        tenantId = request.currentUser.tenantId;
        participantId = request.currentUser.id;
        participantType = 'OPERATOR';
      }
      
      let sql = `
        SELECT DISTINCT
          c.id, c.conversation_type, c.subject, c.branch_id, c.employee_id,
          c.created_at, c.last_message_at,
          (SELECT COUNT(*) FROM communication_messages WHERE conversation_id = c.id) as message_count,
          (SELECT COUNT(*) FROM communication_messages m
           LEFT JOIN communication_message_receipts r ON m.id = r.message_id
           WHERE m.conversation_id = c.id AND m.sender_id != $2 AND r.read_at IS NULL) as unread_count
        FROM communication_conversations c
        JOIN communication_conversation_members cm ON c.id = cm.conversation_id
        WHERE c.tenant_id = $1 AND cm.member_id = $2 AND cm.member_type = $3
      `;
      const params: any[] = [tenantId, participantId, participantType];
      
      if (query.type) {
        params.push(query.type);
        sql += ` AND c.conversation_type = $${params.length}`;
      }
      
      sql += ` ORDER BY c.last_message_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      
      const result = await ctx.pool.query(sql, params);
      
      return {
        data: result.rows.map(row => ({
          id: row.id,
          conversationType: row.conversation_type,
          subject: row.subject,
          branchId: row.branch_id,
          employeeId: row.employee_id,
          createdAt: row.created_at,
          lastMessageAt: row.last_message_at,
          messageCount: parseInt(row.message_count, 10),
          unreadCount: parseInt(row.unread_count, 10),
        })),
        pagination: {
          limit,
          offset,
        },
      };
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to list conversations');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  /**
   * Get conversation details
   * GET /v1/communications/conversations/:id
   */
  app.get('/v1/communications/conversations/:id', async (request: AuthenticatedRequest, reply) => {
    try {
      const { id } = request.params as { id: string };
      
      // Authenticate
      let tenantId: string;
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        if (!(await authenticateDevice(request, reply, ctx))) {
          return;
        }
        tenantId = request.deviceContext!.tenantId;
      } else {
        tenantId = request.currentUser.tenantId;
      }
      
      const result = await ctx.pool.query(
        `SELECT 
          id, conversation_type, subject, branch_id, employee_id,
          created_at, last_message_at
        FROM communication_conversations
        WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'conversation_not_found' });
      }
      
      const conversation = result.rows[0];
      
      // Get members
      const membersResult = await ctx.pool.query(
        `SELECT member_id, member_type, can_send, joined_at
        FROM communication_conversation_members
        WHERE conversation_id = $1`,
        [id]
      );
      
      return {
        id: conversation.id,
        conversationType: conversation.conversation_type,
        subject: conversation.subject,
        branchId: conversation.branch_id,
        employeeId: conversation.employee_id,
        createdAt: conversation.created_at,
        lastMessageAt: conversation.last_message_at,
        members: membersResult.rows.map(m => ({
          memberId: m.member_id,
          memberType: m.member_type,
          canSend: m.can_send,
          joinedAt: m.joined_at,
        })),
      };
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to get conversation');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  /**
   * Get conversation messages (with pagination)
   * GET /v1/communications/conversations/:id/messages
   */
  app.get('/v1/communications/conversations/:id/messages', async (request: AuthenticatedRequest, reply) => {
    try {
      const { id } = request.params as { id: string };
      const query = request.query as {
        before?: string; // message ID for pagination
        limit?: string;
      };
      
      const limit = Math.min(parseInt(query.limit || '50', 10), 100);
      
      // Authenticate
      let tenantId: string;
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        if (!(await authenticateDevice(request, reply, ctx))) {
          return;
        }
        tenantId = request.deviceContext!.tenantId;
      } else {
        tenantId = request.currentUser.tenantId;
      }
      
      const messages = await ctx.messagingService.getConversationMessages(
        id,
        tenantId,
        { limit, beforeMessageId: query.before }
      );
      
      return {
        data: messages.map(msg => ({
          id: msg.id,
          conversationId: msg.conversationId,
          senderId: msg.senderId,
          senderType: msg.senderType,
          senderDeviceId: msg.senderDeviceId,
          messageType: msg.messageType,
          body: msg.body,
          createdAt: msg.createdAt,
          deliveredAt: msg.deliveredAt,
          readAt: msg.readAt,
        })),
        pagination: {
          limit,
          hasMore: messages.length === limit,
          oldestMessageId: messages.length > 0 ? messages[messages.length - 1].id : null,
        },
      };
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to get messages');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  /**
   * Send message to existing conversation
   * POST /v1/communications/conversations/:id/messages
   */
  app.post('/v1/communications/conversations/:id/messages', async (request: AuthenticatedRequest, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as { body: string; messageType?: string };
      
      // Authenticate
      let tenantId: string;
      let senderId: string;
      let senderType: 'DEVICE' | 'OPERATOR';
      let senderDeviceId: string | undefined;
      
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        if (!(await authenticateDevice(request, reply, ctx))) {
          return;
        }
        tenantId = request.deviceContext!.tenantId;
        senderId = request.deviceContext!.deviceId;
        senderType = 'DEVICE';
        senderDeviceId = request.deviceContext!.deviceId;
      } else {
        tenantId = request.currentUser.tenantId;
        senderId = request.currentUser.id;
        senderType = 'OPERATOR';
      }
      
      const input: SendMessageInput = {
        conversationId: id,
        senderId,
        senderType,
        senderDeviceId,
        messageType: (body.messageType as any) || 'TEXT',
        body: body.body,
        tenantId,
      };
      
      const message = await ctx.messagingService.sendMessage(input);
      
      // Broadcast message to online recipients
      await ctx.signalingGateway.broadcastMessageCreated(tenantId, id, {
        messageId: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        senderType: message.senderType,
        body: message.body,
        createdAt: message.createdAt,
      });
      
      await store.writeAudit({
        tenantId,
        actorUserId: senderType === 'OPERATOR' ? senderId : null,
        action: 'COMM_MESSAGE_SENT',
        resourceNodeId: null,
        outcome: 'success',
        sourceIp: request.ip,
        details: {
          conversationId: id,
          messageId: message.id,
        },
      });
      
      return reply.code(201).send({
        id: message.id,
        conversationId: message.conversationId,
        createdAt: message.createdAt,
      });
    } catch (error: any) {
      ctx.logger.error({ error }, 'Failed to send message');
      return reply.code(400).send({ error: error.message || 'message_send_failed' });
    }
  });
  
  /**
   * Mark message as delivered
   * POST /v1/communications/messages/:id/delivered
   */
  app.post('/v1/communications/messages/:id/delivered', async (request: AuthenticatedRequest, reply) => {
    try {
      const { id } = request.params as { id: string };
      
      // Authenticate device
      if (!(await authenticateDevice(request, reply, ctx))) {
        return;
      }
      
      await ctx.messagingService.markAsDelivered(
        id,
        request.deviceContext!.deviceId,
        request.deviceContext!.tenantId
      );
      
      // Broadcast delivery receipt
      await ctx.signalingGateway.broadcastMessageDelivered(
        request.deviceContext!.tenantId,
        id,
        {
          messageId: id,
          deviceId: request.deviceContext!.deviceId,
          deliveredAt: new Date(),
        }
      );
      
      return reply.code(204).send();
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to mark delivered');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  /**
   * Mark message as read
   * POST /v1/communications/messages/:id/read
   */
  app.post('/v1/communications/messages/:id/read', async (request: AuthenticatedRequest, reply) => {
    try {
      const { id } = request.params as { id: string };
      
      // Authenticate device
      if (!(await authenticateDevice(request, reply, ctx))) {
        return;
      }
      
      await ctx.messagingService.markAsRead(
        id,
        request.deviceContext!.deviceId,
        request.deviceContext!.tenantId
      );
      
      // Broadcast read receipt
      await ctx.signalingGateway.broadcastMessageRead(
        request.deviceContext!.tenantId,
        id,
        {
          messageId: id,
          deviceId: request.deviceContext!.deviceId,
          readAt: new Date(),
        }
      );
      
      await store.writeAudit({
        tenantId: request.deviceContext!.tenantId,
        actorUserId: null,
        action: 'COMM_MESSAGE_READ',
        resourceNodeId: null,
        outcome: 'success',
        sourceIp: request.ip,
        details: { messageId: id },
      });
      
      return reply.code(204).send();
    } catch (error) {
      ctx.logger.error({ error }, 'Failed to mark read');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });
  
  /**
   * Message branch (create conversation + send first message)
   * POST /v1/communications/conversations/branch/:branchId
   */
  app.post('/v1/communications/conversations/branch/:branchId', async (request: AuthenticatedRequest, reply) => {
    try {
      const { branchId } = request.params as { branchId: string };
      const body = request.body as { body: string };
      
      if (!(await requirePermission(request, reply, ctx, COMMUNICATION_PERMISSIONS.BRANCH_MESSAGE))) {
        return;
      }
      
      // Get or create conversation
      let conversationId: string;
      
      const existingConv = await ctx.pool.query(
        `SELECT id FROM communication_conversations
        WHERE tenant_id = $1 AND conversation_type = 'BRANCH_SOC' AND branch_id = $2
        LIMIT 1`,
        [request.currentUser.tenantId, branchId]
      );
      
      if (existingConv.rows.length > 0) {
        conversationId = existingConv.rows[0].id;
      } else {
        // Create new conversation
        const newConv = await ctx.pool.query(
          `INSERT INTO communication_conversations (
            tenant_id, conversation_type, branch_id
          ) VALUES ($1, 'BRANCH_SOC', $2) RETURNING id`,
          [request.currentUser.tenantId, branchId]
        );
        conversationId = newConv.rows[0].id;
        
        // Add operator as member
        await ctx.pool.query(
          `INSERT INTO communication_conversation_members (
            conversation_id, member_id, member_type
          ) VALUES ($1, $2, 'OPERATOR')`,
          [conversationId, request.currentUser.id]
        );
      }
      
      // Send message
      const input: SendMessageInput = {
        conversationId,
        senderId: request.currentUser.id,
        senderType: 'OPERATOR',
        messageType: 'TEXT',
        body: body.body,
        tenantId: request.currentUser.tenantId,
      };
      
      const message = await ctx.messagingService.sendMessage(input);
      
      // Broadcast to branch devices
      await ctx.signalingGateway.broadcastMessageCreated(
        request.currentUser.tenantId,
        conversationId,
        {
          messageId: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          senderType: message.senderType,
          body: message.body,
          createdAt: message.createdAt,
        }
      );
      
      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: 'COMM_MESSAGE_SENT',
        resourceNodeId: branchId,
        outcome: 'success',
        sourceIp: request.ip,
        details: { conversationId, messageId: message.id, targetBranchId: branchId },
      });
      
      return reply.code(201).send({
        conversationId,
        messageId: message.id,
        createdAt: message.createdAt,
      });
    } catch (error: any) {
      ctx.logger.error({ error }, 'Failed to message branch');
      return reply.code(400).send({ error: error.message || 'message_send_failed' });
    }
  });
  
  /**
   * Message employee (create conversation + send first message)
   * POST /v1/communications/conversations/employee/:employeeId
   */
  app.post('/v1/communications/conversations/employee/:employeeId', async (request: AuthenticatedRequest, reply) => {
    try {
      const { employeeId } = request.params as { employeeId: string };
      const body = request.body as { body: string };
      
      if (!(await requirePermission(request, reply, ctx, COMMUNICATION_PERMISSIONS.EMPLOYEE_MESSAGE))) {
        return;
      }
      
      // Get or create conversation
      let conversationId: string;
      
      const existingConv = await ctx.pool.query(
        `SELECT id FROM communication_conversations
        WHERE tenant_id = $1 AND conversation_type = 'EMPLOYEE_SOC' AND employee_id = $2
        LIMIT 1`,
        [request.currentUser.tenantId, employeeId]
      );
      
      if (existingConv.rows.length > 0) {
        conversationId = existingConv.rows[0].id;
      } else {
        // Create new conversation
        const newConv = await ctx.pool.query(
          `INSERT INTO communication_conversations (
            tenant_id, conversation_type, employee_id
          ) VALUES ($1, 'EMPLOYEE_SOC', $2) RETURNING id`,
          [request.currentUser.tenantId, employeeId]
        );
        conversationId = newConv.rows[0].id;
        
        // Add operator as member
        await ctx.pool.query(
          `INSERT INTO communication_conversation_members (
            conversation_id, member_id, member_type
          ) VALUES ($1, $2, 'OPERATOR')`,
          [conversationId, request.currentUser.id]
        );
      }
      
      // Send message
      const input: SendMessageInput = {
        conversationId,
        senderId: request.currentUser.id,
        senderType: 'OPERATOR',
        messageType: 'TEXT',
        body: body.body,
        tenantId: request.currentUser.tenantId,
      };
      
      const message = await ctx.messagingService.sendMessage(input);
      
      // Broadcast to employee devices
      await ctx.signalingGateway.broadcastMessageCreated(
        request.currentUser.tenantId,
        conversationId,
        {
          messageId: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          senderType: message.senderType,
          body: message.body,
          createdAt: message.createdAt,
        }
      );
      
      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: 'COMM_MESSAGE_SENT',
        resourceNodeId: null,
        outcome: 'success',
        sourceIp: request.ip,
        details: { conversationId, messageId: message.id, targetEmployeeId: employeeId },
      });
      
      return reply.code(201).send({
        conversationId,
        messageId: message.id,
        createdAt: message.createdAt,
      });
    } catch (error: any) {
      ctx.logger.error({ error }, 'Failed to message employee');
      return reply.code(400).send({ error: error.message || 'message_send_failed' });
    }
  });
  
  logger.info('Communications routes registered successfully');
}
