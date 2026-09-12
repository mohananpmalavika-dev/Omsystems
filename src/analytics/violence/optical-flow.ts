/**
 * Optical Flow & Motion Turbulence Analyzer
 * 
 * Computes dense/block Lucas-Kanade optical flow vectors, aggregate kinetic motion energy,
 * and directional turbulence entropy to differentiate chaotic physical altercations
 * from laminar translation (e.g. normal walking or vehicle passage).
 */

export interface OpticalFlowVector {
  x: number;
  y: number;
  u: number; // horizontal velocity (dx/dt)
  v: number; // vertical velocity (dy/dt)
  magnitude: number;
  angle: number; // radians [-PI, PI]
}

export interface OpticalFlowMetrics {
  totalVectors: number;
  meanMagnitude: number;
  peakMagnitude: number;
  kineticEnergy: number; // sum of 0.5 * magnitude^2 / N
  turbulenceScore: number; // normalized angular entropy [0, 1]
  chaoticVectorCount: number;
  dominantDirection: number | null; // angle of dominant motion if laminar
}

export class OpticalFlowAnalyzer {
  private readonly blockSize: number;
  private readonly minGradientThreshold: number;

  constructor(options?: { blockSize?: number; minGradientThreshold?: number }) {
    this.blockSize = options?.blockSize ?? 16;
    this.minGradientThreshold = options?.minGradientThreshold ?? 4.0;
  }

  /**
   * Compute optical flow vectors between two grayscale luminance buffers (width x height)
   */
  public computeFlow(
    prevLuma: Uint8Array | Buffer,
    currLuma: Uint8Array | Buffer,
    width: number,
    height: number,
    regionOfInterest?: { x: number; y: number; width: number; height: number }
  ): OpticalFlowVector[] {
    const vectors: OpticalFlowVector[] = [];
    const bs = this.blockSize;

    const startX = Math.max(1, regionOfInterest ? Math.floor(regionOfInterest.x) : 0);
    const startY = Math.max(1, regionOfInterest ? Math.floor(regionOfInterest.y) : 0);
    const endX = Math.min(width - 2, regionOfInterest ? Math.floor(regionOfInterest.x + regionOfInterest.width) : width - 1);
    const endY = Math.min(height - 2, regionOfInterest ? Math.floor(regionOfInterest.y + regionOfInterest.height) : height - 1);

    for (let cy = startY + Math.floor(bs / 2); cy < endY - Math.floor(bs / 2); cy += bs) {
      for (let cx = startX + Math.floor(bs / 2); cx < endX - Math.floor(bs / 2); cx += bs) {
        let sumIx2 = 0;
        let sumIy2 = 0;
        let sumIxIy = 0;
        let sumIxIt = 0;
        let sumIyIt = 0;

        const half = Math.floor(bs / 2);
        for (let dy = -half; dy <= half; dy++) {
          const y = cy + dy;
          const rowOffset = y * width;

          for (let dx = -half; dx <= half; dx++) {
            const x = cx + dx;
            const idx = rowOffset + x;

            // Spatial central gradients
            const ix = (Number(currLuma[idx + 1] ?? 0) - Number(currLuma[idx - 1] ?? 0)) / 2;
            const iy = (Number(currLuma[idx + width] ?? 0) - Number(currLuma[idx - width] ?? 0)) / 2;

            // Temporal gradient
            const it = Number(currLuma[idx] ?? 0) - Number(prevLuma[idx] ?? 0);

            sumIx2 += ix * ix;
            sumIy2 += iy * iy;
            sumIxIy += ix * iy;
            sumIxIt += ix * it;
            sumIyIt += iy * it;
          }
        }

        // Structural tensor: [sumIx2, sumIxIy; sumIxIy, sumIy2]
        // Add Tikhonov regularization to handle aperture problem and 1D edges
        const lambda = 0.5;
        const a11 = sumIx2 + lambda;
        const a22 = sumIy2 + lambda;
        const a12 = sumIxIy;
        const det = a11 * a22 - a12 * a12;

        // Ensure sufficient gradient energy
        if (sumIx2 + sumIy2 > this.minGradientThreshold && det > 0.001) {
          // Invert regularized 2x2 matrix: [u, v]^T = - A^{-1} b
          const u = (-a22 * sumIxIt + a12 * sumIyIt) / det;
          const v = (a12 * sumIxIt - a11 * sumIyIt) / det;

          const magSq = u * u + v * v;
          const magnitude = Math.sqrt(magSq);
          const angle = Math.atan2(v, u);

          if (magnitude > 0.3 && magnitude < 150) {
            vectors.push({
              x: cx,
              y: cy,
              u,
              v,
              magnitude,
              angle,
            });
          }
        }
      }
    }

    return vectors;
  }

