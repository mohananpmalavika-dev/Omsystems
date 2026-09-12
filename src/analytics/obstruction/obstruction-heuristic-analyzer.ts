/**
 * Camera Obstruction & Dark Frame Heuristic Statistical Analyzer
 * 
 * Production-ready computer vision analysis using mathematical frame statistics:
 * 1. Multi-tile spatial variance grid analysis (detects localized vs full lens covering)
 * 2. Photometric luminance collapse & shadow fraction (detects blackout / dark frames)
 * 3. Night-scene edge discrimination (prevents false alarms on IR-illuminated night scenes)
 * 4. Spatial variance floor & Shannon entropy collapse (detects dead sensor / frozen flat frame)
 * 5. High-intensity saturation analysis (detects glare / whiteout)
 */

import { createHash } from 'node:crypto';
import type {
  ObstructionMetrics,
  ObstructionEvaluationResult,
  ObstructionType,
  ObstructionSeverity,
  TileMetric,
  TileAnalysis,
  TileBoundingBox,
  CameraObstructionBaselineRecord,
  CameraObstructionConfigRecord,
} from './obstruction-types.js';

export interface FrameDimensions {
  width: number;
  height: number;
  channels?: 1 | 3 | 4; // 1 = Grayscale, 3 = RGB, 4 = RGBA
}

export interface ObstructionAnalysisOptions {
  dimensions?: FrameDimensions;
  baseline?: CameraObstructionBaselineRecord | null;
  config?: Partial<CameraObstructionConfigRecord>;
  gridRows?: number;
  gridCols?: number;
}

export class ObstructionHeuristicAnalyzer {
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
   * Compute multi-tile spatial variance grid analysis.
   * Divides the frame into gridRows x gridCols cells and evaluates local variance,
   * local mean, and gradient energy to pinpoint obstructed areas.
   */
  public static computeTileAnalysis(
    luma: Uint8Array,
    width: number,
    height: number,
    gridRows = 4,
    gridCols = 4,
    varianceFloor = 12.0,
    darknessThreshold = 8.0
  ): TileAnalysis {
    const tileW = Math.floor(width / gridCols);
    const tileH = Math.floor(height / gridRows);
    const tiles: TileMetric[] = [];

    let obstructedCount = 0;
    let minObsX = width;
    let minObsY = height;
    let maxObsX = 0;
    let maxObsY = 0;

    for (let r = 0; r < gridRows; r++) {
      const startY = r * tileH;
      const endY = r === gridRows - 1 ? height : (r + 1) * tileH;
      const currentTileH = endY - startY;

      for (let c = 0; c < gridCols; c++) {
        const startX = c * tileW;
        const endX = c === gridCols - 1 ? width : (c + 1) * tileW;
        const currentTileW = endX - startX;
        const tilePixelCount = currentTileW * currentTileH;

        let sum = 0;
        let sumSq = 0;
        let gradSum = 0;

        for (let y = startY; y < endY; y++) {
          const rowOffset = y * width;
          for (let x = startX; x < endX; x++) {
            const val = luma[rowOffset + x]!;
            sum += val;
            sumSq += val * val;

            // Simple local difference gradient
            if (x < endX - 1) {
              gradSum += Math.abs(val - luma[rowOffset + x + 1]!);
            }
            if (y < endY - 1) {
              gradSum += Math.abs(val - luma[(y + 1) * width + x]!);
            }
          }
        }

        const mean = tilePixelCount > 0 ? sum / tilePixelCount : 0;
        const variance = tilePixelCount > 0 ? Math.max(0, sumSq / tilePixelCount - mean * mean) : 0;
        const edgeScore = tilePixelCount > 0 ? gradSum / (tilePixelCount * 255) : 0;

        // An individual tile is marked obstructed if:
        // 1. Total dark collapse: mean <= darknessThreshold, OR
        // 2. Severe variance collapse: variance < varianceFloor AND edgeScore < 0.02
        let isObstructed = false;
        let reason: string | undefined;

        if (mean <= darknessThreshold && variance < 6) {
          isObstructed = true;
          reason = 'dark_blackout';
        } else if (variance < varianceFloor && edgeScore < 0.025) {
          isObstructed = true;
          reason = 'variance_collapse';
        }

        if (isObstructed) {
          obstructedCount++;
          if (startX < minObsX) minObsX = startX;
          if (startY < minObsY) minObsY = startY;
          if (endX > maxObsX) maxObsX = endX;
          if (endY > maxObsY) maxObsY = endY;
        }

        tiles.push({
          row: r,
          col: c,
          x: startX,
          y: startY,
          width: currentTileW,
          height: currentTileH,
          luminance: Math.round(mean * 100) / 100,
          variance: Math.round(variance * 100) / 100,
          edgeScore: Math.round(edgeScore * 1000) / 1000,
          isObstructed,
          obstructionReason: reason,
        });
      }
    }

    const totalTiles = gridRows * gridCols;
    const obstructionPercent = Math.round((obstructedCount / totalTiles) * 1000) / 10;

    let obstructedBoundingBox: TileBoundingBox | null = null;
    if (obstructedCount > 0 && maxObsX > minObsX && maxObsY > minObsY) {
      obstructedBoundingBox = {
        x: minObsX,
        y: minObsY,
        width: maxObsX - minObsX,
        height: maxObsY - minObsY,
      };
    }

    return {
      gridRows,
      gridCols,
      totalTiles,
      obstructedTiles: obstructedCount,
      obstructionPercent,
      tiles,
      obstructedBoundingBox,
    };
  }

