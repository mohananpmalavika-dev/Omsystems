import { randomUUID } from 'node:crypto';
import type { ControlPlaneStore } from '../control-plane-store.js';
import type { User } from '../domain/models.js';
import { BranchOperationalSnapshotService, type BranchOperationalSnapshot } from '../services/branch-operational-snapshot.production.service.js';
import type { ProtectionRepository } from './repository.js';
import type { RecordingProbe } from './recording-probe.js';
import type { ProtectionPolicy, ProtectionState, RecordingCheck, SopRule, SopReview, ProtectionStatus } from './types.js';
import { ProtectionError } from './types.js';
import { notificationOutbox } from '../notifications/infrastructure/outbox/notification-outbox.js';

export function isFresh(timestamp: string | undefined, now: Date, minutes: number): boolean {
  const age = timestamp ? now.getTime() - Date.parse(timestamp) : NaN;
  return Number.isFinite(age) && age >= 0 && age <= minutes * 60_000;
}
export function evaluateProtection(state: ProtectionState, cameraIds: string[], snapshot: BranchOperationalSnapshot | undefined | null, now = new Date()) {
  const reasons: string[] = [];
  let unknown = !cameraIds.length;
  let risk = false;
  if (state.lastRunError) { unknown = true; reasons.push(state.lastRunError); }
  if (!cameraIds.length) reasons.push('No authorized camera inventory available');
  const checks = cameraIds.map(id => state.checks[id]);
  for (const id of cameraIds) {
    const check = state.checks[id];
    if (!check || !isFresh(check.checkedAt, now, state.policy.verificationFreshMinutes) || check.status === 'UNKNOWN') {
      unknown = true; reasons.push(`${id}: playback evidence missing or stale`); continue;
    }
    if (check.status === 'FAILED' || check.gaps.length || (check.indexedRetentionDays !== null && check.indexedRetentionDays < state.policy.requiredRetentionDays)) {
      risk = true; reasons.push(`${id}: ${check.status === 'FAILED' ? check.reason : check.gaps.length ? 'recording gaps detected' : 'indexed retention below policy'}`);
    }
    if (check.indexedRetentionDays === null) { unknown = true; reasons.push(`${id}: retention evidence unavailable`); }
  }
  for (const id of state.policy.criticalCameraIds) if (!cameraIds.includes(id)) { unknown = true; reasons.push(`Critical camera ${id} is unavailable in this inventory`); }
  if (!snapshot || !isFresh(snapshot.lastTelemetryAt, now, 2)) {
    unknown = true; reasons.push('Branch health telemetry missing or stale');
  } else {
    const dimensions = [snapshot.cameras.state, snapshot.recorders.state, snapshot.storage.state, snapshot.retention.state, snapshot.network.state];
    if (dimensions.some(value => ['CRITICAL', 'WARNING', 'VIOLATION', 'OFFLINE', 'DEGRADED', 'FAILOVER'].includes(value))) {
      risk = true; reasons.push(...snapshot.reasons.map(reason => reason.message));
      if (!snapshot.reasons.length) reasons.push('One or more branch health dimensions require attention');
    }
    if (dimensions.includes('UNKNOWN')) { unknown = true; reasons.push('One or more branch health dimensions are unknown'); }
  }
  for (const rule of state.policy.sopRules.filter(rule => rule.mandatory)) {
    const reviews = state.reviews.filter(review => review.ruleId === rule.id && Date.parse(review.occurredAt) <= now.getTime() && sopCycle(rule, review.occurredAt) === sopCycle(rule, now.toISOString()));
    if (reviews.some(review => review.outcome === 'FAIL')) { risk = true; reasons.push(`SOP failed: ${rule.title}`); }
    if (!reviews.length || reviews.some(review => review.outcome === 'PENDING')) { unknown = true; reasons.push(`SOP review required: ${rule.title}`); }
  }
  const status: ProtectionStatus = risk ? 'AT_RISK' : unknown ? 'UNKNOWN' : 'PROTECTED';
  return { status, reasons, totalCameras: cameraIds.length,
    verifiedCameras: checks.filter(check => check?.status === 'VERIFIED' && isFresh(check.checkedAt, now, state.policy.verificationFreshMinutes)).length,
    checkedAt: now.toISOString(), lastRunAt: state.lastRunAt ?? null };
}
export function sopMatches(rule: SopRule, cameraId: string, occurredAt: string): boolean {
  if (!rule.cameraIds.includes(cameraId)) return false;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: rule.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(occurredAt));
  const minute = Number(parts.find(part => part.type === 'hour')!.value) * 60 + Number(parts.find(part => part.type === 'minute')!.value);
  return rule.startMinute <= rule.endMinute ? minute >= rule.startMinute && minute <= rule.endMinute : minute >= rule.startMinute || minute <= rule.endMinute;
}
export function sopCycle(rule: SopRule, timestamp: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: rule.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(timestamp));
  const part = (name: string) => Number(parts.find(item => item.type === name)!.value);
  const midnight = Date.UTC(part('year'), part('month') - 1, part('day'));
  const minute = part('hour') * 60 + part('minute');
  return new Date(midnight - (rule.startMinute > rule.endMinute && minute <= rule.endMinute ? 86400_000 : 0)).toISOString().slice(0, 10);
}
export class BranchProtectionService {
  private readonly runs = new Set<string>();
  private readonly snapshots: BranchOperationalSnapshotService;
  constructor(private readonly store: ControlPlaneStore, readonly repository: ProtectionRepository, private readonly probe: RecordingProbe,
    private readonly onIncident?: (incident: any, check: RecordingCheck, actor: User) => Promise<void>) {
    this.snapshots = new BranchOperationalSnapshotService(store);
  }
  async overview(user: User, branchId: string) {
    const [state, cameras, snapshot] = await Promise.all([
      this.repository.read(user.tenantId, branchId),
      this.store.listCamerasByBranch(user, branchId, 'recording:view'),
      this.snapshots.getBranchSnapshot(user.tenantId, branchId, false, user),
    ]);
    const ids = cameras.map(camera => camera.id);
    return { ...evaluateProtection(state, ids, snapshot), verificationRunning: Boolean(state.verificationLease && Date.parse(state.verificationLease.expiresAt) > Date.now()), policy: state.policy,
      cameras: cameras.map(camera => ({ id: camera.id, name: camera.name, critical: state.policy.criticalCameraIds.includes(camera.id), check: state.checks[camera.id] ?? null })),
      reviews: state.reviews.filter(review => ids.includes(review.cameraId)),
      bandwidth: { mode: state.policy.bandwidthMode, streamProfile: state.policy.bandwidthMode === 'low' ? 'sub' : 'main',
        maxConcurrentStreams: state.policy.maxConcurrentStreams, localRecording: 'independent_of_cloud_streaming', replayOrder: ['P1_INCIDENTS', 'AUDIT_LOGS', 'RECORDING_METADATA', 'OPERATIONAL_EVENTS', 'HEALTH_TELEMETRY'] } };
  }
  async configure(user: User, branchId: string, policy: ProtectionPolicy) {
    const cameras = await this.store.listCamerasByBranch(user, branchId, 'recording:view');
    const ids = new Set(cameras.map(camera => camera.id));
    if ([...policy.criticalCameraIds, ...policy.sopRules.flatMap(rule => rule.cameraIds)].some(id => !ids.has(id))) throw new ProtectionError('Policy references an inaccessible camera', 400);
    if (new Set(policy.sopRules.map(rule => rule.id)).size !== policy.sopRules.length) throw new ProtectionError('Duplicate SOP rule identifiers', 400);
    return this.repository.mutate(user.tenantId, branchId, user.id, 'POLICY_UPDATED', async state => {
      if (state.policy.maxGapSeconds !== policy.maxGapSeconds || state.policy.requiredRetentionDays !== policy.requiredRetentionDays) {
        for (const check of Object.values(state.checks)) { check.status = 'UNKNOWN'; check.reason = 'Recording policy changed; fresh verification required'; }
      }
      state.reviews = state.reviews.filter(review => JSON.stringify(state.policy.sopRules.find(rule => rule.id === review.ruleId)) === JSON.stringify(policy.sopRules.find(rule => rule.id === review.ruleId)));
      state.policy = policy; return { policy };
    });
  }
  async verify(user: User, branchId: string, onStarted?: () => void) {
    const key = `${user.tenantId}:${branchId}`;
    if (this.runs.has(key)) throw new ProtectionError('Verification already running');
    this.runs.add(key);
    const leaseId = randomUUID();
    try {
      const cameras = await this.store.listCamerasByBranch(user, branchId, 'recording:view');
      const state = await this.repository.mutate(user.tenantId, branchId, user.id, 'VERIFICATION_STARTED', async current => {
        if (current.verificationLease && Date.parse(current.verificationLease.expiresAt) > Date.now()) throw new ProtectionError('Verification already running');
        current.verificationLease = { id: leaseId, expiresAt: new Date(Date.now() + Math.max(60_000, cameras.length * 120_000)).toISOString() };
        delete current.lastRunError;
        return { leaseId, cameraCount: cameras.length };
      });
      onStarted?.();
      const now = new Date();
      // Sequential probes limit disk/decoder load and bound resource consumption.
      const checks: RecordingCheck[] = [];
      for (const camera of cameras) checks.push(await this.probe.check(user.tenantId, camera.id, state.policy, new Date()));
      const updated = await this.repository.mutate(user.tenantId, branchId, user.id, 'RECORDING_VERIFIED', async current => {
        if (current.verificationLease?.id !== leaseId) throw new ProtectionError('Verification lease expired');
        if (JSON.stringify(current.policy) !== JSON.stringify(state.policy)) throw new ProtectionError('Policy changed during verification; run verification again');
        for (const check of checks) {
          const previous = current.checks[check.cameraId];
          check.incidentId = previous?.incidentId;
          const failed = check.status !== 'UNKNOWN' && (check.status === 'FAILED' || check.gaps.length > 0 || (check.indexedRetentionDays !== null && check.indexedRetentionDays < current.policy.requiredRetentionDays));
          if (failed && !check.incidentId) {
            // Persist the incident intent before calling the canonical store. Retry uses
            // the same ID after a crash or uncertain database acknowledgement.
            check.incidentId = randomUUID();
          }
          current.checks[check.cameraId] = check;
        }
        current.lastRunAt = new Date().toISOString();
        // A decoded sample in a configured SOP window supplies review evidence,
        // never an automatic assertion that the procedure passed.
        for (const rule of current.policy.sopRules) for (const check of checks) {
          if (check.status !== 'VERIFIED' || !check.segmentId || !sopMatches(rule, check.cameraId, check.sampleAt)) continue;
          const day = sopCycle(rule, check.sampleAt);
          if (current.reviews.some(review => review.ruleId === rule.id && review.cameraId === check.cameraId && sopCycle(rule, review.occurredAt) === day)) continue;
          current.reviews.push({ id: randomUUID(), ruleId: rule.id, cameraId: check.cameraId, occurredAt: check.sampleAt, evidenceId: check.segmentId, outcome: 'PENDING' });
        }
        current.reviews = current.reviews.filter(review => Date.parse(review.occurredAt) >= Date.now() - 30 * 86400_000);
        return { checks };
      });
      for (const check of Object.values(updated.checks).filter(check => check.incidentId && cameras.some(camera => camera.id === check.cameraId))) {
        let incident = await this.store.getIncident(check.incidentId!);
        if (!incident) incident = await this.store.createIncident({ id: check.incidentId!, tenantId: user.tenantId, branchId,
          title: `Recording assurance: ${check.cameraId}`, description: `${check.reason}; ${check.gaps.length} gaps`,
          incidentType: 'other', severity: updated.policy.criticalCameraIds.includes(check.cameraId) ? 'P1' : 'P2',
          detectionSource: 'verified-branch-protection', occurredAt: check.checkedAt, reportedBy: user.id });
        const linked = await this.store.listIncidentCameras(incident.id);
        if (!linked.some(camera => camera.cameraId === check.cameraId || camera.camera_id === check.cameraId)) await this.store.addIncidentCamera(incident.id, check.cameraId, true, user.id);
        const evidence = await this.store.listIncidentEvidenceItems(incident.id);
        const referenceId = `${check.cameraId}:${check.checkedAt}`;
        if (!evidence.some(item => item.referenceId === referenceId || item.reference_id === referenceId)) await this.store.addIncidentEvidenceItem({ incidentId: incident.id,
          itemType: 'recording-assurance', title: 'Recording verification evidence', description: JSON.stringify(check), referenceId, addedBy: user.id });
        await this.onIncident?.(incident, check, user);
      }
      return updated;
    } catch (error) {
      await this.repository.mutate(user.tenantId, branchId, user.id, 'VERIFICATION_FAILED', async current => {
        if (current.verificationLease?.id === leaseId) current.lastRunError = error instanceof ProtectionError ? error.message : 'Recording verification could not complete; inspect service logs';
        return { leaseId, message: current.lastRunError ?? 'Verification request rejected' };
      });
      throw error;
    } finally {
      this.runs.delete(key);
      await this.repository.mutate(user.tenantId, branchId, user.id, 'VERIFICATION_FINISHED', async current => {
        if (current.verificationLease?.id === leaseId) delete current.verificationLease;
        return { leaseId };
      });
    }
  }
  async resolve(user: User, branchId: string, cameraId: string, notes: string) {
    return this.repository.mutate(user.tenantId, branchId, user.id, 'RECOVERY_CONFIRMED', async state => {
      const check = state.checks[cameraId];
      if (state.verificationLease && Date.parse(state.verificationLease.expiresAt) > Date.now()) throw new ProtectionError('Wait for the active recording verification to finish before confirming recovery');
      const incident = check?.incidentId && await this.store.getIncident(check.incidentId);
      if (!incident || incident.tenantId !== user.tenantId || incident.branchId !== branchId) throw new ProtectionError('Assurance incident unavailable');
      const recovered = check && check.status === 'VERIFIED' && check.gaps.length === 0 && check.indexedRetentionDays !== null && check.indexedRetentionDays >= state.policy.requiredRetentionDays;
      if (!recovered || !isFresh(check.checkedAt, new Date(), state.policy.verificationFreshMinutes) || !check.timestampProgressing || check.framesDecoded < 2) throw new ProtectionError('Fresh successful playback, gap and retention verification required before closure');
      if (!incident.assignedTo && !incident.assigned_to) throw new ProtectionError('Assign an operator before closing the incident');
      await this.store.closeIncident(incident.id, user.id, notes);
      await notificationOutbox.cancelPendingForAlert(incident.id, 'RECORDING_RECOVERY_VERIFIED');
      const incidentId = check.incidentId;
      delete check.incidentId;
      return { incidentId, cameraId, notes, recoveryCheck: check };
    });
  }
  async submitReview(user: User, branchId: string, input: Omit<SopReview, 'id' | 'outcome'>) {
    return this.repository.mutate(user.tenantId, branchId, user.id, 'SOP_EVIDENCE_SUBMITTED', async state => {
      const rule = state.policy.sopRules.find(rule => rule.id === input.ruleId);
      if (!rule || !sopMatches(rule, input.cameraId, input.occurredAt) || Date.parse(input.occurredAt) > Date.now()) throw new ProtectionError('Evidence does not match configured SOP camera/time window', 400);
      const duplicate = state.reviews.find(review => review.ruleId === input.ruleId && review.evidenceId === input.evidenceId);
      if (duplicate) return { reviewId: duplicate.id, duplicate: true };
      const review: SopReview = { id: randomUUID(), ruleId: input.ruleId, occurredAt: input.occurredAt, cameraId: input.cameraId, evidenceId: input.evidenceId, outcome: 'PENDING' };
      state.reviews.push(review);
      state.reviews = state.reviews.filter(item => Date.parse(item.occurredAt) >= Date.now() - 30 * 86400_000);
      return { review };
    });
  }
  async review(user: User, branchId: string, reviewId: string, outcome: 'PASS' | 'FAIL', notes: string) {
    return this.repository.mutate(user.tenantId, branchId, user.id, 'SOP_REVIEWED', async state => {
      const review = state.reviews.find(item => item.id === reviewId);
      if (!review) throw new ProtectionError('SOP review unavailable', 404);
      review.outcome = outcome; review.notes = notes; review.reviewerId = user.id; review.reviewedAt = new Date().toISOString();
      return { review };
    });
  }
}
