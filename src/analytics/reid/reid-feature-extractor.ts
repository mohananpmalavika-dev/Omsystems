/**
 * Visual Feature Extractor & Mathematical Engine for Multi-Camera Person Re-ID
 * 
 * Implements 512-dimensional L2-normalized feature representation,
 * exact cosine distance metrics, spatial-color part decomposition,
 * visual quality grading, and tracklet quality-weighted aggregation (QWAP).
 */

export const REID_EMBEDDING_DIMENSION = 512;

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QualityMetrics {
  confidence: number;
  aspectRatio: number;
  resolutionScore: number;
  sharpnessScore: number;
  overallQuality: number;
  isAcceptable: boolean;
  rejectionReason?: string;
}

export interface FrameEmbeddingSample {
  embedding: number[];
  confidence: number;
  quality: QualityMetrics;
  timestamp: number; // Unix epoch ms
  frameId?: string;
  boundingBox?: BoundingBox;
}

export interface TrackletAggregationResult {
  representativeEmbedding: number[];
  averageConfidence: number;
  averageQuality: number;
  sampleCount: number;
  rejectedSampleCount: number;
  durationMs: number;
}

export class ReidFeatureExtractor {
  private readonly minQualityThreshold: number;
  private readonly minHeight: number;
  private readonly minWidth: number;

  constructor(options?: {
    minQualityThreshold?: number;
    minHeight?: number;
    minWidth?: number;
  }) {
    this.minQualityThreshold = options?.minQualityThreshold ?? 0.55;
    this.minHeight = options?.minHeight ?? 60;
    this.minWidth = options?.minWidth ?? 20;
  }

  /**
   * Normalize an embedding vector to unit L2 Euclidean length (||v||_2 = 1.0)
   */
  public static normalizeL2(vector: number[]): number[] {
    if (!Array.isArray(vector) || vector.length !== REID_EMBEDDING_DIMENSION) {
      throw new Error(
        `ReID embedding vector must have exactly ${REID_EMBEDDING_DIMENSION} finite dimensions (received ${vector?.length ?? 0})`
      );
    }

    let sumSquares = 0;
    for (let i = 0; i < vector.length; i++) {
      const val = vector[i];
      if (!Number.isFinite(val)) {
        throw new Error(`Embedding component at index ${i} is non-finite: ${val}`);
      }
      sumSquares += val * val;
    }

    const norm = Math.sqrt(sumSquares);
    if (norm < 1e-12) {
      throw new Error('Cannot normalize degenerate zero-vector embedding');
    }

    const result = new Array<number>(vector.length);
    for (let i = 0; i < vector.length; i++) {
      result[i] = vector[i] / norm;
    }
    return result;
  }

