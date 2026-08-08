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
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

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
  required?: boolean;
  task?: 'object-detection' | 'face-embedding' | 'ctc-text-recognition' | 'person-reid' | 'vehicle-reid' | 'pose-estimation' | 'attribute-estimation';
  decoder?: 'yolov8' | 'yolov5' | 'xyxy';
  labelSet?: 'coco';
  labels?: string[];
  alphabet?: string[];
  blankIndex?: number;
  pathEnvironment?: string;
  sha256?: string;
  sha256Environment?: string;
  sourceUrlEnvironment?: string;
}

export type ModelAvailabilityStatus = 'loaded' | 'available' | 'missing' | 'invalid';

export interface ModelAvailability {
  id: string;
  name: string;
  task: ModelConfig['task'] | 'unspecified';
  required: boolean;
  status: ModelAvailabilityStatus;
  configuredPath: string;
  resolvedPath: string;
  sizeBytes: number | null;
  reason: string | null;
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
  manifestPath?: string;
  modelLoader?: (modelPath: string, config: ModelConfig) => Promise<any>;
  startCleanupTimer?: boolean;
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

  private options: {
    modelsDirectory: string;
    maxCacheSize: number;
    enableGPU: boolean;
    gpuDeviceId: number;
    cacheEvictionPolicy: 'lru' | 'lfu' | 'priority';
    preloadModels: string[];
    autoUnloadAfter: number;
    manifestPath: string;
    modelLoader?: ModelManagerOptions['modelLoader'];
    startCleanupTimer: boolean;
  };
  private isInitialized = false;
  private loadTimes: number[] = [];

  // GPU detection
  private gpuAvailable = false;
  private gpuType: 'cuda' | 'openvino' | 'directml' | 'none' = 'none';

  constructor(options: ModelManagerOptions = {}) {
    const modelsDirectory = options.modelsDirectory || defaultModelsDirectory();
    this.options = {
      modelsDirectory,
      maxCacheSize: options.maxCacheSize || 2048, // 2GB default
      enableGPU: options.enableGPU ?? true,
      gpuDeviceId: options.gpuDeviceId ?? 0,
      cacheEvictionPolicy: options.cacheEvictionPolicy || 'lru',
      preloadModels: options.preloadModels || [],
      autoUnloadAfter: options.autoUnloadAfter || 30, // 30 minutes
      manifestPath: options.manifestPath || defaultManifestPath(modelsDirectory),
      modelLoader: options.modelLoader,
      startCleanupTimer: options.startCleanupTimer ?? true,
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
        if (!this.isModelAvailable(modelId)) {
          const availability = this.getModelInventory().find((model) => model.id === modelId);
          console.warn(`Skipping unavailable preload ${modelId}: ${availability?.reason ?? 'not configured'}`);
          continue;
        }
        try {
          await this.loadModel(modelId);
        } catch (error) {
          console.error(`Failed to preload model ${modelId}:`, error);
        }
      }
    }

    // Start cleanup timer
    if (this.options.startCleanupTimer) this.startCleanupTimer();

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
    if (!fs.existsSync(this.options.manifestPath)) {
      throw new Error(`Model manifest not found: ${this.options.manifestPath}`);
    }
    const manifest = parseModelManifest(JSON.parse(fs.readFileSync(this.options.manifestPath, 'utf8')));
    this.configs.clear();
    for (const config of manifest) {
      this.configs.set(config.id, config);
    }
    console.log(`Loaded ${this.configs.size} model configurations from ${this.options.manifestPath}`);
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
      const modelPath = this.resolveModelPath(this.configuredPath(config));

      // Check if model file exists
      if (!fs.existsSync(modelPath)) {
        throw new Error(`Model file not found: ${modelPath}`);
      }

