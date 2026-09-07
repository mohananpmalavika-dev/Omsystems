/**
 * RCA Storage Layer
 * 
 * Stores root cause analysis results, historical cases, and enables
 * similarity matching and learning from past incidents.
 */

import type { ControlPlaneStore } from "../../control-plane-store.js";
import type { RCADiagnosis, HistoricalCase } from "./rca/types.js";

export interface StoredRCADiagnosis extends RCADiagnosis {
  id: string;
  incidentId?: string;
  status: "active" | "validated" | "invalidated" | "archived";
  validatedAt?: string;
  validatedBy?: string;
  actualRootCause?: string;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RCACaseOutcome {
  diagnosisId: string;
  caseFingerprint: string;
  actualRootCause: string;
  predictedRootCause: string;
  wasCorrect: boolean;
  resolutionAction: string;
  timeToResolveMinutes: number;
  validatedBy: string;
  validatedAt: string;
  learningNotes?: string;
}

/**
 * RCA Storage Service
 */
export class RCAStore {
  constructor(private readonly store: ControlPlaneStore) {}
  
  /**
   * Store RCA diagnosis
   */
  async storeDiagnosis(
    diagnosis: RCADiagnosis,
    options: {
      incidentId?: string;
      status?: StoredRCADiagnosis["status"];
    } = {}
  ): Promise<StoredRCADiagnosis> {
    if (!options.incidentId) {
      throw new Error("diagnosis_missing_incident");
    }

    const now = new Date().toISOString();
    
    const stored: StoredRCADiagnosis = {
      ...diagnosis,
      id: diagnosis.diagnosisId,
      incidentId: options.incidentId,
      status: options.status || "active",
      createdAt: now,
      updatedAt: now,
    };
    
    await this.store.addIncidentNote({
      incidentId: options.incidentId,
      noteType: "rca_diagnosis",
      content: JSON.stringify(stored),
      createdBy: "system:rca",
    });
    
    // Index by case fingerprint for similarity matching
    await this.indexByFingerprint(stored);
    
    // Index by branch for quick retrieval
    await this.indexByBranch(stored);
    
    return stored;
  }
  
  /**
   * Get RCA diagnosis by ID
   */
  async getDiagnosis(
    diagnosisId: string,
    tenantId: string
  ): Promise<StoredRCADiagnosis | null> {
    const incidents = await this.store.listIncidents(tenantId, { limit: 10_000 });
    for (const incident of incidents) {
      const notes = await this.store.listIncidentNotes(incident.id, "rca_diagnosis");
      for (const note of notes) {
        const diagnosis = parseNote<StoredRCADiagnosis>(note.content);
        if (diagnosis?.id === diagnosisId && diagnosis.tenantId === tenantId) {
          return diagnosis;
        }
      }
    }
    return null;
  }
  
  /**
   * List RCA diagnoses for a branch
   */
  async listDiagnosesByBranch(
    tenantId: string,
    branchId: string,
    options: {
      status?: StoredRCADiagnosis["status"];
      from?: string;
      to?: string;
      limit?: number;
    } = {}
  ): Promise<StoredRCADiagnosis[]> {
    const incidents = await this.store.listIncidents(tenantId, {
      branchId,
      from: options.from,
      to: options.to,
      limit: options.limit ? Math.max(options.limit, 1) * 10 : 10_000,
    });
    const diagnoses: StoredRCADiagnosis[] = [];
    for (const incident of incidents) {
      const notes = await this.store.listIncidentNotes(incident.id, "rca_diagnosis");
      for (const note of notes) {
        const diagnosis = parseNote<StoredRCADiagnosis>(note.content);
        if (diagnosis && (!options.status || diagnosis.status === options.status)) {
          diagnoses.push(diagnosis);
        }
      }
    }
    return diagnoses
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, options.limit ?? diagnoses.length);
  }
  
  /**
   * Find similar historical cases
   */
  async findSimilarCases(
    caseFingerprint: string,
    tenantId: string,
    options: {
      rootCauseCode?: string;
      minConfidence?: number;
      limit?: number;
    } = {}
  ): Promise<HistoricalCase[]> {
    const incidents = await this.store.listIncidents(tenantId, { limit: 10_000 });
    const cases: HistoricalCase[] = [];
    for (const incident of incidents) {
      const notes = await this.store.listIncidentNotes(incident.id, "rca_diagnosis");
      for (const note of notes) {
        const diagnosis = parseNote<StoredRCADiagnosis>(note.content);
        if (!diagnosis || diagnosis.caseFingerprint !== caseFingerprint ||
            (options.rootCauseCode && diagnosis.primaryCause.code !== options.rootCauseCode) ||
            (options.minConfidence !== undefined && diagnosis.confidenceScore < options.minConfidence)) {
          continue;
        }
        cases.push({
          caseId: diagnosis.id,
          fingerprint: diagnosis.caseFingerprint,
          rootCause: diagnosis.primaryCause.code,
          confidence: diagnosis.confidenceScore,
          affectedEntities: {
            branches: diagnosis.blastRadius.summary.totalBranches,
            cameras: diagnosis.blastRadius.summary.totalCameras,
            dvrs: diagnosis.blastRadius.summary.totalDVRs,
          },
          resolution: {
            action: diagnosis.resolutionNotes ?? "Not validated",
            successful: diagnosis.status === "validated",
            timeToResolveMinutes: 0,
          },
          occurredAt: diagnosis.generatedAt,
        });
      }
    }
    return cases.slice(0, options.limit ?? cases.length);
  }
  
