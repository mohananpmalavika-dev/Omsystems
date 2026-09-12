/**
 * Camera Obstruction & Dark Frame Detector
 * 
 * Production-ready statistical and heuristic frame analysis detecting:
 * - Lens covering & physical occlusion (cloth, cardboard, tape, hand)
 * - Darkness & dark frames (loss of illumination, IR failure, power cutoff)
 * - Loss of visual variance (dead sensor, static flat frame, frozen noise floor)
 * - Partial obstruction with spatial bounding box localization
 * - Glare & whiteout overexposure
 */

import { BaseDetector, type DetectionFrame, type DetectionResult } from './base-detector.js';

interface CameraObstructionState {
  lastObservedAt: Date;
  consecutiveFrames: number;
  activeType?: string;
}

export class CameraObstructionDetector extends BaseDetector {
  private cameraStates = new Map<string, CameraObstructionState>();
  private readonly DEBOUNCE_FRAMES = 3;

  constructor() {
    super('camera-obstruction', '2.0.1');
  }

  async initialize(): Promise<void> {
    // Pure mathematical statistical analysis requires no external weights download
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    const now = frame.timestamp || new Date();
    const width = frame.width || 64;
    const height = frame.height || 36;
    const buffer = frame.imageData;

    if (!buffer || buffer.length === 0) {
      return results;
    }

    let state = this.cameraStates.get(frame.cameraId);
    if (!state) {
      state = {
        lastObservedAt: now,
        consecutiveFrames: 0,
      };
      this.cameraStates.set(frame.cameraId, state);
    }

    // 1. Extract ITU-R BT.601 luminance
    const pixelCount = width * height;
    const luma = new Uint8Array(pixelCount);
    const channels = buffer.length >= pixelCount * 3 ? 3 : 1;

    let sum = 0;
    let sumSq = 0;
    let highlights = 0;
    let shadows = 0;
    const hist = new Array(256).fill(0);

    for (let i = 0; i < pixelCount; i++) {
      let yVal = 0;
      if (channels === 3) {
        const offset = i * 3;
        const r = buffer[offset] ?? 0;
        const g = buffer[offset + 1] ?? 0;
        const b = buffer[offset + 2] ?? 0;
        yVal = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      } else {
        yVal = buffer[i] ?? 0;
      }
      luma[i] = yVal;
      hist[yVal]++;
      sum += yVal;
      sumSq += yVal * yVal;
      if (yVal >= 240) highlights++;
      if (yVal <= 12) shadows++;
    }

    const meanLuma = sum / pixelCount;
    const varLuma = Math.max(0, sumSq / pixelCount - meanLuma * meanLuma);
    const shadowFraction = shadows / pixelCount;
    const highlightFraction = highlights / pixelCount;

    // 2. Shannon Entropy
    let entropy = 0;
    for (let k = 0; k < 256; k++) {
      if (hist[k] > 0) {
        const p = hist[k] / pixelCount;
        entropy -= p * Math.log2(p);
      }
    }

    // 3. Sobel edge density
    let edges = 0;
    const interior = Math.max(1, (width - 2) * (height - 2));
    if (width >= 3 && height >= 3) {
      for (let y = 1; y < height - 1; y++) {
        const r0 = (y - 1) * width;
        const r1 = y * width;
        const r2 = (y + 1) * width;
        for (let x = 1; x < width - 1; x++) {
          const gx =
            -luma[r0 + x - 1]! + luma[r0 + x + 1]! +
            -2 * luma[r1 + x - 1]! + 2 * luma[r1 + x + 1]! +
            -luma[r2 + x - 1]! + luma[r2 + x + 1]!;
          const gy =
            -luma[r0 + x - 1]! - 2 * luma[r0 + x]! - luma[r0 + x + 1]! +
            luma[r2 + x - 1]! + 2 * luma[r2 + x]! + luma[r2 + x + 1]!;
          if (Math.abs(gx) + Math.abs(gy) >= 35) edges++;
        }
      }
    }
    const edgeDensity = edges / interior;

    // 4. 4x4 Grid Tile Analysis
    const grid = 4;
    const tileW = Math.floor(width / grid);
    const tileH = Math.floor(height / grid);
    let obstructedTiles = 0;
    let minObsX = width;
    let minObsY = height;
    let maxObsX = 0;
    let maxObsY = 0;

    for (let r = 0; r < grid; r++) {
      const y0 = r * tileH;
      const y1 = r === grid - 1 ? height : (r + 1) * tileH;
      const th = y1 - y0;

      for (let c = 0; c < grid; c++) {
        const x0 = c * tileW;
        const x1 = c === grid - 1 ? width : (c + 1) * tileW;
        const tw = x1 - x0;
        const tpCount = tw * th;

        let tSum = 0;
        let tSumSq = 0;
        for (let y = y0; y < y1; y++) {
          const rOff = y * width;
          for (let x = x0; x < x1; x++) {
            const v = luma[rOff + x]!;
            tSum += v;
            tSumSq += v * v;
          }
        }

        const tMean = tpCount > 0 ? tSum / tpCount : 0;
        const tVar = tpCount > 0 ? Math.max(0, tSumSq / tpCount - tMean * tMean) : 0;
        const isObs = (tMean <= 8.0 && tVar < 6) || (tVar < 12.0 && edgeDensity < 0.02);

        if (isObs) {
          obstructedTiles++;
          if (x0 < minObsX) minObsX = x0;
          if (y0 < minObsY) minObsY = y0;
          if (x1 > maxObsX) maxObsX = x1;
          if (y1 > maxObsY) maxObsY = y1;
        }
      }
    }

    const obstructionPercent = Math.round((obstructedTiles / 16) * 100);

    // Heuristic Classification
    let detectedType: string | null = null;
    let severity: 'P1' | 'P2' | 'P3' | 'P4' | null = null;
    let confidence = 0;
    const reasons: string[] = [];

    const isNightSceneWithEdges = edgeDensity >= 0.03 || varLuma >= 25.0;

    if (meanLuma <= 8.0 && shadowFraction >= 0.90 && varLuma < 12.0 && !isNightSceneWithEdges) {
      detectedType = 'dark_frame';
      severity = 'P1';
      confidence = 0.96;
      reasons.push(`Total optical blackout: luma=${meanLuma.toFixed(1)}, shadow=${(shadowFraction * 100).toFixed(1)}%`);
    } else if (meanLuma >= 242.0 && highlightFraction >= 0.85) {
      detectedType = 'glare_whiteout';
      severity = 'P2';
      confidence = 0.92;
      reasons.push(`Severe glare whiteout: luma=${meanLuma.toFixed(1)}`);
    } else if (obstructionPercent >= 70) {
      detectedType = 'lens_covering';
      severity = 'P1';
      confidence = 0.90;
      reasons.push(`Full lens covering: ${obstructionPercent}% of FOV obstructed`);
    } else if (varLuma < 12.0 && edgeDensity < 0.02 && entropy < 2.5 && !isNightSceneWithEdges) {
      detectedType = 'variance_loss';
      severity = 'P1';
      confidence = 0.88;
      reasons.push(`Loss of visual variance: variance=${varLuma.toFixed(1)}, entropy=${entropy.toFixed(2)}`);
    } else if (obstructionPercent >= 25) {
      detectedType = 'partial_obstruction';
      severity = obstructionPercent >= 50 ? 'P2' : 'P3';
      confidence = 0.82;
      reasons.push(`Partial lens obstruction: ${obstructionPercent}% of FOV obstructed`);
    }

    if (detectedType) {
      if (state.activeType === detectedType) {
        state.consecutiveFrames++;
      } else {
        state.activeType = detectedType;
        state.consecutiveFrames = 1;
      }
      state.lastObservedAt = now;

      if (state.consecutiveFrames >= this.DEBOUNCE_FRAMES) {
        const boundingBox = (obstructedTiles > 0 && maxObsX > minObsX && maxObsY > minObsY)
          ? {
              x: minObsX / width,
              y: minObsY / height,
              width: (maxObsX - minObsX) / width,
              height: (maxObsY - minObsY) / height,
            }
          : { x: 0, y: 0, width: 1, height: 1 };

        results.push({
          detectionType: 'camera-obstruction',
          confidence,
          objects: [
            {
              label: detectedType,
              confidence,
              boundingBox,
            },
          ],
          requiresAlert: severity === 'P1' || severity === 'P2',
          executionMetadata: {
            status: 'SUCCESS',
            provenance: 'HEURISTIC_RULE_ENGINE',
            modelId: 'camera-obstruction-heuristic',
            modelVersion: '2.0.1',
            heuristicScore: confidence,
            simulated: false,
            timestamp: now.toISOString(),
            requiresReview: severity === 'P1',
          },
          metadata: {
            severity,
            obstructionPercent,
            reasons,
            metrics: {
              luminance: Math.round(meanLuma * 100) / 100,
              variance: Math.round(varLuma * 100) / 100,
              edgeDensity: Math.round(edgeDensity * 10000) / 10000,
              entropy: Math.round(entropy * 1000) / 1000,
              shadowFraction: Math.round(shadowFraction * 10000) / 10000,
            },
          },
        });
      }
    } else {
      state.consecutiveFrames = 0;
      state.activeType = undefined;
    }

    return results;
  }

  async cleanup(): Promise<void> {
    this.cameraStates.clear();
  }

  getHealth() {
    return {
      status: 'healthy' as const,
      details: `Monitoring optical obstruction state for ${this.cameraStates.size} cameras`,
    };
  }
}
