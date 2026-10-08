/**
 * Tracking Module
 * 
 * Exports for equipment tracking and scene state management
 */

export type {
  TrackedEquipment,
  TrackerConfig,
  TrackingContext,
} from './equipment-tracker.js';

export { EquipmentTracker } from './equipment-tracker.js';

export type {
  TrackedPerson,
  TrackedVehicle,
  SceneSnapshot,
  Zone,
  SpatialRelationship,
} from './scene-state.js';

export {
  SceneStateManager,
  SceneStateRegistry,
  getSceneStateRegistry,
  resetSceneStateRegistry,
} from './scene-state.js';

export type {
  TrackingEventBusConfig,
  TrackingEventBusMetrics,
} from './tracking-event-bus.js';

export { TrackingEventBus } from './tracking-event-bus.js';

export type {
  FrameContext,
  TrackedDetection,
} from './tracking-adapter.js';

export {
  buildTrackingObservations,
  buildTrackingObservation,
} from './tracking-adapter.js';

export type {
  TrackingObservation,
  TrackedObjectType,
} from './tracking-observation.js';
