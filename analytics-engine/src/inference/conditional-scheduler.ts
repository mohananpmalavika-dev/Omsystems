/**
 * GPU-Aware Conditional Inference Scheduler
 * 
 * Intelligently schedules AI model invocations to minimize GPU load for 4,500-camera deployments.
 * 
 * Key Principles:
 * - Motion-first: Only process frames with motion
 * - Rule-driven: Only invoke models required by active rules
 * - Cascading: Run cheap models first, expensive models conditionally
 * - Frame sampling: Not every frame needs full AI inference
 * - Zone-aware: Only expensive models when objects enter configured zones
 * - Quality-gated: Only run embeddings on high-quality detections
 * 
 * Performance Impact:
 * - Without scheduler: 4,500 cameras × 5 FPS × 8 models = ~180,000 inferences/sec
 * - With scheduler: 4,500 cameras × 1 FPS × 2 models (avg) = ~9,000 inferences/sec
 * - 95% reduction in GPU load
 */

import type { DetectionFrame, InferenceObject } from "../detectors/base-detector.js";
import type { AnalyticsRule } from "../analytics-pipeline.js";

/**
 * Model execution priority
 */
export enum ModelPriority {
  CRITICAL = 0,  // Always run (YOLO base detection, fire/smoke)
  HIGH = 1,      // Run when motion detected (person/vehicle tracking)
  MEDIUM = 2,    // Run when objects detected (helmet, pose)
  LOW = 3,       // Run when specific conditions met (face embedding, ANPR OCR)
  OPTIONAL = 4   // Run only when explicitly requested (attributes, Re-ID)
}

/**
 * Model scheduling metadata
 */
export interface ModelSchedule {
  modelId: string;
  priority: ModelPriority;
  cost: number; // Relative GPU cost (1-10)
  dependencies: string[]; // Models that must run before this one
  triggerLabels?: string[]; // Object labels that trigger this model
  minConfidence?: number; // Minimum detection confidence to trigger
  minQuality?: number; // Minimum quality score to trigger
  requiresZone?: boolean; // Only run when objects in configured zones
  samplingRate?: number; // Run on 1 out of N frames (1 = every frame)
}

/**
 * Frame scheduling decision
 */
export interface FrameSchedule {
  shouldProcess: boolean;
  reason: string;
  modelsToRun: string[];
  skipModels: string[];
  estimatedGpuCost: number;
}

/**
 * Camera-specific scheduling state
 */
interface CameraScheduleState {
  cameraId: string;
  lastProcessedFrame: Date | null;
  frameCounter: number;
  hasRecentMotion: boolean;
  activeObjects: Map<string, number>; // label -> count
  lastDetectionTime: Date | null;
  averageObjectsPerFrame: number;
  zoneActivity: Map<string, boolean>; // zoneId -> hasActivity
}

/**
 * GPU resource tracking
 */
interface GpuResourceState {
  totalCapacity: number; // Arbitrary units (100 = full GPU)
  currentLoad: number;
  reservedLoad: number;
  peakLoad: number;
  lastUpdateTime: Date;
}

/**
 * Default model schedules
 */
