/**
 * Fire Safety Equipment Monitor
 * Monitors fire extinguishers, fire blankets, and other safety equipment
 */

import { randomUUID } from 'node:crypto';
import type { ObjectTracker, MultiObjectTracker, TrackedObject, BoundingBox } from './object-tracker.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface SafetyEquipment {
  id: string;
  type: 'fire_extinguisher' | 'fire_blanket' | 'first_aid_kit' | 'aed' | 'fire_hose' | 'fire_alarm';
  location: { x: number; y: number };
  expectedBoundingBox: BoundingBox;
  toleranceRadius: number; // How far detection can be from expected location
  inspectionSchedule?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
    lastInspection?: Date;
    nextInspection?: Date;
  };
  metadata?: {
    serialNumber?: string;
    manufacturer?: string;
    capacity?: string;
    installDate?: Date;
    expiryDate?: Date;
    maintenanceNotes?: string;
  };
}

export interface EquipmentDetection {
  equipmentId: string;
  detected: boolean;
  confidence: number;
  detectedBoundingBox?: BoundingBox;
  distanceFromExpected?: number;
  timestamp: Date;
}

export interface EquipmentStatus {
  equipmentId: string;
  type: string;
  location: { x: number; y: number };
  isPresent: boolean;
  isMisplaced: boolean;
  isObstructed: boolean;
  isInUse: boolean;
  lastSeen?: Date;
  missingDuration?: number; // seconds
  inspectionStatus: 'current' | 'due_soon' | 'overdue' | 'unknown';
  daysUntilInspection?: number;
  status: 'ok' | 'warning' | 'missing' | 'critical';
  issues: string[];
}

export interface EquipmentIncident {
  id: string;
  equipmentId: string;
  type: 'missing' | 'moved' | 'in_use' | 'obstructed' | 'inspection_overdue';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  startedAt: Date;
  lastDetected: Date;
  duration: number; // seconds
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface EquipmentAnalytics {
  totalEquipment: number;
  byType: Record<string, number>;
  present: number;
  missing: number;
  misplaced: number;
  inUse: number;
  obstructed: number;
  inspectionsDue: number;
  inspectionsOverdue: number;
  activeIncidents: number;
  criticalIncidents: number;
}

// ============================================================================
// Fire Safety Equipment Monitor
// ============================================================================

export class FireSafetyEquipmentMonitor {
  private objectTracker: ObjectTracker | MultiObjectTracker;
  private equipment = new Map<string, SafetyEquipment>();
  private detectionHistory = new Map<string, EquipmentDetection[]>();
  private activeIncidents = new Map<string, EquipmentIncident>();
  private incidentHistory: EquipmentIncident[] = [];
  private readonly maxHistorySize = 10000;
  private readonly maxDetectionHistory = 100;
  
  // Configuration
  private readonly missingAlertThreshold = 300; // 5 minutes
  private readonly inspectionWarningDays = 7; // Warn 7 days before due
  private readonly obstructionRadius = 1.0; // meters

  // Equipment class names for detection
  private readonly equipmentClasses: Record<string, string[]> = {
    fire_extinguisher: ['fire_extinguisher', 'extinguisher', 'fire_ext'],
    fire_blanket: ['fire_blanket', 'fire_blanket_box'],
    first_aid_kit: ['first_aid_kit', 'first_aid_box', 'medical_kit'],
    aed: ['aed', 'defibrillator', 'aed_cabinet'],
    fire_hose: ['fire_hose', 'fire_hose_reel', 'hose_reel'],
    fire_alarm: ['fire_alarm', 'alarm_button', 'fire_alarm_pull'],
  };

  constructor(objectTracker: ObjectTracker | MultiObjectTracker) {
    this.objectTracker = objectTracker;
    this.startEquipmentMonitoring();
  }

  // ============================================================================
  // Equipment Management
  // ============================================================================

