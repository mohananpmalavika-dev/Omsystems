/**
 * Forensic Evidence Export Service
 * Master coordinator for authenticating requests, assembling artifacts,
 * computing SHA-256 digests, signing canonical manifests, and binding retention legal holds.
 */

import { randomUUID } from 'node:crypto';
import {
  ForensicExportRequest,
  EvidencePackageManifest,
} from '../domain/forensic-export.types.js';
import { EvidenceAssemblerService } from './evidence-assembler.service.js';
import { EvidenceSignerService, evidenceSigner } from './evidence-signer.service.js';
import { ChainOfCustodyService, chainOfCustodyService } from './chain-of-custody.service.js';
import { retentionEngine } from '../../retention/services/retention-engine.service.js';

export class EvidenceExportService {
  private packages = new Map<string, EvidencePackageManifest>();
  private readonly assembler = new EvidenceAssemblerService();

  constructor(
    private readonly signer: EvidenceSignerService = evidenceSigner,
    private readonly custodyService: ChainOfCustodyService = chainOfCustodyService
  ) {}

  /**
   * Validates export policy permissions.
   */
  assertCanExport(request: ForensicExportRequest): void {
    if (!request.operatorId) {
      throw new Error('EVIDENCE_POLICY_VIOLATION: Operator ID is required for forensic exports');
    }
    if (!request.caseNumber || request.caseNumber.trim().length < 2) {
      throw new Error('EVIDENCE_POLICY_VIOLATION: Case number is mandatory for regulated evidence export');
    }
    if (!request.reason || request.reason.trim().length < 5) {
      throw new Error('EVIDENCE_POLICY_VIOLATION: Detailed justification reason is mandatory');
    }
    if (!request.cameraIds || request.cameraIds.length === 0) {
      throw new Error('EVIDENCE_POLICY_VIOLATION: At least one camera must be specified');
    }
  }

  /**
   * Executes the full forensic evidence export transaction.
   */
  async exportEvidencePackage(request: ForensicExportRequest): Promise<EvidencePackageManifest> {
    this.assertCanExport(request);

    const year = new Date().getFullYear();
    const packageNumber = Math.floor(100000 + Math.random() * 900000);
    const evidencePackageId = `EV-${year}-${packageNumber}`;
    const nowIso = new Date().toISOString();

    // 1. Assemble Media, Snapshots, Timeline, Gaps, Clock Observations
    const assembled = await this.assembler.assembleEvidence(request);

    // 2. Initialize Hash-Chained Chain of Custody
    const exportCustodyEvent = this.custodyService.appendEvent(evidencePackageId, {
      event: 'EXPORT_CREATED',
      actor: request.operatorId,
      timestamp: nowIso,
      reason: request.reason,
    });

    // 3. Optional: Bind Legal Hold with Retention Engine
    let legalHoldData;
    if (request.applyLegalHold !== false) {
      const hold = retentionEngine.createLegalHold({
        tenantId: request.tenantId || 'BANK-001',
        caseNumber: request.caseNumber,
        reason: request.reason,
        createdBy: request.operatorId,
        scope: {
          branches: [request.branchId],
          cameras: request.cameraIds,
          startTime: new Date(request.startTime),
          endTime: new Date(request.endTime),
        },
      });

      this.custodyService.appendEvent(evidencePackageId, {
        event: 'LEGAL_HOLD_APPLIED',
        actor: request.operatorId,
        timestamp: nowIso,
        reason: `Legal Hold ${hold.id} applied to retain source segments indefinitely`,
      });

      legalHoldData = {
        holdId: hold.id,
        applied: true,
        appliedAt: nowIso,
        appliedBy: request.operatorId,
      };
    }

    // 4. Build Pre-Signed Manifest
    const preSignedManifest: Omit<EvidencePackageManifest, 'digitalSignature'> = {
      schemaVersion: '1.0',
      evidencePackageId,
      exportMode: request.mode || 'FORENSIC',
      case: {
        caseNumber: request.caseNumber,
        incidentId: request.incidentId,
        reason: request.reason,
        investigatorUserId: request.operatorId,
      },
      source: {
        branchId: request.branchId,
        branchName: request.branchName || `Branch ${request.branchId}`,
        cameraIds: request.cameraIds,
        recorderId: `NVR-${request.branchId}-01`,
        storageNode: `NODE-${request.branchId}-STORAGE`,
      },
      capture: {
        requestedStart: request.startTime,
        requestedEnd: request.endTime,
        actualStart: request.startTime,
        actualEnd: request.endTime,
        durationSeconds: Math.round((new Date(request.endTime).getTime() - new Date(request.startTime).getTime()) / 1000),
      },
      clock: assembled.clockObservations,
      recordingCoverage: {
        complete: assembled.gaps.length === 0,
        coveragePercent: assembled.coveragePercent,
        gapCount: assembled.gaps.length,
        largestGapMs: assembled.gaps[0]?.durationMs || 0,
        gaps: assembled.gaps,
      },
      mediaProcessing: {
        operation: 'REMUX',
        videoTranscoded: false,
        audioTranscoded: false,
        sourceSegments: assembled.sourceSegments,
      },
      files: assembled.files,
      legalHold: legalHoldData,
    };

    // 5. Digitally Sign Canonical Manifest using Asymmetric Ed25519
    const sigResult = this.signer.signPayload(preSignedManifest);

    const sealedManifest: EvidencePackageManifest = {
      ...preSignedManifest,
      digitalSignature: sigResult,
    };

    this.packages.set(evidencePackageId, sealedManifest);
    return sealedManifest;
  }

  getPackage(packageId: string): EvidencePackageManifest | undefined {
    return this.packages.get(packageId);
  }

  listPackages(): EvidencePackageManifest[] {
    return Array.from(this.packages.values());
  }
}

export const evidenceExportService = new EvidenceExportService();
