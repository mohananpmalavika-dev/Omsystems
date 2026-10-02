import { pool } from '../database/pool.js';
import { ProtectionError, type ProtectionState, type RecordingCheck } from './types.js';
import { isFresh } from './service.js';

export function assertRecovery(check: RecordingCheck | undefined, state: ProtectionState, assigned: boolean, now = new Date()): void {
  if (!check || check.status !== 'VERIFIED' || check.framesDecoded < 2 || !check.timestampProgressing ||
    check.gaps.length || check.indexedRetentionDays === null || check.indexedRetentionDays < state.policy.requiredRetentionDays ||
    !isFresh(check.checkedAt, now, state.policy.verificationFreshMinutes)) throw new ProtectionError('Fresh successful playback, gap and retention verification required before closure');
  if (!assigned) throw new ProtectionError('Assign an operator before closing the incident');
}
/** Prevent the generic incident routes from bypassing the assurance recovery gate. */
export async function enforceProtectionIncidentClosure(incident: { id: string; tenantId: string; branchId?: string; assignedTo?: string }): Promise<void> {
  if (!pool || !incident.branchId) return;
  let result;
  try { result = await pool.query('SELECT state FROM branch_protection_state WHERE tenant_id=$1 AND branch_id=$2', [incident.tenantId, incident.branchId]); }
  catch (error) { if ((error as { code?: string }).code === '42P01') return; throw error; }
  const state = result.rows[0]?.state as ProtectionState | undefined;
  if (!state) return;
  const check = Object.values(state.checks).find(check => check.incidentId === incident.id);
  if (check) {
    assertRecovery(check, state, Boolean(incident.assignedTo));
    throw new ProtectionError('Use the branch Verified Protection recovery confirmation to close this incident');
  }
}
