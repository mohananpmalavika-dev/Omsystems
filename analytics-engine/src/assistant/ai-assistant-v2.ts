/**
 * AI Assistant V2 - Truthful Orchestration Layer
 * 
 * This is the refactored AI Assistant that delegates to real commands
 * instead of generating fake responses.
 * 
 * Key improvements:
 * 1. No Math.random() in confidence scoring
 * 2. No fake operational success claims
 * 3. All results verified from domain services
 * 4. Comprehensive audit trail
 * 5. Evidence-based responses
 * 6. Explicit UNKNOWN state handling
 * 
 * The assistant is now responsible ONLY for:
 * - Parsing natural language to intent
 * - Resolving intent to command
 * - Building execution context
 * - Delegating to command
 * - Formatting result for presentation
 * - Maintaining conversation history
 */

import type { IntentParser, ParsedQuery, IntentType } from './types/parsed-query.js';
import type { AssistantContext } from './types/assistant-command.js';
import type { AssistantResponse } from './types/assistant-response.js';
import { commandRegistry, type AssistantCommandRegistry } from './registry/command-registry.js';
import { capabilityRegistry, type AssistantCapabilityRegistry } from './registry/capability-registry.js';
import { assistantPresenter, type DefaultAssistantPresenter } from './presentation/assistant-presenter.js';

/**
 * Conversation context
 */
interface ConversationContext {
  sessionId: string;
  history: Array<{
    query: string;
    intent: IntentType;
    response: AssistantResponse;
    timestamp: Date;
  }>;
  userId: string;
}

/**
 * AI Assistant V2 Configuration
 */
export interface AIAssistantConfig {
  /** Custom intent parser (optional) */
  intentParser?: IntentParser;
  
  /** Custom command registry (optional) */
  commandRegistry?: AssistantCommandRegistry;
  
  /** Custom capability registry (optional) */
  capabilityRegistry?: AssistantCapabilityRegistry;
  
  /** Custom presenter (optional) */
  presenter?: DefaultAssistantPresenter;
  
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * AI Assistant V2
 * 
 * Thin orchestration layer over real domain commands
 */
export class AIAssistantV2 {
  private contexts: Map<string, ConversationContext> = new Map();
  private intentParser: IntentParser;
  private commandRegistry: AssistantCommandRegistry;
  private capabilityRegistry: AssistantCapabilityRegistry;
  private presenter: DefaultAssistantPresenter;
  private debug: boolean;
  
  constructor(config: AIAssistantConfig = {}) {
    this.intentParser = config.intentParser || this.createDefaultParser();
    this.commandRegistry = config.commandRegistry || commandRegistry;
    this.capabilityRegistry = config.capabilityRegistry || capabilityRegistry;
    this.presenter = config.presenter || assistantPresenter;
    this.debug = config.debug || false;
  }
  
