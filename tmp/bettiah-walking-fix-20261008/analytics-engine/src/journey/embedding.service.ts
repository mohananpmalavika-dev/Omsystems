/**
 * ReID Embedding Service
 * 
 * Handles embedding quality assessment, track-level embedding accumulation,
 * and representative embedding generation.
 * 
 * Key principles:
 * - One embedding per track, not per frame
 * - Quality filtering to reject poor samples
 * - Weighted averaging based on quality
 * - Robust aggregation strategies
 */

import type {
  ReIdSample,
  EmbeddingQuality,
  TrackEmbeddingState,
  BoundingBox
} from './journey.types.js';

/**
 * Configuration for embedding service
 */
export interface EmbeddingServiceConfig {
  minQualityThreshold: number;      // Minimum quality to accept sample (default: 0.7)
  maxSamplesPerTrack: number;       // Max samples to keep (default: 10)
  targetSampleInterval: number;     // Target frames between samples (default: 5)
  useMedianAggregation: boolean;    // Use median instead of weighted average (default: false)
  minResolution: number;            // Minimum crop resolution (default: 64x64)
}

const DEFAULT_CONFIG: EmbeddingServiceConfig = {
  minQualityThreshold: 0.7,
  maxSamplesPerTrack: 10,
  targetSampleInterval: 5,
  useMedianAggregation: false,
  minResolution: 64
};

/**
 * Track-level embedding accumulator
 */
export class TrackEmbeddingAccumulator {
  private samples: ReIdSample[] = [];
  private framesSinceLastSample = 0;
  
  constructor(
    private config: EmbeddingServiceConfig = DEFAULT_CONFIG
  ) {}
  
  /**
   * Add a new embedding sample from a frame
   */
  add(
    embedding: Float32Array,
    confidence: number,
    quality: EmbeddingQuality,
    frameId?: string,
    timestamp?: Date,
    boundingBox?: BoundingBox
  ): boolean {
    this.framesSinceLastSample++;
    
    // Calculate overall quality score
    const overallQuality = this.calculateOverallQuality(quality, confidence, boundingBox);
    
    // Reject low-quality samples
    if (overallQuality < this.config.minQualityThreshold) {
      return false;
    }
    
    // Skip if not enough frames have passed (for efficiency)
    if (this.framesSinceLastSample < this.config.targetSampleInterval) {
      return false;
    }
    
    // Add sample
    this.samples.push({
      embedding,
      confidence,
      quality,
      frameId,
      timestamp: timestamp || new Date(),
      boundingBox
    });
    
    this.framesSinceLastSample = 0;
    
    // Keep only best N samples if we exceed limit
    if (this.samples.length > this.config.maxSamplesPerTrack) {
      this.samples.sort((a, b) => {
        const qualityA = this.calculateOverallQuality(a.quality, a.confidence, a.boundingBox);
        const qualityB = this.calculateOverallQuality(b.quality, b.confidence, b.boundingBox);
        return qualityB - qualityA;
      });
      this.samples = this.samples.slice(0, this.config.maxSamplesPerTrack);
    }
    
    return true;
  }
  
  /**
   * Get representative embedding for the track
   */
  getRepresentativeEmbedding(): Float32Array | null {
    if (this.samples.length === 0) {
      return null;
    }
    
    if (this.config.useMedianAggregation) {
      return this.computeMedianEmbedding();
    } else {
      return this.computeWeightedAverageEmbedding();
    }
  }
  
  /**
   * Get average quality of all samples
   */
  getAverageQuality(): number {
    if (this.samples.length === 0) {
      return 0;
    }
    
    const totalQuality = this.samples.reduce((sum, sample) => {
      return sum + this.calculateOverallQuality(sample.quality, sample.confidence, sample.boundingBox);
    }, 0);
    
    return totalQuality / this.samples.length;
  }
  
  /**
   * Get number of samples collected
   */
  getSampleCount(): number {
    return this.samples.length;
  }
  
  /**
   * Get all samples (for debugging or advanced use)
   */
  getSamples(): ReIdSample[] {
    return [...this.samples];
  }
  
  /**
   * Get current state
   */
  getState(): TrackEmbeddingState {
    return {
      samples: [...this.samples],
      representativeEmbedding: this.getRepresentativeEmbedding(),
      averageQuality: this.getAverageQuality()
    };
  }
  
