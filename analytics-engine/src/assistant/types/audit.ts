/**
 * Assistant audit trail types
 * 
 * Every assistant action must be auditable for accountability
 * in surveillance/security contexts.
 */

import type { IntentType, ParsedQuery } from './parsed-query.js';
import type { AssistantContext } from './assistant-command.js';

/**
 * Audit event for assistant actions
 */
export interface AssistantAuditEvent {
  /** Unique event identifier */
  eventId: string;
  
  /** Request identifier */
  requestId: string;
  
  /** Timestamp */
  timestamp: Date;
  
  /** User who made the request */
  userId: string;
  
  /** Session identifier */
  sessionId: string;
  
  /** Original natural language query */
  originalText: string;
  
  /** Parsed intent */
  parsedIntent: IntentType;
  
  /** Parser confidence */
  intentConfidence: number;
  
  /** Extracted entities */
  parsedEntities: Array<{
    type: string;
    value: string;
    confidence: number;
  }>;
  
  /** Resources that were resolved */
  resolvedResources?: Array<{
    type: string;
    id: string;
    name?: string;
  }>;
  
  /** Authorization decision */
  authorizationDecision: 'ALLOW' | 'DENY' | 'NOT_REQUIRED';
  
  /** Authorization reason if denied */
  authorizationReason?: string;
  
  /** Command that was executed */
  command: string;
  
  /** Command input parameters */
  commandInput?: Record<string, unknown>;
  
  /** Execution result status */
  resultStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'DENIED' | 'AMBIGUOUS' | 'UNAVAILABLE';
  
  /** Was result verified? */
  verified: boolean;
  
  /** Evidence record IDs that support the result */
  evidenceIds?: string[];
  
  /** Operation IDs if side effects occurred */
  operationIds?: string[];
  
  /** Error code if failed */
  errorCode?: string;
  
  /** Execution duration in milliseconds */
  durationMs: number;
  
  /** Client information */
  client?: {
    ip?: string;
    userAgent?: string;
  };
}

/**
 * Audit service interface
 */
export interface AssistantAuditService {
  /**
   * Record an assistant action
   */
  record(event: AssistantAuditEvent): Promise<void>;
  
  /**
   * Query audit trail
   */
  query(filter: {
    userId?: string;
    sessionId?: string;
    intent?: IntentType;
    fromDate?: Date;
    toDate?: Date;
    resultStatus?: string;
    limit?: number;
  }): Promise<AssistantAuditEvent[]>;
}

/**
 * Helper to create audit event from execution
 */
export function createAuditEvent(
  requestId: string,
  context: AssistantContext,
  parsed: ParsedQuery,
  execution: {
    command: string;
    commandInput?: Record<string, unknown>;
    resultStatus: string;
    verified: boolean;
    evidenceIds?: string[];
    operationIds?: string[];
    errorCode?: string;
    authorizationDecision: 'ALLOW' | 'DENY' | 'NOT_REQUIRED';
    authorizationReason?: string;
    durationMs: number;
  }
): AssistantAuditEvent {
  return {
    eventId: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    requestId,
    timestamp: new Date(),
    userId: context.user.id,
    sessionId: context.sessionId,
    originalText: parsed.originalQuery,
    parsedIntent: parsed.intent,
    intentConfidence: parsed.confidence,
    parsedEntities: parsed.entities.map(e => ({
      type: e.type,
      value: e.value,
      confidence: e.confidence
    })),
    authorizationDecision: execution.authorizationDecision,
    authorizationReason: execution.authorizationReason,
    command: execution.command,
    commandInput: execution.commandInput,
    resultStatus: execution.resultStatus as any,
    verified: execution.verified,
    evidenceIds: execution.evidenceIds,
    operationIds: execution.operationIds,
    errorCode: execution.errorCode,
    durationMs: execution.durationMs
  };
}