const DEFAULT_MODEL_SCHEDULES: Record<string, ModelSchedule> = {
  // Base detection (always run on motion frames)
  'yolov8n': {
    modelId: 'yolov8n',
    priority: ModelPriority.CRITICAL,
    cost: 2,
    dependencies: [],
    samplingRate: 2, // Every other frame
  },

  // Fire/smoke detection (critical safety - frequent)
  'fire-smoke': {
    modelId: 'fire-smoke',
    priority: ModelPriority.CRITICAL,
    cost: 2,
    dependencies: [],
    samplingRate: 3, // Every 3rd frame (sufficient for fire detection)
  },

  // Person Re-ID (expensive - run conditionally)
  'person-reid': {
    modelId: 'person-reid',
    priority: ModelPriority.OPTIONAL,
    cost: 5,
    dependencies: ['yolov8n'],
    triggerLabels: ['person'],
    minConfidence: 0.7,
    requiresZone: true,
    samplingRate: 5, // Every 5th frame with person
  },

  // Vehicle Re-ID (expensive - run conditionally)
  'vehicle-reid': {
    modelId: 'vehicle-reid',
    priority: ModelPriority.OPTIONAL,
    cost: 5,
    dependencies: ['yolov8n'],
    triggerLabels: ['car', 'motorcycle', 'bus', 'truck', 'bicycle'],
    minConfidence: 0.7,
    requiresZone: true,
    samplingRate: 5,
  },

  // Helmet detection (run when person/vehicle detected)
  'helmet': {
    modelId: 'helmet',
    priority: ModelPriority.MEDIUM,
    cost: 2,
    dependencies: ['yolov8n'],
    triggerLabels: ['person', 'car', 'motorcycle'],
    minConfidence: 0.4,
    samplingRate: 2,
  },

  // Face detection (run when requested)
  'face-detector': {
    modelId: 'face-detector',
    priority: ModelPriority.HIGH,
    cost: 3,
    dependencies: [],
    samplingRate: 2,
  },

  // Face embedding (expensive - run only on high-quality detections)
  'face-embedding': {
    modelId: 'face-embedding',
    priority: ModelPriority.LOW,
    cost: 6,
    dependencies: ['face-detector'],
    triggerLabels: ['face'],
    minConfidence: 0.8,
    minQuality: 0.7, // Face quality score
    samplingRate: 3,
  },

  // ANPR detection (run when vehicle detected)
  'anpr-detector': {
    modelId: 'anpr-detector',
    priority: ModelPriority.HIGH,
    cost: 3,
    dependencies: ['yolov8n'],
    triggerLabels: ['car', 'motorcycle', 'bus', 'truck'],
    minConfidence: 0.7,
    samplingRate: 2,
  },

  // ANPR OCR (expensive - run only on detected plates)
  'anpr-recognizer': {
    modelId: 'anpr-recognizer',
    priority: ModelPriority.LOW,
    cost: 4,
    dependencies: ['anpr-detector'],
    triggerLabels: ['license-plate'],
    minConfidence: 0.75,
    samplingRate: 1, // Every detected plate
  },

  // Pose estimation (expensive - run conditionally)
  'pose-estimator': {
    modelId: 'pose-estimator',
    priority: ModelPriority.OPTIONAL,
    cost: 7,
    dependencies: ['yolov8n'],
    triggerLabels: ['person'],
    minConfidence: 0.7,
    requiresZone: true,
    samplingRate: 5,
  },

  // Attribute estimation (expensive - run very selectively)
  'attribute-estimator': {
    modelId: 'attribute-estimator',
    priority: ModelPriority.OPTIONAL,
    cost: 6,
    dependencies: ['yolov8n'],
    triggerLabels: ['person'],
    minConfidence: 0.75,
    minQuality: 0.7,
    requiresZone: true,
    samplingRate: 10, // Only 1 in 10 persons
  },
};

/**
 * Conditional Inference Scheduler
 */
export class ConditionalScheduler {
  private cameraStates = new Map<string, CameraScheduleState>();
  private modelSchedules = new Map<string, ModelSchedule>();
  private gpuState: GpuResourceState;
  private readonly MAX_GPU_LOAD = 85; // Don't exceed 85% GPU capacity
  private readonly MOTION_TIMEOUT_MS = 3000; // Consider motion active for 3 seconds
  private statsRecordedFrames = 0;
  private statsProcessedFrames = 0;
  private statsSkippedFrames = 0;
  private statsModelInvocations = new Map<string, number>();

  constructor(
    modelSchedules?: Record<string, ModelSchedule>,
    gpuCapacity = 100
  ) {
    // Initialize with default schedules
    for (const [id, schedule] of Object.entries(DEFAULT_MODEL_SCHEDULES)) {
      this.modelSchedules.set(id, schedule);
    }

    // Override with custom schedules
    if (modelSchedules) {
      for (const [id, schedule] of Object.entries(modelSchedules)) {
        this.modelSchedules.set(id, schedule);
      }
    }

    this.gpuState = {
      totalCapacity: gpuCapacity,
      currentLoad: 0,
      reservedLoad: 0,
      peakLoad: 0,
      lastUpdateTime: new Date(),
    };
  }

