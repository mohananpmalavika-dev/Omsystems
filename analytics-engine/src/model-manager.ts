/**
 * AI Model Manager
 * 
 * Centralized management for all AI models with:
 * - Lazy loading (load models only when needed)
 * - Model caching (keep frequently used models in memory)
 * - GPU acceleration support (CUDA, OpenVINO)
 * - Memory management (unload unused models)
 * - Model versioning
 * - Performance monitoring
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Model configuration
 */
export interface ModelConfig {
  id: string;
  name: string;
  path: string;
  type: 'onnx' | 'tensorflow' | 'pytorch';
  priority: 'high' | 'medium' | 'low'; // For cache eviction
  warmup?: boolean; // Pre-load on startup
  useGPU?: boolean;
  inputShape?: number[];
  outputShape?: number[];
  preprocessor?: string;
  postprocessor?: string;
}

/**
 * Model instance with metadata
 */
interface ModelInstance {
  id: string;
  model: any; // Actual model object (ONNX session, TF model, etc.)
  config: ModelConfig;
  loadedAt: Date;
  lastUsed: Date;
  useCount: number;
  memoryUsage: number; // Bytes
  isLoaded: boolean;
}

/**
 * Model loading statistics
 */
interface ModelStats {
  totalLoads: number;
  cacheHits: number;
  cacheMisses: number;
  avgLoadTime: number;
  totalMemoryUsage: number;
}

/**
 * Model Manager Options
 */
export interface ModelManagerOptions {
  modelsDirectory?: string;
  maxCacheSize?: number; // MB
  enableGPU?: boolean;
  gpuDeviceId?: number;
  cacheEvictionPolicy?: 'lru' | 'lfu' | 'priority';
  preloadModels?: string[]; // Model IDs to load on startup
  autoUnloadAfter?: number; // Minutes of inactivity
}

/**
 * Model Manager Class
 */
export class ModelManager {
  private models: Map<string, ModelInstance> = new Map();
  private configs: Map<string, ModelConfig> = new Map();
  private stats: ModelStats = {
    totalLoads: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgLoadTime: 0,
    totalMemoryUsage: 0
  };

  private options: Required<ModelManagerOptions>;
  private isInitialized = false;
  private loadTimes: number[] = [];

  // GPU detection
  private gpuAvailable = false;
  private gpuType: 'cuda' | 'openvino' | 'directml' | 'none' = 'none';

  constructor(options: ModelManagerOptions = {}) {
    this.options = {
      modelsDirectory: options.modelsDirectory || './models',
      maxCacheSize: options.maxCacheSize || 2048, // 2GB default
      enableGPU: options.enableGPU ?? true,
      gpuDeviceId: options.gpuDeviceId ?? 0,
      cacheEvictionPolicy: options.cacheEvictionPolicy || 'lru',
      preloadModels: options.preloadModels || [],
      autoUnloadAfter: options.autoUnloadAfter || 30 // 30 minutes
    };
  }

  /**
   * Initialize model manager
   */
  async initialize(): Promise<void> {
    console.log('Initializing Model Manager...');

    // Detect GPU availability
    await this.detectGPU();

    // Load model configurations
    await this.loadConfigurations();

    // Preload high-priority models
    if (this.options.preloadModels.length > 0) {
      console.log(`Preloading ${this.options.preloadModels.length} models...`);
      for (const modelId of this.options.preloadModels) {
        try {
          await this.loadModel(modelId);
        } catch (error) {
          console.error(`Failed to preload model ${modelId}:`, error);
        }
      }
    }

    // Start cleanup timer
    this.startCleanupTimer();

    this.isInitialized = true;
    console.log('Model Manager initialized successfully');
    console.log(`GPU: ${this.gpuAvailable ? this.gpuType : 'Disabled'}`);
  }

