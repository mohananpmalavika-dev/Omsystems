/**
 * Banking Analytics - Normalized Event Types
 * 
 * These events represent facts observed by detectors across the platform.
 * Banking analytics consumes these events rather than calling detectors directly.
 */

import { BoundingBox } from '../../types.js';

/**
 * Base properties common to all banking observations
 */
interface BaseBankingEvent {
  eventId: string;
  timestamp: Date;
  tenantId: string;
  branchId: string;
  cameraId: string;
}

/**
 * Vehicle observed in a zone
 */
export interface VehicleObservedEvent extends BaseBankingEvent {
  type: 'vehicle.observed';
  trackId: string;
  vehicleClass: 'car' | 'van' | 'truck' | 'motorcycle' | 'unknown';
  zoneId?: string;
  bbox: BoundingBox;
  confidence: number;
  stationary?: boolean;
}

/**
 * License plate recognized via ANPR
 */
export interface PlateRecognizedEvent extends BaseBankingEvent {
  type: 'vehicle.plate_recognized';
  vehicleTrackId: string;
  plate: string;
  country?: string;
  state?: string;
  confidence: number;
}

/**
 * Vehicle state change (entered, stopped, departed)
 */
export interface VehicleStateChangedEvent extends BaseBankingEvent {
  type: 'vehicle.state_changed';
  vehicleTrackId: string;
  previousState: 'moving' | 'stationary' | 'departed' | 'unknown';
  newState: 'moving' | 'stationary' | 'departed' | 'unknown';
  zoneId?: string;
}

/**
 * Person observed in frame
 */
export interface PersonObservedEvent extends BaseBankingEvent {
  type: 'person.observed';
  trackId: string;
  zoneId?: string;
  bbox: BoundingBox;
  confidence: number;
  attributes?: {
    uniform?: boolean;
    uniformType?: string;
    carryingObject?: boolean;
  };
}

/**
 * Person identity resolved via face recognition or credential
 */
export interface PersonIdentityResolvedEvent extends BaseBankingEvent {
  type: 'person.identity_resolved';
  personTrackId: string;
  identityId: string;
  identityType: 'employee' | 'guard' | 'cash_van_crew' | 'contractor' | 'customer' | 'unknown';
  confidence: number;
  method: 'face_recognition' | 'access_credential' | 'manual';
}

/**
 * Zone transition event (entity enters or exits a zone)
 */
export interface ZoneTransitionEvent extends BaseBankingEvent {
  type: 'zone.entered' | 'zone.exited';
  entityType: 'vehicle' | 'person' | 'object';
  entityId: string; // trackId
  zoneId: string;
  confidence: number;
}

/**
 * Access control event (door, gate, turnstile)
 */
export interface AccessControlEvent extends BaseBankingEvent {
  type: 'access.granted' | 'access.denied';
  doorId: string;
  zoneId?: string;
  credentialId?: string;
  identityId?: string;
  accessType: 'card' | 'biometric' | 'pin' | 'manual' | 'unknown';
  reason?: string; // For denied events
}

/**
 * Object observed (bags, cases, containers)
 */
export interface ObjectObservedEvent extends BaseBankingEvent {
  type: 'object.observed';
  trackId: string;
  objectType: 'bag' | 'briefcase' | 'box' | 'container' | 'cash_case' | 'cash_bag' | 'security_container' | 'unknown';
  zoneId?: string;
  bbox: BoundingBox;
  confidence: number;
  carriedBy?: string; // personTrackId if being carried
}

/**
 * Object transfer event (handoff between people)
 */
export interface ObjectTransferEvent extends BaseBankingEvent {
  type: 'object.transferred';
  objectTrackId: string;
  fromPersonTrackId?: string;
  toPersonTrackId?: string;
  confidence: number;
}

/**
 * Object left unattended
 */
export interface ObjectUnattendedEvent extends BaseBankingEvent {
  type: 'object.unattended';
  objectTrackId: string;
  zoneId?: string;
  durationSeconds: number;
  confidence: number;
}

/**
 * Proximity event (entities near each other)
 */
export interface ProximityEvent extends BaseBankingEvent {
  type: 'proximity.detected';
  entity1Type: 'vehicle' | 'person' | 'object';
  entity1Id: string;
  entity2Type: 'vehicle' | 'person' | 'object';
  entity2Id: string;
  distanceMeters?: number;
  confidence: number;
}

/**
 * Union type of all banking events
 */
export type BankingObservation =
  | VehicleObservedEvent
  | PlateRecognizedEvent
  | VehicleStateChangedEvent
  | PersonObservedEvent
  | PersonIdentityResolvedEvent
  | ZoneTransitionEvent
  | AccessControlEvent
  | ObjectObservedEvent
  | ObjectTransferEvent
  | ObjectUnattendedEvent
  | ProximityEvent;

/**
 * Event metadata for tracking and deduplication
 */
export interface EventMetadata {
  eventId: string;
  sourceService: string;
  sourceVersion?: string;
  receivedAt: Date;
  processed: boolean;
  processedAt?: Date;
}

/**
 * Type guards for event discrimination
 */
export const isVehicleEvent = (event: BankingObservation): event is VehicleObservedEvent =>
  event.type === 'vehicle.observed';

export const isPlateEvent = (event: BankingObservation): event is PlateRecognizedEvent =>
  event.type === 'vehicle.plate_recognized';

export const isPersonEvent = (event: BankingObservation): event is PersonObservedEvent =>
  event.type === 'person.observed';

export const isIdentityEvent = (event: BankingObservation): event is PersonIdentityResolvedEvent =>
  event.type === 'person.identity_resolved';

export const isZoneEvent = (event: BankingObservation): event is ZoneTransitionEvent =>
  event.type === 'zone.entered' || event.type === 'zone.exited';

export const isAccessEvent = (event: BankingObservation): event is AccessControlEvent =>
  event.type === 'access.granted' || event.type === 'access.denied';

export const isObjectEvent = (event: BankingObservation): event is ObjectObservedEvent =>
  event.type === 'object.observed';