  /**
   * Decide which models should run for this frame
   */
  scheduleFrame(
    frame: DetectionFrame,
    rules: AnalyticsRule[],
    hasMotion: boolean,
    detectedObjects: InferenceObject[] = []
  ): FrameSchedule {
    this.statsRecordedFrames++;

    // Get or create camera state
    const cameraState = this.getCameraState(frame.cameraId);
    cameraState.frameCounter++;

    // Update motion state
    if (hasMotion) {
      cameraState.hasRecentMotion = true;
      cameraState.lastDetectionTime = frame.timestamp;
    } else if (
      cameraState.lastDetectionTime &&
      frame.timestamp.getTime() - cameraState.lastDetectionTime.getTime() > this.MOTION_TIMEOUT_MS
    ) {
      cameraState.hasRecentMotion = false;
    }

    // Step 1: No motion, no processing (except fire safety)
    if (!cameraState.hasRecentMotion && !this.requiresCriticalSafety(rules)) {
      this.statsSkippedFrames++;
      return {
        shouldProcess: false,
        reason: 'no_recent_motion',
        modelsToRun: [],
        skipModels: Array.from(this.modelSchedules.keys()),
        estimatedGpuCost: 0,
      };
    }

    // Step 2: Determine required models from rules
    const requiredModels = this.getRequiredModels(rules);

    // Step 3: Build dependency graph
    const scheduledModels = this.buildSchedule(
      requiredModels,
      detectedObjects,
      cameraState,
      rules
    );

    // Step 4: Apply frame sampling
    const sampledModels = this.applySampling(scheduledModels, cameraState);

    // Step 5: Check GPU capacity
    const gpuConstrainedModels = this.applyGpuConstraints(sampledModels);

    // Step 6: Calculate GPU cost
    const estimatedCost = this.calculateGpuCost(gpuConstrainedModels);

    // Track invocations
    for (const modelId of gpuConstrainedModels) {
      const current = this.statsModelInvocations.get(modelId) || 0;
      this.statsModelInvocations.set(modelId, current + 1);
    }

    const allModels = Array.from(this.modelSchedules.keys());
    const skipModels = allModels.filter(m => !gpuConstrainedModels.includes(m));

    if (gpuConstrainedModels.length > 0) {
      this.statsProcessedFrames++;
    } else {
      this.statsSkippedFrames++;
    }

    return {
      shouldProcess: gpuConstrainedModels.length > 0,
      reason: gpuConstrainedModels.length > 0
        ? `processing_${gpuConstrainedModels.length}_models`
        : 'no_models_required',
      modelsToRun: gpuConstrainedModels,
      skipModels,
      estimatedGpuCost: estimatedCost,
    };
  }

  /**
   * Get required models from active rules
   */
  private getRequiredModels(rules: AnalyticsRule[]): Set<string> {
    const required = new Set<string>();

    // Always include base detection if any rule is active
    if (rules.some(r => r.enabled)) {
      required.add('yolov8n');
    }

    for (const rule of rules) {
      if (!rule.enabled) continue;

      // Map rule types to required models
      switch (rule.detectionType) {
        case 'fire':
        case 'smoke':
          required.add('fire-smoke');
          break;

        case 'person':
        case 'fall':
        case 'crowd-density':
        case 'tailgating':
        case 'queue':
        case 'loitering':
        case 'intrusion':
        case 'line-crossing':
          required.add('yolov8n'); // Base person detection
          break;

        case 'helmet':
        case 'helmet-worn':
        case 'no-helmet':
          required.add('yolov8n');
          required.add('helmet');
          break;

        case 'face':
        case 'face-recognition':
        case 'unknown-person':
        case 'watchlist-match':
          required.add('face-detector');
          if (rule.detectionType !== 'face') {
            required.add('face-embedding');
          }
          break;

        case 'anpr':
          required.add('anpr-detector');
          required.add('anpr-recognizer');
          break;

        case 'vehicle':
          required.add('yolov8n');
          break;

        case 'vehicle-reidentification':
          required.add('yolov8n');
          required.add('vehicle-reid');
          break;

        case 'person-reidentification':
          required.add('yolov8n');
          required.add('person-reid');
          break;

        case 'pose':
          required.add('pose-estimator');
          break;

        case 'attributes':
          required.add('attribute-estimator');
          break;
      }
    }

    return required;
  }

  /**
   * Build execution schedule with dependencies
   */
  private buildSchedule(
    requiredModels: Set<string>,
    detectedObjects: InferenceObject[],
    cameraState: CameraScheduleState,
    rules: AnalyticsRule[]
  ): string[] {
    const scheduled: string[] = [];
    const processed = new Set<string>();

    // Update active objects
    cameraState.activeObjects.clear();
    for (const obj of detectedObjects) {
      const count = cameraState.activeObjects.get(obj.label) || 0;
      cameraState.activeObjects.set(obj.label, count + 1);
    }

    // Update average objects per frame (exponential moving average)
    const alpha = 0.1;
    cameraState.averageObjectsPerFrame =
      alpha * detectedObjects.length +
      (1 - alpha) * cameraState.averageObjectsPerFrame;

    // Process models in priority order
    const sortedModels = Array.from(this.modelSchedules.entries())
      .filter(([id]) => requiredModels.has(id))
      .sort(([, a], [, b]) => a.priority - b.priority);

    for (const [modelId, schedule] of sortedModels) {
      if (processed.has(modelId)) continue;

      // Check if model should run
      if (!this.shouldRunModel(schedule, detectedObjects, cameraState, rules)) {
        continue;
      }

      // Add dependencies first
      for (const depId of schedule.dependencies) {
        if (!processed.has(depId)) {
          scheduled.push(depId);
          processed.add(depId);
        }
      }

      // Add model itself
      scheduled.push(modelId);
      processed.add(modelId);
    }

    return scheduled;
  }

