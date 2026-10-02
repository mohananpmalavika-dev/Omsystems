import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ControlPlaneStore } from '../../src/control-plane-store.js';
import { registerCommunicationsRoutes } from '../../src/communications/routes/communications.routes.js';
import { CommunicationCallService } from '../../src/communications/services/call.service.js';
import { CommunicationPresenceService } from '../../src/communications/services/presence.service.js';
import { CommunicationMessagingService } from '../../src/communications/services/messaging.service.js';
import { DeviceEnrollmentService } from '../../src/communications/services/device-enrollment.service.js';
import * as media from '../../src/communications/providers/voice-media.provider.js';

const tenantId = '00000000-0000-4000-8000-000000000001';
const callerId = '00000000-0000-4000-8000-000000000002';
const employeeId = '00000000-0000-4000-8000-000000000003';
const branchId = '00000000-0000-4000-8000-000000000004';
const regionId = '00000000-0000-4000-8000-000000000005';
const companyId = '00000000-0000-4000-8000-000000000006';
const otherBranchId = '00000000-0000-4000-8000-000000000007';
const callId = '00000000-0000-4000-8000-000000000008';
const groupId = '00000000-0000-4000-8000-000000000009';
const missingBranchId = '00000000-0000-4000-8000-000000000010';

describe('VMS user communication routes', () => {
  let app: FastifyInstance;
  let scopes: Array<string | null>;
  let targetExists: boolean;
  let callerExists: boolean;
  let accessible: any[];
  let directoryRows: any[];
  let query: ReturnType<typeof vi.fn>;
  let initiate: ReturnType<typeof vi.spyOn>;
  let invite: ReturnType<typeof vi.fn>;
  let store: any;

  beforeEach(async () => {
    scopes = [branchId];
    targetExists = true;
    callerExists = true;
    accessible = [{ id: branchId, type: 'branch', tenantId, name: 'Branch', path: [companyId, regionId, branchId] }];
    directoryRows = [{ id: employeeId, name: 'Central operator', role: 'hq_admin', branch_id: null }];
    query = vi.fn(async (sql: string, params: any[]) => {
      let rows: any[] = [];
      if (sql.includes('SELECT uoa.scope_node_id')) {
        rows = targetExists && params[1] === tenantId
          ? scopes.map((scope_node_id) => ({ scope_node_id, branch_id: scope_node_id })) : [];
      } else if (sql.includes('SELECT 1 FROM users')) {
        rows = targetExists && params[1] === tenantId ? [{}] : [];
      } else if (sql.includes('AS name') && sql.includes('FROM users u')) {
        rows = directoryRows;
      } else if (sql.includes('SELECT id FROM communication_conversations')) {
        rows = [{ id: callId }];
      } else if (sql.includes('FROM communication_call_participants')) {
        rows = [{ operator_id: employeeId }];
      }
      return { rows, rowCount: rows.length };
    });
    store = {
      pool: { query, connect: vi.fn() },
      redis: { get: vi.fn(), setEx: vi.fn() },
      getUser: vi.fn(async () => callerExists ? { id: callerId, tenantId } : undefined),
      getNode: vi.fn(async (id: string) => accessible.find((branch) => branch.id === id) || [
        { id: regionId, type: 'region', tenantId, path: [companyId, regionId] },
        { id: companyId, type: 'company', tenantId, path: [companyId] },
        { id: groupId, type: 'camera-group', tenantId, path: [companyId, regionId, branchId, groupId] },
        { id: otherBranchId, type: 'branch', tenantId, path: [otherBranchId] },
      ].find((scope) => scope.id === id)),
      listAccessibleNodes: vi.fn(async () => accessible),
      checkAccess: vi.fn(async () => ({ allowed: true })),
      writeAudit: vi.fn(),
    };
    initiate = vi.spyOn(CommunicationCallService.prototype, 'initiateCall').mockResolvedValue({
      id: callId, tenantId, status: 'RINGING', sourceOperatorId: callerId, targetEmployeeId: employeeId,
    } as any);
    vi.spyOn(CommunicationPresenceService.prototype, 'getOperatorPresence').mockResolvedValue({
      operatorId: employeeId, tenantId, status: 'ONLINE',
    } as any);
    vi.spyOn(CommunicationMessagingService.prototype, 'sendMessage').mockResolvedValue({
      id: callId, conversationId: callId, body: 'Hello',
    } as any);
    vi.spyOn(media, 'createVoiceMediaProvider').mockReturnValue({
      createSession: vi.fn(async () => ({ sessionId: 'media-session', turnServers: [] })),
      createParticipantToken: vi.fn(async () => ({ token: 'participant-token' })),
    } as any);
    invite = vi.fn();
    app = Fastify();
    (app as any).io = { communicationSignalingGateway: {
      broadcastCallInvite: invite, broadcastMessageCreated: vi.fn(),
    } };
    app.addHook('preHandler', async (request) => {
      (request as any).currentUser = { id: callerId, tenantId, role: 'operator' };
    });
    await registerCommunicationsRoutes(app, store as ControlPlaneStore);
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  const call = (payload: Record<string, unknown> = {}, prefix = '/v1') => app.inject({
    method: 'POST', url: `${prefix}/communications/calls/employee/${employeeId}`, payload,
  });

  it.each([
    ['branch', [branchId]],
    ['region', [regionId]],
    ['company', [companyId]],
    ['group within a branch', [groupId]],
    ['multiple assignments', [otherBranchId, regionId]],
    ['central VMS user', [null]],
  ])('calls an online user with a %s assignment', async (_label, assignments) => {
    scopes = assignments as Array<string | null>;
    const response = await call();
    expect(response.statusCode).toBe(201);
    expect(response.json().data.credentials.participantToken).toBe('participant-token');
    expect(initiate).toHaveBeenCalledWith(expect.objectContaining({
      sourceOperatorId: callerId, targetEmployeeId: employeeId, tenantId, targetType: 'EMPLOYEE',
    }));
    expect(invite).toHaveBeenCalledWith(tenantId, [], [employeeId], expect.objectContaining({ id: callId }));
    expect(store.listAccessibleNodes).toHaveBeenCalledWith(expect.objectContaining({ id: callerId }), 'incident:create', 'branch');
  });

  it('supports the /api/v1 alias', async () => {
    scopes = [regionId];
    expect((await call({}, '/api/v1')).statusCode).toBe(201);
  });

  it('rejects a target outside all caller scopes even with a supplied allowed branch', async () => {
    scopes = [otherBranchId];
    const response = await call({ branchId });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('forbidden');
    expect(initiate).not.toHaveBeenCalled();
  });

  it('rejects central user calls without communication access', async () => {
    scopes = [null];
    accessible = [];
    expect((await call()).statusCode).toBe(403);
    expect(initiate).not.toHaveBeenCalled();
  });

  it('rejects missing or archived target assignments', async () => {
    scopes = ['missing-scope'];
    expect((await call()).statusCode).toBe(403);
    expect(initiate).not.toHaveBeenCalled();
  });

  it('does not use another tenant branch returned by the store', async () => {
    scopes = [null];
    accessible[0].tenantId = 'other-tenant';
    expect((await call()).statusCode).toBe(403);
    expect(initiate).not.toHaveBeenCalled();
  });

  it('does not resolve another tenant organizational scope', async () => {
    scopes = [regionId];
    store.getNode.mockResolvedValue({ id: regionId, tenantId: 'other-tenant', path: [regionId] });
    expect((await call()).statusCode).toBe(403);
    expect(initiate).not.toHaveBeenCalled();
  });

  it('rejects missing, inactive, or cross-tenant recipients before creating a call', async () => {
    targetExists = false;
    const response = await call();
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('employee_not_found');
    expect(initiate).not.toHaveBeenCalled();
  });

  it('rejects an invalid caller before creating a call', async () => {
    callerExists = false;
    expect((await call()).statusCode).toBe(401);
    expect(initiate).not.toHaveBeenCalled();
  });

  it('reports an offline target without a misleading branch error', async () => {
    scopes = [regionId];
    initiate.mockRejectedValue(new Error('TARGET_UNAVAILABLE'));
    const response = await call();
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('TARGET_UNAVAILABLE');
    expect(invite).not.toHaveBeenCalled();
  });

  it('applies organization scope resolution to employee messages', async () => {
    scopes = [regionId];
    const response = await app.inject({
      method: 'POST', url: `/v1/communications/conversations/employee/${employeeId}`, payload: { body: 'Hello' },
    });
    expect(response.statusCode).toBe(201);
    expect(store.listAccessibleNodes).toHaveBeenCalledWith(expect.anything(), 'incident:view', 'branch');
  });

  it('uses VMS operator presence without requiring a registered device', async () => {
    const response = await app.inject(`/v1/communications/presence/employee/${employeeId}`);
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ONLINE');
    expect(CommunicationPresenceService.prototype.getOperatorPresence).toHaveBeenCalledWith(tenantId, employeeId);
  });

  it('does not expose presence for a cross-tenant or missing target', async () => {
    targetExists = false;
    expect((await app.inject(`/v1/communications/presence/employee/${employeeId}`)).statusCode).toBe(404);
    expect(CommunicationPresenceService.prototype.getOperatorPresence).not.toHaveBeenCalled();
  });

  it('keeps central VMS users searchable when the caller has no visible branches', async () => {
    accessible = [];
    const response = await app.inject('/v1/communications/directory/search?q=central');
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ branches: [], employees: directoryRows });
  });

  it('labels unassigned or organization-scoped users as Central VMS', async () => {
    const response = await app.inject('/v1/communications/directory/employees');
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([expect.objectContaining({
      employeeId, branchId: null, branchName: 'Central VMS', presence: 'ONLINE',
    })]);
  });

  it('preserves branch call validation', async () => {
    const response = await app.inject({
      method: 'POST', url: `/v1/communications/calls/branch/${missingBranchId}`,
      payload: { targetType: 'EMPLOYEE', targetId: employeeId },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('branch_not_found');
    expect(initiate).not.toHaveBeenCalled();
  });

  it('authorizes employee unlinking against the device branch', async () => {
    vi.spyOn(DeviceEnrollmentService.prototype, 'getDevice').mockResolvedValue({
      id: callId, tenantId, branchId: missingBranchId,
    } as any);
    const response = await app.inject({
      method: 'DELETE', url: `/v1/communications/devices/${callId}/employees/${employeeId}`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('branch_not_found');
    expect(query.mock.calls.some(([sql]) => sql.includes('SET unlinked_at'))).toBe(false);
  });
});
