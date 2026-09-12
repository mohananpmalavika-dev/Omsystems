/**
 * Edge-Agent Camera Obstruction & Dark Frame Statistical Analyzer
 * 
 * Lightweight, high-throughput edge-side statistical analysis for decoded camera frames.
 * Evaluates:
 * 1. Dark frame / blackout via photometric luma collapse and shadow fraction
 * 2. Visual variance loss via spatial variance floor Var(I) < tau_floor
 * 3. Multi-tile grid analysis for localized and full lens covering
 * 4. Night-scene discrimination via edge gradient preservation
 */

export type EdgeObstructionType =
  | 'dark_frame'
  | 'lens_covering'
  | 'variance_loss'
  | 'partial_obstruction'
  | 'glare_whiteout';

export interface EdgeTileMetric {
  row: number;
  col: number;
  luminance: number;
  variance: number;
  isObstructed: boolean;
}

export interface EdgeObstructionMetrics {
  luminance: number;
  variance: number;
  edgeDensity: number;
  shadowFraction: number;
  highlightFraction: number;
  obstructionPercent: number;
  tiles: EdgeTileMetric[];
}

export interface EdgeObstructionResult {
  isObstructed: boolean;
  obstructionType: EdgeObstructionType | null;
  severity: 'P1' | 'P2' | 'P3' | 'P4' | null;
  confidence: number;
  metrics: EdgeObstructionMetrics;
  reasons: string[];
}

export class EdgeObstructionAnalyzer {
  private debounceCounts = new Map<string, { type: EdgeObstructionType; count: number }>();
  private readonly DEFAULT_DEBOUNCE = 3;

  /**
   * Convert RGB/RGBA frame to 8-bit luma
   */
  public static toLuma(frame: Uint8Array | Buffer, width: number, height: number, channels = 3): Uint8Array {
    const pixels = width * height;
    const luma = new Uint8Array(pixels);

    if (channels === 1) {
      luma.set(frame.subarray(0, pixels));
      return luma;
    }

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
   * Evaluate decoded frame directly on edge appliance
   */
  public evaluateFrame(
    frame: Uint8Array | Buffer,
    width: number,
    height: number,
    channels = 3,
    cameraId?: string,
    options?: {
      darknessThreshold?: number;
      varianceFloor?: number;
      coveringThreshold?: number;
      partialThreshold?: number;
      debounceFrames?: number;
    }
  ): EdgeObstructionResult {
    const darknessThreshold = options?.darknessThreshold ?? 8.0;
    const varianceFloor = options?.varianceFloor ?? 12.0;
    const coveringThreshold = options?.coveringThreshold ?? 70.0;
    const partialThreshold = options?.partialThreshold ?? 25.0;
    const debounceFrames = options?.debounceFrames ?? this.DEFAULT_DEBOUNCE;

    const luma = EdgeObstructionAnalyzer.toLuma(frame, width, height, channels);
    const pixelCount = width * height;

    if (pixelCount === 0) {
      return {
        isObstructed: false,
        obstructionType: null,
        severity: null,
        confidence: 0,
        metrics: {
          luminance: 0,
          variance: 0,
          edgeDensity: 0,
          shadowFraction: 1,
          highlightFraction: 0,
          obstructionPercent: 100,
          tiles: [],
        },
        reasons: ['Empty frame buffer'],
      };
    }

    // 1. Global luminance and variance
    let sum = 0;
    let sumSq = 0;
    let shadowCount = 0;
    let highlightCount = 0;

    for (let i = 0; i < pixelCount; i++) {
      const val = luma[i]!;
      sum += val;
      sumSq += val * val;
      if (val <= 12) shadowCount++;
      if (val >= 240) highlightCount++;
    }

    const meanLuma = sum / pixelCount;
    const globalVariance = Math.max(0, sumSq / pixelCount - meanLuma * meanLuma);
    const shadowFraction = shadowCount / pixelCount;
    const highlightFraction = highlightCount / pixelCount;

    // 2. Fast edge density approximation
    let edgePixels = 0;
    const interior = (width - 2) * (height - 2);
    if (interior > 0 && width >= 3 && height >= 3) {
      for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
          const diffH = Math.abs(luma[row + x + 1]! - luma[row + x - 1]!);
          const diffV = Math.abs(luma[(y + 1) * width + x]! - luma[(y - 1) * width + x]!);
          if (diffH + diffV > 40) edgePixels++;
        }
      }
    }
    const edgeDensity = interior > 0 ? edgePixels / interior : 0;

    // 3. 4x4 Grid Tile Analysis
    const grid = 4;
    const tileW = Math.floor(width / grid);
    const tileH = Math.floor(height / grid);
    const tiles: EdgeTileMetric[] = [];
    let obstructedTiles = 0;

