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
import type { RawDetection } from './specialty-inference-provider.js';

// ============================================================================
// Observation Types
// ============================================================================

/**
 * Base observation envelope
 */
export interface ObservationEnvelope<T = unknown> {
  id: string;
  tenantId: string;
  branchId?: string;
  cameraId: string;
  timestamp: Date;
  type: ObservationType;
  payload: T;
  source: ObservationSource;
}

/**
 * Observation type identifier
 */
export type ObservationType =
  | 'person.observed'
  | 'vehicle.observed'
  | 'equipment.observed'
  | 'face.observed'
  | 'plate.observed'
  | 'ppe.observed'
  | 'fire.observed'
  | 'smoke.observed'
  | 'weapon.observed'
  | 'zone.entered'
  | 'zone.exited'
  | 'tracking.updated';

/**
 * Observation source metadata
 */
export interface ObservationSource {
  detector: string;
  model?: string;
  version?: string;
  confidence?: number;
}

// ============================================================================
// Domain-Specific Observation Payloads
// ============================================================================

/**
 * Equipment observation
 */
export interface EquipmentObservation {
  equipmentType: string;
  trackId?: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes?: {
    moving?: boolean;
    speed?: number;
    direction?: number;
    zone?: string;
  };
}

/**
 * Person observation
 */
export interface PersonObservation {
  trackId?: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes?: {
    moving?: boolean;
    speed?: number;
    zone?: string;
    ppe?: {
      helmet?: boolean;
      vest?: boolean;
      gloves?: boolean;
    };
  };
}

/**
 * Vehicle observation
 */
export interface VehicleObservation {
  vehicleType: string;
  trackId?: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes?: {
    color?: string;
    make?: string;
    model?: string;
    plate?: string;
    speed?: number;
    direction?: number;
  };
}

/**
 * PPE observation
 */
export interface PPEObservation {
  personTrackId?: string;
  items: {
    helmet?: boolean;
    vest?: boolean;
    gloves?: boolean;
    goggles?: boolean;
    mask?: boolean;
  };
  violations: string[];
  confidence: number;
}

/**
 * Fire/Smoke observation
 */
export interface FireSmokeObservation {
  type: 'fire' | 'smoke';
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================================
// Observation Bus Implementation
// ============================================================================

/**
 * Observation handler function
 */
export type ObservationHandler<T = unknown> = (
  observation: ObservationEnvelope<T>
) => void | Promise<void>;

/**
 * Subscription
 */
interface Subscription {
  id: string;
  type: ObservationType | '*'; // '*' for all observations
  handler: ObservationHandler;
}

/**
 * Observation Bus
 */
export class ObservationBus extends EventEmitter {
  private subscriptions = new Map<string, Subscription>();
  private nextSubscriptionId = 1;

  private stats = {
    totalPublished: 0,
    totalDelivered: 0,
    totalErrors: 0,
    byType: new Map<ObservationType, number>(),
  };

  /**
   * Publish an observation
   */
  publish<T>(observation: ObservationEnvelope<T>): void {
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
  subscribe<T = unknown>(
    type: ObservationType | '*',
    handler: ObservationHandler<T>
  ): () => void {
    const id = `sub_${this.nextSubscriptionId++}`;
    
    const subscription: Subscription = {
      id,
      type,
      handler: handler as ObservationHandler,
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
  subscribeToTypes<T = unknown>(
    types: ObservationType[],
    handler: ObservationHandler<T>
  ): () => void {
    const unsubscribers = types.map(type => this.subscribe(type, handler));
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }

  /**
   * Deliver observation to subscribers
   */
  private deliverToSubscribers(observation: ObservationEnvelope): void {
    for (const subscription of this.subscriptions.values()) {
      // Match on type or wildcard
      if (
        subscription.type === '*' ||
        subscription.type === observation.type
      ) {
        try {
          const result = subscription.handler(observation);
          
          // Handle async handlers
          if (result instanceof Promise) {
            result.catch(error => {
              console.error(
                `Error in observation handler for ${observation.type}:`,
                error
              );
              this.stats.totalErrors++;
            });
          }

          this.stats.totalDelivered++;
        } catch (error) {
          console.error(
            `Error in observation handler for ${observation.type}:`,
            error
          );
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
  clearStatistics(): void {
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
  clearSubscriptions(): void {
    this.subscriptions.clear();
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.clearSubscriptions();
    this.removeAllListeners();
    this.clearStatistics();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let busInstance: ObservationBus | null = null;

/**
 * Get or create the global observation bus
 */
export function getObservationBus(): ObservationBus {
  if (!busInstance) {
    busInstance = new ObservationBus();
  }
  return busInstance;
}

/**
 * Reset the bus (primarily for testing)
 */
export function resetObservationBus(): void {
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
export function createObservation<T>(
  type: ObservationType,
  payload: T,
  context: {
    tenantId: string;
    cameraId: string;
    branchId?: string;
    timestamp?: Date;
  },
  source: ObservationSource
): ObservationEnvelope<T> {
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
function generateObservationId(): string {
  return `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Publish equipment observation
 */
export function publishEquipmentObservation(
  equipment: EquipmentObservation,
  context: {
    tenantId: string;
    cameraId: string;
    branchId?: string;
    timestamp?: Date;
  },
  source: ObservationSource
): void {
  const observation = createObservation(
    'equipment.observed',
    equipment,
    context,
    source
  );
  getObservationBus().publish(observation);
}

/**
 * Publish person observation
 */
export function publishPersonObservation(
  person: PersonObservation,
  context: {
    tenantId: string;
    cameraId: string;
    branchId?: string;
    timestamp?: Date;
  },
  source: ObservationSource
): void {
  const observation = createObservation(
    'person.observed',
    person,
    context,
    source
  );
  getObservationBus().publish(observation);
}

/**
 * Publish vehicle observation
 */
export function publishVehicleObservation(
  vehicle: VehicleObservation,
  context: {
    tenantId: string;
    cameraId: string;
    branchId?: string;
    timestamp?: Date;
  },
  source: ObservationSource
): void {
  const observation = createObservation(
    'vehicle.observed',
    vehicle,
    context,
    source
  );
  getObservationBus().publish(observation);
}

/**
 * Publish PPE observation
 */
export function publishPPEObservation(
  ppe: PPEObservation,
  context: {
    tenantId: string;
    cameraId: string;
    branchId?: string;
    timestamp?: Date;
  },
  source: ObservationSource
): void {
  const observation = createObservation(
    'ppe.observed',
    ppe,
    context,
    source
  );
  getObservationBus().publish(observation);
}

/**
 * Publish fire/smoke observation
 */
export function publishFireSmokeObservation(
  fireSmoke: FireSmokeObservation,
  context: {
    tenantId: string;
    cameraId: string;
    branchId?: string;
    timestamp?: Date;
  },
  source: ObservationSource
): void {
  const type = fireSmoke.type === 'fire' ? 'fire.observed' : 'smoke.observed';
  const observation = createObservation(
    type,
    fireSmoke,
    context,
    source
  );
  getObservationBus().publish(observation);
}