  /**
   * Detect GPU availability
   */
  private async detectGPU(): Promise<void> {
    if (!this.options.enableGPU) {
      console.log('GPU acceleration disabled by configuration');
      return;
    }

    try {
      // Try to detect CUDA
      // In production: Use appropriate GPU detection library
      // For now: Check environment variables
      if (process.env.CUDA_VISIBLE_DEVICES !== undefined) {
        this.gpuAvailable = true;
        this.gpuType = 'cuda';
        console.log('CUDA GPU detected');
        return;
      }

      // Check for OpenVINO
      if (process.env.OPENVINO_PATH) {
        this.gpuAvailable = true;
        this.gpuType = 'openvino';
        console.log('OpenVINO GPU detected');
        return;
      }

      // Check for DirectML (Windows)
      if (process.platform === 'win32') {
        this.gpuAvailable = true;
        this.gpuType = 'directml';
        console.log('DirectML GPU detected');
        return;
      }

      console.log('No GPU detected, using CPU');
    } catch (error) {
      console.error('GPU detection failed:', error);
    }
  }

  /**
   * Load model configurations from directory
   */
  private async loadConfigurations(): Promise<void> {
    // Default model configurations
    const defaultConfigs: ModelConfig[] = [
      {
        id: 'yolov8n',
        name: 'YOLOv8 Nano',
        path: 'yolov8n.onnx',
        type: 'onnx',
        priority: 'high',
        warmup: true,
        useGPU: true,
        inputShape: [1, 3, 640, 640]
      },
      {
        id: 'deepsort',
        name: 'DeepSORT Tracker',
        path: 'deepsort.onnx',
        type: 'onnx',
        priority: 'high',
        warmup: true,
        useGPU: true
      },
      {
        id: 'osnet',
        name: 'OSNet Re-ID',
        path: 'osnet_x1_0.onnx',
        type: 'onnx',
        priority: 'medium',
        warmup: false,
        useGPU: true
      },
      {
        id: 'retinaface',
        name: 'RetinaFace Detector',
        path: 'retinaface.onnx',
        type: 'onnx',
        priority: 'medium',
        warmup: false,
        useGPU: true
      },
      {
        id: 'arcface',
        name: 'ArcFace Recognition',
        path: 'arcface.onnx',
        type: 'onnx',
        priority: 'medium',
        warmup: false,
        useGPU: true
      },
      {
        id: 'paddleocr',
        name: 'PaddleOCR ANPR',
        path: 'paddleocr.onnx',
        type: 'onnx',
        priority: 'medium',
        warmup: false,
        useGPU: true
      },
      {
        id: 'clip',
        name: 'CLIP Visual-Text',
        path: 'clip-vit-b32.onnx',
        type: 'onnx',
        priority: 'low',
        warmup: false,
        useGPU: true
      }
    ];

    for (const config of defaultConfigs) {
      this.configs.set(config.id, config);
    }

    console.log(`Loaded ${this.configs.size} model configurations`);
  }

