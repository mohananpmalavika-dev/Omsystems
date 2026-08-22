/**
 * Forensic Evidence Domain Types
 * 
 * Defines the authoritative contracts for:
 * - EvidencePackage
 * - EvidenceArtifact
 * - EvidenceProvenance (Camera, Recorder, Channel, Adapter)
 * - EvidenceTimeSync (Device time, Server time, Clock offset)
 * - Forensic Manifest & Digital Signature
 * - Tamper-evident Chain of Custody
 * - Legal Hold & Retention Guard
 * - Evidence Export Packages
 */

export type EvidencePackageStatus =
  | 'CAPTURING'
  | 'SEALING'
  | 'SEALED'
  | 'HELD'
  | 'EXPORTED'
  | 'VERIFICATION_FAILED';

export type ArtifactType =
  | 'SNAPSHOT'
  | 'VIDEO'
  | 'METADATA'
  | 'AUDIT'
  | 'REPORT'
  | 'REDACTED_VIDEO'
  | 'REDACTED_SNAPSHOT';

export interface EvidenceArtifact {
  id: string;
  evidencePackageId: string;
  type: ArtifactType;
  path: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string;
  createdAt: string;
  derivedFrom?: string;
  redactionProfile?: string;
}

export interface EvidenceProvenance {
  cameraId: string;
  cameraName?: string;
  recorderId: string;
  recorderName?: string;
  manufacturer: string;
  model: string;
  serialNumber?: string;
  channel: number;
  streamProfile: 'main' | 'sub' | 'snapshot';
  captureMethod: 'RECORDER_PLAYBACK' | 'RTSP_LIVE' | 'EDGE_BUFFER';
  adapter: string;
  adapterVersion: string;
}

export interface EvidenceTimeSync {
  captureStart: string;
  captureEnd: string;
  serverTime: string;
  deviceTime?: string;
  hoTime?: string;
  gatewayTime?: string;
  nvrTime?: string;
  cameraTime?: string;
  clockOffsetMs?: number;
  observedOffsetSeconds?: number;
  jitterMs?: number;
  ntpSynchronized?: boolean;
  ntpServer?: string;
  lastSyncAt?: string;
  clockDriftMsPerDay?: number;
  clockHealthStatus?: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  forensicConfidence?: 'HIGH' | 'MEDIUM' | 'DEGRADED';
}

export interface ForensicManifest {
  schemaVersion: '1.0';
  evidenceId: string;
  tenantId: string;
  branchId: string;
  incidentId?: string;
  alertId?: string;
  caseNumber?: string;
  camera: {
    cameraId: string;
    name?: string;
    recorderId: string;
    channel: number;
  };
  provenance: EvidenceProvenance;
  capture: EvidenceTimeSync;
  reason: string;
  artifacts: Array<{
    path: string;
    sha256: string;
    size: number;
    mimeType: string;
    type: ArtifactType;
  }>;
  createdBy: string;
  createdAt: string;
  hashAlgorithm: 'SHA-256';
  signatureAlgorithm: 'Ed25519' | 'RSA-SHA256';
  signingKeyId: string;
}

export interface ManifestSignature {
  algorithm: 'Ed25519' | 'RSA-SHA256';
  keyId: string;
  publicKey: string;
  manifestSha256: string;
  signature: string;
  signedAt: string;
}

export interface EvidencePackage {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  incidentId?: string;
  alertId?: string;
  caseNumber?: string;
  recorderId: string;
  recorderChannel: number;
  provenance: EvidenceProvenance;
  timeSync: EvidenceTimeSync;
  capturedBy: string;
  capturedAt: string;
  reason: string;
  status: EvidencePackageStatus;
  artifacts: EvidenceArtifact[];
  manifest?: ForensicManifest;
  signature?: ManifestSignature;
  manifestHash?: string;
}

export type CustodyEventType =
  | 'CAPTURE_REQUESTED'
  | 'CAPTURED'
  | 'SEALED'
  | 'VIEWED'
  | 'DOWNLOADED'
  | 'EXPORTED'
  | 'SHARED'
  | 'LEGAL_HOLD_APPLIED'
  | 'LEGAL_HOLD_RELEASED'
  | 'VERIFIED'
  | 'VERIFICATION_FAILED';

export interface EvidenceCustodyEvent {
  id: string;
  evidencePackageId: string;
  event: CustodyEventType;
  actorId: string;
  actorType: 'USER' | 'SYSTEM' | 'SERVICE';
  reason?: string;
  ipAddress?: string;
  workstationId?: string;
  timestamp: string;
  previousEventHash?: string;
  eventHash: string;
}

export interface LegalHoldRecord {
  id: string;
  tenantId: string;
  caseNumber: string;
  reason: string;
  evidencePackageIds: string[];
  cameraIds?: string[];
  startTime?: string;
  endTime?: string;
  status: 'ACTIVE' | 'RELEASED';
  createdBy: string;
  createdAt: string;
  releasedBy?: string;
  releasedAt?: string;
}

export interface EvidenceExportRecord {
  id: string;
  evidencePackageId: string;
  tenantId: string;
  requestedBy: string;
  approvedBy?: string;
  reason: string;
  caseNumber?: string;
  recipient?: string;
  redacted: boolean;
  redactionProfile?: string;
  passwordProtected: boolean;
  exportHash: string;
  createdAt: string;
  expiresAt?: string;
}
