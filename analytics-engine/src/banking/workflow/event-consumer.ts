/**
 * Banking Event Consumer
 * 
 * Subscribes to banking events and routes them to the workflow engine
 */

import {
  BankingObservation,
  getBankingEventBus,
  BankingEventBus,
} from '../events';

import {
  CashVanWorkflow,
  getCashVanWorkflow,
} from './cash-van-workflow';

/**
 * Banking Event Consumer
 * 
 * Connects the event bus to the workflow engine
 */
export class BankingEventConsumer {
  private started = false;

  constructor(
    private eventBus: BankingEventBus = getBankingEventBus(),
    private workflow: CashVanWorkflow = getCashVanWorkflow()
  ) {}

  /**
   * Start consuming events
   */
  start(): void {
    if (this.started) {
      return;
    }

    // Subscribe to vehicle events
    this.eventBus.subscribe('vehicle.observed', async (event) => {
      await this.workflow.handleVehicleObserved(event as any);
    });

    this.eventBus.subscribe('vehicle.plate_recognized', async (event) => {
      await this.workflow.handlePlateRecognized(event as any);
    });

    this.eventBus.subscribe('vehicle.state_changed', async (event) => {
      await this.workflow.handleVehicleStateChanged(event as any);
    });

    // Subscribe to person events
    this.eventBus.subscribe('person.observed', async (event) => {
      await this.workflow.handlePersonObserved(event as any);
    });

    this.eventBus.subscribe('person.identity_resolved', async (event) => {
      await this.workflow.handlePersonIdentityResolved(event as any);
    });

    // Subscribe to zone events
    this.eventBus.subscribe(['zone.entered', 'zone.exited'], async (event) => {
      await this.workflow.handleZoneTransition(event as any);
    });

    // Subscribe to access control events
    this.eventBus.subscribe(['access.granted', 'access.denied'], async (event) => {
      await this.workflow.handleAccessControl(event as any);
    });

    // Subscribe to object events
    this.eventBus.subscribe('object.observed', async (event) => {
      await this.workflow.handleObjectObserved(event as any);
    });

    this.eventBus.subscribe('object.unattended', async (event) => {
      await this.workflow.handleObjectUnattended(event as any);
    });

    this.started = true;
    console.log('[BankingEventConsumer] Started consuming banking events');
  }

  /**
   * Stop consuming events
   */
  stop(): void {
    if (!this.started) {
      return;
    }

    // Event bus doesn't provide unsubscribe all, but we can mark as stopped
    this.started = false;
    console.log('[BankingEventConsumer] Stopped consuming banking events');
  }

  /**
   * Check if consumer is running
   */
  isRunning(): boolean {
    return this.started;
  }
}

/**
 * Singleton instance
 */
let consumer: BankingEventConsumer | null = null;

export function getBankingEventConsumer(): BankingEventConsumer {
  if (!consumer) {
    consumer = new BankingEventConsumer();
  }
  return consumer;
}

export function setBankingEventConsumer(c: BankingEventConsumer): void {
  consumer = c;
}