  /**
   * Register safety equipment
   */
  registerEquipment(equipment: Omit<SafetyEquipment, 'id'>): SafetyEquipment {
    const id = `eq_${randomUUID().substring(0, 8)}`;
    const safetyEquipment: SafetyEquipment = { id, ...equipment };

    this.equipment.set(id, safetyEquipment);
    this.detectionHistory.set(id, []);

    console.log(`✓ Registered ${equipment.type}: ${id} at (${equipment.location.x}, ${equipment.location.y})`);
    return safetyEquipment;
  }

  /**
   * Update equipment
   */
  updateEquipment(equipmentId: string, updates: Partial<SafetyEquipment>): void {
    const equipment = this.equipment.get(equipmentId);
    if (!equipment) throw new Error(`Equipment not found: ${equipmentId}`);
    Object.assign(equipment, updates);
  }

  /**
   * Remove equipment
   */
  removeEquipment(equipmentId: string): void {
    this.equipment.delete(equipmentId);
    this.detectionHistory.delete(equipmentId);
  }

  /**
   * Get equipment
   */
  getEquipment(equipmentId: string): SafetyEquipment | undefined {
    return this.equipment.get(equipmentId);
  }

  /**
   * Get all equipment
   */
  getAllEquipment(): SafetyEquipment[] {
    return Array.from(this.equipment.values());
  }

  /**
   * Get equipment by type
   */
  getEquipmentByType(type: SafetyEquipment['type']): SafetyEquipment[] {
    return Array.from(this.equipment.values()).filter(eq => eq.type === type);
  }

  // ============================================================================
  // Equipment Detection
  // ============================================================================

  /**
   * Check all equipment
   */
  checkAllEquipment(timestamp: Date = new Date()): EquipmentStatus[] {
    const statuses: EquipmentStatus[] = [];
    
    // Handle both ObjectTracker and MultiObjectTracker
    const trackedObjects = 'getActiveTracks' in this.objectTracker
      ? this.objectTracker.getActiveTracks()
      : this.objectTracker.getAllTracks();

    for (const equipment of this.equipment.values()) {
      const status = this.checkEquipment(equipment, trackedObjects, timestamp);
      statuses.push(status);
    }

    return statuses;
  }

