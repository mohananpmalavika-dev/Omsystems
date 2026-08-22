/**
 * Cash Van Workflow Engine
 * 
 * Manages state transitions and event handling for cash van sessions.
 * Consumes normalized banking events and updates session state.
 */

import {
  BankingObservation,
  VehicleObservedEvent,
  PlateRecognizedEvent,
  VehicleStateChangedEvent,
  PersonObservedEvent,
  PersonIdentityResolvedEvent,
  ZoneTransitionEvent,
  AccessControlEvent,
  ObjectObservedEvent,
  ObjectTransferEvent,
  ObjectUnattendedEvent,
  isVehicleEvent,
  isPlateEvent,
  isPersonEvent,
  isIdentityEvent,
  isZoneEvent,
  isAccessEvent,
  isObjectEvent,
} from '../events/banking-events.js';

import {
  CashVanSession,
  CashVanState,
  ObservedVehicle,
  ObservedPerson,
  ObservedObject,
  SessionAccessEvent,
  ZoneVisit,
  WorkflowAssessment,
} from '../models/cash-van-session.js';

import {
  CashVanSessionRepository,
  getCashVanSessionRepository,
} from '../repositories/cash-van-session.repository.js';

import {
  CashVanMonitorRepository,
  getCashVanMonitorRepository,
} from '../repositories/cash-van-monitor.repository.js';

import {
  ExpectedVisitRepository,
  getExpectedVisitRepository,
} from '../repositories/expected-visit.repository.js';

import {
  PersonnelAuthorizationRepository,
  getPersonnelAuthorizationRepository,
} from '../repositories/personnel-authorization.repository.js';

import {
  CashVanRuleEngine,
  getCashVanRuleEngine,
  determineWorkflowAssessment,
} from '../rules/rule-engine.js';

/**
 * Cash Van Workflow Engine
 */
export class CashVanWorkflow {
  constructor(
    private sessionRepo: CashVanSessionRepository = getCashVanSessionRepository(),
    private monitorRepo: CashVanMonitorRepository = getCashVanMonitorRepository(),
    private visitRepo: ExpectedVisitRepository = getExpectedVisitRepository(),
    private personnelRepo: PersonnelAuthorizationRepository = getPersonnelAuthorizationRepository(),
    private ruleEngine: CashVanRuleEngine = getCashVanRuleEngine()
  ) {}

  /**
   * Handle vehicle observed event
   */
  async handleVehicleObserved(event: VehicleObservedEvent): Promise<void> {
    // Only care about vehicles in monitored zones
    if (!event.zoneId) {
      return;
    }

    // Find monitor for this zone
    const monitor = await this.monitorRepo.findByArrivalZone(
      event.tenantId,
      event.branchId,
      event.zoneId
    );

    if (!monitor) {
      return;
    }

    // Check if session already exists for this vehicle
    let session = await this.sessionRepo.findByVehicleTrack(event.tenantId, event.trackId);

    if (!session) {
      // Create new session
      session = await this.sessionRepo.create({
        tenantId: event.tenantId,
        branchId: event.branchId,
        monitorId: monitor.id,
        vehicleTrackId: event.trackId,
        state: 'vehicle_detected',
        startedAt: event.timestamp,
      });

      // Set expiration
      const expiresAt = new Date(event.timestamp.getTime() + monitor.sessionTimeoutMinutes * 60_000);
      await this.sessionRepo.update(session.id, {
        vehicle: {
          trackId: event.trackId,
          vehicleClass: event.vehicleClass,
          authorized: false,
          stationary: event.stationary || false,
          arrivedAt: event.timestamp,
          lastSeenAt: event.timestamp,
          lastZoneId: event.zoneId,
          confidence: event.confidence,
        } as ObservedVehicle,
        evidenceAvailability: { vehicleDetection: true },
      });

      session = (await this.sessionRepo.findById(session.id))!;
    } else {
      // Update existing vehicle observation
      await this.sessionRepo.update(session.id, {
        vehicle: {
          ...session.vehicle,
          lastSeenAt: event.timestamp,
          lastZoneId: event.zoneId,
          stationary: event.stationary,
          confidence: Math.max(session.vehicle?.confidence || 0, event.confidence),
        } as Partial<ObservedVehicle>,
      });
    }

    // Record arrival time if not set
    if (!session.vehicleArrivedAt && event.zoneId === monitor.arrivalZoneId) {
      await this.sessionRepo.update(session.id, {
        vehicle: {
          arrivedAt: event.timestamp,
        } as Partial<ObservedVehicle>,
      });
    }
  }