  /**
   * Compute exact cosine similarity between two normalized vectors: u · v
   * Range: [-1.0, 1.0] (for normalized unit vectors, standard range is 0.0 to 1.0 for visual features)
   */
  public static cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error(
        `Vector length mismatch: ${vectorA.length} vs ${vectorB.length}`
      );
    }

    let dot = 0;
    for (let i = 0; i < vectorA.length; i++) {
      dot += vectorA[i] * vectorB[i];
    }

    // Clamp for IEEE-754 precision tolerance
    return Math.max(-1.0, Math.min(1.0, dot));
  }

  /**
   * Compute cosine distance: 1 - cosine_similarity
   * Range: [0.0, 2.0], where 0.0 indicates identical identity.
   */
  public static cosineDistance(vectorA: number[], vectorB: number[]): number {
    return 1.0 - ReidFeatureExtractor.cosineSimilarity(vectorA, vectorB);
  }

  /**
   * Calculate comprehensive visual quality score for a detected person crop
   */
  public evaluateQuality(
    boundingBox: BoundingBox,
    confidence: number,
    sharpnessProxy?: number
  ): QualityMetrics {
    const { width, height } = boundingBox;

    // 1. Aspect Ratio: Ideal standing person aspect ratio (H/W) is between 1.8 and 3.8
    const aspectRatio = width > 0 ? height / width : 0;
    let aspectScore = 0;
    if (aspectRatio >= 1.8 && aspectRatio <= 3.8) {
      aspectScore = 1.0;
    } else if (aspectRatio >= 1.3 && aspectRatio < 1.8) {
      aspectScore = (aspectRatio - 1.3) / 0.5; // Linear penalty for squatting/leaning
    } else if (aspectRatio > 3.8 && aspectRatio <= 5.0) {
      aspectScore = (5.0 - aspectRatio) / 1.2; // Linear penalty for extreme vertical crop
    } else {
      aspectScore = 0.1;
    }

    // 2. Resolution Score: Evaluates whether pixel count provides sufficient visual detail
    let resolutionScore = 0;
    if (height >= this.minHeight * 2 && width >= this.minWidth * 2) {
      resolutionScore = 1.0;
    } else if (height >= this.minHeight && width >= this.minWidth) {
      resolutionScore = 0.5 + 0.5 * Math.min(height / (this.minHeight * 2), width / (this.minWidth * 2));
    } else {
      resolutionScore = Math.max(0.1, (height / this.minHeight) * 0.5);
    }

    // 3. Sharpness Score (default to 0.85 if no pixel gradient provided)
    const sharpnessScore = sharpnessProxy !== undefined ? Math.max(0, Math.min(1.0, sharpnessProxy)) : 0.85;

    // 4. Bounded Confidence Score
    const boundedConfidence = Math.max(0, Math.min(1.0, confidence));

    // Weighted composite quality:
    // Confidence (35%) + Resolution (25%) + Aspect Ratio (20%) + Sharpness (20%)
    const overallQuality =
      0.35 * boundedConfidence +
      0.25 * resolutionScore +
      0.20 * aspectScore +
      0.20 * sharpnessScore;

    let isAcceptable = true;
    let rejectionReason: string | undefined;

    if (height < this.minHeight || width < this.minWidth) {
      isAcceptable = false;
      rejectionReason = `Crop dimensions (${Math.round(width)}x${Math.round(height)}) below minimum (${this.minWidth}x${this.minHeight})`;
    } else if (overallQuality < this.minQualityThreshold) {
      isAcceptable = false;
      rejectionReason = `Visual quality score ${overallQuality.toFixed(2)} below threshold ${this.minQualityThreshold.toFixed(2)}`;
    }

    return {
      confidence: boundedConfidence,
      aspectRatio,
      resolutionScore,
      sharpnessScore,
      overallQuality: Math.max(0, Math.min(1.0, overallQuality)),
      isAcceptable,
      rejectionReason,
    };
  }

  /**
   * Aggregate multiple frame observations into a single representative tracklet embedding
   * using Quality-Weighted Average Pooling (QWAP) and outlier pruning.
   */
  public aggregateTracklet(samples: FrameEmbeddingSample[]): TrackletAggregationResult {
    if (!samples || samples.length === 0) {
      throw new Error('Cannot aggregate an empty tracklet sample set');
    }

    const acceptedSamples: FrameEmbeddingSample[] = [];
    let rejectedCount = 0;

    for (const sample of samples) {
      if (sample.quality.isAcceptable && sample.quality.overallQuality >= this.minQualityThreshold) {
        acceptedSamples.push(sample);
      } else {
        rejectedCount++;
      }
    }

    // If all samples were rejected, fall back to the single highest quality sample
    const pool = acceptedSamples.length > 0
      ? acceptedSamples
      : [...samples].sort((a, b) => b.quality.overallQuality - a.quality.overallQuality).slice(0, 1);

    // Sum quality-weighted vectors
    const aggregated = new Array<number>(REID_EMBEDDING_DIMENSION).fill(0);
    let totalWeight = 0;
    let sumConfidence = 0;
    let sumQuality = 0;

    for (const s of pool) {
      const weight = s.quality.overallQuality * s.confidence;
      totalWeight += weight;
      sumConfidence += s.confidence;
      sumQuality += s.quality.overallQuality;

      for (let i = 0; i < REID_EMBEDDING_DIMENSION; i++) {
        aggregated[i] += s.embedding[i] * weight;
      }
    }

    const normalized = ReidFeatureExtractor.normalizeL2(aggregated);

    const minTime = Math.min(...samples.map((s) => s.timestamp));
    const maxTime = Math.max(...samples.map((s) => s.timestamp));

    return {
      representativeEmbedding: normalized,
      averageConfidence: sumConfidence / pool.length,
      averageQuality: sumQuality / pool.length,
      sampleCount: pool.length,
      rejectedSampleCount: rejectedCount,
      durationMs: Math.max(0, maxTime - minTime),
    };
  }

  /**
   * Update gallery identity embedding using Exponential Moving Average (EMA)
   * Formula: e_new = Normalize(alpha * e_gallery + (1 - alpha) * e_new)
   */
  public static updateGalleryEmbedding(
    galleryEmbedding: number[],
    newTrackletEmbedding: number[],
    alpha: number = 0.85
  ): number[] {
    const safeAlpha = Math.max(0.1, Math.min(0.95, alpha));
    const updated = new Array<number>(REID_EMBEDDING_DIMENSION);

    for (let i = 0; i < REID_EMBEDDING_DIMENSION; i++) {
      updated[i] = safeAlpha * galleryEmbedding[i] + (1 - safeAlpha) * newTrackletEmbedding[i];
    }

    return ReidFeatureExtractor.normalizeL2(updated);
  }

  /**
   * Deterministic visual descriptor extractor from raw image pixels
   * Uses spatial 3-part partition (Head/Torso/Legs) with color HSV histograms
   * and gradient texture variance to generate a calibrated 512-d unit vector.
   */
  public extractFromRgbBuffer(
    rgb: Uint8Array,
    width: number,
    height: number,
    channels: 3 | 4 = 3
  ): number[] {
    if (width < 4 || height < 6) {
      throw new Error(`Crop dimensions too small for ReID extraction: ${width}x${height}`);
    }

    const embedding = new Array<number>(REID_EMBEDDING_DIMENSION).fill(0);

    // Three vertical body segments:
    // Segment 0 (Head): Top 20%
    // Segment 1 (Torso): Middle 40%
    // Segment 2 (Legs): Bottom 40%
    const headEnd = Math.floor(height * 0.20);
    const torsoEnd = Math.floor(height * 0.60);

    const binsPerPart = 150; // 3 parts * 150 = 450 bins; remaining 62 bins for spatial texture

    // Color histogram bins per part: Hue (16 bins), Saturation (8 bins), Value (8 bins) = 32 color bins
    // Replicated with spatial horizontal halves (left/right) to preserve lateral symmetry
    for (let y = 0; y < height; y++) {
      const partIdx = y < headEnd ? 0 : y < torsoEnd ? 1 : 2;
      const partOffset = partIdx * binsPerPart;

      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const r = rgb[idx];
        const g = rgb[idx + 1];
        const b = rgb[idx + 2];

        // RGB to HSV
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let h = 0;
        if (delta !== 0) {
          if (max === r) h = ((g - b) / delta) % 6;
          else if (max === g) h = (b - r) / delta + 2;
          else h = (r - g) / delta + 4;
          h = Math.round(h * 60);
          if (h < 0) h += 360;
        }

        const s = max === 0 ? 0 : delta / max;
        const v = max / 255;

        // Quantize HSV
        const hBin = Math.min(15, Math.floor((h / 360) * 16));
        const sBin = Math.min(7, Math.floor(s * 8));
        const vBin = Math.min(7, Math.floor(v * 8));

        const isRightHalf = x >= Math.floor(width / 2);
        const halfOffset = isRightHalf ? 40 : 0;

        embedding[partOffset + halfOffset + hBin] += 1.0;
        embedding[partOffset + halfOffset + 16 + sBin] += 1.0;
        embedding[partOffset + halfOffset + 24 + vBin] += 1.0;
      }
    }

    // Spatial gradients & texture features across remaining bins (450 to 511)
    let textureOffset = 450;
    for (let y = 1; y < height - 1 && textureOffset < REID_EMBEDDING_DIMENSION - 2; y += Math.max(1, Math.floor(height / 16))) {
      for (let x = 1; x < width - 1 && textureOffset < REID_EMBEDDING_DIMENSION - 2; x += Math.max(1, Math.floor(width / 4))) {
        const idxCurr = (y * width + x) * channels;
        const idxRight = (y * width + (x + 1)) * channels;
        const idxDown = ((y + 1) * width + x) * channels;

        const gx = Math.abs(rgb[idxRight] - rgb[idxCurr]);
        const gy = Math.abs(rgb[idxDown] - rgb[idxCurr]);

        embedding[textureOffset++] += gx / 255;
        embedding[textureOffset++] += gy / 255;
      }
    }

    return ReidFeatureExtractor.normalizeL2(embedding);
  }
}
