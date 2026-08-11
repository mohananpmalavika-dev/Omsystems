/**
 * Core command execution contracts for AI Assistant
 * 
 * These types enforce the principle that no assistant handler may produce
 * operational claims without domain service verification.
 */

import type { ParsedQuery } from './parsed-query.js';

/**
 * Context provided to every assistant command
 */
export interface AssistantContext {
  /** User making the request */
  user: {
    id: string;
    roles: string[];
    siteIds: string[];
  };
  
  /** Session identifier for conversation tracking */
  sessionId: string;
  
  /** Request tracking */
  requestId: string;
  
  /** Timestamp of request */
  timestamp: Date;
  
  /** Optional timezone for date/time resolution */
  timezone?: string;
  
  /** Optional conversation history for context */
  conversationHistory?: ConversationEntry[];
}

/**
 * Conversation history entry
 */
export interface ConversationEntry {
  query: string;
  intent: string;
  timestamp: Date;
}

/**
 * Evidence trail for assistant results
 * Provides traceability for every claim made
 */
export interface AssistantEvidence {
  /** Source system that provided the data */
  source: 
    | 'camera-service'
    | 'camera-control-service'
    | 'event-store'
    | 'vector-store'
    | 'incident-service'
    | 'analytics-service'
    | 'report-service'
    | 'investigation-service'
    | 'system-health-service'
    | 'reid-service'
    | 'timeline-service';
  
  /** IDs of records that support this result */
  recordIds: string[];
  
  /** When the query was executed */
  queriedAt: Date;
  
  /** Optional query details for debugging */
  queryDetails?: Record<string, unknown>;
}

/**
 * Result of a command execution
 * Distinguishes between success states and verification status
 */
export type CommandResult<T> =
  | VerifiedSuccess<T>
  | UnverifiedSuccess<T>
  | CommandFailure;

/**
 * Fully verified successful result
 * The operation completed AND state was confirmed
 */
export interface VerifiedSuccess<T> {
  status: 'SUCCESS';
  verified: true;
  data: T;
  evidence: AssistantEvidence[];
  message?: string;
}

/**
 * Operation accepted but not yet verified
 * E.g., camera start command sent but stream not yet confirmed
 */
export interface UnverifiedSuccess<T> {
  status: 'PARTIAL';
  verified: false;
  data?: T;
  reason: string;
  message?: string;
  evidence?: AssistantEvidence[];
}

/**
 * Command execution failed
 */
export interface CommandFailure {
  status: 'FAILED' | 'DENIED' | 'AMBIGUOUS' | 'UNAVAILABLE';
  verified: false;
  code: AssistantErrorCode;
  message: string;
  retryable?: boolean;
  choices?: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
}

/**
 * Standard error codes
 */
export enum AssistantErrorCode {
  // Resource errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  AMBIGUOUS_RESOURCE = 'AMBIGUOUS_RESOURCE',
  RESOURCE_UNAVAILABLE = 'RESOURCE_UNAVAILABLE',
  
  // Authorization errors
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSION = 'INSUFFICIENT_PERMISSION',
  
  // Service errors
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  SERVICE_TIMEOUT = 'SERVICE_TIMEOUT',
  COMMAND_REJECTED = 'COMMAND_REJECTED',
  
  // Verification errors
  VERIFICATION_TIMEOUT = 'VERIFICATION_TIMEOUT',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  STATE_MISMATCH = 'STATE_MISMATCH',
  
  // Input errors
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Intent errors
  UNSUPPORTED_INTENT = 'UNSUPPORTED_INTENT',
  CAPABILITY_UNAVAILABLE = 'CAPABILITY_UNAVAILABLE',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  
  // General errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Base interface for all assistant commands
 */
export interface AssistantCommand<TInput, TOutput> {
  /**
   * Execute the command with input derived from parsed query
   */
  execute(
    input: TInput,
    context: AssistantContext
  ): Promise<CommandResult<TOutput>>;
}

/**
 * Complete execution result envelope
 * Standardizes all assistant operations
 */
export interface AssistantExecutionResult<T> {
  /** Unique identifier for this request */
  requestId: string;
  
  /** Intent that was recognized */
  intent: string;
  
  /** Execution status */
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'DENIED' | 'AMBIGUOUS' | 'UNAVAILABLE';
  
  /** Was the result verified from actual state? */
  verified: boolean;
  
  /** Result data if successful */
  data?: T;
  
  /** Error information if failed */
  error?: {
    code: AssistantErrorCode;
    message: string;
    retryable?: boolean;
  };
  
  /** Evidence supporting this result */
  evidence?: AssistantEvidence[];
  
  /** Suggested next actions */
  suggestions?: string[];
  
  /** Follow-up questions */
  followUp?: string[];
  
  /** For ambiguous results, present choices */
  choices?: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  
  /** When the command was executed */
  executedAt: Date;
  
  /** Execution duration in milliseconds */
  durationMs?: number;
}

/**
 * Helper class for creating command results
 * Enforces evidence requirements
 */
export class CommandResultBuilder {
  /**
   * Create a verified success result
   * Requires evidence to prevent false claims
   */
  static verifiedSuccess<T>(
    data: T,
    evidence: AssistantEvidence[]
  ): VerifiedSuccess<T> {
    if (!evidence || evidence.length === 0) {
      throw new Error(
        'Verified success results require evidence. ' +
        'Cannot claim success without proof from domain services.'
      );
    }
    
    return {
      status: 'SUCCESS',
      verified: true,
      data,
      evidence
    };
  }
  
  /**
   * Create an unverified/partial success result
   * For operations accepted but not confirmed
   */
  static unverifiedSuccess<T>(
    reason: string,
    data?: T,
    evidence?: AssistantEvidence[]
  ): UnverifiedSuccess<T> {
    return {
      status: 'PARTIAL',
      verified: false,
      data,
      reason,
      evidence
    };
  }
  
  /**
   * Create a failure result
   */
  static failure(
    code: AssistantErrorCode,
    message: string,
    options?: {
      retryable?: boolean;
      choices?: CommandFailure['choices'];
    }
  ): CommandFailure {
    const status = 
      code === AssistantErrorCode.FORBIDDEN || 
      code === AssistantErrorCode.INSUFFICIENT_PERMISSION
        ? 'DENIED'
        : code === AssistantErrorCode.AMBIGUOUS_RESOURCE
        ? 'AMBIGUOUS'
        : code === AssistantErrorCode.SERVICE_UNAVAILABLE ||
          code === AssistantErrorCode.CAPABILITY_UNAVAILABLE
        ? 'UNAVAILABLE'
        : 'FAILED';
    
    return {
      status,
      verified: false,
      code,
      message,
      retryable: options?.retryable,
      choices: options?.choices
    };
  }
}

/**
 * Risk classification for commands
 * Determines authorization and confidence requirements
 */
export enum CommandRisk {
  /** Read-only operations */
  READ_ONLY = 'READ_ONLY',
  
  /** Operations with side effects */
  SIDE_EFFECT = 'SIDE_EFFECT',
  
  /** Destructive operations */
  DESTRUCTIVE = 'DESTRUCTIVE'
}

/**
 * Command metadata for registry
 */
export interface CommandMetadata {
  /** Unique command identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Risk level */
  risk: CommandRisk;
  
  /** Required capabilities/services */
  requires: string[];
  
  /** Whether the command is currently enabled */
  enabled: boolean;
  
  /** Optional description */
  description?: string;
}
