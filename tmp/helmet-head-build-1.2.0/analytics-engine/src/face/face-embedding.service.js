/**
 * Face Embedding Service
 * Extracts ArcFace embeddings using ONNX Runtime
 */
import * as ort from 'onnxruntime-node';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
function resolveDefaultArcFacePath() {
    if (process.env.ARCFACE_MODEL_PATH)
        return process.env.ARCFACE_MODEL_PATH;
    const candidates = [
        path.resolve(process.cwd(), 'models/face/arcface_r100.onnx'),
        path.resolve(process.cwd(), 'analytics-engine/models/face/arcface_r100.onnx'),
        path.resolve(process.cwd(), '../models/face/arcface_r100.onnx'),
        '/app/models/face/arcface_r100.onnx',
        '/app/models/face/arcface-r100.onnx',
    ];
    for (const candidate of candidates) {
        if (fsSync.existsSync(candidate))
            return candidate;
    }
    return '/app/models/face/arcface-r100.onnx';
}
export class FaceEmbeddingService {
    session = null;
    config;
    isInitialized = false;
    inputName = 'input';
    outputName = 'output';
    constructor(config) {
        this.config = {
            modelPath: resolveDefaultArcFacePath(),
            modelName: 'arcface-r100',
            modelVersion: '1.0.0',
            embeddingDimension: 512,
            executionProviders: ['cpu'], // Can add 'cuda', 'tensorrt' if available
            batchSize: 1,
            ...config,
        };
    }
    /**
     * Initialize ONNX session
     */
    async initialize() {
        try {
            // Check if model file exists
            try {
                await fs.access(this.config.modelPath);
            }
            catch {
                console.warn(`ArcFace model not found at ${this.config.modelPath}. ` +
                    'Face embedding extraction will not be available.');
                this.isInitialized = false;
                return;
            }
            // Create ONNX session
            this.session = await ort.InferenceSession.create(this.config.modelPath, {
                executionProviders: this.config.executionProviders,
                graphOptimizationLevel: 'all',
                enableCpuMemArena: true,
                enableMemPattern: true,
            });
            // Discover input/output names
            this.inputName = this.session.inputNames[0] || 'input';
            this.outputName = this.session.outputNames[0] || 'output';
            console.log(`✓ Loaded ArcFace model: ${this.config.modelName} v${this.config.modelVersion}`);
            console.log(`  - Input: ${this.inputName}`);
            console.log(`  - Output: ${this.outputName}`);
            console.log(`  - Embedding dimension: ${this.config.embeddingDimension}`);
            console.log(`  - Execution providers: ${this.config.executionProviders.join(', ')}`);
            this.isInitialized = true;
        }
        catch (error) {
            console.error('Failed to initialize FaceEmbeddingService:', error);
            this.session = null;
            this.isInitialized = false;
            throw error;
        }
    }
    /**
     * Extract embedding from aligned face image
     */
    async extractEmbedding(alignedFace, quality, pose) {
        if (!this.isInitialized || !this.session) {
            throw new Error('FaceEmbeddingService not initialized or model unavailable');
        }
        // Create input tensor [1, 3, 112, 112]
        const tensor = new ort.Tensor('float32', alignedFace, [1, 3, 112, 112]);
        // Run inference
        const feeds = { [this.inputName]: tensor };
        const results = await this.session.run(feeds);
        // Extract embedding
        const outputTensor = results[this.outputName];
        if (!outputTensor) {
            throw new Error(`Model output '${this.outputName}' not found`);
        }
        const rawEmbedding = outputTensor.data;
        // Validate dimension
        if (rawEmbedding.length !== this.config.embeddingDimension) {
            throw new Error(`Unexpected embedding dimension: expected ${this.config.embeddingDimension}, ` +
                `got ${rawEmbedding.length}`);
        }
        // L2 normalize
        const normalized = this.l2Normalize(rawEmbedding);
        return {
            vector: normalized,
            modelName: this.config.modelName,
            modelVersion: this.config.modelVersion,
            quality: quality ?? 1.0,
            yaw: pose?.yaw,
            pitch: pose?.pitch,
            roll: pose?.roll,
        };
    }
    /**
     * Batch extract embeddings (for multiple faces)
     */
    async extractEmbeddingsBatch(alignedFaces, qualities, poses) {
        if (!this.isInitialized || !this.session) {
            throw new Error('FaceEmbeddingService not initialized or model unavailable');
        }
        const batchSize = alignedFaces.length;
        if (batchSize === 0) {
            return [];
        }
        // For now, process sequentially
        // In production, you could implement true batching with shape [N, 3, 112, 112]
        const embeddings = [];
        for (let i = 0; i < batchSize; i++) {
            const embedding = await this.extractEmbedding(alignedFaces[i], qualities?.[i], poses?.[i]);
            embeddings.push(embedding);
        }
        return embeddings;
    }
    /**
     * L2 normalize vector
     */
    l2Normalize(vector) {
        let sumSquares = 0;
        for (const value of vector) {
            sumSquares += value * value;
        }
        const norm = Math.sqrt(sumSquares);
        if (!Number.isFinite(norm) || norm < 1e-12) {
            throw new Error(`Invalid embedding norm: ${norm}`);
        }
        const normalized = new Float32Array(vector.length);
        for (let i = 0; i < vector.length; i++) {
            normalized[i] = vector[i] / norm;
        }
        return normalized;
    }
    /**
     * Validate that embedding is properly normalized
     */
    validateNormalization(embedding) {
        let sumSquares = 0;
        for (const value of embedding) {
            sumSquares += value * value;
        }
        const norm = Math.sqrt(sumSquares);
        return Math.abs(norm - 1.0) < 0.01;
    }
    /**
     * Calculate cosine similarity (for normalized vectors, this is just dot product)
     */
    cosineSimilarity(a, b) {
        if (a.length !== b.length) {
            throw new Error('Embedding dimensions do not match');
        }
        let dotProduct = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
        }
        return dotProduct;
    }
    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.session) {
            // ONNX Runtime doesn't require explicit cleanup in Node.js
            this.session = null;
        }
        this.isInitialized = false;
    }
    /**
     * Get health status
     */
    getHealth() {
        return {
            available: this.isInitialized && this.session !== null,
            modelName: this.config.modelName,
            modelVersion: this.config.modelVersion,
            embeddingDimension: this.config.embeddingDimension,
        };
    }
    /**
     * Update configuration (requires reinitialization)
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        this.isInitialized = false;
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
