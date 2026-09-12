/**
 * Camera Tamper & Defocus Detector
 * 
 * Production-ready statistical frame analysis detecting:
 * - Lens covering & blackout (luminance collapse)
 * - Spotlight/laser blinding & glare (luminance saturation)
 * - Defocus & blurring (discrete Laplacian variance collapse)
 * - Camera repositioning & movement (structural similarity & L1 scene distance)
 * - Spray paint tampering (edge gradient energy & Shannon entropy collapse)
 */

import { BaseDetector, type DetectionFrame, type DetectionResult } from './base-detector.js';

interface CameraTamperState {
  lastObservedAt: Date;
  baseline?: {
    luminance: number;
    variance: number;
    laplacianVariance: number;
    edgeDensity: number;
    entropy: number;
    luma: Uint8Array;
  };
  consecutiveTamperFrames: number;
  activeTamperType?: string;
}

export class CameraTamperDetector extends BaseDetector {
  private cameraStates = new Map<string, CameraTamperState>();
  private readonly DEBOUNCE_FRAMES = 3;

  constructor() {
    super('camera-tamper', '2.0.1');
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
        consecutiveTamperFrames: 0,
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
      if (yVal <= 15) shadows++;
    }

    const meanLuma = sum / pixelCount;
    const varLuma = Math.max(0, sumSq / pixelCount - meanLuma * meanLuma);

    // 2. Discrete 8-connected Laplacian variance
    let lapSum = 0;
    let lapSumSq = 0;
    const interior = Math.max(1, (width - 2) * (height - 2));

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
        lapSum += lap;
        lapSumSq += lap * lap;
      }
    }
    const meanLap = lapSum / interior;
    const lapVar = Math.max(0, lapSumSq / interior - meanLap * meanLap);

    // 3. Sobel edge density
    let edges = 0;
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

    // 4. Shannon spatial entropy
    let entropy = 0;
    for (let k = 0; k < 256; k++) {
      if (hist[k] > 0) {
        const p = hist[k] / pixelCount;
        entropy -= p * Math.log2(p);
      }
    }

    // 5. Initialize or compare with baseline
    if (!state.baseline) {
      state.baseline = {
        luminance: meanLuma,
        variance: varLuma,
        laplacianVariance: lapVar,
        edgeDensity,
        entropy,
        luma,
      };
      state.lastObservedAt = now;
      return results;
    }

    // Compare with baseline
    let l1Diff = 0;
    for (let i = 0; i < pixelCount; i++) {
      l1Diff += Math.abs(luma[i]! - state.baseline.luma[i]!);
    }
    const sceneChangeScore = Math.min(1.0, l1Diff / (pixelCount * 255));
    const structuralSimilarity = Math.max(0, 1.0 - sceneChangeScore);

    const highlightFraction = highlights / pixelCount;
    let detectedType: string | null = null;
    let confidence = 0;
    const reasons: string[] = [];

    // Check conditions
    if (meanLuma >= 240 || (highlightFraction >= 0.85 && varLuma < 40)) {
      detectedType = 'blinding';
      confidence = 0.95;
      reasons.push(`High-intensity glare detected: luminance=${meanLuma.toFixed(1)}`);
    } else if (meanLuma <= 15 && varLuma < 15 && state.baseline.luminance >= 20) {
      detectedType = 'covering';
      confidence = 0.95;
      reasons.push(`Lens covering/blackout detected: luminance=${meanLuma.toFixed(1)}`);
    } else if (meanLuma > 20 && meanLuma < 235 && lapVar < 80 && lapVar < state.baseline.laplacianVariance * 0.45 && varLuma >= 15) {
      detectedType = 'defocus';
      confidence = 0.90;
      reasons.push(`Defocus blur detected: laplacianVar=${lapVar.toFixed(1)} vs baseline=${state.baseline.laplacianVariance.toFixed(1)}`);
    } else if (
      meanLuma > 20 && meanLuma < 235 &&
      edgeDensity < state.baseline.edgeDensity * 0.35 &&
      (state.baseline.entropy - entropy) >= 1.8 &&
      structuralSimilarity < 0.40
    ) {
      detectedType = 'spray';
      confidence = 0.92;
      reasons.push(`Spray paint occlusion detected on lens`);
    } else if (meanLuma > 20 && meanLuma < 235 && structuralSimilarity < 0.35 && sceneChangeScore >= 0.65) {
      detectedType = 'movement';
      confidence = 0.88;
      reasons.push(`Camera orientation shifted: SSIM=${structuralSimilarity.toFixed(2)}, sceneChange=${sceneChangeScore.toFixed(2)}`);
    }

    if (detectedType) {
      if (state.activeTamperType === detectedType) {
        state.consecutiveTamperFrames++;
      } else {
        state.activeTamperType = detectedType;
        state.consecutiveTamperFrames = 1;
      }

      if (state.consecutiveTamperFrames >= this.DEBOUNCE_FRAMES) {
        results.push({
          detectionType: 'camera-tamper',
          confidence,
          objects: [],
          metadata: {
            tamperType: detectedType,
            luminance: Math.round(meanLuma * 10) / 10,
            variance: Math.round(varLuma * 10) / 10,
            laplacianVariance: Math.round(lapVar * 10) / 10,
            edgeDensity: Math.round(edgeDensity * 1000) / 1000,
            entropy: Math.round(entropy * 100) / 100,
            structuralSimilarity: Math.round(structuralSimilarity * 1000) / 1000,
            sceneChangeScore: Math.round(sceneChangeScore * 1000) / 1000,
            reasons,
          },
          requiresAlert: true,
        });
      }
    } else {
      state.consecutiveTamperFrames = Math.max(0, state.consecutiveTamperFrames - 1);
      if (state.consecutiveTamperFrames === 0) {
        state.activeTamperType = undefined;
      }
    }

    state.lastObservedAt = now;
    return results;
  }

  async cleanup(): Promise<void> {
    this.cameraStates.clear();
  }

  getHealth() {
    return {
      status: 'healthy' as const,
      details: `Monitoring optical tamper state for ${this.cameraStates.size} cameras`,
    };
  }
}
