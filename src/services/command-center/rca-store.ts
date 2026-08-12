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
    const now = new Date().toISOString();
    
    const stored: StoredRCADiagnosis = {
      ...diagnosis,
      id: diagnosis.diagnosisId,
      incidentId: options.incidentId,
      status: options.status || "active",
      createdAt: now,
      updatedAt: now,
    };
    
    // Store in database
    // Note: This would require a new table schema in your database
    // For now, we'll use the control plane store's generic storage
    await this.store.setMetadata(
      `rca:diagnosis:${stored.id}`,
      stored.tenantId,
      stored
    );
    
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
    const result = await this.store.getMetadata(
      `rca:diagnosis:${diagnosisId}`,
      tenantId
    );
    
    return result as StoredRCADiagnosis | null;
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
    // This would be a database query in production
    // For now, retrieve from index
    const indexKey = `rca:index:branch:${tenantId}:${branchId}`;
    const index = (await this.store.getMetadata(indexKey, tenantId)) as string[] | null;
    
    if (!index) return [];
    
    const diagnoses: StoredRCADiagnosis[] = [];
    
    for (const diagnosisId of index.slice(0, options.limit || 50)) {
      const diagnosis = await this.getDiagnosis(diagnosisId, tenantId);
      
      if (!diagnosis) continue;
      
      // Filter by status
      if (options.status && diagnosis.status !== options.status) continue;
      
      // Filter by time range
      if (options.from && diagnosis.generatedAt < options.from) continue;
      if (options.to && diagnosis.generatedAt > options.to) continue;
      
      diagnoses.push(diagnosis);
    }
    
    return diagnoses;
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
    // Query diagnoses with similar fingerprints
    const fingerprintIndex = `rca:index:fingerprint:${tenantId}`;
    const fingerprintMap = (await this.store.getMetadata(fingerprintIndex, tenantId)) as Record<string, string[]> | null;
    
    if (!fingerprintMap) return [];
    
    const similarCases: HistoricalCase[] = [];
    
    // Find cases with matching or similar fingerprints
    for (const [fingerprint, diagnosisIds] of Object.entries(fingerprintMap)) {
      // Simple similarity: first 12 characters match
      if (fingerprint.slice(0, 12) !== caseFingerprint.slice(0, 12)) continue;
      
      for (const diagnosisId of diagnosisIds) {
        const diagnosis = await this.getDiagnosis(diagnosisId, tenantId);
        
        if (!diagnosis) continue;
        if (diagnosis.status !== "validated") continue;
        
        // Filter by root cause if specified
        if (options.rootCauseCode && diagnosis.primaryCause.code !== options.rootCauseCode) continue;
        
        // Filter by confidence
        if (options.minConfidence && diagnosis.confidenceScore < options.minConfidence) continue;
        
        // Convert to historical case
        const historicalCase: HistoricalCase = {
          caseId: diagnosis.id,
          fingerprint: diagnosis.caseFingerprint,
          rootCause: diagnosis.actualRootCause || diagnosis.primaryCause.code,
          confidence: diagnosis.confidenceScore,
          affectedEntities: {
            branches: diagnosis.blastRadius.summary.totalBranches,
            cameras: diagnosis.blastRadius.summary.totalCameras,
            dvrs: diagnosis.blastRadius.summary.totalDVRs,
          },
          resolution: {
            action: diagnosis.resolutionNotes || "Resolved",
            successful: diagnosis.status === "validated",
            timeToResolveMinutes: 0, // Would be calculated from timestamps
          },
          occurredAt: diagnosis.generatedAt,
          resolvedAt: diagnosis.validatedAt,
        };
        
        similarCases.push(historicalCase);
        
        if (similarCases.length >= (options.limit || 10)) break;
      }
      
      if (similarCases.length >= (options.limit || 10)) break;
    }
    
    return similarCases;
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
    
    // Store updated diagnosis
    await this.store.setMetadata(
      `rca:diagnosis:${diagnosis.id}`,
      tenantId,
      diagnosis
    );
    
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
    // Store outcome
    await this.store.setMetadata(
      `rca:outcome:${outcome.diagnosisId}`,
      tenantId,
      outcome
    );
    
    // Index by fingerprint for pattern learning
    // TODO: Implement proper metadata storage in ControlPlaneStore
    // const outcomeIndexKey = `rca:index:outcomes:${tenantId}`;
    // const outcomeIndex = (await this.store.getMetadata(outcomeIndexKey, tenantId)) as RCACaseOutcome[] | null || [];
    // outcomeIndex.push(outcome);
    // if (outcomeIndex.length > 1000) {
    //   outcomeIndex.shift();
    // }
    // await this.store.setMetadata(outcomeIndexKey, tenantId, outcomeIndex);
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
    // TODO: Implement proper metadata storage in ControlPlaneStore
    const outcomes: RCACaseOutcome[] = []; // Placeholder - would fetch from metadata storage
    
    // Filter outcomes
    const filtered = outcomes.filter(outcome => {
      if (options.from && outcome.validatedAt < options.from) return false;
      if (options.to && outcome.validatedAt > options.to) return false;
      if (options.rootCauseCode && outcome.predictedRootCause !== options.rootCauseCode) return false;
      return true;
    });
    
    if (filtered.length === 0) {
      return {
        totalCases: 0,
        correctPredictions: 0,
        accuracyPercent: 0,
        byRootCause: {},
        avgConfidence: 0,
        avgTimeToResolve: 0,
      };
    }
    
    const correct = filtered.filter(o => o.wasCorrect).length;
    const accuracy = (correct / filtered.length) * 100;
    
    // Calculate by root cause
    const byRootCause: Record<string, { total: number; correct: number; accuracy: number }> = {};
    
    for (const outcome of filtered) {
      if (!byRootCause[outcome.predictedRootCause]) {
        byRootCause[outcome.predictedRootCause] = { total: 0, correct: 0, accuracy: 0 };
      }
      
      byRootCause[outcome.predictedRootCause]!.total++;
      if (outcome.wasCorrect) {
        byRootCause[outcome.predictedRootCause]!.correct++;
      }
    }
    
    // Calculate accuracy per root cause
    for (const stats of Object.values(byRootCause)) {
      stats.accuracy = (stats.correct / stats.total) * 100;
    }
    
    // Calculate average time to resolve
    const avgTimeToResolve = filtered.reduce((sum, o) => sum + o.timeToResolveMinutes, 0) / filtered.length;
    
    return {
      totalCases: filtered.length,
      correctPredictions: correct,
      accuracyPercent: Math.round(accuracy * 100) / 100,
      byRootCause,
      avgConfidence: 0, // Would need to fetch diagnoses to calculate
      avgTimeToResolve: Math.round(avgTimeToResolve),
    };
  }
  
  /**
   * Index diagnosis by fingerprint
   */
  private async indexByFingerprint(diagnosis: StoredRCADiagnosis): Promise<void> {
    // TODO: Implement proper metadata storage in ControlPlaneStore
    // const indexKey = `rca:index:fingerprint:${diagnosis.tenantId}`;
    // const index = (await this.store.getMetadata(indexKey, diagnosis.tenantId)) as Record<string, string[]> | null || {};
    // if (!index[diagnosis.caseFingerprint]) {
    //   index[diagnosis.caseFingerprint] = [];
    // }
    // index[diagnosis.caseFingerprint]!.push(diagnosis.id);
    // await this.store.setMetadata(indexKey, diagnosis.tenantId, index);
  }
  
  /**
   * Index diagnosis by branch
   */
  private async indexByBranch(diagnosis: StoredRCADiagnosis): Promise<void> {
    // TODO: Implement proper metadata storage in ControlPlaneStore
    // const indexKey = `rca:index:branch:${diagnosis.tenantId}:${diagnosis.branchId}`;
    // const index = (await this.store.getMetadata(indexKey, diagnosis.tenantId)) as string[] | null || [];
    // index.unshift(diagnosis.id); // Most recent first
    // if (index.length > 100) {
    //   index.pop();
    // }
    // await this.store.setMetadata(indexKey, diagnosis.tenantId, index);
  }
}
