import { randomBytes, randomUUID } from "node:crypto";
import type { ControlPlaneStore } from "./control-plane-store.js";

/**
 * Incident Management Methods Extension
 * This file contains all incident management methods that will be mixed into MemoryStore
 */

export const IncidentManagementMethods = {
  // ============ CORE INCIDENT OPERATIONS ============
  
  async createIncident(this: any, input: Parameters<ControlPlaneStore["createIncident"]>[0]) {
    const now = new Date().toISOString();
    
    // Generate incident number if not provided
    const incidentNumber = `INC-${input.tenantId.substring(0, 2).toUpperCase()}-${new Date().getFullYear()}-${String(this.incidents.length + 1).padStart(6, '0')}`;
    
    const incident = {
      id: randomUUID(),
      incidentNumber,
      tenantId: input.tenantId,
      branchId: input.branchId,
      title: input.title,
      description: input.description,
      incidentType: input.incidentType ?? 'other',
      severity: input.severity ?? 'P3',
      status: 'new' as const,
      detectionSource: input.detectionSource ?? 'manual-operator',
      occurredAt: input.occurredAt ?? now,
      detectedAt: now,
      reportedAt: now,
      reportedBy: input.reportedBy,
      assignedTo: undefined,
      estimatedLoss: input.estimatedLoss,
      injuryDetails: input.injuryDetails,
      confidentialityLevel: input.confidentialityLevel ?? 'internal',
      legalHoldStatus: false,
      policeRequired: input.policeRequired ?? false,
      insuranceRequired: input.insuranceRequired ?? false,
      createdAt: now,
      updatedAt: now,
    };
    
    this.incidents.push(incident);
    
    // Add creation event
    await this.addIncidentEvent.call(this, {
      incidentId: incident.id,
      eventType: 'status_changed',
      description: 'Incident created',
      details: { status: 'new' },
      performedBy: input.reportedBy,
    });
    
    return incident;
  },

  async getIncident(this: any, id: string) {
    return this.incidents.find((i: any) => i.id === id);
  },


  async listIncidents(this: any, tenantId: string, filters?: Parameters<ControlPlaneStore["listIncidents"]>[1]) {
    let results = this.incidents.filter((i: any) => i.tenantId === tenantId);
    
    if (filters?.status) {
      results = results.filter((i: any) => i.status === filters.status);
    }
    if (filters?.incidentType) {
      results = results.filter((i: any) => i.incidentType === filters.incidentType);
    }
    if (filters?.severity) {
      results = results.filter((i: any) => i.severity === filters.severity);
    }
    if (filters?.branchId) {
      results = results.filter((i: any) => i.branchId === filters.branchId);
    }
    if (filters?.assignedTo) {
      results = results.filter((i: any) => i.assignedTo === filters.assignedTo);
    }
    if (filters?.from) {
      results = results.filter((i: any) => i.occurredAt >= filters.from!);
    }
    if (filters?.to) {
      results = results.filter((i: any) => i.occurredAt <= filters.to!);
    }
    
    results.sort((a: any, b: any) => b.occurredAt.localeCompare(a.occurredAt));
    
    return results.slice(0, filters?.limit ?? 100);
  },

  async updateIncident(this: any, id: string, input: Parameters<ControlPlaneStore["updateIncident"]>[1]) {
    const incident = this.incidents.find((i: any) => i.id === id);
    if (!incident) return undefined;
    
    Object.assign(incident, input, { updatedAt: new Date().toISOString() });
    
    return incident;
  },

  async updateIncidentStatus(this: any, id: string, status: string, changedBy: string, notes?: string) {
    const incident = this.incidents.find((i: any) => i.id === id);
    if (!incident) return undefined;
    
    const oldStatus = incident.status;
    incident.status = status;
    incident.updatedAt = new Date().toISOString();
    
    if (status === 'closed') {
      incident.closedAt = new Date().toISOString();
    }
    
    await this.addIncidentEvent.call(this, {
      incidentId: id,
      eventType: 'status_changed',
      description: `Status changed from ${oldStatus} to ${status}`,
      details: { oldStatus, newStatus: status, notes },
      performedBy: changedBy,
    });
    
    return incident;
  },


  async assignIncident(this: any, id: string, userId: string, assignedBy: string) {
    const incident = this.incidents.find((i: any) => i.id === id);
    if (!incident) return undefined;
    
    const previousAssignee = incident.assignedTo;
    incident.assignedTo = userId;
    incident.updatedAt = new Date().toISOString();
    
    await this.addIncidentEvent.call(this, {
      incidentId: id,
      eventType: 'assigned',
      description: `Incident assigned to ${userId}`,
      details: { assignedTo: userId, previousAssignee, assignedBy },
      performedBy: assignedBy,
    });
    
    return incident;
  },

  async escalateIncident(this: any, id: string, escalatedBy: string, reason: string, recipients: string[]) {
    const incident = this.incidents.find((i: any) => i.id === id);
    if (!incident) return undefined;
    
    incident.status = 'escalated';
    incident.updatedAt = new Date().toISOString();
    
    await this.addIncidentEvent.call(this, {
      incidentId: id,
      eventType: 'escalated',
      description: 'Incident escalated',
      details: { reason, recipients },
      performedBy: escalatedBy,
    });
    
    return incident;
  },

  async closeIncident(this: any, id: string, closedBy: string, notes?: string) {
    return this.updateIncidentStatus.call(this, id, 'closed', closedBy, notes);
  },

  async reopenIncident(this: any, id: string, reopenedBy: string, reason: string) {
    const incident = this.incidents.find((i: any) => i.id === id);
    if (!incident) return undefined;
    
    incident.status = 'reopened';
    incident.closedAt = undefined;
    incident.updatedAt = new Date().toISOString();
    
    await this.addIncidentEvent.call(this, {
      incidentId: id,
      eventType: 'status_changed',
      description: 'Incident reopened',
      details: { reason },
      performedBy: reopenedBy,
    });
    
    return incident;
  },


  // ============ PARTICIPANT MANAGEMENT ============
  
  async addIncidentParticipant(this: any, input: Parameters<ControlPlaneStore["addIncidentParticipant"]>[0]) {
    const participant = {
      id: randomUUID(),
      incidentId: input.incidentId,
      role: input.role,
      personType: input.personType,
      name: input.name,
      employeeId: input.employeeId,
      customerId: input.customerId,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      notes: input.notes,
      addedBy: input.addedBy,
      addedAt: new Date().toISOString(),
    };
    
    this.incidentParticipants.push(participant);
    
    await this.addIncidentEvent.call(this, {
      incidentId: input.incidentId,
      eventType: 'participant_added',
      description: `Participant added: ${input.name || input.role}`,
      details: { participantId: participant.id, role: input.role },
      performedBy: input.addedBy,
    });
    
    return participant;
  },

  async listIncidentParticipants(this: any, incidentId: string) {
    return this.incidentParticipants.filter((p: any) => p.incidentId === incidentId);
  },

  async updateIncidentParticipant(this: any, id: string, input: any) {
    const participant = this.incidentParticipants.find((p: any) => p.id === id);
    if (!participant) return undefined;
    
    Object.assign(participant, input);
    return participant;
  },

  async removeIncidentParticipant(this: any, id: string) {
    const index = this.incidentParticipants.findIndex((p: any) => p.id === id);
    if (index >= 0) {
      this.incidentParticipants.splice(index, 1);
    }
  },


  // ============ CAMERA AND VIDEO MANAGEMENT ============
  
  async addIncidentCamera(this: any, incidentId: string, cameraId: string, isPrimary: boolean, addedBy: string) {
    const existing = this.incidentCameras.find((c: any) => c.incidentId === incidentId && c.cameraId === cameraId);
    if (existing) return;
    
    const record = {
      id: randomUUID(),
      incidentId,
      cameraId,
      isPrimary,
      addedAt: new Date().toISOString(),
      addedBy,
    };
    
    this.incidentCameras.push(record);
    
    await this.addIncidentEvent.call(this, {
      incidentId,
      eventType: 'camera_added',
      description: `Camera ${cameraId} added to incident`,
      details: { cameraId, isPrimary },
      performedBy: addedBy,
    });
  },

  async listIncidentCameras(this: any, incidentId: string) {
    return this.incidentCameras.filter((c: any) => c.incidentId === incidentId);
  },

  async addIncidentVideoRange(this: any, input: Parameters<ControlPlaneStore["addIncidentVideoRange"]>[0]) {
    const now = new Date().toISOString();
    
    const range = {
      id: randomUUID(),
      incidentId: input.incidentId,
      cameraId: input.cameraId,
      fromAt: input.fromAt,
      toAt: input.toAt,
      preservedAt: now,
      preservedBy: input.preservedBy,
      legalHoldApplied: input.applyLegalHold ?? false,
      legalHoldId: undefined as string | undefined,
      notes: input.notes,
    };
    
    // Apply legal hold if requested
    if (input.applyLegalHold) {
      const legalHold = await this.createRecordingLegalHold.call(this, {
        tenantId: this.incidents.find((i: any) => i.id === input.incidentId)?.tenantId || 'unknown',
        cameraId: input.cameraId,
        fromAt: input.fromAt,
        toAt: input.toAt,
        reason: `Incident ${input.incidentId} evidence preservation`,
        createdBy: input.preservedBy,
      });
      range.legalHoldId = legalHold.id;
      
      // Update incident legal hold status
      const incident = this.incidents.find((i: any) => i.id === input.incidentId);
      if (incident) {
        incident.legalHoldStatus = true;
      }
    }
    
    this.incidentVideoRanges.push(range);
    
    await this.addIncidentEvent.call(this, {
      incidentId: input.incidentId,
      eventType: 'video_preserved',
      description: `Video range preserved: ${input.fromAt} to ${input.toAt}`,
      details: { cameraId: input.cameraId, fromAt: input.fromAt, toAt: input.toAt, legalHoldApplied: input.applyLegalHold },
      performedBy: input.preservedBy,
    });
    
    return range;
  },


  async listIncidentVideoRanges(this: any, incidentId: string) {
    return this.incidentVideoRanges.filter((r: any) => r.incidentId === incidentId);
  },

  async preserveIncidentVideoAutomatic(this: any, input: Parameters<ControlPlaneStore["preserveIncidentVideoAutomatic"]>[0]) {
    const incidentDate = new Date(input.incidentTime);
    const preRollMs = input.preRollMinutes * 60 * 1000;
    const postRollMs = input.postRollMinutes * 60 * 1000;
    
    const fromAt = new Date(incidentDate.getTime() - preRollMs).toISOString();
    const toAt = new Date(incidentDate.getTime() + postRollMs).toISOString();
    
    return this.addIncidentVideoRange.call(this, {
      incidentId: input.incidentId,
      cameraId: input.cameraId,
      fromAt,
      toAt,
      preservedBy: input.preservedBy,
      applyLegalHold: true,
      notes: `Automatic preservation: ${input.preRollMinutes}min pre-roll, ${input.postRollMinutes}min post-roll`,
    });
  },

  // ============ TIMELINE AND EVENTS ============
  
  async listIncidentTimeline(this: any, incidentId: string) {
    return this.incidentEvents
      .filter((e: any) => e.incidentId === incidentId)
      .sort((a: any, b: any) => a.occurredAt.localeCompare(b.occurredAt));
  },

  async addIncidentEvent(this: any, input: Parameters<ControlPlaneStore["addIncidentEvent"]>[0]) {
    const event = {
      id: randomUUID(),
      incidentId: input.incidentId,
      eventType: input.eventType,
      description: input.description,
      details: input.details ?? {},
      performedBy: input.performedBy,
      occurredAt: new Date().toISOString(),
    };
    
    this.incidentEvents.push(event);
    return event;
  },


  // ============ CLIPS AND SNAPSHOTS ============
  
  async createIncidentClip(this: any, input: Parameters<ControlPlaneStore["createIncidentClip"]>[0]) {
    const clip = {
      id: randomUUID(),
      incidentId: input.incidentId,
      cameraId: input.cameraId,
      sourceSegmentIds: input.sourceSegmentIds,
      startTime: input.startTime,
      endTime: input.endTime,
      clipType: input.clipType,
      storagePath: input.storagePath,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256,
      format: input.format,
      hasWatermark: input.hasWatermark,
      hasTimestamp: input.hasTimestamp,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      notes: input.notes,
    };
    
    this.incidentClips.push(clip);
    
    await this.addIncidentEvent.call(this, {
      incidentId: input.incidentId,
      eventType: 'clip_created',
      description: `Clip created: ${input.clipType}`,
      details: { clipId: clip.id, startTime: input.startTime, endTime: input.endTime },
      performedBy: input.createdBy,
    });
    
    return clip;
  },

  async listIncidentClips(this: any, incidentId: string) {
    return this.incidentClips.filter((c: any) => c.incidentId === incidentId);
  },

  async getIncidentClip(this: any, id: string) {
    return this.incidentClips.find((c: any) => c.id === id);
  },

  async createIncidentSnapshot(this: any, input: Parameters<ControlPlaneStore["createIncidentSnapshot"]>[0]) {
    const snapshot = {
      id: randomUUID(),
      incidentId: input.incidentId,
      cameraId: input.cameraId,
      segmentId: input.segmentId,
      timestamp: input.timestamp,
      snapshotType: input.snapshotType,
      storagePath: input.storagePath,
      checksumSha256: input.checksumSha256,
      description: input.description,
      annotations: input.annotations,
      enhancementDetails: input.enhancementDetails,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    
    this.incidentSnapshots.push(snapshot);
    
    await this.addIncidentEvent.call(this, {
      incidentId: input.incidentId,
      eventType: 'snapshot_taken',
      description: `Snapshot captured: ${input.snapshotType}`,
      details: { snapshotId: snapshot.id, timestamp: input.timestamp },
      performedBy: input.createdBy,
    });
    
    return snapshot;
  },

  async listIncidentSnapshots(this: any, incidentId: string) {
    return this.incidentSnapshots.filter((s: any) => s.incidentId === incidentId);
  },

  async getIncidentSnapshot(this: any, id: string) {
    return this.incidentSnapshots.find((s: any) => s.id === id);
  },


  // ============ EVIDENCE ITEMS AND PACKAGES ============
  
  async addIncidentEvidenceItem(this: any, input: Parameters<ControlPlaneStore["addIncidentEvidenceItem"]>[0]) {
    const item = {
      id: randomUUID(),
      incidentId: input.incidentId,
      itemType: input.itemType,
      title: input.title,
      description: input.description,
      referenceId: input.referenceId,
      storagePath: input.storagePath,
      checksumSha256: input.checksumSha256,
      addedBy: input.addedBy,
      addedAt: new Date().toISOString(),
    };
    
    this.incidentEvidenceItems.push(item);
    return item;
  },

  async listIncidentEvidenceItems(this: any, incidentId: string) {
    return this.incidentEvidenceItems.filter((i: any) => i.incidentId === incidentId);
  },

  async createIncidentEvidencePackage(this: any, input: Parameters<ControlPlaneStore["createIncidentEvidencePackage"]>[0]) {
    const incident = this.incidents.find((i: any) => i.id === input.incidentId);
    if (!incident) throw new Error('Incident not found');
    
    const packageNumber = `EVD-${incident.incidentNumber}-${String(this.incidentEvidencePackages.filter((p: any) => p.incidentId === input.incidentId).length + 1).padStart(3, '0')}`;
    
    const pkg = {
      id: randomUUID(),
      incidentId: input.incidentId,
      packageNumber,
      title: input.title,
      description: input.description,
      status: 'draft' as const,
      includeOriginalVideo: input.includeOriginalVideo,
      includeInvestigationClips: input.includeInvestigationClips,
      includeSnapshots: input.includeSnapshots,
      includeTimeline: input.includeTimeline,
      includeAlertLogs: input.includeAlertLogs,
      includeDocuments: input.includeDocuments,
      packagePath: undefined,
      packageSizeBytes: undefined,
      checksumSha256: undefined,
      manifestPath: undefined,
      digitallySigned: false,
      signature: undefined,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      approvedBy: undefined,
      approvedAt: undefined,
      generatedAt: undefined,
      expiresAt: undefined,
      downloadedBy: undefined,
      downloadedAt: undefined,
      error: undefined,
    };
    
    this.incidentEvidencePackages.push(pkg);
    
    await this.addIncidentEvent.call(this, {
      incidentId: input.incidentId,
      eventType: 'evidence_exported',
      description: `Evidence package created: ${packageNumber}`,
      details: { packageId: pkg.id },
      performedBy: input.createdBy,
    });
    
    return pkg;
  },

  async listIncidentEvidencePackages(this: any, incidentId: string) {
    return this.incidentEvidencePackages.filter((p: any) => p.incidentId === incidentId);
  },

  async getIncidentEvidencePackage(this: any, id: string) {
    return this.incidentEvidencePackages.find((p: any) => p.id === id);
  },


  async approveEvidencePackage(this: any, id: string, approvedBy: string) {
    const pkg = this.incidentEvidencePackages.find((p: any) => p.id === id);
    if (!pkg) return undefined;
    
    pkg.status = 'approved';
    pkg.approvedBy = approvedBy;
    pkg.approvedAt = new Date().toISOString();
    
    return pkg;
  },

  async updateEvidencePackageStatus(this: any, id: string, status: string, details?: any) {
    const pkg = this.incidentEvidencePackages.find((p: any) => p.id === id);
    if (!pkg) return undefined;
    
    pkg.status = status;
    if (details) {
      Object.assign(pkg, details);
    }
    
    if (status === 'ready') {
      pkg.generatedAt = new Date().toISOString();
      // Set expiry to 30 days from generation
      pkg.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }
    
    return pkg;
  },

  async recordEvidencePackageDownload(this: any, id: string, downloadedBy: string) {
    const pkg = this.incidentEvidencePackages.find((p: any) => p.id === id);
    if (!pkg) return undefined;
    
    pkg.status = 'downloaded';
    pkg.downloadedBy = downloadedBy;
    pkg.downloadedAt = new Date().toISOString();
    
    return pkg;
  },


  // ============ POLICE INTIMATION ============
  
  async createPoliceIntimation(this: any, input: Parameters<ControlPlaneStore["createPoliceIntimation"]>[0]) {
    const intimation = {
      id: randomUUID(),
      incidentId: input.incidentId,
      policeStation: input.policeStation,
      policeStationAddress: input.policeStationAddress,
      intimationMethod: input.intimationMethod,
      intimatedAt: input.intimatedAt,
      intimatedBy: input.intimatedBy,
      officerName: input.officerName,
      officerDesignation: input.officerDesignation,
      officerContact: input.officerContact,
      gdNumber: undefined,
      firNumber: undefined,
      firDate: undefined,
      firCopy: undefined,
      acknowledgementCopy: undefined,
      status: 'intimated' as const,
      investigationOfficer: undefined,
      investigationOfficerContact: undefined,
      followUpDate: undefined,
      notes: input.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    this.incidentPoliceIntimations.push(intimation);
    
    // Update incident status
    const incident = this.incidents.find((i: any) => i.id === input.incidentId);
    if (incident && incident.status !== 'closed') {
      incident.status = 'police-intimated';
      incident.updatedAt = new Date().toISOString();
    }
    
    await this.addIncidentEvent.call(this, {
      incidentId: input.incidentId,
      eventType: 'police_intimated',
      description: `Police intimated: ${input.policeStation}`,
      details: { intimationId: intimation.id, method: input.intimationMethod },
      performedBy: input.intimatedBy,
    });
    
    return intimation;
  },

  async listPoliceIntimations(this: any, incidentId: string) {
    return this.incidentPoliceIntimations.filter((p: any) => p.incidentId === incidentId);
  },

  async getPoliceIntimation(this: any, id: string) {
    return this.incidentPoliceIntimations.find((p: any) => p.id === id);
  },

  async updatePoliceIntimation(this: any, id: string, input: Parameters<ControlPlaneStore["updatePoliceIntimation"]>[1]) {
    const intimation = this.incidentPoliceIntimations.find((p: any) => p.id === id);
    if (!intimation) return undefined;
    
    Object.assign(intimation, input, { updatedAt: new Date().toISOString() });
    
    return intimation;
  },


  async recordPoliceEvidenceTransfer(this: any, input: Parameters<ControlPlaneStore["recordPoliceEvidenceTransfer"]>[0]) {
    const transfer = {
      id: randomUUID(),
      incidentId: input.incidentId,
      policeIntimationId: input.policeIntimationId,
      transferDate: input.transferDate,
      transferredBy: input.transferredBy,
      evidencePackageId: input.evidencePackageId,
      evidenceDescription: input.evidenceDescription,
      recipientName: input.recipientName,
      recipientDesignation: input.recipientDesignation,
      receiptAcknowledgement: input.receiptAcknowledgement,
      transferMethod: input.transferMethod,
      notes: input.notes,
      createdAt: new Date().toISOString(),
    };
    
    this.incidentPoliceEvidenceTransfers.push(transfer);
    
    await this.addIncidentEvent.call(this, {
      incidentId: input.incidentId,
      eventType: 'evidence_exported',
      description: `Evidence transferred to police: ${input.recipientName}`,
      details: { transferId: transfer.id, method: input.transferMethod },
      performedBy: input.transferredBy,
    });
    
    return transfer;
  },

  async listPoliceEvidenceTransfers(this: any, incidentId: string) {
    return this.incidentPoliceEvidenceTransfers.filter((t: any) => t.incidentId === incidentId);
  },

  // ============ INSURANCE CLAIMS ============
  
  async createInsuranceClaim(this: any, input: Parameters<ControlPlaneStore["createInsuranceClaim"]>[0]) {
    const claim = {
      id: randomUUID(),
      incidentId: input.incidentId,
      insuranceCompany: input.insuranceCompany,
      policyNumber: input.policyNumber,
      claimNumber: undefined,
      dateOfLoss: input.dateOfLoss,
      estimatedLoss: input.estimatedLoss,
      claimAmount: input.claimAmount,
      submittedDate: undefined,
      submittedBy: undefined,
      surveyorName: undefined,
      surveyorContact: undefined,
      surveyDate: undefined,
      status: 'to-be-filed' as const,
      settlementAmount: undefined,
      settlementDate: undefined,
      rejectionReason: undefined,
      notes: input.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    this.incidentInsuranceClaims.push(claim);
    
    await this.addIncidentEvent.call(this, {
      incidentId: input.incidentId,
      eventType: 'insurance_filed',
      description: `Insurance claim created: ${input.insuranceCompany}`,
      details: { claimId: claim.id, estimatedLoss: input.estimatedLoss },
      performedBy: undefined,
    });
    
    return claim;
  },

  async listInsuranceClaims(this: any, incidentId: string) {
    return this.incidentInsuranceClaims.filter((c: any) => c.incidentId === incidentId);
  },

  async getInsuranceClaim(this: any, id: string) {
    return this.incidentInsuranceClaims.find((c: any) => c.id === id);
  },


  async updateInsuranceClaim(this: any, id: string, input: Parameters<ControlPlaneStore["updateInsuranceClaim"]>[1]) {
    const claim = this.incidentInsuranceClaims.find((c: any) => c.id === id);
    if (!claim) return undefined;
    
    Object.assign(claim, input, { updatedAt: new Date().toISOString() });
    
    // Update incident status if claim is submitted
    if (input.status === 'submitted' && input.submittedDate) {
      const incident = this.incidents.find((i: any) => i.id === claim.incidentId);
      if (incident && incident.status !== 'closed') {
        incident.status = 'insurance-submitted';
        incident.updatedAt = new Date().toISOString();
      }
    }
    
    return claim;
  },

  async addInsuranceDocument(this: any, input: Parameters<ControlPlaneStore["addInsuranceDocument"]>[0]) {
    const doc = {
      id: randomUUID(),
      incidentId: input.incidentId,
      claimId: input.claimId,
      documentType: input.documentType,
      documentTitle: input.documentTitle,
      documentPath: input.documentPath,
      uploadedBy: input.uploadedBy,
      uploadedAt: new Date().toISOString(),
    };
    
    this.incidentInsuranceDocuments.push(doc);
    return doc;
  },

  async listInsuranceDocuments(this: any, incidentId: string, claimId?: string) {
    return this.incidentInsuranceDocuments.filter((d: any) => 
      d.incidentId === incidentId && (!claimId || d.claimId === claimId)
    );
  },


  // ============ TASKS ============
  
  async createIncidentTask(this: any, input: Parameters<ControlPlaneStore["createIncidentTask"]>[0]) {
    const task = {
      id: randomUUID(),
      incidentId: input.incidentId,
      taskName: input.taskName,
      description: input.description,
      assignedTo: input.assignedTo,
      dueDate: input.dueDate,
      priority: input.priority,
      status: 'pending' as const,
      isMandatory: input.isMandatory,
      completedBy: undefined,
      completedAt: undefined,
      completionNotes: undefined,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    
    this.incidentTasks.push(task);
    
    await this.addIncidentEvent.call(this, {
      incidentId: input.incidentId,
      eventType: 'task_created',
      description: `Task created: ${input.taskName}`,
      details: { taskId: task.id, assignedTo: input.assignedTo },
      performedBy: input.createdBy,
    });
    
    return task;
  },

  async listIncidentTasks(this: any, incidentId: string) {
    return this.incidentTasks.filter((t: any) => t.incidentId === incidentId);
  },

  async updateIncidentTask(this: any, id: string, input: Parameters<ControlPlaneStore["updateIncidentTask"]>[1]) {
    const task = this.incidentTasks.find((t: any) => t.id === id);
    if (!task) return undefined;
    
    Object.assign(task, input);
    return task;
  },

  async completeIncidentTask(this: any, id: string, completedBy: string, completionNotes?: string) {
    const task = this.incidentTasks.find((t: any) => t.id === id);
    if (!task) return undefined;
    
    task.status = 'completed';
    task.completedBy = completedBy;
    task.completedAt = new Date().toISOString();
    task.completionNotes = completionNotes;
    
    return task;
  },


  // ============ NOTES ============
  
  async addIncidentNote(this: any, input: Parameters<ControlPlaneStore["addIncidentNote"]>[0]) {
    const note = {
      id: randomUUID(),
      incidentId: input.incidentId,
      noteType: input.noteType,
      content: input.content,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      editedAt: undefined,
    };
    
    this.incidentNotes.push(note);
    
    await this.addIncidentEvent.call(this, {
      incidentId: input.incidentId,
      eventType: 'note_added',
      description: `Note added: ${input.noteType}`,
      details: { noteId: note.id },
      performedBy: input.createdBy,
    });
    
    return note;
  },

  async listIncidentNotes(this: any, incidentId: string, noteType?: string) {
    return this.incidentNotes.filter((n: any) => 
      n.incidentId === incidentId && (!noteType || n.noteType === noteType)
    );
  },

  async updateIncidentNote(this: any, id: string, content: string) {
    const note = this.incidentNotes.find((n: any) => n.id === id);
    if (!note) return undefined;
    
    note.content = content;
    note.editedAt = new Date().toISOString();
    return note;
  },

  async deleteIncidentNote(this: any, id: string) {
    const index = this.incidentNotes.findIndex((n: any) => n.id === id);
    if (index >= 0) {
      this.incidentNotes.splice(index, 1);
    }
  },


  // ============ SECURE SHARING ============
  
  async createSecureShare(this: any, input: Parameters<ControlPlaneStore["createSecureShare"]>[0]) {
    const shareToken = randomBytes(32).toString('base64url');
    const oneTimePassword = Math.floor(100000 + Math.random() * 900000).toString();
    
    const share = {
      id: randomUUID(),
      incidentId: input.incidentId,
      evidencePackageId: input.evidencePackageId,
      shareToken,
      shareUrl: `https://evidence.example.com/share/${shareToken}`,
      recipientName: input.recipientName,
      recipientOrganization: input.recipientOrganization,
      recipientEmail: input.recipientEmail,
      recipientVerified: false,
      purpose: input.purpose,
      oneTimePassword,
      maxDownloads: input.maxDownloads,
      downloadCount: 0,
      expiresAt: input.expiresAt,
      status: 'active' as const,
      watermarked: input.watermarked,
      encrypted: input.encrypted,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      downloadedAt: undefined,
      downloadedBy: undefined,
      downloadIp: undefined,
      revokedAt: undefined,
      revokedBy: undefined,
      revokeReason: undefined,
    };
    
    this.incidentSecureShares.push(share);
    
    return share;
  },

  async listSecureShares(this: any, incidentId: string) {
    return this.incidentSecureShares.filter((s: any) => s.incidentId === incidentId);
  },

  async getSecureShare(this: any, id: string) {
    return this.incidentSecureShares.find((s: any) => s.id === id);
  },

  async getSecureShareByToken(this: any, token: string) {
    return this.incidentSecureShares.find((s: any) => s.shareToken === token);
  },

  async verifySecureShareAccess(this: any, token: string, oneTimePassword?: string) {
    const share = await this.getSecureShareByToken.call(this, token);
    
    if (!share) {
      return { allowed: false, error: 'Invalid share token' };
    }
    
    if (share.status !== 'active') {
      return { allowed: false, share, error: 'Share is not active' };
    }
    
    if (new Date(share.expiresAt) < new Date()) {
      share.status = 'expired';
      return { allowed: false, share, error: 'Share has expired' };
    }
    
    if (share.downloadCount >= share.maxDownloads) {
      return { allowed: false, share, error: 'Maximum downloads reached' };
    }
    
    if (share.oneTimePassword && oneTimePassword !== share.oneTimePassword) {
      return { allowed: false, share, error: 'Invalid one-time password' };
    }
    
    return { allowed: true, share };
  },


  async recordSecureShareDownload(this: any, input: Parameters<ControlPlaneStore["recordSecureShareDownload"]>[0]) {
    const share = this.incidentSecureShares.find((s: any) => s.id === input.id);
    if (!share) return undefined;
    
    share.downloadCount += 1;
    share.downloadedBy = input.downloadedBy;
    share.downloadedAt = new Date().toISOString();
    share.downloadIp = input.downloadIp;
    
    if (share.downloadCount >= share.maxDownloads) {
      share.status = 'downloaded';
    }
    
    return share;
  },

  async revokeSecureShare(this: any, id: string, revokedBy: string, reason: string) {
    const share = this.incidentSecureShares.find((s: any) => s.id === id);
    if (!share) return undefined;
    
    share.status = 'revoked';
    share.revokedBy = revokedBy;
    share.revokedAt = new Date().toISOString();
    share.revokeReason = reason;
    
    return share;
  },


  // ============ INCIDENT REPORTS ============
  
  async createIncidentReport(this: any, input: Parameters<ControlPlaneStore["createIncidentReport"]>[0]) {
    const incident = this.incidents.find((i: any) => i.id === input.incidentId);
    if (!incident) throw new Error('Incident not found');
    
    const reportNumber = `RPT-${incident.incidentNumber}-${input.reportType.toUpperCase()}-${String(this.incidentReports.filter((r: any) => r.incidentId === input.incidentId).length + 1).padStart(2, '0')}`;
    
    const report = {
      id: randomUUID(),
      incidentId: input.incidentId,
      reportNumber,
      reportType: input.reportType,
      status: 'draft' as const,
      executiveSummary: input.executiveSummary,
      detailedChronology: input.detailedChronology,
      findings: input.findings,
      rootCause: input.rootCause,
      controlFailures: input.controlFailures,
      correctiveActions: input.correctiveActions,
      preventiveActions: input.preventiveActions,
      recommendations: input.recommendations,
      conclusions: input.conclusions,
      unresolvedQuestions: input.unresolvedQuestions,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      reviewedBy: undefined,
      reviewedAt: undefined,
      approvedBy: undefined,
      approvedAt: undefined,
      finalizedAt: undefined,
      reportPath: undefined,
    };
    
    this.incidentReports.push(report);
    return report;
  },

  async listIncidentReports(this: any, incidentId: string) {
    return this.incidentReports.filter((r: any) => r.incidentId === incidentId);
  },

  async getIncidentReport(this: any, id: string) {
    return this.incidentReports.find((r: any) => r.id === id);
  },

  async updateIncidentReport(this: any, id: string, input: any) {
    const report = this.incidentReports.find((r: any) => r.id === id);
    if (!report) return undefined;
    
    Object.assign(report, input);
    return report;
  },

  async reviewIncidentReport(this: any, id: string, reviewedBy: string) {
    const report = this.incidentReports.find((r: any) => r.id === id);
    if (!report) return undefined;
    
    report.status = 'pending-review';
    report.reviewedBy = reviewedBy;
    report.reviewedAt = new Date().toISOString();
    
    return report;
  },

  async approveIncidentReport(this: any, id: string, approvedBy: string) {
    const report = this.incidentReports.find((r: any) => r.id === id);
    if (!report) return undefined;
    
    report.status = 'approved';
    report.approvedBy = approvedBy;
    report.approvedAt = new Date().toISOString();
    
    return report;
  },

  async finalizeIncidentReport(this: any, id: string, reportPath?: string) {
    const report = this.incidentReports.find((r: any) => r.id === id);
    if (!report) return undefined;
    
    report.status = 'final';
    report.finalizedAt = new Date().toISOString();
    report.reportPath = reportPath;
    
    return report;
  },


  // ============ DASHBOARD AND ANALYTICS ============
  
  async getIncidentsDashboard(this: any, tenantId: string, filters?: Parameters<ControlPlaneStore["getIncidentsDashboard"]>[1]) {
    let incidents = this.incidents.filter((i: any) => i.tenantId === tenantId);
    
    if (filters?.branchId) {
      incidents = incidents.filter((i: any) => i.branchId === filters.branchId);
    }
    if (filters?.from) {
      incidents = incidents.filter((i: any) => i.occurredAt >= filters.from!);
    }
    if (filters?.to) {
      incidents = incidents.filter((i: any) => i.occurredAt <= filters.to!);
    }
    
    const totalIncidents = incidents.length;
    const openIncidents = incidents.filter((i: any) => 
      !['closed', 'resolved', 'false-alarm'].includes(i.status)
    ).length;
    const criticalIncidents = incidents.filter((i: any) => i.severity === 'P1').length;
    
    // Count by type
    const incidentsByType: Record<string, number> = {};
    incidents.forEach((i: any) => {
      incidentsByType[i.incidentType] = (incidentsByType[i.incidentType] || 0) + 1;
    });
    
    // Count by severity
    const incidentsBySeverity: Record<string, number> = {};
    incidents.forEach((i: any) => {
      incidentsBySeverity[i.severity] = (incidentsBySeverity[i.severity] || 0) + 1;
    });
    
    // Count by status
    const incidentsByStatus: Record<string, number> = {};
    incidents.forEach((i: any) => {
      incidentsByStatus[i.status] = (incidentsByStatus[i.status] || 0) + 1;
    });
    
    // Calculate average resolution time
    const resolvedIncidents = incidents.filter((i: any) => i.closedAt);
    const averageResolutionHours = resolvedIncidents.length > 0
      ? resolvedIncidents.reduce((sum: number, i: any) => {
          const hours = (new Date(i.closedAt).getTime() - new Date(i.detectedAt).getTime()) / (1000 * 60 * 60);
          return sum + hours;
        }, 0) / resolvedIncidents.length
      : 0;
    
    const policeIntimationsCount = this.incidentPoliceIntimations.filter((p: any) => 
      incidents.some((i: any) => i.id === p.incidentId)
    ).length;
    
    const insuranceClaimsCount = this.incidentInsuranceClaims.filter((c: any) => 
      incidents.some((i: any) => i.id === c.incidentId)
    ).length;
    
    return {
      totalIncidents,
      openIncidents,
      criticalIncidents,
      incidentsByType,
      incidentsBySeverity,
      incidentsByStatus,
      averageResolutionHours: Math.round(averageResolutionHours * 10) / 10,
      policeIntimationsCount,
      insuranceClaimsCount,
    };
  },

  async getIncidentStatistics(this: any, tenantId: string, period: string) {
    // Simplified statistics for the specified period
    const now = new Date();
    let fromDate = new Date();
    
    switch (period) {
      case 'week':
        fromDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        fromDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        fromDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        fromDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        fromDate.setDate(now.getDate() - 30);
    }
    
    return this.getIncidentsDashboard.call(this, tenantId, {
      from: fromDate.toISOString(),
      to: now.toISOString(),
    });
  },
};