  /**
   * Handle plate recognized event
   */
  async handlePlateRecognized(event: PlateRecognizedEvent): Promise<void> {
    const session = await this.sessionRepo.findByVehicleTrack(event.tenantId, event.vehicleTrackId);
    if (!session) {
      return;
    }

    const monitor = await this.monitorRepo.findById(session.monitorId);
    if (!monitor) {
      return;
    }

    // Update session with plate
    await this.sessionRepo.update(session.id, {
      vehicle: {
        plate: event.plate,
        plateConfidence: event.confidence,
        authorized: this.isPlateAuthorized(event.plate, monitor.allowedVehicles),
      } as Partial<ObservedVehicle>,
      evidenceAvailability: { anpr: true },
    });

    // Try to match with expected visit
    const visit = await this.visitRepo.findMatchingVisit({
      branchId: session.branchId,
      plate: event.plate,
      timestamp: event.timestamp,
    });

    if (visit) {
      await this.sessionRepo.update(session.id, {
        state: 'vehicle_verified',
      });
      await this.visitRepo.markArrived(visit.id, session.id);
    } else {
      // Check if authorized
      const authorized = this.isPlateAuthorized(event.plate, monitor.allowedVehicles);
      if (authorized) {
        await this.sessionRepo.update(session.id, {
          state: 'vehicle_verified',
        });
      }
    }

    // Evaluate rules
    await this.evaluateSession(session.id);
  }

  /**
   * Handle vehicle state changed
   */
  async handleVehicleStateChanged(event: VehicleStateChangedEvent): Promise<void> {
    const session = await this.sessionRepo.findByVehicleTrack(event.tenantId, event.vehicleTrackId);
    if (!session) {
      return;
    }

    // Update stationary status
    if (event.newState === 'stationary') {
      await this.sessionRepo.update(session.id, {
        vehicle: {
          stationary: true,
        } as Partial<ObservedVehicle>,
      });
    } else if (event.newState === 'moving') {
      await this.sessionRepo.update(session.id, {
        vehicle: {
          stationary: false,
        } as Partial<ObservedVehicle>,
      });
    } else if (event.newState === 'departed') {
      await this.sessionRepo.update(session.id, {
        state: 'departed',
      });

      // Evaluate final rules
      await this.evaluateSession(session.id);
    }
  }

  /**
   * Handle person observed event
   */
  async handlePersonObserved(event: PersonObservedEvent): Promise<void> {
    // Find sessions in this zone
    const monitor = event.zoneId
      ? await this.monitorRepo.findByArrivalZone(event.tenantId, event.branchId, event.zoneId)
      : null;

    if (!monitor) {
      return;
    }

    // Find active sessions for this monitor
    const sessions = await this.sessionRepo.findActiveForMonitor(
      event.tenantId,
      event.branchId,
      monitor.id
    );

    for (const session of sessions) {
      // Check if person already tracked
      const existing = session.personnel.find(p => p.trackId === event.trackId);
      if (existing) {
        // Update last seen
        await this.sessionRepo.update(session.id, {
          updatePersonnel: {
            trackId: event.trackId,
            lastSeenAt: event.timestamp,
            currentZoneId: event.zoneId,
            confidence: Math.max(existing.confidence, event.confidence),
          },
        });
      } else {
        // Determine if associated with vehicle
        const associatedWithVehicle = this.isPersonAssociatedWithVehicle(
          session,
          event,
          monitor
        );

        // Add new person
        const person: ObservedPerson = {
          trackId: event.trackId,
          firstSeenAt: event.timestamp,
          lastSeenAt: event.timestamp,
          currentZoneId: event.zoneId,
          zoneHistory: event.zoneId ? [{ zoneId: event.zoneId, enteredAt: event.timestamp }] : [],
          associatedWithVehicle,
          confidence: event.confidence,
        };

        await this.sessionRepo.update(session.id, {
          addPersonnel: person,
          evidenceAvailability: { personTracking: true },
        });
      }
    }
  }