  /**
   * Process a natural language query
   * 
   * This is the main entry point. The flow is:
   * 1. Parse query to intent
   * 2. Check if intent is supported
   * 3. Build execution context
   * 4. Delegate to command
   * 5. Format and return result
   */
  async processQuery(
    query: string,
    user: {
      id: string;
      roles: string[];
      siteIds: string[];
    },
    sessionId: string = 'default'
  ): Promise<AssistantResponse> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    
    try {
      if (this.debug) {
        console.log(`[AIAssistantV2] Processing query: "${query}"`);
      }
      
      // Get or create conversation context
      const context = this.getContext(sessionId, user.id);
      
      // Step 1: Parse natural language to structured intent
      const parsed = await this.intentParser.parse(query);
      
      if (this.debug) {
        console.log(`[AIAssistantV2] Parsed intent: ${parsed.intent} (confidence: ${parsed.confidence})`);
      }
      
      // Step 2: Resolve intent to command
      const command = this.commandRegistry.resolveIntent(parsed.intent);
      
      if (!command) {
        if (this.debug) {
          console.log(`[AIAssistantV2] No command found for intent: ${parsed.intent}`);
        }
        
        const response = this.presenter.formatUnsupported(parsed.intent, query);
        this.recordHistory(context, query, parsed.intent, response);
        return response;
      }
      
      // Step 3: Check command requirements
      const commandId = this.commandRegistry.getCommandIdForIntent(parsed.intent);
      if (commandId) {
        const metadata = this.commandRegistry.getMetadata(commandId);
        
        if (metadata && metadata.requires.length > 0) {
          const reqCheck = await this.capabilityRegistry.checkRequirements(metadata.requires);
          
          if (!reqCheck.allAvailable) {
            if (this.debug) {
              console.log(`[AIAssistantV2] Command requirements not met:`, reqCheck);
            }
            
            const response = this.presenter.formatFailure({
              code: 'CAPABILITY_UNAVAILABLE' as any,
              message: this.buildRequirementErrorMessage(metadata.name, reqCheck.unavailable),
              intent: parsed.intent,
              retryable: true
            });
            
            this.recordHistory(context, query, parsed.intent, response);
            return response;
          }
        }
      }
      
      // Step 4: Build execution context
      const execContext: AssistantContext = {
        user,
        sessionId,
        requestId,
        timestamp: new Date(),
        conversationHistory: context.history.slice(-5).map(h => ({
          query: h.query,
          intent: h.intent,
          timestamp: h.timestamp
        }))
      };
      
      // Step 5: Build command input from parsed query
      const input = this.buildCommandInput(parsed);
      
      if (this.debug) {
        console.log(`[AIAssistantV2] Executing command with input:`, input);
      }
      
      // Step 6: Execute command
      const result = await command.execute(input, execContext);
      
      if (this.debug) {
        console.log(`[AIAssistantV2] Command result status: ${result.status}, verified: ${result.verified}`);
      }
      
      // Step 7: Format result for presentation
      let response: AssistantResponse;
      
      if (result.status === 'SUCCESS' && result.verified) {
        response = this.presenter.formatSuccess({
          data: result.data!,
          evidence: result.evidence || [],
          intent: parsed.intent
        });
      } else if (result.status === 'PARTIAL') {
        response = this.presenter.formatPartial({
          reason: result.message || 'Operation partially completed',
          data: result.data,
          evidence: result.evidence,
          intent: parsed.intent
        });
      } else if (result.status === 'AMBIGUOUS' && 'choices' in result) {
        response = {
          success: false,
          message: result.message || 'Multiple matches found',
          intent: parsed.intent,
          choices: result.choices,
          timestamp: new Date()
        };
      } else {
        // At this point, result must be CommandFailure
        const failure = result as CommandFailure;
        response = this.presenter.formatFailure({
          code: failure.code,
          message: failure.message || 'Operation failed',
          intent: parsed.intent,
          retryable: failure.retryable
        });
      }
      
      // Add request metadata
      response.requestId = requestId;
      
      if (this.debug) {
        console.log(`[AIAssistantV2] Response generated in ${Date.now() - startTime}ms`);
      }
      
      // Step 8: Record in conversation history
      this.recordHistory(context, query, parsed.intent, response);
      
      return response;
      
    } catch (error) {
      console.error('[AIAssistantV2] Error processing query:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        success: false,
        message: 'An unexpected error occurred while processing your request.',
        error: {
          code: 'INTERNAL_ERROR' as any,
          message: errorMessage,
          retryable: true
        },
        requestId,
        timestamp: new Date()
      };
    }
  }
  
  /**
   * Build command input from parsed query
   */
  private buildCommandInput(parsed: ParsedQuery): any {
    const { intent, parameters } = parsed;
    
    // Map parsed parameters to command-specific input
    switch (intent) {
      case 'CAMERA_START':
      case 'CAMERA_STOP':
        return {
          cameraReference: parameters.camera || parameters.number
        };
      
      case 'SYSTEM_STATUS':
        return {};
      
      case 'SEARCH_DETECTIONS':
      case 'SEARCH_PERSON':
      case 'SEARCH_VEHICLE':
        return {
          objectType: parameters.objectType,
          color: parameters.color,
          attributes: parameters.attributes,
          timeRange: parameters.timeRange,
          location: parameters.location,
          cameraIds: parameters.cameraIds,
          freeText: parameters.freeText,
          limit: parameters.limit || 50
        };
      
      case 'INVESTIGATE_PERSON':
        return {
          subjectDetectionId: parameters.subjectId || parameters.trackingId,
          searchCriteria: parameters.color || parameters.location ? {
            color: parameters.color,
            location: parameters.location,
            timestamp: parameters.timeRange?.from
          } : undefined,
          timeRange: parameters.timeRange,
          cameraIds: parameters.cameraIds
        };
      
      case 'ANALYTICS_OCCUPANCY':
        return {
          siteId: parameters.siteId,
          zoneId: parameters.zone
        };
      
      case 'REPORT_INCIDENTS':
      case 'REPORT_ANALYTICS':
      case 'REPORT_COMPLIANCE':
        return {
          reportType: this.mapReportType(intent, parameters.reportType),
          period: parameters.timeRange
        };
      
      default:
        return parameters;
    }
  }
  
  /**
   * Map report type
   */
  private mapReportType(intent: string, reportType?: string): string {
    if (reportType) {
      return reportType;
    }
    
    switch (intent) {
      case 'REPORT_INCIDENTS':
        return 'incidents';
      case 'REPORT_ANALYTICS':
        return 'analytics';
      case 'REPORT_COMPLIANCE':
        return 'compliance';
      default:
        return 'daily';
    }
  }
  
  /**
   * Build requirement error message
   */
  private buildRequirementErrorMessage(commandName: string, unavailable: string[]): string {
    if (unavailable.length === 0) {
      return `${commandName} is not currently available.`;
    }
    
    const missing = unavailable.join(', ');
    return `${commandName} requires ${missing} which is not currently available.`;
  }
  
