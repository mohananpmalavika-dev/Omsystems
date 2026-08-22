/**
 * Event Bus Module
 * Centralized event-driven communication for Sentinel Grid
 */

export { EventBus, getEventBus, resetEventBus } from './event-bus.js';
export type { EventBusConfig } from './event-bus.js';

export { EventEmitters } from './event-emitters.js';

export {
  EventType,
  type BaseEvent,
  type TypedEvent,
  type EventHandler,
  type SubscriptionOptions,
  type PublishOptions,
  type CameraStatusChangedPayload,
  type CameraStreamFailedPayload,
  type CameraRecoveredPayload,
  type RecordingGapDetectedPayload,
  type StorageWarningPayload,
  type AIDetectionCreatedPayload,
  type AlertCreatedPayload,
  type AlertAcknowledgedPayload,
  type BranchHealthChangedPayload,
  type EdgeAgentHeartbeatPayload,
  type MediaSessionStartedPayload,
  type FederationSyncCompletedPayload,
  type IncidentCreatedPayload,
} from './event-types.js';
