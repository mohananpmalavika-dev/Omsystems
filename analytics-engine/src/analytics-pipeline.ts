/**
 * Enhanced Analytics Pipeline
 * Orchestrates all AI detection capabilities
 */

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { z } from "zod";
import type { detectionSchema } from "./app.js";
import { BaseDetector, hasInferenceObjects, type DetectionFrame, type DetectedObject, type InferenceObject } from "./detectors/base-detector.js";

export interface SnapshotRecord {
  buffer: Buffer;
  createdAt: number;
  cameraId: string;
}
export const snapshotCache = new Map<string, SnapshotRecord>();
import { CameraHealthDetector } from "./detectors/camera-health-detector.js";
import { CameraTamperDetector } from "./detectors/camera-tamper-detector.js";
import { MotionDetector } from "./detectors/motion-detector.js";
import { ObjectDetector } from "./detectors/object-detector.js";
import { ZoneDetector } from "./detectors/zone-detector.js";
import { PersonDetector } from "./detectors/person-detector.js";
import { VehicleDetector } from "./detectors/vehicle-detector.js";
import { HelmetDetector } from "./detectors/helmet-detector.js";
import { PPEDetector } from "./detectors/ppe-detector.js";
import { FallDetector } from "./detectors/fall-detector.js";
import { SmokeFireDetector } from "./detectors/smoke-fire-detector.js";
import { CrowdDensityDetector } from "./detectors/crowd-density-detector.js";
import { TailgatingDetector } from "./detectors/tailgating-detector.js";
import { UnattendedObjectsDetector } from "./detectors/unattended-objects-detector.js";
import { QueueDetector } from "./detectors/queue-detector.js";
import { HeatMapGenerator } from "./detectors/heatmap-generator.js";
import { FaceAnalyticsDetector } from "./detectors/face-analytics.js";
import { FaceDetector } from "./detectors/face-detector.js";
import { ANPRDetector } from "./detectors/anpr-detector.js";
import { HumanAnalyticsDetector } from "./detectors/human-analytics.js";
import { VehicleAnalyticsDetector } from "./detectors/vehicle-analytics.js";
import { SafetyAnalyticsDetector } from "./detectors/safety-analytics.js";
import { BankingAnalyticsDetector } from "./detectors/banking-analytics.js";
import { RetailAnalytics } from "./detectors/retail-analytics.js";
import { IndustrialAnalytics } from "./detectors/industrial-analytics.js";
import { SmartCityAnalytics } from "./detectors/smart-city-analytics.js";
import { AISearchEngine } from "./detectors/ai-search-engine.js";
import { AIInvestigationTools } from "./detectors/ai-investigation-tools.js";
import { AIPredictionEngine } from "./detectors/ai-prediction-engine.js";
import { AIReportingEngine } from "./detectors/ai-reporting-engine.js";
import { AIAssistant } from "./detectors/ai-assistant.js";
import { AnalogVideoQualityDetector } from "./detectors/analog-video-quality-detector.js";
import { CameraAgingDetector } from "./detectors/camera-aging-detector.js";
import { CameraTypeClassifier } from "./detectors/camera-type-classifier.js";
import { DVRChannelHealthDetector } from "./detectors/dvr-channel-health-detector.js";
import { getModelManager, resetModelManager } from "./model-manager.js";
import { getConditionalScheduler, type ConditionalScheduler } from "./inference/conditional-scheduler.js";

export interface AnalyticsRule {
  id: string;
  cameraId: string;
  detectionType: string;
  enabled: boolean;
  zone?: {
    id: string;
    name: string;
    shape: "polygon" | "line";
    points: Array<{ x: number; y: number }>;
  };
  minConfidence: number;
  minDurationSeconds: number;
  direction?: string;
  objectClasses?: string[];
}

export class AnalyticsPipeline {
  // Core detectors
  private motionDetector: MotionDetector;
  private objectDetector: ObjectDetector;
  private zoneDetector: ZoneDetector;
  private healthDetector: CameraHealthDetector;
  private cameraTamperDetector: CameraTamperDetector;
  
  // Enhanced detectors
  private personDetector: PersonDetector;
  private vehicleDetector: VehicleDetector;
  private helmetDetector: HelmetDetector;
  private ppeDetector: PPEDetector;
  private fallDetector: FallDetector;
  private smokeFireDetector: SmokeFireDetector;
  private crowdDensityDetector: CrowdDensityDetector;
  private tailgatingDetector: TailgatingDetector;
  private unattendedObjectsDetector: UnattendedObjectsDetector;
  private queueDetector: QueueDetector;
  private heatMapGenerator: HeatMapGenerator;
  private faceDetector: FaceDetector;
  private faceAnalytics: FaceAnalyticsDetector;
  private anprDetector: ANPRDetector;
  private humanAnalytics: HumanAnalyticsDetector;
  private vehicleAnalytics: VehicleAnalyticsDetector;
  private safetyAnalytics: SafetyAnalyticsDetector;
  private bankingAnalytics: BankingAnalyticsDetector;
  private retailAnalytics: RetailAnalytics;
  private industrialAnalytics: IndustrialAnalytics;
  private smartCityAnalytics: SmartCityAnalytics;
  private aiSearchEngine: AISearchEngine;
  private aiInvestigationTools: AIInvestigationTools;
  private aiPredictionEngine: AIPredictionEngine;
  private aiReportingEngine: AIReportingEngine;
  private aiAssistant: AIAssistant;
  
  // Analog camera AI detectors
  private analogVideoQualityDetector: AnalogVideoQualityDetector;
  private cameraAgingDetector: CameraAgingDetector;
  private cameraTypeClassifier: CameraTypeClassifier;
  private dvrChannelHealthDetector: DVRChannelHealthDetector;
  
  private detectors: BaseDetector[];
  private requiredDetectors: Set<BaseDetector>;
  private isInitialized = false;
  private initializationErrors = new Map<string, string>();
  private industrialAnalyticsEnabled = false;
  private smartCityAnalyticsEnabled = false;
  
