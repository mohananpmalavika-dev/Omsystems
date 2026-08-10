/**
 * Face Embedding Service
 * Extracts ArcFace embeddings using ONNX Runtime
 */

import * as ort from 'onnxruntime-node';
import type { FaceEmbedding } from './face.types.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface FaceEmbeddingConfig {
  modelPath: string;
  modelName: string;
  modelVersion: string;
  embeddingDimension: number;
  executionProviders: string[];
  batchSize: number;
}

export class FaceEmbeddingService {
  private session: ort.InferenceSession | null = null;
  private config: FaceEmbeddingConfig;
  private isInitialized = false;
  private inputName: string = 'input';
  private outputName: string = 'output';

  constructor(config?: Partial<FaceEmbeddingConfig>) {
    this.config = {
      modelPath: process.env.ARCFACE_MODEL_PATH || '/app/models/face/arcface-r100.onnx',
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
  async initialize(): Promise<void> {
    try {
      // Check if model file exists
      try {
        await fs.access(this.config.modelPath);
      } catch {
        console.warn(
          `ArcFace model not found at ${this.config.modelPath}. ` +
          'Face embedding extraction will not be available.',
        );
        this.isInitialized = false;
        return;
      }

      // Create ONNX session
      this.session = await ort.InferenceSession.create(
        this.config.modelPath,
        {
          executionProviders: this.config.executionProviders as any,
          graphOptimizationLevel: 'all',
          enableCpuMemArena: true,
          enableMemPattern: true,
        },
      );

      // Discover input/output names
      this.inputName = this.session.inputNames[0] || 'input';
      this.outputName = this.session.outputNames[0] || 'output';

      console.log(`✓ Loaded ArcFace model: ${this.config.modelName} v${this.config.modelVersion}`);
      console.log(`  - Input: ${this.inputName}`);
      console.log(`  - Output: ${this.outputName}`);
      console.log(`  - Embedding dimension: ${this.config.embeddingDimension}`);
      console.log(`  - Execution providers: ${this.config.executionProviders.join(', ')}`);

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize FaceEmbeddingService:', error);
      this.session = null;
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Extract embedding from aligned face image
   */
  async extractEmbedding(
    alignedFace: Float32Array,
    quality?: number,
    pose?: { yaw?: number; pitch?: number; roll?: number },
  ): Promise<FaceEmbedding> {
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

    const rawEmbedding = outputTensor.data as Float32Array;

    // Validate dimension
    if (rawEmbedding.length !== this.config.embeddingDimension) {
      throw new Error(
        `Unexpected embedding dimension: expected ${this.config.embeddingDimension}, ` +
        `got ${rawEmbedding.length}`,
      );
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
  async extractEmbeddingsBatch(
    alignedFaces: Float32Array[],
    qualities?: number[],
    poses?: Array<{ yaw?: number; pitch?: number; roll?: number }>,
  ): Promise<FaceEmbedding[]> {
    if (!this.isInitialized || !this.session) {
      throw new Error('FaceEmbeddingService not initialized or model unavailable');
    }

    const batchSize = alignedFaces.length;
    if (batchSize === 0) {
      return [];
    }

    // For now, process sequentially
    // In production, you could implement true batching with shape [N, 3, 112, 112]
    const embeddings: FaceEmbedding[] = [];

    for (let i = 0; i < batchSize; i++) {
      const embedding = await this.extractEmbedding(
        alignedFaces[i],
        qualities?.[i],
        poses?.[i],
      );
      embeddings.push(embedding);
    }

    return embeddings;
  }

  /**
   * L2 normalize vector
   */
  private l2Normalize(vector: Float32Array): Float32Array {
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
  validateNormalization(embedding: Float32Array): boolean {
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
  cosineSimilarity(a: Float32Array, b: Float32Array): number {
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
  async cleanup(): Promise<void> {
    if (this.session) {
      // ONNX Runtime doesn't require explicit cleanup in Node.js
      this.session = null;
    }
    this.isInitialized = false;
  }

  /**
   * Get health status
   */
  getHealth(): {
    available: boolean;
    modelName: string;
    modelVersion: string;
    embeddingDimension: number;
  } {
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
  updateConfig(config: Partial<FaceEmbeddingConfig>): void {
    this.config = { ...this.config, ...config };
    this.isInitialized = false;
  }

  /**
   * Get current configuration
   */
  getConfig(): FaceEmbeddingConfig {
    return { ...this.config };
  }
}
