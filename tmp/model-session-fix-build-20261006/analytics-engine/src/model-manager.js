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
 * Model Manager Class
 */
export class ModelManager {
    models = new Map();
    configs = new Map();
    stats = {
        totalLoads: 0,
        cacheHits: 0,
        cacheMisses: 0,
        avgLoadTime: 0,
        totalMemoryUsage: 0
    };
    options;
    isInitialized = false;
    loadTimes = [];
    pendingLoads = new Map();
    cleanupTimer;
    // GPU detection
    gpuAvailable = false;
    gpuType = 'none';
    constructor(options = {}) {
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
    async initialize() {
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
                }
                catch (error) {
                    console.error(`Failed to preload model ${modelId}:`, error);
                }
            }
        }
        // Start cleanup timer
        if (this.options.startCleanupTimer)
            this.startCleanupTimer();
        this.isInitialized = true;
        console.log('Model Manager initialized successfully');
        console.log(`GPU: ${this.gpuAvailable ? this.gpuType : 'Disabled'}`);
    }
    /**
     * Detect GPU availability
     */
    async detectGPU() {
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
        }
        catch (error) {
            console.error('GPU detection failed:', error);
        }
    }
    /**
     * Load model configurations from directory
     */
    async loadConfigurations() {
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
    async loadModel(modelId) {
        // Check if model is already loaded (cache hit)
        const cached = this.models.get(modelId);
        if (cached && cached.isLoaded) {
            this.stats.cacheHits++;
            cached.lastUsed = new Date();
            cached.useCount++;
            return cached.handle;
        }
        const pending = this.pendingLoads.get(modelId);
        if (pending)
            return pending;
        const loading = this.loadUncachedModel(modelId);
        this.pendingLoads.set(modelId, loading);
        try {
            return await loading;
        }
        finally {
            this.pendingLoads.delete(modelId);
        }
    }
    async loadUncachedModel(modelId) {
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
            let model;
            const modelPath = this.resolveModelPath(this.configuredPath(config));
            // Check if model file exists
            if (!fs.existsSync(modelPath)) {
                throw new Error(`Model file not found: ${modelPath}`);
            }
            if (this.options.modelLoader) {
                model = await this.options.modelLoader(modelPath, config);
            }
            else {
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
            const instance = {
                id: modelId,
                model,
                handle: undefined,
                runs: new Set(),
                config,
                loadedAt: new Date(),
                lastUsed: new Date(),
                useCount: 1,
                memoryUsage,
                isLoaded: true
            };
            instance.handle = this.createModelHandle(instance);
            this.models.set(modelId, instance);
            this.stats.totalMemoryUsage += memoryUsage;
            console.log(`Model loaded: ${config.name} (${loadTime}ms, ~${Math.round(memoryUsage / 1024 / 1024)}MB)`);
            return instance.handle;
        }
        catch (error) {
            console.error(`Failed to load model ${modelId}:`, error);
            throw error;
        }
    }
    createModelHandle(instance) {
        if (typeof instance.model?.run !== 'function')
            return instance.model;
        // Detectors retain their session for the service lifetime. Optional models
        // can still leave the cache: the next inference reloads instead of calling
        // the disposed session, and each run refreshes the actual usage time.
        const run = async (...args) => {
            let current;
            do {
                await this.loadModel(instance.id);
                current = this.models.get(instance.id);
            } while (!current?.isLoaded);
            const running = Promise.resolve().then(() => current.model.run(...args));
            current.runs.add(running);
            try {
                return await running;
            }
            finally {
                current.runs.delete(running);
                current.lastUsed = new Date();
            }
        };
        return new Proxy(instance.model, {
            get(target, property) {
                if (property === 'run')
                    return run;
                const value = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });
    }
    resolveModelPath(configuredPath) {
        if (path.isAbsolute(configuredPath))
            return configuredPath;
        const primary = path.join(this.options.modelsDirectory, configuredPath);
        if (fs.existsSync(primary))
            return primary;
        // Support pre-existing flat model mounts while the current manifest uses
        // a task-specific subdirectory (for example detection/yolox_tiny.onnx).
        const legacy = path.join(this.options.modelsDirectory, path.basename(configuredPath));
        return fs.existsSync(legacy) ? legacy : primary;
    }
    configuredPath(config) {
        const environmentPath = config.pathEnvironment ? process.env[config.pathEnvironment] : undefined;
        return environmentPath?.trim() || config.path;
    }
    /**
     * Load ONNX model
     */
    async loadONNXModel(modelPath, config) {
        try {
            const ort = await import('onnxruntime-node');
            const sessionOptions = {
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
            }
            catch (error) {
                if (sessionOptions.executionProviders.length === 1 && sessionOptions.executionProviders[0] === 'cpu')
                    throw error;
                console.warn(`Accelerated ONNX provider failed for ${config.id}; retrying on CPU`);
                return await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
            }
        }
        catch (error) {
            console.error('ONNX model loading failed:', error);
            throw error;
        }
    }
    /**
     * Load TensorFlow model
     */
    async loadTensorFlowModel(modelPath, config) {
        throw new Error(`TensorFlow model '${config.id}' at '${modelPath}' is not supported by this runtime. Export it to ONNX and configure type 'onnx'.`);
    }
    /**
     * Load PyTorch model
     */
    async loadPyTorchModel(modelPath, config) {
        throw new Error(`PyTorch model '${config.id}' at '${modelPath}' is not supported by this runtime. Export it to ONNX and configure type 'onnx'.`);
    }
    /**
     * Ensure enough cache space
     */
    async ensureCacheSpace(config) {
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
    async evictModels(requiredSpace) {
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
            if (model.config.warmup || model.config.required)
                continue; // Don't evict warmup or required models
            await this.unloadModel(model.id);
            if (!this.isModelLoaded(model.id))
                freedSpace += model.memoryUsage;
            if (freedSpace >= requiredSpace) {
                break;
            }
        }
    }
    /**
     * Unload model from memory
     */
    async unloadModel(modelId, force = false) {
        const instance = this.models.get(modelId);
        if (!instance || !instance.isLoaded)
            return;
        if (!force && (instance.config.warmup || instance.config.required)) {
            return;
        }
        if (!force && instance.runs.size > 0)
            return;
        // Detach before waiting/releasing so retained handles cannot start another
        // run on this session. Forced shutdown waits for its existing runs.
        instance.isLoaded = false;
        this.models.delete(modelId);
        await Promise.allSettled(instance.runs);
        console.log(`Unloading model: ${instance.config.name}`);
        // Clean up model resources
        if (instance.model && typeof instance.model.dispose === 'function') {
            await instance.model.dispose();
        }
        else if (instance.model && typeof instance.model.release === 'function') {
            await instance.model.release();
        }
        this.stats.totalMemoryUsage -= instance.memoryUsage;
    }
    /**
     * Estimate model memory usage
     */
    estimateModelMemory(config) {
        const modelPath = this.resolveModelPath(this.configuredPath(config));
        try {
            if (fs.existsSync(modelPath)) {
                const stats = fs.statSync(modelPath);
                // Model file size + ~30% overhead for runtime
                return Math.round(stats.size * 1.3);
            }
        }
        catch (error) {
            console.error('Failed to get model file size:', error);
        }
        // Default estimates by model type (in bytes)
        const defaults = {
            'yolov8n': 20 * 1024 * 1024, // compatibility id; YOLOX Tiny is ~20 MB
            'deepsort': 15 * 1024 * 1024, // ~15 MB
            'osnet': 25 * 1024 * 1024, // ~25 MB
            'retinaface': 30 * 1024 * 1024, // ~30 MB
            'arcface': 100 * 1024 * 1024, // ~100 MB
            'paddleocr': 10 * 1024 * 1024, // ~10 MB
            'clip': 350 * 1024 * 1024 // ~350 MB
        };
        return defaults[config.id] || 50 * 1024 * 1024; // Default 50MB
    }
    /**
     * Start cleanup timer for unused models
     */
    startCleanupTimer() {
        const intervalMs = 5 * 60 * 1000; // Check every 5 minutes
        this.cleanupTimer = setInterval(() => {
            this.cleanupUnusedModels();
        }, intervalMs);
    }
    /**
     * Clean up unused models
     */
    cleanupUnusedModels() {
        const now = Date.now();
        const thresholdMs = this.options.autoUnloadAfter * 60 * 1000;
        for (const [modelId, instance] of this.models.entries()) {
            if (instance.config.warmup || instance.config.required)
                continue; // Keep warmup and required models
            const idleTime = now - instance.lastUsed.getTime();
            if (idleTime > thresholdMs) {
                console.log(`Auto-unloading idle model: ${instance.config.name}`);
                void this.unloadModel(modelId).catch(error => console.error(`Failed to unload idle model ${modelId}:`, error));
            }
        }
    }
    /**
     * Get model (load if not cached)
     */
    async getModel(modelId) {
        return this.loadModel(modelId);
    }
    /**
     * Preload multiple models
     */
    async preloadModels(modelIds) {
        console.log(`Preloading ${modelIds.length} models...`);
        const promises = modelIds.map(id => this.loadModel(id).catch(error => {
            console.error(`Failed to preload ${id}:`, error);
        }));
        await Promise.all(promises);
    }
    /**
     * Get all loaded models
     */
    getLoadedModels() {
        return Array.from(this.models.entries())
            .filter(([_, instance]) => instance.isLoaded)
            .map(([id]) => id);
    }
    /**
     * Get model statistics
     */
    getStats() {
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
    getModelInfo(modelId) {
        return this.models.get(modelId);
    }
    /**
     * Check if model is loaded
     */
    isModelLoaded(modelId) {
        const instance = this.models.get(modelId);
        return instance?.isLoaded ?? false;
    }
    /**
     * Add model configuration
     */
    addModelConfig(config) {
        this.configs.set(config.id, config);
        console.log(`Added model configuration: ${config.name}`);
    }
    /**
     * Remove model configuration
     */
    removeModelConfig(modelId) {
        this.configs.delete(modelId);
        if (this.isModelLoaded(modelId)) {
            this.unloadModel(modelId);
        }
    }
    /**
     * Get all model configurations
     */
    getAllConfigs() {
        return Array.from(this.configs.values());
    }
    getModelConfig(modelId) {
        return this.configs.get(modelId);
    }
    getModelInventory() {
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
            return availability(config, configuredPath, resolvedPath, this.isModelLoaded(config.id) ? 'loaded' : 'available', stats.size, null);
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
    isModelAvailable(modelId) {
        const model = this.getModelInventory().find((item) => item.id === modelId);
        return model?.status === 'available' || model?.status === 'loaded';
    }
    /**
     * Warmup model (run dummy inference)
     */
    async warmupModel(modelId) {
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
        }
        catch (error) {
            console.error(`Warmup failed for ${modelId}:`, error);
        }
    }
    /**
     * Optimize all models (run warmup on high-priority models)
     */
    async optimizeAll() {
        console.log('Optimizing models...');
        const highPriorityModels = Array.from(this.configs.values())
            .filter(config => config.priority === 'high' || config.warmup);
        for (const config of highPriorityModels) {
            try {
                await this.warmupModel(config.id);
            }
            catch (error) {
                console.error(`Optimization failed for ${config.id}:`, error);
            }
        }
        console.log('Model optimization complete');
    }
    /**
     * Get memory usage report
     */
    getMemoryReport() {
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
    async clearAll() {
        console.log('Clearing all models from cache...');
        const modelIds = Array.from(this.models.keys());
        for (const id of modelIds) {
            await this.unloadModel(id, true);
        }
        this.models.clear();
        this.stats.totalMemoryUsage = 0;
        console.log('All models cleared');
    }
    /**
     * Shutdown model manager
     */
    async shutdown() {
        console.log('Shutting down Model Manager...');
        if (this.cleanupTimer)
            clearInterval(this.cleanupTimer);
        this.cleanupTimer = undefined;
        await this.clearAll();
        this.isInitialized = false;
        console.log('Model Manager shut down');
    }
    /**
     * Get GPU info
     */
    getGPUInfo() {
        return {
            available: this.gpuAvailable,
            type: this.gpuType,
            deviceId: this.options.gpuDeviceId
        };
    }
    /**
     * Is initialized
     */
    isReady() {
        return this.isInitialized;
    }
}
function defaultModelsDirectory() {
    const configured = process.env.MODELS_DIR?.trim();
    if (configured)
        return path.resolve(configured);
    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
        path.resolve(process.cwd(), 'models'),
        path.resolve(process.cwd(), 'analytics-engine', 'models'),
        path.resolve(moduleDirectory, '..', 'models'),
        path.resolve(moduleDirectory, '..', '..', 'models'),
    ];
    return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'manifest.json')))
        ?? candidates[0];
}
function defaultManifestPath(modelsDirectory) {
    const configured = process.env.MODEL_MANIFEST_PATH?.trim();
    if (configured)
        return path.resolve(configured);
    const alongsideModels = path.join(modelsDirectory, 'manifest.json');
    if (fs.existsSync(alongsideModels))
        return alongsideModels;
    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
        path.resolve(moduleDirectory, '..', 'models', 'manifest.json'),
        path.resolve(moduleDirectory, '..', '..', 'models', 'manifest.json'),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? alongsideModels;
}
function parseModelManifest(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.models)) {
        throw new Error('Model manifest must contain a models array');
    }
    const configs = value.models.map((entry, index) => {
        if (!entry || typeof entry !== 'object')
            throw new Error(`Model manifest entry ${index} must be an object`);
        const item = entry;
        if (typeof item.id !== 'string' || !item.id.trim())
            throw new Error(`Model manifest entry ${index} has no id`);
        if (typeof item.name !== 'string' || !item.name.trim())
            throw new Error(`Model ${item.id} has no name`);
        if (typeof item.path !== 'string' || !item.path.trim())
            throw new Error(`Model ${item.id} has no path`);
        if (!['onnx', 'tensorflow', 'pytorch'].includes(String(item.type)))
            throw new Error(`Model ${item.id} has an unsupported type`);
        if (!['high', 'medium', 'low'].includes(String(item.priority)))
            throw new Error(`Model ${item.id} has an invalid priority`);
        if (item.labels !== undefined && (!Array.isArray(item.labels) || !item.labels.every((label) => typeof label === 'string'))) {
            throw new Error(`Model ${item.id} labels must be strings`);
        }
        if (item.alphabet !== undefined && (!Array.isArray(item.alphabet) || !item.alphabet.every((character) => typeof character === 'string'))) {
            throw new Error(`Model ${item.id} alphabet must be strings`);
        }
        if (item.inputShape !== undefined && (!Array.isArray(item.inputShape) || !item.inputShape.every((dimension) => Number.isInteger(dimension) && Number(dimension) > 0))) {
            throw new Error(`Model ${item.id} inputShape must contain positive integers`);
        }
        return { ...item };
    });
    const ids = new Set();
    for (const config of configs) {
        if (ids.has(config.id))
            throw new Error(`Duplicate model id in manifest: ${config.id}`);
        ids.add(config.id);
    }
    return configs;
}
function availability(config, configuredPath, resolvedPath, status, sizeBytes, reason) {
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
let modelManagerInstance = null;
/**
 * Get or create model manager instance
 */
export function getModelManager(options) {
    if (!modelManagerInstance) {
        modelManagerInstance = new ModelManager(options);
    }
    return modelManagerInstance;
}
/**
 * Release the process-wide manager after an analytics pipeline shuts down.
 * This lets a subsequent pipeline use a new model directory/configuration
 * instead of retaining stale sessions from the previous one.
 */
export async function resetModelManager() {
    const manager = modelManagerInstance;
    modelManagerInstance = null;
    if (manager?.isReady())
        await manager.shutdown();
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