  /**
   * Get or create conversation context
   */
  private getContext(sessionId: string, userId: string): ConversationContext {
    if (!this.contexts.has(sessionId)) {
      this.contexts.set(sessionId, {
        sessionId,
        history: [],
        userId
      });
    }
    return this.contexts.get(sessionId)!;
  }
  
  /**
   * Record interaction in conversation history
   */
  private recordHistory(
    context: ConversationContext,
    query: string,
    intent: IntentType,
    response: AssistantResponse
  ): void {
    context.history.push({
      query,
      intent,
      response,
      timestamp: new Date()
    });
    
    // Keep last 20 interactions
    if (context.history.length > 20) {
      context.history.shift();
    }
  }
  
  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Create default intent parser
   */
  private createDefaultParser(): IntentParser {
    // This is a simple rule-based parser
    // In production, this could be replaced with an ML model
    return {
      parse: (query: string): ParsedQuery => {
        const lowerQuery = query.toLowerCase();
        
        // Detect intent using patterns
        let intent: IntentType = 'UNKNOWN';
        let confidence = 0;
        
        // Camera control
        if (/start.*camera|enable.*camera/i.test(query)) {
          intent = 'CAMERA_START';
          confidence = 0.9;
        } else if (/stop.*camera|disable.*camera/i.test(query)) {
          intent = 'CAMERA_STOP';
          confidence = 0.9;
        }
        // System status
        else if (/system.*status|system.*health|show.*status/i.test(query)) {
          intent = 'SYSTEM_STATUS';
          confidence = 0.95;
        }
        // Search
        else if (/find|search|show.*detected|look.*for/i.test(query)) {
          if (/person|people/i.test(query)) {
            intent = 'SEARCH_PERSON';
          } else if (/vehicle|car/i.test(query)) {
            intent = 'SEARCH_VEHICLE';
          } else {
            intent = 'SEARCH_DETECTIONS';
          }
          confidence = 0.85;
        }
        // Investigation
        else if (/track|investigate|trace|journey|where.*go/i.test(query)) {
          intent = 'INVESTIGATE_PERSON';
          confidence = 0.9;
        }
        // Analytics
        else if (/occupancy|how many people/i.test(query)) {
          intent = 'ANALYTICS_OCCUPANCY';
          confidence = 0.9;
        }
        // Reports
        else if (/report|generate.*report/i.test(query)) {
          if (/incident/i.test(query)) {
            intent = 'REPORT_INCIDENTS';
          } else if (/analytic/i.test(query)) {
            intent = 'REPORT_ANALYTICS';
          } else {
            intent = 'REPORT_INCIDENTS';
          }
          confidence = 0.85;
        }
        // Help
        else if (/help|what.*can.*do|capabilities/i.test(query)) {
          intent = 'HELP';
          confidence = 1.0;
        }
        
        // Extract entities
        const entities = [];
        const parameters: any = {};
        
        // Camera number
        const cameraMatch = query.match(/camera[- ]?(\d+|[a-z0-9]+)/i);
        if (cameraMatch && cameraMatch[1]) {
          entities.push({ type: 'camera', value: cameraMatch[1], confidence: 0.95 });
          parameters.camera = cameraMatch[1];
        }
        
        // Color
        const colorMatch = query.match(/(red|blue|green|yellow|black|white|gray)/i);
        if (colorMatch && colorMatch[1]) {
          entities.push({ type: 'color', value: colorMatch[1], confidence: 0.95 });
          parameters.color = colorMatch[1].toLowerCase();
        }
        
        // Object type
        if (/person|people/i.test(query)) {
          parameters.objectType = 'person';
        } else if (/vehicle|car/i.test(query)) {
          parameters.objectType = 'vehicle';
        }
        
        return {
          intent,
          confidence,
          entities,
          parameters,
          originalQuery: query
        };
      }
    };
  }
  
  /**
   * Clear conversation history
   */
  clearHistory(sessionId: string): void {
    this.contexts.delete(sessionId);
  }
  
  /**
   * Get conversation history
   */
  getHistory(sessionId: string): ConversationContext['history'] {
    const context = this.contexts.get(sessionId);
    return context ? context.history : [];
  }
  
  /**
   * Get statistics
   */
  getStatistics() {
    let totalQueries = 0;
    const intentCounts: Record<string, number> = {};
    
    for (const context of this.contexts.values()) {
      totalQueries += context.history.length;
      
      for (const entry of context.history) {
        intentCounts[entry.intent] = (intentCounts[entry.intent] || 0) + 1;
      }
    }
    
    return {
      activeSessions: this.contexts.size,
      totalQueries,
      intentCounts,
      registeredCommands: this.commandRegistry.listEnabledCommands().length,
      availableCapabilities: this.capabilityRegistry.listAvailable().length
    };
  }
}

/**
 * Export factory function
 */
export function createAIAssistantV2(config?: AIAssistantConfig): AIAssistantV2 {
  return new AIAssistantV2(config);
}
