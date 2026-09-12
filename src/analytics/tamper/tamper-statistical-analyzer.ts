/**
 * Camera Tamper & Defocus Statistical Frame Analyzer
 * 
 * Production-ready computer vision analysis using mathematical frame statistics:
 * 1. Discrete Laplacian operator variance for defocus / blur detection
 * 2. ITU-R BT.601 luminance & histogram analysis for blinding / glare detection
 * 3. Spatial luminance collapse for lens covering / occlusion detection
 * 4. Multi-block Structural Similarity (SSIM) & L1 distance for camera movement
 * 5. Edge gradient energy & Shannon entropy collapse for spray paint detection
 */

import { createHash } from 'node:crypto';
import type {
  TamperMetrics,
  TamperEvaluationResult,
  TamperType,
  TamperSeverity,
  CameraTamperBaselineRecord,
  CameraTamperConfigRecord,
} from './tamper-types.js';

export interface FrameDimensions {
  width: number;
  height: number;
  channels?: 1 | 3 | 4; // 1 = Grayscale, 3 = RGB, 4 = RGBA
}

export interface TamperAnalysisOptions {
  dimensions?: FrameDimensions;
  baseline?: CameraTamperBaselineRecord | null;
  config?: Partial<CameraTamperConfigRecord>;
}

