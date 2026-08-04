/**
 * Enhanced Analytics Pipeline
 * Orchestrates all AI detection capabilities
 */

import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { detectionSchema } from "./app.js";
import { BaseDetector, hasInferenceObjects, type DetectionFrame, type DetectedObject, type InferenceObject } from "./detectors/base-detector.js";
import { CameraHealthDetector } from "./detectors/camera-health-detector.js";
import { MotionDetector } from "./detectors/motion-detector.js";
import { ObjectDetector } from "./detectors/object-detector.js";
import { ZoneDetector } from "./detectors/zone-detector.js";
import { PersonDetector } from "./detectors/person-detector.js";
import { VehicleDetector } from "./detectors/vehicle-detector.js";
import { HelmetDetector } from "./detectors/helmet-detector.js";
import { FallDetector } from "./detectors/fall-detector.js";
import { SmokeFireDetector } from "./detectors/smoke-fire-detector.js";
import { CrowdDensityDetector } from "./detectors/crowd-density-detector.js";
import { TailgatingDetector } from "./detectors/tailgating-detector.js";
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
import { getModelManager } from "./model-manager.js";

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
  
  // Enhanced detectors
  private personDetector: PersonDetector;
  private vehicleDetector: VehicleDetector;
  private helmetDetector: HelmetDetector;
  private fallDetector: FallDetector;
  private smokeFireDetector: SmokeFireDetector;
  private crowdDensityDetector: CrowdDensityDetector;
  private tailgatingDetector: TailgatingDetector;
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

  // Rule cache per camera
  private rulesCache = new Map<string, AnalyticsRule[]>();
  private rulesCacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds

  constructor() {
    // Initialize core detectors
    this.motionDetector = new MotionDetector();
    this.objectDetector = new ObjectDetector();
    this.zoneDetector = new ZoneDetector();
    this.healthDetector = new CameraHealthDetector();
    
    // Initialize enhanced detectors
    this.personDetector = new PersonDetector();
    this.vehicleDetector = new VehicleDetector();
    this.helmetDetector = new HelmetDetector(null, environmentProbability("HELMET_CONFIDENCE_THRESHOLD", 0.7));
    this.fallDetector = new FallDetector();
    this.smokeFireDetector = new SmokeFireDetector(null, environmentProbability("FIRE_CONFIDENCE_THRESHOLD", 0.65));
    this.crowdDensityDetector = new CrowdDensityDetector();
    this.tailgatingDetector = new TailgatingDetector();
    this.queueDetector = new QueueDetector();
    this.heatMapGenerator = new HeatMapGenerator();
    this.faceDetector = new FaceDetector({
      detectionConfidence: environmentProbability("FACE_CONFIDENCE_THRESHOLD", 0.75),
      recognitionEnabled: process.env.FACE_RECOGNITION_ENABLED === "true",
    });
    this.faceAnalytics = new FaceAnalyticsDetector();
    this.anprDetector = new ANPRDetector({
      plateConfidence: environmentProbability("ANPR_PLATE_CONFIDENCE_THRESHOLD", 0.7),
      ocrConfidence: environmentProbability("ANPR_CONFIDENCE_THRESHOLD", 0.8),
      countryCode: process.env.ANPR_COUNTRY_CODE || "IN",
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
      this.personDetector,
      this.vehicleDetector,
      this.helmetDetector,
      this.fallDetector,
      this.smokeFireDetector,
      this.crowdDensityDetector,
      this.tailgatingDetector,
      this.queueDetector,
      this.heatMapGenerator,
      this.faceDetector,
      this.anprDetector,
      this.analogVideoQualityDetector,
      this.cameraAgingDetector,
      this.cameraTypeClassifier,
      this.dvrChannelHealthDetector,
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
   * Process a single frame through the enhanced detection pipeline
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

    // Step 1: Camera health check (always run)
    const healthResults = await this.healthDetector.detect(frame);
    for (const result of healthResults) {
      if (this.matchesAnyRule(result.detectionType, rules)) {
        events.push(this.createEvent(frame, result));
      }
    }

    // Step 2: Motion detection (first stage trigger for optimization)
    const motionResults = await this.motionDetector.detect(frame);
    const hasMotion = motionResults.length > 0;

    // Step 3: Run exactly one generic-object inference pass. The normalized
    // objects are supplied to the tracking and rule detectors below, avoiding
    // duplicate ONNX execution for person and vehicle detection.
    const shouldDetectObjects = hasMotion || this.needsObjectDetection(rules);
    let inferenceFrame = frame;
    if (shouldDetectObjects) {
      const objectResults = await this.objectDetector.detect(frame);
      const objects = objectResults.flatMap((result) => result.objects) as InferenceObject[];
      inferenceFrame = this.withDetections(
        frame,
        objects,
        localInferenceRequested ? "local-onnx" : "normalized-observation",
      );
      for (const result of objectResults) {
        if (this.matchesAnyRule(result.detectionType, rules)) {
          events.push(this.createEvent(frame, result));
        }
      }
    }

    // Step 4: Person detection and tracking (high priority)
    let persons: any[] = [];
    if (hasMotion || this.needsPersonDetection(rules)) {
      const personResults = await this.personDetector.detect(inferenceFrame);
      for (const result of personResults) {
        persons = persons.concat(result.objects);
        if (this.matchesAnyRule(result.detectionType, rules)) {
          events.push(this.createEvent(frame, result));
        }
      }
    }

    // Step 5: Vehicle detection and tracking
    let vehicles: any[] = [];
    if (hasMotion || this.needsVehicleDetection(rules)) {
      const vehicleResults = await this.vehicleDetector.detect(inferenceFrame);
      for (const result of vehicleResults) {
        vehicles = vehicles.concat(result.objects);
        if (this.matchesAnyRule(result.detectionType, rules)) {
          events.push(this.createEvent(frame, result));
        }
      }
    }

    // Preserve the track IDs assigned above for temporal specialised detectors
    // (fall, queue and tailgating) without discarding the remaining objects.
    const trackedFrame = this.withTrackedObjects(inferenceFrame, persons, vehicles);

    // Step 6: Specialized detections (run in parallel when applicable)
    const specializedResults = await Promise.all([
      // Helmet detection (needs persons + vehicles)
      persons.length > 0 || vehicles.length > 0
        ? this.helmetDetector.detect(trackedFrame)
        : Promise.resolve([]),
      
      // Fall detection (needs persons)
      persons.length > 0
        ? this.fallDetector.detect(trackedFrame)
        : Promise.resolve([]),
      
      // Smoke & fire detection (always check for safety)
      this.smokeFireDetector.detect(trackedFrame),
      
      // Crowd density (needs persons)
      persons.length > 3
        ? this.crowdDensityDetector.detect(trackedFrame)
        : Promise.resolve([]),
      
      // Tailgating detection (needs persons in zones)
      persons.length > 1
        ? this.tailgatingDetector.detect(trackedFrame)
        : Promise.resolve([]),
      
      // Queue analysis (needs persons)
      persons.length > 0
        ? this.queueDetector.detect(trackedFrame)
        : Promise.resolve([]),
      
      // Heat map (always generate for analytics)
      this.heatMapGenerator.detect(trackedFrame),

      // Face and plate models are independent and only run when requested.
      this.needsDetection(rules, ["face", "face-recognition", "unknown-person", "watchlist-match", "vip-detection", "blacklist-detection", "mask-detection", "beard-detection", "glasses-detection", "age-estimation", "gender-estimation", "emotion-recognition"])
        ? this.faceDetector.detect(trackedFrame)
        : Promise.resolve([]),
      this.needsDetection(rules, ["anpr", "vehicle-reidentification"])
        ? this.anprDetector.detect(trackedFrame)
        : Promise.resolve([]),
    ]);

    // Process specialized results
    for (const results of specializedResults) {
      for (const result of results) {
        if (this.matchesAnyRule(result.detectionType, rules)) {
          events.push(this.createEvent(frame, result));
        }
      }
    }

    // Step 6: Zone-based detection (line crossing, intrusion, loitering)
    const allObjects = [...persons, ...vehicles];
    if (allObjects.length > 0) {
      for (const rule of rules) {
        if (!rule.enabled) continue;
        const zoneEvents = await this.processZoneRule(trackedFrame, allObjects, rule);
        events.push(...zoneEvents);
      }
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
      events.push(this.createEvent(frame, result));
    }

    return events;
  }

  /**
   * Create detection event
   */
  private createEvent(
    frame: DetectionFrame,
    result: any,
  ): z.infer<typeof detectionSchema> {
    return {
      tenantId: frame.tenantId,
      cameraId: frame.cameraId,
      sourceEventId: randomUUID(),
      detectionType: result.detectionType,
      occurredAt: frame.timestamp.toISOString(),
      confidence: result.confidence,
      durationSeconds: 0,
      modelVersion: "1.0.0",
      objects: result.objects.map((obj: any) => ({
        label: obj.label,
        confidence: obj.confidence,
        trackId: obj.trackId,
        boundingBox: obj.boundingBox,
      })),
      metadata: result.metadata ?? {},
    };
  }

  /**
   * Check if any rule matches the detection type
   */
  private matchesAnyRule(detectionType: string, rules: AnalyticsRule[]): boolean {
    return rules.some(
      (rule) => rule.enabled && rule.detectionType === detectionType,
    );
  }

  /**
   * Determine if person detection should run
   */
  private needsPersonDetection(rules: AnalyticsRule[]): boolean {
    const personTypes = [
      "person",
      "fall",
      "crowd-density",
      "tailgating",
      "queue",
      "helmet",
      "no-helmet",
      "loitering",
      "intrusion",
      "line-crossing",
    ];
    return rules.some(r => r.enabled && personTypes.includes(r.detectionType));
  }

  /**
   * Determine if vehicle detection should run
   */
  private needsVehicleDetection(rules: AnalyticsRule[]): boolean {
    const vehicleTypes = [
      "vehicle",
      "helmet",
      "no-helmet",
      "line-crossing",
    ];
    return rules.some(r => r.enabled && vehicleTypes.includes(r.detectionType));
  }

  private needsObjectDetection(rules: AnalyticsRule[]): boolean {
    return this.needsDetection(rules, [
      "object", "person", "vehicle", "helmet", "no-helmet", "fall", "fire", "smoke",
      "crowd-density", "tailgating", "queue", "loitering", "intrusion", "line-crossing",
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
    return rules.some((rule) => rule.enabled && types.includes(rule.detectionType));
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
      "intrusion",
      "loitering",
      "crowd-density",
      "fire-smoke",
      "helmet",
      "fall",
      "tailgating",
      "queue",
    ];

    return rules.some(
      (rule) =>
        rule.enabled && objectBasedTypes.includes(rule.detectionType),
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
    };

    for (const detector of this.detectors) {
      const detectorHealth = detector.getHealth();
      health.detectors[(detector as any).detectionType] = detectorHealth;
    }

    // These modules are retained for their configuration/API contracts, but
    // are intentionally not started by the frame pipeline until an explicit
    // model-backed implementation is provisioned. Reporting them here avoids
    // the former false-positive "healthy" status for placeholder modules.
    for (const [name, details] of Object.entries({
      "face-analytics": "Not started: provision RetinaFace/ArcFace model runtime before enabling.",
      "human-analytics": "Not started: provision pose and Re-ID model runtimes before enabling.",
      "vehicle-analytics": "Not started: provision plate/OCR and vehicle Re-ID model runtimes before enabling.",
      safety: "Not started: provision PPE and hazard model runtimes before enabling.",
      banking: "Not started: requires configured banking analytics models and zones.",
      retail: "Not started: requires configured retail analytics models and zones.",
      "ai-search-engine": "Not started: requires a configured embedding model and vector store.",
      investigation: "Not started: requires configured investigation data sources.",
      prediction: "Not started: requires configured historical-data model.",
      reporting: "Not started: requires configured reporting data sources.",
      assistant: "Not started: requires configured assistant model/runtime.",
      industrial: "Not started: enable explicitly after provisioning industrial models.",
      "smart-city": "Not started: enable explicitly after provisioning smart-city models.",
    })) {
      health.detectors[name] = { status: "unhealthy", details };
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
