/**
 * Investigation Summarizer
 * 
 * Generates natural language summaries of security investigations using local LLM.
 */

import { OllamaClient } from './ollama-client.js';
import type { Investigation, Incident, SecurityEvent } from '../types/index.js';

export class InvestigationSummarizer {
  private readonly ollama: OllamaClient;

  constructor(options: {
    ollamaUrl?: string;
    ollamaModel?: string;
  } = {}) {
    this.ollama = new OllamaClient({
      baseUrl: options.ollamaUrl,
      defaultModel: options.ollamaModel,
    });
  }

  /**
   * Generate summary for investigation
   */
  async summarize(investigation: Investigation): Promise<string> {
    try {
      // Check if LLM is available
      const available = await this.ollama.isAvailable();
      
      if (!available) {
        return this.generateFallbackSummary(investigation);
      }

      // Build structured context
      const context = this.buildInvestigationContext(investigation);

      const systemPrompt = `You are a security analyst summarizing surveillance investigations.

Rules:
1. Only use the supplied evidence and facts
2. Do not invent identities, causes, or details not in the data
3. Distinguish facts from hypotheses clearly
4. Mention specific timestamps in local time
5. Mention camera/door IDs and locations
6. Mention missing evidence if relevant
7. Keep summary concise but complete (2-4 paragraphs)
8. Use professional security terminology

Format:
- First paragraph: What happened (facts)
- Second paragraph: Supporting evidence
- Third paragraph (if needed): Hypotheses and uncertainties
- Fourth paragraph (if needed): Recommended actions`;

      const userPrompt = `Summarize this security investigation:

${context}

Provide a clear, factual summary suitable for security operations.`;

      const response = await this.ollama.generate(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          temperature: 0.2,
          maxTokens: 800,
        }
      );

      return response.trim();
    } catch (error) {
      console.error('LLM summarization failed:', error);
      return this.generateFallbackSummary(investigation);
    }
  }

  /**
   * Summarize a single incident
   */
  async summarizeIncident(
    incident: Incident,
    events: SecurityEvent[]
  ): Promise<string> {
    try {
      const available = await this.ollama.isAvailable();
      
      if (!available) {
        return incident.explanation;
      }

      const context = this.buildIncidentContext(incident, events);

      const systemPrompt = `You are a security analyst explaining security incidents.

Generate a clear, concise explanation (1-2 paragraphs) of what happened.

Rules:
- Only use provided evidence
- Be specific about times and locations
- Mention affected assets
- Explain the security significance`;

      const response = await this.ollama.generate(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Explain this incident:\n\n${context}` },
        ],
        {
          temperature: 0.2,
          maxTokens: 400,
        }
      );

      return response.trim();
    } catch (error) {
      console.error('Incident summarization failed:', error);
      return incident.explanation;
    }
  }

  /**
   * Build investigation context for LLM
   */
  private buildInvestigationContext(investigation: Investigation): string {
    let context = `Investigation: ${investigation.title}\n`;
    context += `Time Range: ${investigation.timeRange.from.toISOString()} to ${investigation.timeRange.to.toISOString()}\n`;
    context += `Priority: ${investigation.priority}\n`;
    context += `Status: ${investigation.status}\n\n`;

    // Incidents
    if (investigation.incidents && investigation.incidents.length > 0) {
      context += `Incidents (${investigation.incidents.length}):\n`;
      for (const incident of investigation.incidents) {
        context += `- ${incident.title} (${incident.severity})\n`;
        context += `  Type: ${incident.type}\n`;
        context += `  Time: ${incident.startedAt.toISOString()}\n`;
        context += `  Confidence: ${(incident.confidence * 100).toFixed(0)}%\n`;
        context += `  Explanation: ${incident.explanation}\n`;
        
        if (incident.affectedAssets.length > 0) {
          context += `  Affected: ${incident.affectedAssets.map(a => `${a.type} ${a.name || a.id}`).join(', ')}\n`;
        }
        context += '\n';
      }
    }

    // Timeline highlights
    if (investigation.timeline && investigation.timeline.length > 0) {
      context += `Timeline (${investigation.timeline.length} events):\n`;
      const highlights = investigation.timeline
        .filter(t => t.severity === 'critical' || t.severity === 'high')
        .slice(0, 10); // Top 10 critical events
      
      for (const entry of highlights) {
        context += `- ${entry.timestamp.toISOString()}: ${entry.title}\n`;
      }
      context += '\n';
    }

    // Evidence
    if (investigation.evidence && investigation.evidence.length > 0) {
      context += `Evidence (${investigation.evidence.length} items):\n`;
      const evidenceTypes = new Map<string, number>();
      for (const e of investigation.evidence) {
        evidenceTypes.set(e.type, (evidenceTypes.get(e.type) || 0) + 1);
      }
      for (const [type, count] of evidenceTypes) {
        context += `- ${type}: ${count}\n`;
      }
      context += '\n';
    }

    // Hypotheses
    if (investigation.hypotheses && investigation.hypotheses.length > 0) {
      context += `Hypotheses:\n`;
      for (const hypothesis of investigation.hypotheses) {
        context += `- ${hypothesis.description} (confidence: ${(hypothesis.confidence * 100).toFixed(0)}%, status: ${hypothesis.status})\n`;
      }
      context += '\n';
    }

    // Recommended actions
    if (investigation.recommendedActions && investigation.recommendedActions.length > 0) {
      context += `Recommended Actions:\n`;
      for (const action of investigation.recommendedActions) {
        context += `- ${action.title}${action.required ? ' (REQUIRED)' : ''}\n`;
      }
    }

    return context;
  }

  /**
   * Build incident context for LLM
   */
  private buildIncidentContext(incident: Incident, events: SecurityEvent[]): string {
    let context = `Incident: ${incident.title}\n`;
    context += `Type: ${incident.type}\n`;
    context += `Severity: ${incident.severity}\n`;
    context += `Confidence: ${(incident.confidence * 100).toFixed(0)}%\n`;
    context += `Started: ${incident.startedAt.toISOString()}\n\n`;

    if (events.length > 0) {
      context += `Related Events:\n`;
      for (const event of events) {
        context += `- ${event.timestamp.toISOString()}: ${event.type}\n`;
        context += `  Source: ${event.source.name || event.source.id}\n`;
        if (event.location?.zone) {
          context += `  Location: ${event.location.zone}\n`;
        }
      }
    }

    if (incident.affectedAssets.length > 0) {
      context += `\nAffected Assets:\n`;
      for (const asset of incident.affectedAssets) {
        context += `- ${asset.type}: ${asset.name || asset.id}\n`;
      }
    }

    return context;
  }

  /**
   * Generate fallback summary without LLM
   */
  private generateFallbackSummary(investigation: Investigation): string {
    const parts: string[] = [];

    // Header
    parts.push(`Investigation: ${investigation.title}`);
    
    if (investigation.description) {
      parts.push(investigation.description);
    }

    // Incident summary
    if (investigation.incidents && investigation.incidents.length > 0) {
      const critical = investigation.incidents.filter(i => i.severity === 'critical').length;
      const high = investigation.incidents.filter(i => i.severity === 'high').length;
      
      let incidentSummary = `Found ${investigation.incidents.length} correlated incident${investigation.incidents.length !== 1 ? 's' : ''}`;
      
      if (critical > 0 || high > 0) {
        const severityCounts = [];
        if (critical > 0) severityCounts.push(`${critical} critical`);
        if (high > 0) severityCounts.push(`${high} high`);
        incidentSummary += ` (${severityCounts.join(', ')})`;
      }
      
      incidentSummary += '.';
      parts.push(incidentSummary);

      // List critical incidents
      const criticalIncidents = investigation.incidents
        .filter(i => i.severity === 'critical')
        .slice(0, 3);
      
      if (criticalIncidents.length > 0) {
        parts.push('\nCritical Incidents:');
        for (const incident of criticalIncidents) {
          parts.push(`- ${incident.title}`);
        }
      }
    }

    // Evidence summary
    if (investigation.evidence && investigation.evidence.length > 0) {
      parts.push(`\nCollected ${investigation.evidence.length} pieces of evidence including video footage, snapshots, and system logs.`);
    }

    // Recommended actions
    const requiredActions = investigation.recommendedActions?.filter(a => a.required) || [];
    if (requiredActions.length > 0) {
      parts.push(`\n${requiredActions.length} required action${requiredActions.length !== 1 ? 's' : ''} identified.`);
    }

    return parts.join(' ');
  }
}
