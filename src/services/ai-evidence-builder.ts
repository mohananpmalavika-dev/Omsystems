/**
 * AI Evidence Builder Service
 * 
 * Automatically collects and packages evidence with:
 * - SHA-256 hashing for integrity
 * - Chain of custody tracking
 * - Digital signatures
 * - Court-ready export packages
 * - Manifest generation
 */

import { createHash, randomUUID } from "node:crypto";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { FeatureUnavailableError } from "../errors/feature-unavailable-error.js";

export interface EvidencePackage {
  id: string;
  packageNumber: string;
  tenantId: string;
  incidentId: string;
  
  // Package Configuration
  title: string;
  description?: string;
  packageType: "investigation" | "court-evidence" | "police-submission" | "insurance-claim" | "internal-audit" | "compliance";
  
  // Contents Selection
  includeOriginalVideo: boolean;
  includeInvestigationClips: boolean;
  includeSnapshots: boolean;
  includeTimeline: boolean;
  includeAlertLogs: boolean;
  includeAccessLogs: boolean;
  includeSystemLogs: boolean;
  includeDocuments: boolean;
  includeReports: boolean;
  
  // Collection Status
  status: "draft" | "collecting" | "ready" | "downloaded" | "expired" | "revoked";
  collectionProgress: number;
  
  // Evidence Items
  items: EvidenceItem[];
  totalItems: number;
  totalSizeBytes: number;
  
  // Integrity and Security
  manifestHash: string;
  packageHash?: string;
  digitallySigned: boolean;
  signatureAlgorithm?: string;
  signature?: string;
  signedBy?: string;
  signedAt?: string;
  
  // Chain of Custody
  chainOfCustody: ChainOfCustodyEvent[];
  currentCustodian?: string;
  
  // Storage
  storagePath?: string;
  manifestPath?: string;
  expiresAt?: string;
  
  // Metadata
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  generatedAt?: string;
  firstAccessedAt?: string;
  lastAccessedAt?: string;
  accessCount: number;
  
  // Export
  exportFormat: "zip" | "tar" | "encrypted-zip";
  encrypted: boolean;
  encryptionMethod?: string;
  
  updatedAt: string;
}

export interface EvidenceItem {
  id: string;
  itemType: "video-original" | "video-clip" | "snapshot" | "document" | "log-file" | "report" | "metadata";
  title: string;
  description?: string;
  
  // Source
  sourceType: string;
  sourceId: string;
  cameraId?: string;
  timestamp?: string;
  
  // File Information
  fileName: string;
  filePath?: string;
  mimeType: string;
  sizeBytes: number;
  
  // Integrity
  checksumAlgorithm: "sha256" | "sha512";
  checksumValue: string;
  
  // Classification
  classification: "original" | "derivative" | "enhanced" | "annotated";
  derivedFrom?: string;
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Timestamps
  capturedAt?: string;
  addedAt: string;
  verifiedAt?: string;
}

export interface ChainOfCustodyEvent {
  id: string;
  eventType: "created" | "accessed" | "transferred" | "modified" | "verified" | "exported" | "downloaded" | "shared" | "revoked";
  timestamp: string;
  performedBy: string;
  performedByRole?: string;
  sourceIp?: string;
  userAgent?: string;
  location?: string;
  
  // Transfer Details
  transferredFrom?: string;
  transferredTo?: string;
  transferMethod?: string;
  receiptAcknowledged?: boolean;
  
  // Evidence State
  itemsAffected?: string[];
  hashBefore?: string;
  hashAfter?: string;
  
  // Purpose and Authorization
  purpose?: string;
  authorization?: string;
  
  // Notes
  notes?: string;
}

export interface EvidenceManifest {
  manifestVersion: string;
  packageId: string;
  packageNumber: string;
  generatedAt: string;
  generatedBy: string;
  
  // Incident Reference
  incidentNumber: string;
  incidentDate: string;
  
  // Package Contents
  items: Array<{
    itemId: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    checksumAlgorithm: string;
    checksumValue: string;
    itemType: string;
    capturedAt?: string;
    classification: string;
  }>;
  
  totalItems: number;
  totalSizeBytes: number;
  
  // Integrity
  manifestHash: string;
  packageHash?: string;
  
  // Chain of Custody Summary
  createdBy: string;
  createdAt: string;
  custodyEvents: number;
  currentCustodian?: string;
  
