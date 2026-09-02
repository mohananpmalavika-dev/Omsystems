/**
 * Safety Analytics Module
 * Comprehensive PPE detection, fire/smoke monitoring, and workplace safety analytics
 * Integrated with Zone Engine, Object Tracking, and Event Correlation
 */

import { randomUUID } from "node:crypto";
import { BaseDetector, type DetectionFrame, type DetectionResult, calculateIoU } from "./base-detector.js";
import { getInferencePipeline } from "../inference/unified-inference-pipeline.js";
import { ZoneEngine } from "./safety/zone-engine.js";
import { MultiObjectTracker, type Detection } from "./safety/object-tracker.js";
import { ZoneComplianceDetector } from "./safety/zone-compliance-detector.js";
import { EmergencyExitMonitor } from "./safety/exit-monitor.js";
import { FireSafetyEquipmentMonitor } from "./safety/equipment-monitor.js";
import { SpillDetector } from "./safety/spill-detector.js";
import { ArcFlashDetector } from "./safety/arc-flash-detector.js";
import { EventCorrelationEngine, type SafetySignal } from "./safety/event-correlation-engine.js";

// ============================================================================
// Type Definitions
// ============================================================================

export type PPEType = 
  | 'helmet' | 'hardhat'
  | 'safety_vest' | 'high_vis_vest'
  | 'gloves' | 'safety_gloves'
  | 'safety_shoes' | 'steel_toe_boots'
  | 'goggles' | 'safety_glasses'
  | 'mask' | 'respirator' | 'face_mask'
  | 'ear_protection' | 'earmuffs';

export type HazardType =
  | 'fire' | 'smoke' | 'gas_leak'
  | 'spill' | 'chemical_spill'
  | 'arc_flash' | 'electrical_hazard'
  | 'fall_hazard' | 'height_work'
  | 'confined_space' | 'hot_work';

export interface PPEDetection {
  detectionId: string;
  personTrackId?: string;
  ppeType: PPEType;
  isWearing: boolean;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  timestamp: Date;
}

export interface PPECompliance {
  personTrackId: string;
  required: PPEType[];
  wearing: PPEType[];
  missing: PPEType[];
  isCompliant: boolean;
  complianceRate: number;  // 0-100
  violations: PPEViolation[];
  lastChecked: Date;
}

export interface PPEViolation {
  violationId: string;
  personTrackId: string;
  missingPPE: PPEType[];
  zone?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  duration: number;  // seconds
  resolved: boolean;
}

export interface HazardDetection {
  hazardId: string;
  hazardType: HazardType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  location: { x: number; y: number };
  isActive: boolean;
  firstDetected: Date;
  lastDetected: Date;
  duration: number;  // seconds
  spreading?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SafetyZone {
  zoneId: string;
  name: string;
  polygon: Array<{ x: number; y: number }>;
  requiredPPE: PPEType[];
  hazardLevel: 'low' | 'medium' | 'high';
  maxOccupancy?: number;
  restrictedAccess?: boolean;
  authorizedPersons?: string[];
}

export interface FireExtinguisherMonitor {
  equipmentId: string;
  location: { x: number; y: number };
  boundingBox: { x: number; y: number; width: number; height: number };
  isPresent: boolean;
  lastSeen: Date;
  missingDuration?: number;
  alertSent: boolean;
}

export interface ExitMonitor {
  exitId: string;
  location: string;
  polygon: Array<{ x: number; y: number }>;
  isBlocked: boolean;
  blockingSince?: Date;
  clearanceRequired: number;  // meters
}

// ============================================================================
// Safety Analytics Detector
// ============================================================================

export class SafetyAnalyticsDetector extends BaseDetector {
  // Legacy maps for backward compatibility
  private ppeDetections = new Map<string, PPEDetection[]>();
  private complianceRecords = new Map<string, PPECompliance>();
  private activeViolations = new Map<string, PPEViolation>();
  private activeHazards = new Map<string, HazardDetection>();
  private safetyZones = new Map<string, SafetyZone>();
  private fireExtinguishers = new Map<string, FireExtinguisherMonitor>();
  private exitMonitors = new Map<string, ExitMonitor>();
  
  // New integrated components
  private zoneEngine: ZoneEngine;
  private objectTracker: MultiObjectTracker;
  private zoneComplianceDetector: ZoneComplianceDetector;
  private exitMonitor: EmergencyExitMonitor;
  private equipmentMonitor: FireSafetyEquipmentMonitor;
  private spillDetector: SpillDetector;
  private arcFlashDetector: ArcFlashDetector;
  private correlationEngine: EventCorrelationEngine;
  
  private isModelLoaded = false;
  private ppeModel: any;  // Custom YOLOv8 for PPE detection
  private fireSmokeModel: any;  // Fire/Smoke detector
  private hazardModel: any;  // Hazard detection model
  
  // Configuration
  private readonly PPE_CONFIDENCE_THRESHOLD = 0.6;
  private readonly FIRE_CONFIDENCE_THRESHOLD = 0.7;
  private readonly VIOLATION_GRACE_PERIOD_MS = 10000;  // 10 seconds
  private readonly HAZARD_COOLDOWN_MS = 30000;  // 30 seconds
  
  // PPE Classes
  private readonly PPE_CLASSES: PPEType[] = [
    'helmet', 'hardhat',
    'safety_vest', 'high_vis_vest',
    'gloves', 'safety_gloves',
    'safety_shoes', 'steel_toe_boots',
    'goggles', 'safety_glasses',
    'mask', 'respirator', 'face_mask',
    'ear_protection', 'earmuffs',
  ];

