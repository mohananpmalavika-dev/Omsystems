export interface IncidentData {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  cameraId?: string;
  location?: string;
  metadata?: Record<string, any>;
  relatedIncidents?: string[];
  systemLogs?: string[];
}

export interface RootCauseAnalysis {
  incidentId: string;
  timestamp: string;
  rootCause: string;
  contributingFactors: string[];
  remediationSteps: string[];
  preventiveMeasures: string[];
  confidence: number | null;
  heuristicScore?: number;
  provenance?: 'LIVE_INFERENCE' | 'HEURISTIC_RULE_ENGINE';
  status?: 'SUCCESS' | 'INFERENCE_FAILED';
  rawAnalysis: string;
}