  /**
   * Calculate overall quality score
   */
  private calculateOverallQuality(
    quality: EmbeddingQuality,
    confidence: number,
    boundingBox?: BoundingBox
  ): number {
    // Weight factors for each quality component
    const weights = {
      resolution: 0.25,
      occlusion: 0.20,
      blur: 0.20,
      visibility: 0.15,
      pose: 0.10,
      lighting: 0.10
    };
    
    let score = 
      quality.resolution * weights.resolution +
      quality.occlusion * weights.occlusion +
      quality.blur * weights.blur +
      quality.visibility * weights.visibility +
      quality.pose * weights.pose +
      quality.lighting * weights.lighting;
    
    // Factor in detection confidence
    score = score * 0.9 + confidence * 0.1;
    
    // Penalize very small crops
    if (boundingBox) {
      const area = boundingBox.width * boundingBox.height;
      const minArea = (this.config.minResolution / 1000) ** 2; // Normalized to 0-1 range
      if (area < minArea) {
        score *= (area / minArea);
      }
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Compute weighted average embedding
   */
  private computeWeightedAverageEmbedding(): Float32Array {
    const dimensions = this.samples[0].embedding.length;
    const result = new Float32Array(dimensions);
    
    // Calculate weights based on quality
    const weights = this.samples.map(sample => 
      this.calculateOverallQuality(sample.quality, sample.confidence, sample.boundingBox)
    );
    
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    
    // Weighted sum
    for (let i = 0; i < dimensions; i++) {
      let weightedSum = 0;
      for (let j = 0; j < this.samples.length; j++) {
        weightedSum += this.samples[j].embedding[i] * weights[j];
      }
      result[i] = weightedSum / totalWeight;
    }
    
    // Normalize to unit length (important for cosine similarity)
    return this.normalizeEmbedding(result);
  }
  
  /**
   * Compute median embedding (robust to outliers)
   */
  private computeMedianEmbedding(): Float32Array {
    const dimensions = this.samples[0].embedding.length;
    const result = new Float32Array(dimensions);
    
    // For each dimension, compute median across all samples
    for (let i = 0; i < dimensions; i++) {
      const values = this.samples.map(sample => sample.embedding[i]);
      values.sort((a, b) => a - b);
      
      const mid = Math.floor(values.length / 2);
      if (values.length % 2 === 0) {
        result[i] = (values[mid - 1] + values[mid]) / 2;
      } else {
        result[i] = values[mid];
      }
    }
    
    // Normalize to unit length
    return this.normalizeEmbedding(result);
  }
  
  /**
   * Normalize embedding to unit length
   */
  private normalizeEmbedding(embedding: Float32Array): Float32Array {
    let magnitude = 0;
    for (let i = 0; i < embedding.length; i++) {
      magnitude += embedding[i] * embedding[i];
    }
    magnitude = Math.sqrt(magnitude);
    
    if (magnitude < 1e-10) {
      return embedding; // Avoid division by zero
    }
    
    const normalized = new Float32Array(embedding.length);
    for (let i = 0; i < embedding.length; i++) {
      normalized[i] = embedding[i] / magnitude;
    }
    
    return normalized;
  }
}

/**
 * Embedding Quality Assessor
 */
export class EmbeddingQualityAssessor {
  /**
   * Assess quality of a person crop for ReID
   */
  static assessPersonCropQuality(
    boundingBox: BoundingBox,
    confidence: number,
    frameWidth: number,
    frameHeight: number,
    metadata?: {
      isOccluded?: boolean;
      occlusionRatio?: number;
      motionBlur?: number;
      lighting?: 'good' | 'poor' | 'backlit';
      pose?: 'frontal' | 'side' | 'back';
    }
  ): EmbeddingQuality {
    // Resolution quality (based on crop size)
    const cropWidth = boundingBox.width * frameWidth;
    const cropHeight = boundingBox.height * frameHeight;
    const cropArea = cropWidth * cropHeight;
    const resolution = this.assessResolution(cropArea);
    
    // Occlusion assessment
    const occlusionRatio = metadata?.occlusionRatio ?? 0;
    const occlusion = 1 - occlusionRatio;
    
    // Blur assessment
    const blur = metadata?.motionBlur !== undefined 
      ? 1 - metadata.motionBlur 
      : 0.8; // Assume reasonable by default
    
    // Visibility (combination of size and position)
    const visibility = this.assessVisibility(boundingBox, cropWidth, cropHeight);
    
    // Pose quality
    const pose = this.assessPose(metadata?.pose);
    
    // Lighting quality
    const lighting = this.assessLighting(metadata?.lighting);
    
    return {
      resolution,
      occlusion,
      blur,
      visibility,
      pose,
      lighting
    };
  }
  
  /**
   * Assess resolution based on crop area
   */
  private static assessResolution(cropArea: number): number {
    // Ideal crop: > 128x128 = 16384 pixels
    // Minimum: 64x64 = 4096 pixels
    const idealArea = 128 * 128;
    const minArea = 64 * 64;
    
    if (cropArea >= idealArea) {
      return 1.0;
    } else if (cropArea <= minArea) {
      return 0.3;
    } else {
      // Linear interpolation
      return 0.3 + 0.7 * ((cropArea - minArea) / (idealArea - minArea));
    }
  }
  
  /**
   * Assess visibility based on position and size
   */
  private static assessVisibility(
    bbox: BoundingBox,
    cropWidth: number,
    cropHeight: number
  ): number {
    let score = 1.0;
    
    // Penalize if person is too close to frame edges (likely truncated)
    const edgeMargin = 0.05; // 5% margin
    
    if (bbox.x < edgeMargin) score *= 0.8;
    if (bbox.y < edgeMargin) score *= 0.9;
    if (bbox.x + bbox.width > 1 - edgeMargin) score *= 0.8;
    if (bbox.y + bbox.height > 1 - edgeMargin) score *= 0.9;
    
    // Penalize very small or very large crops
    const aspectRatio = cropHeight / Math.max(cropWidth, 1);
    const idealAspectRatio = 2.5; // Typical person aspect ratio
    
    if (aspectRatio < 1.5 || aspectRatio > 4.0) {
      score *= 0.7; // Unusual aspect ratio
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Assess pose quality
   */
  private static assessPose(pose?: 'frontal' | 'side' | 'back'): number {
    switch (pose) {
      case 'frontal':
        return 1.0;
      case 'side':
        return 0.8;
      case 'back':
        return 0.5;
      default:
        return 0.85; // Unknown, assume reasonable
    }
  }
  
  /**
   * Assess lighting quality
   */
  private static assessLighting(lighting?: 'good' | 'poor' | 'backlit'): number {
    switch (lighting) {
      case 'good':
        return 1.0;
      case 'poor':
        return 0.6;
      case 'backlit':
        return 0.4;
      default:
        return 0.8; // Unknown, assume reasonable
    }
  }
}

/**
 * Embedding Service - main interface
 */
export class EmbeddingService {
  constructor(
    private config: EmbeddingServiceConfig = DEFAULT_CONFIG
  ) {}
  
  /**
   * Create a track embedding accumulator
   */
  createTrackAccumulator(): TrackEmbeddingAccumulator {
    return new TrackEmbeddingAccumulator(this.config);
  }
  
  /**
   * Create representative embedding from completed track
   */
  async createRepresentativeEmbedding(
    samples: ReIdSample[]
  ): Promise<{
    embedding: Float32Array;
    quality: number;
    sampleCount: number;
  }> {
    if (samples.length === 0) {
      throw new Error('Cannot create representative embedding from zero samples');
    }
    
    const accumulator = new TrackEmbeddingAccumulator(this.config);
    
    // Add all samples
    for (const sample of samples) {
      accumulator.add(
        sample.embedding,
        sample.confidence,
        sample.quality,
        sample.frameId,
        sample.timestamp,
        sample.boundingBox
      );
    }
    
    const embedding = accumulator.getRepresentativeEmbedding();
    if (!embedding) {
      throw new Error('Failed to generate representative embedding');
    }
    
    return {
      embedding,
      quality: accumulator.getAverageQuality(),
      sampleCount: accumulator.getSampleCount()
    };
  }
  
  /**
   * Calculate cosine similarity between two embeddings
   */
  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same dimensions');
    }
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }
    
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    if (magnitudeA < 1e-10 || magnitudeB < 1e-10) {
      return 0;
    }
    
    return dotProduct / (magnitudeA * magnitudeB);
  }
  
  /**
   * Validate embedding dimensions and values
   */
  static validateEmbedding(embedding: Float32Array, expectedDimensions: number = 512): boolean {
    if (embedding.length !== expectedDimensions) {
      return false;
    }
    
    // Check for NaN or Infinity
    for (let i = 0; i < embedding.length; i++) {
      if (!isFinite(embedding[i])) {
        return false;
      }
    }
    
    // Check magnitude is reasonable
    let magnitude = 0;
    for (let i = 0; i < embedding.length; i++) {
      magnitude += embedding[i] * embedding[i];
    }
    magnitude = Math.sqrt(magnitude);
    
    // Embedding should have some magnitude
    if (magnitude < 1e-6) {
      return false;
    }
    
    return true;
  }
}

/**
 * Global singleton instance
 */
let embeddingServiceInstance: EmbeddingService | null = null;

/**
 * Get or create embedding service instance
 */
export function getEmbeddingService(config?: Partial<EmbeddingServiceConfig>): EmbeddingService {
  if (!embeddingServiceInstance) {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    embeddingServiceInstance = new EmbeddingService(finalConfig);
  }
  return embeddingServiceInstance;
}