  constructor() {
    super("safety-analytics", "4.0.0"); // Version bump for major upgrade
    
    // Initialize new components
    this.zoneEngine = new ZoneEngine();
    this.objectTracker = new MultiObjectTracker({
      maxAge: 30,
      minHits: 3,
      iouThreshold: 0.3,
    });
    this.zoneComplianceDetector = new ZoneComplianceDetector(
      this.zoneEngine,
      this.objectTracker
    );
    this.exitMonitor = new EmergencyExitMonitor(
      this.zoneEngine,
      this.objectTracker
    );
    this.equipmentMonitor = new FireSafetyEquipmentMonitor(
      this.objectTracker
    );
    this.spillDetector = new SpillDetector(
      this.objectTracker,
      this.zoneEngine
    );
    this.arcFlashDetector = new ArcFlashDetector(this.zoneEngine);
    this.correlationEngine = new EventCorrelationEngine();
  }

  async initialize(): Promise<void> {
    console.log("Initializing Safety Analytics detector...");
    
    try {
      // Load ONNX models for PPE detection and hazard detection
      try {
        const ort = await import('onnxruntime-node');
        const fs = await import('fs');
        
        // Load PPE detection model
        const ppeModelPath = process.env.PPE_MODEL_PATH || '/app/models/safety/ppe_detector.onnx';
        if (fs.existsSync(ppeModelPath)) {
          this.ppeModel = await ort.InferenceSession.create(ppeModelPath);
          console.log(`✓ Loaded PPE detection model from ${ppeModelPath}`);
        } else {
          console.warn(`⚠️ Model file not found: ${ppeModelPath}, using unified inference pipeline`);
        }
        
        // Load fire/smoke detection model
        const fireSmokeModelPath = process.env.FIRE_SMOKE_MODEL_PATH || '/app/models/safety/fire_smoke.onnx';
        if (fs.existsSync(fireSmokeModelPath)) {
          this.fireSmokeModel = await ort.InferenceSession.create(fireSmokeModelPath);
          console.log(`✓ Loaded Fire/Smoke detection model from ${fireSmokeModelPath}`);
        } else {
          console.warn(`⚠️ Model file not found: ${fireSmokeModelPath}`);
        }
        
        // Load hazard detection model
        const hazardModelPath = process.env.HAZARD_MODEL_PATH || '/app/models/safety/hazard_detector.onnx';
        if (fs.existsSync(hazardModelPath)) {
          this.hazardModel = await ort.InferenceSession.create(hazardModelPath);
          console.log(`✓ Loaded hazard detection model from ${hazardModelPath}`);
        } else {
          console.warn(`⚠️ Model file not found: ${hazardModelPath}`);
        }
      } catch (error) {
        console.warn('⚠️ Failed to load ONNX models, using unified inference pipeline:', error);
      }
      
      this.isModelLoaded = true;
      this.startViolationMonitoring();
      this.startHazardMonitoring();
      this.startEquipmentMonitoring();
      
      console.log("Safety Analytics detector initialized successfully");
      console.log("- PPE detection: Custom YOLOv8 (14 classes)");
      console.log("- Fire/Smoke detection: Custom detector");
      console.log("- Hazard detection: Multi-class detector");
      console.log(`- Safety zones configured: ${this.safetyZones.size}`);
    } catch (error) {
      console.error("Failed to initialize Safety Analytics:", error);
      throw error;
    }
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isModelLoaded) {
      return [];
    }

    const results: DetectionResult[] = [];

    // Step 0: Update object tracking with all detections
    const trackedObjects = await this.updateObjectTracking(frame);

    // Step 1: Detect PPE (helmet, vest, gloves, etc.)
    const ppeDetections = await this.detectPPE(frame);

    // Step 2: Match PPE with persons
    const complianceChecks = await this.checkPPECompliance(ppeDetections, frame);

    // Step 3: Detect fire and smoke
    const fireSmoke = await this.detectFireSmoke(frame);

    // Step 4: Detect other hazards (spills, arc flash)
    const hazards = await this.detectHazards(frame);

    // Step 5: Monitor fire safety equipment
    const equipmentStatus = this.monitorFireEquipment(frame);

    // Step 6: Check exit blockages
    const exitStatus = this.checkExitBlockages(frame);

    // Step 7: Check zone compliance
    const zoneViolations = this.checkZoneCompliance(frame);

    // Step 8: Process signals through correlation engine
    const correlatedEvents = this.processCorrelationSignals(frame, {
      fireSmoke,
      hazards,
      complianceChecks,
      equipmentStatus,
      exitStatus,
    });

    // Generate detection results
    if (ppeDetections.length > 0) {
      results.push(this.createPPEDetectionResult(ppeDetections));
    }

    if (complianceChecks.length > 0) {
      const violations = complianceChecks.filter(c => !c.isCompliant);
      if (violations.length > 0) {
        results.push(this.createComplianceViolationResult(violations));
      }
    }

    if (fireSmoke.length > 0) {
      results.push(...this.createFireSmokeResults(fireSmoke));
    }

    if (hazards.length > 0) {
      results.push(...this.createHazardResults(hazards));
    }

    if (equipmentStatus.missing.length > 0) {
      results.push(this.createEquipmentMissingResult(equipmentStatus.missing));
    }

    if (exitStatus.blocked.length > 0) {
      results.push(this.createExitBlockedResult(exitStatus.blocked));
    }

    if (zoneViolations.length > 0) {
      results.push(...zoneViolations);
    }

    // Add correlated events
    if (correlatedEvents.length > 0) {
      results.push(...this.createCorrelatedEventResults(correlatedEvents));
    }

    return results;
  }

