/**
 * Edge-Agent Camera Tamper & Defocus Statistical Frame Analyzer
 * 
 * Lightweight, high-throughput edge-side statistical analysis for decoded camera frames.
 * Evaluates:
 * 1. Defocus / blur via discrete 8-connected Laplacian variance
 * 2. Blinding / spotlight glare via ITU-R BT.601 saturation metrics
 * 3. Lens covering / blackout via luminance collapse
 * 4. Camera movement / repositioning via structural grid correlation
 * 5. Spray paint tampering via edge gradient energy and spatial entropy loss
 */

import { createHash } from 'node:crypto';

export type EdgeTamperType = 'blinding' | 'covering' | 'movement' | 'defocus' | 'spray';

export interface EdgeTamperMetrics {
  luminance: number;
  variance: number;
  laplacianVariance: number;
  edgeDensity: number;
  entropy: number;
  structuralSimilarity: number;
  sceneChangeScore: number;
  highlightFraction: number;
  shadowFraction: number;
}

export interface EdgeTamperResult {
  isTampered: boolean;
  tamperType: EdgeTamperType | null;
  severity: 'P1' | 'P2' | 'P3' | 'P4' | null;
  confidence: number;
  metrics: EdgeTamperMetrics;
  reasons: string[];
}

export interface EdgeCameraBaseline {
  luminance: number;
  variance: number;
  edgeDensity: number;
  entropy: number;
  laplacianVariance: number;
  lumaBuffer: Uint8Array;
}

export class EdgeTamperAnalyzer {
  private baselines = new Map<string, EdgeCameraBaseline>();
  private debounceCounts = new Map<string, { type: EdgeTamperType; count: number }>();

