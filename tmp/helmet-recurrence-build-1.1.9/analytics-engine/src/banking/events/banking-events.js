/**
 * Banking Analytics - Normalized Event Types
 *
 * These events represent facts observed by detectors across the platform.
 * Banking analytics consumes these events rather than calling detectors directly.
 */
/**
 * Type guards for event discrimination
 */
export const isVehicleEvent = (event) => event.type === 'vehicle.observed';
export const isPlateEvent = (event) => event.type === 'vehicle.plate_recognized';
export const isPersonEvent = (event) => event.type === 'person.observed';
export const isIdentityEvent = (event) => event.type === 'person.identity_resolved';
export const isZoneEvent = (event) => event.type === 'zone.entered' || event.type === 'zone.exited';
export const isAccessEvent = (event) => event.type === 'access.granted' || event.type === 'access.denied';
export const isObjectEvent = (event) => event.type === 'object.observed';