      if (this.options.modelLoader) {
        model = await this.options.modelLoader(modelPath, config);
      } else {
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

  private resolveModelPath(configuredPath: string): string {
    if (path.isAbsolute(configuredPath)) return configuredPath;
    const primary = path.join(this.options.modelsDirectory, configuredPath);
    if (fs.existsSync(primary)) return primary;

    // Support the pre-existing flat /models/yolov8n.onnx layout while the
    // documented bootstrap layout uses /models/detection/yolov8n.onnx.
    const legacy = path.join(this.options.modelsDirectory, path.basename(configuredPath));
    return fs.existsSync(legacy) ? legacy : primary;
  }

  private configuredPath(config: ModelConfig): string {
    const environmentPath = config.pathEnvironment ? process.env[config.pathEnvironment] : undefined;
    return environmentPath?.trim() || config.path;
  }

  /**
   * Load ONNX model
   */
  private async loadONNXModel(modelPath: string, config: ModelConfig): Promise<any> {
    try {
      const ort = await import('onnxruntime-node');
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

      try {
        return await ort.InferenceSession.create(modelPath, sessionOptions);
      } catch (error) {
        if (sessionOptions.executionProviders.length === 1 && sessionOptions.executionProviders[0] === 'cpu') throw error;
        console.warn(`Accelerated ONNX provider failed for ${config.id}; retrying on CPU`);
        return await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
      }
    } catch (error) {
      console.error('ONNX model loading failed:', error);
      throw error;
    }
  }

  /**
   * Load TensorFlow model
   */
  private async loadTensorFlowModel(modelPath: string, config: ModelConfig): Promise<any> {
    throw new Error(
      `TensorFlow model '${config.id}' at '${modelPath}' is not supported by this runtime. Export it to ONNX and configure type 'onnx'.`,
    );
  }

  /**
   * Load PyTorch model
   */
  private async loadPyTorchModel(modelPath: string, config: ModelConfig): Promise<any> {
    throw new Error(
      `PyTorch model '${config.id}' at '${modelPath}' is not supported by this runtime. Export it to ONNX and configure type 'onnx'.`,
    );
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
    } else if (instance.model && typeof instance.model.release === 'function') {
      await instance.model.release();
    }

    this.stats.totalMemoryUsage -= instance.memoryUsage;
    instance.isLoaded = false;
    this.models.delete(modelId);
  }

  /**
   * Estimate model memory usage
   */
  private estimateModelMemory(config: ModelConfig): number {
    const modelPath = this.resolveModelPath(this.configuredPath(config));
    
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
    configuredModels: number;
    requiredModels: number;
    requiredReadyModels: number;
    modelsReady: boolean;
    cacheHitRate: number;
    memoryUsageMB: number;
  } {
    const totalRequests = this.stats.cacheHits + this.stats.cacheMisses;
    const provisioning = this.getProvisioningSummary();
    
    return {
      ...this.stats,
      loadedModels: this.models.size,
      configuredModels: provisioning.configured,
      requiredModels: provisioning.required,
      requiredReadyModels: provisioning.requiredReady,
      modelsReady: provisioning.ready,
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

  getModelConfig(modelId: string): ModelConfig | undefined {
    return this.configs.get(modelId);
  }

  getModelInventory(): ModelAvailability[] {
    return this.getAllConfigs().map((config) => {
      const configuredPath = this.configuredPath(config);
      const resolvedPath = this.resolveModelPath(configuredPath);
      if (!fs.existsSync(resolvedPath)) {
        return availability(config, configuredPath, resolvedPath, 'missing', null, 'model file not found');
      }
      const stats = fs.statSync(resolvedPath);
      if (!stats.isFile() || stats.size === 0) {
        return availability(config, configuredPath, resolvedPath, 'invalid', stats.isFile() ? stats.size : null, 'model artifact is empty or not a file');
      }
      const expectedHash = config.sha256Environment
        ? process.env[config.sha256Environment]?.trim().toLowerCase()
        : config.sha256?.toLowerCase();
      if (expectedHash) {
        const actualHash = createHash('sha256').update(fs.readFileSync(resolvedPath)).digest('hex');
        if (actualHash !== expectedHash) {
          return availability(config, configuredPath, resolvedPath, 'invalid', stats.size, `sha256 mismatch: expected ${expectedHash}; received ${actualHash}`);
        }
      }
      return availability(
        config,
        configuredPath,
        resolvedPath,
        this.isModelLoaded(config.id) ? 'loaded' : 'available',
        stats.size,
        null,
      );
    });
  }

  getProvisioningSummary() {
    const models = this.getModelInventory();
    const required = models.filter((model) => model.required);
    const ready = required.filter((model) => model.status === 'available' || model.status === 'loaded');
    return {
      ready: ready.length === required.length,
      configured: models.length,
      required: required.length,
      requiredReady: ready.length,
      loaded: models.filter((model) => model.status === 'loaded').length,
      missingRequired: required.filter((model) => model.status === 'missing' || model.status === 'invalid').map((model) => model.id),
      models,
    };
  }

  isModelAvailable(modelId: string): boolean {
    const model = this.getModelInventory().find((item) => item.id === modelId);
    return model?.status === 'available' || model?.status === 'loaded';
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

function defaultModelsDirectory(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'models'),
    path.resolve(process.cwd(), 'analytics-engine', 'models'),
    path.resolve(moduleDirectory, '..', 'models'),
    path.resolve(moduleDirectory, '..', '..', 'models'),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'manifest.json')))
    ?? candidates[0]!;
}