  /**
   * Compute 256-bin histogram and global distribution statistics
   */
  public static computeGlobalMetrics(
    luma: Uint8Array,
    width: number,
    height: number,
    tileAnalysis: TileAnalysis
  ): ObstructionMetrics {
    const N = luma.length;
    if (N === 0) {
      return {
        luminance: 0,
        variance: 0,
        edgeDensity: 0,
        entropy: 0,
        laplacianVariance: 0,
        shadowFraction: 1,
        highlightFraction: 0,
        obstructionPercent: 100,
        tileAnalysis,
        histogram: new Array(256).fill(0),
      };
    }

    const histogram = new Array(256).fill(0);
    let sum = 0;
    let sumSq = 0;
    let shadowCount = 0;
    let highlightCount = 0;

    for (let i = 0; i < N; i++) {
      const val = luma[i]!;
      histogram[val]++;
      sum += val;
      sumSq += val * val;
      if (val <= 12) shadowCount++;
      if (val >= 240) highlightCount++;
    }

    const meanLuma = sum / N;
    const variance = Math.max(0, sumSq / N - meanLuma * meanLuma);
    const shadowFraction = shadowCount / N;
    const highlightFraction = highlightCount / N;

    // Shannon Entropy: H = -sum(p_i * log2(p_i))
    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      if (histogram[i] > 0) {
        const p = histogram[i] / N;
        entropy -= p * Math.log2(p);
      }
    }

    // Sobel / Gradient Edge Density
    let edgePixels = 0;
    const interior = (width - 2) * (height - 2);

