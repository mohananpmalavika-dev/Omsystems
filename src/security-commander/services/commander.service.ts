/**
 * Security Commander Service
 * 
 * Main orchestration service that ties everything together:
 * - Query parsing
 * - Event/incident search
 * - Investigation creation
 * - Evidence collection
 * - AI summarization
 */

import type { Pool } from 'pg';
import { QueryParser } from '../llm/query-parser.js';
import { InvestigationSummarizer } from '../llm/investigation-summarizer.js';
import { InvestigationService } from './investigation.service.js';
import { SecurityEventRepository } from '../repositories/security-event.repository.js';
import { IncidentRepository } from '../repositories/incident.repository.js';
import { InvestigationRepository } from '../repositories/investigation.repository.js';
import { AnomalyDetectionEngine } from '../anomaly/anomaly-engine.js';
import type {
  CommanderQuery,
  CommanderResponse,
  CommanderContext,
  Investigation,
  InvestigationSummary,
} from '../types/index.js';

export interface CommanderServiceOptions {
  ollamaUrl?: string;
  ollamaModel?: string;
  useLLM?: boolean;
  evidenceStoragePath?: string;
}

export class SecurityCommanderService {
  private readonly queryParser: QueryParser;
  private readonly summarizer: InvestigationSummarizer;
  private readonly investigationService: InvestigationService;
  private readonly eventRepository: SecurityEventRepository;
  private readonly incidentRepository: IncidentRepository;
  private readonly investigationRepository: InvestigationRepository;
  private readonly anomalyEngine: AnomalyDetectionEngine;

  constructor(
    private readonly pool: Pool,
    options: CommanderServiceOptions = {}
  ) {
    this.queryParser = new QueryParser({
      ollamaUrl: options.ollamaUrl,
      ollamaModel: options.ollamaModel,
      useLLM: options.useLLM,
    });

    this.summarizer = new InvestigationSummarizer({
      ollamaUrl: options.ollamaUrl,
      ollamaModel: options.ollamaModel,
    });

    this.investigationService = new InvestigationService(pool);
    this.eventRepository = new SecurityEventRepository(pool);
    this.incidentRepository = new IncidentRepository(pool);
    this.investigationRepository = new InvestigationRepository(pool);
    this.anomalyEngine = new AnomalyDetectionEngine(pool);
  }

