/**
 * Banking Analytics Test Utilities
 * 
 * Mock event generators and workflow simulation helpers for testing
 */

import { v4 as uuidv4 } from 'uuid';
import {
  VehicleObservedEvent,
  PlateRecognizedEvent,
  VehicleStateChangedEvent,
  PersonObservedEvent,
  PersonIdentityResolvedEvent,
  ZoneTransitionEvent,
  AccessControlEvent,
  ObjectObservedEvent,
  ObjectUnattendedEvent,
  generateEventId,
} from '../events';

/**
 * Mock Event Generator
 */
export class MockEventGenerator {
  private tenantId: string;
  private branchId: string;
  private cameraId: string;
  private baseTime: Date;

  constructor(
    tenantId: string = 'test-tenant',
    branchId: string = 'test-branch',
    cameraId: string = 'test-camera'
  ) {
    this.tenantId = tenantId;
    this.branchId = branchId;
    this.cameraId = cameraId;
    this.baseTime = new Date();
  }

  /**
   * Generate vehicle observed event
   */
  vehicleObserved(
    trackId: string = `veh_${uuidv4().slice(0, 8)}`,
    options: {
      vehicleClass?: string;
      zoneId?: string;
      stationary?: boolean;
      offsetSeconds?: number;
    } = {}
  ): VehicleObservedEvent {
    const timestamp = new Date(
      this.baseTime.getTime() + (options.offsetSeconds || 0) * 1000
    );

    return {
      eventId: generateEventId('veh'),
      type: 'vehicle.observed',
      tenantId: this.tenantId,
      branchId: this.branchId,
      cameraId: this.cameraId,
      trackId,
      vehicleClass: options.vehicleClass || 'van',
      zoneId: options.zoneId,
      bbox: { x: 100, y: 100, width: 200, height: 150 },
      confidence: 0.95,
      stationary: options.stationary,
      timestamp,
    };
  }

  /**
   * Generate plate recognized event
   */
  plateRecognized(
    vehicleTrackId: string,
    plate: string = 'ABC123',
    options: {
      confidence?: number;
      offsetSeconds?: number;
    } = {}
  ): PlateRecognizedEvent {
    const timestamp = new Date(
      this.baseTime.getTime() + (options.offsetSeconds || 0) * 1000
    );

    return {
      eventId: generateEventId('anpr'),
      type: 'vehicle.plate_recognized',
      tenantId: this.tenantId,
      branchId: this.branchId,
      cameraId: this.cameraId,
      vehicleTrackId,
      plate,
      confidence: options.confidence || 0.92,
      timestamp,
    };
  }

  /**
   * Generate vehicle state changed event
   */
  vehicleStateChanged(
    vehicleTrackId: string,
    newState: 'moving' | 'stationary' | 'departed' | 'unknown',
    options: {
      previousState?: 'moving' | 'stationary' | 'departed' | 'unknown';
      zoneId?: string;
      offsetSeconds?: number;
    } = {}
  ): VehicleStateChangedEvent {
    const timestamp = new Date(
      this.baseTime.getTime() + (options.offsetSeconds || 0) * 1000
    );

    return {
      eventId: generateEventId('vst'),
      type: 'vehicle.state_changed',
      tenantId: this.tenantId,
      branchId: this.branchId,
      cameraId: this.cameraId,
      vehicleTrackId,
      previousState: options.previousState || 'moving',
      newState,
      zoneId: options.zoneId,
      timestamp,
    };
  }

  /**
   * Generate person observed event
   */
  personObserved(
    trackId: string = `per_${uuidv4().slice(0, 8)}`,
    options: {
      zoneId?: string;
      offsetSeconds?: number;
    } = {}
  ): PersonObservedEvent {
    const timestamp = new Date(
      this.baseTime.getTime() + (options.offsetSeconds || 0) * 1000
    );

    return {
      eventId: generateEventId('per'),
      type: 'person.observed',
      tenantId: this.tenantId,
      branchId: this.branchId,
      cameraId: this.cameraId,
      trackId,
      zoneId: options.zoneId,
      bbox: { x: 150, y: 200, width: 80, height: 120 },
      confidence: 0.93,
      timestamp,
    };
  }

