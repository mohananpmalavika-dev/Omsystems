export interface IncidentSummaryOutput {
  id: string;
  incidentId: string;
  generatedAt: Date;
  summaryTitle: string;
  executiveSummary: string;
  severity: "P1" | "P2" | "P3" | "P4";
  timeframe: { startedAt: Date; durationMinutes: number };
  keyFindings: string[];
  immediateActionsTaken: string[];
  recommendedMitigations: string[];
  timeline: Array<{ timestamp: Date; event: string; source: string; severity: string }>;
  aiEngine: "LOCAL_DETERMINISTIC_RULES";
  cloudCost: 0;
}

/**
 * Incident summaries must be produced from persisted incident evidence by a
 * configured summarization provider. This service intentionally fails closed
 * until that provider is supplied; it never invents findings or actions.
 */
export class LocalIncidentSummaryService {
  async generateSummary(_options: {
    incidentId: string;
    branchId: string;
    branchName?: string;
    alertType?: string;
    rootCause?: string;
    startedAt?: Date;
    impactedCameras?: string[];
  }): Promise<IncidentSummaryOutput> {
    throw new Error("Incident summarization provider is not configured");
  }
}

export const localIncidentSummaryService = new LocalIncidentSummaryService();