  // GPU-aware conditional scheduler
  private scheduler: ConditionalScheduler;

  // Rule cache per camera
  private rulesCache = new Map<string, AnalyticsRule[]>();
  private rulesCacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds

  constructor() {
    // Initialize core detectors
    this.motionDetector = new MotionDetector();
    this.objectDetector = new ObjectDetector({
      confidenceThreshold: environmentProbability("OBJECT_CONFIDENCE_THRESHOLD", 0.35),
    });
    this.zoneDetector = new ZoneDetector();
    this.healthDetector = new CameraHealthDetector();
    this.cameraTamperDetector = new CameraTamperDetector();
    
    // Initialize enhanced detectors
    this.personDetector = new PersonDetector();
    this.vehicleDetector = new VehicleDetector();
    this.helmetDetector = new HelmetDetector(null, environmentProbability("HELMET_CONFIDENCE_THRESHOLD", 0.35));
    this.ppeDetector = new PPEDetector(environmentProbability("PPE_CONFIDENCE_THRESHOLD", 0.6));
    this.fallDetector = new FallDetector();
    this.smokeFireDetector = new SmokeFireDetector(null, environmentProbability("FIRE_CONFIDENCE_THRESHOLD", 0.65));
    this.crowdDensityDetector = new CrowdDensityDetector();
    this.tailgatingDetector = new TailgatingDetector();
    this.unattendedObjectsDetector = new UnattendedObjectsDetector();
    this.queueDetector = new QueueDetector();
    this.heatMapGenerator = new HeatMapGenerator();
    this.faceDetector = new FaceDetector({
      detectionConfidence: environmentProbability("FACE_CONFIDENCE_THRESHOLD", 0.65),
      recognitionEnabled: process.env.FACE_RECOGNITION_ENABLED !== "false",
    });
    this.faceAnalytics = new FaceAnalyticsDetector();
    this.anprDetector = new ANPRDetector({
      plateConfidence: environmentProbability("ANPR_PLATE_CONFIDENCE_THRESHOLD", 0.7),
      ocrConfidence: environmentProbability("ANPR_CONFIDENCE_THRESHOLD", 0.8),
      countryCode: process.env.ANPR_COUNTRY_CODE || "IN",
      watchlistEnabled: true,
    });
    this.humanAnalytics = new HumanAnalyticsDetector();
    this.vehicleAnalytics = new VehicleAnalyticsDetector();
    this.safetyAnalytics = new SafetyAnalyticsDetector();
    this.bankingAnalytics = new BankingAnalyticsDetector();
    this.retailAnalytics = new RetailAnalytics();
    this.industrialAnalytics = new IndustrialAnalytics();
    this.smartCityAnalytics = new SmartCityAnalytics();
    this.aiSearchEngine = new AISearchEngine();
    this.aiInvestigationTools = new AIInvestigationTools();
    this.aiPredictionEngine = new AIPredictionEngine();
    this.aiReportingEngine = new AIReportingEngine();
    this.aiAssistant = new AIAssistant();

    // Initialize analog camera AI detectors
    this.analogVideoQualityDetector = new AnalogVideoQualityDetector();
    this.cameraAgingDetector = new CameraAgingDetector();
    this.cameraTypeClassifier = new CameraTypeClassifier();
    this.dvrChannelHealthDetector = new DVRChannelHealthDetector();

    this.detectors = [
      this.motionDetector,
      this.objectDetector,
      this.zoneDetector,
      this.healthDetector,
      this.cameraTamperDetector,
      this.personDetector,
      this.vehicleDetector,
      this.helmetDetector,
      this.ppeDetector,
      this.fallDetector,
      this.smokeFireDetector,
      this.crowdDensityDetector,
      this.tailgatingDetector,
      this.unattendedObjectsDetector,
      this.queueDetector,
      this.heatMapGenerator,
      this.faceDetector,
      this.anprDetector,
      this.analogVideoQualityDetector,
      this.cameraAgingDetector,
      this.cameraTypeClassifier,
      this.dvrChannelHealthDetector,
      this.bankingAnalytics,
      this.vehicleAnalytics,
      this.safetyAnalytics,
      this.faceAnalytics,
      this.humanAnalytics,
      this.retailAnalytics,
      this.industrialAnalytics,
      this.smartCityAnalytics,
      this.aiSearchEngine,
      this.aiInvestigationTools,
      this.aiPredictionEngine,
      this.aiReportingEngine,
      this.aiAssistant,
    ];
    // Only deterministic infrastructure is required to accept a frame. Model
    // capabilities advertise their own degraded state when a model is not
    // provisioned, so a missing optional model cannot make the health endpoint
    // claim that an empty detector is operational.
    this.requiredDetectors = new Set([
      this.motionDetector,
      this.zoneDetector,
      this.healthDetector,
    ]);
    
    // Initialize GPU-aware conditional scheduler
    const gpuCapacity = process.env.GPU_CAPACITY ? parseInt(process.env.GPU_CAPACITY) : 100;
    this.scheduler = getConditionalScheduler(undefined, gpuCapacity);
  }

