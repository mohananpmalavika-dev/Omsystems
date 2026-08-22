/**
 * AI Security Commander - Investigation Types
 * 
 * Investigations are structured collections of incidents, events,
 * and evidence created to answer security queries.
 */

import type { SecuritySeverity } from './security-event.types.js';
import type { Incident, IncidentSummary, AssetReference } from './incident.types.js';

/**
 * Investigation status
 */
export type InvestigationStatus =
  | 'open'
  | 'investigating'
  | 'awaiting_evidence'
  | 'resolved'
  | 'dismissed'
  | 'archived';

/**
 * Investigation priority
 */
export type InvestigationPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Investigation scope
 */
export interface InvestigationScope {
  type: 'enterprise' | 'region' | 'branch' | 'zone' | 'custom';
  enterpriseId?: string;
  regionId?: string;
  branchId?: string;
  branchIds?: string[];
  zoneId?: string;
  zoneIds?: string[];
  cameraIds?: string[];
}

/**
 * Timeline entry
 */
export interface TimelineEntry {
  /** Unique timeline entry ID */
  id: string;

  /** Timestamp of the entry */
  timestamp: Date;

  /** Entry type */
  type: 'event' | 'incident' | 'action' | 'note' | 'hypothesis';

  /** Title/summary */
  title: string;

  /** Description */
  description: string;

  /** Related event ID */
  eventId?: string;

  /** Related incident ID */
  incidentId?: string;

  /** Severity */
  severity?: SecuritySeverity;

  /** Asset references */
  assets?: AssetReference[];

  /** Evidence IDs */
  evidenceIds?: string[];

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Evidence item
 */
export interface Evidence {
  /** Unique evidence ID */
  id: string;

  /** Evidence type */
  type: 'camera_snapshot' | 'camera_clip' | 'access_log' | 'system_log' 
    | 'network_metric' | 'device_health' | 'recording_segment' | 'ai_detection';

  /** Source ID */
  sourceId: string;

  /** Source name */
  sourceName?: string;

  /** Timestamp of evidence */
  timestamp: Date;

  /** URI/URL to evidence */
  uri?: string;

  /** File path if stored locally */
  filePath?: string;

  /** Hash for integrity verification */
  hash?: string;

  /** Hash algorithm */
  hashAlgorithm?: string;

  /** File size in bytes */
  sizeBytes?: number;

  /** MIME type */
  mimeType?: string;

  /** Duration in seconds (for video) */
  durationSeconds?: number;

  /** Description */
  description?: string;

  /** Additional metadata */
  metadata: Record<string, unknown>;

  /** Created timestamp */
  createdAt: Date;
}

/**
 * Evidence summary for display
 */
export interface EvidenceSummary {
  id: string;
  type: Evidence['type'];
  sourceName?: string;
  timestamp: Date;
  description?: string;
  uri?: string;
  thumbnailUri?: string;
  durationSeconds?: number;
  verified?: boolean;
}

/**
 * Investigation hypothesis
 */
export interface InvestigationHypothesis {
  /** Unique hypothesis ID */
  id: string;

  /** Hypothesis description */
  description: string;

  /** Confidence (0.0 - 1.0) */
  confidence: number;

  /** Supporting evidence IDs */
  supportingEvidenceIds: string[];

  /** Contradicting evidence IDs */
  contradictingEvidenceIds: string[];

  /** Status */
  status: 'possible' | 'likely' | 'confirmed' | 'rejected';

  /** Created by */
  createdBy: {
    type: 'operator' | 'ai-commander';
    userId?: string;
  };

  /** Created timestamp */
  createdAt: Date;

  /** Updated timestamp */
  updatedAt: Date;
}

/**
 * Recommended action
 */
export interface RecommendedAction {
  /** Action ID */
  id: string;

  /** Order/priority */
  order: number;

  /** Action title */
  title: string;

  /** Action description */
  description?: string;

  /** Is this action required? */
  required: boolean;

  /** Action status */
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';

  /** Completed by */
  completedBy?: string;

  /** Completed at */
  completedAt?: Date;

  /** Notes */
  notes?: string;
}

/**
 * Investigation
 */
export interface Investigation {
  /** Unique investigation ID */
  id: string;

  /** Tenant identifier */
  tenantId: string;

  /** Investigation title */
  title: string;

  /** Description */
  description?: string;

  /** Investigation status */
  status: InvestigationStatus;

  /** Priority */
  priority: InvestigationPriority;

  /** When investigation started */
  startedAt: Date;

  /** When investigation closed */
  closedAt?: Date;

  /** Time range being investigated */
  timeRange: {
    from: Date;
    to: Date;
  };

  /** Investigation scope */
  scope: InvestigationScope;

  /** Correlated incidents */
  incidents: Incident[];

  /** Incident summaries (for display) */
  incidentSummaries?: IncidentSummary[];

  /** Evidence items */
  evidence: Evidence[];

  /** Evidence summaries (for display) */
  evidenceSummaries?: EvidenceSummary[];

  /** Timeline entries */
  timeline: TimelineEntry[];

  /** Affected assets */
  affectedAssets: AssetReference[];

  /** Hypotheses */
  hypotheses: InvestigationHypothesis[];

  /** Recommended actions */
  recommendedActions: RecommendedAction[];

  /** AI-generated summary */
  summary?: string;

  /** Root cause analysis */
  rootCause?: {
    description: string;
    confidence: number;
    affectedAssets: AssetReference[];
    blastRadius: {
      cameras: number;
      recorders: number;
      doors: number;
      zones: number;
      otherDevices: number;
    };
  };

  /** Created by */
  createdBy: {
    type: 'operator' | 'ai-commander';
    userId?: string;
  };

  /** Assigned to */
  assignedTo?: string;

  /** Tags */
  tags?: string[];

  /** Additional metadata */
  metadata: Record<string, unknown>;

  /** Created timestamp */
  createdAt: Date;

  /** Last updated timestamp */
  updatedAt: Date;
}

/**
 * Investigation creation input
 */
export interface CreateInvestigationInput {
  tenantId: string;
  title: string;
  description?: string;
  priority?: InvestigationPriority;
  timeRange: {
    from: Date;
    to: Date;
  };
  scope: InvestigationScope;
  createdBy: {
    type: 'operator' | 'ai-commander';
    userId?: string;
  };
  assignedTo?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Investigation query
 */
export interface InvestigationQuery {
  tenantId: string;
  status?: InvestigationStatus;
  statuses?: InvestigationStatus[];
  priority?: InvestigationPriority;
  priorities?: InvestigationPriority[];
  createdBy?: string;
  assignedTo?: string;
  from?: Date;
  to?: Date;
  branchId?: string;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Investigation summary
 */
export interface InvestigationSummary {
  id: string;
  title: string;
  status: InvestigationStatus;
  priority: InvestigationPriority;
  startedAt: Date;
  closedAt?: Date;
  incidentCount: number;
  criticalIncidentCount: number;
  highIncidentCount: number;
  evidenceCount: number;
  affectedBranches: string[];
  assignedTo?: string;
  summary?: string;
}
