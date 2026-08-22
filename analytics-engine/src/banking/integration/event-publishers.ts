/**
 * Banking Event Publishers
 * 
 * Integration adapters that publish normalized banking events
 * from existing detection systems (vehicle, person, ANPR, zones, access)
 */

import {
  getBankingEventBus,
  generateEventId,
  VehicleObservedEvent,
  PlateRecognizedEvent,
  VehicleStateChangedEvent,
  PersonObservedEvent,
  PersonIdentityResolvedEvent,
  ZoneTransitionEvent,
  AccessControlEvent,
  ObjectObservedEvent,
  ObjectUnattendedEvent,
} from '../events.js';

/**
 * Vehicle Detection Publisher
 * 
 * Publishes vehicle.observed events from vehicle detector
 */
export class VehicleDetectionPublisher {
  private eventBus = getBankingEventBus();

  /**
   * Publish vehicle detection
   */
  async publishVehicleDetection(detection: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    trackId: string;
    vehicleClass: string;
    bbox: any;
    confidence: number;
    zoneId?: string;
    stationary?: boolean;
    timestamp: Date;
  }): Promise<void> {
    const event: VehicleObservedEvent = {
      eventId: generateEventId('veh'),
      type: 'vehicle.observed',
      tenantId: detection.tenantId,
      branchId: detection.branchId,
      cameraId: detection.cameraId,
      trackId: detection.trackId,
      vehicleClass: this.normalizeVehicleClass(detection.vehicleClass),
      zoneId: detection.zoneId,
      bbox: detection.bbox,
      confidence: detection.confidence,
      stationary: detection.stationary,
      timestamp: detection.timestamp,
    };

    await this.eventBus.publish(event, 'vehicle-detector');
  }

  /**
   * Publish vehicle state change
   */
  async publishVehicleStateChange(stateChange: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    vehicleTrackId: string;
    previousState: 'moving' | 'stationary' | 'departed' | 'unknown';
    newState: 'moving' | 'stationary' | 'departed' | 'unknown';
    zoneId?: string;
    timestamp: Date;
  }): Promise<void> {
    const event: VehicleStateChangedEvent = {
      eventId: generateEventId('vst'),
      type: 'vehicle.state_changed',
      tenantId: stateChange.tenantId,
      branchId: stateChange.branchId,
      cameraId: stateChange.cameraId,
      vehicleTrackId: stateChange.vehicleTrackId,
      previousState: stateChange.previousState,
      newState: stateChange.newState,
      zoneId: stateChange.zoneId,
      timestamp: stateChange.timestamp,
    };

    await this.eventBus.publish(event, 'vehicle-detector');
  }

  private normalizeVehicleClass(vehicleClass: string): any {
    const normalized = vehicleClass.toLowerCase();
    if (normalized.includes('van')) return 'van';
    if (normalized.includes('truck')) return 'truck';
    if (normalized.includes('car')) return 'car';
    if (normalized.includes('motorcycle') || normalized.includes('bike')) return 'motorcycle';
    return 'unknown';
  }
}

/**
 * ANPR Publisher
 * 
 * Publishes vehicle.plate_recognized events from ANPR system
 */
export class ANPRPublisher {
  private eventBus = getBankingEventBus();

  /**
   * Publish plate recognition
   */
  async publishPlateRecognition(recognition: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    vehicleTrackId: string;
    plate: string;
    country?: string;
    state?: string;
    confidence: number;
    timestamp: Date;
  }): Promise<void> {
    const event: PlateRecognizedEvent = {
      eventId: generateEventId('anpr'),
      type: 'vehicle.plate_recognized',
      tenantId: recognition.tenantId,
      branchId: recognition.branchId,
      cameraId: recognition.cameraId,
      vehicleTrackId: recognition.vehicleTrackId,
      plate: recognition.plate,
      country: recognition.country,
      state: recognition.state,
      confidence: recognition.confidence,
      timestamp: recognition.timestamp,
    };

    await this.eventBus.publish(event, 'anpr-system');
  }
}

/**
 * Person Tracking Publisher
 * 
 * Publishes person.observed events from human analytics
 */
export class PersonTrackingPublisher {
  private eventBus = getBankingEventBus();

  /**
   * Publish person detection
   */
  async publishPersonDetection(detection: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    trackId: string;
    bbox: any;
    confidence: number;
    zoneId?: string;
    attributes?: {
      uniform?: boolean;
      uniformType?: string;
      carryingObject?: boolean;
    };
    timestamp: Date;
  }): Promise<void> {
    const event: PersonObservedEvent = {
      eventId: generateEventId('per'),
      type: 'person.observed',
      tenantId: detection.tenantId,
      branchId: detection.branchId,
      cameraId: detection.cameraId,
      trackId: detection.trackId,
      zoneId: detection.zoneId,
      bbox: detection.bbox,
      confidence: detection.confidence,
      attributes: detection.attributes,
      timestamp: detection.timestamp,
    };

    await this.eventBus.publish(event, 'human-analytics');
  }
}

