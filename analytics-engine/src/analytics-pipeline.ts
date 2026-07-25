/**
 * Enhanced Analytics Pipeline
 * Orchestrates all AI detection capabilities
 */

import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { detectionSchema } from "./app.js";
import { BaseDetector, type DetectionFrame } from "./detectors/base-detector.js";
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
import { FaceDetector } from "./detectors/face-detector.js";
import { ANPRDetector } from "./detectors/anpr-detector.js";
import { HumanAnalytics } from "./detectors/human-analytics.js";
import { VehicleAnalytics } from "./detectors/vehicle-analytics.js";
import { FaceAnalytics } from "./detectors/face-analytics.js";
import { SafetyAnalytics } from "./detectors/safety-analytics.js";
import { BankingAnalytics } from "./detectors/banking-analytics.js";
import { AISearchEngine } from "./detectors/ai-search-engine.js";
import { AIInvestigationTools } from "./detectors/ai-investigation-tools.js";
import { RetailAnalytics } from "./detectors/retail-analytics.js";
import { AIPredictionEngine } from "./detectors/ai-prediction-engine.js";
import { AIReportingEngine } from "./detectors/ai-reporting-engine.js";
import { AIAssistant } from "./detectors/ai-assistant.js";
import { IndustrialAnalytics } from "./detectors/industrial-analytics.js";
import { SmartCityAnalytics } from "./detectors/smart-city-analytics.js";
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
  private anprDetector: ANPRDetector;
  
  // Advanced analytics modules
  private humanAnalytics: HumanAnalytics;
  private vehicleAnalytics: VehicleAnalytics;
  private faceAnalytics: FaceAnalytics;
  private safetyAnalytics: SafetyAnalytics;
  private bankingAnalytics: BankingAnalytics;
  private aiSearchEngine: AISearchEngine;
  private aiInvestigationTools: AIInvestigationTools;
  private retailAnalytics: RetailAnalytics;
  private aiPredictionEngine: AIPredictionEngine;
  private aiReportingEngine: AIReportingEngine;
  private aiAssistant: AIAssistant;
  
  // Optional niche modules
  private industrialAnalytics?: IndustrialAnalytics;
  private smartCityAnalytics?: SmartCityAnalytics;
  
  private detectors: BaseDetector[];
  private isInitialized = false;

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
    this.helmetDetector = new HelmetDetector();
    this.fallDetector = new FallDetector();
    this.smokeFireDetector = new SmokeFireDetector();
    this.crowdDensityDetector = new CrowdDensityDetector();
    this.tailgatingDetector = new TailgatingDetector();
    this.queueDetector = new QueueDetector();
    this.heatMapGenerator = new HeatMapGenerator();
    this.faceDetector = new FaceDetector();
    this.anprDetector = new ANPRDetector();

    // Initialize advanced analytics modules
    this.humanAnalytics = new HumanAnalytics();
    this.vehicleAnalytics = new VehicleAnalytics();
    this.faceAnalytics = new FaceAnalytics();
    this.safetyAnalytics = new SafetyAnalytics();
    this.bankingAnalytics = new BankingAnalytics();
    this.aiSearchEngine = new AISearchEngine();
    this.aiInvestigationTools = new AIInvestigationTools();
    this.retailAnalytics = new RetailAnalytics();
    this.aiPredictionEngine = new AIPredictionEngine();
    this.aiReportingEngine = new AIReportingEngine();
    this.aiAssistant = new AIAssistant();

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
      // Advanced analytics
      this.humanAnalytics,
      this.vehicleAnalytics,
      this.faceAnalytics,
      this.safetyAnalytics,
      this.bankingAnalytics,
      this.aiSearchEngine,
      this.aiInvestigationTools,
      this.retailAnalytics,
      this.aiPredictionEngine,
      this.aiReportingEngine,
      this.aiAssistant,
    ];
  }

  /**
   * Enable optional niche modules
   */
  enableIndustrialAnalytics(): void {
    if (!this.industrialAnalytics) {
      this.industrialAnalytics = new IndustrialAnalytics();
      this.detectors.push(this.industrialAnalytics);
    }
  }

  enableSmartCityAnalytics(): void {
    if (!this.smartCityAnalytics) {
      this.smartCityAnalytics = new SmartCityAnalytics();
      this.detectors.push(this.smartCityAnalytics);
    }
  }

  async initialize(): Promise<void> {
    console.log("Initializing analytics pipeline...");
    
    // Initialize model manager first
    const modelManager = getModelManager({
      modelsDirectory: process.env.MODELS_DIR || './models',
      maxCacheSize: parseInt(process.env.MODEL_CACHE_SIZE_MB || '2048'),
      enableGPU: process.env.ENABLE_GPU_ACCELERATION === 'true',
      cacheEvictionPolicy: 'lru',
      preloadModels: ['yolov8n', 'deepsort'], // Preload high-priority models
      autoUnloadAfter: 30
    });

    if (!modelManager.isReady()) {
      await modelManager.initialize();
    }
    
    // Initialize detectors
    for (const detector of this.detectors) {
      await detector.initialize();
    }

    this.isInitialized = true;
    console.log("Analytics pipeline initialized successfully");
    
    // Log model manager stats
    const stats = modelManager.getStats();
    console.log(`Models loaded: ${stats.loadedModels}, Memory: ${stats.memoryUsageMB.toFixed(1)}MB`);
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

    // Step 3: Person detection (high priority)
    let persons: any[] = [];
    if (hasMotion || this.needsPersonDetection(rules)) {
      const personResults = await this.personDetector.detect(frame);
      for (const result of personResults) {
        persons = persons.concat(result.objects);
        if (this.matchesAnyRule(result.detectionType, rules)) {
          events.push(this.createEvent(frame, result));
        }
      }
    }

    // Step 4: Vehicle detection
    let vehicles: any[] = [];
    if (hasMotion || this.needsVehicleDetection(rules)) {
      const vehicleResults = await this.vehicleDetector.detect(frame);
      for (const result of vehicleResults) {
        vehicles = vehicles.concat(result.objects);
        if (this.matchesAnyRule(result.detectionType, rules)) {
          events.push(this.createEvent(frame, result));
        }
      }
    }

    // Step 5: Specialized detections (run in parallel when applicable)
    const specializedResults = await Promise.all([
      // Helmet detection (needs persons + vehicles)
      persons.length > 0 || vehicles.length > 0 
        ? this.helmetDetector.detect(frame) 
        : Promise.resolve([]),
      
      // Fall detection (needs persons)
      persons.length > 0 
        ? this.fallDetector.detect(frame) 
        : Promise.resolve([]),
      
      // Smoke & fire detection (always check for safety)
      this.smokeFireDetector.detect(frame),
      
      // Crowd density (needs persons)
      persons.length > 3 
        ? this.crowdDensityDetector.detect(frame) 
        : Promise.resolve([]),
      
      // Tailgating detection (needs persons in zones)
      persons.length > 1 
        ? this.tailgatingDetector.detect(frame) 
        : Promise.resolve([]),
      
      // Queue analysis (needs persons)
      persons.length > 0 
        ? this.queueDetector.detect(frame) 
        : Promise.resolve([]),
      
      // Heat map (always generate for analytics)
      this.heatMapGenerator.detect(frame),

      // Face and plate models are independent and only run when requested.
      this.needsDetection(rules, ["face", "face-recognition", "unknown-person", "watchlist-match", "vip-detection", "blacklist-detection", "mask-detection", "beard-detection", "glasses-detection", "age-estimation", "gender-estimation", "emotion-recognition"])
        ? this.faceDetector.detect(frame)
        : Promise.resolve([]),
      this.needsDetection(rules, ["anpr", "vehicle-reidentification"])
        ? this.anprDetector.detect(frame)
        : Promise.resolve([]),
    ]);

    // Process specialized results
    for (const results of specializedResults) {
      for (const result of results) {
        if (this.matchesAnyRule(result.detectionType, rules) || 
            result.detectionType.includes("metrics") ||
            result.detectionType === "heatmap") {
          events.push(this.createEvent(frame, result));
        }
      }
    }

    // Step 6: Zone-based detection (line crossing, intrusion, loitering)
    const allObjects = [...persons, ...vehicles];
    if (allObjects.length > 0) {
      for (const rule of rules) {
        if (!rule.enabled) continue;
        const zoneEvents = await this.processZoneRule(frame, allObjects, rule);
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
      "line-crossing",
    ];
    return rules.some(r => r.enabled && vehicleTypes.includes(r.detectionType));
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
    };

    for (const detector of this.detectors) {
      const detectorHealth = detector.getHealth();
      health.detectors[(detector as any).detectionType] = detectorHealth;
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
      // Advanced analytics
      human: this.humanAnalytics,
      "vehicle-analytics": this.vehicleAnalytics,
      face: this.faceAnalytics,
      safety: this.safetyAnalytics,
      banking: this.bankingAnalytics,
      search: this.aiSearchEngine,
      investigation: this.aiInvestigationTools,
      retail: this.retailAnalytics,
      prediction: this.aiPredictionEngine,
      reporting: this.aiReportingEngine,
      assistant: this.aiAssistant,
      industrial: this.industrialAnalytics,
      "smart-city": this.smartCityAnalytics,
    };
    
    return detectorMap[type];
  }

  // ============================================================================
  // Advanced Analytics Module Accessors
  // ============================================================================

  /**
   * Get Human Analytics module
   */
  getHumanAnalytics(): HumanAnalytics {
    return this.humanAnalytics;
  }

  /**
   * Get Vehicle Analytics module
   */
  getVehicleAnalytics(): VehicleAnalytics {
    return this.vehicleAnalytics;
  }

  /**
   * Get Face Analytics module
   */
  getFaceAnalytics(): FaceAnalytics {
    return this.faceAnalytics;
  }

  /**
   * Get Safety Analytics module
   */
  getSafetyAnalytics(): SafetyAnalytics {
    return this.safetyAnalytics;
  }

  /**
   * Get Banking Analytics module
   */
  getBankingAnalytics(): BankingAnalytics {
    return this.bankingAnalytics;
  }

  /**
   * Get AI Search Engine
   */
  getAISearchEngine(): AISearchEngine {
    return this.aiSearchEngine;
  }

  /**
   * Get AI Investigation Tools
   */
  getAIInvestigationTools(): AIInvestigationTools {
    return this.aiInvestigationTools;
  }

  /**
   * Get Retail Analytics module
   */
  getRetailAnalytics(): RetailAnalytics {
    return this.retailAnalytics;
  }

  /**
   * Get AI Prediction Engine
   */
  getAIPredictionEngine(): AIPredictionEngine {
    return this.aiPredictionEngine;
  }

  /**
   * Get AI Reporting Engine
   */
  getAIReportingEngine(): AIReportingEngine {
    return this.aiReportingEngine;
  }

  /**
   * Get AI Assistant
   */
  getAIAssistant(): AIAssistant {
    return this.aiAssistant;
  }

  /**
   * Get Industrial Analytics module (if enabled)
   */
  getIndustrialAnalytics(): IndustrialAnalytics | undefined {
    return this.industrialAnalytics;
  }

  /**
   * Get Smart City Analytics module (if enabled)
   */
  getSmartCityAnalytics(): SmartCityAnalytics | undefined {
    return this.smartCityAnalytics;
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
   * Get memory usage report
   */
  getMemoryReport() {
    const modelManager = getModelManager();
    return modelManager.getMemoryReport();
  }
}
