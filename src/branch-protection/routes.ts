import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ControlPlaneStore } from '../control-plane-store.js';
import type { Action, User } from '../domain/models.js';
import { pool } from '../database/pool.js';
import { PostgresProtectionRepository } from './repository.js';
import { LocalArchiveRecordingProbe } from './recording-probe.js';
import { BranchProtectionService, isFresh } from './service.js';

const id = z.string().trim().min(1).max(200);
const paramsSchema = z.object({ branchId: id });
const policySchema = z.object({
  enabled: z.boolean(), verificationIntervalMinutes: z.number().int().min(5).max(1440),
  verificationFreshMinutes: z.number().int().min(5).max(2880), maxGapSeconds: z.number().int().min(0).max(3600),
  requiredRetentionDays: z.number().int().min(1).max(3650), criticalCameraIds: z.array(id).max(1000),
  bandwidthMode: z.enum(['normal', 'low']), maxConcurrentStreams: z.number().int().min(1).max(16),
  sopRules: z.array(z.object({ id, title: z.string().trim().min(3).max(200), kind: z.enum(['OPENING', 'CLOSING', 'RESTRICTED_ACCESS', 'AFTER_HOURS']),
    cameraIds: z.array(id).min(1).max(1000), timeZone: z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }),
    startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(0).max(1439), mandatory: z.boolean() })).max(100),
}).refine(policy => policy.verificationFreshMinutes >= policy.verificationIntervalMinutes, { message: 'Freshness must cover the verification interval' });