  // ============================================================================
  // PPE Detection
  // ============================================================================

  private async detectPPE(frame: DetectionFrame): Promise<PPEDetection[]> {
    try {
      const pipeline = getInferencePipeline();
      const detections = await pipeline.detectObjects(frame, this.PPE_CLASSES.map(c => String(c)));
      if (!detections || detections.length === 0) return [];

      const ppeResults: PPEDetection[] = detections
        .filter(d => d.confidence >= this.PPE_CONFIDENCE_THRESHOLD)
        .map(d => ({
          detectionId: `ppe_${randomUUID().substring(0, 8)}`,
          personTrackId: undefined,
          ppeType: d.label as PPEType,
          isWearing: true,
          confidence: d.confidence,
          boundingBox: d.boundingBox,
          timestamp: frame.timestamp,
        }));

      return ppeResults;
    } catch (error) {
      console.warn('detectPPE pipeline failed:', error);
      return [];
    }
  }

  // ============================================================================
  // PPE Compliance Checking
  // ============================================================================

  private async checkPPECompliance(
    ppeDetections: PPEDetection[],
    frame: DetectionFrame
  ): Promise<PPECompliance[]> {
    const complianceChecks: PPECompliance[] = [];

    // Group PPE detections by person (spatial proximity)
    const personPPEMap = await this.groupPPEByPerson(ppeDetections, frame);

    for (const [personTrackId, detections] of personPPEMap.entries()) {
      // Determine required PPE based on zone
      const zone = this.findPersonZone(personTrackId, frame);
      const required = zone?.requiredPPE || [];

      // Check what PPE is being worn
      const wearing = detections.map(d => this.normalizePPEType(d.ppeType));
      const missing = required.filter(ppe => !wearing.includes(ppe));

      const isCompliant = missing.length === 0;
      const complianceRate = required.length > 0 
        ? ((required.length - missing.length) / required.length) * 100 
        : 100;

      // Create or update violations
      const violations: PPEViolation[] = [];
      if (!isCompliant) {
        const violation = this.createOrUpdateViolation(personTrackId, missing, zone?.zoneId, frame.timestamp);
        violations.push(violation);
      } else {
        // Resolve any active violations for this person
        this.resolveViolation(personTrackId);
      }

      const compliance: PPECompliance = {
        personTrackId,
        required,
        wearing,
        missing,
        isCompliant,
        complianceRate,
        violations,
        lastChecked: frame.timestamp,
      };

      complianceChecks.push(compliance);
      this.complianceRecords.set(personTrackId, compliance);
    }

    return complianceChecks;
  }

  private async groupPPEByPerson(detections: PPEDetection[], frame: DetectionFrame): Promise<Map<string, PPEDetection[]>> {
    const grouped = new Map<string, PPEDetection[]>();
    if (!detections || detections.length === 0) return grouped;

    try {
      const { getInferenceObjects, hasInferenceObjects } = await import("./base-detector.js");
      const pipeline = getInferencePipeline();
      let persons: any[] | null = null;
      try {
        persons = await pipeline.detectObjects(frame, ['person']);
      } catch (err) {
        if (hasInferenceObjects(frame)) {
          persons = getInferenceObjects(frame, ['person']);
        }
      }
      if (!persons || persons.length === 0) {
        grouped.set('person_unknown', detections);
        return grouped;
      }


      // For each PPE detection, find the person with highest IoU
      for (const ppe of detections) {
        let bestPersonId = 'person_unknown';
        let bestIoU = 0;

        for (const person of persons) {
          const iou = this.calculateIoU(ppe.boundingBox, person.boundingBox);
          if (iou > bestIoU) {
            bestIoU = iou;
            bestPersonId = (person as any).trackId ?? `person_${randomUUID().substring(0,8)}`;
          }
        }

        if (!grouped.has(bestPersonId)) grouped.set(bestPersonId, []);
        grouped.get(bestPersonId)!.push(ppe);
      }

      return grouped;
    } catch (error) {
      console.warn('groupPPEByPerson failed:', error);
      grouped.set('person_unknown', detections);
      return grouped;
    }
  }

  private normalizePPEType(ppeType: PPEType): PPEType {
    // Normalize similar PPE types
    if (ppeType === 'hardhat') return 'helmet';
    if (ppeType === 'high_vis_vest') return 'safety_vest';
    if (ppeType === 'safety_gloves') return 'gloves';
    if (ppeType === 'steel_toe_boots') return 'safety_shoes';
    if (ppeType === 'safety_glasses') return 'goggles';
    if (ppeType === 'respirator' || ppeType === 'face_mask') return 'mask';
    if (ppeType === 'earmuffs') return 'ear_protection';
    return ppeType;
  }

  private findPersonZone(personTrackId: string, frame: DetectionFrame): SafetyZone | undefined {
    // Use integrated zone engine to find person's zone
    const trackedPerson = this.zoneEngine.getTrackedPerson(personTrackId);
    if (!trackedPerson?.zone) return undefined;
    
    // Map zone-engine's SafetyZone (with 'id') to safety-analytics SafetyZone (with 'zoneId')
    const zone = trackedPerson.zone;
    return {
      zoneId: zone.id,
      name: zone.name,
      polygon: zone.polygon,
      requiredPPE: zone.requiredPPE as PPEType[],
      hazardLevel: zone.hazardLevel as 'low' | 'medium' | 'high',
      maxOccupancy: zone.maxOccupancy,
      restrictedAccess: zone.restrictedAccess,
      authorizedPersons: zone.authorizedPersons,
    };
  }