  async initialize(): Promise<void> {
    console.log("Initializing analytics pipeline...");
    
    // Initialize model manager first
    const modelManager = getModelManager({
      ...(process.env.MODELS_DIR ? { modelsDirectory: process.env.MODELS_DIR } : {}),
      maxCacheSize: parseInt(process.env.MODEL_CACHE_SIZE_MB || '2048'),
      enableGPU: process.env.ENABLE_GPU_ACCELERATION === 'true',
      cacheEvictionPolicy: 'lru',
      preloadModels: ['yolov8n'], // The only model executed by the core frame path.
      autoUnloadAfter: 30
    });

    if (!modelManager.isReady()) {
      await modelManager.initialize();
    }
    const provisioning = modelManager.getProvisioningSummary();
    if (process.env.ANALYTICS_REQUIRE_MODELS === "true" && !provisioning.ready) {
      throw new Error(`Required analytics models are not ready: ${provisioning.missingRequired.join(", ")}`);
    }
    
    // Initialize detectors
    for (const detector of this.detectors) {
      const name = (detector as any).detectionType as string;
      try {
        await detector.initialize();
      } catch (error) {
        // Optional analytics modules must not take the core frame pipeline
        // down when their model/runtime dependency is not installed.
        const message = error instanceof Error ? error.message : String(error);
        this.initializationErrors.set(name, message);
        if (this.requiredDetectors.has(detector)) throw error;
        console.warn(`Analytics detector ${name} is unavailable: ${message}`);
      }
    }

    this.isInitialized = true;
    console.log("Analytics pipeline initialized successfully");
    
    // Log model manager stats
    const stats = modelManager.getStats();
    console.log(`Models loaded: ${stats.loadedModels}; required artifacts ready: ${provisioning.requiredReady}/${provisioning.required}; memory: ${stats.memoryUsageMB.toFixed(1)}MB`);
  }

  /**
   * Process a single frame through the enhanced detection pipeline WITH CONDITIONAL SCHEDULING
   */
  async processFrame(
    frame: DetectionFrame,
    rules: AnalyticsRule[],
  ): Promise<Array<z.infer<typeof detectionSchema>>> {
    if (!this.isInitialized) {
      throw new Error("Analytics pipeline not initialized");
    }

    const events: Array<z.infer<typeof detectionSchema>> = [];
    const localInferenceRequested = !hasInferenceObjects(frame);

    // Step 1: Camera health check (always run - cheap)
    const healthResults = await this.healthDetector.detect(frame);
    for (const result of healthResults) {
      if (this.matchesAnyRule(result.detectionType, rules)) {
        events.push(await this.createEvent(frame, result));
      }
    }

    // Optical tamper detection is intentionally independent of motion and
    // object inference: a covered, defocused, or redirected camera often has
    // no usable motion signal.  It uses only local frame statistics.
    if (this.needsDetection(rules, ["camera-tamper", "camera-tampering"])) {
      const tamperResults = await this.cameraTamperDetector.detect(frame);
      for (const result of tamperResults) {
        if (this.matchesAnyRule(result.detectionType, rules)) {
          events.push(await this.createEvent(frame, result));
        }
      }
    }

    // An abandoned object becomes meaningful precisely after activity stops.
    // Run this local, low-cost background tracker before motion-first
    // scheduling so a static bag is not skipped on an otherwise quiet scene.
    if (this.needsDetection(rules, ["unattended-object", "abandoned-object", "removed-object"])) {
      const unattendedResults = await this.unattendedObjectsDetector.detect(frame);
      for (const result of unattendedResults) {
        if (this.matchesAnyRule(result.detectionType, rules)) {
          events.push(await this.createEvent(frame, result));
        }
      }
    }

    // Step 2: Motion detection (first stage trigger - CRITICAL for optimization)
    const motionResults = await this.motionDetector.detect(frame);
    const hasMotion = motionResults.length > 0;

    // Step 3: Run base object detection ONCE if motion detected or required by rules
    const shouldDetectObjects = hasMotion || this.needsObjectDetection(rules);
    let inferenceFrame = frame;
    let detectedObjects: InferenceObject[] = [];
    
    if (shouldDetectObjects) {
      const objectResults = await this.objectDetector.detect(frame);
      detectedObjects = objectResults.flatMap((result) => result.objects) as InferenceObject[];
      inferenceFrame = this.withDetections(
        frame,
        detectedObjects,
        localInferenceRequested ? "local-onnx" : "normalized-observation",
      );
      for (const result of objectResults) {
        if (this.matchesAnyRule(result.detectionType, rules)) {
          events.push(await this.createEvent(frame, result));
        }
      }
    }
    const hasObservedObjects = detectedObjects.length > 0;

    // Step 4: CONDITIONAL SCHEDULING - decide which expensive models to run
    const schedule = this.scheduler.scheduleFrame(
      inferenceFrame,
      rules,
      hasMotion || hasObservedObjects,
      detectedObjects
    );

    // Normalized edge observations have already paid the inference cost and
    // must not be discarded by local GPU sampling or motion-first gating.
    if (!schedule.shouldProcess && !hasObservedObjects) {
      // No further processing needed for this frame
      return events;
    }

    // Notify scheduler that models are starting
    this.scheduler.updateGpuLoad(schedule.modelsToRun, true);

    try {
      // Extract persons and vehicles from detected objects
      let persons: any[] = detectedObjects.filter(obj => obj.label === 'person');
      let vehicles: any[] = detectedObjects.filter(obj =>
        ['car', 'motorcycle', 'bus', 'truck', 'bicycle', 'auto-rickshaw'].includes(obj.label)
      );

      // Step 5: Run person detection with tracking if scheduled
      if (schedule.modelsToRun.includes('yolov8n') || this.needsPersonDetection(rules)) {
        const personResults = await this.personDetector.detect(inferenceFrame);
        persons = personResults.find((result) => result.detectionType === "person")?.objects ?? personResults[0]?.objects ?? [];
        for (const result of personResults) {
          if (this.matchesAnyRule(result.detectionType, rules)) {
            events.push(await this.createEvent(frame, result));
          }
        }
      }

      // Step 6: Run vehicle detection with tracking if scheduled
      if (schedule.modelsToRun.includes('yolov8n') || this.needsVehicleDetection(rules)) {
        const vehicleResults = await this.vehicleDetector.detect(inferenceFrame);
        vehicles = vehicleResults.flatMap((result) => result.objects);
        for (const result of vehicleResults) {
          if (this.matchesAnyRule(result.detectionType, rules)) {
            events.push(await this.createEvent(frame, result));
          }
        }
      }

      // Preserve track IDs for temporal detectors
      const trackedFrame = this.withTrackedObjects(inferenceFrame, persons, vehicles);

      // Step 7: Conditionally run specialized detections based on scheduler
      const specializedPromises: Array<Promise<any[]>> = [];

      // Helmet detection (if scheduled or active in rules)
      if (schedule.modelsToRun.includes('helmet') ||
          this.needsDetection(rules, ['helmet', 'helmet-worn', 'no-helmet'])) {
        specializedPromises.push(this.helmetDetector.detect(trackedFrame));
      }

      // PPE violations originate from a dedicated edge/local PPE model or chromatic inspector
      if (this.needsDetection(rules, ['ppe', 'no-helmet', 'no-safety-vest', 'no-gloves', 'no-shoes'])) {
        specializedPromises.push(this.ppeDetector.detect(trackedFrame));
      }

      // Fall detection (if scheduled or active in rules)
      if (this.needsDetection(rules, ['fall', 'person-down', 'worker-fall'])) {
        specializedPromises.push(this.fallDetector.detect(trackedFrame));
      }

      // Fire/smoke detection (if scheduled or active in rules - critical safety)
      if (
        schedule.modelsToRun.includes('fire-smoke') ||
        this.needsDetection(rules, ['fire', 'smoke', 'fire-smoke'])
      ) {
        specializedPromises.push(this.smokeFireDetector.detect(trackedFrame));
      }

      // Crowd density (if enough persons)
      if (persons.length > 3 && this.needsDetection(rules, ['crowd-density'])) {
        specializedPromises.push(this.crowdDensityDetector.detect(trackedFrame));
      }

      // Tailgating (if multiple persons)
      if (persons.length > 1 && this.needsDetection(rules, ['tailgating'])) {
        specializedPromises.push(this.tailgatingDetector.detect(trackedFrame));
      }

      // Queue analysis (if persons present)
      if (persons.length > 0 && this.needsDetection(rules, ['queue'])) {
        specializedPromises.push(this.queueDetector.detect(trackedFrame));
      }

      // Heat map (always - lightweight)
      specializedPromises.push(this.heatMapGenerator.detect(trackedFrame));

      // Face detection & recognition (if scheduled or active in rules)
      if (
        schedule.modelsToRun.includes('face-detector') ||
        this.needsDetection(rules, [
          'face',
          'face-recognition',
          'unknown-person',
          'watchlist-match',
          'vip-detection',
          'blacklist-detection',
        ])
      ) {
        specializedPromises.push(this.faceDetector.detect(trackedFrame));
      }

      // ANPR & Vehicle watchlist (if scheduled or active in rules)
      if (
        schedule.modelsToRun.includes('anpr-detector') ||
        this.needsDetection(rules, ['anpr', 'anpr-detector', 'license-plate', 'watchlist-match', 'vehicle-watchlist', 'blocked-vehicle'])
      ) {
        specializedPromises.push(this.anprDetector.detect(trackedFrame));
      }

      // Banking Analytics (teller, vault, ATM kiosk, dual-control)
      if (this.needsDetection(rules, ['banking', 'banking-analytics', 'atm-abnormal-activity', 'atm-tampering', 'vault-violation', 'teller-unattended'])) {
        specializedPromises.push(this.bankingAnalytics.detect(trackedFrame));
      }

      // Vehicle Analytics (speed, parking, wrong-way, vehicle classification)
      if (this.needsDetection(rules, ['vehicle-analytics', 'vehicle-speed', 'vehicle-overspeeding', 'wrong-way'])) {
        specializedPromises.push(this.vehicleAnalytics.detect(trackedFrame));
      }

      // Wait for all scheduled specialized detections
      const specializedResults = await Promise.all(specializedPromises);

      // Process specialized results
      for (const results of specializedResults) {
        for (const result of results) {
          if (this.matchesAnyRule(result.detectionType, rules)) {
            events.push(await this.createEvent(frame, result));
          }
        }
      }

      // Step 8: Zone-based detection (line crossing, intrusion, loitering)
      const allObjects = [...persons, ...vehicles];
      if (allObjects.length > 0) {
        for (const rule of rules) {
          if (!rule.enabled) continue;
          const zoneEvents = await this.processZoneRule(trackedFrame, allObjects, rule);
          events.push(...zoneEvents);
        }
      }

    } finally {
      // Notify scheduler that models have finished
      this.scheduler.updateGpuLoad(schedule.modelsToRun, false);
    }

    return events;
  }

