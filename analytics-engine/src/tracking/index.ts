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