  private createOrUpdateViolation(
    personTrackId: string,
    missingPPE: PPEType[],
    zoneId: string | undefined,
    timestamp: Date
  ): PPEViolation {
    const existingViolation = this.activeViolations.get(personTrackId);

    if (existingViolation && !existingViolation.resolved) {
      // Update existing violation
      existingViolation.duration = (timestamp.getTime() - existingViolation.timestamp.getTime()) / 1000;
      return existingViolation;
    }

    // Create new violation
    const violation: PPEViolation = {
      violationId: `violation_${randomUUID().substring(0, 8)}`,
      personTrackId,
      missingPPE,
      zone: zoneId,
      severity: this.calculateViolationSeverity(missingPPE),
      timestamp,
      duration: 0,
      resolved: false,
    };

    this.activeViolations.set(personTrackId, violation);
    return violation;
  }

  private resolveViolation(personTrackId: string): void {
    const violation = this.activeViolations.get(personTrackId);
    if (violation) {
      violation.resolved = true;
      this.activeViolations.delete(personTrackId);
    }
  }

  private calculateViolationSeverity(missingPPE: PPEType[]): PPEViolation['severity'] {
    // Critical PPE
    const criticalPPE: PPEType[] = ['helmet', 'hardhat', 'respirator'];
    const hasCriticalViolation = missingPPE.some(ppe => criticalPPE.includes(ppe));
    
    if (hasCriticalViolation) return 'critical';
    if (missingPPE.length >= 3) return 'high';
    if (missingPPE.length >= 2) return 'medium';
    return 'low';
  }

  // ============================================================================
  // Fire & Smoke Detection
  // ============================================================================

  private async detectFireSmoke(frame: DetectionFrame): Promise<HazardDetection[]> {
    try {
      const pipeline = getInferencePipeline();
      const detections = await pipeline.detectFireSmoke(frame);
      if (!detections || detections.length === 0) return [];

      return detections
        .filter(d => d.confidence >= this.FIRE_CONFIDENCE_THRESHOLD)
        .map(d => this.createHazardDetection(d as any, frame.timestamp));
    } catch (error) {
      console.warn('detectFireSmoke pipeline failed:', error);
      return [];
    }
  }

  private createHazardDetection(detection: any, timestamp: Date): HazardDetection {
    const hazardId = `hazard_${randomUUID().substring(0, 8)}`;
    const existingHazard = Array.from(this.activeHazards.values())
      .find(h => this.isNearby(h.location, detection.location));

    if (existingHazard) {
      // Update existing hazard
      existingHazard.lastDetected = timestamp;
      existingHazard.duration = (timestamp.getTime() - existingHazard.firstDetected.getTime()) / 1000;
      existingHazard.confidence = (existingHazard.confidence * 0.7) + (detection.confidence * 0.3);
      return existingHazard;
    }

    // Create new hazard
    const hazard: HazardDetection = {
      hazardId,
      hazardType: detection.class as HazardType,
      severity: this.calculateHazardSeverity(detection),
      confidence: detection.confidence,
      boundingBox: detection.boundingBox,
      location: {
        x: detection.boundingBox.x + detection.boundingBox.width / 2,
        y: detection.boundingBox.y + detection.boundingBox.height / 2,
      },
      isActive: true,
      firstDetected: timestamp,
      lastDetected: timestamp,
      duration: 0,
      spreading: false,
    };

    this.activeHazards.set(hazardId, hazard);
    return hazard;
  }

  private calculateHazardSeverity(detection: any): HazardDetection['severity'] {
    const { class: hazardType, boundingBox } = detection;
    const area = boundingBox.width * boundingBox.height;

    if (hazardType === 'fire') {
      if (area > 0.2) return 'critical';
      if (area > 0.1) return 'high';
      return 'medium';
    }

    if (hazardType === 'smoke') {
      if (area > 0.3) return 'high';
      if (area > 0.15) return 'medium';
      return 'low';
    }

    return 'medium';
  }

  private isNearby(loc1: { x: number; y: number }, loc2: { x: number; y: number }): boolean {
    const distance = Math.sqrt(
      Math.pow(loc2.x - loc1.x, 2) + Math.pow(loc2.y - loc1.y, 2)
    );
    return distance < 0.1;  // 10% of frame
  }

  // ============================================================================
  // Other Hazard Detection
  // ============================================================================

  private async detectHazards(frame: DetectionFrame): Promise<HazardDetection[]> {
    const hazards: HazardDetection[] = [];

    // TODO: Implement spill detection
    const spills = await this.detectSpills(frame);
    hazards.push(...spills);

    // TODO: Implement arc flash detection
    const arcFlash = await this.detectArcFlash(frame);
    hazards.push(...arcFlash);

    return hazards;
  }

  private async detectSpills(frame: DetectionFrame): Promise<HazardDetection[]> {
    // Use integrated spill detector
    try {
      const spills = await this.spillDetector.detectSpills({
        data: new Uint8Array(frame.imageData),
        width: frame.width,
        height: frame.height,
        timestamp: frame.timestamp,
      });

      return spills.map(spill => ({
        hazardId: spill.id,
        hazardType: spill.type as HazardType,
        severity: spill.severity,
        confidence: spill.confidence,
        boundingBox: spill.boundingBox,
        location: spill.location,
        isActive: true,
        firstDetected: spill.firstDetected,
        lastDetected: spill.lastDetected,
        duration: spill.duration,
        spreading: spill.isGrowing,
        metadata: {
          area: spill.area,
          slipRisk: spill.slipRisk,
          peopleNearby: spill.peopleNearby,
        },
      }));
    } catch (error) {
      console.warn('Spill detection failed:', error);
      return [];
    }
  }