  /**
   * Check single equipment
   */
  private checkEquipment(
    equipment: SafetyEquipment,
    trackedObjects: TrackedObject[],
    timestamp: Date
  ): EquipmentStatus {
    // Find detections matching equipment type
    const classNames = this.equipmentClasses[equipment.type] || [equipment.type];
    const candidates = trackedObjects.filter(obj => 
      classNames.some(className => 
        obj.label.toLowerCase().includes(className.toLowerCase())
      )
    );

    // Find best match by distance
    let bestMatch: TrackedObject | null = null;
    let minDistance = Infinity;

    for (const candidate of candidates) {
      const candidateCenter = this.getCenterPoint(candidate.boundingBox);
      const distance = this.calculateDistance(equipment.location, candidateCenter);

      if (distance < equipment.toleranceRadius && distance < minDistance) {
        minDistance = distance;
        bestMatch = candidate;
      }
    }

    // Record detection
    const detection: EquipmentDetection = {
      equipmentId: equipment.id,
      detected: bestMatch !== null,
      confidence: bestMatch?.confidence || 0,
      detectedBoundingBox: bestMatch?.boundingBox,
      distanceFromExpected: bestMatch ? minDistance : undefined,
      timestamp,
    };

    this.recordDetection(equipment.id, detection);

    // Check for obstruction (objects too close)
    const nearbyObjects = trackedObjects.filter(obj => {
      const distance = this.calculateDistance(
        equipment.location,
        this.getCenterPoint(obj.boundingBox)
      );
      return distance < this.obstructionRadius && distance > 0.1;
    });

    const isObstructed = nearbyObjects.length > 2;

    // Check if in use (person very close to equipment)
    const personNearby = trackedObjects.some(obj => {
      if (obj.label !== 'person') return false;
      const distance = this.calculateDistance(
        equipment.location,
        this.getCenterPoint(obj.boundingBox)
      );
      return distance < 0.5; // Within 0.5 meters
    });

    const isInUse = personNearby && bestMatch !== null;

    // Check inspection status
    const inspectionStatus = this.getInspectionStatus(equipment);
    const daysUntilInspection = this.getDaysUntilInspection(equipment);

    // Calculate status
    const recentDetections = this.getRecentDetections(equipment.id, 5);
    const isPresent = recentDetections.filter(d => d.detected).length >= 3; // Majority rule
    const isMisplaced = bestMatch !== null && minDistance > equipment.toleranceRadius * 0.5;

    const lastSeen = this.getLastSeenTime(equipment.id);
    const missingDuration = lastSeen
      ? (timestamp.getTime() - lastSeen.getTime()) / 1000
      : undefined;

    // Determine overall status
    let status: EquipmentStatus['status'] = 'ok';
    const issues: string[] = [];

    if (!isPresent) {
      if (missingDuration && missingDuration > this.missingAlertThreshold) {
        status = 'critical';
        issues.push(`Missing for ${Math.round(missingDuration / 60)} minutes`);
      } else {
        status = 'missing';
        issues.push('Not detected');
      }
    } else {
      if (inspectionStatus === 'overdue') {
        status = 'critical';
        issues.push('Inspection overdue');
      } else if (inspectionStatus === 'due_soon') {
        if (status === 'ok') status = 'warning';
        issues.push(`Inspection due in ${daysUntilInspection} days`);
      }

      if (isMisplaced) {
        if (status === 'ok') status = 'warning';
        issues.push(`Moved ${Math.round(minDistance * 100) / 100}m from expected location`);
      }

      if (isObstructed) {
        if (status === 'ok') status = 'warning';
        issues.push(`Access obstructed by ${nearbyObjects.length} objects`);
      }

      if (isInUse) {
        issues.push('Currently in use');
      }
    }

    // Create or update incidents
    this.updateIncidents(equipment, {
      isPresent,
      isMisplaced,
      isObstructed,
      isInUse,
      inspectionStatus,
    }, timestamp);

    return {
      equipmentId: equipment.id,
      type: equipment.type,
      location: equipment.location,
      isPresent,
      isMisplaced,
      isObstructed,
      isInUse,
      lastSeen,
      missingDuration,
      inspectionStatus,
      daysUntilInspection,
      status,
      issues,
    };
  }

  // ============================================================================
  // Detection History
  // ============================================================================

  /**
   * Record detection
   */
  private recordDetection(equipmentId: string, detection: EquipmentDetection): void {
    const history = this.detectionHistory.get(equipmentId) || [];
    history.push(detection);

    // Limit history size
    if (history.length > this.maxDetectionHistory) {
      history.shift();
    }

    this.detectionHistory.set(equipmentId, history);
  }

  /**
   * Get recent detections
   */
  private getRecentDetections(equipmentId: string, count: number): EquipmentDetection[] {
    const history = this.detectionHistory.get(equipmentId) || [];
    return history.slice(-count);
  }

  /**
   * Get last seen time
   */
  private getLastSeenTime(equipmentId: string): Date | undefined {
    const history = this.detectionHistory.get(equipmentId) || [];
    const detected = history.filter(d => d.detected).reverse();
    return detected.length > 0 ? detected[0].timestamp : undefined;
  }

  // ============================================================================
  // Inspection Management
  // ============================================================================