  /**
   * Analyze kinetic energy and turbulence entropy from flow vectors
   */
  public analyzeMetrics(vectors: OpticalFlowVector[]): OpticalFlowMetrics {
    if (vectors.length === 0) {
      return {
        totalVectors: 0,
        meanMagnitude: 0,
        peakMagnitude: 0,
        kineticEnergy: 0,
        turbulenceScore: 0,
        chaoticVectorCount: 0,
        dominantDirection: null,
      };
    }

    let sumMag = 0;
    let peakMag = 0;
    let kineticSum = 0;

    // 8-bin directional histogram for Shannon entropy evaluation
    const bins = new Float64Array(8);

    for (const v of vectors) {
      sumMag += v.magnitude;
      if (v.magnitude > peakMag) {
        peakMag = v.magnitude;
      }
      kineticSum += 0.5 * (v.magnitude * v.magnitude);

      // Quantize angle [-PI, PI] to [0, 7]
      const normalizedAngle = (v.angle + Math.PI) / (2 * Math.PI); // [0, 1)
      const binIdx = Math.min(7, Math.max(0, Math.floor(normalizedAngle * 8)));
      bins[binIdx] = (bins[binIdx] ?? 0) + v.magnitude; // Weight by magnitude
    }

    const n = vectors.length;
    const meanMagnitude = sumMag / n;
    const kineticEnergy = kineticSum / n;

    // Calculate Shannon entropy over directional distribution: H = - sum p_i log2(p_i)
    let totalWeight = 0;
    for (let i = 0; i < 8; i++) {
      totalWeight += bins[i]!;
    }

    let entropy = 0;
    let maxBinVal = 0;
    let dominantBin = -1;

    if (totalWeight > 0) {
      for (let i = 0; i < 8; i++) {
        const p = bins[i]! / totalWeight;
        if (p > 0) {
          entropy -= p * Math.log2(p);
        }
        if (bins[i]! > maxBinVal) {
          maxBinVal = bins[i]!;
          dominantBin = i;
        }
      }
    }

    // Max entropy for 8 uniform bins is log2(8) = 3.0. Normalize to [0, 1].
    const normalizedTurbulence = Math.min(1.0, entropy / 3.0);

    // Chaotic vectors are those whose direction opposes or deviates significantly (> 60 deg) from dominant flow
    let chaoticCount = 0;
    const dominantAngle = dominantBin >= 0 ? (dominantBin / 8) * 2 * Math.PI - Math.PI : null;

    if (dominantAngle !== null) {
      for (const v of vectors) {
        let diff = Math.abs(v.angle - dominantAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff > Math.PI / 3) {
          chaoticCount++;
        }
      }
    }

    return {
      totalVectors: n,
      meanMagnitude,
      peakMagnitude: peakMag,
      kineticEnergy,
      turbulenceScore: Number(normalizedTurbulence.toFixed(4)),
      chaoticVectorCount: chaoticCount,
      dominantDirection: dominantAngle !== null ? Number(dominantAngle.toFixed(4)) : null,
    };
  }

  /**
   * Helper to convert an RGB/RGBA buffer to a single-channel 8-bit luminance array
   */
  public static rgbToLuma(buffer: Uint8Array | Buffer, width: number, height: number, channels: 3 | 4 = 3): Uint8Array {
    const pixelCount = width * height;
    const luma = new Uint8Array(pixelCount);

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * channels;
      const r = buffer[offset] ?? 0;
      const g = buffer[offset + 1] ?? 0;
      const b = buffer[offset + 2] ?? 0;

      // Rec. 601 ITU-R luminance: Y = 0.299R + 0.587G + 0.114B
      luma[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    return luma;
  }
}
