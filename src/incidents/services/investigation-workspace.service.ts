/**
 * Investigation Workspace & Case Dossier Service
 * Supports multi-feed synchronized investigation, tagging, and forensic package compilation.
 */

import { randomUUID } from 'node:crypto';
import { forensicEvidencePackageService } from '../../evidence/services/forensic-evidence-package.service.js';
import type { EvidencePackage } from '../../evidence/domain/forensic-evidence.types.js';

export interface InvestigationCase {
  caseId: string;
  caseNumber: string;
  tenantId: string;
  branchId: string;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_REVIEW' | 'LEGAL_HOLD' | 'CLOSED';
  leadInvestigator: string;
  incidentIds: string[];
  cameraIds: string[];
  timeRangeStart: string;
  timeRangeEnd: string;
  evidencePackageIds: string[];
  notes: Array<{
    noteId: string;
    author: string;
    content: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export class InvestigationWorkspaceService {
  private cases = new Map<string, InvestigationCase>();

  /**
   * Create an investigation case dossier.
   */
  async createCase(input: {
    tenantId: string;
    branchId: string;
    title: string;
    description: string;
    leadInvestigator: string;
    incidentIds?: string[];
    cameraIds: string[];
    timeRangeStart: string;
    timeRangeEnd: string;
  }): Promise<InvestigationCase> {
    const caseId = `case-${randomUUID().substring(0, 8)}`;
    const caseNumber = `CASE-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const caseDossier: InvestigationCase = {
      caseId,
      caseNumber,
      tenantId: input.tenantId,
      branchId: input.branchId,
      title: input.title,
      description: input.description,
      status: 'OPEN',
      leadInvestigator: input.leadInvestigator,
      incidentIds: input.incidentIds || [],
      cameraIds: input.cameraIds,
      timeRangeStart: input.timeRangeStart,
      timeRangeEnd: input.timeRangeEnd,
      evidencePackageIds: [],
      notes: [],
      createdAt: now,
      updatedAt: now,
    };

    this.cases.set(caseId, caseDossier);
    return caseDossier;
  }

  /**
   * Add investigator note to case.
   */
  async addNote(caseId: string, author: string, content: string): Promise<InvestigationCase> {
    const c = this.cases.get(caseId);
    if (!c) throw new Error(`Case ${caseId} not found`);

    c.notes.push({
      noteId: `note-${randomUUID().substring(0, 6)}`,
      author,
      content,
      createdAt: new Date().toISOString(),
    });
    c.updatedAt = new Date().toISOString();

    return c;
  }

  /**
   * Seal and attach a forensic evidence package directly into the case.
   */
  async sealAndAttachEvidence(
    caseId: string,
    cameraId: string,
    recorderId: string,
    media: { snapshotBuffer?: Buffer; clipBuffer?: Buffer }
  ): Promise<{ caseDossier: InvestigationCase; evidencePackage: EvidencePackage }> {
    const c = this.cases.get(caseId);
    if (!c) throw new Error(`Case ${caseId} not found`);

    const pkg = await forensicEvidencePackageService.createAndSealPackage({
      tenantId: c.tenantId,
      branchId: c.branchId,
      cameraId,
      recorderId,
      recorderChannel: 1,
      caseNumber: c.caseNumber,
      captureStart: c.timeRangeStart,
      captureEnd: c.timeRangeEnd,
      capturedBy: c.leadInvestigator,
      reason: `Forensic evidence capture for Case ${c.caseNumber} - ${c.title}`,
      media,
    });

    c.evidencePackageIds.push(pkg.id);
    c.updatedAt = new Date().toISOString();

    return {
      caseDossier: c,
      evidencePackage: pkg,
    };
  }

  /**
   * Place case under Legal Hold.
   */
  async placeUnderLegalHold(caseId: string): Promise<InvestigationCase> {
    const c = this.cases.get(caseId);
    if (!c) throw new Error(`Case ${caseId} not found`);

    c.status = 'LEGAL_HOLD';
    c.updatedAt = new Date().toISOString();
    return c;
  }

  /**
   * Get case details.
   */
  async getCase(caseId: string): Promise<InvestigationCase | null> {
    return this.cases.get(caseId) || null;
  }

  /**
   * List all cases.
   */
  async listCases(branchId?: string): Promise<InvestigationCase[]> {
    const all = Array.from(this.cases.values());
    if (branchId) return all.filter((c) => c.branchId === branchId);
    return all;
  }
}

export const investigationWorkspaceService = new InvestigationWorkspaceService();
