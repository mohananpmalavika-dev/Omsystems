/**
 * Health Change Event Publisher
 * 
 * Background service that publishes health change events via WebSocket.
 * Monitors the branch_health_change_events table and broadcasts updates.
 */

import { Pool } from 'pg';
import { BranchHealthRepository } from '../repositories/branch-health.repository';

export interface WebSocketServer {
  broadcast(tenantId: string, channel: string, data: any): void;
}

export class HealthChangePublisher {
  private repository: BranchHealthRepository;
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;

  constructor(
    private pool: Pool,
    private wsServer: WebSocketServer,
    private pollIntervalMs: number = 1000
  ) {
    this.repository = new BranchHealthRepository(pool);
  }

  /**
   * Start publishing health change events
   */
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log('Health change publisher started');

    this.intervalId = setInterval(async () => {
      try {
        await this.processEvents();
      } catch (error) {
        console.error('Error processing health change events:', error);
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stop publishing health change events
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    console.log('Health change publisher stopped');
  }

  /**
   * Process unpublished health change events
   */
  private async processEvents() {
    // Get unpublished events
    const events = await this.repository.getUnpublishedEvents(50);

    if (events.length === 0) {
      return;
    }

    // Publish each event via WebSocket
    for (const event of events) {
      try {
        // Broadcast to tenant's operational-health channel
        this.wsServer.broadcast(
          event.tenant_id,
          'operational-health',
          {
            type: 'BRANCH_HEALTH_CHANGED',
            eventType: event.event_type,
            branchId: event.branch_id,
            branchCode: event.branch_code,
            branchName: event.branch_name,
            previousState: event.previous_state,
            newState: event.new_state,
            previousScore: event.previous_score,
            newScore: event.new_score,
            scoreDelta: event.score_delta,
            reasonCodesAdded: event.reason_codes_added || [],
            reasonCodesRemoved: event.reason_codes_removed || [],
            currentReasonCodes: event.current_reason_codes || [],
            occurredAt: event.occurred_at,
            data: event.event_data,
          }
        );

        // Mark as published
        await this.repository.markEventPublished(event.id);
      } catch (error) {
        console.error(`Failed to publish event ${event.id}:`, error);
      }
    }

    console.log(`Published ${events.length} health change events`);
  }
}