  private async detectArcFlash(frame: DetectionFrame): Promise<HazardDetection[]> {
    // Use integrated arc flash detector
    try {
      const events = this.arcFlashDetector.detectArcFlash({
        data: new Uint8Array(frame.imageData),
        width: frame.width,
        height: frame.height,
        timestamp: frame.timestamp,
      });

      return events.map(event => ({
        hazardId: event.id,
        hazardType: 'arc_flash' as HazardType,
        severity: event.severity,
        confidence: event.confidence,
        boundingBox: event.boundingBox,
        location: event.location,
        isActive: true,
        firstDetected: event.firstDetected,
        lastDetected: event.lastDetected,
        duration: event.duration,
        metadata: {
          brightness: event.brightness,
          blueWhiteRatio: event.blueWhiteRatio,
          isElectricalZone: event.isElectricalZone,
          peopleNearby: event.peopleNearby,
        },
      }));
    } catch (error) {
      console.warn('Arc flash detection failed:', error);
      return [];
    }
  }

  // ============================================================================
  // Fire Safety Equipment Monitoring
  // ============================================================================

  private monitorFireEquipment(frame: DetectionFrame): {
    present: FireExtinguisherMonitor[];
    missing: FireExtinguisherMonitor[];
  } {
    // Use integrated equipment monitor
    try {
      const statuses = this.equipmentMonitor.checkAllEquipment(frame.timestamp);
      const present: FireExtinguisherMonitor[] = [];
      const missing: FireExtinguisherMonitor[] = [];

      for (const status of statuses) {
        const monitor: FireExtinguisherMonitor = {
          equipmentId: status.equipmentId,
          location: status.location,
          boundingBox: { x: 0, y: 0, width: 0, height: 0 },
          isPresent: status.isPresent,
          lastSeen: status.lastSeen || frame.timestamp,
          missingDuration: status.missingDuration,
          alertSent: status.status === 'missing' || status.status === 'critical',
        };

        if (status.isPresent) {
          present.push(monitor);
        } else if (status.missingDuration && status.missingDuration > 300) {
          missing.push(monitor);
        }
      }

      return { present, missing };
    } catch (error) {
      console.warn('Equipment monitoring failed:', error);
      return { present: [], missing: [] };
    }
  }

  // ============================================================================
  // Exit Blockage Detection
  // ============================================================================

  private checkExitBlockages(frame: DetectionFrame): {
    clear: ExitMonitor[];
    blocked: ExitMonitor[];
  } {
    // Use integrated exit monitor
    try {
      const statuses = this.exitMonitor.checkAllExits(frame.timestamp);
      const clear: ExitMonitor[] = [];
      const blocked: ExitMonitor[] = [];

      for (const status of statuses) {
        const monitor: ExitMonitor = {
          exitId: status.exitId,
          location: status.exitName,
          polygon: [],
          isBlocked: status.isBlocked,
          blockingSince: undefined,
          clearanceRequired: 1.5,
        };

        if (status.isBlocked) {
          blocked.push(monitor);
        } else {
          clear.push(monitor);
        }
      }

      return { clear, blocked };
    } catch (error) {
      console.warn('Exit monitoring failed:', error);
      return { clear: [], blocked: [] };
    }
  }

  // ============================================================================
  // Zone Compliance
  // ============================================================================

  private checkZoneCompliance(frame: DetectionFrame): DetectionResult[] {
    // Use integrated zone compliance detector
    try {
      const violations = this.zoneComplianceDetector.checkCompliance(frame.timestamp);
      const results: DetectionResult[] = [];

      if (violations.length > 0) {
        results.push({
          detectionType: "zone-compliance-violation",
          confidence: 0.90,
          objects: violations.map(v => ({
            label: v.type,
            confidence: 0.90,
            trackId: v.personId || v.id,
            boundingBox: { x: 0, y: 0, width: 0, height: 0 },
          })),
          metadata: {
            violations: violations.map(v => ({
              id: v.id,
              type: v.type,
              severity: v.severity,
              zone: v.zoneName,
              description: v.description,
              duration: v.duration,
            })),
          },
          requiresAlert: violations.some(v => v.severity === 'critical' || v.severity === 'high'),
        });
      }

      return results;
    } catch (error) {
      console.warn('Zone compliance check failed:', error);
      return [];
    }
  }

  // ============================================================================
  // Configuration Methods
  // ============================================================================

  /**
   * Configure a safety zone with required PPE
   */
  configureSafetyZone(config: {
    zoneId: string;
    name: string;
    polygon: Array<{ x: number; y: number }>;
    requiredPPE: PPEType[];
    hazardLevel?: 'low' | 'medium' | 'high';
    maxOccupancy?: number;
    restrictedAccess?: boolean;
    authorizedPersons?: string[];
  }): void {
    const zone: SafetyZone = {
      zoneId: config.zoneId,
      name: config.name,
      polygon: config.polygon,
      requiredPPE: config.requiredPPE,
      hazardLevel: config.hazardLevel || 'medium',
      maxOccupancy: config.maxOccupancy,
      restrictedAccess: config.restrictedAccess,
      authorizedPersons: config.authorizedPersons,
    };

    this.safetyZones.set(config.zoneId, zone);
    console.log(`Configured safety zone: ${config.name} (${config.zoneId})`);
    console.log(`  Required PPE: ${config.requiredPPE.join(', ')}`);
  }

