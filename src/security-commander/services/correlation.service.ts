/**
 * Correlation Service
 * 
 * Background service for continuous event correlation.
 */

import type { Pool } from 'pg';
import { CorrelationEngine } from '../correlation/correlation-engine.js';
import { SecurityEventRepository } from '../repositories/security-event.repository.js';
import { EventIngestionService } from './event-ingestion.service.js';
import type { SecurityEvent } from '../types/index.js';

export interface CorrelationServiceOptions {
  /** Correlation interval in milliseconds (default: 30 seconds) */
  intervalMs?: number;

  /** Lookback window in seconds (default: 300 = 5 minutes) */
  lookbackSeconds?: number;

  /** Enable automatic correlation */
  autoCorrelate?: boolean;

  /** Callback when incident is created */
  onIncidentCreated?: (incident: any) => void;
}

export class CorrelationService {
  private readonly correlationEngine: CorrelationEngine;
  private readonly eventRepository: SecurityEventRepository;
  private intervalHandle?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    private readonly pool: Pool,
    private readonly options: CorrelationServiceOptions = {}
  ) {
    this.correlationEngine = new CorrelationEngine(pool);
    this.eventRepository = new SecurityEventRepository(pool);
    this.options.intervalMs = options.intervalMs ?? 30000; // 30 seconds
    this.options.lookbackSeconds = options.lookbackSeconds ?? 300; // 5 minutes
    this.options.autoCorrelate = options.autoCorrelate ?? true;
  }

  /**
   * Start automatic correlation
   */
  start(): void {
    if (this.isRunning) {
      console.warn('Correlation service already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting correlation service (interval: ${this.options.intervalMs}ms)`);

    this.intervalHandle = setInterval(
      () => this.runCorrelation(),
      this.options.intervalMs
    );

    // Run immediately on start
    this.runCorrelation().catch(error => {
      console.error('Initial correlation failed:', error);
    });
  }

  /**
   * Stop automatic correlation
   */
  stop(): void {
    if (!this.isRunning) {
      console.warn('Correlation service not running');
      return;
    }

    console.log('Stopping correlation service');
    
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }

    this.isRunning = false;
  }

  /**
   * Run correlation for all tenants
   */
  private async runCorrelation(): Promise<void> {
    try {
      // Get all active tenants (would need a tenant query)
      // For now, we'll need this to be triggered per-tenant
      console.log('Correlation cycle started');
      
      // This would be called per tenant in production
      // await this.correlateForTenant(tenantId);
      
    } catch (error) {
      console.error('Correlation cycle failed:', error);
    }
  }

  /**
   * Correlate events for a specific tenant
   */
  async correlateForTenant(tenantId: string, branchId?: string): Promise<void> {
    const lookbackMs = (this.options.lookbackSeconds ?? 300) * 1000;
    const now = new Date();
    const from = new Date(now.getTime() - lookbackMs);

    try {
      const result = await this.correlationEngine.correlateEvents(
        tenantId,
        from,
        now,
        branchId
      );

      console.log(
        `Correlation complete for tenant ${tenantId}: ` +
        `${result.incidents.length} incidents created, ` +
        `${result.uncorrelatedEvents.length} uncorrelated events, ` +
        `${result.correlationTime}ms`
      );

      // Notify about new incidents
      if (this.options.onIncidentCreated) {
        for (const incident of result.incidents) {
          this.options.onIncidentCreated(incident);
        }
      }
    } catch (error) {
      console.error(`Correlation failed for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Correlate a single new event immediately
   */
  async correlateEvent(event: SecurityEvent): Promise<void> {
    if (!this.options.autoCorrelate) {
      return;
    }

    try {
      const incident = await this.correlationEngine.correlateNewEvent(event);

      if (incident && this.options.onIncidentCreated) {
        this.options.onIncidentCreated(incident);
      }
    } catch (error) {
      console.error('Event correlation failed:', error);
      // Don't throw - correlation is best-effort
    }
  }

  /**
   * Get correlation statistics
   */
  async getStats(tenantId: string, hours: number = 24): Promise<{
    totalEvents: number;
    correlatedEvents: number;
    incidentsCreated: number;
    correlationRate: number;
  }> {
    const now = new Date();
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000);

    const stats = await this.correlationEngine.getCorrelationStats(
      tenantId,
      from,
      now
    );

    return {
      ...stats,
      correlationRate: stats.totalEvents > 0
        ? (stats.correlatedEvents / stats.totalEvents) * 100
        : 0,
    };
  }

  /**
   * Check if service is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

/**
 * Integrate correlation into event ingestion
 */
export class EventIngestionWithCorrelation extends EventIngestionService {
  private readonly correlationService: CorrelationService;

  constructor(pool: Pool, correlationService: CorrelationService) {
    super(pool);
    this.correlationService = correlationService;
  }

  /**
   * Override to add correlation after ingestion
   */
  async ingestEvent(raw: any, context: any): Promise<SecurityEvent> {
    const event = await super.ingestEvent(raw, context);

    // Trigger correlation for new event
    await this.correlationService.correlateEvent(event);

    return event;
  }
}