  /**
   * Generate person identity resolved event
   */
  personIdentityResolved(
    personTrackId: string,
    identityId: string = `id_${uuidv4().slice(0, 8)}`,
    options: {
      identityType?: 'employee' | 'guard' | 'cash_van_crew' | 'contractor' | 'customer' | 'unknown';
      confidence?: number;
      offsetSeconds?: number;
    } = {}
  ): PersonIdentityResolvedEvent {
    const timestamp = new Date(
      this.baseTime.getTime() + (options.offsetSeconds || 0) * 1000
    );

    return {
      eventId: generateEventId('id'),
      type: 'person.identity_resolved',
      tenantId: this.tenantId,
      branchId: this.branchId,
      cameraId: this.cameraId,
      personTrackId,
      identityId,
      identityType: options.identityType || 'cash_van_crew',
      confidence: options.confidence || 0.88,
      method: 'face_recognition',
      timestamp,
    };
  }

  /**
   * Generate zone transition event
   */
  zoneTransition(
    entityType: 'vehicle' | 'person' | 'object',
    entityId: string,
    zoneId: string,
    transitionType: 'entered' | 'exited',
    options: {
      offsetSeconds?: number;
    } = {}
  ): ZoneTransitionEvent {
    const timestamp = new Date(
      this.baseTime.getTime() + (options.offsetSeconds || 0) * 1000
    );

    return {
      eventId: generateEventId('zone'),
      type: transitionType === 'entered' ? 'zone.entered' : 'zone.exited',
      tenantId: this.tenantId,
      branchId: this.branchId,
      cameraId: this.cameraId,
      entityType,
      entityId,
      zoneId,
      confidence: 0.96,
      timestamp,
    };
  }

  /**
   * Generate access control event
   */
  accessControl(
    doorId: string,
    eventType: 'granted' | 'denied',
    options: {
      identityId?: string;
      zoneId?: string;
      offsetSeconds?: number;
    } = {}
  ): AccessControlEvent {
    const timestamp = new Date(
      this.baseTime.getTime() + (options.offsetSeconds || 0) * 1000
    );

    return {
      eventId: generateEventId('acc'),
      type: eventType === 'granted' ? 'access.granted' : 'access.denied',
      tenantId: this.tenantId,
      branchId: this.branchId,
      cameraId: this.cameraId,
      doorId,
      zoneId: options.zoneId,
      identityId: options.identityId,
      accessType: 'card',
      timestamp,
    };
  }

  /**
   * Generate object observed event
   */
  objectObserved(
    trackId: string = `obj_${uuidv4().slice(0, 8)}`,
    objectType: string = 'cash_case',
    options: {
      zoneId?: string;
      carriedBy?: string;
      offsetSeconds?: number;
    } = {}
  ): ObjectObservedEvent {
    const timestamp = new Date(
      this.baseTime.getTime() + (options.offsetSeconds || 0) * 1000
    );

    return {
      eventId: generateEventId('obj'),
      type: 'object.observed',
      tenantId: this.tenantId,
      branchId: this.branchId,
      cameraId: this.cameraId,
      trackId,
      objectType,
      zoneId: options.zoneId,
      bbox: { x: 180, y: 250, width: 50, height: 60 },
      confidence: 0.89,
      carriedBy: options.carriedBy,
      timestamp,
    };
  }

  /**
   * Generate object unattended event
   */
  objectUnattended(
    objectTrackId: string,
    durationSeconds: number = 30,
    options: {
      zoneId?: string;
      offsetSeconds?: number;
    } = {}
  ): ObjectUnattendedEvent {
    const timestamp = new Date(
      this.baseTime.getTime() + (options.offsetSeconds || 0) * 1000
    );

    return {
      eventId: generateEventId('una'),
      type: 'object.unattended',
      tenantId: this.tenantId,
      branchId: this.branchId,
      cameraId: this.cameraId,
      objectTrackId,
      zoneId: options.zoneId,
      durationSeconds,
      confidence: 0.94,
      timestamp,
    };
  }
}

/**
 * Workflow Scenario Builder
 * 
 * Creates complete event sequences simulating real-world scenarios
 */
export class WorkflowScenarioBuilder {
  private generator: MockEventGenerator;
  private events: any[] = [];

  constructor(generator: MockEventGenerator = new MockEventGenerator()) {
    this.generator = generator;
  }