  /**
   * Register fire safety equipment location
   */
  registerFireExtinguisher(config: {
    equipmentId: string;
    location: { x: number; y: number };
    boundingBox: { x: number; y: number; width: number; height: number };
  }): void {
    const monitor: FireExtinguisherMonitor = {
      equipmentId: config.equipmentId,
      location: config.location,
      boundingBox: config.boundingBox,
      isPresent: true,
      lastSeen: new Date(),
      alertSent: false,
    };

    this.fireExtinguishers.set(config.equipmentId, monitor);
    console.log(`Registered fire extinguisher: ${config.equipmentId}`);
  }

  /**
   * Configure exit monitoring
   */
  configureExitMonitor(config: {
    exitId: string;
    location: string;
    polygon: Array<{ x: number; y: number }>;
    clearanceRequired?: number;
  }): void {
    const monitor: ExitMonitor = {
      exitId: config.exitId,
      location: config.location,
      polygon: config.polygon,
      isBlocked: false,
      clearanceRequired: config.clearanceRequired || 1.5,
    };

    this.exitMonitors.set(config.exitId, monitor);
    console.log(`Configured exit monitor: ${config.location} (${config.exitId})`);
  }

  // ============================================================================
  // Result Formatting
  // ============================================================================

  private createPPEDetectionResult(detections: PPEDetection[]): DetectionResult {
    const byType: Record<string, number> = {};
    for (const detection of detections) {
      byType[detection.ppeType] = (byType[detection.ppeType] || 0) + 1;
    }

    return {
      detectionType: "ppe-detected",
      confidence: detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length,
      objects: detections.map(d => ({
        label: d.ppeType,
        confidence: d.confidence,
        trackId: d.detectionId,
        boundingBox: d.boundingBox,
      })),
      metadata: {
        totalDetections: detections.length,
        byType,
      },
      requiresAlert: false,
    };
  }

  private createComplianceViolationResult(violations: PPECompliance[]): DetectionResult {
    return {
      detectionType: "ppe-violation",
      confidence: 0.90,
      objects: violations.map(v => ({
        label: `Missing: ${v.missing.join(', ')}`,
        confidence: (100 - v.complianceRate) / 100,
        trackId: v.personTrackId,
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      })),
      metadata: {
        violations: violations.map(v => ({
          personTrackId: v.personTrackId,
          required: v.required,
          wearing: v.wearing,
          missing: v.missing,
          complianceRate: Math.round(v.complianceRate),
          violations: v.violations,
        })),
      },
      requiresAlert: true,
    };
  }

  private createFireSmokeResults(hazards: HazardDetection[]): DetectionResult[] {
    return hazards
      .filter(h => h.hazardType === 'fire' || h.hazardType === 'smoke')
      .map(hazard => ({
        detectionType: hazard.hazardType === 'fire' ? 'fire' : 'smoke',
        confidence: hazard.confidence,
        objects: [{
          label: hazard.hazardType,
          confidence: hazard.confidence,
          trackId: hazard.hazardId,
          boundingBox: hazard.boundingBox,
        }],
        metadata: {
          hazardId: hazard.hazardId,
          severity: hazard.severity,
          duration: hazard.duration,
          spreading: hazard.spreading,
          firstDetected: hazard.firstDetected.toISOString(),
        },
        requiresAlert: true,
      }));
  }

  private createHazardResults(hazards: HazardDetection[]): DetectionResult[] {
    return hazards.map(hazard => ({
      detectionType: `hazard-${hazard.hazardType}`,
      confidence: hazard.confidence,
      objects: [{
        label: hazard.hazardType,
        confidence: hazard.confidence,
        trackId: hazard.hazardId,
        boundingBox: hazard.boundingBox,
      }],
      metadata: {
        hazardId: hazard.hazardId,
        hazardType: hazard.hazardType,
        severity: hazard.severity,
        duration: hazard.duration,
      },
      requiresAlert: hazard.severity === 'critical' || hazard.severity === 'high',
    }));
  }

  private createEquipmentMissingResult(missing: FireExtinguisherMonitor[]): DetectionResult {
    return {
      detectionType: "fire-extinguisher-missing",
      confidence: 0.95,
      objects: missing.map(m => ({
        label: "fire_extinguisher_missing",
        confidence: 0.95,
        trackId: m.equipmentId,
        boundingBox: m.boundingBox,
      })),
      metadata: {
        missing: missing.map(m => ({
          equipmentId: m.equipmentId,
          location: m.location,
          missingDuration: m.missingDuration,
          lastSeen: m.lastSeen.toISOString(),
        })),
      },
      requiresAlert: true,
    };
  }

  private createExitBlockedResult(blocked: ExitMonitor[]): DetectionResult {
    return {
      detectionType: "exit-blocked",
      confidence: 0.92,
      objects: [],
      metadata: {
        blocked: blocked.map(exit => ({
          exitId: exit.exitId,
          location: exit.location,
          blockingSince: exit.blockingSince?.toISOString(),
          duration: exit.blockingSince
            ? (Date.now() - exit.blockingSince.getTime()) / 1000
            : 0,
        })),
      },
      requiresAlert: true,
    };
  }

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * Get current compliance statistics
   */
  getComplianceStats(): {
    totalChecks: number;
    compliant: number;
    violations: number;
    complianceRate: number;
    bySeverity: Record<string, number>;
  } {
    const totalChecks = this.complianceRecords.size;
    const compliant = Array.from(this.complianceRecords.values())
      .filter(c => c.isCompliant).length;
    const violations = totalChecks - compliant;
    const complianceRate = totalChecks > 0 ? (compliant / totalChecks) * 100 : 100;

    const bySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const violation of this.activeViolations.values()) {
      bySeverity[violation.severity]++;
    }