  /**
   * Get inspection status
   */
  private getInspectionStatus(equipment: SafetyEquipment): EquipmentStatus['inspectionStatus'] {
    if (!equipment.inspectionSchedule?.nextInspection) return 'unknown';

    const now = new Date();
    const nextInspection = equipment.inspectionSchedule.nextInspection;
    const daysUntil = (nextInspection.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    if (daysUntil < 0) return 'overdue';
    if (daysUntil <= this.inspectionWarningDays) return 'due_soon';
    return 'current';
  }

  /**
   * Get days until inspection
   */
  private getDaysUntilInspection(equipment: SafetyEquipment): number | undefined {
    if (!equipment.inspectionSchedule?.nextInspection) return undefined;

    const now = new Date();
    const nextInspection = equipment.inspectionSchedule.nextInspection;
    const daysUntil = (nextInspection.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    return Math.round(daysUntil);
  }

  /**
   * Record inspection
   */
  recordInspection(equipmentId: string, inspectionDate: Date = new Date()): void {
    const equipment = this.equipment.get(equipmentId);
    if (!equipment) throw new Error(`Equipment not found: ${equipmentId}`);

    if (!equipment.inspectionSchedule) {
      throw new Error(`No inspection schedule configured for equipment: ${equipmentId}`);
    }

    equipment.inspectionSchedule.lastInspection = inspectionDate;

    // Calculate next inspection date
    const frequency = equipment.inspectionSchedule.frequency;
    const nextDate = new Date(inspectionDate);

    switch (frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case 'annual':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
    }

    equipment.inspectionSchedule.nextInspection = nextDate;
    console.log(`✓ Inspection recorded for ${equipmentId}, next due: ${nextDate.toISOString()}`);
  }

  // ============================================================================
  // Incident Management
  // ============================================================================

  /**
   * Update incidents based on equipment status
   */
  private updateIncidents(
    equipment: SafetyEquipment,
    status: {
      isPresent: boolean;
      isMisplaced: boolean;
      isObstructed: boolean;
      isInUse: boolean;
      inspectionStatus: string;
    },
    timestamp: Date
  ): void {
    // Missing incident
    if (!status.isPresent) {
      this.createOrUpdateIncident({
        equipmentId: equipment.id,
        type: 'missing',
        severity: 'critical',
        description: `${equipment.type} is missing from expected location`,
        timestamp,
      });
    } else {
      this.resolveIncident(equipment.id, 'missing', timestamp);
    }

    // Moved incident
    if (status.isMisplaced) {
      this.createOrUpdateIncident({
        equipmentId: equipment.id,
        type: 'moved',
        severity: 'medium',
        description: `${equipment.type} has been moved from configured location`,
        timestamp,
      });
    } else {
      this.resolveIncident(equipment.id, 'moved', timestamp);
    }

    // In use incident (informational)
    if (status.isInUse) {
      this.createOrUpdateIncident({
        equipmentId: equipment.id,
        type: 'in_use',
        severity: 'low',
        description: `${equipment.type} is currently in use`,
        timestamp,
      });
    } else {
      this.resolveIncident(equipment.id, 'in_use', timestamp);
    }

    // Obstruction incident
    if (status.isObstructed) {
      this.createOrUpdateIncident({
        equipmentId: equipment.id,
        type: 'obstructed',
        severity: 'high',
        description: `Access to ${equipment.type} is obstructed`,
        timestamp,
      });
    } else {
      this.resolveIncident(equipment.id, 'obstructed', timestamp);
    }

    // Inspection overdue
    if (status.inspectionStatus === 'overdue') {
      this.createOrUpdateIncident({
        equipmentId: equipment.id,
        type: 'inspection_overdue',
        severity: 'high',
        description: `${equipment.type} inspection is overdue`,
        timestamp,
      });
    } else {
      this.resolveIncident(equipment.id, 'inspection_overdue', timestamp);
    }
  }

  /**
   * Create or update incident
   */
  private createOrUpdateIncident(params: {
    equipmentId: string;
    type: EquipmentIncident['type'];
    severity: EquipmentIncident['severity'];
    description: string;
    timestamp: Date;
  }): EquipmentIncident {
    const key = `${params.equipmentId}_${params.type}`;
    const existing = this.activeIncidents.get(key);

    if (existing && !existing.resolved) {
      // Update existing incident
      existing.lastDetected = params.timestamp;
      existing.duration = (params.timestamp.getTime() - existing.startedAt.getTime()) / 1000;
      return existing;
    }

    // Create new incident
    const incident: EquipmentIncident = {
      id: `incident_${randomUUID().substring(0, 8)}`,
      equipmentId: params.equipmentId,
      type: params.type,
      severity: params.severity,
      description: params.description,
      startedAt: params.timestamp,
      lastDetected: params.timestamp,
      duration: 0,
      resolved: false,
    };

    this.activeIncidents.set(key, incident);
    this.incidentHistory.push(incident);

    // Limit history
    if (this.incidentHistory.length > this.maxHistorySize) {
      this.incidentHistory.shift();
    }

    return incident;
  }

  /**
   * Resolve incident
   */
  private resolveIncident(
    equipmentId: string,
    type: EquipmentIncident['type'],
    timestamp: Date
  ): void {
    const key = `${equipmentId}_${type}`;
    const incident = this.activeIncidents.get(key);

    if (incident && !incident.resolved) {
      incident.resolved = true;
      incident.resolvedAt = timestamp;
      incident.duration = (timestamp.getTime() - incident.startedAt.getTime()) / 1000;
      this.activeIncidents.delete(key);
    }
  }

  /**
   * Get active incidents
   */
  getActiveIncidents(): EquipmentIncident[] {
    return Array.from(this.activeIncidents.values()).filter(i => !i.resolved);
  }

  /**
   * Get incidents for equipment
   */
  getEquipmentIncidents(equipmentId: string, includeResolved = false): EquipmentIncident[] {
    const source = includeResolved ? this.incidentHistory : this.getActiveIncidents();
    return source.filter(i => i.equipmentId === equipmentId);
  }

  // ============================================================================
  // Analytics
  // ============================================================================

  /**
   * Get equipment analytics
   */
  getAnalytics(): EquipmentAnalytics {
    const allEquipment = this.getAllEquipment();
    const statuses = this.checkAllEquipment();
    const activeIncidents = this.getActiveIncidents();

    const byType: Record<string, number> = {};
    for (const eq of allEquipment) {
      byType[eq.type] = (byType[eq.type] || 0) + 1;
    }

    const present = statuses.filter(s => s.isPresent).length;
    const missing = statuses.filter(s => !s.isPresent).length;
    const misplaced = statuses.filter(s => s.isMisplaced).length;
    const inUse = statuses.filter(s => s.isInUse).length;
    const obstructed = statuses.filter(s => s.isObstructed).length;
    const inspectionsDue = statuses.filter(s => s.inspectionStatus === 'due_soon').length;
    const inspectionsOverdue = statuses.filter(s => s.inspectionStatus === 'overdue').length;
    const criticalIncidents = activeIncidents.filter(i => i.severity === 'critical').length;

    return {
      totalEquipment: allEquipment.length,
      byType,
      present,
      missing,
      misplaced,
      inUse,
      obstructed,
      inspectionsDue,
      inspectionsOverdue,
      activeIncidents: activeIncidents.length,
      criticalIncidents,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Calculate distance between two points
   */
  private calculateDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  /**
   * Get center point of bounding box
   */
  private getCenterPoint(bbox: BoundingBox): { x: number; y: number } {
    return {
      x: bbox.x + bbox.width / 2,
      y: bbox.y + bbox.height / 2,
    };
  }

  // ============================================================================
  // Monitoring
  // ============================================================================

  /**
   * Start periodic equipment monitoring
   */
  private startEquipmentMonitoring(): void {
    setInterval(() => {
      const now = new Date();
      
      // Check all equipment
      this.checkAllEquipment(now);

      // Clean up old incidents
      this.cleanupOldIncidents();
    }, 5000); // Every 5 seconds
  }

  /**
   * Clean up old resolved incidents
   */
  private cleanupOldIncidents(): void {
    const maxAge = 3600000; // 1 hour
    const now = Date.now();

    this.incidentHistory = this.incidentHistory.filter(i => {
      if (!i.resolved) return true;
      if (!i.resolvedAt) return true;
      return (now - i.resolvedAt.getTime()) < maxAge;
    });
  }

  /**
   * Get health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    totalEquipment: number;
    missing: number;
    criticalIncidents: number;
  } {
    const analytics = this.getAnalytics();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (analytics.criticalIncidents > 0) status = 'unhealthy';
    else if (analytics.missing > 0 || analytics.inspectionsOverdue > 0) status = 'degraded';

    return {
      status,
      totalEquipment: analytics.totalEquipment,
      missing: analytics.missing,
      criticalIncidents: analytics.criticalIncidents,
    };
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    this.activeIncidents.clear();
    this.incidentHistory = [];
    this.detectionHistory.clear();
  }
}