  /**
   * Handle person identity resolved
   */
  async handlePersonIdentityResolved(event: PersonIdentityResolvedEvent): Promise<void> {
    // Find sessions with this person track
    const allSessions = await this.sessionRepo.query({ tenantId: event.tenantId, activeOnly: true });

    for (const session of allSessions) {
      const person = session.personnel.find(p => p.trackId === event.personTrackId);
      if (!person) {
        continue;
      }

      // Get authorization details
      const auth = await this.personnelRepo.findByIdentityId(event.identityId);

      await this.sessionRepo.update(session.id, {
        updatePersonnel: {
          trackId: event.personTrackId,
          identityId: event.identityId,
          identityConfidence: event.confidence,
          identityType: event.identityType,
          roles: auth?.roles || [],
          firstName: auth?.firstName,
          lastName: auth?.lastName,
        },
        evidenceAvailability: { faceRecognition: true },
      });

      // Check if we can advance state
      const updatedSession = await this.sessionRepo.findById(session.id);
      if (updatedSession) {
        await this.advanceStateIfReady(updatedSession);
      }
    }
  }

  /**
   * Handle zone transition
   */
  async handleZoneTransition(event: ZoneTransitionEvent): Promise<void> {
    const allSessions = await this.sessionRepo.query({
      tenantId: event.tenantId,
      branchId: event.branchId,
      activeOnly: true,
    });

    for (const session of allSessions) {
      if (event.entityType === 'person') {
        const person = session.personnel.find(p => p.trackId === event.entityId);
        if (person) {
          const zoneHistory = [...person.zoneHistory];

          if (event.type === 'zone.entered') {
            zoneHistory.push({ zoneId: event.zoneId, enteredAt: event.timestamp });
          } else if (event.type === 'zone.exited') {
            const lastVisit = zoneHistory.find(
              z => z.zoneId === event.zoneId && !z.exitedAt
            );
            if (lastVisit) {
              lastVisit.exitedAt = event.timestamp;
            }
          }

          await this.sessionRepo.update(session.id, {
            updatePersonnel: {
              trackId: event.entityId,
              currentZoneId: event.type === 'zone.entered' ? event.zoneId : undefined,
              zoneHistory,
            },
          });
        }
      } else if (event.entityType === 'object') {
        const obj = session.transferObjects.find(o => o.trackId === event.entityId);
        if (obj) {
          const zoneHistory = [...obj.zoneHistory];

          if (event.type === 'zone.entered') {
            zoneHistory.push({ zoneId: event.zoneId, enteredAt: event.timestamp });
          } else if (event.type === 'zone.exited') {
            const lastVisit = zoneHistory.find(
              z => z.zoneId === event.zoneId && !z.exitedAt
            );
            if (lastVisit) {
              lastVisit.exitedAt = event.timestamp;
            }
          }

          obj.zoneHistory = zoneHistory;
          obj.currentZoneId = event.type === 'zone.entered' ? event.zoneId : undefined;
          obj.lastSeenAt = event.timestamp;
        }
      }

      // Check if we can advance state
      await this.advanceStateIfReady(session);
      await this.evaluateSession(session.id);
    }
  }