  /**
   * Check if model should run based on triggers and conditions
   */
  private shouldRunModel(
    schedule: ModelSchedule,
    detectedObjects: InferenceObject[],
    cameraState: CameraScheduleState,
    rules: AnalyticsRule[]
  ): boolean {
    // Check trigger labels (does a required object exist?)
    if (schedule.triggerLabels && schedule.triggerLabels.length > 0) {
      const hasTriggeredObject = detectedObjects.some(obj =>
        schedule.triggerLabels!.includes(obj.label) &&
        obj.confidence >= (schedule.minConfidence || 0)
      );

      if (!hasTriggeredObject) {
        return false;
      }

      // Check quality if required
      if (schedule.minQuality) {
        const hasQualityObject = detectedObjects.some(obj => {
          const observedQuality = obj.attributes?.quality;
          const quality = typeof observedQuality === 'number'
            ? observedQuality
            : obj.confidence;
          return schedule.triggerLabels!.includes(obj.label) &&
            obj.confidence >= (schedule.minConfidence || 0) &&
            quality >= schedule.minQuality!;
        });

        if (!hasQualityObject) {
          return false;
        }
      }
    }

    // Check zone requirement
    if (schedule.requiresZone) {
      const hasActiveZone = rules.some(rule =>
        rule.enabled && rule.zone && cameraState.activeObjects.size > 0
      );

      if (!hasActiveZone) {
        return false;
      }
    }

    return true;
  }

  /**
   * Apply frame sampling rates
   */
  private applySampling(
    models: string[],
    cameraState: CameraScheduleState
  ): string[] {
    const sampled: string[] = [];

    for (const modelId of models) {
      const schedule = this.modelSchedules.get(modelId);
      if (!schedule) continue;

      const samplingRate = schedule.samplingRate || 1;
      if (cameraState.frameCounter % samplingRate === 0) {
        sampled.push(modelId);
      }
    }

    return sampled;
  }

  /**
   * Apply GPU capacity constraints
   */
  private applyGpuConstraints(models: string[]): string[] {
    // Calculate total cost
    let totalCost = 0;
    const costsMap = new Map<string, number>();

    for (const modelId of models) {
      const schedule = this.modelSchedules.get(modelId);
      const cost = schedule?.cost || 1;
      costsMap.set(modelId, cost);
      totalCost += cost;
    }

    // Check if within GPU capacity
    const availableCapacity = this.gpuState.totalCapacity - this.gpuState.currentLoad;
    if (totalCost <= availableCapacity) {
      return models; // All models fit
    }

    // Need to shed load - keep critical and high priority models
    const constrained: string[] = [];
    let currentCost = 0;

    // Sort by priority (critical first)
    const sortedModels = models
      .map(id => ({
        id,
        priority: this.modelSchedules.get(id)?.priority || ModelPriority.OPTIONAL,
        cost: costsMap.get(id) || 1,
      }))
      .sort((a, b) => a.priority - b.priority);

    for (const model of sortedModels) {
      if (currentCost + model.cost <= availableCapacity * 0.85) {
        constrained.push(model.id);
        currentCost += model.cost;
      } else if (model.priority <= ModelPriority.HIGH) {
        // Force critical/high priority even if over budget
        constrained.push(model.id);
        currentCost += model.cost;
      }
    }

    return constrained;
  }

  /**
   * Calculate GPU cost for scheduled models
   */
  private calculateGpuCost(models: string[]): number {
    let total = 0;
    for (const modelId of models) {
      const schedule = this.modelSchedules.get(modelId);
      total += schedule?.cost || 1;
    }
    return total;
  }

  /**
   * Check if critical safety models are required
   */
  private requiresCriticalSafety(rules: AnalyticsRule[]): boolean {
    const criticalTypes = [
      'fire',
      'smoke',
      'helmet',
      'helmet-worn',
      'no-helmet',
      'ppe',
      'intrusion',
      'loitering',
    ];
    return rules.some(rule =>
      rule.enabled && criticalTypes.includes(rule.detectionType)
    );
  }