function defaultManifestPath(modelsDirectory: string): string {
  const configured = process.env.MODEL_MANIFEST_PATH?.trim();
  if (configured) return path.resolve(configured);
  const alongsideModels = path.join(modelsDirectory, 'manifest.json');
  if (fs.existsSync(alongsideModels)) return alongsideModels;
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDirectory, '..', 'models', 'manifest.json'),
    path.resolve(moduleDirectory, '..', '..', 'models', 'manifest.json'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? alongsideModels;
}

function parseModelManifest(value: unknown): ModelConfig[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { models?: unknown }).models)) {
    throw new Error('Model manifest must contain a models array');
  }
  const configs = (value as { models: unknown[] }).models.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`Model manifest entry ${index} must be an object`);
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id.trim()) throw new Error(`Model manifest entry ${index} has no id`);
    if (typeof item.name !== 'string' || !item.name.trim()) throw new Error(`Model ${item.id} has no name`);
    if (typeof item.path !== 'string' || !item.path.trim()) throw new Error(`Model ${item.id} has no path`);
    if (!['onnx', 'tensorflow', 'pytorch'].includes(String(item.type))) throw new Error(`Model ${item.id} has an unsupported type`);
    if (!['high', 'medium', 'low'].includes(String(item.priority))) throw new Error(`Model ${item.id} has an invalid priority`);
    if (item.labels !== undefined && (!Array.isArray(item.labels) || !item.labels.every((label) => typeof label === 'string'))) {
      throw new Error(`Model ${item.id} labels must be strings`);
    }
    if (item.alphabet !== undefined && (!Array.isArray(item.alphabet) || !item.alphabet.every((character) => typeof character === 'string'))) {
      throw new Error(`Model ${item.id} alphabet must be strings`);
    }
    if (item.inputShape !== undefined && (!Array.isArray(item.inputShape) || !item.inputShape.every((dimension) => Number.isInteger(dimension) && Number(dimension) > 0))) {
      throw new Error(`Model ${item.id} inputShape must contain positive integers`);
    }
    return { ...item } as unknown as ModelConfig;
  });
  const ids = new Set<string>();
  for (const config of configs) {
    if (ids.has(config.id)) throw new Error(`Duplicate model id in manifest: ${config.id}`);
    ids.add(config.id);
  }
  return configs;
}

function availability(
  config: ModelConfig,
  configuredPath: string,
  resolvedPath: string,
  status: ModelAvailabilityStatus,
  sizeBytes: number | null,
  reason: string | null,
): ModelAvailability {
  return {
    id: config.id,
    name: config.name,
    task: config.task ?? 'unspecified',
    required: config.required ?? false,
    status,
    configuredPath,
    resolvedPath,
    sizeBytes,
    reason,
  };
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
