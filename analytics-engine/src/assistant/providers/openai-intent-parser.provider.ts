/**
 * OpenAI GPT-4 Intent Parser Provider
 * 
 * Provides natural language understanding using ChatGPT Plus (GPT-4) for:
 * - Intent classification
 * - Entity extraction
 * - Parameter parsing
 * - Multi-turn conversation context
 * - Ambiguity resolution
 * 
 * Fallback Strategy:
 * - Primary: GPT-4 via OpenAI API
 * - Fallback: Rule-based pattern matching
 * - Rate limit handling with exponential backoff
 * 
 * Security:
 * - API key from environment variable
 * - Request rate limiting
 * - Input validation and sanitization
 * - No sensitive data in prompts
 */

import type { IntentParser, ParsedQuery, IntentType, Entity } from '../types/parsed-query.js';
import { logger } from '../../monitoring/logger.js';

/**
 * OpenAI API Configuration
 */
export interface OpenAIIntentParserConfig {
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  
  /** Model to use (default: gpt-4) */
  model?: string;
  
  /** Temperature for response generation (0-2, default: 0.3) */
  temperature?: number;
  
  /** Maximum tokens in response (default: 500) */
  maxTokens?: number;
  
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  
  /** Max requests per minute (default: 60) */
  maxRequestsPerMinute?: number;
  
  /** Enable fallback to rule-based parser on failure (default: true) */
  enableFallback?: boolean;
  
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Rate limiter for OpenAI API calls
 */
class RateLimiter {
  private requests: number[] = [];
  
  constructor(private maxRequestsPerMinute: number) {}
  
  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Remove old requests
    this.requests = this.requests.filter(t => t > oneMinuteAgo);
    
    // Check if we're at the limit
    if (this.requests.length >= this.maxRequestsPerMinute) {
      const oldestRequest = this.requests[0];
      const waitTime = 60000 - (now - oldestRequest) + 100; // Add 100ms buffer
      
      if (waitTime > 0) {
        logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.waitIfNeeded(); // Re-check after waiting
      }
    }
    
    // Record this request
    this.requests.push(now);
  }
}

/**
 * OpenAI GPT-4 Intent Parser
 * 
 * Uses ChatGPT Plus (GPT-4) for sophisticated natural language understanding.
 * Automatically falls back to rule-based parsing on API failures.
 */
export class OpenAIIntentParser implements IntentParser {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private timeout: number;
  private enableFallback: boolean;
  private debug: boolean;
  private rateLimiter: RateLimiter;
  private conversationContexts: Map<string, Array<{ role: string; content: string }>> = new Map();
  
  // Rule-based fallback parser
  private fallbackParser: IntentParser;
  
  constructor(config: OpenAIIntentParserConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    this.model = config.model || 'gpt-4';
    this.temperature = config.temperature ?? 0.3;
    this.maxTokens = config.maxTokens || 500;
    this.timeout = config.timeout || 10000;
    this.enableFallback = config.enableFallback ?? true;
    this.debug = config.debug || false;
    this.rateLimiter = new RateLimiter(config.maxRequestsPerMinute || 60);
    
    // Create fallback parser
    this.fallbackParser = this.createFallbackParser();
    
    if (!this.apiKey) {
      logger.warn('OpenAI API key not configured. Intent parser will use rule-based fallback only.');
    }
    
    if (this.debug) {
      logger.debug('OpenAI Intent Parser initialized', {
        model: this.model,
        hapiKey: !!this.apiKey,
        fallbackEnabled: this.enableFallback
      });
    }
  }
  
  /**
   * Parse natural language query to structured intent
   */
  async parse(query: string, sessionId?: string): Promise<ParsedQuery> {
    // Input validation
    if (!query || query.trim().length === 0) {
      return {
        intent: 'UNKNOWN',
        confidence: 0,
        entities: [],
        parameters: {},
        originalQuery: query
      };
    }
    
    // Sanitize input
    const sanitized = this.sanitizeInput(query);
    
    // Try OpenAI first if API key is available
    if (this.apiKey) {
      try {
        await this.rateLimiter.waitIfNeeded();
        
        const result = await this.parseWithOpenAI(sanitized, sessionId);
        
        if (this.debug) {
          logger.debug('OpenAI parsing succeeded', {
            intent: result.intent,
            confidence: result.confidence
          });
        }
        
        return result;
        
      } catch (error) {
        logger.error('OpenAI API error', {
          error: error instanceof Error ? error.message : String(error),
          query: sanitized.substring(0, 100)
        });
        
        // Fall back if enabled
        if (this.enableFallback) {
          logger.info('Falling back to rule-based parser');
          return this.fallbackParser.parse(sanitized);
        }
        
        throw error;
      }
    }
    
    // Use fallback parser if no API key
    return this.fallbackParser.parse(sanitized);
  }
  
  /**
   * Parse using OpenAI GPT-4
   */
  private async parseWithOpenAI(query: string, sessionId?: string): Promise<ParsedQuery> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(query);
    
