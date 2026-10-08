/**
 * Assistant response types for natural language presentation
 */

import type { AssistantEvidence, AssistantErrorCode } from './assistant-command.js';

/**
 * Final assistant response to user
 * This is what gets presented in natural language
 */
export interface AssistantResponse {
  /** Whether the operation was successful */
  success: boolean;
  
  /** Natural language message for the user */
  message: string;
  
  /** Intent that was executed */
  intent?: string;
  
  /** Result data (optional, for programmatic access) */
  data?: unknown;
  
  /** Evidence supporting the response */
  evidence?: AssistantEvidence[];
  
  /** Suggested follow-up actions */
  suggestions?: string[];
  
  /** Follow-up questions */
  followUp?: string[];
  
  /** For ambiguous queries, present choices */
  choices?: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  
  /** Error details if failed */
  error?: {
    code: AssistantErrorCode;
    message: string;
    retryable?: boolean;
  };
  
  /** Request tracking */
  requestId?: string;
  
  /** Timestamp */
  timestamp?: Date;
}

/**
 * Response formatter interface
 * Separates execution results from natural language presentation
 */
export interface AssistantPresenter {
  /**
   * Format a successful verified result
   */
  formatSuccess<T>(
    result: {
      data: T;
      evidence: AssistantEvidence[];
      intent: string;
    }
  ): AssistantResponse;
  
  /**
   * Format an unverified/partial result
   */
  formatPartial<T>(
    result: {
      reason: string;
      data?: T;
      evidence?: AssistantEvidence[];
      intent: string;
    }
  ): AssistantResponse;
  
  /**
   * Format a failure
   */
  formatFailure(
    error: {
      code: AssistantErrorCode;
      message: string;
      intent: string;
      retryable?: boolean;
      choices?: Array<{
        id: string;
        label: string;
        description?: string;
      }>;
    }
  ): AssistantResponse;
  
  /**
   * Format an unsupported intent
   */
  formatUnsupported(
    intent: string,
    query: string
  ): AssistantResponse;
}
