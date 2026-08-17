/**
 * Forensic Evidence Export Domain Types
 */

export type ExportMode = 'STANDARD' | 'FORENSIC';
export type MediaProcessingMode = 'REMUX' | 'TRANSCODE';

export interface EvidenceFileEntry {
  path: string;
  fileType: 'FOOTAGE' | 'SNAPSHOT' | 'METADATA' | 'TIMELINE' | 'GAPS' | 'CLOCK' | 'AUDIT' | 'CUSTODY' | 'SIGNATURE' | 'CERTIFICATE' | 'README';
  sizeBytes: number;
  sha256: string;
}

export interface CustodyEvent {
  sequence: number;
  event: 'EXPORT_CREATED' | 'PACKAGE_DOWNLOADED' | 'PACKAGE_SHARED' | 'EVIDENCE_VERIFIED' | 'LEGAL_HOLD_APPLIED' | 'CUSTODY_TRANSFERRED';
  actor: string;
  timestamp: string;
  recipient?: string;
  reason?: string;
  previousHash?: string;
  eventHash: string;
}

export interface EvidencePackageManifest {
  schemaVersion: '1.0';
  evidencePackageId: string;
  exportMode: ExportMode;

  case: {
    caseNumber: string;
    incidentId?: string;
    reason: string;
    investigatorUserId: string;
  };

  source: {
    branchId: string;
    branchName: string;
    cameraIds: string[];
    recorderId: string;
    storageNode: string;
  };

  capture: {
    requestedStart: string;
    requestedEnd: string;
    actualStart: string;
    actualEnd: string;
    durationSeconds: number;
  };

  clock: {
    deviceTimestamp: string;
    serverTimestamp: string;
    estimatedClockOffsetMs: number;
    clockSource: string;
    clockConfidence: number;
  };

  recordingCoverage: {
    complete: boolean;
    coveragePercent: number;
    gapCount: number;
    largestGapMs: number;
    gaps: Array<{ start: string; end: string; durationMs: number }>;
  };

  mediaProcessing: {
    operation: MediaProcessingMode;
    videoTranscoded: boolean;
    audioTranscoded: boolean;
    sourceSegments: Array<{ segmentId: string; sha256: string }>;
  };

  files: EvidenceFileEntry[];

  digitalSignature: {
    algorithm: 'ED25519';
    signatureBase64: string;
    signerKeyId: string;
    signedAt: string;
    certificatePem: string;
  };

  legalHold?: {
    holdId: string;
    applied: boolean;
    appliedAt: string;
    appliedBy: string;
  };
}

export interface ForensicExportRequest {
  tenantId?: string;
  branchId: string;
  branchName?: string;
  caseNumber: string;
  reason: string;
  incidentId?: string;
  cameraIds: string[];
  startTime: string;
  endTime: string;
  mode?: ExportMode;
  operatorId: string;
  applyLegalHold?: boolean;
}

export interface EvidenceVerificationResult {
  evidencePackageId: string;
  isOverallValid: boolean;
  signatureValid: boolean;
  signerCertificateValid: boolean;
  signerKeyId: string;
  totalFiles: number;
  validFilesCount: number;
  corruptFiles: Array<{ path: string; expectedSha256: string; actualSha256: string }>;
  chainOfCustodyValid: boolean;
  custodyEventsCount: number;
  recordingCoverageComplete: boolean;
  coveragePercent: number;
  verifiedAt: string;
}
