/**
 * Query Parser
 * 
 * Parses natural language queries into structured CommanderQuery objects.
 */

import { z } from 'zod';
import { OllamaClient } from './ollama-client.js';
import type { CommanderQuery, CommanderIntent } from '../types/index.js';

const QuerySchema = z.object({
  intent: z.enum(['investigate', 'search', 'status', 'summarize', 'explain', 'compare', 'analyze']),
  timeRange: z.object({
    relativeMinutes: z.number().optional(),
    relativeHours: z.number().optional(),
    relativeDays: z.number().optional(),
  }).optional(),
  filters: z.object({
    abnormalOnly: z.boolean().optional(),
    severities: z.array(z.string()).optional(),
    eventTypes: z.array(z.string()).optional(),
    minConfidence: z.number().optional(),
  }).optional(),
  scope: z.object({
    branchId: z.string().optional(),
    regionId: z.string().optional(),
  }).optional(),
  target: z.object({
    type: z.string().optional(),
    id: z.string().optional(),
  }).optional(),
});

export class QueryParser {
  private readonly ollama: OllamaClient;
  private readonly useLLM: boolean;

  constructor(options: {
    ollamaUrl?: string;
    ollamaModel?: string;
    useLLM?: boolean;
  } = {}) {
    this.ollama = new OllamaClient({
      baseUrl: options.ollamaUrl,
      defaultModel: options.ollamaModel,
    });
    this.useLLM = options.useLLM ?? true;
  }

  /**
   * Parse natural language query
   */
  async parse(query: string, context?: { tenantId: string }): Promise<CommanderQuery> {
    // Try rule-based parsing first
    const ruleBasedResult = this.parseWithRules(query);
    
    if (ruleBasedResult) {
      return ruleBasedResult;
    }

    // Fall back to LLM if available
    if (this.useLLM) {
      try {
        const llmResult = await this.parseWithLLM(query);
        return llmResult;
      } catch (error) {
        console.warn('LLM parsing failed, using fallback:', error);
      }
    }

    // Final fallback
    return this.getFallbackQuery(query);
  }

  /**
   * Parse using rule-based patterns
   */
  private parseWithRules(query: string): CommanderQuery | null {
    const normalized = query.toLowerCase().trim();

    // Pattern: "show me abnormal/everything abnormal"
    if (normalized.includes('abnormal') || normalized.includes('suspicious')) {
      const timeRange = this.extractTimeRange(normalized);
      
      return {
        intent: 'investigate',
        timeRange,
        filters: {
          abnormalOnly: true,
        },
      };
    }

    // Pattern: "show me everything in the last X minutes/hours"
    if (normalized.match(/last\s+\d+\s+(minute|hour|day)/)) {
      const timeRange = this.extractTimeRange(normalized);
      
      return {
        intent: 'search',
        timeRange,
      };
    }

    // Pattern: "critical events" or "high priority"
    if (normalized.includes('critical') || normalized.includes('high priority')) {
      return {
        intent: 'investigate',
        filters: {
          severities: ['critical', 'high'],
        },
        timeRange: {
          relativeHours: 1,
        },
      };
    }

    // Pattern: "what happened at branch X"
    const branchMatch = normalized.match(/branch\s+(\w+)/i);
    if (branchMatch) {
      return {
        intent: 'search',
        scope: {
          branchId: branchMatch[1],
        },
        timeRange: {
          relativeHours: 24,
        },
      };
    }

    return null;
  }

  /**
   * Extract time range from query
   */
  private extractTimeRange(query: string): CommanderQuery['timeRange'] {
    const minuteMatch = query.match(/last\s+(\d+)\s+minutes?/i);
    if (minuteMatch) {
      return { relativeMinutes: parseInt(minuteMatch[1]) };
    }

    const hourMatch = query.match(/last\s+(\d+)\s+hours?/i);
    if (hourMatch) {
      return { relativeHours: parseInt(hourMatch[1]) };
    }

    const dayMatch = query.match(/last\s+(\d+)\s+days?/i);
    if (dayMatch) {
      return { relativeDays: parseInt(dayMatch[1]) };
    }

    // Default to last 30 minutes
    return { relativeMinutes: 30 };
  }

  /**
   * Parse using LLM
   */
  private async parseWithLLM(query: string): Promise<CommanderQuery> {
    const systemPrompt = `You are a security query parser for a surveillance system.

Convert the user's natural language request into structured JSON.

Current time: ${new Date().toISOString()}

Available intents:
- investigate: Create new investigation from abnormal events
- search: Search for specific events
- status: Get status of assets/systems
- summarize: Summarize existing investigation
- explain: Explain an incident or event
- compare: Compare time periods or locations
- analyze: Analyze patterns or trends

Time range examples:
- "last 30 minutes" → {"relativeMinutes": 30}
- "last 2 hours" → {"relativeHours": 2}
- "today" → {"relativeDays": 1}

Filters:
- abnormalOnly: true for "abnormal", "suspicious", "unusual"
- severities: ["critical", "high", "medium", "low", "info"]

Do not invent branch IDs, camera IDs, or other identifiers not mentioned in the query.

Respond ONLY with valid JSON matching this schema:
{
  "intent": "investigate|search|status|summarize|explain|compare|analyze",
  "timeRange": {
    "relativeMinutes": number (optional),
    "relativeHours": number (optional),
    "relativeDays": number (optional)
  },
  "filters": {
    "abnormalOnly": boolean (optional),
    "severities": string[] (optional),
    "minConfidence": number (optional)
  },
  "scope": {
    "branchId": string (optional)
  }
}`;

    const response = await this.ollama.generate(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      {
        format: 'json',
        temperature: 0.1,
        maxTokens: 500,
      }
    );

    // Parse and validate response
    try {
      const parsed = JSON.parse(response);
      const validated = QuerySchema.parse(parsed);
      
      return {
        intent: validated.intent,
        timeRange: validated.timeRange,
        filters: validated.filters as any,
        scope: validated.scope as any,
        target: validated.target,
        naturalLanguageQuery: query,
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      throw new Error('Invalid LLM response format');
    }
  }

  /**
   * Get fallback query when parsing fails
   */
  private getFallbackQuery(query: string): CommanderQuery {
    return {
      intent: 'search',
      timeRange: {
        relativeMinutes: 30,
      },
      naturalLanguageQuery: query,
    };
  }

  /**
   * Check if LLM is available
   */
  async isLLMAvailable(): Promise<boolean> {
    return this.ollama.isAvailable();
  }
}