  /**
   * Execute a commander query
   */
  async execute(
    query: string,
    context: CommanderContext
  ): Promise<CommanderResponse> {
    const startTime = Date.now();

    try {
      // Parse natural language query
      const parsedQuery = await this.queryParser.parse(query, {
        tenantId: context.tenantId,
      });

      // Execute based on intent
      switch (parsedQuery.intent) {
        case 'investigate':
          return await this.handleInvestigation(parsedQuery, context);

        case 'search':
          return await this.handleSearch(parsedQuery, context);

        case 'status':
          return await this.handleStatus(parsedQuery, context);

        case 'summarize':
          return await this.handleSummary(parsedQuery, context);

        case 'explain':
          return await this.handleExplain(parsedQuery, context);

        default:
          return {
            type: 'error',
            message: `Unsupported intent: ${parsedQuery.intent}`,
            error: {
              code: 'UNSUPPORTED_INTENT',
              message: 'This type of query is not yet supported',
            },
          };
      }
    } catch (error) {
      return {
        type: 'error',
        message: 'Failed to process query',
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error,
        },
      };
    } finally {
      const executionTime = Date.now() - startTime;
      console.log(`Commander query executed in ${executionTime}ms`);
    }
  }

  /**
   * Handle investigation intent
   */
  private async handleInvestigation(
    query: CommanderQuery,
    context: CommanderContext
  ): Promise<CommanderResponse> {
    // Calculate time range
    const { from, to } = this.calculateTimeRange(query.timeRange);

    // Create investigation
    const investigation = await this.investigationService.createInvestigationFromQuery({
      tenantId: context.tenantId,
      title: this.generateInvestigationTitle(query),
      description: query.naturalLanguageQuery,
      timeRange: { from, to },
      branchId: query.scope?.branchId,
      branchIds: query.scope?.branchIds,
      abnormalOnly: query.filters?.abnormalOnly,
      minSeverity: query.filters?.severities?.[0],
      userId: context.userId,
    });

    // Generate AI summary
    let summary: string | undefined;
    try {
      summary = await this.summarizer.summarize(investigation);
      
      // Update investigation with summary
      await this.investigationRepository.updateInvestigation(investigation.id, {
        summary,
      });
    } catch (error) {
      console.warn('Failed to generate summary:', error);
    }

    // Build response
    return {
      type: 'investigation',
      message: this.buildInvestigationMessage(investigation),
      investigation,
      investigationSummary: {
        id: investigation.id,
        title: investigation.title,
        status: investigation.status,
        priority: investigation.priority,
        startedAt: investigation.startedAt,
        incidentCount: investigation.incidents?.length || 0,
        criticalIncidentCount: investigation.incidents?.filter(i => i.severity === 'critical').length || 0,
        highIncidentCount: investigation.incidents?.filter(i => i.severity === 'high').length || 0,
        evidenceCount: investigation.evidence?.length || 0,
        affectedBranches: [],
        summary,
      },
      incidents: investigation.incidentSummaries,
      timeline: investigation.timeline,
      evidence: investigation.evidenceSummaries,
      recommendedActions: investigation.recommendedActions,
      summary: {
        totalIncidents: investigation.incidents?.length || 0,
        correlatedIncidents: investigation.incidents?.length || 0,
        criticalIncidents: investigation.incidents?.filter(i => i.severity === 'critical').length || 0,
        highIncidents: investigation.incidents?.filter(i => i.severity === 'high').length || 0,
        affectedAssets: investigation.affectedAssets?.length || 0,
      },
      queryMetadata: {
        searchedFrom: from,
        searchedTo: to,
        executionTime: Date.now(),
      },
    };
  }

  /**
   * Handle search intent
   */
  private async handleSearch(
    query: CommanderQuery,
    context: CommanderContext
  ): Promise<CommanderResponse> {
    const { from, to } = this.calculateTimeRange(query.timeRange);

    // Search events
    const events = await this.eventRepository.searchEvents({
      tenantId: context.tenantId,
      branchId: query.scope?.branchId,
      from,
      to,
      types: query.filters?.eventTypes as any,
      severities: query.filters?.severities as any,
      abnormalOnly: query.filters?.abnormalOnly,
      limit: 1000,
    });

    // Search incidents
    const incidents = await this.incidentRepository.searchIncidents({
      tenantId: context.tenantId,
      branchId: query.scope?.branchId,
      from,
      to,
      severities: query.filters?.severities as any,
      limit: 100,
    });

    const incidentSummaries = await this.incidentRepository.getIncidentSummaries({
      tenantId: context.tenantId,
      branchId: query.scope?.branchId,
      from,
      to,
      limit: 100,
    });

    return {
      type: 'search_results',
      message: `Found ${events.length} events and ${incidents.length} incidents`,
      incidents: incidentSummaries,
      summary: {
        totalEvents: events.length,
        totalIncidents: incidents.length,
        criticalIncidents: incidents.filter(i => i.severity === 'critical').length,
        highIncidents: incidents.filter(i => i.severity === 'high').length,
      },
      queryMetadata: {
        searchedFrom: from,
        searchedTo: to,
        eventsScanned: events.length,
        incidentsFound: incidents.length,
      },
    };
  }

  /**
   * Handle status intent
   */
  private async handleStatus(
    query: CommanderQuery,
    context: CommanderContext
  ): Promise<CommanderResponse> {
    // Get recent anomaly stats
    const stats = await this.anomalyEngine.getAnomalyStats(
      context.tenantId,
      new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      new Date(),
      query.scope?.branchId
    );

    return {
      type: 'status',
      message: `System Status: ${stats.totalEvents} events in last 24 hours, ${stats.abnormalEvents} abnormal (${stats.abnormalPercentage.toFixed(1)}%)`,
      summary: {
        totalEvents: stats.totalEvents,
        abnormalEvents: stats.abnormalEvents,
      },
      queryMetadata: {
        executionTime: Date.now(),
      },
    };
  }

  /**
   * Handle summary intent
   */
  private async handleSummary(
    query: CommanderQuery,
    context: CommanderContext
  ): Promise<CommanderResponse> {
    // Get active investigation from context
    const investigationId = context.activeInvestigationId || query.target?.id;

    if (!investigationId) {
      return {
        type: 'error',
        message: 'No investigation specified',
        error: {
          code: 'NO_INVESTIGATION',
          message: 'Please specify an investigation to summarize',
        },
      };
    }

    const investigation = await this.investigationRepository.getInvestigation(investigationId);

    if (!investigation) {
      return {
        type: 'error',
        message: 'Investigation not found',
        error: {
          code: 'NOT_FOUND',
          message: 'The specified investigation does not exist',
        },
      };
    }

    // Generate summary
    const summary = await this.summarizer.summarize(investigation);

    return {
      type: 'summary',
      message: summary,
      investigation,
      queryMetadata: {
        executionTime: Date.now(),
      },
    };
  }

  /**
   * Handle explain intent
   */
  private async handleExplain(
    query: CommanderQuery,
    context: CommanderContext
  ): Promise<CommanderResponse> {
    // This would explain a specific incident or event
    return {
      type: 'explanation',
      message: 'Explanation feature coming soon',
      queryMetadata: {
        executionTime: Date.now(),
      },
    };
  }

  /**
   * Calculate time range from query
   */
  private calculateTimeRange(timeRange?: CommanderQuery['timeRange']): {
    from: Date;
    to: Date;
  } {
    const now = new Date();

    if (!timeRange) {
      // Default: last 30 minutes
      return {
        from: new Date(now.getTime() - 30 * 60 * 1000),
        to: now,
      };
    }

    if (timeRange.relativeMinutes) {
      return {
        from: new Date(now.getTime() - timeRange.relativeMinutes * 60 * 1000),
        to: now,
      };
    }

    if (timeRange.relativeHours) {
      return {
        from: new Date(now.getTime() - timeRange.relativeHours * 60 * 60 * 1000),
        to: now,
      };
    }

    if (timeRange.relativeDays) {
      return {
        from: new Date(now.getTime() - timeRange.relativeDays * 24 * 60 * 60 * 1000),
        to: now,
      };
    }

    // Fallback
    return {
      from: new Date(now.getTime() - 30 * 60 * 1000),
      to: now,
    };
  }

  /**
   * Generate investigation title
   */
  private generateInvestigationTitle(query: CommanderQuery): string {
    const timeDesc = this.describeTimeRange(query.timeRange);
    
    if (query.filters?.abnormalOnly) {
      return `Abnormal Activity - ${timeDesc}`;
    }

    if (query.filters?.severities?.includes('critical')) {
      return `Critical Incidents - ${timeDesc}`;
    }

    if (query.scope?.branchId) {
      return `Branch Investigation - ${timeDesc}`;
    }

    return `Security Investigation - ${timeDesc}`;
  }

  /**
   * Describe time range in human-readable format
   */
  private describeTimeRange(timeRange?: CommanderQuery['timeRange']): string {
    if (!timeRange) return 'Last 30 Minutes';

    if (timeRange.relativeMinutes) {
      return `Last ${timeRange.relativeMinutes} Minutes`;
    }

    if (timeRange.relativeHours) {
      return `Last ${timeRange.relativeHours} Hours`;
    }

    if (timeRange.relativeDays) {
      return `Last ${timeRange.relativeDays} Days`;
    }

    return 'Recent Activity';
  }

  /**
   * Build investigation message
   */
  private buildInvestigationMessage(investigation: Investigation): string {
    const incidentCount = investigation.incidents?.length || 0;
    const criticalCount = investigation.incidents?.filter(i => i.severity === 'critical').length || 0;
    const highCount = investigation.incidents?.filter(i => i.severity === 'high').length || 0;

    let message = `Investigation created: ${investigation.title}. `;

    if (incidentCount === 0) {
      message += 'No incidents found in the specified time range.';
    } else {
      message += `Found ${incidentCount} correlated incident${incidentCount !== 1 ? 's' : ''}`;
      
      if (criticalCount > 0 || highCount > 0) {
        const parts = [];
        if (criticalCount > 0) parts.push(`${criticalCount} critical`);
        if (highCount > 0) parts.push(`${highCount} high`);
        message += ` (${parts.join(', ')})`;
      }
      
      message += '.';
    }

    return message;
  }

  /**
   * Get recent investigations
   */
  async getRecentInvestigations(
    tenantId: string,
    limit: number = 10
  ): Promise<InvestigationSummary[]> {
    const investigations = await this.investigationRepository.searchInvestigations({
      tenantId,
      limit,
    });

    return this.investigationRepository.getInvestigationSummaries({
      tenantId,
      limit,
    });
  }

  /**
   * Get investigation by ID
   */
  async getInvestigation(id: string): Promise<Investigation | undefined> {
    return this.investigationRepository.getInvestigation(id);
  }

  /**
   * Check if commander is ready
   */
  async isReady(): Promise<{
    ready: boolean;
    llmAvailable: boolean;
    database: boolean;
  }> {
    const llmAvailable = await this.queryParser.isLLMAvailable();

    // Test database connection
    let database = false;
    try {
      await this.pool.query('SELECT 1');
      database = true;
    } catch {
      database = false;
    }

    return {
      ready: database,
      llmAvailable,
      database,
    };
  }
}