  /**
   * Handle access control event
   */
  async handleAccessControl(event: AccessControlEvent): Promise<void> {
    // Find relevant sessions
    const allSessions = await this.sessionRepo.query({
      tenantId: event.tenantId,
      branchId: event.branchId,
      activeOnly: true,
    });

    for (const session of allSessions) {
      const accessEvent: SessionAccessEvent = {
        eventId: event.eventId,
        doorId: event.doorId,
        zoneId: event.zoneId,
        type: event.type === 'access.granted' ? 'granted' : 'denied',
        credentialId: event.credentialId,
        identityId: event.identityId,
        accessType: event.accessType,
        timestamp: event.timestamp,
      };

      await this.sessionRepo.update(session.id, {
        addAccessEvent: accessEvent,
        evidenceAvailability: { accessControl: true },
      });
    }
  }

  /**
   * Handle object observed
   */
  async handleObjectObserved(event: ObjectObservedEvent): Promise<void> {
    const monitor = event.zoneId
      ? await this.monitorRepo.findByArrivalZone(event.tenantId, event.branchId, event.zoneId)
      : null;

    if (!monitor) {
      return;
    }

    const sessions = await this.sessionRepo.findActiveForMonitor(
      event.tenantId,
      event.branchId,
      monitor.id
    );

    for (const session of sessions) {
      const existing = session.transferObjects.find(o => o.trackId === event.trackId);
      
      if (existing) {
        existing.lastSeenAt = event.timestamp;
        existing.currentZoneId = event.zoneId;
        existing.carriedBy = event.carriedBy;
        existing.confidence = Math.max(existing.confidence, event.confidence);
      } else {
        // Check if this is a transfer object type
        if (!monitor.unloadingRules.transferObjectClasses.includes(event.objectType)) {
          continue;
        }

        const obj: ObservedObject = {
          trackId: event.trackId,
          objectType: event.objectType,
          firstSeenAt: event.timestamp,
          lastSeenAt: event.timestamp,
          currentZoneId: event.zoneId,
          zoneHistory: event.zoneId ? [{ zoneId: event.zoneId, enteredAt: event.timestamp }] : [],
          carriedBy: event.carriedBy,
          confidence: event.confidence,
        };

        await this.sessionRepo.update(session.id, {
          addObject: obj,
          evidenceAvailability: { transferObjectDetection: true },
        });

        // Mark unloading started if not already
        if (!session.unloadingStartedAt && session.state === 'escort_verified') {
          await this.sessionRepo.update(session.id, {
            state: 'unloading',
          });
        }
      }
    }
  }

  /**
   * Handle object unattended
   */
  async handleObjectUnattended(event: ObjectUnattendedEvent): Promise<void> {
    const allSessions = await this.sessionRepo.query({
      tenantId: event.tenantId,
      branchId: event.branchId,
      activeOnly: true,
    });

    for (const session of allSessions) {
      const obj = session.transferObjects.find(o => o.trackId === event.objectTrackId);
      if (obj) {
        obj.unattendedSince = new Date(
          event.timestamp.getTime() - event.durationSeconds * 1000
        );

        // Evaluate rules immediately
        await this.evaluateSession(session.id);
      }
    }
  }