  /**
   * Convert RGB/RGBA frame to 8-bit luma
   */
  public static toLuma(frame: Uint8Array | Buffer, width: number, height: number, channels = 3): Uint8Array {
    const pixels = width * height;
    const luma = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i++) {
      const offset = i * channels;
      const r = frame[offset]!;
      const g = frame[offset + 1]!;
      const b = frame[offset + 2]!;
      luma[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    return luma;
  }

  /**
   * Calculate 8-connected discrete Laplacian variance Var(∇² I)
   */
  public static calculateLaplacianVariance(luma: Uint8Array, width: number, height: number): number {
    if (width < 3 || height < 3) return 0;
    const interior = (width - 2) * (height - 2);
    if (interior <= 0) return 0;

    let sum = 0;
    let sumSq = 0;

    for (let y = 1; y < height - 1; y++) {
      const r = y * width;
      const rPrev = (y - 1) * width;
      const rNext = (y + 1) * width;

      for (let x = 1; x < width - 1; x++) {
        const center = luma[r + x]!;
        const neighbors =
          luma[rPrev + x - 1]! + luma[rPrev + x]! + luma[rPrev + x + 1]! +
          luma[r + x - 1]! + luma[r + x + 1]! +
          luma[rNext + x - 1]! + luma[rNext + x]! + luma[rNext + x + 1]!;

        const lap = 8 * center - neighbors;
        sum += lap;
        sumSq += lap * lap;
      }
    }

    const mean = sum / interior;
    return Math.max(0, sumSq / interior - mean * mean);
  }

  /**
   * Analyze raw camera frame
   */
  public analyze(
    cameraId: string,
    frame: Uint8Array | Buffer,
    width: number,
    height: number,
    channels = 3
  ): EdgeTamperResult {
    const luma = EdgeTamperAnalyzer.toLuma(frame, width, height, channels);
    const N = luma.length;

    // Luminance & Histogram
    let sum = 0;
    let sumSq = 0;
    let highlights = 0;
    let shadows = 0;
    const hist = new Array(256).fill(0);

    for (let i = 0; i < N; i++) {
      const v = luma[i]!;
      hist[v]++;
      sum += v;
      sumSq += v * v;
      if (v >= 240) highlights++;
      if (v <= 15) shadows++;
    }

    const meanLuma = sum / N;
    const varLuma = Math.max(0, sumSq / N - meanLuma * meanLuma);
    const lapVar = EdgeTamperAnalyzer.calculateLaplacianVariance(luma, width, height);

    // Sobel edge density
    let edges = 0;
    const interior = Math.max(1, (width - 2) * (height - 2));
    for (let y = 1; y < height - 1; y++) {
      const r0 = (y - 1) * width;
      const r1 = y * width;
      const r2 = (y + 1) * width;
      for (let x = 1; x < width - 1; x++) {
        const gx = -luma[r0 + x - 1]! + luma[r0 + x + 1]! - 2 * luma[r1 + x - 1]! + 2 * luma[r1 + x + 1]! - luma[r2 + x - 1]! + luma[r2 + x + 1]!;
        const gy = -luma[r0 + x - 1]! - 2 * luma[r0 + x]! - luma[r0 + x + 1]! + luma[r2 + x - 1]! + 2 * luma[r2 + x]! + luma[r2 + x + 1]!;
        if (Math.abs(gx) + Math.abs(gy) >= 35) edges++;
      }
    }
    const edgeDensity = edges / interior;

    // Entropy
    let entropy = 0;
    for (let k = 0; k < 256; k++) {
      if (hist[k] > 0) {
        const p = hist[k] / N;
        entropy -= p * Math.log2(p);
      }
    }

    // Compare with baseline
    let baseline = this.baselines.get(cameraId);
    if (!baseline) {
      baseline = {
        luminance: meanLuma,
        variance: varLuma,
        edgeDensity,
        entropy,
        laplacianVariance: lapVar,
        lumaBuffer: luma,
      };
      this.baselines.set(cameraId, baseline);
    }

    let l1Diff = 0;
    for (let i = 0; i < N; i++) {
      l1Diff += Math.abs(luma[i]! - baseline.lumaBuffer[i]!);
    }
    const sceneChangeScore = Math.min(1.0, l1Diff / (N * 255));
    const structuralSimilarity = Math.max(0, 1.0 - sceneChangeScore);

    const metrics: EdgeTamperMetrics = {
      luminance: Math.round(meanLuma * 10) / 10,
      variance: Math.round(varLuma * 10) / 10,
      laplacianVariance: Math.round(lapVar * 10) / 10,
      edgeDensity: Math.round(edgeDensity * 1000) / 1000,
      entropy: Math.round(entropy * 100) / 100,
      structuralSimilarity: Math.round(structuralSimilarity * 1000) / 1000,
      sceneChangeScore: Math.round(sceneChangeScore * 1000) / 1000,
      highlightFraction: Math.round((highlights / N) * 1000) / 1000,
      shadowFraction: Math.round((shadows / N) * 1000) / 1000,
    };

    const reasons: string[] = [];

    // 1. Blinding
    if (meanLuma >= 240 || (metrics.highlightFraction >= 0.85 && varLuma < 40)) {
      reasons.push('High-intensity blinding glare detected');
      return {
        isTampered: true,
        tamperType: 'blinding',
        severity: 'P1',
        confidence: 0.95,
        metrics,
        reasons,
      };
    }

    // 2. Covering / Blackout
    if (meanLuma <= 15 && varLuma < 15 && baseline.luminance >= 20) {
      reasons.push('Lens covering or complete blackout detected');
      return {
        isTampered: true,
        tamperType: 'covering',
        severity: 'P1',
        confidence: 0.95,
        metrics,
        reasons,
      };
    }

    // 3. Defocus / Blur
    const normalIllumination = meanLuma > 20 && meanLuma < 235;
    if (normalIllumination && lapVar < 80 && lapVar < baseline.laplacianVariance * 0.45 && varLuma >= 15) {
      reasons.push('Loss of focus / severe blurring detected');
      return {
        isTampered: true,
        tamperType: 'defocus',
        severity: 'P2',
        confidence: 0.90,
        metrics,
        reasons,
      };
    }

    // 4. Spray paint
    if (
      normalIllumination &&
      edgeDensity < baseline.edgeDensity * 0.35 &&
      (baseline.entropy - entropy) >= 1.8 &&
      structuralSimilarity < 0.40
    ) {
      reasons.push('Spray paint occlusion detected on lens');
      return {
        isTampered: true,
        tamperType: 'spray',
        severity: 'P1',
        confidence: 0.92,
        metrics,
        reasons,
      };
    }

    // 5. Camera movement
    if (normalIllumination && structuralSimilarity < 0.35 && sceneChangeScore >= 0.65) {
      reasons.push('Camera orientation shifted from reference angle');
      return {
        isTampered: true,
        tamperType: 'movement',
        severity: 'P2',
        confidence: 0.88,
        metrics,
        reasons,
      };
    }

    return {
      isTampered: false,
      tamperType: null,
      severity: null,
      confidence: 0,
      metrics,
      reasons: ['Optical stream parameters normal'],
    };
  }

  public setBaseline(cameraId: string, baseline: EdgeCameraBaseline): void {
    this.baselines.set(cameraId, baseline);
  }

  public clearBaseline(cameraId: string): void {
    this.baselines.delete(cameraId);
  }
}

export const edgeTamperAnalyzer = new EdgeTamperAnalyzer();