export async function registerBranchProtectionRoutes(app: FastifyInstance, store: ControlPlaneStore,
  service = new BranchProtectionService(store, new PostgresProtectionRepository(() => pool), new LocalArchiveRecordingProbe(() => pool))) {
  async function authorize(request: FastifyRequest, reply: FastifyReply, action: Action = 'recording:view'): Promise<{ user: User; branchId: string } | null> {
    const { branchId } = paramsSchema.parse(request.params);
    const user = request.currentUser;
    if (!user) { reply.code(401).send({ error: 'Authentication required' }); return null; }
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== 'branch' || branch.tenantId !== user.tenantId || !(await store.checkAccess(user, action, branchId))?.allowed) {
      reply.code(404).send({ error: 'Branch unavailable' }); return null;
    }
    return { user, branchId };
  }
  const base = '/v1/branches/:branchId/protection';
  // Explicit scope checks apply to every read and mutation; no client tenant IDs.
  app.get(base, async (request, reply) => { const auth = await authorize(request, reply); if (auth) return { success: true, data: await service.overview(auth.user, auth.branchId) }; });
  app.put(`${base}/policy`, async (request, reply) => {
    const auth = await authorize(request, reply, 'device:configure'); if (!auth) return;
    return { success: true, data: await service.configure(auth.user, auth.branchId, policySchema.parse(request.body)) };
  });
  app.post(`${base}/verify`, async (request, reply) => {
    const auth = await authorize(request, reply, 'incident:create'); if (!auth) return;
    if (!(await store.checkAccess(auth.user, 'recording:view', auth.branchId))?.allowed) return reply.code(403).send({ error: 'Recording permission required' });
    await service.verify(auth.user, auth.branchId);
    return { success: true, data: await service.overview(auth.user, auth.branchId) };
  });
  app.post(`${base}/cameras/:cameraId/resolve`, async (request, reply) => {
    const auth = await authorize(request, reply, 'incident:close'); if (!auth) return;
    const { cameraId } = z.object({ cameraId: id }).parse(request.params);
    const camera = await store.getCamera(cameraId);
    if (!camera || camera.branchId !== auth.branchId || (camera.tenantId && camera.tenantId !== auth.user.tenantId) || !(await store.checkAccess(auth.user, 'recording:view', camera.nodeId))?.allowed) return reply.code(404).send({ error: 'Camera unavailable' });
    const { notes } = z.object({ notes: z.string().trim().min(5).max(2000) }).parse(request.body);
    await service.resolve(auth.user, auth.branchId, cameraId, notes);
    return { success: true };
  });
  app.post(`${base}/sop/evidence`, async (request, reply) => {
    const auth = await authorize(request, reply, 'incident:update'); if (!auth) return;
    const input = z.object({ ruleId: id, cameraId: id, occurredAt: z.string().datetime(), evidenceId: z.string().uuid() }).parse(request.body);
    const camera = await store.getCamera(input.cameraId);
    if (!camera || camera.branchId !== auth.branchId || (camera.tenantId && camera.tenantId !== auth.user.tenantId) || !(await store.checkAccess(auth.user, 'recording:view', camera.nodeId))?.allowed) return reply.code(404).send({ error: 'Camera unavailable' });
    if (!pool) return reply.code(503).send({ error: 'Evidence database unavailable' });
    const evidence = await pool.query('SELECT id FROM recording_segments WHERE id=$1 AND tenant_id=$2 AND camera_id=$3 AND status=\'ready\' AND started_at<=$4 AND ended_at>$4', [input.evidenceId, auth.user.tenantId, input.cameraId, input.occurredAt]);
    if (!evidence.rowCount) return reply.code(404).send({ error: 'Recording evidence unavailable at event time' });
    await service.submitReview(auth.user, auth.branchId, input);
    return { success: true };
  });
  app.post(`${base}/sop/:reviewId/review`, async (request, reply) => {
    const auth = await authorize(request, reply, 'incident:close'); if (!auth) return;
    const { reviewId } = z.object({ reviewId: z.string().uuid() }).parse(request.params);
    const body = z.object({ outcome: z.enum(['PASS', 'FAIL']), notes: z.string().trim().min(5).max(2000) }).parse(request.body);
    await service.review(auth.user, auth.branchId, reviewId, body.outcome, body.notes);
    return { success: true };
  });
  app.get(`${base}/offline`, async (request, reply) => {
    const auth = await authorize(request, reply); if (!auth) return;
    if (!pool) return reply.code(503).send({ error: 'Sync telemetry database unavailable' });
    const [status, metrics] = await Promise.all([
      pool.query('SELECT * FROM branch_connectivity_status WHERE branch_id=$1', [auth.branchId]),
      pool.query('SELECT * FROM branch_backlog_metrics WHERE branch_id=$1 ORDER BY recorded_at DESC LIMIT 20', [auth.branchId]),
    ]);
    return { success: true, data: { status: status.rows[0] ?? null, metrics: metrics.rows, observed: Boolean(status.rowCount) } };
  });
  app.get(`${base}/report`, async (request, reply) => {
    const auth = await authorize(request, reply, 'audit:view'); if (!auth) return;
    const query = z.object({ from: z.string().datetime(), to: z.string().datetime() }).parse(request.query);
    if (Date.parse(query.to) <= Date.parse(query.from) || Date.parse(query.to) - Date.parse(query.from) > 31 * 86400_000) return reply.code(400).send({ error: 'Report interval must be between zero and 31 days' });
    const events = await service.repository.audit(auth.user.tenantId, auth.branchId, query.from, query.to);
    return reply.header('Content-Disposition', 'attachment; filename="branch-protection-report.json"').send({ branchId: auth.branchId, ...query, generatedAt: new Date().toISOString(), events });
  });
  let running = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const scheduled = async () => {
    if (running || !pool) return;
    running = true;
    try {
      for (const branch of await service.repository.enabledBranches()) {
        const state = await service.repository.read(branch.tenantId, branch.branchId);
        if (isFresh(state.lastRunAt, new Date(), state.policy.verificationIntervalMinutes)) continue;
        // Run as the policy's explicitly configured service identity with normal RBAC.
        const user = process.env.PROTECTION_SERVICE_USER_ID && await store.getUser(process.env.PROTECTION_SERVICE_USER_ID);
        if (!user || user.tenantId !== branch.tenantId || !(await store.checkAccess(user, 'recording:view', branch.branchId))?.allowed || !(await store.checkAccess(user, 'incident:create', branch.branchId))?.allowed) continue;
        try { await service.verify(user, branch.branchId); } catch (error) { app.log.error({ error, branchId: branch.branchId }, 'Branch protection verification failed'); }
      }
    } catch (error) { app.log.error({ error }, 'Branch protection scheduler unavailable'); }
    finally { running = false; }
  };
  app.addHook('onReady', async () => { timer = setInterval(() => { void scheduled(); }, 60_000); timer.unref(); });
  app.addHook('onClose', async () => { if (timer) clearInterval(timer); });
}