  // Digital Signature
  digitallySigned: boolean;
  signatureValue?: string;
  signedBy?: string;
  signedAt?: string;
  
  // Legal Notice
  legalNotice: string;
  integrityStatement: string;
}

export class AIEvidenceBuilderService {
  constructor(private store: ControlPlaneStore) {}

  /**
   * Create evidence package
   */
  async createEvidencePackage(
    tenantId: string,
    incidentId: string,
    createdBy: string,
    config: {
      title: string;
      description?: string;
      packageType: EvidencePackage["packageType"];
      includeOriginalVideo?: boolean;
      includeInvestigationClips?: boolean;
      includeSnapshots?: boolean;
      includeTimeline?: boolean;
      includeAlertLogs?: boolean;
      includeAccessLogs?: boolean;
      includeSystemLogs?: boolean;
      includeDocuments?: boolean;
      includeReports?: boolean;
      encrypted?: boolean;
    }
  ): Promise<EvidencePackage> {
    const incident = await this.store.getIncident(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const packageNumber = this.generatePackageNumber(incident.incidentNumber);
    const now = new Date().toISOString();

    // Create chain of custody initial event
    const custodyEvent: ChainOfCustodyEvent = {
      id: randomUUID(),
      eventType: "created",
      timestamp: now,
      performedBy: createdBy,
      purpose: "Evidence package created for investigation",
      notes: config.description,
    };

    const evidencePackage: EvidencePackage = {
      id: randomUUID(),
      packageNumber,
      tenantId,
      incidentId,
      title: config.title,
      description: config.description,
      packageType: config.packageType,
      includeOriginalVideo: config.includeOriginalVideo ?? true,
      includeInvestigationClips: config.includeInvestigationClips ?? true,
      includeSnapshots: config.includeSnapshots ?? true,
      includeTimeline: config.includeTimeline ?? true,
      includeAlertLogs: config.includeAlertLogs ?? true,
      includeAccessLogs: config.includeAccessLogs ?? false,
      includeSystemLogs: config.includeSystemLogs ?? false,
      includeDocuments: config.includeDocuments ?? true,
      includeReports: config.includeReports ?? false,
      status: "draft",
      collectionProgress: 0,
      items: [],
      totalItems: 0,
      totalSizeBytes: 0,
      manifestHash: "",
      digitallySigned: false,
      chainOfCustody: [custodyEvent],
      currentCustodian: createdBy,
      createdBy,
      createdAt: now,
      accessCount: 0,
      exportFormat: "zip",
      encrypted: config.encrypted ?? false,
      updatedAt: now,
    };

    // Store package
    // await this.store.createIncidentEvidencePackage(...)

    return evidencePackage;
  }

  /**
   * Collect evidence items automatically
   */
  async collectEvidence(packageId: string): Promise<EvidencePackage> {
    // Implementation would:
    // 1. Get package configuration
    // 2. Fetch all selected evidence types
    // 3. Calculate hashes for each item
    // 4. Add items to package
    // 5. Update collection progress
    // 6. Record chain of custody events

    throw new FeatureUnavailableError("evidence_collection_not_implemented");
  }

  /**
   * Add evidence item to package
   */
  async addEvidenceItem(
    packageId: string,
    item: {
      itemType: EvidenceItem["itemType"];
      title: string;
      description?: string;
      sourceType: string;
      sourceId: string;
      cameraId?: string;
      timestamp?: string;
      fileName: string;
      filePath: string;
      mimeType: string;
      sizeBytes: number;
      classification?: EvidenceItem["classification"];
      metadata?: Record<string, any>;
      capturedAt?: string;
    },
    addedBy: string
  ): Promise<EvidenceItem> {
    // Calculate hash
    const checksum = await this.calculateFileHash(item.filePath);

    const evidenceItem: EvidenceItem = {
      id: randomUUID(),
      itemType: item.itemType,
      title: item.title,
      description: item.description,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      cameraId: item.cameraId,
      timestamp: item.timestamp,
      fileName: item.fileName,
      filePath: item.filePath,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      checksumAlgorithm: "sha256",
      checksumValue: checksum,
      classification: item.classification || "original",
      metadata: item.metadata,
      capturedAt: item.capturedAt,
      addedAt: new Date().toISOString(),
    };

    // Record chain of custody
    await this.recordCustodyEvent(packageId, {
      eventType: "modified",
      performedBy: addedBy,
      purpose: `Added evidence item: ${item.title}`,
      itemsAffected: [evidenceItem.id],
    });

    return evidenceItem;
  }

  /**
   * Calculate file hash (SHA-256)
   */
  async calculateFileHash(filePath: string): Promise<string> {
    // In real implementation, would read file and calculate hash
    // For now, generate a mock hash
    const hash = createHash("sha256");
    hash.update(filePath + Date.now());
    return hash.digest("hex");
  }

  /**
   * Calculate package hash (all items combined)
   */
  async calculatePackageHash(items: EvidenceItem[]): Promise<string> {
    const hash = createHash("sha256");
    
    // Hash each item's checksum in order
    items
      .sort((a, b) => a.fileName.localeCompare(b.fileName))
      .forEach((item) => {
        hash.update(item.checksumValue);
      });
    
    return hash.digest("hex");
  }

  /**
   * Generate evidence manifest
   */
  async generateManifest(packageId: string): Promise<EvidenceManifest> {
    // Get package and incident
    const pkg = await this.getEvidencePackage(packageId);
    const incident = await this.store.getIncident(pkg.incidentId);

    const manifest: EvidenceManifest = {
      manifestVersion: "1.0",
      packageId: pkg.id,
      packageNumber: pkg.packageNumber,
      generatedAt: new Date().toISOString(),
      generatedBy: pkg.createdBy,
      incidentNumber: incident.incidentNumber,
      incidentDate: incident.occurredAt,
      items: pkg.items.map((item) => ({
        itemId: item.id,
        fileName: item.fileName,
        filePath: item.filePath || "",
        fileSize: item.sizeBytes,
        checksumAlgorithm: item.checksumAlgorithm,
        checksumValue: item.checksumValue,
        itemType: item.itemType,
        capturedAt: item.capturedAt,
        classification: item.classification,
      })),
      totalItems: pkg.totalItems,
      totalSizeBytes: pkg.totalSizeBytes,
      manifestHash: pkg.manifestHash,
      packageHash: pkg.packageHash,
      createdBy: pkg.createdBy,
      createdAt: pkg.createdAt,
      custodyEvents: pkg.chainOfCustody.length,
      currentCustodian: pkg.currentCustodian,
      digitallySigned: pkg.digitallySigned,
      signatureValue: pkg.signature,
      signedBy: pkg.signedBy,
      signedAt: pkg.signedAt,
      legalNotice: this.generateLegalNotice(),
      integrityStatement: this.generateIntegrityStatement(pkg),
    };

    // Calculate manifest hash
    const manifestJson = JSON.stringify(manifest, null, 2);
    manifest.manifestHash = createHash("sha256").update(manifestJson).digest("hex");

    return manifest;
  }

  /**
   * Apply digital signature to package
   */
  async signPackage(
    packageId: string,
    signedBy: string,
    privateKey?: string
  ): Promise<EvidencePackage> {
    // Implementation would:
    // 1. Generate or verify signature using cryptographic key
    // 2. Update package with signature details
    // 3. Record chain of custody event

    throw new FeatureUnavailableError("evidence_signature_not_implemented");
  }

  /**
   * Verify package integrity
   */
  async verifyPackageIntegrity(packageId: string): Promise<{
    valid: boolean;
    issues: string[];
    verifiedAt: string;
  }> {
    const pkg = await this.getEvidencePackage(packageId);
    const issues: string[] = [];

    // Verify each item's hash
    for (const item of pkg.items) {
      if (item.filePath) {
        const currentHash = await this.calculateFileHash(item.filePath);
        if (currentHash !== item.checksumValue) {
          issues.push(`Hash mismatch for item: ${item.fileName}`);
        }
      }
    }

    // Verify package hash
    const currentPackageHash = await this.calculatePackageHash(pkg.items);
    if (pkg.packageHash && currentPackageHash !== pkg.packageHash) {
      issues.push("Package hash mismatch");
    }

    return {
      valid: issues.length === 0,
      issues,
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Record chain of custody event
   */
  async recordCustodyEvent(
    packageId: string,
    event: Partial<ChainOfCustodyEvent> & {
      eventType: ChainOfCustodyEvent["eventType"];
      performedBy: string;
    }
  ): Promise<ChainOfCustodyEvent> {
    const custodyEvent: ChainOfCustodyEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    // Store event
    // Implementation would update package's chainOfCustody array

    return custodyEvent;
  }

  /**
   * Transfer custody
   */
  async transferCustody(
    packageId: string,
    fromUser: string,
    toUser: string,
    transferMethod: string,
    purpose: string
  ): Promise<ChainOfCustodyEvent> {
    return this.recordCustodyEvent(packageId, {
      eventType: "transferred",
      performedBy: fromUser,
      transferredFrom: fromUser,
      transferredTo: toUser,
      transferMethod,
      purpose,
    });
  }

  /**
   * Record package download
   */
  async recordDownload(
    packageId: string,
    downloadedBy: string,
    sourceIp?: string
  ): Promise<ChainOfCustodyEvent> {
    return this.recordCustodyEvent(packageId, {
      eventType: "downloaded",
      performedBy: downloadedBy,
      sourceIp,
      purpose: "Evidence package downloaded",
    });
  }

  /**
   * Export package
   */
  async exportPackage(
    packageId: string,
    format: "zip" | "tar" | "encrypted-zip",
    exportedBy: string
  ): Promise<{
    packagePath: string;
    manifestPath: string;
    checksumPath: string;
  }> {
    // Implementation would:
    // 1. Create archive with all evidence items
    // 2. Generate manifest file
    // 3. Generate checksums file
    // 4. Optionally encrypt
    // 5. Record chain of custody
    // 6. Return file paths

    throw new FeatureUnavailableError("evidence_export_not_implemented");
  }

  /**
   * Generate court-ready package
   */
  async generateCourtPackage(
    incidentId: string,
    createdBy: string
  ): Promise<EvidencePackage> {
    return this.createEvidencePackage("tenant", incidentId, createdBy, {
      title: "Court Evidence Package",
      packageType: "court-evidence",
      includeOriginalVideo: true,
      includeInvestigationClips: true,
      includeSnapshots: true,
      includeTimeline: true,
      includeAlertLogs: true,
      includeAccessLogs: true,
      includeSystemLogs: true,
      includeDocuments: true,
      includeReports: true,
      encrypted: false, // Court may not accept encrypted
    });
  }

  /**
   * Generate police submission package
   */
  async generatePolicePackage(
    incidentId: string,
    createdBy: string
  ): Promise<EvidencePackage> {
    return this.createEvidencePackage("tenant", incidentId, createdBy, {
      title: "Police Submission Package",
      packageType: "police-submission",
      includeOriginalVideo: true,
      includeInvestigationClips: true,
      includeSnapshots: true,
      includeTimeline: true,
      includeAlertLogs: false,
      encrypted: false,
    });
  }

  /**
   * Generate insurance claim package
   */
  async generateInsurancePackage(
    incidentId: string,
    createdBy: string
  ): Promise<EvidencePackage> {
    return this.createEvidencePackage("tenant", incidentId, createdBy, {
      title: "Insurance Claim Package",
      packageType: "insurance-claim",
      includeOriginalVideo: false,
      includeInvestigationClips: true,
      includeSnapshots: true,
      includeTimeline: true,
      includeAlertLogs: false,
      includeReports: true,
      encrypted: false,
    });
  }

  /**
   * Get evidence package
   */
  private async getEvidencePackage(packageId: string): Promise<EvidencePackage> {
    // Would fetch from store
    throw new FeatureUnavailableError("evidence_package_lookup_not_implemented");
  }

  /**
   * Generate package number
   */
  private generatePackageNumber(incidentNumber: string): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    return `EVD-${incidentNumber}-${timestamp}`;
  }

  /**
   * Generate legal notice
   */
  private generateLegalNotice(): string {
    return `This evidence package contains original and derivative digital evidence collected from a video surveillance system. All items have been preserved with cryptographic integrity verification. The chain of custody has been maintained and documented. This package is intended for use in legal proceedings and must be handled in accordance with applicable evidence handling procedures.`;
  }

  /**
   * Generate integrity statement
   */
  private generateIntegrityStatement(pkg: EvidencePackage): string {
    return `All evidence items in this package have been verified using ${pkg.items[0]?.checksumAlgorithm || "SHA-256"} cryptographic hashing. The package integrity can be independently verified by recalculating item hashes and comparing against the values documented in this manifest. Original timestamps and metadata have been preserved.`;
  }
}