/**
 * Face Recognition Publisher
 * 
 * Publishes person.identity_resolved events from face recognition
 */
export class FaceRecognitionPublisher {
  private eventBus = getBankingEventBus();

  /**
   * Publish identity resolution
   */
  async publishIdentityResolution(resolution: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    personTrackId: string;
    identityId: string;
    identityType: 'employee' | 'guard' | 'cash_van_crew' | 'contractor' | 'customer' | 'unknown';
    confidence: number;
    method: 'face_recognition' | 'access_credential' | 'manual';
    timestamp: Date;
  }): Promise<void> {
    const event: PersonIdentityResolvedEvent = {
      eventId: generateEventId('id'),
      type: 'person.identity_resolved',
      tenantId: resolution.tenantId,
      branchId: resolution.branchId,
      cameraId: resolution.cameraId,
      personTrackId: resolution.personTrackId,
      identityId: resolution.identityId,
      identityType: resolution.identityType,
      confidence: resolution.confidence,
      method: resolution.method,
      timestamp: resolution.timestamp,
    };

    await this.eventBus.publish(event, 'face-recognition');
  }
}

/**
 * Zone Engine Publisher
 * 
 * Publishes zone.entered and zone.exited events
 */
export class ZoneEnginePublisher {
  private eventBus = getBankingEventBus();

  /**
   * Publish zone transition
   */
  async publishZoneTransition(transition: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    entityType: 'vehicle' | 'person' | 'object';
    entityId: string;
    zoneId: string;
    transitionType: 'entered' | 'exited';
    confidence: number;
    timestamp: Date;
  }): Promise<void> {
    const event: ZoneTransitionEvent = {
      eventId: generateEventId('zone'),
      type: transition.transitionType === 'entered' ? 'zone.entered' : 'zone.exited',
      tenantId: transition.tenantId,
      branchId: transition.branchId,
      cameraId: transition.cameraId,
      entityType: transition.entityType,
      entityId: transition.entityId,
      zoneId: transition.zoneId,
      confidence: transition.confidence,
      timestamp: transition.timestamp,
    };

    await this.eventBus.publish(event, 'zone-engine');
  }
}

/**
 * Access Control Publisher
 * 
 * Publishes access.granted and access.denied events
 */
export class AccessControlPublisher {
  private eventBus = getBankingEventBus();

  /**
   * Publish access control event
   */
  async publishAccessEvent(accessEvent: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    doorId: string;
    zoneId?: string;
    eventType: 'granted' | 'denied';
    credentialId?: string;
    identityId?: string;
    accessType: 'card' | 'biometric' | 'pin' | 'manual' | 'unknown';
    reason?: string;
    timestamp: Date;
  }): Promise<void> {
    const event: AccessControlEvent = {
      eventId: generateEventId('acc'),
      type: accessEvent.eventType === 'granted' ? 'access.granted' : 'access.denied',
      tenantId: accessEvent.tenantId,
      branchId: accessEvent.branchId,
      cameraId: accessEvent.cameraId,
      doorId: accessEvent.doorId,
      zoneId: accessEvent.zoneId,
      credentialId: accessEvent.credentialId,
      identityId: accessEvent.identityId,
      accessType: accessEvent.accessType,
      reason: accessEvent.reason,
      timestamp: accessEvent.timestamp,
    };

    await this.eventBus.publish(event, 'access-control');
  }
}

/**
 * Object Detection Publisher
 * 
 * Publishes object.observed events for transfer objects
 */
export class ObjectDetectionPublisher {
  private eventBus = getBankingEventBus();

  /**
   * Publish object detection
   */
  async publishObjectDetection(detection: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    trackId: string;
    objectType: string;
    bbox: any;
    confidence: number;
    zoneId?: string;
    carriedBy?: string;
    timestamp: Date;
  }): Promise<void> {
    const event: ObjectObservedEvent = {
      eventId: generateEventId('obj'),
      type: 'object.observed',
      tenantId: detection.tenantId,
      branchId: detection.branchId,
      cameraId: detection.cameraId,
      trackId: detection.trackId,
      objectType: this.normalizeObjectType(detection.objectType),
      zoneId: detection.zoneId,
      bbox: detection.bbox,
      confidence: detection.confidence,
      carriedBy: detection.carriedBy,
      timestamp: detection.timestamp,
    };

    await this.eventBus.publish(event, 'object-detector');
  }

  /**
   * Publish unattended object alert
   */
  async publishUnattendedObject(alert: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    objectTrackId: string;
    zoneId?: string;
    durationSeconds: number;
    confidence: number;
    timestamp: Date;
  }): Promise<void> {
    const event: ObjectUnattendedEvent = {
      eventId: generateEventId('una'),
      type: 'object.unattended',
      tenantId: alert.tenantId,
      branchId: alert.branchId,
      cameraId: alert.cameraId,
      objectTrackId: alert.objectTrackId,
      zoneId: alert.zoneId,
      durationSeconds: alert.durationSeconds,
      confidence: alert.confidence,
      timestamp: alert.timestamp,
    };

    await this.eventBus.publish(event, 'object-detector');
  }

  private normalizeObjectType(objectType: string): any {
    const normalized = objectType.toLowerCase();
    if (normalized.includes('cash') && normalized.includes('case')) return 'cash_case';
    if (normalized.includes('cash') && normalized.includes('bag')) return 'cash_bag';
    if (normalized.includes('security') && normalized.includes('container')) return 'security_container';
    if (normalized.includes('briefcase')) return 'briefcase';
    if (normalized.includes('bag')) return 'bag';
    if (normalized.includes('box')) return 'box';
    if (normalized.includes('container')) return 'container';
    return 'unknown';
  }
}