    for (let r = 0; r < grid; r++) {
      const y0 = r * tileH;
      const y1 = r === grid - 1 ? height : (r + 1) * tileH;
      const th = y1 - y0;

      for (let c = 0; c < grid; c++) {
        const x0 = c * tileW;
        const x1 = c === grid - 1 ? width : (c + 1) * tileW;
        const tw = x1 - x0;
        const tilePixels = tw * th;

        let tSum = 0;
        let tSumSq = 0;

        for (let y = y0; y < y1; y++) {
          const rowOffset = y * width;
          for (let x = x0; x < x1; x++) {
            const val = luma[rowOffset + x]!;
            tSum += val;
            tSumSq += val * val;
          }
        }

        const tMean = tilePixels > 0 ? tSum / tilePixels : 0;
        const tVar = tilePixels > 0 ? Math.max(0, tSumSq / tilePixels - tMean * tMean) : 0;
        const isObs = (tMean <= darknessThreshold && tVar < 6) || (tVar < varianceFloor && edgeDensity < 0.02);

        if (isObs) obstructedTiles++;

        tiles.push({
          row: r,
          col: c,
          luminance: Math.round(tMean * 10) / 10,
          variance: Math.round(tVar * 10) / 10,
          isObstructed: isObs,
        });
      }
    }

    const obstructionPercent = Math.round((obstructedTiles / (grid * grid)) * 100);

    const metrics: EdgeObstructionMetrics = {
      luminance: Math.round(meanLuma * 10) / 10,
      variance: Math.round(globalVariance * 10) / 10,
      edgeDensity: Math.round(edgeDensity * 1000) / 1000,
      shadowFraction: Math.round(shadowFraction * 1000) / 1000,
      highlightFraction: Math.round(highlightFraction * 1000) / 1000,
      obstructionPercent,
      tiles,
    };

    // Heuristic Classification
    let rawType: EdgeObstructionType | null = null;
    let severity: 'P1' | 'P2' | 'P3' | 'P4' | null = null;
    let confidence = 0;
    const reasons: string[] = [];

    const isNightSceneWithEdges = edgeDensity >= 0.03 || globalVariance >= 25.0;

    if (meanLuma <= darknessThreshold && shadowFraction >= 0.90 && globalVariance < varianceFloor && !isNightSceneWithEdges) {
      rawType = 'dark_frame';
      severity = 'P1';
      confidence = 0.95;
      reasons.push(`Edge: Total dark frame blackout (luma=${meanLuma.toFixed(1)}, var=${globalVariance.toFixed(1)})`);
    } else if (meanLuma >= 242.0 && highlightFraction >= 0.85) {
      rawType = 'glare_whiteout';
      severity = 'P2';
      confidence = 0.92;
      reasons.push(`Edge: Optical glare whiteout (luma=${meanLuma.toFixed(1)})`);
    } else if (obstructionPercent >= coveringThreshold) {
      rawType = 'lens_covering';
      severity = 'P1';
      confidence = 0.90;
      reasons.push(`Edge: Lens covering detected (${obstructionPercent}% obstructed)`);
    } else if (globalVariance < varianceFloor && edgeDensity < 0.015 && !isNightSceneWithEdges) {
      rawType = 'variance_loss';
      severity = 'P1';
      confidence = 0.88;
      reasons.push(`Edge: Visual variance collapse / dead sensor (var=${globalVariance.toFixed(1)})`);
    } else if (obstructionPercent >= partialThreshold) {
      rawType = 'partial_obstruction';
      severity = obstructionPercent >= 50 ? 'P2' : 'P3';
      confidence = 0.82;
      reasons.push(`Edge: Partial obstruction (${obstructionPercent}% obstructed)`);
    }

    // Debounce tracking
    if (cameraId && rawType) {
      const current = this.debounceCounts.get(cameraId);
      if (current && current.type === rawType) {
        current.count++;
      } else {
        this.debounceCounts.set(cameraId, { type: rawType, count: 1 });
      }

      const activeCount = this.debounceCounts.get(cameraId)!.count;
      const isConfirmed = activeCount >= debounceFrames;

      return {
        isTampered: isConfirmed, // backwards compat if checked
        isObstructed: isConfirmed,
        obstructionType: isConfirmed ? rawType : null,
        severity: isConfirmed ? severity : null,
        confidence,
        metrics,
        reasons: isConfirmed ? reasons : [`Pending debounce (${activeCount}/${debounceFrames}): ${reasons.join('; ')}`],
      } as any;
    } else if (cameraId) {
      this.debounceCounts.delete(cameraId);
    }

    return {
      isObstructed: rawType !== null,
      obstructionType: rawType,
      severity,
      confidence,
      metrics,
      reasons: reasons.length > 0 ? reasons : ['Normal frame'],
    };
  }

  public resetCameraDebounce(cameraId: string): void {
    this.debounceCounts.delete(cameraId);
  }
}
