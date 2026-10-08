/**
 * Assistant Presenter
 * 
 * Separates execution results from natural language presentation.
 * Prevents LLM/NLP layer from hallucinating operational state.
 * 
 * The presenter only formats data that actually came from domain services.
 */

import type {
  AssistantResponse,
  AssistantPresenter
} from '../types/assistant-response.js';
import type {
  AssistantEvidence,
  AssistantErrorCode,
  AssistantExecutionResult
} from '../types/assistant-command.js';

/**
 * Default Assistant Presenter Implementation
 */
export class DefaultAssistantPresenter implements AssistantPresenter {
  /**
   * Format a successful verified result
   */
  formatSuccess<T>(result: {
    data: T;
    evidence: AssistantEvidence[];
    intent: string;
  }): AssistantResponse {
    const message = this.buildSuccessMessage(result.intent, result.data);
    
    return {
      success: true,
      message,
      intent: result.intent,
      data: result.data,
      evidence: result.evidence,
      suggestions: this.buildSuggestions(result.intent),
      timestamp: new Date()
    };
  }
  
  /**
   * Format an unverified/partial result
   */
  formatPartial<T>(result: {
    reason: string;
    data?: T;
    evidence?: AssistantEvidence[];
    intent: string;
  }): AssistantResponse {
    return {
      success: true,
      message: result.reason,
      intent: result.intent,
      data: result.data,
      evidence: result.evidence,
      suggestions: this.buildSuggestions(result.intent),
      timestamp: new Date()
    };
  }
  