export class TamperStatisticalAnalyzer {
  /**
   * Convert any RGB/RGBA/Grayscale buffer into a single-channel 8-bit luma buffer (Y)
   * Using ITU-R BT.601 coefficients: Y = 0.299*R + 0.587*G + 0.114*B
   */
  public static extractLuma(
    buffer: Uint8Array | Buffer,
    width: number,
    height: number,
    channels: 1 | 3 | 4 = 3
  ): Uint8Array {
    const pixelCount = width * height;
    const luma = new Uint8Array(pixelCount);

    if (channels === 1) {
      if (buffer.length < pixelCount) {
        throw new Error(`Buffer length ${buffer.length} is smaller than required grayscale ${pixelCount}`);
      }
      luma.set(buffer.subarray(0, pixelCount));
      return luma;
    }

    const step = channels;
    if (buffer.length < pixelCount * step) {
      throw new Error(`Buffer length ${buffer.length} is smaller than required ${pixelCount * step}`);
    }

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * step;
      const r = buffer[offset]!;
      const g = buffer[offset + 1]!;
      const b = buffer[offset + 2]!;
      luma[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    return luma;
  }

  /**
   * Compute 256-bin histogram and basic luminance distribution statistics
   */
  public static computeLuminanceStats(luma: Uint8Array): {
    luminance: number;
    variance: number;
    highlightFraction: number;
    shadowFraction: number;
    histogram: number[];
  } {
    const N = luma.length;
    if (N === 0) {
      return { luminance: 0, variance: 0, highlightFraction: 0, shadowFraction: 0, histogram: new Array(256).fill(0) };
    }

    const histogram = new Array(256).fill(0);
    let sum = 0;
    let sumSq = 0;
    let highlightCount = 0;
    let shadowCount = 0;

    for (let i = 0; i < N; i++) {
      const val = luma[i]!;
      histogram[val]++;
      sum += val;
      sumSq += val * val;
      if (val >= 240) highlightCount++;
      if (val <= 15) shadowCount++;
    }

    const luminance = sum / N;
    const variance = Math.max(0, sumSq / N - luminance * luminance);

    return {
      luminance: Math.round(luminance * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      highlightFraction: Math.round((highlightCount / N) * 1000) / 1000,
      shadowFraction: Math.round((shadowCount / N) * 1000) / 1000,
      histogram,
    };
  }

  /**
   * Compute Discrete Laplacian Operator Variance: Var(∇² I)
   * 
   * High focus = crisp edges = high positive & negative 2nd derivatives = high variance
   * Defocused / blurred = smoothed gradients = low variance
   * 
   * Uses 8-connected discrete Laplacian kernel:
   * [ -1, -1, -1 ]
   * [ -1,  8, -1 ]
   * [ -1, -1, -1 ]
   */
  public static computeLaplacianVariance(luma: Uint8Array, width: number, height: number): number {
    if (width < 3 || height < 3) return 0;

    const interiorPixels = (width - 2) * (height - 2);
    if (interiorPixels <= 0) return 0;

    let lapSum = 0;
    let lapSumSq = 0;

    for (let y = 1; y < height - 1; y++) {
      const rowOffset = y * width;
      const prevRowOffset = (y - 1) * width;
      const nextRowOffset = (y + 1) * width;

      for (let x = 1; x < width - 1; x++) {
        const center = luma[rowOffset + x]!;
        // 8-neighbor sum
        const neighbors =
          luma[prevRowOffset + x - 1]! +
          luma[prevRowOffset + x]! +
          luma[prevRowOffset + x + 1]! +
          luma[rowOffset + x - 1]! +
          luma[rowOffset + x + 1]! +
          luma[nextRowOffset + x - 1]! +
          luma[nextRowOffset + x]! +
          luma[nextRowOffset + x + 1]!;

        const lap = 8 * center - neighbors;
        lapSum += lap;
        lapSumSq += lap * lap;
      }
    }

    const meanLap = lapSum / interiorPixels;
    const varLap = Math.max(0, lapSumSq / interiorPixels - meanLap * meanLap);
    return Math.round(varLap * 100) / 100;
  }

  /**
   * Compute edge pixel density using discrete Sobel gradient magnitude thresholding
   */
  public static computeEdgeDensity(
    luma: Uint8Array,
    width: number,
    height: number,
    gradientThreshold = 35
  ): number {
    if (width < 3 || height < 3) return 0;

    const interiorPixels = (width - 2) * (height - 2);
    if (interiorPixels <= 0) return 0;

    let edgeCount = 0;

    for (let y = 1; y < height - 1; y++) {
      const r0 = (y - 1) * width;
      const r1 = y * width;
      const r2 = (y + 1) * width;

      for (let x = 1; x < width - 1; x++) {
        // Sobel X:
        // [-1 0 1]
        // [-2 0 2]
        // [-1 0 1]
        const gx =
          -luma[r0 + x - 1]! + luma[r0 + x + 1]! -
          2 * luma[r1 + x - 1]! + 2 * luma[r1 + x + 1]! -
          luma[r2 + x - 1]! + luma[r2 + x + 1]!;

        // Sobel Y:
        // [-1 -2 -1]
        // [ 0  0  0]
        // [ 1  2  1]
        const gy =
          -luma[r0 + x - 1]! - 2 * luma[r0 + x]! - luma[r0 + x + 1]! +
          luma[r2 + x - 1]! + 2 * luma[r2 + x]! + luma[r2 + x + 1]!;

        const mag = Math.abs(gx) + Math.abs(gy);
        if (mag >= gradientThreshold) {
          edgeCount++;
        }
      }
    }

    return Math.round((edgeCount / interiorPixels) * 1000) / 1000;
  }

  /**
   * Compute Shannon entropy of the 256-bin luminance histogram
   * H = - \sum p(k) * log2(p(k))
   * Range: 0.0 (completely flat mono-color) to 8.0 (perfectly uniform distribution)
   */
  public static computeSpatialEntropy(histogram: number[], totalPixels: number): number {
    if (totalPixels <= 0) return 0;

    let entropy = 0;
    for (let k = 0; k < 256; k++) {
      const count = histogram[k]!;
      if (count > 0) {
        const p = count / totalPixels;
        entropy -= p * Math.log2(p);
      }
    }

    return Math.round(entropy * 100) / 100;
  }

  /**
   * Compute multi-block Structural Similarity Index (SSIM) and L1 Scene Change
   */
  public static computeStructuralMetrics(
    lumaCurrent: Uint8Array,
    lumaBaseline: Uint8Array,
    width: number,
    height: number,
    blockSize = 16
  ): { structuralSimilarity: number; sceneChangeScore: number } {
    const N = lumaCurrent.length;
    if (N === 0 || lumaBaseline.length !== N) {
      return { structuralSimilarity: 1.0, sceneChangeScore: 0.0 };
    }

    // 1. Global normalized L1 difference
    let l1Diff = 0;
    for (let i = 0; i < N; i++) {
      l1Diff += Math.abs(lumaCurrent[i]! - lumaBaseline[i]!);
    }
    const sceneChangeScore = Math.min(1.0, l1Diff / (N * 255));

    // 2. Block-based SSIM
    const blocksX = Math.floor(width / blockSize);
    const blocksY = Math.floor(height / blockSize);
    if (blocksX === 0 || blocksY === 0) {
      return {
        structuralSimilarity: Math.max(0, 1.0 - sceneChangeScore),
        sceneChangeScore: Math.round(sceneChangeScore * 1000) / 1000,
      };
    }

    const C1 = 6.5025; // (0.01 * 255)^2
    const C2 = 58.5225; // (0.03 * 255)^2
    let ssimTotal = 0;
    let blockCount = 0;

    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        let sumX = 0;
        let sumY = 0;
        let sumX2 = 0;
        let sumY2 = 0;
        let sumXY = 0;
        const M = blockSize * blockSize;

        for (let dy = 0; dy < blockSize; dy++) {
          const row = (by * blockSize + dy) * width;
          for (let dx = 0; dx < blockSize; dx++) {
            const idx = row + (bx * blockSize + dx);
            const x = lumaCurrent[idx]!;
            const y = lumaBaseline[idx]!;
            sumX += x;
            sumY += y;
            sumX2 += x * x;
            sumY2 += y * y;
            sumXY += x * y;
          }
        }

        const muX = sumX / M;
        const muY = sumY / M;
        const varX = Math.max(0, sumX2 / M - muX * muX);
        const varY = Math.max(0, sumY2 / M - muY * muY);
        const covXY = sumXY / M - muX * muY;

        const numerator = (2 * muX * muY + C1) * (2 * covXY + C2);
        const denominator = (muX * muX + muY * muY + C1) * (varX + varY + C2);
        const ssimBlock = denominator > 0 ? numerator / denominator : 1.0;

        ssimTotal += ssimBlock;
        blockCount++;
      }
    }

    const avgSsim = blockCount > 0 ? ssimTotal / blockCount : 1.0;
    const clampedSsim = Math.max(0.0, Math.min(1.0, avgSsim));

    return {
      structuralSimilarity: Math.round(clampedSsim * 1000) / 1000,
      sceneChangeScore: Math.round(sceneChangeScore * 1000) / 1000,
    };
  }