  /**
   * Advance session state if conditions are met
   */
  private async advanceStateIfReady(session: CashVanSession): Promise<void> {
    const monitor = await this.monitorRepo.findById(session.monitorId);
    if (!monitor) {
      return;
    }

    switch (session.state) {
      case 'vehicle_detected':
        // Advance if plate verified
        if (session.vehicle?.authorized) {
          await this.sessionRepo.update(session.id, { state: 'vehicle_verified' });
        }
        break;

      case 'vehicle_verified':
        // Advance to personnel verification
        if (session.personnel.length > 0) {
          await this.sessionRepo.update(session.id, { state: 'personnel_verification' });
        }
        break;

      case 'personnel_verification':
        // Check if minimum personnel met
        const stablePersonnel = session.personnel.filter(p => p.associatedWithVehicle);
        if (stablePersonnel.length >= monitor.personnelRules.minimumPersonnel) {
          await this.sessionRepo.update(session.id, { state: 'escort_verified' });
        }
        break;

      case 'escort_verified':
        // Advance to unloading if transfer objects observed
        if (session.transferObjects.length > 0) {
          await this.sessionRepo.update(session.id, {
            state: 'unloading',
          });
        }
        break;

      case 'unloading':
        // Check if objects reached secure zone
        const secureZoneId = monitor.secureEntryZoneId;
        if (secureZoneId) {
          const allInSecureZone = session.transferObjects.every(obj =>
            obj.zoneHistory.some(z => z.zoneId === secureZoneId)
          );
          if (allInSecureZone) {
            await this.sessionRepo.update(session.id, { state: 'secure_zone_entry' });
          }
        }
        break;

      case 'secure_zone_entry':
        // Mark transfer complete
        await this.sessionRepo.update(session.id, { state: 'transfer_complete' });
        break;
    }
  }

  /**
   * Evaluate all rules for a session
   */
  private async evaluateSession(sessionId: string): Promise<void> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      return;
    }

    const monitor = await this.monitorRepo.findById(session.monitorId);
    if (!monitor) {
      return;
    }

    // Evaluate all rules
    const results = await this.ruleEngine.evaluate(session, monitor);

    // Determine overall assessment
    const { assessment, confidence } = determineWorkflowAssessment(results);

    // Update session
    await this.sessionRepo.update(sessionId, {
      assessment,
      overallConfidence: confidence,
    });

    // Add violations from failed rules
    for (const result of results) {
      if (result.status === 'fail') {
        const existing = session.violations.find(v => v.ruleCode === result.ruleId);
        if (!existing) {
          await this.sessionRepo.update(sessionId, {
            addViolation: {
              ruleCode: result.ruleId,
              ruleName: result.ruleName,
              severity: result.severity!,
              status: 'active',
              description: result.message,
              details: result.details,
              evidence: result.evidence,
              confidence: result.confidence,
              firstDetectedAt: result.evaluatedAt,
              lastDetectedAt: result.evaluatedAt,
            },
          });
        }
      }
    }
  }

  /**
   * Check if plate is authorized
   */
  private isPlateAuthorized(plate: string, rules: any[]): boolean {
    const normalizedPlate = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    for (const rule of rules) {
      if (!rule.enabled) {
        continue;
      }

      if (rule.plate) {
        if (rule.plate.replace(/[^A-Z0-9]/gi, '').toUpperCase() === normalizedPlate) {
          return true;
        }
      }

      if (rule.plateRegex) {
        try {
          if (new RegExp(rule.plateRegex, 'i').test(normalizedPlate)) {
            return true;
          }
        } catch (e) {
          // Invalid regex
        }
      }
    }

    return false;
  }

  /**
   * Determine if person is associated with the cash van
   */
  private isPersonAssociatedWithVehicle(
    session: CashVanSession,
    event: PersonObservedEvent,
    monitor: any
  ): boolean {
    if (!session.vehicle || !session.vehicleArrivedAt) {
      return false;
    }

    // Check time window - appeared shortly after vehicle
    const timeDiff = event.timestamp.getTime() - session.vehicleArrivedAt.getTime();
    if (timeDiff < 0 || timeDiff > 60_000) {
      // More than 1 minute after arrival
      return false;
    }

    // Check zone - must be in unloading zone or nearby
    if (event.zoneId === monitor.unloadingZoneId || event.zoneId === monitor.arrivalZoneId) {
      return true;
    }

    return false;
  }
}

/**
 * Singleton instance
 */
let workflow: CashVanWorkflow | null = null;

export function getCashVanWorkflow(): CashVanWorkflow {
  if (!workflow) {
    workflow = new CashVanWorkflow();
  }
  return workflow;
}

export function setCashVanWorkflow(wf: CashVanWorkflow): void {
  workflow = wf;
}