  /**
   * Compliant cash van workflow
   */
  compliantWorkflow(): any[] {
    this.events = [];
    const vehicleTrack = 'veh_compliant';
    const guard1Track = 'per_guard1';
    const guard2Track = 'per_guard2';
    const cashCaseTrack = 'obj_case1';

    // 1. Vehicle arrives
    this.events.push(
      this.generator.vehicleObserved(vehicleTrack, {
        vehicleClass: 'van',
        zoneId: 'zone_arrival',
        offsetSeconds: 0,
      })
    );

    // 2. Plate recognized (authorized)
    this.events.push(
      this.generator.plateRecognized(vehicleTrack, 'AUTH123', {
        offsetSeconds: 2,
      })
    );

    // 3. Vehicle stops
    this.events.push(
      this.generator.vehicleStateChanged(vehicleTrack, 'stationary', {
        zoneId: 'zone_arrival',
        offsetSeconds: 5,
      })
    );

    // 4. Guards exit vehicle
    this.events.push(
      this.generator.personObserved(guard1Track, {
        zoneId: 'zone_unloading',
        offsetSeconds: 10,
      })
    );
    this.events.push(
      this.generator.personObserved(guard2Track, {
        zoneId: 'zone_unloading',
        offsetSeconds: 11,
      })
    );

    // 5. Guards identified
    this.events.push(
      this.generator.personIdentityResolved(guard1Track, 'guard_001', {
        identityType: 'guard',
        offsetSeconds: 15,
      })
    );
    this.events.push(
      this.generator.personIdentityResolved(guard2Track, 'guard_002', {
        identityType: 'guard',
        offsetSeconds: 16,
      })
    );

    // 6. Cash case observed
    this.events.push(
      this.generator.objectObserved(cashCaseTrack, 'cash_case', {
        zoneId: 'zone_unloading',
        carriedBy: guard1Track,
        offsetSeconds: 20,
      })
    );

    // 7. Move to secure zone
    this.events.push(
      this.generator.zoneTransition('object', cashCaseTrack, 'zone_secure', 'entered', {
        offsetSeconds: 30,
      })
    );

    // 8. Access control correlation
    this.events.push(
      this.generator.accessControl('door_secure', 'granted', {
        identityId: 'guard_001',
        zoneId: 'zone_secure',
        offsetSeconds: 31,
      })
    );

    // 9. Vehicle departs
    this.events.push(
      this.generator.vehicleStateChanged(vehicleTrack, 'departed', {
        offsetSeconds: 60,
      })
    );

    return this.events;
  }

  /**
   * Unauthorized vehicle scenario
   */
  unauthorizedVehicleWorkflow(): any[] {
    this.events = [];
    const vehicleTrack = 'veh_unauthorized';

    // 1. Vehicle arrives
    this.events.push(
      this.generator.vehicleObserved(vehicleTrack, {
        vehicleClass: 'van',
        zoneId: 'zone_arrival',
        offsetSeconds: 0,
      })
    );

    // 2. Plate recognized (NOT authorized)
    this.events.push(
      this.generator.plateRecognized(vehicleTrack, 'UNKNOWN999', {
        offsetSeconds: 2,
      })
    );

    return this.events;
  }

  /**
   * Insufficient escort scenario
   */
  insufficientEscortWorkflow(): any[] {
    this.events = [];
    const vehicleTrack = 'veh_no_escort';
    const guard1Track = 'per_guard_only';
    const cashCaseTrack = 'obj_case_alone';

    // Vehicle arrives (authorized)
    this.events.push(
      this.generator.vehicleObserved(vehicleTrack, {
        zoneId: 'zone_arrival',
        offsetSeconds: 0,
      })
    );
    this.events.push(
      this.generator.plateRecognized(vehicleTrack, 'AUTH456', {
        offsetSeconds: 2,
      })
    );

    // Only ONE guard (need 2)
    this.events.push(
      this.generator.personObserved(guard1Track, {
        zoneId: 'zone_unloading',
        offsetSeconds: 10,
      })
    );
    this.events.push(
      this.generator.personIdentityResolved(guard1Track, 'guard_003', {
        identityType: 'guard',
        offsetSeconds: 15,
      })
    );

    // Cash case observed
    this.events.push(
      this.generator.objectObserved(cashCaseTrack, 'cash_case', {
        zoneId: 'zone_unloading',
        carriedBy: guard1Track,
        offsetSeconds: 20,
      })
    );

    return this.events;
  }

  /**
   * Unattended object scenario
   */
  unattendedObjectWorkflow(): any[] {
    this.events = [];
    const vehicleTrack = 'veh_unattended';
    const guard1Track = 'per_guard_a';
    const guard2Track = 'per_guard_b';
    const cashCaseTrack = 'obj_case_unattended';

    // Normal start
    this.events.push(
      this.generator.vehicleObserved(vehicleTrack, {
        zoneId: 'zone_arrival',
        offsetSeconds: 0,
      })
    );
    this.events.push(
      this.generator.plateRecognized(vehicleTrack, 'AUTH789', {
        offsetSeconds: 2,
      })
    );

    // Guards
    this.events.push(
      this.generator.personObserved(guard1Track, {
        zoneId: 'zone_unloading',
        offsetSeconds: 10,
      })
    );
    this.events.push(
      this.generator.personObserved(guard2Track, {
        zoneId: 'zone_unloading',
        offsetSeconds: 11,
      })
    );

    // Cash case observed with carrier
    this.events.push(
      this.generator.objectObserved(cashCaseTrack, 'cash_case', {
        zoneId: 'zone_unloading',
        carriedBy: guard1Track,
        offsetSeconds: 20,
      })
    );

    // VIOLATION: Object left unattended
    this.events.push(
      this.generator.objectUnattended(cashCaseTrack, 45, {
        zoneId: 'zone_unloading',
        offsetSeconds: 65,
      })
    );

    return this.events;
  }