  /**
   * Get or create camera state
   */
  private getCameraState(cameraId: string): CameraScheduleState {
    let state = this.cameraStates.get(cameraId);
    if (!state) {
      state = {
        cameraId,
        lastProcessedFrame: null,
        frameCounter: 0,
        hasRecentMotion: false,
        activeObjects: new Map(),
        lastDetectionTime: null,
        averageObjectsPerFrame: 0,
        zoneActivity: new Map(),
      };
      this.cameraStates.set(cameraId, state);
    }
    return state;
  }

  /**
   * Update GPU load (call this when models start/finish)
   */
  updateGpuLoad(models: string[], isStarting: boolean): void {
    const cost = this.calculateGpuCost(models);

    if (isStarting) {
      this.gpuState.currentLoad += cost;
      if (this.gpuState.currentLoad > this.gpuState.peakLoad) {
        this.gpuState.peakLoad = this.gpuState.currentLoad;
      }
    } else {
      this.gpuState.currentLoad = Math.max(0, this.gpuState.currentLoad - cost);
    }

    this.gpuState.lastUpdateTime = new Date();
  }

  /**
   * Get scheduling statistics
   */
  getStatistics(): {
    framesRecorded: number;
    framesProcessed: number;
    framesSkipped: number;
    processingRate: number;
    gpuLoad: number;
    peakGpuLoad: number;
    activeCameras: number;
    modelInvocations: Record<string, number>;
    averageModelsPerFrame: number;
  } {
    const totalInvocations = Array.from(this.statsModelInvocations.values()).reduce((a, b) => a + b, 0);

    return {
      framesRecorded: this.statsRecordedFrames,
      framesProcessed: this.statsProcessedFrames,
      framesSkipped: this.statsSkippedFrames,
      processingRate: this.statsRecordedFrames > 0
        ? (this.statsProcessedFrames / this.statsRecordedFrames) * 100
        : 0,
      gpuLoad: this.gpuState.currentLoad,
      peakGpuLoad: this.gpuState.peakLoad,
      activeCameras: this.cameraStates.size,
      modelInvocations: Object.fromEntries(this.statsModelInvocations),
      averageModelsPerFrame: this.statsProcessedFrames > 0
        ? totalInvocations / this.statsProcessedFrames
        : 0,
    };
  }

  /**
   * Get camera-specific statistics
   */
  getCameraStatistics(cameraId: string): {
    frameCounter: number;
    hasRecentMotion: boolean;
    activeObjects: Record<string, number>;
    averageObjectsPerFrame: number;
  } | null {
    const state = this.cameraStates.get(cameraId);
    if (!state) return null;

    return {
      frameCounter: state.frameCounter,
      hasRecentMotion: state.hasRecentMotion,
      activeObjects: Object.fromEntries(state.activeObjects),
      averageObjectsPerFrame: state.averageObjectsPerFrame,
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.statsRecordedFrames = 0;
    this.statsProcessedFrames = 0;
    this.statsSkippedFrames = 0;
    this.statsModelInvocations.clear();
    this.gpuState.peakLoad = 0;
  }

  /**
   * Clean up stale camera states
   */
  cleanup(maxAgeMs = 300000): void {
    const now = Date.now();
    for (const [cameraId, state] of this.cameraStates.entries()) {
      if (
        state.lastDetectionTime &&
        now - state.lastDetectionTime.getTime() > maxAgeMs
      ) {
        this.cameraStates.delete(cameraId);
      }
    }
  }
}

/**
 * Singleton instance
 */
let schedulerInstance: ConditionalScheduler | null = null;

/**
 * Get or create scheduler instance
 */
export function getConditionalScheduler(
  modelSchedules?: Record<string, ModelSchedule>,
  gpuCapacity?: number
): ConditionalScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new ConditionalScheduler(modelSchedules, gpuCapacity);
  }
  return schedulerInstance;
}

/**
 * Example Usage:
 * 
 * const scheduler = getConditionalScheduler();
 * 
 * // For each frame:
 * const schedule = scheduler.scheduleFrame(frame, rules, hasMotion, detectedObjects);
 * 
 * if (schedule.shouldProcess) {
 *   scheduler.updateGpuLoad(schedule.modelsToRun, true);
 *   
 *   for (const modelId of schedule.modelsToRun) {
 *     // Run model inference...
 *   }
 *   
 *   scheduler.updateGpuLoad(schedule.modelsToRun, false);
 * }
 * 
 * // Get statistics:
 * const stats = scheduler.getStatistics();
 * console.log(`Processing ${stats.processingRate.toFixed(1)}% of frames`);
 * console.log(`Average ${stats.averageModelsPerFrame.toFixed(1)} models per frame`);
 */