    if (interior > 0 && width >= 3 && height >= 3) {
      for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        const rowPrev = (y - 1) * width;
        const rowNext = (y + 1) * width;

        for (let x = 1; x < width - 1; x++) {
          // Horizontal Sobel Gx
          const gx =
            -luma[rowPrev + x - 1]! + luma[rowPrev + x + 1]! +
            -2 * luma[row + x - 1]! + 2 * luma[row + x + 1]! +
            -luma[rowNext + x - 1]! + luma[rowNext + x + 1]!;

          // Vertical Sobel Gy
          const gy =
            -luma[rowPrev + x - 1]! - 2 * luma[rowPrev + x]! - luma[rowPrev + x + 1]! +
            luma[rowNext + x - 1]! + 2 * luma[rowNext + x]! + luma[rowNext + x + 1]!;

          const gradMag = Math.abs(gx) + Math.abs(gy);
          if (gradMag > 35) {
            edgePixels++;
          }
        }
      }
    }
    const edgeDensity = interior > 0 ? edgePixels / interior : 0;

    // 8-connected Discrete Laplacian Variance
    let lapVar = 0;
    if (interior > 0 && width >= 3 && height >= 3) {
      let lapSum = 0;
      let lapSumSq = 0;

      for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        const rowPrev = (y - 1) * width;
        const rowNext = (y + 1) * width;

        for (let x = 1; x < width - 1; x++) {
          const center = luma[row + x]!;
          const neighbors =
            luma[rowPrev + x - 1]! + luma[rowPrev + x]! + luma[rowPrev + x + 1]! +
            luma[row + x - 1]! + luma[row + x + 1]! +
            luma[rowNext + x - 1]! + luma[rowNext + x]! + luma[rowNext + x + 1]!;

          const lap = 8 * center - neighbors;
          lapSum += lap;
          lapSumSq += lap * lap;
        }
      }

      const lapMean = lapSum / interior;
      lapVar = Math.max(0, lapSumSq / interior - lapMean * lapMean);
    }

    return {
      luminance: Math.round(meanLuma * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      edgeDensity: Math.round(edgeDensity * 10000) / 10000,
      entropy: Math.round(entropy * 1000) / 1000,
      laplacianVariance: Math.round(lapVar * 100) / 100,
      shadowFraction: Math.round(shadowFraction * 10000) / 10000,
      highlightFraction: Math.round(highlightFraction * 10000) / 10000,
      obstructionPercent: tileAnalysis.obstructionPercent,
      tileAnalysis,
      histogram,
    };
  }

  /**
   * Evaluate heuristic camera obstruction rules based on calculated metrics
   */
  public static evaluateObstruction(
    metrics: ObstructionMetrics,
    options?: ObstructionAnalysisOptions
  ): ObstructionEvaluationResult {
    const observedAt = new Date();
    const config = options?.config;
    const baseline = options?.baseline;

    const darknessThreshold = config?.darkness_threshold ?? 8.0;
    const varianceFloor = config?.variance_floor ?? 12.0;
    const obstructionPercentThreshold = config?.obstruction_percent_threshold ?? 70.0;
    const partialThreshold = config?.partial_threshold ?? 25.0;

    const alertOnDarkFrame = config?.alert_on_dark_frame ?? true;
    const alertOnCovering = config?.alert_on_covering ?? true;
    const alertOnVarianceLoss = config?.alert_on_variance_loss ?? true;
    const alertOnPartial = config?.alert_on_partial ?? true;
    const alertOnGlare = config?.alert_on_glare ?? true;

    const reasons: string[] = [];

    // Night Scene Discrimination:
    // A legitimate night scene (IR illuminator, moonlight, street lamp) has illumination > darknessThreshold
    // AND maintains edge structure (edgeDensity >= 0.03) or macro scene contrast (variance >= 25.0).
    const isNightSceneWithEdges =
      metrics.luminance > darknessThreshold &&
      (metrics.edgeDensity >= 0.03 ||
      metrics.variance >= 25.0 ||
      metrics.laplacianVariance >= 30.0);

    // 1. Check Darkness / Total Blackout (Dark Frame)
    const isDarkFrame =
      metrics.luminance <= darknessThreshold &&
      metrics.shadowFraction >= 0.90 &&
      metrics.variance < varianceFloor;

    if (isDarkFrame && alertOnDarkFrame) {
      reasons.push(
        `Dark frame / optical blackout detected: mean luminance=${metrics.luminance.toFixed(1)} (threshold=${darknessThreshold.toFixed(1)}), shadow fraction=${(metrics.shadowFraction * 100).toFixed(1)}%, spatial variance=${metrics.variance.toFixed(1)}`
      );
      const conf = Math.min(0.99, 0.88 + ((darknessThreshold - Math.min(darknessThreshold, metrics.luminance)) / Math.max(1, darknessThreshold)) * 0.11);
      return {
        isObstructed: true,
        obstructionType: 'dark_frame',
        severity: 'P1',
        confidence: Math.round(conf * 100) / 100,
        metrics,
        reasons,
        requiresAlert: true,
        observedAt,
      };
    }

    // 2. Check Glare / Whiteout (Optical Overexposure Blinding)
    const isGlare =
      metrics.luminance >= 242.0 &&
      metrics.highlightFraction >= 0.85;

    if (isGlare && alertOnGlare) {
      reasons.push(
        `Severe glare / overexposure whiteout: mean luminance=${metrics.luminance.toFixed(1)}, highlight fraction=${(metrics.highlightFraction * 100).toFixed(1)}%`
      );
      const conf = Math.min(0.99, 0.85 + metrics.highlightFraction * 0.14);
      return {
        isObstructed: true,
        obstructionType: 'glare_whiteout',
        severity: 'P2',
        confidence: Math.round(conf * 100) / 100,
        metrics,
        reasons,
        requiresAlert: true,
        observedAt,
      };
    }

    // 3. Check Loss of Visual Variance (Sensor Flatline / Uniform Frame / Gray Screen)
    // Low spatial variance, flat histogram (low entropy), negligible edge density
    // Takes precedence over covering for uniform test screens / dead sensor flatlines
    const isVarianceLoss =
      metrics.variance < varianceFloor &&
      metrics.edgeDensity < 0.02 &&
      metrics.entropy < 2.5 &&
      !isNightSceneWithEdges;

    if (isVarianceLoss && alertOnVarianceLoss) {
      reasons.push(
        `Loss of visual variance / static flatline frame: spatial variance=${metrics.variance.toFixed(1)} (floor=${varianceFloor.toFixed(1)}), edge density=${metrics.edgeDensity.toFixed(4)}, entropy=${metrics.entropy.toFixed(2)}`
      );
      const conf = Math.min(0.98, Math.max(0.75, 0.80 + (varianceFloor - metrics.variance) / varianceFloor * 0.18));
      return {
        isObstructed: true,
        obstructionType: 'variance_loss',
        severity: 'P1',
        confidence: Math.round(conf * 100) / 100,
        metrics,
        reasons,
        requiresAlert: true,
        observedAt,
      };
    }

    // 4. Check Full Lens Covering
    // Tile obstruction >= obstructionPercentThreshold (default 70%) AND low global variance or entropy
    const isFullCovering =
      metrics.obstructionPercent >= obstructionPercentThreshold &&
      (metrics.variance < 25.0 || metrics.entropy < 3.5);

    if (isFullCovering && alertOnCovering) {
      reasons.push(
        `Full lens covering detected: ${metrics.obstructionPercent.toFixed(1)}% spatial obstruction (threshold=${obstructionPercentThreshold.toFixed(1)}%), spatial variance=${metrics.variance.toFixed(1)}, entropy=${metrics.entropy.toFixed(2)}`
      );
      const conf = Math.min(0.99, 0.85 + (metrics.obstructionPercent / 100) * 0.14);
      return {
        isObstructed: true,
        obstructionType: 'lens_covering',
        severity: 'P1',
        confidence: Math.round(conf * 100) / 100,
        metrics,
        reasons,
        requiresAlert: true,
        observedAt,
      };
    }

    // 5. Check Partial Lens Covering / Localized Obstruction
    // Obstruction percentage between partialThreshold and obstructionPercentThreshold
    const isPartialObstruction =
      metrics.obstructionPercent >= partialThreshold &&
      metrics.obstructionPercent < obstructionPercentThreshold;

    if (isPartialObstruction && alertOnPartial) {
      const box = metrics.tileAnalysis.obstructedBoundingBox;
      const boxDesc = box ? ` [region: x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}]` : '';
      reasons.push(
        `Partial lens obstruction detected: ${metrics.obstructionPercent.toFixed(1)}% of field of view occluded${boxDesc}`
      );
      const conf = Math.min(0.95, 0.70 + (metrics.obstructionPercent / 100) * 0.25);
      const severity: ObstructionSeverity = metrics.obstructionPercent >= 50.0 ? 'P2' : 'P3';
      return {
        isObstructed: true,
        obstructionType: 'partial_obstruction',
        severity,
        confidence: Math.round(conf * 100) / 100,
        metrics,
        reasons,
        requiresAlert: true,
        observedAt,
      };
    }

    // Normal healthy frame
    return {
      isObstructed: false,
      obstructionType: null,
      severity: null,
      confidence: 0,
      metrics,
      reasons: ['Frame metrics within normal optical operating bounds'],
      requiresAlert: false,
      observedAt,
    };
  }

  /**
   * End-to-end frame analysis pipeline
   */
  public static analyzeFrame(
    buffer: Uint8Array | Buffer,
    width: number,
    height: number,
    channels: 1 | 3 | 4 = 3,
    options?: ObstructionAnalysisOptions
  ): ObstructionEvaluationResult {
    const luma = this.extractLuma(buffer, width, height, channels);
    const gridRows = options?.gridRows ?? 4;
    const gridCols = options?.gridCols ?? 4;
    const varianceFloor = options?.config?.variance_floor ?? 12.0;
    const darknessThreshold = options?.config?.darkness_threshold ?? 8.0;

    const tileAnalysis = this.computeTileAnalysis(
      luma,
      width,
      height,
      gridRows,
      gridCols,
      varianceFloor,
      darknessThreshold
    );

    const metrics = this.computeGlobalMetrics(luma, width, height, tileAnalysis);
    return this.evaluateObstruction(metrics, options);
  }

  /**
   * Generates hash of reference frame for baseline integrity
   */
  public static hashFrame(buffer: Uint8Array | Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