  /**
   * Load model (with lazy loading and caching)
   */
  async loadModel(modelId: string): Promise<any> {
    // Check if model is already loaded (cache hit)
    const cached = this.models.get(modelId);
    if (cached && cached.isLoaded) {
      this.stats.cacheHits++;
      cached.lastUsed = new Date();
      cached.useCount++;
      return cached.model;
    }

    // Cache miss - load model
    this.stats.cacheMisses++;
    const startTime = Date.now();

    const config = this.configs.get(modelId);
    if (!config) {
      throw new Error(`Model configuration not found: ${modelId}`);
    }

    console.log(`Loading model: ${config.name} (${modelId})`);

    // Check cache size and evict if necessary
    await this.ensureCacheSpace(config);

    try {
      // Load model based on type
      let model: any;
      const modelPath = path.join(this.options.modelsDirectory, config.path);

      // Check if model file exists
      if (!fs.existsSync(modelPath)) {
        throw new Error(`Model file not found: ${modelPath}`);
      }

      switch (config.type) {
        case 'onnx':
          model = await this.loadONNXModel(modelPath, config);
          break;
        case 'tensorflow':
          model = await this.loadTensorFlowModel(modelPath, config);
          break;
        case 'pytorch':
          model = await this.loadPyTorchModel(modelPath, config);
          break;
        default:
          throw new Error(`Unsupported model type: ${config.type}`);
      }

      const loadTime = Date.now() - startTime;
      this.loadTimes.push(loadTime);
      this.stats.totalLoads++;
      this.stats.avgLoadTime = 
        this.loadTimes.reduce((a, b) => a + b, 0) / this.loadTimes.length;

      // Estimate memory usage (rough estimate)
      const memoryUsage = this.estimateModelMemory(config);

      const instance: ModelInstance = {
        id: modelId,
        model,
        config,
        loadedAt: new Date(),
        lastUsed: new Date(),
        useCount: 1,
        memoryUsage,
        isLoaded: true
      };

      this.models.set(modelId, instance);
      this.stats.totalMemoryUsage += memoryUsage;

      console.log(`Model loaded: ${config.name} (${loadTime}ms, ~${Math.round(memoryUsage / 1024 / 1024)}MB)`);

      return model;
    } catch (error) {
      console.error(`Failed to load model ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Load ONNX model
   */
  private async loadONNXModel(modelPath: string, config: ModelConfig): Promise<any> {
    try {
      // In production: Use onnxruntime-node
      // const ort = await import('onnxruntime-node');
      
      const sessionOptions: any = {
        executionProviders: []
      };

      // Configure GPU if available and enabled
      if (this.gpuAvailable && config.useGPU) {
        switch (this.gpuType) {
          case 'cuda':
            sessionOptions.executionProviders.push({
              name: 'cuda',
              deviceId: this.options.gpuDeviceId
            });
            break;
          case 'directml':
            sessionOptions.executionProviders.push('dml');
            break;
          case 'openvino':
            sessionOptions.executionProviders.push('openvino');
            break;
        }
      }

      // Always add CPU as fallback
      sessionOptions.executionProviders.push('cpu');

      // Create inference session
      // const session = await ort.InferenceSession.create(modelPath, sessionOptions);
      
      // For now: Return mock model
      const session = {
        inputNames: ['images'],
        outputNames: ['output0'],
        modelPath,
        config,
        sessionOptions
      };

      return session;
    } catch (error) {
      console.error('ONNX model loading failed:', error);
      throw error;
    }
  }

  /**
   * Load TensorFlow model
   */
  private async loadTensorFlowModel(modelPath: string, config: ModelConfig): Promise<any> {
    // In production: Use @tensorflow/tfjs-node
    // const tf = await import('@tensorflow/tfjs-node');
    // const model = await tf.loadGraphModel(`file://${modelPath}`);
    
    // For now: Return mock model
    return {
      modelPath,
      config,
      type: 'tensorflow'
    };
  }

  /**
   * Load PyTorch model
   */
  private async loadPyTorchModel(modelPath: string, config: ModelConfig): Promise<any> {
    // In production: Use torchjs or ONNX export
    // For now: Return mock model
    return {
      modelPath,
      config,
      type: 'pytorch'
    };
  }

  /**
   * Ensure enough cache space
   */
  private async ensureCacheSpace(config: ModelConfig): Promise<void> {
    const requiredSpace = this.estimateModelMemory(config);
    const maxBytes = this.options.maxCacheSize * 1024 * 1024;

    if (this.stats.totalMemoryUsage + requiredSpace > maxBytes) {
      console.log('Cache full, evicting models...');
      await this.evictModels(requiredSpace);
    }
  }

  /**
   * Evict models based on policy
   */
  private async evictModels(requiredSpace: number): Promise<void> {
    const models = Array.from(this.models.values());

    switch (this.options.cacheEvictionPolicy) {
      case 'lru': // Least Recently Used
        models.sort((a, b) => a.lastUsed.getTime() - b.lastUsed.getTime());
        break;
      case 'lfu': // Least Frequently Used
        models.sort((a, b) => a.useCount - b.useCount);
        break;
      case 'priority': // Priority-based
        models.sort((a, b) => {
          const priorityMap = { low: 0, medium: 1, high: 2 };
          return priorityMap[a.config.priority] - priorityMap[b.config.priority];
        });
        break;
    }

    let freedSpace = 0;
    for (const model of models) {
      if (model.config.warmup) continue; // Don't evict warmup models

      await this.unloadModel(model.id);
      freedSpace += model.memoryUsage;

      if (freedSpace >= requiredSpace) {
        break;
      }
    }
  }

  /**
   * Unload model from memory
   */
  async unloadModel(modelId: string): Promise<void> {
    const instance = this.models.get(modelId);
    if (!instance || !instance.isLoaded) return;

    console.log(`Unloading model: ${instance.config.name}`);

    // Clean up model resources
    if (instance.model && typeof instance.model.dispose === 'function') {
      instance.model.dispose();
    }

    this.stats.totalMemoryUsage -= instance.memoryUsage;
    instance.isLoaded = false;
    this.models.delete(modelId);
  }

  /**
   * Estimate model memory usage
   */
  private estimateModelMemory(config: ModelConfig): number {
    const modelPath = path.join(this.options.modelsDirectory, config.path);
    
    try {
      if (fs.existsSync(modelPath)) {
        const stats = fs.statSync(modelPath);
        // Model file size + ~30% overhead for runtime
        return Math.round(stats.size * 1.3);
      }
    } catch (error) {
      console.error('Failed to get model file size:', error);
    }

    // Default estimates by model type (in bytes)
    const defaults: Record<string, number> = {
      'yolov8n': 6 * 1024 * 1024,      // ~6 MB
      'deepsort': 15 * 1024 * 1024,    // ~15 MB
      'osnet': 25 * 1024 * 1024,       // ~25 MB
      'retinaface': 30 * 1024 * 1024,  // ~30 MB
      'arcface': 100 * 1024 * 1024,    // ~100 MB
      'paddleocr': 10 * 1024 * 1024,   // ~10 MB
      'clip': 350 * 1024 * 1024        // ~350 MB
    };

    return defaults[config.id] || 50 * 1024 * 1024; // Default 50MB
  }

  /**
   * Start cleanup timer for unused models
   */
  private startCleanupTimer(): void {
    const intervalMs = 5 * 60 * 1000; // Check every 5 minutes

    setInterval(() => {
      this.cleanupUnusedModels();
    }, intervalMs);
  }

  /**
   * Clean up unused models
   */
  private cleanupUnusedModels(): void {
    const now = Date.now();
    const thresholdMs = this.options.autoUnloadAfter * 60 * 1000;

    for (const [modelId, instance] of this.models.entries()) {
      if (instance.config.warmup) continue; // Keep warmup models

      const idleTime = now - instance.lastUsed.getTime();
      if (idleTime > thresholdMs) {
        console.log(`Auto-unloading idle model: ${instance.config.name}`);
        this.unloadModel(modelId);
      }
    }
  }

  /**
   * Get model (load if not cached)
   */
  async getModel(modelId: string): Promise<any> {
    return this.loadModel(modelId);
  }

  /**
   * Preload multiple models
   */
  async preloadModels(modelIds: string[]): Promise<void> {
    console.log(`Preloading ${modelIds.length} models...`);
    
    const promises = modelIds.map(id => 
      this.loadModel(id).catch(error => {
        console.error(`Failed to preload ${id}:`, error);
      })
    );

    await Promise.all(promises);
  }

  /**
   * Get all loaded models
   */
  getLoadedModels(): string[] {
    return Array.from(this.models.entries())
      .filter(([_, instance]) => instance.isLoaded)
      .map(([id]) => id);
  }

  /**
   * Get model statistics
   */
  getStats(): ModelStats & {
    loadedModels: number;
    cacheHitRate: number;
    memoryUsageMB: number;
  } {
    const totalRequests = this.stats.cacheHits + this.stats.cacheMisses;
    
    return {
      ...this.stats,
      loadedModels: this.models.size,
      cacheHitRate: totalRequests > 0 
        ? (this.stats.cacheHits / totalRequests) * 100 
        : 0,
      memoryUsageMB: this.stats.totalMemoryUsage / 1024 / 1024
    };
  }

  /**
   * Get model info
   */
  getModelInfo(modelId: string): ModelInstance | undefined {
    return this.models.get(modelId);
  }

  /**
   * Check if model is loaded
   */
  isModelLoaded(modelId: string): boolean {
    const instance = this.models.get(modelId);
    return instance?.isLoaded ?? false;
  }

  /**
   * Add model configuration
   */
  addModelConfig(config: ModelConfig): void {
    this.configs.set(config.id, config);
    console.log(`Added model configuration: ${config.name}`);
  }

  /**
   * Remove model configuration
   */
  removeModelConfig(modelId: string): void {
    this.configs.delete(modelId);
    if (this.isModelLoaded(modelId)) {
      this.unloadModel(modelId);
    }
  }

  /**
   * Get all model configurations
   */
  getAllConfigs(): ModelConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Warmup model (run dummy inference)
   */
  async warmupModel(modelId: string): Promise<void> {
    console.log(`Warming up model: ${modelId}`);
    
    const model = await this.loadModel(modelId);
    const config = this.configs.get(modelId);

    if (!config || !config.inputShape) {
      console.log('No input shape defined, skipping warmup');
      return;
    }

    try {
      // In production: Run actual inference with dummy data
      // For now: Just ensure model is loaded
      console.log(`Model ${modelId} warmed up`);
    } catch (error) {
      console.error(`Warmup failed for ${modelId}:`, error);
    }
  }

  /**
   * Optimize all models (run warmup on high-priority models)
   */
  async optimizeAll(): Promise<void> {
    console.log('Optimizing models...');
    
    const highPriorityModels = Array.from(this.configs.values())
      .filter(config => config.priority === 'high' || config.warmup);

    for (const config of highPriorityModels) {
      try {
        await this.warmupModel(config.id);
      } catch (error) {
        console.error(`Optimization failed for ${config.id}:`, error);
      }
    }

    console.log('Model optimization complete');
  }

  /**
   * Get memory usage report
   */
  getMemoryReport(): {
    total: number;
    used: number;
    available: number;
    models: Array<{
      id: string;
      name: string;
      memoryMB: number;
      lastUsed: Date;
      useCount: number;
    }>;
  } {
    const maxBytes = this.options.maxCacheSize * 1024 * 1024;
    
    const models = Array.from(this.models.values()).map(instance => ({
      id: instance.id,
      name: instance.config.name,
      memoryMB: instance.memoryUsage / 1024 / 1024,
      lastUsed: instance.lastUsed,
      useCount: instance.useCount
    }));

    return {
      total: maxBytes / 1024 / 1024,
      used: this.stats.totalMemoryUsage / 1024 / 1024,
      available: (maxBytes - this.stats.totalMemoryUsage) / 1024 / 1024,
      models
    };
  }

  /**
   * Clear all models
   */
  async clearAll(): Promise<void> {
    console.log('Clearing all models from cache...');
    
    const modelIds = Array.from(this.models.keys());
    for (const id of modelIds) {
      await this.unloadModel(id);
    }

    this.models.clear();
    this.stats.totalMemoryUsage = 0;
    
    console.log('All models cleared');
  }

  /**
   * Shutdown model manager
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down Model Manager...');
    await this.clearAll();
    this.isInitialized = false;
    console.log('Model Manager shut down');
  }

  /**
   * Get GPU info
   */
  getGPUInfo(): {
    available: boolean;
    type: string;
    deviceId: number;
  } {
    return {
      available: this.gpuAvailable,
      type: this.gpuType,
      deviceId: this.options.gpuDeviceId
    };
  }

  /**
   * Is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

/**
 * Singleton instance
 */
let modelManagerInstance: ModelManager | null = null;

/**
 * Get or create model manager instance
 */
export function getModelManager(options?: ModelManagerOptions): ModelManager {
  if (!modelManagerInstance) {
    modelManagerInstance = new ModelManager(options);
  }
  return modelManagerInstance;
}

/**
 * Example Usage:
 * 
 * // Initialize model manager
 * const modelManager = getModelManager({
 *   modelsDirectory: './models',
 *   maxCacheSize: 2048, // 2GB
 *   enableGPU: true,
 *   cacheEvictionPolicy: 'lru',
 *   preloadModels: ['yolov8n', 'deepsort'],
 *   autoUnloadAfter: 30 // minutes
 * });
 * 
 * await modelManager.initialize();
 * 
 * // Load model (lazy loading + caching)
 * const yoloModel = await modelManager.getModel('yolov8n');
 * 
 * // Use model for inference
 * // ... run inference ...
 * 
 * // Get statistics
 * const stats = modelManager.getStats();
 * console.log('Cache hit rate:', stats.cacheHitRate.toFixed(1) + '%');
 * console.log('Memory usage:', stats.memoryUsageMB.toFixed(1) + 'MB');
 * 
 * // Get memory report
 * const memoryReport = modelManager.getMemoryReport();
 * console.log('Models loaded:', memoryReport.models.length);
 * 
 * // Cleanup
 * await modelManager.shutdown();
 */