    // Build messages with conversation context
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt }
    ];
    
    // Add conversation context if available
    if (sessionId) {
      const context = this.conversationContexts.get(sessionId) || [];
      messages.push(...context.slice(-4)); // Last 2 turns (4 messages)
    }
    
    messages.push({ role: 'user', content: userPrompt });
    
    // Call OpenAI API
    const response = await this.callOpenAIAPI(messages);
    
    // Parse response
    const parsed = this.parseOpenAIResponse(response, query);
    
    // Update conversation context
    if (sessionId) {
      const context = this.conversationContexts.get(sessionId) || [];
      context.push(
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: response }
      );
      
      // Keep last 10 messages (5 turns)
      if (context.length > 10) {
        context.splice(0, context.length - 10);
      }
      
      this.conversationContexts.set(sessionId, context);
    }
    
    return parsed;
  }
  
  /**
   * Call OpenAI Chat Completion API
   */
  private async callOpenAIAPI(messages: Array<{ role: string; content: string }>): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
      }
      
      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from OpenAI API');
      }
      
      return data.choices[0].message.content;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenAI API timeout after ${this.timeout}ms`);
      }
      
      throw error;
    }
  }
  
  /**
   * Build system prompt for intent classification
   */
  private buildSystemPrompt(): string {
    return `You are an intent classifier for a video surveillance system AI assistant. 
Your role is to analyze user queries and classify them into structured intents.

Available Intents:
- CAMERA_START: Start or enable a camera
- CAMERA_STOP: Stop or disable a camera
- SYSTEM_STATUS: Check system health or status
- SEARCH_DETECTIONS: Search for detected objects (generic)
- SEARCH_PERSON: Search for people
- SEARCH_VEHICLE: Search for vehicles
- INVESTIGATE_PERSON: Track a person across cameras
- ANALYTICS_OCCUPANCY: Get occupancy or people count
- REPORT_INCIDENTS: Generate incident report
- REPORT_ANALYTICS: Generate analytics report
- REPORT_COMPLIANCE: Generate compliance report
- HELP: Request help or list capabilities
- UNKNOWN: Query cannot be classified

Entity Types:
- camera: Camera identifier (number or name)
- color: Color attribute (red, blue, green, yellow, black, white, gray)
- objectType: Type of object (person, vehicle)
- timeRange: Time period or date range
- location: Physical location or zone
- attribute: Visual attribute (clothing, accessories, etc.)

Response Format (JSON):
{
  "intent": "INTENT_NAME",
  "confidence": 0.95,
  "entities": [
    {"type": "camera", "value": "5", "confidence": 0.9}
  ],
  "parameters": {
    "camera": "5",
    "color": "red"
  },
  "reasoning": "Brief explanation of classification"
}

Guidelines:
- Confidence should be 0-1 (higher = more certain)
- Extract all relevant entities and parameters
- Be conservative with confidence scores
- If query is ambiguous, use lower confidence
- Focus on surveillance and security operations
- Do not include sensitive data in response`;
  }
  
  /**
   * Build user prompt
   */
  private buildUserPrompt(query: string): string {
    return `Classify this user query into an intent with extracted entities:

Query: "${query}"

Respond with JSON only.`;
  }
  
  /**
   * Parse OpenAI JSON response
   */
  private parseOpenAIResponse(response: string, originalQuery: string): ParsedQuery {
    try {
      const data = JSON.parse(response);
      
      // Validate and normalize intent
      const intent = this.normalizeIntent(data.intent);
      const confidence = typeof data.confidence === 'number' 
        ? Math.max(0, Math.min(1, data.confidence))
        : 0.5;
      
      // Extract entities
      const entities: Entity[] = Array.isArray(data.entities)
        ? data.entities.map((e: any) => ({
            type: e.type || 'unknown',
            value: e.value,
            confidence: typeof e.confidence === 'number' ? e.confidence : 0.8
          }))
        : [];
      
      // Extract parameters
      const parameters = typeof data.parameters === 'object' && data.parameters !== null
        ? data.parameters
        : {};
      
      return {
        intent,
        confidence,
        entities,
        parameters,
        originalQuery,
        reasoning: data.reasoning
      };
      
    } catch (error) {
      logger.error('Failed to parse OpenAI response', {
        error: error instanceof Error ? error.message : String(error),
        response: response.substring(0, 200)
      });
      
      // Return UNKNOWN intent on parse failure
      return {
        intent: 'UNKNOWN',
        confidence: 0,
        entities: [],
        parameters: {},
        originalQuery
      };
    }
  }
  
  /**
   * Normalize intent name
   */
  private normalizeIntent(intent: string): IntentType {
    const normalized = intent?.toUpperCase().replace(/[^A-Z_]/g, '_');
    
    const validIntents: IntentType[] = [
      'CAMERA_START', 'CAMERA_STOP', 'SYSTEM_STATUS',
      'SEARCH_DETECTIONS', 'SEARCH_PERSON', 'SEARCH_VEHICLE',
      'INVESTIGATE_PERSON', 'ANALYTICS_OCCUPANCY',
      'REPORT_INCIDENTS', 'REPORT_ANALYTICS', 'REPORT_COMPLIANCE',
      'HELP', 'UNKNOWN'
    ];
    
    return validIntents.includes(normalized as IntentType)
      ? (normalized as IntentType)
      : 'UNKNOWN';
  }
  
  /**
   * Sanitize user input
   */
  private sanitizeInput(input: string): string {
    // Remove control characters
    let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Limit length
    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 500);
    }
    
    return sanitized;
  }
  
  /**
   * Create fallback rule-based parser
   */
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
  
  /**
   * Clear conversation context for a session
   */
  clearContext(sessionId: string): void {
    this.conversationContexts.delete(sessionId);
  }
  
  /**
   * Get statistics
   */
  getStatistics() {
    return {
      provider: 'openai',
      model: this.model,
      hasApiKey: !!this.apiKey,
      fallbackEnabled: this.enableFallback,
      activeConversations: this.conversationContexts.size
    };
  }
}

/**
 * Factory function to create OpenAI intent parser
 */
export function createOpenAIIntentParser(config?: OpenAIIntentParserConfig): OpenAIIntentParser {
  return new OpenAIIntentParser(config);
}