  /**
   * Process zone-specific rules
   */
  private async processZoneRule(
    frame: DetectionFrame,
    objects: any[],
    rule: AnalyticsRule,
  ): Promise<Array<z.infer<typeof detectionSchema>>> {
    const events: Array<z.infer<typeof detectionSchema>> = [];

    if (!rule.zone) return events;

    // Filter objects by class if specified
    let filteredObjects = objects;
    if (rule.objectClasses && rule.objectClasses.length > 0) {
      filteredObjects = objects.filter((obj) =>
        rule.objectClasses!.includes(obj.label),
      );
    }

    // Filter by confidence
    filteredObjects = filteredObjects.filter(
      (obj) => obj.confidence >= rule.minConfidence,
    );

    if (filteredObjects.length === 0) return events;

    let results: any[] = [];

    switch (rule.detectionType) {
      case "line-crossing":
      case "footfall":
        if (rule.zone.shape === "line") {
          results = await this.zoneDetector.detectLineCrossing(
            frame,
            filteredObjects,
            {
              line: {
                start: rule.zone.points[0]!,
                end: rule.zone.points[1]!,
              },
              direction: (rule.direction as any) ?? "any",
            },
          );
          if (rule.detectionType === "footfall") {
            results = results.map((result) => {
              const direction = result.metadata?.direction;
              const isEntry = direction === "a-to-b";
              return {
                ...result,
                detectionType: "footfall",
                metadata: {
                  ...result.metadata,
                  entries: isEntry ? 1 : 0,
                  exits: isEntry ? 0 : 1,
                  totalCrossings: 1,
                },
              };
            });
          }
        }
        break;

      case "wrong-direction":
        // The configured direction is the permitted direction across this
        // virtual lane line.  Evaluate crossings in both directions and only
        // emit an alert for the opposite direction.
        if (rule.zone.shape === "line" && (rule.direction === "a-to-b" || rule.direction === "b-to-a")) {
          const permittedDirection = rule.direction;
          const crossings = await this.zoneDetector.detectLineCrossing(
            frame,
            filteredObjects.filter((object) => ["car", "motorcycle", "bus", "truck", "bicycle", "auto-rickshaw"].includes(object.label)),
            {
              line: {
                start: rule.zone.points[0]!,
                end: rule.zone.points[1]!,
              },
              direction: "any",
            },
          );
          results = crossings
            .filter((result) => result.metadata?.direction !== permittedDirection)
            .map((result) => ({
              ...result,
              detectionType: "wrong-direction",
              metadata: {
                ...result.metadata,
                permittedDirection,
                observedDirection: result.metadata?.direction,
                zoneName: rule.zone!.name,
              },
            }));
        }
        break;

      case "intrusion":
        if (rule.zone.shape === "polygon") {
          results = await this.zoneDetector.detectIntrusion(
            frame,
            filteredObjects,
            rule.zone,
          );
        }
        break;

      case "after-hours-person":
        if (rule.zone.shape === "polygon") {
          const isClosed = frame.metadata?.branchClosed === true || (frame.metadata?.branchClosed === undefined && isBranchClosedHour(frame.timestamp));
          if (isClosed) {
            const persons = filteredObjects.filter((object) =>
              object.label === "person" && isInsideZone(object.boundingBox, rule.zone!.points),
            );
            if (persons.length > 0) {
              results = [{
                detectionType: "after-hours-person",
                confidence: Math.max(...persons.map((person) => person.confidence ?? 0)),
                objects: persons,
                metadata: { zoneId: rule.zone.id, zoneName: rule.zone.name, branchClosed: true },
                requiresAlert: true,
              }];
            }
          }
        }
        break;

      case "employee-only-zone":
        if (rule.zone.shape === "polygon") {
          const unauthorised = filteredObjects.filter((object) => {
            if (object.label !== "person" || !isInsideZone(object.boundingBox, rule.zone!.points)) return false;
            const authorisedZones = object.attributes?.authorisedZoneIds;
            if (Array.isArray(authorisedZones)) {
              return !authorisedZones.includes(rule.zone!.id);
            }
            const isAuthorized = object.attributes?.isAuthorized ?? object.attributes?.authorized;
            if (typeof isAuthorized === "boolean") {
              return !isAuthorized;
            }
            return true;
          });
          if (unauthorised.length > 0) {
            results = [{
              detectionType: "employee-only-zone",
              confidence: Math.max(...unauthorised.map((person) => person.confidence ?? 0)),
              objects: unauthorised,
              metadata: { zoneId: rule.zone.id, zoneName: rule.zone.name, authorizationSource: "trusted-edge-context" },
              requiresAlert: true,
            }];
          }
        }
        break;

      case "atm-abnormal-activity":
      case "atm-tampering":
        if (rule.zone.shape === "polygon") {
          const persons = filteredObjects.filter((object) =>
            object.label === "person" && isInsideZone(object.boundingBox, rule.zone!.points),
          );
          if (persons.length > 1) {
            results.push({
              detectionType: "atm-abnormal-activity",
              confidence: Math.max(...persons.map((p) => p.confidence ?? 0)),
              objects: persons,
              metadata: { zoneId: rule.zone.id, zoneName: rule.zone.name, subType: "multi_person_presence", personCount: persons.length, severity: "high" },
              requiresAlert: true,
            });
          }
          const loiteringResults = await this.zoneDetector.detectLoitering(
            frame,
            persons,
            rule.zone,
            rule.minDurationSeconds || 180,
          );
          for (const lr of loiteringResults) {
            results.push({
              ...lr,
              detectionType: "atm-abnormal-activity",
              metadata: { ...lr.metadata, zoneId: rule.zone.id, zoneName: rule.zone.name, subType: "prolonged_presence", severity: "medium" },
              requiresAlert: true,
            });
          }
        }
        break;

      case "vehicle-watchlist-match":
      case "blocked-vehicle":
        {
          const vehiclesInZone = filteredObjects.filter((obj) =>
            ["car", "motorcycle", "bus", "truck", "bicycle", "auto-rickshaw"].includes(obj.label) &&
            (!rule.zone || (rule.zone.shape === "polygon" && isInsideZone(obj.boundingBox, rule.zone.points)))
          );
          for (const veh of vehiclesInZone) {
            const plate = veh.attributes?.licensePlate ?? veh.attributes?.plateNumber ?? (veh as any).plateReading?.plateNumber;
            if (plate) {
              results.push({
                detectionType: "vehicle-watchlist-match",
                confidence: veh.confidence ?? 0.9,
                objects: [veh],
                metadata: {
                  plateNumber: plate,
                  zoneId: rule.zone?.id,
                  zoneName: rule.zone?.name,
                  matchCategory: "blocked",
                  severity: "critical",
                },
                requiresAlert: true,
              });
            }
          }
        }
        break;

      case "restricted-multiple-person":
        if (rule.zone.shape === "polygon") {
          const persons = filteredObjects.filter((object) =>
            object.label === "person" && isInsideZone(object.boundingBox, rule.zone!.points),
          );
          const threshold = Math.max(2, Math.floor(rule.minDurationSeconds || 2));
          if (persons.length >= threshold) {
            results = [{
              detectionType: "restricted-multiple-person",
              confidence: Math.max(...persons.map((person) => person.confidence ?? 0)),
              objects: persons,
              metadata: { zoneId: rule.zone.id, zoneName: rule.zone.name, personCount: persons.length, threshold },
              requiresAlert: true,
            }];
          }
        }
        break;

      case "loitering":
        if (rule.zone.shape === "polygon") {
          results = await this.zoneDetector.detectLoitering(
            frame,
            filteredObjects,
            rule.zone,
            rule.minDurationSeconds,
          );
        }
        break;

      case "crowd-density":
        if (rule.zone.shape === "polygon") {
          // Use minDurationSeconds as threshold count
          results = await this.zoneDetector.detectCrowdDensity(
            frame,
            filteredObjects,
            rule.zone,
            Math.max(1, rule.minDurationSeconds),
          );
        }
        break;
    }

    for (const result of results) {
      events.push(await this.createEvent(frame, result));
    }

    return events;
  }

