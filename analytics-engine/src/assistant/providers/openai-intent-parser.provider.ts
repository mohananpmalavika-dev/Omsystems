import type { IntentParser, ParsedQuery, IntentType, Entity } from '../types/parsed-query.js';

// Retain the legacy import/config contract, but never send queries to a paid API.
export interface OpenAIIntentParserConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  maxRequestsPerMinute?: number;
  enableFallback?: boolean;
  debug?: boolean;
}

export class OpenAIIntentParser implements IntentParser {
  private readonly parser = this.createFallbackParser();

  constructor(_config: OpenAIIntentParserConfig = {}) {}

  async parse(query: string, _sessionId?: string): Promise<ParsedQuery> {
    const sanitized = typeof query === "string" ? query.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, 500) : "";
    if (!sanitized || /\b(don't|do not|never|should not)\b/i.test(sanitized)) {
      return { intent: "UNKNOWN", confidence: 0, entities: [], parameters: {}, originalQuery: sanitized };
    }
    return this.parser.parse(sanitized);
  }

  private createFallbackParser(): IntentParser {
    return {
      parse: (query: string): ParsedQuery => {
        const lowerQuery = query.toLowerCase();
        
        let intent: IntentType = 'UNKNOWN';
        let confidence = 0;
        
        // Camera control
        if (/start.*camera|enable.*camera|turn.*on.*camera/i.test(query)) {
          intent = 'CAMERA_START';
          confidence = 0.85;
        } else if (/stop.*camera|disable.*camera|turn.*off.*camera/i.test(query)) {
          intent = 'CAMERA_STOP';
          confidence = 0.85;
        }
        // System status
        else if (/system.*status|system.*health|show.*status|how.*system/i.test(query)) {
          intent = 'SYSTEM_STATUS';
          confidence = 0.9;
        }
        // Search
        else if (/find|search|show.*detected|look.*for|locate/i.test(query)) {
          if (/person|people|man|woman/i.test(query)) {
            intent = 'SEARCH_PERSON';
          } else if (/vehicle|car|truck|van/i.test(query)) {
            intent = 'SEARCH_VEHICLE';
          } else {
            intent = 'SEARCH_DETECTIONS';
          }
          confidence = 0.8;
        }
        // Investigation
        else if (/track|investigate|trace|journey|where.*go|follow/i.test(query)) {
          intent = 'INVESTIGATE_PERSON';
          confidence = 0.85;
        }
        // Analytics
        else if (/occupancy|how many people|count.*people|people.*in/i.test(query)) {
          intent = 'ANALYTICS_OCCUPANCY';
          confidence = 0.85;
        }
        // Reports
        else if (/report|generate.*report|create.*report/i.test(query)) {
          if (/incident/i.test(query)) {
            intent = 'REPORT_INCIDENTS';
          } else if (/analytic/i.test(query)) {
            intent = 'REPORT_ANALYTICS';
          } else if (/compliance/i.test(query)) {
            intent = 'REPORT_COMPLIANCE';
          } else {
            intent = 'REPORT_INCIDENTS';
          }
          confidence = 0.8;
        }
        // Help
        else if (/help|what.*can.*do|capabilities|commands/i.test(query)) {
          intent = 'HELP';
          confidence = 0.95;
        }
        
        // Extract entities
        const entities: Entity[] = [];
        const parameters: any = {};
        
        // Camera number
        const cameraMatch = query.match(/camera[- ]?(\d+|[a-z0-9]+)/i);
        if (cameraMatch && cameraMatch[1]) {
          entities.push({ type: 'camera', value: cameraMatch[1], confidence: 0.9 });
          parameters.camera = cameraMatch[1];
        }
        
        // Color
        const colorMatch = query.match(/(red|blue|green|yellow|black|white|gray|grey)/i);
        if (colorMatch && colorMatch[1]) {
          const color = colorMatch[1].toLowerCase();
          entities.push({ type: 'color', value: color, confidence: 0.9 });
          parameters.color = color;
        }
        
        // Object type
        if (/person|people|man|woman/i.test(query)) {
          parameters.objectType = 'person';
        } else if (/vehicle|car|truck|van/i.test(query)) {
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
  

  clearContext(_sessionId: string): void {}

  getStatistics() {
    return { provider: "local", model: "rule-based", hasApiKey: false, fallbackEnabled: true, activeConversations: 0 };
  }
}

export function createOpenAIIntentParser(config?: OpenAIIntentParserConfig): OpenAIIntentParser {
  return new OpenAIIntentParser(config);
}
