/**
 * Legal Hold Service
 * 
 * First-class legal hold management that protects forensic evidence packages,
 * central archives, and recorder recording intervals from retention policy deletion.
 */

import { randomUUID } from 'node:crypto';
import type { LegalHoldRecord } from '../domain/forensic-evidence.types.js';
import { chainOfCustodyService } from './chain-of-custody.service.js';

export interface CreateLegalHoldInput {
  tenantId: string;
  caseNumber: string;
  reason: string;
  evidencePackageIds?: string[];
  cameraIds?: string[];
  startTime?: string;
  endTime?: string;
  createdBy: string;
}

export class LegalHoldService {
  private holds: Map<string, LegalHoldRecord> = new Map();

  /**
   * Applies a Legal Hold to evidence packages and camera recording ranges
   */
  async createLegalHold(input: CreateLegalHoldInput): Promise<LegalHoldRecord> {
    const id = `LH-${randomUUID().substring(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();

    const record: LegalHoldRecord = {
      id,
      tenantId: input.tenantId,
      caseNumber: input.caseNumber,
      reason: input.reason,
      evidencePackageIds: input.evidencePackageIds || [],
      cameraIds: input.cameraIds,
      startTime: input.startTime,
      endTime: input.endTime,
      status: 'ACTIVE',
      createdBy: input.createdBy,
      createdAt: now,
    };

    this.holds.set(id, record);

    // Record custody events for all locked evidence packages
    for (const pkgId of record.evidencePackageIds) {
      chainOfCustodyService.recordEvent({
        evidencePackageId: pkgId,
        event: 'LEGAL_HOLD_APPLIED',
        actorId: input.createdBy,
        actorType: 'USER',
        reason: `Legal Hold ${id} applied for case ${input.caseNumber}: ${input.reason}`,
      });
    }

    return record;
  }

  /**
   * Releases an active Legal Hold
   */
  async releaseLegalHold(holdId: string, releasedBy: string, reason?: string): Promise<LegalHoldRecord> {
    const hold = this.holds.get(holdId);
    if (!hold) {
      throw new Error(`Legal Hold not found: ${holdId}`);
    }

    if (hold.status === 'RELEASED') {
      return hold;
    }

    hold.status = 'RELEASED';
    hold.releasedBy = releasedBy;
    hold.releasedAt = new Date().toISOString();

    for (const pkgId of hold.evidencePackageIds) {
      chainOfCustodyService.recordEvent({
        evidencePackageId: pkgId,
        event: 'LEGAL_HOLD_RELEASED',
        actorId: releasedBy,
        actorType: 'USER',
        reason: `Legal Hold ${holdId} released: ${reason || 'Investigation closed'}`,
      });
    }

    return hold;
  }

  /**
   * Evaluates if an evidence package or camera recording interval is protected from deletion
   */
  isProtected(evidencePackageId: string, cameraId?: string, timestamp?: string): boolean {
    for (const hold of this.holds.values()) {
      if (hold.status !== 'ACTIVE') continue;

      if (hold.evidencePackageIds.includes(evidencePackageId)) {
        return true;
      }

      if (cameraId && hold.cameraIds && hold.cameraIds.includes(cameraId)) {
        if (!hold.startTime || !hold.endTime || !timestamp) {
          return true;
        }
        const t = new Date(timestamp).getTime();
        const start = new Date(hold.startTime).getTime();
        const end = new Date(hold.endTime).getTime();
        if (t >= start && t <= end) {
          return true;
        }
      }
    }
    return false;
  }

  getLegalHold(holdId: string): LegalHoldRecord | undefined {
    return this.holds.get(holdId);
  }

  listActiveHolds(tenantId?: string): LegalHoldRecord[] {
    return Array.from(this.holds.values()).filter(
      (h) => h.status === 'ACTIVE' && (!tenantId || h.tenantId === tenantId)
    );
  }
}

export const legalHoldService = new LegalHoldService();