  /**
   * Create detection event with snapshot image
   */
  private async createEvent(
    frame: DetectionFrame,
    result: any,
  ): Promise<z.infer<typeof detectionSchema>> {
    const eventId = randomUUID();
    let snapshotBase64: string | undefined;

    if (
      frame.imageData &&
      frame.imageData.length === frame.width * frame.height * 3 &&
      frame.width > 0 &&
      frame.height > 0
    ) {
      try {
        const jpegBuffer = await sharp(frame.imageData, {
          raw: {
            width: frame.width,
            height: frame.height,
            channels: 3,
          },
        })
          .resize({ width: Math.min(frame.width, 640), withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toBuffer();

        snapshotBase64 = jpegBuffer.toString("base64");
        snapshotCache.set(eventId, {
          buffer: jpegBuffer,
          createdAt: Date.now(),
          cameraId: frame.cameraId,
        });
        snapshotCache.set(`camera:${frame.cameraId}`, {
          buffer: jpegBuffer,
          createdAt: Date.now(),
          cameraId: frame.cameraId,
        });
        if (snapshotCache.size > 300) {
          const oldestKey = snapshotCache.keys().next().value;
          if (oldestKey) snapshotCache.delete(oldestKey);
        }
      } catch {
        // Continue without snapshot if sharp encoding fails
      }
    }

    return {
      tenantId: frame.tenantId,
      cameraId: frame.cameraId,
      sourceEventId: eventId,
      detectionType: result.detectionType,
      occurredAt: frame.timestamp.toISOString(),
      confidence: result.confidence ?? 0,
      durationSeconds: typeof result.durationSeconds === "number"
        ? result.durationSeconds
        : (result.requiresAlert ? 1 : 0),
      modelVersion: result.executionMetadata?.modelVersion ?? "1.0.0",
      objects: (result.objects || []).map((obj: any) => ({
        label: obj.label,
        confidence: obj.confidence,
        trackId: obj.trackId,
        boundingBox: obj.boundingBox,
      })),
      snapshotReference: `/v1/alerts/${eventId}/evidence/snapshot`,
      metadata: {
        ...(result.metadata ?? {}),
        ...(snapshotBase64 ? { snapshotBase64 } : {}),
      },
    };
  }

  /**
   * Check if any rule matches the detection type
   */
  private matchesAnyRule(detectionType: string, rules: AnalyticsRule[]): boolean {
    const target = normalizeDetectionType(detectionType);
    return rules.some((rule) => {
      if (!rule.enabled) return false;
      const ruleType = normalizeDetectionType(rule.detectionType);
      if (ruleType === target) return true;
      if (target === "fire" || target === "smoke") {
        return ruleType === "fire-smoke" || ruleType === target;
      }
      if (target === "unattended-object" || target === "abandoned-object") {
        return ruleType === "unattended-object" || ruleType === "abandoned-object";
      }
      if (target === "vehicle-watchlist-match") {
        return ruleType === "vehicle-watchlist" || ruleType === "blocked-vehicle" || ruleType === "watchlist-match";
      }
      return false;
    });
  }

  /**
   * Determine if person detection should run
   */
  private needsPersonDetection(rules: AnalyticsRule[]): boolean {
    const personTypes = [
      "person",
      "person-counting",
      "occupancy-counting",
      "footfall",
      "customer-counting",
      "fall",
      "person-down",
      "crowd-density",
      "crowd",
      "tailgating",
      "queue",
      "helmet",
      "helmet-worn",
      "no-helmet",
      "no-safety-vest",
      "no-gloves",
      "no-shoes",
      "ppe",
      "loitering",
      "intrusion",
      "line-crossing",
      "face",
      "face-recognition",
      "watchlist-match",
      "after-hours-person",
      "after-hours",
      "employee-only-zone",
      "restricted-multiple-person",
      "atm-abnormal-activity",
      "atm-tampering",
    ];
    return rules.some(r => r.enabled && personTypes.map(normalizeDetectionType).includes(normalizeDetectionType(r.detectionType)));
  }

  /**
   * Determine if vehicle detection should run
   */
  private needsVehicleDetection(rules: AnalyticsRule[]): boolean {
    const vehicleTypes = [
      "vehicle",
      "wrong-direction",
      "wrong-way",
      "helmet",
      "helmet-worn",
      "no-helmet",
      "line-crossing",
      "anpr",
      "vehicle-watchlist",
      "blocked-vehicle",
      "vehicle-analytics",
      "vehicle-speed",
      "vehicle-overspeeding",
    ];
    return rules.some(r => r.enabled && vehicleTypes.map(normalizeDetectionType).includes(normalizeDetectionType(r.detectionType)));
  }

  private needsObjectDetection(rules: AnalyticsRule[]): boolean {
    return this.needsDetection(rules, [
      "object", "person", "person-counting", "occupancy-counting", "footfall", "customer-counting",
      "vehicle", "helmet", "helmet-worn", "no-helmet", "no-safety-vest", "no-gloves", "no-shoes", "ppe", "fall", "person-down", "fire", "smoke",
      "crowd-density", "crowd", "tailgating", "queue", "loitering", "intrusion", "line-crossing",
      "wrong-direction", "wrong-way",
      "face", "face-recognition", "watchlist-match",
      "camera-tamper", "camera-tampering", "unattended-object", "abandoned-object", "removed-object",
      "after-hours-person", "after-hours", "employee-only-zone", "restricted-multiple-person",
      "atm-abnormal-activity", "atm-tampering", "vehicle-watchlist", "blocked-vehicle",
    ]);
  }

  private withDetections(
    frame: DetectionFrame,
    detections: InferenceObject[],
    inferenceMode = frame.metadata?.inferenceMode,
  ): DetectionFrame {
    return {
      ...frame,
      metadata: { ...frame.metadata, detections, inferenceMode },
    };
  }

  private withTrackedObjects(
    frame: DetectionFrame,
    persons: DetectedObject[],
    vehicles: DetectedObject[],
  ): DetectionFrame {
    const existing = Array.isArray(frame.metadata?.detections)
      ? frame.metadata.detections.filter((item): item is InferenceObject => {
        if (!item || typeof item !== "object") return false;
        const label = (item as { label?: unknown }).label;
        return label !== "person" && !["car", "motorcycle", "bus", "truck", "bicycle", "auto-rickshaw"].includes(String(label));
      })
      : [];
    return this.withDetections(frame, [
      ...existing,
      ...persons,
      ...vehicles,
    ]);
  }

  private needsDetection(rules: AnalyticsRule[], types: string[]): boolean {
    const normalizedTypes = new Set(types.map(normalizeDetectionType));
    return rules.some((rule) => {
      if (!rule.enabled) return false;
      const r = normalizeDetectionType(rule.detectionType);
      return normalizedTypes.has(r) || types.includes(rule.detectionType);
    });
  }

  /**
   * Determine if object detection should run
   */
  private shouldRunObjectDetection(rules: AnalyticsRule[]): boolean {
    const objectBasedTypes = [
      "person",
      "vehicle",
      "object",
      "line-crossing",
      "wrong-direction",
      "intrusion",
      "loitering",
      "crowd-density",
      "fire-smoke",
      "helmet",
      "fall",
      "tailgating",
      "queue",
      "unattended-object",
      "abandoned-object",
      "after-hours-person",
      "employee-only-zone",
      "restricted-multiple-person",
      "atm-abnormal-activity",
    ];

    return rules.some(
      (rule) =>
        rule.enabled && objectBasedTypes.map(normalizeDetectionType).includes(normalizeDetectionType(rule.detectionType)),
    );
  }

  /**
   * Get health status of all detectors
   */
  getHealth(): Record<string, any> {
    const health: Record<string, any> = {
      initialized: this.isInitialized,
      detectors: {},
      initializationErrors: Object.fromEntries(this.initializationErrors),
      models: getModelManager().getProvisioningSummary(),
      scheduler: this.scheduler.getStatistics(),
    };

    for (const detector of this.detectors) {
      const detectorHealth = detector.getHealth();
      health.detectors[(detector as any).detectionType] = detectorHealth;
    }

    // Set canonical health keys for advanced modules
    health.detectors["banking"] = this.bankingAnalytics.getHealth();
    health.detectors["vehicle-analytics"] = this.vehicleAnalytics.getHealth();
    health.detectors["safety"] = this.safetyAnalytics.getHealth();
    health.detectors["ai-search-engine"] = this.aiSearchEngine.getHealth();
    health.detectors["investigation"] = this.aiInvestigationTools.getHealth();
    health.detectors["prediction"] = this.aiPredictionEngine.getHealth();
    health.detectors["reporting"] = this.aiReportingEngine.getHealth();
    health.detectors["assistant"] = this.aiAssistant.getHealth();
    health.detectors["face-analytics"] = this.faceAnalytics.getHealth();
    health.detectors["human-analytics"] = this.humanAnalytics.getHealth();
    health.detectors["retail"] = this.retailAnalytics.getHealth();
    health.detectors["industrial"] = this.industrialAnalytics.getHealth();
    health.detectors["smart-city"] = this.smartCityAnalytics.getHealth();

    for (const [name, details] of Object.entries({
      "face-analytics": "Provision RetinaFace/ArcFace runtime for face recognition.",
      "human-analytics": "Provision pose and Re-ID runtimes for deep re-identification.",
      retail: "Configure retail analytics models and zones.",
      industrial: "Configure industrial models and zones.",
      "smart-city": "Configure smart-city models and zones.",
    })) {
      if (!health.detectors[name]) {
        health.detectors[name] = { status: "degraded", details };
      }
    }

    return health;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    for (const detector of this.detectors) {
      await detector.cleanup();
    }
    await resetModelManager();
    this.isInitialized = false;
    this.initializationErrors.clear();
    this.rulesCache.clear();
    this.rulesCacheExpiry.clear();
  }

  /**
   * Get camera health
   */
  getCameraHealth(cameraId: string) {
    return this.healthDetector.getCameraHealth(cameraId);
  }

  /**
   * Get person tracks
   */
  getPersonTracks() {
    return this.personDetector.getActiveTracks();
  }

  /**
   * Get vehicle tracks
   */
  getVehicleTracks() {
    return this.vehicleDetector.getActiveTracks();
  }

  /**
   * Get current heat map
   */
  getHeatMap() {
    return this.heatMapGenerator.getHeatMap();
  }

  /**
   * Get crowd metrics
   */
  getCrowdMetrics() {
    return this.crowdDensityDetector.getCurrentMetrics();
  }

  /**
   * Get human analytics module
   */
  getHumanAnalytics() {
    return this.humanAnalytics;
  }

  /**
   * Get vehicle analytics module
   */
  getVehicleAnalytics() {
    return this.vehicleAnalytics;
  }

  /**
   * Get face analytics module
   */
  getFaceAnalytics() {
    return this.faceAnalytics;
  }

  /**
   * Get safety analytics module
   */
  getSafetyAnalytics() {
    return this.safetyAnalytics;
  }

  /**
   * Get banking analytics module
   */
  getBankingAnalytics() {
    return this.bankingAnalytics;
  }

  /**
   * Get retail analytics module
   */
  getRetailAnalytics() {
    return this.retailAnalytics;
  }

  /**
   * Get AI search engine
   */
  getAISearchEngine() {
    return this.aiSearchEngine;
  }

  /**
   * Get AI investigation tools module
   */
  getAIInvestigationTools() {
    return this.aiInvestigationTools;
  }

  /**
   * Get AI prediction engine
   */
  getAIPredictionEngine() {
    return this.aiPredictionEngine;
  }

  /**
   * Get AI reporting engine
   */
  getAIReportingEngine() {
    return this.aiReportingEngine;
  }

  /**
   * Get AI assistant
   */
  getAIAssistant() {
    return this.aiAssistant;
  }

  /**
   * Enable industrial analytics module
   */
  enableIndustrialAnalytics() {
    this.industrialAnalyticsEnabled = true;
    if (this.isInitialized) {
      void this.industrialAnalytics.initialize();
    }
  }

  /**
   * Enable smart city analytics module
   */
  enableSmartCityAnalytics() {
    this.smartCityAnalyticsEnabled = true;
    if (this.isInitialized) {
      void this.smartCityAnalytics.initialize();
    }
  }

  /**
   * Get industrial analytics module
   */
  getIndustrialAnalytics() {
    return this.industrialAnalyticsEnabled ? this.industrialAnalytics : undefined;
  }

  /**
   * Get smart city analytics module
   */
  getSmartCityAnalytics() {
    return this.smartCityAnalyticsEnabled ? this.smartCityAnalytics : undefined;
  }

  /**
   * Configure crowd zones
   */
  setCrowdZones(zones: any[]) {
    this.crowdDensityDetector.setZones(zones);
  }

  /**
   * Configure queue zones
   */
  setQueueZones(zones: any[]) {
    this.queueDetector.setQueues(zones);
  }

  /**
   * Configure entry zones for tailgating
   */
  setEntryZones(zones: any[]) {
    this.tailgatingDetector.setEntryZones(zones);
  }

  /**
   * Get detector by type
   */
  getDetector(type: string): BaseDetector | undefined {
    const detectorMap: Record<string, BaseDetector> = {
      motion: this.motionDetector,
      object: this.objectDetector,
      zone: this.zoneDetector,
      health: this.healthDetector,
      person: this.personDetector,
      vehicle: this.vehicleDetector,
      helmet: this.helmetDetector,
      fall: this.fallDetector,
      smoke: this.smokeFireDetector,
      fire: this.smokeFireDetector,
      crowd: this.crowdDensityDetector,
      tailgating: this.tailgatingDetector,
      queue: this.queueDetector,
      heatmap: this.heatMapGenerator,
      face: this.faceDetector,
      "face-recognition": this.faceDetector,
      anpr: this.anprDetector,
      human: this.humanAnalytics,
      "human-analytics": this.humanAnalytics,
      vehicle_analytics: this.vehicleAnalytics,
      vehicle_analytics_detector: this.vehicleAnalytics,
      safety: this.safetyAnalytics,
      banking: this.bankingAnalytics,
      retail: this.retailAnalytics,
      industrial: this.industrialAnalytics,
      "smart-city": this.smartCityAnalytics,
      search: this.aiSearchEngine,
      investigation: this.aiInvestigationTools,
      prediction: this.aiPredictionEngine,
      reporting: this.aiReportingEngine,
      assistant: this.aiAssistant,
    };
    
    return detectorMap[type];
  }

  /**
   * Get model manager instance
   */
  getModelManager() {
    return getModelManager();
  }

  /**
   * Get model manager statistics
   */
  getModelStats() {
    const modelManager = getModelManager();
    return modelManager.getStats();
  }

  /**
   * Get model memory report
   */
  getMemoryReport() {
    const modelManager = getModelManager();
    return modelManager.getMemoryReport();
  }

  /**
   * Get analog video quality detector
   */
  getAnalogVideoQualityDetector() {
    return this.analogVideoQualityDetector;
  }

  /**
   * Get camera aging detector
   */
  getCameraAgingDetector() {
    return this.cameraAgingDetector;
  }

  /**
   * Get camera type classifier
   */
  getCameraTypeClassifier() {
    return this.cameraTypeClassifier;
  }

  /**
   * Get DVR channel health detector
   */
  getDVRChannelHealthDetector() {
    return this.dvrChannelHealthDetector;
  }
}

function environmentProbability(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function isInsideZone(
  box: { x: number; y: number; width: number; height: number },
  polygon: Array<{ x: number; y: number }>,
): boolean {
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current]!;
    const b = polygon[previous]!;
    const intersects = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function normalizeDetectionType(type: string): string {
  const t = String(type || "").trim().toLowerCase().replace(/[ _]+/g, "-");
  switch (t) {
    case "camera-tampering":
    case "tampering":
    case "tamper":
      return "camera-tamper";
    case "abandoned-object":
    case "unattended-objects":
    case "unattended":
    case "abandoned":
      return "unattended-object";
    case "wrong-direction":
    case "wrong-way":
    case "wrong-way-driving":
      return "wrong-direction";
    case "fire-smoke":
    case "fire-and-smoke":
      return "fire";
    case "after-hours":
    case "after-hours-intrusion":
      return "after-hours-person";
    case "unauthorized-access":
    case "employee-only":
      return "employee-only-zone";
    case "multiple-person":
    case "multiple-person-restricted":
    case "restricted-multiple-persons":
      return "restricted-multiple-person";
    case "crowd":
    case "crowd-density-high":
      return "crowd-density";
    case "vehicle-watchlist":
    case "blocked-vehicle":
    case "allowed-vehicle":
      return "vehicle-watchlist-match";
    case "atm-abnormal":
    case "atm-loitering":
    case "atm-tampering":
      return "atm-abnormal-activity";
    default:
      return t;
  }
}

function isBranchClosedHour(timestamp: Date): boolean {
  const hours = timestamp.getHours();
  const day = timestamp.getDay();
  if (day === 0) return true; // Sunday is closed
  return hours < 9 || hours >= 18; // Outside 09:00 - 18:00
}

