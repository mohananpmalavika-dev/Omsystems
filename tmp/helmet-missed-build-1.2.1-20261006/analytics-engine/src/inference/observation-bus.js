/**
 * Observation Bus
 *
 * Event bus for normalized observations from all inference providers.
 * Decouples detection (perception) from analytics (business logic).
 *
 * Architecture:
 *
 *   Detectors          ObservationBus         Analytics
 *   ─────────          ──────────────         ─────────
 *   Person     ───┐
 *   Vehicle    ───┤
 *   Equipment  ───┼──> publish() ───> subscribe() ──> Human Analytics
 *   Fire/Smoke ───┤                              ──> Industrial Analytics
 *   PPE        ───┤                              ──> Banking Analytics
 *   Face       ───┤                              ──> Heat Map
 *   Plate      ───┘                              ──> Investigation
 *
 * Benefits:
 * - Analytics don't directly depend on detectors
 * - Easy to add new detectors without changing analytics
 * - Enables cross-domain correlation (e.g., person + equipment proximity)
 * - Supports replay and investigation workflows
 */
import { EventEmitter } from 'events';
/**
 * Observation Bus
 */
export class ObservationBus extends EventEmitter {
    subscriptions = new Map();
    nextSubscriptionId = 1;
    stats = {
        totalPublished: 0,
        totalDelivered: 0,
        totalErrors: 0,
        byType: new Map(),
    };
    /**
     * Publish an observation
     */
    publish(observation) {
        this.stats.totalPublished++;
        const typeCount = this.stats.byType.get(observation.type) || 0;
        this.stats.byType.set(observation.type, typeCount + 1);
        // Emit to EventEmitter for internal use
        this.emit('observation', observation);
        this.emit(observation.type, observation);
        // Deliver to subscribers
        this.deliverToSubscribers(observation);
    }
    /**
     * Subscribe to observations
     */
    subscribe(type, handler) {
        const id = `sub_${this.nextSubscriptionId++}`;
        const subscription = {
            id,
            type,
            handler: handler,
        };
        this.subscriptions.set(id, subscription);
        // Return unsubscribe function
        return () => {
            this.subscriptions.delete(id);
        };
    }
    /**
     * Subscribe to specific types
     */
    subscribeToTypes(types, handler) {
        const unsubscribers = types.map(type => this.subscribe(type, handler));
        return () => {
            unsubscribers.forEach(unsub => unsub());
        };
    }
    /**
     * Deliver observation to subscribers
     */
    deliverToSubscribers(observation) {
        for (const subscription of this.subscriptions.values()) {
            // Match on type or wildcard
            if (subscription.type === '*' ||
                subscription.type === observation.type) {
                try {
                    const result = subscription.handler(observation);
                    // Handle async handlers
                    if (result instanceof Promise) {
                        result.catch(error => {
                            console.error(`Error in observation handler for ${observation.type}:`, error);
                            this.stats.totalErrors++;
                        });
                    }
                    this.stats.totalDelivered++;
                }
                catch (error) {
                    console.error(`Error in observation handler for ${observation.type}:`, error);
                    this.stats.totalErrors++;
                }
            }
        }
    }
    /**
     * Get statistics
     */
    getStatistics() {
        return {
            totalPublished: this.stats.totalPublished,
            totalDelivered: this.stats.totalDelivered,
            totalErrors: this.stats.totalErrors,
            activeSubscriptions: this.subscriptions.size,
            byType: Object.fromEntries(this.stats.byType),
        };
    }
    /**
     * Clear statistics
     */
    clearStatistics() {
        this.stats = {
            totalPublished: 0,
            totalDelivered: 0,
            totalErrors: 0,
            byType: new Map(),
        };
    }
    /**
     * Remove all subscriptions
     */
    clearSubscriptions() {
        this.subscriptions.clear();
    }
    /**
     * Cleanup
     */
    cleanup() {
        this.clearSubscriptions();
        this.removeAllListeners();
        this.clearStatistics();
    }
}
// ============================================================================
// Singleton Instance
// ============================================================================
let busInstance = null;
/**
 * Get or create the global observation bus
 */
export function getObservationBus() {
    if (!busInstance) {
        busInstance = new ObservationBus();
    }
    return busInstance;
}
/**
 * Reset the bus (primarily for testing)
 */
export function resetObservationBus() {
    if (busInstance) {
        busInstance.cleanup();
    }
    busInstance = null;
}
// ============================================================================
// Convenience Helpers
// ============================================================================
/**
 * Create an observation envelope
 */
export function createObservation(type, payload, context, source) {
    return {
        id: generateObservationId(),
        type,
        payload,
        tenantId: context.tenantId,
        branchId: context.branchId,
        cameraId: context.cameraId,
        timestamp: context.timestamp || new Date(),
        source,
    };
}
/**
 * Generate unique observation ID
 */
function generateObservationId() {
    return `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * Publish equipment observation
 */
export function publishEquipmentObservation(equipment, context, source) {
    const observation = createObservation('equipment.observed', equipment, context, source);
    getObservationBus().publish(observation);
}
/**
 * Publish person observation
 */
export function publishPersonObservation(person, context, source) {
    const observation = createObservation('person.observed', person, context, source);
    getObservationBus().publish(observation);
}
/**
 * Publish vehicle observation
 */
export function publishVehicleObservation(vehicle, context, source) {
    const observation = createObservation('vehicle.observed', vehicle, context, source);
    getObservationBus().publish(observation);
}
/**
 * Publish PPE observation
 */
export function publishPPEObservation(ppe, context, source) {
    const observation = createObservation('ppe.observed', ppe, context, source);
    getObservationBus().publish(observation);
}
/**
 * Publish fire/smoke observation
 */
export function publishFireSmokeObservation(fireSmoke, context, source) {
    const type = fireSmoke.type === 'fire' ? 'fire.observed' : 'smoke.observed';
    const observation = createObservation(type, fireSmoke, context, source);
    getObservationBus().publish(observation);
}