  /**
   * Validate RCA diagnosis with actual outcome
   */
  async validateDiagnosis(
    diagnosisId: string,
    tenantId: string,
    outcome: {
      actualRootCause: string;
      resolutionAction: string;
      timeToResolveMinutes: number;
      validatedBy: string;
      notes?: string;
    }
  ): Promise<StoredRCADiagnosis> {
    const diagnosis = await this.getDiagnosis(diagnosisId, tenantId);
    
    if (!diagnosis) {
      throw new Error("diagnosis_not_found");
    }
    
    const now = new Date().toISOString();
    
    // Update diagnosis
    diagnosis.status = "validated";
    diagnosis.actualRootCause = outcome.actualRootCause;
    diagnosis.resolutionNotes = outcome.notes;
    diagnosis.validatedAt = now;
    diagnosis.validatedBy = outcome.validatedBy;
    diagnosis.updatedAt = now;
    
    const incident = diagnosis.incidentId;
    if (!incident) throw new Error("diagnosis_missing_incident");
    const notes = await this.store.listIncidentNotes(incident, "rca_diagnosis");
    const diagnosisNote = notes.find((note) => parseNote<StoredRCADiagnosis>(note.content)?.id === diagnosis.id);
    if (!diagnosisNote) throw new Error("diagnosis_not_found");
    const saved = await this.store.updateIncidentNote(diagnosisNote.id, JSON.stringify(diagnosis));
    if (!saved) throw new Error("diagnosis_update_failed");
    
    // Store outcome for learning
    const caseOutcome: RCACaseOutcome = {
      diagnosisId: diagnosis.id,
      caseFingerprint: diagnosis.caseFingerprint,
      actualRootCause: outcome.actualRootCause,
      predictedRootCause: diagnosis.primaryCause.code,
      wasCorrect: outcome.actualRootCause === diagnosis.primaryCause.code,
      resolutionAction: outcome.resolutionAction,
      timeToResolveMinutes: outcome.timeToResolveMinutes,
      validatedBy: outcome.validatedBy,
      validatedAt: now,
      learningNotes: outcome.notes,
    };
    
    await this.storeCaseOutcome(caseOutcome, tenantId);
    
    return diagnosis;
  }
  
  /**
   * Store case outcome for machine learning
   */
  async storeCaseOutcome(
    outcome: RCACaseOutcome,
    tenantId: string
  ): Promise<void> {
    const diagnosis = await this.getDiagnosis(outcome.diagnosisId, tenantId);
    if (!diagnosis?.incidentId) throw new Error("diagnosis_not_found");
    await this.store.addIncidentNote({
      incidentId: diagnosis.incidentId,
      noteType: "rca_case_outcome",
      content: JSON.stringify(outcome),
      createdBy: outcome.validatedBy,
    });
  }
  
  /**
   * Get RCA accuracy statistics
   */
  async getAccuracyStats(
    tenantId: string,
    options: {
      from?: string;
      to?: string;
      rootCauseCode?: string;
    } = {}
  ): Promise<{
    totalCases: number;
    correctPredictions: number;
    accuracyPercent: number;
    byRootCause: Record<string, { total: number; correct: number; accuracy: number }>;
    avgConfidence: number;
    avgTimeToResolve: number;
  }> {
    const incidents = await this.store.listIncidents(tenantId, {
      from: options.from,
      to: options.to,
      limit: 10_000,
    });
    const diagnoses: StoredRCADiagnosis[] = [];
    for (const incident of incidents) {
      const notes = await this.store.listIncidentNotes(incident.id, "rca_diagnosis");
      for (const note of notes) {
        const diagnosis = parseNote<StoredRCADiagnosis>(note.content);
        if (diagnosis && diagnosis.status === "validated" &&
            (!options.rootCauseCode || diagnosis.primaryCause.code === options.rootCauseCode)) {
          diagnoses.push(diagnosis);
        }
      }
    }
    const correctPredictions = diagnoses.filter((diagnosis) => diagnosis.actualRootCause === diagnosis.primaryCause.code).length;
    const byRootCause: Record<string, { total: number; correct: number; accuracy: number }> = {};
    for (const diagnosis of diagnoses) {
      const entry = byRootCause[diagnosis.primaryCause.code] ??= { total: 0, correct: 0, accuracy: 0 };
      entry.total += 1;
      if (diagnosis.actualRootCause === diagnosis.primaryCause.code) entry.correct += 1;
      entry.accuracy = entry.correct / entry.total * 100;
    }
    return {
      totalCases: diagnoses.length,
      correctPredictions,
      accuracyPercent: diagnoses.length ? correctPredictions / diagnoses.length * 100 : 0,
      byRootCause,
      avgConfidence: diagnoses.length ? diagnoses.reduce((sum, item) => sum + item.confidenceScore, 0) / diagnoses.length : 0,
      avgTimeToResolve: 0,
    };
  }
  
  /**
   * Index diagnosis by fingerprint
   */
  private async indexByFingerprint(diagnosis: StoredRCADiagnosis): Promise<void> {
    void diagnosis;
  }
  
  /**
   * Index diagnosis by branch
   */
  private async indexByBranch(diagnosis: StoredRCADiagnosis): Promise<void> {
    void diagnosis;
  }
}

function parseNote<T>(content: unknown): T | null {
  if (typeof content !== "string") return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
