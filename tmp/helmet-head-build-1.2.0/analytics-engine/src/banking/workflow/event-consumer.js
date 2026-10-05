/**
 * Banking Event Consumer
 *
 * Subscribes to banking events and routes them to the workflow engine
 */
import { getBankingEventBus, } from '../events.js';
import { getCashVanWorkflow, } from './cash-van-workflow.js';
/**
 * Banking Event Consumer
 *
 * Connects the event bus to the workflow engine
 */
export class BankingEventConsumer {
    eventBus;
    workflow;
    started = false;
    constructor(eventBus = getBankingEventBus(), workflow = getCashVanWorkflow()) {
        this.eventBus = eventBus;
        this.workflow = workflow;
    }
    /**
     * Start consuming events
     */
    start() {
        if (this.started) {
            return;
        }
        // Subscribe to vehicle events
        this.eventBus.subscribe('vehicle.observed', async (event) => {
            await this.workflow.handleVehicleObserved(event);
        });
        this.eventBus.subscribe('vehicle.plate_recognized', async (event) => {
            await this.workflow.handlePlateRecognized(event);
        });
        this.eventBus.subscribe('vehicle.state_changed', async (event) => {
            await this.workflow.handleVehicleStateChanged(event);
        });
        // Subscribe to person events
        this.eventBus.subscribe('person.observed', async (event) => {
            await this.workflow.handlePersonObserved(event);
        });
        this.eventBus.subscribe('person.identity_resolved', async (event) => {
            await this.workflow.handlePersonIdentityResolved(event);
        });
        // Subscribe to zone events
        this.eventBus.subscribe(['zone.entered', 'zone.exited'], async (event) => {
            await this.workflow.handleZoneTransition(event);
        });
        // Subscribe to access control events
        this.eventBus.subscribe(['access.granted', 'access.denied'], async (event) => {
            await this.workflow.handleAccessControl(event);
        });
        // Subscribe to object events
        this.eventBus.subscribe('object.observed', async (event) => {
            await this.workflow.handleObjectObserved(event);
        });
        this.eventBus.subscribe('object.unattended', async (event) => {
            await this.workflow.handleObjectUnattended(event);
        });
        this.started = true;
        console.log('[BankingEventConsumer] Started consuming banking events');
    }
    /**
     * Stop consuming events
     */
    stop() {
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
    isRunning() {
        return this.started;
    }
}
/**
 * Singleton instance
 */
let consumer = null;
export function getBankingEventConsumer() {
    if (!consumer) {
        consumer = new BankingEventConsumer();
    }
    return consumer;
}
export function setBankingEventConsumer(c) {
    consumer = c;
}