  /**
   * Format a failure
   */
  formatFailure(error: {
    code: AssistantErrorCode;
    message: string;
    intent: string;
    retryable?: boolean;
    choices?: Array<{
      id: string;
      label: string;
      description?: string;
    }>;
  }): AssistantResponse {
    return {
      success: false,
      message: error.message,
      intent: error.intent,
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable
      },
      choices: error.choices,
      suggestions: this.buildErrorSuggestions(error.code),
      timestamp: new Date()
    };
  }
  
  /**
   * Format an unsupported intent
   */
  formatUnsupported(intent: string, query: string): AssistantResponse {
    return {
      success: false,
      message: `I don't currently support "${query}". Try asking for help to see what I can do.`,
      intent,
      error: {
        code: 'UNSUPPORTED_INTENT' as AssistantErrorCode,
        message: 'This operation is not supported',
        retryable: false
      },
      suggestions: [
        'Show system health',
        'Find people detected today',
        'Generate daily report',
        'What can you do?'
      ],
      timestamp: new Date()
    };
  }
  
  /**
   * Format complete execution result
   */
  formatExecutionResult<T>(result: AssistantExecutionResult<T>): AssistantResponse {
    if (result.status === 'SUCCESS' && result.verified) {
      return this.formatSuccess({
        data: result.data!,
        evidence: result.evidence || [],
        intent: result.intent
      });
    }
    
    if (result.status === 'PARTIAL') {
      return this.formatPartial({
        reason: this.buildPartialMessage(result),
        data: result.data,
        evidence: result.evidence,
        intent: result.intent
      });
    }
    
    if (result.status === 'AMBIGUOUS' && result.choices) {
      return {
        success: false,
        message: 'Your request matches multiple items. Please choose one:',
        intent: result.intent,
        choices: result.choices,
        suggestions: ['Be more specific'],
        timestamp: new Date()
      };
    }
    
    return this.formatFailure({
      code: result.error?.code || ('UNKNOWN_ERROR' as AssistantErrorCode),
      message: result.error?.message || 'An error occurred',
      intent: result.intent,
      retryable: result.error?.retryable
    });
  }
  
  /**
   * Build success message based on intent and data
   */
  private buildSuccessMessage(intent: string, data: any): string {
    switch (intent) {
      case 'CAMERA_START':
        if (data.verified) {
          return `${data.camera.name} is now running.`;
        }
        return `Start command sent to ${data.camera.name}.`;
      
      case 'CAMERA_STOP':
        if (data.verified) {
          return `${data.camera.name} has been stopped.`;
        }
        return `Stop command sent to ${data.camera.name}.`;
      
      case 'SYSTEM_STATUS':
        return this.formatSystemStatus(data);
      
      case 'SEARCH_DETECTIONS':
        return this.formatSearchResults(data);
      
      case 'INVESTIGATE_PERSON':
        return this.formatInvestigation(data);
      
      case 'ANALYTICS_OCCUPANCY':
        return data.summary || 'Occupancy data retrieved.';
      
      case 'REPORT_INCIDENTS':
      case 'REPORT_ANALYTICS':
        return data.summary || 'Report generated successfully.';
      
      default:
        return 'Operation completed successfully.';
    }
  }
  
  /**
   * Format system status message
   */
  private formatSystemStatus(data: any): string {
    const { summary } = data;
    
    if (!summary) {
      return 'System health information retrieved.';
    }
    
    return `System Status:
${summary.overall}

📷 Cameras: ${summary.camerasSummary}
🚨 Incidents: ${summary.incidentsSummary}
💾 Storage: ${summary.storageSummary}
⚙️ Detection: ${summary.detectionSummary}`;
  }
  
  /**
   * Format search results message
   */
  private formatSearchResults(data: any): string {
    const { summary, searchResult } = data;
    
    if (!summary || searchResult.totalResults === 0) {
      return `No matches found for your search criteria.`;
    }
    
    let message = `Found ${summary.totalResults} match${summary.totalResults === 1 ? '' : 'es'} for ${summary.query}`;
    
    if (summary.topMatches && summary.topMatches.length > 0) {
      message += ':\n\n' + summary.topMatches.map((m: string, i: number) => `${i + 1}. ${m}`).join('\n');
    }
    
    if (searchResult.totalResults > summary.topMatches.length) {
      const remaining = searchResult.totalResults - summary.topMatches.length;
      message += `\n\n... and ${remaining} more result${remaining === 1 ? '' : 's'}`;
    }
    
    return message;
  }
  
  /**
   * Format investigation message
   */
  private formatInvestigation(data: any): string {
    const { summary, investigation } = data;
    
    if (!summary) {
      return 'Investigation created.';
    }
    
    let message = `Investigation Results (ID: ${summary.investigationId})\n\n`;
    message += `👤 Subject tracked across ${summary.camerasVisited} camera${summary.camerasVisited === 1 ? '' : 's'}\n`;
    message += `📍 ${summary.totalAppearances} appearance${summary.totalAppearances === 1 ? '' : 's'} over ${summary.duration}\n\n`;
    
    if (summary.timeline && summary.timeline.length > 0) {
      message += 'Timeline:\n';
      message += summary.timeline.map((t: string) => `  • ${t}`).join('\n');
    }
    
    return message;
  }
  
  /**
   * Build partial result message
   */
  private buildPartialMessage<T>(result: AssistantExecutionResult<T>): string {
    // Extract reason from data if available
    if (result.data && typeof result.data === 'object') {
      const data = result.data as any;
      if (data.reason) {
        return data.reason;
      }
    }
    
    return 'The operation was initiated but could not be fully verified.';
  }
  
  /**
   * Build suggestions based on intent
   */
  private buildSuggestions(intent: string): string[] {
    const suggestions: Record<string, string[]> = {
      'CAMERA_START': [
        'Show camera status',
        'View live feed',
        'Enable analytics'
      ],
      'CAMERA_STOP': [
        'Show camera status',
        'Start camera'
      ],
      'SYSTEM_STATUS': [
        'Show critical incidents',
        'List offline cameras',
        'Generate system health report'
      ],
      'SEARCH_DETECTIONS': [
        'Refine search',
        'Search different time range',
        'Show all results'
      ],
      'INVESTIGATE_PERSON': [
        'Show journey on map',
        'Export timeline',
        'Find related persons'
      ],
      'ANALYTICS_OCCUPANCY': [
        'Show hourly trend',
        'Compare with yesterday',
        'Show peak times'
      ],
      'REPORT_INCIDENTS': [
        'Export as PDF',
        'Email report',
        'Generate weekly report'
      ]
    };
    
    return suggestions[intent] || [
      'Show system status',
      'What can you do?'
    ];
  }
  
  /**
   * Build error-specific suggestions
   */
  private buildErrorSuggestions(code: AssistantErrorCode): string[] {
    switch (code) {
      case 'RESOURCE_NOT_FOUND' as AssistantErrorCode:
        return [
          'List available cameras',
          'Search with different criteria',
          'Check spelling'
        ];
      
      case 'AMBIGUOUS_RESOURCE' as AssistantErrorCode:
        return [
          'Be more specific',
          'Use camera ID instead of name'
        ];
      
      case 'FORBIDDEN' as AssistantErrorCode:
      case 'INSUFFICIENT_PERMISSION' as AssistantErrorCode:
        return [
          'Contact administrator for access',
          'Try a different operation'
        ];
      
      case 'SERVICE_UNAVAILABLE' as AssistantErrorCode:
        return [
          'Try again in a moment',
          'Check system status',
          'Contact support if issue persists'
        ];
      
      default:
        return [
          'Try again',
          'Rephrase your request',
          'Ask for help'
        ];
    }
  }
}

/**
 * Global presenter instance
 */
export const assistantPresenter = new DefaultAssistantPresenter();