/**
 * Integration Manager
 * 
 * Centralized manager for all event publishers
 */
export class BankingIntegrationManager {
  public vehicle = new VehicleDetectionPublisher();
  public anpr = new ANPRPublisher();
  public person = new PersonTrackingPublisher();
  public face = new FaceRecognitionPublisher();
  public zone = new ZoneEnginePublisher();
  public access = new AccessControlPublisher();
  public object = new ObjectDetectionPublisher();

  /**
   * Example: Wire up vehicle analytics integration
   */
  integrateVehicleAnalytics(vehicleAnalytics: any) {
    // Listen to vehicle detection events
    vehicleAnalytics.on('vehicle-detected', async (detection: any) => {
      await this.vehicle.publishVehicleDetection({
        tenantId: detection.tenantId || 'default',
        branchId: detection.branchId || 'default',
        cameraId: detection.cameraId,
        trackId: detection.trackId || detection.id,
        vehicleClass: detection.vehicleType || detection.class,
        bbox: detection.bbox || detection.boundingBox,
        confidence: detection.confidence || 0.9,
        zoneId: detection.zoneId,
        stationary: detection.stationary,
        timestamp: detection.timestamp || new Date(),
      });
    });

    // Listen to ANPR events
    if (vehicleAnalytics.anpr) {
      vehicleAnalytics.anpr.on('plate-recognized', async (recognition: any) => {
        await this.anpr.publishPlateRecognition({
          tenantId: recognition.tenantId || 'default',
          branchId: recognition.branchId || 'default',
          cameraId: recognition.cameraId,
          vehicleTrackId: recognition.vehicleId || recognition.trackId,
          plate: recognition.plate || recognition.normalizedPlate,
          country: recognition.country,
          state: recognition.state,
          confidence: recognition.confidence || 0.9,
          timestamp: recognition.timestamp || new Date(),
        });
      });
    }
  }

  /**
   * Example: Wire up human analytics integration
   */
  integrateHumanAnalytics(humanAnalytics: any) {
    // Listen to person detection events
    humanAnalytics.on('person-detected', async (detection: any) => {
      await this.person.publishPersonDetection({
        tenantId: detection.tenantId || 'default',
        branchId: detection.branchId || 'default',
        cameraId: detection.cameraId,
        trackId: detection.trackId || detection.id,
        bbox: detection.bbox || detection.boundingBox,
        confidence: detection.confidence || 0.9,
        zoneId: detection.zoneId,
        attributes: detection.attributes,
        timestamp: detection.timestamp || new Date(),
      });
    });
  }

  /**
   * Example: Wire up face recognition integration
   */
  integrateFaceRecognition(faceRecognition: any) {
    faceRecognition.on('identity-resolved', async (resolution: any) => {
      await this.face.publishIdentityResolution({
        tenantId: resolution.tenantId || 'default',
        branchId: resolution.branchId || 'default',
        cameraId: resolution.cameraId,
        personTrackId: resolution.personTrackId || resolution.trackId,
        identityId: resolution.identityId || resolution.personId,
        identityType: resolution.identityType || 'unknown',
        confidence: resolution.confidence || 0.9,
        method: resolution.method || 'face_recognition',
        timestamp: resolution.timestamp || new Date(),
      });
    });
  }

  /**
   * Example: Wire up access control integration
   */
  integrateAccessControl(accessControl: any) {
    accessControl.on('access-event', async (event: any) => {
      await this.access.publishAccessEvent({
        tenantId: event.tenantId || 'default',
        branchId: event.branchId || 'default',
        cameraId: event.cameraId || 'access-control-camera',
        doorId: event.doorId || event.accessPointId,
        zoneId: event.zoneId,
        eventType: event.granted ? 'granted' : 'denied',
        credentialId: event.credentialId || event.cardId,
        identityId: event.userId || event.identityId,
        accessType: event.accessType || 'card',
        reason: event.reason,
        timestamp: event.timestamp || new Date(),
      });
    });
  }
}

/**
 * Singleton instance
 */
let integrationManager: BankingIntegrationManager | null = null;

export function getBankingIntegrationManager(): BankingIntegrationManager {
  if (!integrationManager) {
    integrationManager = new BankingIntegrationManager();
  }
  return integrationManager;
}

export function setBankingIntegrationManager(manager: BankingIntegrationManager): void {
  integrationManager = manager;
}
