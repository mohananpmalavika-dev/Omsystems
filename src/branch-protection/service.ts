import { randomUUID } from 'node:crypto';
import type { ControlPlaneStore } from '../control-plane-store.js';
import type { User } from '../domain/models.js';
import { BranchOperationalSnapshotService, type BranchOperationalSnapshot } from '../services/branch-operational-snapshot.production.service.js';
import type { ProtectionRepository } from './repository.js';
import type { RecordingProbe } from './recording-probe.js';
import type { ProtectionPolicy, ProtectionState, RecordingCheck, SopRule, SopReview, ProtectionStatus } from './types.js';

export function isFresh(timestamp: string | undefined, now: Date, minutes: number): boolean {
  const age = timestamp ? now.getTime() - Date.parse(timestamp) : NaN;
  return Number.isFinite(age) && age >= 0 && age <= minutes * 60_000;
}
export function evaluateProtection(state: ProtectionState, cameraIds: string[], snapshot: BranchOperationalSnapshot | undefined | null, now = new Date()) {
  const reasons: string[] = [];
  let unknown = !cameraIds.length;
  let risk = false;
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
  const currentReviews = state.reviews.filter(review => now.getTime() - Date.parse(review.occurredAt) <= 86400_000 && Date.parse(review.occurredAt) <= now.getTime());
  for (const rule of state.policy.sopRules.filter(rule => rule.mandatory)) {
    const reviews = currentReviews.filter(review => review.ruleId === rule.id);
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
export class BranchProtectionService {
  private readonly runs = new Set<string>();
  private readonly snapshots: BranchOperationalSnapshotService;
  constructor(private readonly store: ControlPlaneStore, readonly repository: ProtectionRepository, private readonly probe: RecordingProbe) {
    this.snapshots = new BranchOperationalSnapshotService(store);
  }
  async overview(user: User, branchId: string) {
    const [state, cameras, snapshot] = await Promise.all([
      this.repository.read(user.tenantId, branchId),
      this.store.listCamerasByBranch(user, branchId, 'recording:view'),
      this.snapshots.getBranchSnapshot(user.tenantId, branchId, false, user),
    ]);
    const ids = cameras.map(camera => camera.id);
    return { ...evaluateProtection(state, ids, snapshot), policy: state.policy,
      cameras: cameras.map(camera => ({ id: camera.id, name: camera.name, critical: state.policy.criticalCameraIds.includes(camera.id), check: state.checks[camera.id] ?? null })),
      reviews: state.reviews.filter(review => ids.includes(review.cameraId)),
      bandwidth: { mode: state.policy.bandwidthMode, streamProfile: state.policy.bandwidthMode === 'low' ? 'sub' : 'main',
        maxConcurrentStreams: state.policy.maxConcurrentStreams, localRecording: 'independent_of_cloud_streaming', replayOrder: ['P1_INCIDENTS', 'AUDIT_LOGS', 'RECORDING_METADATA', 'OPERATIONAL_EVENTS', 'HEALTH_TELEMETRY'] } };
  }
  async configure(user: User, branchId: string, policy: ProtectionPolicy) {
    const cameras = await this.store.listCamerasByBranch(user, branchId, 'recording:view');
    const ids = new Set(cameras.map(camera => camera.id));
    if ([...policy.criticalCameraIds, ...policy.sopRules.flatMap(rule => rule.cameraIds)].some(id => !ids.has(id))) throw new Error('Policy references an inaccessible camera');
    if (new Set(policy.sopRules.map(rule => rule.id)).size !== policy.sopRules.length) throw new Error('Duplicate SOP rule identifiers');
    return this.repository.mutate(user.tenantId, branchId, user.id, 'POLICY_UPDATED', async state => { state.policy = policy; return { policy }; });
  }
  async verify(user: User, branchId: string) {
    const key = `${user.tenantId}:${branchId}`;
    if (this.runs.has(key)) throw new Error('Verification already running');
    this.runs.add(key);
    const leaseId = randomUUID();
    try {
      const cameras = await this.store.listCamerasByBranch(user, branchId, 'recording:view');
      const state = await this.repository.mutate(user.tenantId, branchId, user.id, 'VERIFICATION_STARTED', async current => {
        if (current.verificationLease && Date.parse(current.verificationLease.expiresAt) > Date.now()) throw new Error('Verification already running');
        current.verificationLease = { id: leaseId, expiresAt: new Date(Date.now() + Math.max(60_000, cameras.length * 25_000)).toISOString() };
        return { leaseId, cameraCount: cameras.length };
      });
      const now = new Date();
      // Sequential probes limit disk/decoder load and bound resource consumption.
      const checks: RecordingCheck[] = [];
      for (const camera of cameras) checks.push(await this.probe.check(user.tenantId, camera.id, state.policy, now));
      const updated = await this.repository.mutate(user.tenantId, branchId, user.id, 'RECORDING_VERIFIED', async current => {
        if (current.verificationLease?.id !== leaseId) throw new Error('Verification lease expired');
        for (const check of checks) {
          const previous = current.checks[check.cameraId];
          check.incidentId = previous?.incidentId;
          const failed = check.status === 'FAILED' || check.gaps.length > 0 || (check.indexedRetentionDays !== null && check.indexedRetentionDays < current.policy.requiredRetentionDays);
          if (failed && !check.incidentId) {
            const incident = await this.store.createIncident({ tenantId: user.tenantId, branchId,
              title: `Recording assurance: ${check.cameraId}`, description: `${check.reason}; ${check.gaps.length} gaps`,
              incidentType: 'recording-assurance', severity: current.policy.criticalCameraIds.includes(check.cameraId) ? 'P1' : 'P2',
              detectionSource: 'verified-branch-protection', occurredAt: now.toISOString(), reportedBy: user.id });
            check.incidentId = incident.id;
            await this.store.addIncidentCamera(incident.id, check.cameraId, true, user.id);
          }
          current.checks[check.cameraId] = check;
        }
        current.lastRunAt = now.toISOString();
        delete current.verificationLease;
        return { checks };
      });
      return updated;
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
      const incident = check?.incidentId && await this.store.getIncident(check.incidentId);
      if (!incident || incident.tenantId !== user.tenantId || incident.branchId !== branchId) throw new Error('Assurance incident unavailable');
      const recovered = check && check.status === 'VERIFIED' && check.gaps.length === 0 && check.indexedRetentionDays !== null && check.indexedRetentionDays >= state.policy.requiredRetentionDays;
      if (!recovered || !isFresh(check.checkedAt, new Date(), state.policy.verificationFreshMinutes) || !check.timestampProgressing || check.framesDecoded < 2) throw new Error('Fresh successful playback, gap and retention verification required before closure');
      if (!incident.assignedTo && !incident.assigned_to) throw new Error('Assign an operator before closing the incident');
      await this.store.closeIncident(incident.id, user.id, notes);
      const incidentId = check.incidentId;
      delete check.incidentId;
      return { incidentId, cameraId, notes, recoveryCheck: check };
    });
  }
  async submitReview(user: User, branchId: string, input: Omit<SopReview, 'id' | 'outcome'>) {
    return this.repository.mutate(user.tenantId, branchId, user.id, 'SOP_EVIDENCE_SUBMITTED', async state => {
      const rule = state.policy.sopRules.find(rule => rule.id === input.ruleId);
      if (!rule || !sopMatches(rule, input.cameraId, input.occurredAt) || Date.parse(input.occurredAt) > Date.now()) throw new Error('Evidence does not match configured SOP camera/time window');
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
      if (!review) throw new Error('SOP review unavailable');
      review.outcome = outcome; review.notes = notes; review.reviewerId = user.id; review.reviewedAt = new Date().toISOString();
      return { review };
    });
  }
}
