/**
 * AI Security Commander - Commander Query and Response Types
 * 
 * Types for natural language queries and structured responses.
 */

import type { SecuritySeverity, SecurityEventType, SecurityEventStats } from './security-event.types.js';
import type { IncidentType, IncidentSummary, IncidentStats } from './incident.types.js';
import type { 
  Investigation, 
  InvestigationScope, 
  InvestigationSummary, 
  TimelineEntry, 
  EvidenceSummary, 
  RecommendedAction 
} from './investigation.types.js';

/**
 * Commander query intent
 */
export type CommanderIntent =
  | 'investigate'    // Create new investigation
  | 'search'         // Search events/incidents
  | 'status'         // Get status of assets/systems
  | 'summarize'      // Summarize existing investigation
  | 'explain'        // Explain an incident or event
  | 'compare'        // Compare time periods or locations
  | 'analyze';       // Analyze patterns or trends

/**
 * Parsed commander query
 */
export interface CommanderQuery {
  /** Query intent */
  intent: CommanderIntent;

  /** Time range */
  timeRange?: {
    from?: Date;
    to?: Date;
    relativeMinutes?: number;
    relativeHours?: number;
    relativeDays?: number;
  };

  /** Investigation scope */
  scope?: Partial<InvestigationScope>;

  /** Filters */
  filters?: {
    abnormalOnly?: boolean;
    severities?: SecuritySeverity[];
    eventTypes?: SecurityEventType[];
    incidentTypes?: IncidentType[];
    minConfidence?: number;
  };

  /** Target entity (for explain, status) */
  target?: {
    type: 'camera' | 'recorder' | 'door' | 'zone' | 'branch' | 'investigation' | 'incident';
    id?: string;
    name?: string;
  };

  /** Comparison parameters (for compare) */
  comparison?: {
    baseline: {
      from: Date;
      to: Date;
    };
    current: {
      from: Date;
      to: Date;
    };
  };

  /** Natural language context */
  naturalLanguageQuery?: string;
}

/**
 * Commander context (user session state)
 */
export interface CommanderContext {
  /** User ID */
  userId: string;

  /** Tenant ID */
  tenantId: string;

  /** User permissions */
  permissions: string[];

  /** Current active investigation */
  activeInvestigationId?: string;

  /** Current scope */
  currentScope?: Partial<InvestigationScope>;

  /** Session ID */
  sessionId?: string;

  /** Conversation history count */
  conversationTurn?: number;
}

/**
 * Commander response
 */
export interface CommanderResponse {
  /** User-friendly message */
  message: string;

  /** Response type */
  type: 'investigation' | 'search_results' | 'status' | 'summary' | 'explanation' | 'comparison' | 'error';

  /** Investigation (if created) */
  investigation?: Investigation;

  /** Investigation summary */
  investigationSummary?: InvestigationSummary;

  /** Incident summaries */
  incidents?: IncidentSummary[];

  /** Timeline */
  timeline?: TimelineEntry[];

  /** Evidence */
  evidence?: EvidenceSummary[];

  /** Recommended actions */
  recommendedActions?: RecommendedAction[];

  /** Summary statistics */
  summary?: {
    totalEvents?: number;
    totalIncidents?: number;
    correlatedIncidents?: number;
    criticalIncidents?: number;
    highIncidents?: number;
    mediumIncidents?: number;
    lowIncidents?: number;
    affectedBranches?: number;
    affectedCameras?: number;
    affectedAssets?: number;
  };

  /** Event statistics */
  eventStats?: SecurityEventStats;

  /** Incident statistics */
  incidentStats?: IncidentStats;

  /** Query metadata */
  queryMetadata?: {
    searchedFrom?: Date;
    searchedTo?: Date;
    eventsScanned?: number;
    incidentsFound?: number;
    correlationTime?: number;
    executionTime?: number;
  };

  /** Suggestions for follow-up */
  suggestions?: string[];

  /** Error information */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Commander action request (for write operations)
 */
export interface CommanderActionRequest {
  /** Action type */
  action: 
    | 'disable_camera'
    | 'enable_camera'
    | 'restart_recorder'
    | 'lock_door'
    | 'unlock_door'
    | 'silence_alarm'
    | 'export_evidence'
    | 'assign_investigation';

  /** Target entity */
  target: {
    type: string;
    id: string;
  };

  /** Action parameters */
  parameters?: Record<string, unknown>;

  /** Reason for action */
  reason?: string;
}

/**
 * Commander action response
 */
export interface CommanderActionResponse {
  /** Was the action requested? */
  requested: boolean;

  /** Was the action executed? */
  executed: boolean;

  /** Was the result verified? */
  verified: boolean;

  /** Current verified state */
  verifiedState?: unknown;

  /** Execution status */
  executionStatus: 'success' | 'failed' | 'partial' | 'unsupported';

  /** Reason for failure */
  reason?: string;

  /** Message for user */
  message: string;
}

/**
 * Commander audit log
 */
export interface CommanderAuditLog {
  /** Log ID */
  id: string;

  /** User ID */
  userId: string;

  /** Tenant ID */
  tenantId: string;

  /** Timestamp */
  timestamp: Date;

  /** Original query */
  originalQuery: string;

  /** Parsed intent */
  parsedIntent: CommanderQuery;

  /** Executed queries/actions */
  executedQueries: unknown[];

  /** Investigation ID (if created) */
  investigationId?: string;

  /** Requested actions */
  requestedActions?: CommanderActionRequest[];

  /** Result status */
  result: 'success' | 'partial' | 'failed';

  /** Error message */
  error?: string;

  /** Response summary */
  responseSummary?: string;

  /** Execution time (ms) */
  executionTimeMs: number;
}

/**
 * Anomaly score factors
 */
export interface AbnormalityScore {
  /** Event ID */
  eventId: string;

  /** Overall score (0.0 - 1.0) */
  score: number;

  /** Reasons for abnormality */
  reasons: string[];

  /** Score factors */
  factors: {
    eventSeverity: number;
    rarity: number;
    temporalAnomaly: number;
    spatialAnomaly: number;
    contextualRisk: number;
    correlatedSignals: number;
  };
}
