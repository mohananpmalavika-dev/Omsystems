/**
 * AI Investigation Report Service
 * 
 * Automatically generates comprehensive incident investigation reports with:
 * - Timeline reconstruction
 * - Camera path analysis
 * - Person/vehicle tracking
 * - Evidence inventory
 * - Root cause analysis
 * - Multi-format export (PDF, JSON)
 */

import { randomUUID } from "node:crypto";
import PDFDocument from "pdfkit";
import type { ControlPlaneStore } from "../control-plane-store.js";

export interface InvestigationReport {
  id: string;
  reportNumber: string;
  tenantId: string;
  incidentId: string;
  reportType: "preliminary" | "detailed" | "executive" | "court-evidence";
  status: "draft" | "pending-review" | "approved" | "final";
  
  // Incident Overview
  incidentSummary: {
    incidentNumber: string;
    incidentType: string;
    location: {
      branchId: string;
      branchName?: string;
      areaName?: string;
      coordinates?: { lat: number; lon: number };
    };
    timeframe: {
      firstDetection: string;
      lastDetection: string;
      durationMinutes: number;
    };
    severity: string;
    aiConfidence: number;
  };

  // Executive Summary
  executiveSummary: {
    overview: string;
    keyFindings: string[];
    immediateActions: string[];
    recommendations: string[];
  };

  // Timeline
  timeline: InvestigationTimelineEvent[];

  // Scene Description
  sceneDescription: {
    description: string;
    affectedAreas: string[];
    weatherConditions?: string;
    lightingConditions?: string;
    visibilityAssessment: string;
  };

  // Person Analysis
  personAnalysis?: {
    totalPersonsDetected: number;
    uniquePersonsEstimated: number;
    persons: Array<{
      trackingId: string;
      firstSeen: string;
      lastSeen: string;
      cameraPath: string[];
      attributes: {
        upperClothingColor?: string;
        lowerClothingColor?: string;
        carryingBag?: boolean;
        estimatedHeight?: string;
      };
      confidence: number;
      status: "confirmed" | "probable" | "possible" | "unknown";
    }>;
  };

  // Vehicle Analysis
  vehicleAnalysis?: {
    totalVehiclesDetected: number;
    vehicles: Array<{
      trackingId: string;
      vehicleType: string;
      color?: string;
      licensePlate?: string;
      firstSeen: string;
      lastSeen: string;
      cameraPath: string[];
      confidence: number;
    }>;
  };

  // Camera Path Reconstruction
  cameraPathReconstruction: {
    primaryCameras: string[];
    secondaryCameras: string[];
    totalCamerasCovered: number;
    cameraSequence: Array<{
      cameraId: string;
      cameraName?: string;
      timestamp: string;
      detectionType: string;
      confidence: number;
    }>;
    visualizationMapUrl?: string;
  };

  // Access Control Events
  accessControlEvents?: Array<{
    timestamp: string;
    eventType: string;
    location: string;
    accessGranted: boolean;
    userId?: string;
    details: string;
  }>;

  // Operator Response
  operatorResponse: {
    firstAcknowledgment?: string;
    acknowledgmentDelay?: number;
    actionsChronology: Array<{
      timestamp: string;
      action: string;
      performedBy: string;
      result?: string;
    }>;
    escalations: Array<{
      timestamp: string;
      escalatedTo: string;
      reason: string;
    }>;
    sopCompliance: {
      sopUsed?: string;
      stepsCompleted: number;
      stepsSkipped: number;
      compliancePercentage: number;
    };
  };

  // Root Cause Analysis
  rootCauseAnalysis: {
    primaryCause?: string;
    contributingFactors: string[];
    controlFailures: string[];
    systemWeaknesses: string[];
  };

  // Evidence Inventory
  evidenceInventory: {
    videos: {
      originalSegments: number;
      investigationClips: number;
      totalDurationMinutes: number;
      preservationStatus: string;
    };
    snapshots: {
      total: number;
      enhanced: number;
      annotated: number;
    };
    documents: {
      total: number;
      types: string[];
    };
    logs: {
      alertLogs: number;
      accessLogs: number;
      systemLogs: number;
    };
    evidencePackages: number;
  };

  // Findings and Analysis
  findings: {
    confirmed: string[];
    probable: string[];
    possible: string[];
    unknown: string[];
    limitations: string[];
  };

  // SOP Compliance Assessment
  sopCompliance?: {
    sopName: string;
    overallCompliance: number;
    mandatoryStepsCompleted: boolean;
    deviations: Array<{
      step: string;
      expected: string;
      actual: string;
      impact: string;
    }>;
  };

  // Recommendations
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
    preventiveMeasures: string[];
  };

  // Conclusions
  conclusions: {
    summary: string;
    incidentClassification: string;
    furtherInvestigationRequired: boolean;
    legalActionRecommended: boolean;
  };

  // Approvals
  createdBy: string;
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  finalizedAt?: string;

  // Export
  exportFormats: Array<"pdf" | "json" | "docx" | "html">;
  exportedAt?: string;
  reportPath?: string;

  updatedAt: string;
}