  /**
   * Compute full frame metrics
   */
  public static analyzeFrame(
    frameBuffer: Uint8Array | Buffer,
    width: number,
    height: number,
    channels: 1 | 3 | 4 = 3,
    baselineLuma?: Uint8Array
  ): { metrics: TamperMetrics; luma: Uint8Array; frameHash: string } {
    const luma = this.extractLuma(frameBuffer, width, height, channels);
    const lumaStats = this.computeLuminanceStats(luma);
    const laplacianVariance = this.computeLaplacianVariance(luma, width, height);
    const edgeDensity = this.computeEdgeDensity(luma, width, height);
    const entropy = this.computeSpatialEntropy(lumaStats.histogram, luma.length);

    let structuralSimilarity = 1.0;
    let sceneChangeScore = 0.0;

    if (baselineLuma && baselineLuma.length === luma.length) {
      const structural = this.computeStructuralMetrics(luma, baselineLuma, width, height);
      structuralSimilarity = structural.structuralSimilarity;
      sceneChangeScore = structural.sceneChangeScore;
    }

    const frameHash = createHash('sha256').update(luma).digest('hex');

    const metrics: TamperMetrics = {
      luminance: lumaStats.luminance,
      variance: lumaStats.variance,
      laplacianVariance,
      edgeDensity,
      entropy,
      structuralSimilarity,
      sceneChangeScore,
      highlightFraction: lumaStats.highlightFraction,
      shadowFraction: lumaStats.shadowFraction,
    };

    return { metrics, luma, frameHash };
  }