  /**
   * No access correlation scenario
   */
  noAccessCorrelationWorkflow(): any[] {
    this.events = [];
    const vehicleTrack = 'veh_no_access';
    const guard1Track = 'per_guard_x';
    const guard2Track = 'per_guard_y';
    const cashCaseTrack = 'obj_case_no_access';

    // Normal start
    this.events.push(
      this.generator.vehicleObserved(vehicleTrack, {
        zoneId: 'zone_arrival',
        offsetSeconds: 0,
      })
    );
    this.events.push(
      this.generator.plateRecognized(vehicleTrack, 'AUTH321', {
        offsetSeconds: 2,
      })
    );

    // Guards
    this.events.push(
      this.generator.personObserved(guard1Track, {
        zoneId: 'zone_unloading',
        offsetSeconds: 10,
      })
    );
    this.events.push(
      this.generator.personObserved(guard2Track, {
        zoneId: 'zone_unloading',
        offsetSeconds: 11,
      })
    );
    this.events.push(
      this.generator.personIdentityResolved(guard1Track, 'guard_005', {
        identityType: 'guard',
        offsetSeconds: 15,
      })
    );
    this.events.push(
      this.generator.personIdentityResolved(guard2Track, 'guard_006', {
        identityType: 'guard',
        offsetSeconds: 16,
      })
    );

    // Cash case
    this.events.push(
      this.generator.objectObserved(cashCaseTrack, 'cash_case', {
        zoneId: 'zone_unloading',
        carriedBy: guard1Track,
        offsetSeconds: 20,
      })
    );

    // VIOLATION: Enter secure zone WITHOUT access control event
    this.events.push(
      this.generator.zoneTransition('object', cashCaseTrack, 'zone_secure', 'entered', {
        offsetSeconds: 30,
      })
    );

    // NO ACCESS EVENT HERE (violation)

    return this.events;
  }

  /**
   * Timeout scenario (unloading takes too long)
   */
  timeoutWorkflow(): any[] {
    this.events = [];
    const vehicleTrack = 'veh_timeout';
    const guard1Track = 'per_guard_slow1';
    const guard2Track = 'per_guard_slow2';
    const cashCaseTrack = 'obj_case_slow';

    // Normal start
    this.events.push(
      this.generator.vehicleObserved(vehicleTrack, {
        zoneId: 'zone_arrival',
        offsetSeconds: 0,
      })
    );
    this.events.push(
      this.generator.plateRecognized(vehicleTrack, 'AUTH654', {
        offsetSeconds: 2,
      })
    );

    // Guards
    this.events.push(
      this.generator.personObserved(guard1Track, {
        zoneId: 'zone_unloading',
        offsetSeconds: 10,
      })
    );
    this.events.push(
      this.generator.personObserved(guard2Track, {
        zoneId: 'zone_unloading',
        offsetSeconds: 11,
      })
    );
    this.events.push(
      this.generator.personIdentityResolved(guard1Track, 'guard_007', {
        identityType: 'guard',
        offsetSeconds: 15,
      })
    );
    this.events.push(
      this.generator.personIdentityResolved(guard2Track, 'guard_008', {
        identityType: 'guard',
        offsetSeconds: 16,
      })
    );

    // Cash case
    this.events.push(
      this.generator.objectObserved(cashCaseTrack, 'cash_case', {
        zoneId: 'zone_unloading',
        carriedBy: guard1Track,
        offsetSeconds: 20,
      })
    );

    // VIOLATION: Takes 15 minutes (900 seconds) - exceeds 720s limit
    this.events.push(
      this.generator.zoneTransition('object', cashCaseTrack, 'zone_secure', 'entered', {
        offsetSeconds: 920, // 15+ minutes later
      })
    );

    return this.events;
  }

  /**
   * Get all events
   */
  getEvents(): any[] {
    return this.events;
  }
}

/**
 * Test scenario runner
 */
export async function runScenario(
  events: any[],
  eventBus: any,
  delayMs: number = 100
): Promise<void> {
  for (const event of events) {
    await eventBus.publish(event, 'test-scenario');
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