    return {
      totalChecks,
      compliant,
      violations,
      complianceRate: Math.round(complianceRate * 10) / 10,
      bySeverity,
    };
  }

  /**
   * Get active violations
   */
  getActiveViolations(): PPEViolation[] {
    return Array.from(this.activeViolations.values()).filter(v => !v.resolved);
  }

  /**
   * Get active hazards
   */
  getActiveHazards(): HazardDetection[] {
    return Array.from(this.activeHazards.values()).filter(h => h.isActive);
  }

  /**
   * Get safety zone configuration
   */
  getSafetyZone(zoneId: string): SafetyZone | undefined {
    return this.safetyZones.get(zoneId);
  }

  /**
   * Get all safety zones
   */
  getAllSafetyZones(): SafetyZone[] {
    return Array.from(this.safetyZones.values());
  }

  /**
   * Get compliance for specific person
   */
  getPersonCompliance(personTrackId: string): PPECompliance | undefined {
    return this.complianceRecords.get(personTrackId);
  }

  /**
   * Get fire equipment status
   */
  getFireEquipmentStatus(): {
    total: number;
    present: number;
    missing: number;
    equipment: FireExtinguisherMonitor[];
  } {
    const equipment = Array.from(this.fireExtinguishers.values());
    const total = equipment.length;
    const present = equipment.filter(e => e.isPresent).length;
    const missing = total - present;

    return { total, present, missing, equipment };
  }

  /**
   * Get exit status
   */
  getExitStatus(): {
    total: number;
    clear: number;
    blocked: number;
    exits: ExitMonitor[];
  } {
    const exits = Array.from(this.exitMonitors.values());
    const total = exits.length;
    const blocked = exits.filter(e => e.isBlocked).length;
    const clear = total - blocked;

    return { total, clear, blocked, exits };
  }

  /**
   * Generate safety report
   */
  generateSafetyReport(timeRange: { start: Date; end: Date }): any {
    const compliance = this.getComplianceStats();
    const hazards = this.getActiveHazards();

    const hazardsByType: Record<string, number> = {};
    const hazardsBySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const hazard of hazards) {
      hazardsByType[hazard.hazardType] = (hazardsByType[hazard.hazardType] || 0) + 1;
      hazardsBySeverity[hazard.severity]++;
    }

    return {
      period: {
        start: timeRange.start.toISOString(),
        end: timeRange.end.toISOString(),
      },
      compliance,
      hazards: {
        total: hazards.length,
        byType: hazardsByType,
        bySeverity: hazardsBySeverity,
      },
      equipment: this.getFireEquipmentStatus(),
      exits: this.getExitStatus(),
    };
  }

  // ============================================================================
  // Object Tracking Integration
  // ============================================================================

  /**
   * Update object tracking with frame detections
   */
  private async updateObjectTracking(frame: DetectionFrame): Promise<any[]> {
    try {
      const pipeline = getInferencePipeline();
      const detections = await pipeline.detectObjects(frame, ['person', 'vehicle', 'box', 'chair', 'table']);
      
      // Convert to tracker format
      const trackerDetections: Detection[] = detections.map(d => ({
        label: d.label,
        confidence: d.confidence,
        boundingBox: d.boundingBox,
      }));

      // Update tracker
      const trackedObjects = this.objectTracker.update(trackerDetections, frame.timestamp);

      // Update zone engine with tracked persons
      for (const obj of trackedObjects) {
        if (obj.label === 'person') {
          this.zoneEngine.updatePersonPosition(
            obj.trackId,
            obj.position,
            obj.boundingBox
          );
        }
      }

      return trackedObjects;
    } catch (error) {
      console.warn('Object tracking update failed:', error);
      return [];
    }
  }

  /**
   * Process signals through correlation engine
   */
  private processCorrelationSignals(
    frame: DetectionFrame,
    detections: {
      fireSmoke: HazardDetection[];
      hazards: HazardDetection[];
      complianceChecks: PPECompliance[];
      equipmentStatus: { present: any[]; missing: any[] };
      exitStatus: { clear: any[]; blocked: any[] };
    }
  ): any[] {
    try {
      const signals: Omit<SafetySignal, 'id'>[] = [];

      // Fire and smoke signals
      for (const hazard of detections.fireSmoke) {
        signals.push({
          type: hazard.hazardType === 'fire' ? 'fire' : 'smoke',
          confidence: hazard.confidence,
          location: hazard.location,
          timestamp: frame.timestamp,
          metadata: { hazardId: hazard.hazardId },
        });
      }

      // Spill and arc flash signals
      for (const hazard of detections.hazards) {
        if (hazard.hazardType === 'spill' || hazard.hazardType === 'chemical_spill') {
          signals.push({
            type: 'spill',
            confidence: hazard.confidence,
            location: hazard.location,
            timestamp: frame.timestamp,
            metadata: { hazardId: hazard.hazardId },
          });
        } else if (hazard.hazardType === 'arc_flash') {
          signals.push({
            type: 'arc_flash',
            confidence: hazard.confidence,
            location: hazard.location,
            timestamp: frame.timestamp,
            metadata: { hazardId: hazard.hazardId },
          });
        }
      }

      // Compliance violation signals
      for (const check of detections.complianceChecks) {
        if (!check.isCompliant) {
          signals.push({
            type: 'missing_ppe',
            confidence: (100 - check.complianceRate) / 100,
            location: { x: 0.5, y: 0.5 }, // Placeholder
            timestamp: frame.timestamp,
            metadata: {
              personId: check.personTrackId,
              missingPPE: check.missing,
            },
          });
        }
      }

      // Equipment missing signals
      if (detections.equipmentStatus.missing.length > 0) {
        for (const equipment of detections.equipmentStatus.missing) {
          signals.push({
            type: 'equipment_missing',
            confidence: 0.95,
            location: equipment.location,
            timestamp: frame.timestamp,
            metadata: { equipmentId: equipment.equipmentId },
          });
        }
      }

      // Exit blocked signals
      if (detections.exitStatus.blocked.length > 0) {
        for (const exit of detections.exitStatus.blocked) {
          signals.push({
            type: 'exit_blocked',
            confidence: 0.92,
            location: { x: 0.5, y: 0.5 }, // Placeholder
            timestamp: frame.timestamp,
            metadata: { exitId: exit.exitId },
          });
        }
      }

      // Process all signals
      return this.correlationEngine.processSignals(signals);
    } catch (error) {
      console.warn('Signal correlation failed:', error);
      return [];
    }
  }

  /**
   * Create detection results for correlated events
   */
  private createCorrelatedEventResults(events: any[]): DetectionResult[] {
    return events.map(event => ({
      detectionType: `correlated-${event.type}`,
      confidence: event.confidence,
      objects: event.signals.map((s: any) => ({
        label: s.type,
        confidence: s.confidence,
        trackId: s.id,
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      })),
      metadata: {
        correlationId: event.id,
        ruleName: event.ruleName,
        severity: event.severity,
        signalCount: event.signals.length,
        description: event.description,
        peopleAffected: event.peopleAffected,
        requiresImmediateAction: event.requiresImmediateAction,
      },
      requiresAlert: event.requiresImmediateAction,
    }));
  }

  // ============================================================================
  // Public API Extensions
  // ============================================================================

  /**
   * Get zone engine instance
   */
  getZoneEngine(): ZoneEngine {
    return this.zoneEngine;
  }

  /**
   * Get object tracker instance
   */
  getObjectTracker(): MultiObjectTracker {
    return this.objectTracker;
  }

  /**
   * Get correlation engine instance
   */
  getCorrelationEngine(): EventCorrelationEngine {
    return this.correlationEngine;
  }

  /**
   * Get comprehensive safety dashboard data
   */
  getSafetyDashboard(): {
    zones: any;
    tracking: any;
    compliance: any;
    exits: any;
    equipment: any;
    spills: any;
    arcFlash: any;
    correlation: any;
  } {
    return {
      zones: this.zoneEngine.getZoneStatistics(),
      tracking: this.objectTracker.getStatistics(),
      compliance: this.zoneComplianceDetector.getStatistics(),
      exits: this.exitMonitor.getSummaryStatistics(),
      equipment: this.equipmentMonitor.getAnalytics(),
      spills: this.spillDetector.getAnalytics(),
      arcFlash: this.arcFlashDetector.getAnalytics(),
      correlation: this.correlationEngine.getStatistics(),
    };
  }

  // ============================================================================
  // Cleanup & Maintenance
  // ============================================================================

  private startViolationMonitoring(): void {
    setInterval(() => {
      const now = Date.now();

      // Update violation durations
      for (const violation of this.activeViolations.values()) {
        if (!violation.resolved) {
          violation.duration = (now - violation.timestamp.getTime()) / 1000;
        }
      }

      // Clean up old resolved violations
      const toRemove: string[] = [];
      for (const [personId, violation] of this.activeViolations.entries()) {
        if (violation.resolved) {
          const timeSinceResolved = now - violation.timestamp.getTime() - (violation.duration * 1000);
          if (timeSinceResolved > 60000) {  // 1 minute after resolution
            toRemove.push(personId);
          }
        }
      }

      for (const personId of toRemove) {
        this.activeViolations.delete(personId);
      }
    }, 5000);  // Every 5 seconds
  }

  private startHazardMonitoring(): void {
    setInterval(() => {
      const now = Date.now();

      // Update hazard durations
      for (const hazard of this.activeHazards.values()) {
        hazard.duration = (now - hazard.firstDetected.getTime()) / 1000;

        // Deactivate stale hazards (not detected in last 30 seconds)
        const timeSinceLastSeen = now - hazard.lastDetected.getTime();
        if (timeSinceLastSeen > this.HAZARD_COOLDOWN_MS) {
          hazard.isActive = false;
        }
      }

      // Clean up inactive hazards
      const toRemove: string[] = [];
      for (const [hazardId, hazard] of this.activeHazards.entries()) {
        if (!hazard.isActive) {
          const timeSinceInactive = now - hazard.lastDetected.getTime();
          if (timeSinceInactive > 300000) {  // 5 minutes
            toRemove.push(hazardId);
          }
        }
      }

      for (const hazardId of toRemove) {
        this.activeHazards.delete(hazardId);
      }
    }, 10000);  // Every 10 seconds
  }

  private startEquipmentMonitoring(): void {
    setInterval(() => {
      // Update missing durations
      const now = Date.now();
      for (const monitor of this.fireExtinguishers.values()) {
        if (!monitor.isPresent && monitor.lastSeen) {
          monitor.missingDuration = (now - monitor.lastSeen.getTime()) / 1000;
        }
      }

      // Update exit blocking durations
      for (const monitor of this.exitMonitors.values()) {
        if (monitor.isBlocked && monitor.blockingSince) {
          // Duration tracked in result formatting
        }
      }
    }, 15000);  // Every 15 seconds
  }

  async cleanup(): Promise<void> {
    this.ppeDetections.clear();
    this.complianceRecords.clear();
    this.activeViolations.clear();
    this.activeHazards.clear();
    console.log("Safety Analytics detector cleaned up");
  }

  getHealth() {
    return {
      status: 'healthy' as const,
      details: 'Safety analytics detector is available'
    };
  }
}