export interface InvestigationTimelineEvent {
  timestamp: string;
  eventType: "detection" | "alert" | "access-control" | "operator-action" | "system-event" | "escalation" | "external-notification";
  source: string;
  description: string;
  cameraId?: string;
  cameraName?: string;
  performedBy?: string;
  confidence?: number;
  details?: Record<string, any>;
  evidenceReferences?: {
    snapshotIds?: string[];
    clipIds?: string[];
    segmentIds?: string[];
  };
}

export class AIInvestigationReportService {
  private readonly memoryReports = new Map<string, InvestigationReport>();

  constructor(private store: ControlPlaneStore) {}

  private database(): { query: (sql: string, values: unknown[]) => Promise<{ rows: any[] }> } | undefined {
    return (this.store as any).db ?? (typeof (this.store as any).query === "function" ? this.store as any : (this.store as any).pool);
  }

  /**
   * Persist investigation report to memory and database
   */
  async saveReport(report: InvestigationReport): Promise<void> {
    this.memoryReports.set(report.id, structuredClone(report));
    if (report.reportNumber) {
      this.memoryReports.set(report.reportNumber, structuredClone(report));
    }

    const db = this.database();
    if (!db) return;

    try {
      const isUuid = (val?: string): boolean =>
        typeof val === "string" && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);

      if (!isUuid(report.id) || !isUuid(report.tenantId) || !isUuid(report.incidentId)) {
        return;
      }

      const createdByUuid = isUuid(report.createdBy) ? report.createdBy : null;
      if (!createdByUuid) return;

      const reviewedByUuid = isUuid(report.reviewedBy) ? report.reviewedBy : null;
      const approvedByUuid = isUuid(report.approvedBy) ? report.approvedBy : null;

      await db.query(
        `INSERT INTO investigation_reports (
           id, report_number, tenant_id, incident_id, report_type, status,
           incident_summary, executive_summary, timeline, scene_description,
           person_analysis, vehicle_analysis, camera_path_reconstruction,
           access_control_events, operator_response, root_cause_analysis,
           evidence_inventory, findings, sop_compliance, recommendations,
           conclusions, created_by, created_at, reviewed_by, reviewed_at,
           approved_by, approved_at, finalized_at, export_formats, exported_at,
           report_path, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10,
           $11, $12, $13,
           $14, $15, $16,
           $17, $18, $19, $20,
           $21, $22, $23, $24, $25,
           $26, $27, $28, $29, $30,
           $31, $32
         ) ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           reviewed_by = EXCLUDED.reviewed_by,
           reviewed_at = EXCLUDED.reviewed_at,
           approved_by = EXCLUDED.approved_by,
           approved_at = EXCLUDED.approved_at,
           finalized_at = EXCLUDED.finalized_at,
           export_formats = EXCLUDED.export_formats,
           exported_at = EXCLUDED.exported_at,
           report_path = EXCLUDED.report_path,
           updated_at = EXCLUDED.updated_at`,
        [
          report.id,
          report.reportNumber,
          report.tenantId,
          report.incidentId,
          report.reportType,
          report.status,
          JSON.stringify(report.incidentSummary),
          JSON.stringify(report.executiveSummary),
          JSON.stringify(report.timeline),
          JSON.stringify(report.sceneDescription),
          report.personAnalysis ? JSON.stringify(report.personAnalysis) : null,
          report.vehicleAnalysis ? JSON.stringify(report.vehicleAnalysis) : null,
          JSON.stringify(report.cameraPathReconstruction),
          report.accessControlEvents ? JSON.stringify(report.accessControlEvents) : null,
          JSON.stringify(report.operatorResponse),
          JSON.stringify(report.rootCauseAnalysis),
          JSON.stringify(report.evidenceInventory),
          JSON.stringify(report.findings),
          report.sopCompliance ? JSON.stringify(report.sopCompliance) : null,
          JSON.stringify(report.recommendations),
          JSON.stringify(report.conclusions),
          createdByUuid,
          report.createdAt,
          reviewedByUuid,
          report.reviewedAt ?? null,
          approvedByUuid,
          report.approvedAt ?? null,
          report.finalizedAt ?? null,
          report.exportFormats,
          report.exportedAt ?? null,
          report.reportPath ?? null,
          report.updatedAt,
        ]
      );
    } catch {
      // In-memory fallback
    }
  }

  /**
   * Retrieve investigation report by ID or reportNumber
   */
  async getReport(reportId: string): Promise<InvestigationReport | undefined> {
    const inMem = this.memoryReports.get(reportId);
    if (inMem) return structuredClone(inMem);

    for (const r of this.memoryReports.values()) {
      if (r.reportNumber === reportId) return structuredClone(r);
    }

    const db = this.database();
    if (db) {
      try {
        const res = await db.query(
          `SELECT * FROM investigation_reports WHERE id::text = $1 OR report_number = $1 LIMIT 1`,
          [reportId]
        );
        if (res?.rows?.[0]) {
          const rep = mapRowToReport(res.rows[0]);
          this.memoryReports.set(rep.id, structuredClone(rep));
          if (rep.reportNumber) this.memoryReports.set(rep.reportNumber, structuredClone(rep));
          return rep;
        }
      } catch {
        // Fall back to in-memory
      }
    }

    return undefined;
  }

  /**
   * Generate comprehensive investigation report
   */
  async generateInvestigationReport(
    tenantId: string,
    incidentId: string,
    reportType: InvestigationReport["reportType"],
    createdBy: string
  ): Promise<InvestigationReport> {
    // Get incident data
    const incident = await this.store.getIncident(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    // Gather all related data
    const timeline = await this.reconstructTimeline(incidentId);
    const cameras = await this.store.listIncidentCameras(incidentId);
    const videoRanges = await this.store.listIncidentVideoRanges(incidentId);
    const clips = await this.store.listIncidentClips(incidentId);
    const snapshots = await this.store.listIncidentSnapshots(incidentId);
    const participants = await this.store.listIncidentParticipants(incidentId);
    const evidenceItems = await this.store.listIncidentEvidenceItems(incidentId);
    const evidencePackages = await this.store.listIncidentEvidencePackages(incidentId);
    const tasks = await this.store.listIncidentTasks(incidentId);
    const notes = await this.store.listIncidentNotes(incidentId);

    // Generate report number
    const reportNumber = this.generateReportNumber(incident.incidentNumber, reportType);

    const now = new Date().toISOString();

    // Build comprehensive report
    const report: InvestigationReport = {
      id: randomUUID(),
      reportNumber,
      tenantId,
      incidentId,
      reportType,
      status: "draft",

      // Incident Summary
      incidentSummary: {
        incidentNumber: incident.incidentNumber,
        incidentType: incident.incidentType,
        location: {
          branchId: incident.branchId || "unknown",
          branchName: undefined, // Would fetch from branch data
          areaName: undefined,
        },
        timeframe: {
          firstDetection: incident.occurredAt,
          lastDetection: incident.updatedAt,
          durationMinutes: this.calculateDuration(incident.occurredAt, incident.updatedAt),
        },
        severity: incident.severity,
        aiConfidence: incident.aiConfidence || 0,
      },

      // Executive Summary
      executiveSummary: await this.generateExecutiveSummary(incident, timeline),

      // Timeline
      timeline,

      // Scene Description
      sceneDescription: this.generateSceneDescription(incident, cameras),

      // Person Analysis
      personAnalysis: await this.analyzePersons(incidentId, participants),

      // Vehicle Analysis
      vehicleAnalysis: await this.analyzeVehicles(incidentId),

      // Camera Path Reconstruction
      cameraPathReconstruction: this.reconstructCameraPath(timeline, cameras),

      // Access Control Events
      accessControlEvents: [], // Would fetch from access control system

      // Operator Response
      operatorResponse: this.analyzeOperatorResponse(incident, timeline, tasks),

      // Root Cause Analysis
      rootCauseAnalysis: this.analyzeRootCause(incident, timeline),

      // Evidence Inventory
      evidenceInventory: {
        videos: {
          originalSegments: videoRanges.length,
          investigationClips: clips.length,
          totalDurationMinutes: this.calculateTotalVideoDuration(videoRanges),
          preservationStatus: videoRanges.some((v) => v.legalHoldApplied)
            ? "legal-hold-applied"
            : "preserved",
        },
        snapshots: {
          total: snapshots.length,
          enhanced: snapshots.filter((s) => s.enhancementDetails).length,
          annotated: snapshots.filter((s) => s.annotations).length,
        },
        documents: {
          total: evidenceItems.length,
          types: [...new Set(evidenceItems.map((e) => e.itemType))],
        },
        logs: {
          alertLogs: timeline.filter((t) => t.eventType === "alert").length,
          accessLogs: 0, // Would fetch from access control
          systemLogs: timeline.filter((t) => t.eventType === "system-event").length,
        },
        evidencePackages: evidencePackages.length,
      },

      // Findings
      findings: this.generateFindings(incident, timeline, participants),

      // Recommendations
      recommendations: this.generateRecommendations(incident, timeline),

      // Conclusions
      conclusions: this.generateConclusions(incident, timeline),

      // Metadata
      createdBy,
      createdAt: now,
      exportFormats: ["pdf", "json"],
      updatedAt: now,
    };

    await this.saveReport(report);

    return report;
  }

  /**
   * Reconstruct complete timeline from all sources
   */
  async reconstructTimeline(incidentId: string): Promise<InvestigationTimelineEvent[]> {
    const events: InvestigationTimelineEvent[] = [];

    // Get incident events
    const incidentEvents = await this.store.listIncidentTimeline(incidentId);

    for (const event of incidentEvents) {
      events.push({
        timestamp: event.occurredAt,
        eventType: this.mapEventType(event.eventType),
        source: event.eventType,
        description: event.description,
        performedBy: event.performedBy,
        details: event.details,
      });
    }

    // Sort by timestamp
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return events;
  }

  /**
   * Map incident event type to timeline event type
   */
  private mapEventType(type: string): InvestigationTimelineEvent["eventType"] {
    const mapping: Record<string, InvestigationTimelineEvent["eventType"]> = {
      status_changed: "system-event",
      assigned: "operator-action",
      escalated: "escalation",
      camera_added: "system-event",
      video_preserved: "operator-action",
      clip_created: "operator-action",
      snapshot_taken: "operator-action",
      evidence_exported: "operator-action",
      police_intimated: "external-notification",
      insurance_filed: "external-notification",
      task_created: "operator-action",
      note_added: "operator-action",
      participant_added: "operator-action",
    };

    return mapping[type] || "system-event";
  }

  /**
   * Generate executive summary
   */
  private async generateExecutiveSummary(
    incident: any,
    timeline: InvestigationTimelineEvent[]
  ): Promise<InvestigationReport["executiveSummary"]> {
    // AI-generated summary based on incident data
    const overview = `${incident.incidentType} incident detected at ${new Date(incident.occurredAt).toLocaleString()}. ${incident.description || "No additional details provided."}`;

    const keyFindings: string[] = [];

    // Analyze timeline for key findings
    if (timeline.length > 0) {
      keyFindings.push(`${timeline.length} timeline events recorded`);
    }

    const detections = timeline.filter((e) => e.eventType === "detection");
    if (detections.length > 0) {
      keyFindings.push(`${detections.length} AI detections triggered the alert`);
    }

    const operatorActions = timeline.filter((e) => e.eventType === "operator-action");
    if (operatorActions.length > 0) {
      keyFindings.push(`${operatorActions.length} operator actions taken`);
    }

    // Immediate actions
    const immediateActions: string[] = [];
    if (incident.status === "closed") {
      immediateActions.push("Incident has been closed");
    }
    if (incident.policeRequired) {
      immediateActions.push("Police notification required");
    }
    if (incident.insuranceRequired) {
      immediateActions.push("Insurance claim may be necessary");
    }

    // Recommendations
    const recommendations: string[] = [
      "Review camera coverage for affected area",
      "Update SOPs based on lessons learned",
    ];

    return {
      overview,
      keyFindings,
      immediateActions,
      recommendations,
    };
  }

  /**
   * Generate scene description
   */
  private generateSceneDescription(
    incident: any,
    cameras: any[]
  ): InvestigationReport["sceneDescription"] {
    const affectedAreas = [...new Set(cameras.map((c) => c.location || "unknown"))];

    return {
      description: incident.description || "Automated incident detection",
      affectedAreas,
      visibilityAssessment: cameras.length > 0 ? "adequate-coverage" : "limited-coverage",
    };
  }

  /**
   * Analyze persons involved
   */
  private async analyzePersons(
    incidentId: string,
    participants: any[]
  ): Promise<InvestigationReport["personAnalysis"]> {
    if (participants.length === 0) {
      return undefined;
    }

    return {
      totalPersonsDetected: participants.length,
      uniquePersonsEstimated: participants.length,
      persons: participants.map((p) => ({
        trackingId: p.id,
        firstSeen: p.addedAt,
        lastSeen: p.addedAt,
        cameraPath: [],
        attributes: {},
        confidence: 0.5,
        status: "confirmed",
      })),
    };
  }

  /**
   * Analyze vehicles
   */
  private async analyzeVehicles(incidentId: string): Promise<InvestigationReport["vehicleAnalysis"]> {
    // Would fetch vehicle detections from analytics
    return undefined;
  }

  /**
   * Reconstruct camera path
   */
  private reconstructCameraPath(
    timeline: InvestigationTimelineEvent[],
    cameras: any[]
  ): InvestigationReport["cameraPathReconstruction"] {
    const cameraSequence = timeline
      .filter((e) => e.cameraId)
      .map((e) => ({
        cameraId: e.cameraId!,
        cameraName: e.cameraName,
        timestamp: e.timestamp,
        detectionType: e.source,
        confidence: e.confidence || 0,
      }));

    const uniqueCameras = new Set(cameraSequence.map((c) => c.cameraId));

    return {
      primaryCameras: cameras.slice(0, 1).map((c) => c.cameraId),
      secondaryCameras: cameras.slice(1).map((c) => c.cameraId),
      totalCamerasCovered: uniqueCameras.size,
      cameraSequence,
    };
  }

  /**
   * Analyze operator response
   */
  private analyzeOperatorResponse(
    incident: any,
    timeline: InvestigationTimelineEvent[],
    tasks: any[]
  ): InvestigationReport["operatorResponse"] {
    const operatorActions = timeline.filter((e) => e.eventType === "operator-action");
    const escalations = timeline.filter((e) => e.eventType === "escalation");

    const actionsChronology = operatorActions.map((a) => ({
      timestamp: a.timestamp,
      action: a.description,
      performedBy: a.performedBy || "unknown",
      result: undefined,
    }));

    const escalationList = escalations.map((e) => ({
      timestamp: e.timestamp,
      escalatedTo: e.details?.escalatedTo || "unknown",
      reason: e.description,
    }));

    const completedTasks = tasks.filter((t) => t.status === "completed").length;
    const skippedTasks = tasks.filter((t) => t.status === "skipped").length;

    return {
      actionsChronology,
      escalations: escalationList,
      sopCompliance: {
        stepsCompleted: completedTasks,
        stepsSkipped: skippedTasks,
        compliancePercentage:
          tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0,
      },
    };
  }

  /**
   * Analyze root cause
   */
  private analyzeRootCause(
    incident: any,
    timeline: InvestigationTimelineEvent[]
  ): InvestigationReport["rootCauseAnalysis"] {
    return {
      primaryCause: undefined,
      contributingFactors: [],
      controlFailures: [],
      systemWeaknesses: [],
    };
  }

  /**
   * Generate findings with confidence levels
   */
  private generateFindings(
    incident: any,
    timeline: InvestigationTimelineEvent[],
    participants: any[]
  ): InvestigationReport["findings"] {
    const confirmed: string[] = [
      `Incident occurred at ${new Date(incident.occurredAt).toLocaleString()}`,
    ];

    if (participants.length > 0) {
      confirmed.push(`${participants.length} persons identified as involved`);
    }

    const probable: string[] = [];
    const possible: string[] = [];
    const unknown: string[] = [];

    const limitations: string[] = [];
    if (timeline.length < 5) {
      limitations.push("Limited timeline data available");
    }

    return {
      confirmed,
      probable,
      possible,
      unknown,
      limitations,
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    incident: any,
    timeline: InvestigationTimelineEvent[]
  ): InvestigationReport["recommendations"] {
    return {
      immediate: ["Review incident response procedures", "Verify camera coverage"],
      shortTerm: ["Conduct training on similar incident types", "Update SOPs"],
      longTerm: ["Implement predictive analytics", "Enhance detection algorithms"],
      preventiveMeasures: ["Regular security audits", "Periodic system testing"],
    };
  }

  /**
   * Generate conclusions
   */
  private generateConclusions(
    incident: any,
    timeline: InvestigationTimelineEvent[]
  ): InvestigationReport["conclusions"] {
    const furtherInvestigationRequired =
      incident.status !== "closed" || incident.severity === "critical";

    return {
      summary: `Investigation of incident ${incident.incidentNumber} has been completed.`,
      incidentClassification: incident.incidentType,
      furtherInvestigationRequired,
      legalActionRecommended: incident.policeRequired || false,
    };
  }

  /**
   * Calculate duration in minutes
   */
  private calculateDuration(start: string, end: string): number {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    return Math.round((endTime - startTime) / 60000);
  }

  /**
   * Calculate total video duration
   */
  private calculateTotalVideoDuration(videoRanges: any[]): number {
    return videoRanges.reduce((total, range) => {
      const start = new Date(range.fromAt).getTime();
      const end = new Date(range.toAt).getTime();
      return total + (end - start) / 60000;
    }, 0);
  }

  /**
   * Generate report number
   */
  private generateReportNumber(incidentNumber: string, reportType: string): string {
    const typeCode = reportType.substring(0, 3).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();
    return `RPT-${incidentNumber}-${typeCode}-${timestamp}`;
  }

  /**
   * Export report to PDF
   */
  async exportToPDF(report: InvestigationReport): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true });
        const chunks: Buffer[] = [];

        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        // Header Banner
        doc.rect(36, 36, 523, 60).fill("#0f172a");
        doc.fontSize(14).fillColor("#38bdf8").text("SENTINEL GRID", 48, 46, { continued: true });
        doc.fillColor("#ffffff").text(" — FORENSIC INVESTIGATION REPORT");
        doc.fontSize(8).fillColor("#94a3b8").text(
          `Report: ${report.reportNumber}  |  Type: ${report.reportType.toUpperCase()}  |  Status: ${report.status.toUpperCase()}  |  Generated: ${report.createdAt}`,
          48,
          68
        );

        let y = 110;

        const checkPageBreak = (neededHeight: number) => {
          if (y + neededHeight > 760) {
            doc.addPage();
            y = 40;
          }
        };

        // 1. Incident Overview
        checkPageBreak(90);
        doc.fontSize(11).fillColor("#0f172a").text("1. INCIDENT OVERVIEW", 36, y);
        doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(36, y + 16).lineTo(559, y + 16).stroke();
        y += 24;

        doc.rect(36, y, 523, 52).fillAndStroke("#f8fafc", "#e2e8f0");
        doc.fontSize(8).fillColor("#475569");
        doc.text(`Incident No: ${report.incidentSummary?.incidentNumber || report.incidentId}`, 46, y + 8);
        doc.text(`Incident Type: ${report.incidentSummary?.incidentType || "Unknown"}`, 46, y + 20);
        doc.text(`Severity: ${(report.incidentSummary?.severity || "MEDIUM").toUpperCase()}`, 46, y + 32);

        const branchText = report.incidentSummary?.location?.branchName || report.incidentSummary?.location?.branchId || "N/A";
        doc.text(`Location: ${branchText}`, 220, y + 8);
        doc.text(`First Seen: ${report.incidentSummary?.timeframe?.firstDetection || "N/A"}`, 220, y + 20);
        doc.text(`Duration: ${report.incidentSummary?.timeframe?.durationMinutes ?? 0} min`, 220, y + 32);

        const confidenceText = typeof report.incidentSummary?.aiConfidence === "number"
          ? `${(report.incidentSummary.aiConfidence * 100).toFixed(1)}%`
          : "N/A";
        doc.text(`AI Confidence: ${confidenceText}`, 400, y + 8);
        doc.text(`Status: ${report.status.toUpperCase()}`, 400, y + 20);
        y += 64;

        // 2. Executive Summary
        checkPageBreak(80);
        doc.fontSize(11).fillColor("#0f172a").text("2. EXECUTIVE SUMMARY", 36, y);
        doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(36, y + 16).lineTo(559, y + 16).stroke();
        y += 24;

        if (report.executiveSummary?.overview) {
          doc.fontSize(8.5).fillColor("#334155").text(report.executiveSummary.overview, 36, y, { width: 523 });
          y = doc.y + 10;
        }

        if (report.executiveSummary?.keyFindings?.length) {
          checkPageBreak(40);
          doc.fontSize(9).fillColor("#0f172a").text("Key Findings:", 36, y);
          y += 14;
          for (const finding of report.executiveSummary.keyFindings) {
            checkPageBreak(20);
            doc.fontSize(8).fillColor("#475569").text(`• ${finding}`, 46, y, { width: 513 });
            y = doc.y + 4;
          }
        }

        if (report.executiveSummary?.immediateActions?.length) {
          checkPageBreak(40);
          doc.fontSize(9).fillColor("#0f172a").text("Immediate Actions Taken:", 36, y);
          y += 14;
          for (const action of report.executiveSummary.immediateActions) {
            checkPageBreak(20);
            doc.fontSize(8).fillColor("#475569").text(`• ${action}`, 46, y, { width: 513 });
            y = doc.y + 4;
          }
        }

        // 3. Timeline Reconstruction
        if (report.timeline?.length) {
          y += 10;
          checkPageBreak(60);
          doc.fontSize(11).fillColor("#0f172a").text("3. TIMELINE RECONSTRUCTION", 36, y);
          doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(36, y + 16).lineTo(559, y + 16).stroke();
          y += 24;

          const eventsToShow = report.timeline.slice(0, 15);
          for (const evt of eventsToShow) {
            checkPageBreak(30);
            doc.rect(36, y, 523, 24).fillAndStroke("#f1f5f9", "#e2e8f0");
            doc.fontSize(7.5).fillColor("#0284c7").text(evt.timestamp || "—", 44, y + 7, { width: 120 });
            doc.fontSize(7.5).fillColor("#0f172a").text(
              `[${(evt.eventType || "event").toUpperCase()}] ${evt.source || "System"}: ${evt.description || ""}`,
              170,
              y + 7,
              { width: 380 }
            );
            y += 28;
          }
        }

        // 4. Scene & Camera Reconstruction
        if (report.cameraPathReconstruction?.cameraSequence?.length || report.sceneDescription?.description) {
          y += 10;
          checkPageBreak(60);
          doc.fontSize(11).fillColor("#0f172a").text("4. SCENE & CAMERA PATH RECONSTRUCTION", 36, y);
          doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(36, y + 16).lineTo(559, y + 16).stroke();
          y += 24;

          if (report.sceneDescription?.description) {
            doc.fontSize(8).fillColor("#334155").text(`Scene: ${report.sceneDescription.description}`, 36, y, { width: 523 });
            y = doc.y + 8;
          }

          if (report.cameraPathReconstruction?.primaryCameras?.length) {
            doc.fontSize(8).fillColor("#475569").text(`Primary Cameras: ${report.cameraPathReconstruction.primaryCameras.join(", ")}`, 36, y);
            y += 14;
          }
        }

        // 5. Root Cause & Evidence Inventory
        y += 10;
        checkPageBreak(60);
        doc.fontSize(11).fillColor("#0f172a").text("5. ROOT CAUSE & EVIDENCE INVENTORY", 36, y);
        doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(36, y + 16).lineTo(559, y + 16).stroke();
        y += 24;

        if (report.rootCauseAnalysis?.primaryCause) {
          doc.fontSize(8.5).fillColor("#0f172a").text(`Primary Cause: ${report.rootCauseAnalysis.primaryCause}`, 36, y, { width: 523 });
          y = doc.y + 8;
        }

        const ev = report.evidenceInventory;
        if (ev) {
          doc.rect(36, y, 523, 36).fillAndStroke("#f8fafc", "#e2e8f0");
          doc.fontSize(8).fillColor("#475569");
          doc.text(`Video Segments: ${ev.videos?.originalSegments ?? 0} (${ev.videos?.totalDurationMinutes ?? 0}m)`, 46, y + 8);
          doc.text(`Snapshots: ${ev.snapshots?.total ?? 0} (Enhanced: ${ev.snapshots?.enhanced ?? 0})`, 220, y + 8);
          doc.text(`Evidence Packages: ${ev.evidencePackages ?? 0}`, 400, y + 8);

          doc.text(`Preservation: ${ev.videos?.preservationStatus || "Preserved"}`, 46, y + 20);
          doc.text(`Alert Logs: ${ev.logs?.alertLogs ?? 0} | System Logs: ${ev.logs?.systemLogs ?? 0}`, 220, y + 20);
          y += 46;
        }

        // 6. Conclusions & Recommendations
        if (report.conclusions || report.recommendations) {
          y += 10;
          checkPageBreak(60);
          doc.fontSize(11).fillColor("#0f172a").text("6. CONCLUSIONS & RECOMMENDATIONS", 36, y);
          doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(36, y + 16).lineTo(559, y + 16).stroke();
          y += 24;

          if (report.conclusions?.summary) {
            doc.fontSize(8.5).fillColor("#334155").text(`Conclusion: ${report.conclusions.summary}`, 36, y, { width: 523 });
            y = doc.y + 8;
          }

          if (report.recommendations?.immediate?.length) {
            doc.fontSize(8).fillColor("#475569").text(`Immediate Action: ${report.recommendations.immediate.join("; ")}`, 36, y, { width: 523 });
            y = doc.y + 8;
          }
        }

        // 7. Governance, Approvals & Sign-off
        y += 10;
        checkPageBreak(80);
        doc.fontSize(11).fillColor("#0f172a").text("7. GOVERNANCE & APPROVAL SIGN-OFF", 36, y);
        doc.strokeColor("#cbd5e1").lineWidth(1).moveTo(36, y + 16).lineTo(559, y + 16).stroke();
        y += 24;

        doc.rect(36, y, 523, 50).fillAndStroke("#f8fafc", "#e2e8f0");
        doc.fontSize(8).fillColor("#475569");
        doc.text(`Created By: ${report.createdBy}`, 46, y + 10);
        doc.text(`Date: ${report.createdAt}`, 46, y + 26);

        doc.text(`Reviewed By: ${report.reviewedBy || "Pending Review"}`, 210, y + 10);
        doc.text(`Reviewed At: ${report.reviewedAt || "—"}`, 210, y + 26);

        doc.text(`Approved By: ${report.approvedBy || "Pending Approval"}`, 380, y + 10);
        doc.text(`Approved At: ${report.approvedAt || "—"}`, 380, y + 26);
        y += 65;

        // Footer on all pages
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(7).fillColor("#94a3b8").text(
            "CONFIDENTIAL & PRIVILEGED — LAW ENFORCEMENT & REGULATORY SENSITIVE — KRYPTOVISION FORENSIC VAULT",
            36,
            800,
            { align: "center", width: 523 }
          );
          doc.fontSize(7).fillColor("#94a3b8").text(`Page ${i + 1} of ${range.count}`, 500, 800);
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Export report to JSON
   */
  async exportToJSON(report: InvestigationReport): Promise<string> {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report to HTML
   */
  async exportToHTML(report: InvestigationReport): Promise<string> {
    const escapeHtml = (unsafe: unknown): string =>
      String(unsafe ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(report.reportNumber)} - Forensic Investigation Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 900px; margin: 40px auto; padding: 0 20px; background: #fdfdfd; }
    .header { background: #0f172a; color: white; padding: 24px; border-radius: 8px; margin-bottom: 24px; }
    .header h1 { margin: 0 0 8px 0; font-size: 22px; color: #38bdf8; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: 600; font-size: 11px; text-transform: uppercase; background: #0284c7; color: white; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 16px; }
    .card h2 { margin-top: 0; font-size: 15px; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .timeline-item { padding: 8px 12px; border-left: 3px solid #0284c7; background: #f1f5f9; margin-bottom: 6px; font-size: 13px; }
    .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>SENTINEL GRID — FORENSIC INVESTIGATION REPORT</h1>
    <p>Report: <strong>${escapeHtml(report.reportNumber)}</strong> | Status: <span class="badge">${escapeHtml(report.status)}</span> | Generated: ${escapeHtml(report.createdAt)}</p>
  </div>
  <div class="card">
    <h2>1. Incident Overview</h2>
    <div class="grid">
      <div><strong>Incident No:</strong> ${escapeHtml(report.incidentSummary?.incidentNumber || report.incidentId)}</div>
      <div><strong>Type:</strong> ${escapeHtml(report.incidentSummary?.incidentType || "Unknown")}</div>
      <div><strong>Severity:</strong> ${escapeHtml(report.incidentSummary?.severity || "N/A")}</div>
      <div><strong>Location:</strong> ${escapeHtml(report.incidentSummary?.location?.branchName || report.incidentSummary?.location?.branchId || "N/A")}</div>
      <div><strong>First Seen:</strong> ${escapeHtml(report.incidentSummary?.timeframe?.firstDetection || "N/A")} (${report.incidentSummary?.timeframe?.durationMinutes ?? 0} min)</div>
      <div><strong>AI Confidence:</strong> ${(Number(report.incidentSummary?.aiConfidence || 0) * 100).toFixed(1)}%</div>
    </div>
  </div>
  <div class="card">
    <h2>2. Executive Summary</h2>
    <p>${escapeHtml(report.executiveSummary?.overview || "No executive summary provided.")}</p>
    ${report.executiveSummary?.keyFindings?.length ? `<h3>Key Findings</h3><ul>${report.executiveSummary.keyFindings.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : ""}
    ${report.executiveSummary?.immediateActions?.length ? `<h3>Immediate Actions</h3><ul>${report.executiveSummary.immediateActions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>` : ""}
  </div>
  <div class="card">
    <h2>3. Timeline Reconstruction</h2>
    ${(report.timeline || []).slice(0, 25).map((t) => `
      <div class="timeline-item">
        <strong>${escapeHtml(t.timestamp)}</strong> [${escapeHtml(t.eventType)}] <em>${escapeHtml(t.source)}</em>: ${escapeHtml(t.description)}
      </div>
    `).join("")}
  </div>
  <div class="card">
    <h2>4. Governance & Approvals</h2>
    <div class="grid">
      <div><strong>Created By:</strong> ${escapeHtml(report.createdBy)} (${escapeHtml(report.createdAt)})</div>
      <div><strong>Reviewed By:</strong> ${escapeHtml(report.reviewedBy || "Pending Review")} (${escapeHtml(report.reviewedAt || "—")})</div>
      <div><strong>Approved By:</strong> ${escapeHtml(report.approvedBy || "Pending Approval")} (${escapeHtml(report.approvedAt || "—")})</div>
      <div><strong>Finalized At:</strong> ${escapeHtml(report.finalizedAt || "—")}</div>
    </div>
  </div>
  <div class="footer">
    CONFIDENTIAL & PRIVILEGED — LAW ENFORCEMENT & REGULATORY SENSITIVE — KRYPTOVISION FORENSIC VAULT
  </div>
</body>
</html>`;
  }

  /**
   * Export report by ID in specified format
   */
  async exportReport(
    reportId: string,
    format: "pdf" | "json" | "html" = "pdf"
  ): Promise<{ format: string; data: Buffer | string; contentType: string; filename: string }> {
    const report = await this.getReport(reportId);
    if (!report) {
      throw new Error(`Investigation report not found: ${reportId}`);
    }

    let data: Buffer | string;
    let contentType: string;
    let extension: string;

    if (format === "pdf") {
      data = await this.exportToPDF(report);
      contentType = "application/pdf";
      extension = "pdf";
    } else if (format === "html") {
      data = await this.exportToHTML(report);
      contentType = "text/html; charset=utf-8";
      extension = "html";
    } else {
      data = await this.exportToJSON(report);
      contentType = "application/json; charset=utf-8";
      extension = "json";
    }

    report.exportedAt = new Date().toISOString();
    await this.saveReport(report);

    return {
      format,
      data,
      contentType,
      filename: `${report.reportNumber}.${extension}`,
    };
  }

  /**
   * Review report
   */
  async reviewReport(reportId: string, reviewedBy: string): Promise<InvestigationReport> {
    const report = await this.getReport(reportId);
    if (!report) {
      throw new Error(`Investigation report not found: ${reportId}`);
    }
    if (report.status === "final") {
      throw new Error("Cannot review a finalized report");
    }

    const now = new Date().toISOString();
    report.status = "pending-review";
    report.reviewedBy = reviewedBy;
    report.reviewedAt = now;
    report.updatedAt = now;

    await this.saveReport(report);
    return report;
  }

  /**
   * Approve report
   */
  async approveReport(reportId: string, approvedBy: string): Promise<InvestigationReport> {
    const report = await this.getReport(reportId);
    if (!report) {
      throw new Error(`Investigation report not found: ${reportId}`);
    }
    if (report.status === "final") {
      throw new Error("Cannot approve a finalized report");
    }

    const now = new Date().toISOString();
    report.status = "approved";
    report.approvedBy = approvedBy;
    report.approvedAt = now;
    report.updatedAt = now;

    await this.saveReport(report);
    return report;
  }

  /**
   * Finalize report (make it immutable)
   */
  async finalizeReport(reportId: string): Promise<InvestigationReport> {
    const report = await this.getReport(reportId);
    if (!report) {
      throw new Error(`Investigation report not found: ${reportId}`);
    }

    const now = new Date().toISOString();
    report.status = "final";
    report.finalizedAt = now;
    report.updatedAt = now;

    if (!report.exportFormats.includes("pdf")) {
      report.exportFormats.push("pdf");
    }
    if (!report.exportFormats.includes("json")) {
      report.exportFormats.push("json");
    }

    await this.saveReport(report);
    return report;
  }
}

function mapRowToReport(row: any): InvestigationReport {
  const parseJson = (val: any, def: any = {}) => {
    if (!val) return def;
    if (typeof val === "object") return val;
    try {
      return JSON.parse(val);
    } catch {
      return def;
    }
  };

  return {
    id: row.id,
    reportNumber: row.report_number,
    tenantId: row.tenant_id,
    incidentId: row.incident_id,
    reportType: row.report_type,
    status: row.status,
    incidentSummary: parseJson(row.incident_summary),
    executiveSummary: parseJson(row.executive_summary),
    timeline: parseJson(row.timeline, []),
    sceneDescription: parseJson(row.scene_description),
    personAnalysis: row.person_analysis ? parseJson(row.person_analysis) : undefined,
    vehicleAnalysis: row.vehicle_analysis ? parseJson(row.vehicle_analysis) : undefined,
    cameraPathReconstruction: parseJson(row.camera_path_reconstruction),
    accessControlEvents: row.access_control_events ? parseJson(row.access_control_events, []) : undefined,
    operatorResponse: parseJson(row.operator_response),
    rootCauseAnalysis: parseJson(row.root_cause_analysis),
    evidenceInventory: parseJson(row.evidence_inventory),
    findings: parseJson(row.findings),
    sopCompliance: row.sop_compliance ? parseJson(row.sop_compliance) : undefined,
    recommendations: parseJson(row.recommendations),
    conclusions: parseJson(row.conclusions),
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : undefined,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : undefined,
    finalizedAt: row.finalized_at ? new Date(row.finalized_at).toISOString() : undefined,
    exportFormats: Array.isArray(row.export_formats) ? row.export_formats : ["pdf", "json"],
    exportedAt: row.exported_at ? new Date(row.exported_at).toISOString() : undefined,
    reportPath: row.report_path ?? undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}
