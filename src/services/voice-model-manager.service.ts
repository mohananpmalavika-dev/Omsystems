/**
 * Voice Model Manager Service
 * 
 * Production-grade model lifecycle management for voice biometric authentication.
 * Handles model loading, versioning, health checks, and fallback strategies.
 */

import { promises as fs } from "fs";
import { createHash } from "crypto";
import path from "path";

let ort: any = null;
try {
  ort = await import("onnxruntime-node");
} catch {
  console.warn("onnxruntime-node not available, using fallback mode");
}

export interface ModelConfig {
  name: string;
  path: string;
  version: string;
  checksum?: string;
  required: boolean;
  fallbackMode?: "acoustic" | "disabled";
}

export interface ModelHealth {
  name: string;
  loaded: boolean;
  version: string;
  lastChecked: Date;
  inferenceCount: number;
  avgInferenceTime: number;
  errorCount: number;
  status: "healthy" | "degraded" | "failed";
}

export interface VoiceModels {
  embedding: any;
  vad?: any;
  antiSpoofing?: any;
  liveness?: any;
}

export class VoiceModelManager {
  private models: Map<string, any> = new Map();
  private modelConfigs: Map<string, ModelConfig> = new Map();
  private modelHealth: Map<string, ModelHealth> = new Map();
  private inferenceTimings: Map<string, number[]> = new Map();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.setupDefaultConfigs();
  }

  /**
   * Setup default model configurations
   */
  private setupDefaultConfigs(): void {
    // Speaker embedding model (ECAPA-TDNN)
    this.modelConfigs.set("embedding", {
      name: "speaker-embedding",
      path: process.env.VOICE_EMBEDDING_MODEL_PATH || "models/voice/ecapa-tdnn-512.onnx",
      version: process.env.VOICE_EMBEDDING_MODEL_VERSION || "1.0.0",
      checksum: process.env.VOICE_EMBEDDING_MODEL_CHECKSUM,
      required: true,
      fallbackMode: "acoustic",
    });

    // Voice Activity Detection model (Silero VAD)
    this.modelConfigs.set("vad", {
      name: "voice-activity-detection",
      path: process.env.VOICE_VAD_MODEL_PATH || "models/voice/silero-vad.onnx",
      version: process.env.VOICE_VAD_MODEL_VERSION || "1.0.0",
      checksum: process.env.VOICE_VAD_MODEL_CHECKSUM,
      required: false,
      fallbackMode: "acoustic",
    });

    // Anti-spoofing model (LFCC-LCNN or RawNet2)
    this.modelConfigs.set("antiSpoofing", {
      name: "anti-spoofing",
      path: process.env.VOICE_ANTISPOOFING_MODEL_PATH || "models/voice/rawnet2-antispoofing.onnx",
      version: process.env.VOICE_ANTISPOOFING_MODEL_VERSION || "1.0.0",
      checksum: process.env.VOICE_ANTISPOOFING_MODEL_CHECKSUM,
      required: false,
      fallbackMode: "acoustic",
    });

    // Liveness detection model
    this.modelConfigs.set("liveness", {
      name: "liveness-detection",
      path: process.env.VOICE_LIVENESS_MODEL_PATH || "models/voice/liveness-detector.onnx",
      version: process.env.VOICE_LIVENESS_MODEL_VERSION || "1.0.0",
      checksum: process.env.VOICE_LIVENESS_MODEL_CHECKSUM,
      required: false,
      fallbackMode: "disabled",
    });
  }

  /**
   * Initialize all voice models
   */
  async initialize(): Promise<void> {
    // Return existing initialization promise if already initializing
    if (this.initPromise) {
      return this.initPromise;
    }

    // Create new initialization promise
    this.initPromise = this._initialize();
    await this.initPromise;
  }

  private async _initialize(): Promise<void> {
    if (this.initialized) {
      console.log("Voice models already initialized");
      return;
    }

    console.log("Initializing voice biometric models...");

    if (!ort) {
      console.warn("ONNX Runtime not available. Running in fallback mode with acoustic features.");
      this.initialized = true;
      return;
    }

    const loadPromises: Promise<void>[] = [];

    for (const [key, config] of this.modelConfigs.entries()) {
      loadPromises.push(
        this.loadModel(key, config).catch((error) => {
          console.error(`Failed to load ${config.name}:`, error.message);
          if (config.required) {
            throw new Error(`Required model ${config.name} failed to load`);
          }
        })
      );
    }

    await Promise.allSettled(loadPromises);

    // Verify at least one required model loaded
    const embeddingHealth = this.modelHealth.get("embedding");
    if (!embeddingHealth?.loaded && this.modelConfigs.get("embedding")?.fallbackMode !== "acoustic") {
      throw new Error("No embedding model available and fallback disabled");
    }

    this.initialized = true;
    console.log("Voice model initialization complete");
    this.logHealthStatus();
  }

  /**
   * Load a specific model with validation
   */
  private async loadModel(key: string, config: ModelConfig): Promise<void> {
    const startTime = Date.now();

    try {
      // Check if model file exists
      const exists = await this.fileExists(config.path);
      if (!exists) {
        throw new Error(`Model file not found: ${config.path}`);
      }

      // Verify checksum if provided
      if (config.checksum) {
        const actualChecksum = await this.calculateFileChecksum(config.path);
        if (actualChecksum !== config.checksum) {
          throw new Error(
            `Model checksum mismatch. Expected: ${config.checksum}, Got: ${actualChecksum}`
          );
        }
      }

      // Load model with ONNX Runtime
      const session = await ort.InferenceSession.create(config.path, {
        executionProviders: ["cpu"],
        graphOptimizationLevel: "all",
        enableCpuMemArena: true,
        enableMemPattern: true,
        executionMode: "sequential",
      });

      this.models.set(key, session);

      // Initialize health tracking
      this.modelHealth.set(key, {
        name: config.name,
        loaded: true,
        version: config.version,
        lastChecked: new Date(),
        inferenceCount: 0,
        avgInferenceTime: 0,
        errorCount: 0,
        status: "healthy",
      });

      this.inferenceTimings.set(key, []);

      const loadTime = Date.now() - startTime;
      console.log(`✓ Loaded ${config.name} (${config.version}) in ${loadTime}ms`);
    } catch (error: any) {
      console.error(`✗ Failed to load ${config.name}:`, error.message);

      // Track as failed
      this.modelHealth.set(key, {
        name: config.name,
        loaded: false,
        version: config.version,
        lastChecked: new Date(),
        inferenceCount: 0,
        avgInferenceTime: 0,
        errorCount: 1,
        status: "failed",
      });

      throw error;
    }
  }

  /**
   * Get loaded models
   */
  getModels(): VoiceModels {
    return {
      embedding: this.models.get("embedding"),
      vad: this.models.get("vad"),
      antiSpoofing: this.models.get("antiSpoofing"),
      liveness: this.models.get("liveness"),
    };
  }

  /**
   * Get specific model
   */
  getModel(key: string): any {
    return this.models.get(key);
  }

  /**
   * Check if model is loaded
   */
  isModelLoaded(key: string): boolean {
    return this.models.has(key);
  }

  /**
   * Check if system is ready
   */
  isReady(): boolean {
    if (!this.initialized) {
      return false;
    }

    // Check if embedding model is available (directly or via fallback)
    const embeddingConfig = this.modelConfigs.get("embedding");
    return (
      this.models.has("embedding") || embeddingConfig?.fallbackMode === "acoustic"
    );
  }

  /**
   * Get operating mode
   */
  getOperatingMode(): "full" | "fallback" | "degraded" {
    if (!this.initialized) {
      return "degraded";
    }

    const hasEmbedding = this.models.has("embedding");
    const hasAntiSpoofing = this.models.has("antiSpoofing");
    const hasVAD = this.models.has("vad");

    if (hasEmbedding && hasAntiSpoofing && hasVAD) {
      return "full";
    } else if (hasEmbedding || this.modelConfigs.get("embedding")?.fallbackMode === "acoustic") {
      return "fallback";
    } else {
      return "degraded";
    }
  }

  /**
   * Record inference timing
   */
  recordInference(modelKey: string, durationMs: number, success: boolean): void {
    const health = this.modelHealth.get(modelKey);
    if (!health) return;

    health.inferenceCount++;
    health.lastChecked = new Date();

    if (success) {
      // Track timing
      const timings = this.inferenceTimings.get(modelKey) || [];
      timings.push(durationMs);

      // Keep last 100 timings
      if (timings.length > 100) {
        timings.shift();
      }

      this.inferenceTimings.set(modelKey, timings);

      // Update average
      health.avgInferenceTime = timings.reduce((a, b) => a + b, 0) / timings.length;

      // Update status based on performance
      if (health.avgInferenceTime > 5000) {
        health.status = "degraded";
      } else {
        health.status = "healthy";
      }
    } else {
      health.errorCount++;

      // Mark as degraded if error rate is high
      const errorRate = health.errorCount / health.inferenceCount;
      if (errorRate > 0.1) {
        health.status = "degraded";
      }
      if (errorRate > 0.5) {
        health.status = "failed";
      }
    }
  }

  /**
   * Get health status of all models
   */
  getHealthStatus(): ModelHealth[] {
    return Array.from(this.modelHealth.values());
  }

  /**
   * Get health status for specific model
   */
  getModelHealth(key: string): ModelHealth | undefined {
    return this.modelHealth.get(key);
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<{ healthy: boolean; details: ModelHealth[] }> {
    const details = this.getHealthStatus();
    const healthy =
      this.initialized &&
      details.some((h) => h.name === "speaker-embedding" && h.loaded) &&
      details.every((h) => h.status !== "failed" || !h.loaded);

    return { healthy, details };
  }

  /**
   * Reload a specific model (for hot-reload capability)
   */
  async reloadModel(key: string): Promise<void> {
    const config = this.modelConfigs.get(key);
    if (!config) {
      throw new Error(`Unknown model key: ${key}`);
    }

    console.log(`Reloading model: ${config.name}`);

    // Release existing model
    const existingModel = this.models.get(key);
    if (existingModel && typeof existingModel.release === "function") {
      await existingModel.release();
    }

    this.models.delete(key);
    this.modelHealth.delete(key);

    // Load new model
    await this.loadModel(key, config);
  }

  /**
   * Calculate file checksum
   */
  private async calculateFileChecksum(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Log health status
   */
  private logHealthStatus(): void {
    console.log("\n=== Voice Model Health Status ===");
    for (const health of this.modelHealth.values()) {
      const status = health.loaded ? "✓" : "✗";
      console.log(
        `${status} ${health.name} (v${health.version}) - ${health.status}`
      );
    }
    console.log(`Operating Mode: ${this.getOperatingMode()}`);
    console.log("================================\n");
  }

  /**
   * Get model metrics for monitoring
   */
  getMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {
      initialized: this.initialized,
      operating_mode: this.getOperatingMode(),
      models: {},
    };

    for (const [key, health] of this.modelHealth.entries()) {
      metrics.models[key] = {
        loaded: health.loaded,
        version: health.version,
        status: health.status,
        inference_count: health.inferenceCount,
        avg_inference_time_ms: Math.round(health.avgInferenceTime),
        error_count: health.errorCount,
        error_rate:
          health.inferenceCount > 0
            ? (health.errorCount / health.inferenceCount).toFixed(4)
            : 0,
      };
    }

    return metrics;
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    console.log("Disposing voice models...");

    for (const [key, model] of this.models.entries()) {
      try {
        if (model && typeof model.release === "function") {
          await model.release();
        }
      } catch (error: any) {
        console.error(`Error releasing model ${key}:`, error.message);
      }
    }

    this.models.clear();
    this.modelHealth.clear();
    this.inferenceTimings.clear();
    this.initialized = false;
    this.initPromise = null;

    console.log("Voice models disposed");
  }
}

// Singleton instance
let modelManagerInstance: VoiceModelManager | null = null;

export function getVoiceModelManager(): VoiceModelManager {
  if (!modelManagerInstance) {
    modelManagerInstance = new VoiceModelManager();
  }
  return modelManagerInstance;
}

export async function initializeVoiceModels(): Promise<VoiceModelManager> {
  const manager = getVoiceModelManager();
  await manager.initialize();
  return manager;
}