  /**
   * Authoritative multi-tamper diagnostic evaluator
   */
  public static evaluateTamper(
    metrics: TamperMetrics,
    options: {
      baseline?: CameraTamperBaselineRecord | null;
      config?: Partial<CameraTamperConfigRecord>;
      observedAt?: Date;
    } = {}
  ): TamperEvaluationResult {
    const { baseline, config } = options;
    const observedAt = options.observedAt || new Date();

    const sensitivity = config?.sensitivity ?? 0.8;
    const blindingThreshold = config?.blinding_threshold ?? 240.0;
    const coveringThreshold = config?.covering_threshold ?? 15.0;
    const defocusThreshold = config?.defocus_threshold ?? 100.0;
    const movementThreshold = config?.movement_threshold ?? 0.65;
    const sprayThreshold = config?.spray_threshold ?? 0.70;

    const alertOnBlinding = config?.alert_on_blinding ?? true;
    const alertOnCovering = config?.alert_on_covering ?? true;
    const alertOnDefocus = config?.alert_on_defocus ?? true;
    const alertOnMovement = config?.alert_on_movement ?? true;
    const alertOnSpray = config?.alert_on_spray ?? true;

    const reasons: string[] = [];

    // 1. Check Blinding / Glare
    // High saturated brightness, high percentage of highlights, collapsed edge details in flare
    const isBlinded =
      metrics.luminance >= blindingThreshold ||
      (metrics.highlightFraction >= 0.85 && metrics.variance < 40);

    if (isBlinded && alertOnBlinding) {
      reasons.push(
        `Blinding glare detected: mean luminance=${metrics.luminance.toFixed(1)} (threshold=${blindingThreshold}), highlight fraction=${(metrics.highlightFraction * 100).toFixed(1)}%`
      );
      const conf = Math.min(
        0.99,
        0.80 + (metrics.luminance >= blindingThreshold ? (metrics.luminance - blindingThreshold) / 15 * 0.19 : 0.1)
      );
      return {
        isTampered: true,
        tamperType: 'blinding',
        severity: 'P1',
        confidence: Math.round(conf * 100) / 100,
        metrics,
        reasons,
        requiresAlert: true,
        observedAt,
      };
    }

    // 2. Check Covering / Blackout / Lens Occlusion
    // Extremely low luminance and almost zero spatial variance
    // Only valid if baseline had adequate illumination (avoiding false alarms on powered-off cameras)
    const baselineWasIlluminated = !baseline || baseline.baseline_luminance >= 20;
    const isCovered =
      metrics.luminance <= coveringThreshold &&
      metrics.variance < 15 &&
      baselineWasIlluminated;

    if (isCovered && alertOnCovering) {
      reasons.push(
        `Lens covering/blackout detected: mean luminance=${metrics.luminance.toFixed(1)} (threshold=${coveringThreshold}), variance=${metrics.variance.toFixed(1)}`
      );
      const conf = Math.min(0.99, 0.85 + (coveringThreshold - metrics.luminance) / coveringThreshold * 0.14);
      return {
        isTampered: true,
        tamperType: 'covering',
        severity: 'P1',
        confidence: Math.round(conf * 100) / 100,
        metrics,
        reasons,
        requiresAlert: true,
        observedAt,
      };
    }

    // 3. Check Defocus / Blur
    // Normal illumination, but Laplacian variance collapses below threshold or drops significantly vs baseline
    const normalIllumination = metrics.luminance > 20 && metrics.luminance < 235;
    const baselineLapVar = baseline?.baseline_laplacian_variance ?? 300.0;
    const adjustedDefocusThreshold = Math.min(defocusThreshold, baselineLapVar * 0.45);
    const isDefocused =
      normalIllumination &&
      metrics.laplacianVariance < adjustedDefocusThreshold &&
      metrics.variance >= 15; // Has some brightness variation, but no crisp high frequencies

    if (isDefocused && alertOnDefocus) {
      reasons.push(
        `Camera defocus/blur detected: Laplacian sharpness variance=${metrics.laplacianVariance.toFixed(1)} (threshold=${adjustedDefocusThreshold.toFixed(1)}, baseline=${baselineLapVar.toFixed(1)})`
      );
      const dropRatio = (adjustedDefocusThreshold - metrics.laplacianVariance) / adjustedDefocusThreshold;
      const conf = Math.min(0.98, Math.max(0.70, 0.75 + dropRatio * 0.23));
      return {
        isTampered: true,
        tamperType: 'defocus',
        severity: 'P2',
        confidence: Math.round(conf * 100) / 100,
        metrics,
        reasons,
        requiresAlert: true,
        observedAt,
      };
    }

    // 4. Check Spray Paint
    // Sudden drastic drop in edge density and spatial entropy without total darkness or total blinding
    // Spray paint coats the lens with opaque/diffuse pigment layer
    const baselineEdgeDensity = baseline?.baseline_edge_density ?? 0.15;
    const baselineEntropy = baseline?.baseline_entropy ?? 6.5;
    const edgeRatio = baselineEdgeDensity > 0 ? metrics.edgeDensity / baselineEdgeDensity : 1.0;
    const entropyDrop = baselineEntropy - metrics.entropy;

    const isSprayPainted =
      normalIllumination &&
      edgeRatio < (1.0 - sprayThreshold * 0.7) &&
      entropyDrop >= 1.8 &&
      metrics.structuralSimilarity < 0.40;

    if (isSprayPainted && alertOnSpray) {
      reasons.push(
        `Spray paint tampering detected: edge density ratio=${(edgeRatio * 100).toFixed(1)}%, entropy dropped by ${entropyDrop.toFixed(2)} bits, structural similarity=${metrics.structuralSimilarity.toFixed(2)}`
      );
      const conf = Math.min(0.96, 0.78 + (1.0 - edgeRatio) * 0.18);
      return {
        isTampered: true,
        tamperType: 'spray',
        severity: 'P1',
        confidence: Math.round(conf * 100) / 100,
        metrics,
        reasons,
        requiresAlert: true,
        observedAt,
      };
    }

    // 5. Check Camera Movement / Scene Shift
    // Structural similarity to baseline is low, or scene change is high,
    // while the scene is well-illuminated and sharp (not covered, blinded, or defocused!)
    const effectiveMovementThreshold = Math.max(0.40, movementThreshold * (1.1 - sensitivity * 0.2));
    const isMoved =
      baseline &&
      normalIllumination &&
      !isDefocused &&
      metrics.structuralSimilarity < (1.0 - effectiveMovementThreshold) &&
      metrics.sceneChangeScore >= effectiveMovementThreshold;

    if (isMoved && alertOnMovement) {
      reasons.push(
        `Camera repositioning / movement detected: SSIM=${metrics.structuralSimilarity.toFixed(2)} (threshold=${(1.0 - effectiveMovementThreshold).toFixed(2)}), scene change score=${metrics.sceneChangeScore.toFixed(2)}`
      );
      const conf = Math.min(0.95, 0.72 + metrics.sceneChangeScore * 0.23);
      return {
        isTampered: true,
        tamperType: 'movement',
        severity: 'P2',
        confidence: Math.round(conf * 100) / 100,
        metrics,
        reasons,
        requiresAlert: true,
        observedAt,
      };
    }

    return {
      isTampered: false,
      tamperType: null,
      severity: null,
      confidence: 0,
      metrics,
      reasons: ['Normal optical characteristics observed.'],
      requiresAlert: false,
      observedAt,
    };
  }
}
