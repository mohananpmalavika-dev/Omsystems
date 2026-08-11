/**
 * Cash Van Session Repository
 * 
 * Persistent storage for cash van workflow sessions.
 * In-memory implementation with hooks for database integration.
 */

import {
  CashVanSession,
  CashVanState,
  CreateCashVanSessionInput,
  UpdateCashVanSessionInput,
  WorkflowAssessment,
  ObservedPerson,
  ObservedObject,
  CashVanViolation,
  SessionAccessEvent,
} from '../models/cash-van-session.js';
import { v4 as uuidv4 } from 'uuid';

export interface SessionQueryFilters {
  tenantId?: string;
  branchId?: string;
  monitorId?: string;
  state?: CashVanState | CashVanState[];
  assessment?: WorkflowAssessment;
  vehicleTrackId?: string;
  plate?: string;
  activeOnly?: boolean;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Cash Van Session Repository
 */
export class CashVanSessionRepository {
  private sessions = new Map<string, CashVanSession>();
  private trackIndex = new Map<string, string>(); // vehicleTrackId -> sessionId
  private monitorIndex = new Map<string, Set<string>>(); // monitorId -> Set<sessionId>

  /**
   * Create a new cash van session
   */
  async create(input: CreateCashVanSessionInput): Promise<CashVanSession> {
    const now = new Date();
    const session: CashVanSession = {
      id: `cvs_${uuidv4().replace(/-/g, '')}`,
      tenantId: input.tenantId,
      branchId: input.branchId,
      monitorId: input.monitorId,
      scheduledVisitId: input.scheduledVisitId,
      vehicleTrackId: input.vehicleTrackId,
      
      state: input.state || 'expected',
      assessment: 'in_progress',
      
      startedAt: input.startedAt || now,
      lastUpdatedAt: now,
      
      personnel: [],
      transferObjects: [],
      violations: [],
      accessEvents: [],
      
      evidenceAvailability: {
        vehicleDetection: false,
        anpr: false,
        personTracking: false,
        faceRecognition: false,
        accessControl: false,
        transferObjectDetection: false,
        lastCheckedAt: now,
      },
      
      overallConfidence: 0,
      
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(session.id, session);

    if (input.vehicleTrackId) {
      this.trackIndex.set(input.vehicleTrackId, session.id);
    }

    if (!this.monitorIndex.has(input.monitorId)) {
      this.monitorIndex.set(input.monitorId, new Set());
    }
    this.monitorIndex.get(input.monitorId)!.add(session.id);

    return session;
  }

  /**
   * Find session by ID
   */
  async findById(sessionId: string): Promise<CashVanSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Find session by vehicle track ID
   */
  async findByVehicleTrack(tenantId: string, vehicleTrackId: string): Promise<CashVanSession | null> {
    const sessionId = this.trackIndex.get(vehicleTrackId);
    if (!sessionId) {
      return null;
    }

    const session = this.sessions.get(sessionId);
    if (!session || session.tenantId !== tenantId) {
      return null;
    }

    return session;
  }

  /**
   * Find active sessions for a monitor
   */
  async findActiveForMonitor(tenantId: string, branchId: string, monitorId: string): Promise<CashVanSession[]> {
    const sessionIds = this.monitorIndex.get(monitorId);
    if (!sessionIds) {
      return [];
    }

    const activeStates: CashVanState[] = [
      'expected',
      'vehicle_detected',
      'vehicle_verified',
      'personnel_verification',
      'escort_verified',
      'unloading',
      'secure_zone_entry',
      'transfer_complete',
    ];

    const sessions: CashVanSession[] = [];
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (
        session &&
        session.tenantId === tenantId &&
        session.branchId === branchId &&
        activeStates.includes(session.state)
      ) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Query sessions with filters
   */
  async query(filters: SessionQueryFilters): Promise<CashVanSession[]> {
    let sessions = Array.from(this.sessions.values());

    if (filters.tenantId) {
      sessions = sessions.filter(s => s.tenantId === filters.tenantId);
    }

    if (filters.branchId) {
      sessions = sessions.filter(s => s.branchId === filters.branchId);
    }

    if (filters.monitorId) {
      sessions = sessions.filter(s => s.monitorId === filters.monitorId);
    }

    if (filters.state) {
      const states = Array.isArray(filters.state) ? filters.state : [filters.state];
      sessions = sessions.filter(s => states.includes(s.state));
    }

    if (filters.assessment) {
      sessions = sessions.filter(s => s.assessment === filters.assessment);
    }

    if (filters.vehicleTrackId) {
      sessions = sessions.filter(s => s.vehicleTrackId === filters.vehicleTrackId);
    }

    if (filters.plate) {
      sessions = sessions.filter(s => s.plate?.toLowerCase().includes(filters.plate!.toLowerCase()));
    }

    if (filters.activeOnly) {
      const activeStates: CashVanState[] = [
        'expected',
        'vehicle_detected',
        'vehicle_verified',
        'personnel_verification',
        'escort_verified',
        'unloading',
        'secure_zone_entry',
        'transfer_complete',
      ];
      sessions = sessions.filter(s => activeStates.includes(s.state));
    }

    if (filters.startDate) {
      sessions = sessions.filter(s => s.startedAt >= filters.startDate!);
    }

    if (filters.endDate) {
      sessions = sessions.filter(s => s.startedAt <= filters.endDate!);
    }

    return sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  /**
   * Update a session
   */
  async update(sessionId: string, update: UpdateCashVanSessionInput): Promise<CashVanSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const now = new Date();

    // Update scalar fields
    if (update.state !== undefined) {
      session.state = update.state;
    }

    if (update.assessment !== undefined) {
      session.assessment = update.assessment;
    }

    if (update.overallConfidence !== undefined) {
      session.overallConfidence = update.overallConfidence;
    }

    // Update vehicle
    if (update.vehicle) {
      session.vehicle = { ...session.vehicle, ...update.vehicle } as any;
      if (update.vehicle.trackId && !session.vehicleTrackId) {
        session.vehicleTrackId = update.vehicle.trackId;
        this.trackIndex.set(update.vehicle.trackId, sessionId);
      }
      if (update.vehicle.plate && !session.plate) {
        session.plate = update.vehicle.plate;
      }
    }

    // Add personnel
    if (update.addPersonnel) {
      const existing = session.personnel.find(p => p.trackId === update.addPersonnel!.trackId);
      if (!existing) {
        session.personnel.push(update.addPersonnel);
      }
    }

    // Update personnel
    if (update.updatePersonnel) {
      const index = session.personnel.findIndex(p => p.trackId === update.updatePersonnel!.trackId);
      if (index >= 0) {
        session.personnel[index] = { ...session.personnel[index], ...update.updatePersonnel };
      }
    }

    // Add object
    if (update.addObject) {
      const existing = session.transferObjects.find(o => o.trackId === update.addObject!.trackId);
      if (!existing) {
        session.transferObjects.push(update.addObject);
      }
    }

    // Add violation
    if (update.addViolation) {
      const violation: CashVanViolation = {
        ...update.addViolation,
        id: `vio_${uuidv4().replace(/-/g, '')}`,
        sessionId,
        status: update.addViolation.status || 'active',
        createdAt: now,
        updatedAt: now,
      };
      session.violations.push(violation);
    }

    // Add access event
    if (update.addAccessEvent) {
      const existing = session.accessEvents.find(e => e.eventId === update.addAccessEvent!.eventId);
      if (!existing) {
        session.accessEvents.push(update.addAccessEvent);
      }
    }

    // Update evidence availability
    if (update.evidenceAvailability) {
      session.evidenceAvailability = {
        ...session.evidenceAvailability,
        ...update.evidenceAvailability,
        lastCheckedAt: now,
      };
    }

    session.lastUpdatedAt = now;
    session.updatedAt = now;

    return session;
  }

  /**
   * Delete a session
   */
  async delete(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    this.sessions.delete(sessionId);

    if (session.vehicleTrackId) {
      this.trackIndex.delete(session.vehicleTrackId);
    }

    const monitorSessions = this.monitorIndex.get(session.monitorId);
    if (monitorSessions) {
      monitorSessions.delete(sessionId);
    }

    return true;
  }

  /**
   * Get statistics
   */
  async getStats(tenantId: string, branchId?: string) {
    let sessions = Array.from(this.sessions.values()).filter(s => s.tenantId === tenantId);

    if (branchId) {
      sessions = sessions.filter(s => s.branchId === branchId);
    }

    const total = sessions.length;
    const byState: Record<string, number> = {};
    const byAssessment: Record<string, number> = {};
    const activeCount = sessions.filter(s => 
      !['departed', 'expired', 'violation'].includes(s.state)
    ).length;

    for (const session of sessions) {
      byState[session.state] = (byState[session.state] || 0) + 1;
      byAssessment[session.assessment] = (byAssessment[session.assessment] || 0) + 1;
    }

    return {
      total,
      active: activeCount,
      byState,
      byAssessment,
    };
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt && session.expiresAt < now && session.state !== 'departed') {
        await this.update(sessionId, { state: 'expired' });
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clear all sessions (for testing)
   */
  async clear(): Promise<void> {
    this.sessions.clear();
    this.trackIndex.clear();
    this.monitorIndex.clear();
  }
}

/**
 * Singleton instance
 */
let repository: CashVanSessionRepository | null = null;

export function getCashVanSessionRepository(): CashVanSessionRepository {
  if (!repository) {
    repository = new CashVanSessionRepository();
  }
  return repository;
}

export function setCashVanSessionRepository(repo: CashVanSessionRepository): void {
  repository = repo;
}
