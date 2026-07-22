/**
 * Analytics Pipeline
 * Orchestrates detectors and processes frames
 */

import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { detectionSchema } from "./app.js";
import { BaseDetector, type DetectionFrame } from "./detectors/base-detector.js";
import { CameraHealthDetector } from "./detectors/camera-health-detector.js";
import { MotionDetector } from "./detectors/motion-detector.js";
import { ObjectDetector } from "./detectors/object-detector.js";
import { ZoneDetector } from "./detectors/zone-detector.js";

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
  private motionDetector: MotionDetector;
  private objectDetector: ObjectDetector;
  private zoneDetector: ZoneDetector;
  private healthDetector: CameraHealthDetector;
  private detectors: BaseDetector[];
  private isInitialized = false;

  // Rule cache per camera
  private rulesCache = new Map<string, AnalyticsRule[]>();
  private rulesCacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds

  constructor() {
    this.motionDetector = new MotionDetector();
    this.objectDetector = new ObjectDetector();
    this.zoneDetector = new ZoneDetector();
    this.healthDetector = new CameraHealthDetector();

    this.detectors = [
      this.motionDetector,
      this.objectDetector,
      this.zoneDetector,
      this.healthDetector,
    ];
  }

  async initialize(): Promise<void> {
    console.log("Initializing analytics pipeline...");
    
    for (const detector of this.detectors) {
      await detector.initialize();
    }

    this.isInitialized = true;
    console.log("Analytics pipeline initialized successfully");
  }

  /**
   * Process a single frame through the detection pipeline
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

    // Step 2: Motion detection (first stage trigger)
    const motionResults = await this.motionDetector.detect(frame);
    const hasMotion = motionResults.length > 0;

    // Step 3: Object detection (only if motion detected or forced)
    let objects: any[] = [];
    if (hasMotion || this.shouldRunObjectDetection(rules)) {
      const objectResults = await this.objectDetector.detect(frame);
      
      for (const result of objectResults) {
        objects = objects.concat(result.objects);
        
        if (this.matchesAnyRule(result.detectionType, rules)) {
          events.push(this.createEvent(frame, result));
        }
      }
    }

    // Step 4: Zone-based detection (line crossing, intrusion, loitering)
    if (objects.length > 0) {
      for (const rule of rules) {
        if (!rule.enabled) continue;

        const zoneEvents = await this.processZoneRule(frame, objects, rule);
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
}
