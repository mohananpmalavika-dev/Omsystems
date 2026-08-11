/**
 * Vehicle Color Classification
 * Uses HSV/LAB color space analysis with dominant color extraction
 */

export type VehicleColor =
  | 'black'
  | 'white'
  | 'gray'
  | 'silver'
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'brown'
  | 'beige'
  | 'unknown';

export interface VehicleColorResult {
  color: VehicleColor;
  confidence: number;
  secondaryColor?: VehicleColor;
  hsvValues?: { h: number; s: number; v: number };
}

export interface ImageMatrix {
  data: Buffer | Uint8Array;
  width: number;
  height: number;
  channels: number; // 3 for RGB, 4 for RGBA
}

export interface ColorCluster {
  color: { r: number; g: number; b: number };
  size: number;
  percentage: number;
}

export interface VehicleColorClassifier {
  classify(crop: ImageMatrix): Promise<VehicleColorResult>;
}

/**
 * Dominant Color Classifier using HSV color space
 */
export class DominantColorClassifier implements VehicleColorClassifier {
  
  async classify(vehicleCrop: ImageMatrix): Promise<VehicleColorResult> {
    // Extract central body region (avoid windows, tires, background)
    const roi = this.extractCentralBody(vehicleCrop);
    
    // Sample pixels
    const pixels = this.samplePixels(roi, 3);
    
    // Filter out very dark and very bright pixels
    const usablePixels = pixels.filter(pixel => {
      const hsv = this.rgbToHsv(pixel);
      return hsv.v > 0.15 && hsv.v < 0.95;
    });
    
    if (usablePixels.length < 50) {
      return {
        color: 'unknown',
        confidence: 0,
      };
    }
    
    // Cluster colors using k-means (k=3)
    const clusters = this.kMeansRgb(usablePixels, 3);
    
    // Get dominant cluster
    const dominant = clusters.sort((a, b) => b.size - a.size)[0];
    
    // Map to vehicle color category
    return this.mapRgbToVehicleColor(dominant.color, dominant.percentage);
  }
  
  /**
   * Extract central 60-75% of vehicle to avoid background
   */
  private extractCentralBody(image: ImageMatrix): ImageMatrix {
    const marginX = Math.floor(image.width * 0.15);
    const marginY = Math.floor(image.height * 0.15);
    const roiWidth = image.width - 2 * marginX;
    const roiHeight = image.height - 2 * marginY;
    
    const roiData = new Uint8Array(roiWidth * roiHeight * image.channels);
    
    for (let y = 0; y < roiHeight; y++) {
      for (let x = 0; x < roiWidth; x++) {
        const srcOffset = ((marginY + y) * image.width + (marginX + x)) * image.channels;
        const dstOffset = (y * roiWidth + x) * image.channels;
        
        for (let c = 0; c < image.channels; c++) {
          roiData[dstOffset + c] = image.data[srcOffset + c];
        }
      }
    }
    
    return {
      data: roiData,
      width: roiWidth,
      height: roiHeight,
      channels: image.channels,
    };
  }
  
  /**
   * Sample pixels with stride
   */
  private samplePixels(
    image: ImageMatrix,
    stride: number
  ): Array<{ r: number; g: number; b: number }> {
    const pixels: Array<{ r: number; g: number; b: number }> = [];
    
    for (let y = 0; y < image.height; y += stride) {
      for (let x = 0; x < image.width; x += stride) {
        const offset = (y * image.width + x) * image.channels;
        pixels.push({
          r: image.data[offset] / 255,
          g: image.data[offset + 1] / 255,
          b: image.data[offset + 2] / 255,
        });
      }
    }
    
    return pixels;
  }
  
  /**
   * Convert RGB to HSV color space
   */
  private rgbToHsv(rgb: { r: number; g: number; b: number }): { h: number; s: number; v: number } {
    const max = Math.max(rgb.r, rgb.g, rgb.b);
    const min = Math.min(rgb.r, rgb.g, rgb.b);
    const delta = max - min;
    
    let h = 0;
    const s = max === 0 ? 0 : delta / max;
    const v = max;
    
    if (delta !== 0) {
      if (max === rgb.r) {
        h = ((rgb.g - rgb.b) / delta + (rgb.g < rgb.b ? 6 : 0)) / 6;
      } else if (max === rgb.g) {
        h = ((rgb.b - rgb.r) / delta + 2) / 6;
      } else {
        h = ((rgb.r - rgb.g) / delta + 4) / 6;
      }
    }
    
    return { h, s, v };
  }
  
  /**
   * K-means clustering in RGB space
   */
  private kMeansRgb(
    pixels: Array<{ r: number; g: number; b: number }>,
    k: number,
    maxIterations: number = 10
  ): ColorCluster[] {
    if (pixels.length === 0) return [];
    
    // Initialize centroids randomly
    const centroids: Array<{ r: number; g: number; b: number }> = [];
    for (let i = 0; i < k; i++) {
      const idx = Math.floor(Math.random() * pixels.length);
      centroids.push({ ...pixels[idx] });
    }
    
    // Iterative assignment and update
    for (let iter = 0; iter < maxIterations; iter++) {
      // Assign pixels to nearest centroid
      const assignments = new Array(pixels.length).fill(0);
      
      for (let i = 0; i < pixels.length; i++) {
        let minDist = Infinity;
        let nearestCluster = 0;
        
        for (let j = 0; j < k; j++) {
          const dist = this.euclideanDistance(pixels[i], centroids[j]);
          if (dist < minDist) {
            minDist = dist;
            nearestCluster = j;
          }
        }
        
        assignments[i] = nearestCluster;
      }
      
      // Update centroids
      const counts = new Array(k).fill(0);
      const sums = centroids.map(() => ({ r: 0, g: 0, b: 0 }));
      
      for (let i = 0; i < pixels.length; i++) {
        const cluster = assignments[i];
        counts[cluster]++;
        sums[cluster].r += pixels[i].r;
        sums[cluster].g += pixels[i].g;
        sums[cluster].b += pixels[i].b;
      }
      
      for (let j = 0; j < k; j++) {
        if (counts[j] > 0) {
          centroids[j] = {
            r: sums[j].r / counts[j],
            g: sums[j].g / counts[j],
            b: sums[j].b / counts[j],
          };
        }
      }
    }
    
    // Build clusters
    const clusterSizes = new Array(k).fill(0);
    for (let i = 0; i < pixels.length; i++) {
      let minDist = Infinity;
      let nearestCluster = 0;
      
      for (let j = 0; j < k; j++) {
        const dist = this.euclideanDistance(pixels[i], centroids[j]);
        if (dist < minDist) {
          minDist = dist;
          nearestCluster = j;
        }
      }
      
      clusterSizes[nearestCluster]++;
    }
    
    return centroids.map((color, idx) => ({
      color: {
        r: Math.round(color.r * 255),
        g: Math.round(color.g * 255),
        b: Math.round(color.b * 255),
      },
      size: clusterSizes[idx],
      percentage: clusterSizes[idx] / pixels.length,
    }));
  }
  
  /**
   * Euclidean distance between two RGB colors
   */
  private euclideanDistance(
    a: { r: number; g: number; b: number },
    b: { r: number; g: number; b: number }
  ): number {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }
  
  /**
   * Map RGB color to vehicle color category
   */
  private mapRgbToVehicleColor(
    rgb: { r: number; g: number; b: number },
    percentage: number
  ): VehicleColorResult {
    const hsv = this.rgbToHsv({
      r: rgb.r / 255,
      g: rgb.g / 255,
      b: rgb.b / 255,
    });
    
    // Achromatic colors (low saturation)
    if (hsv.s < 0.15) {
      if (hsv.v < 0.25) {
        return { color: 'black', confidence: 0.9, hsvValues: hsv };
      } else if (hsv.v > 0.85) {
        return { color: 'white', confidence: 0.9, hsvValues: hsv };
      } else if (hsv.v > 0.6) {
        return { color: 'silver', confidence: 0.75, hsvValues: hsv };
      } else {
        return { color: 'gray', confidence: 0.8, hsvValues: hsv };
      }
    }
    
    // Chromatic colors (hue-based)
    const hue = hsv.h * 360;
    
    // Red: 0-30, 330-360
    if ((hue >= 0 && hue < 30) || hue >= 330) {
      return { color: 'red', confidence: 0.85, hsvValues: hsv };
    }
    
    // Orange: 30-50
    if (hue >= 30 && hue < 50) {
      return { color: 'orange', confidence: 0.8, hsvValues: hsv };
    }
    
    // Yellow: 50-70
    if (hue >= 50 && hue < 70) {
      return { color: 'yellow', confidence: 0.85, hsvValues: hsv };
    }
    
    // Green: 70-170
    if (hue >= 70 && hue < 170) {
      return { color: 'green', confidence: 0.85, hsvValues: hsv };
    }
    
    // Blue: 170-260
    if (hue >= 170 && hue < 260) {
      return { color: 'blue', confidence: 0.85, hsvValues: hsv };
    }
    
    // Brown/Beige: 260-330 with low saturation or value
    if (hue >= 20 && hue < 60 && hsv.s < 0.4 && hsv.v < 0.6) {
      return { color: 'beige', confidence: 0.7, hsvValues: hsv };
    }
    
    if (hue >= 20 && hue < 60 && hsv.v < 0.5) {
      return { color: 'brown', confidence: 0.75, hsvValues: hsv };
    }
    
    // Default
    return { color: 'unknown', confidence: 0.5, hsvValues: hsv };
  }
}

/**
 * Resolve consensus color from multiple observations
 */
export function resolveVehicleColor(
  observations: Array<{ color: string; confidence: number; timestamp: Date }>
): { color: VehicleColor; confidence: number } | undefined {
  if (observations.length === 0) return undefined;
  
  // Count occurrences weighted by confidence
  const colorScores = new Map<string, number>();
  
  for (const obs of observations) {
    const current = colorScores.get(obs.color) || 0;
    colorScores.set(obs.color, current + obs.confidence);
  }
  
  // Find color with highest score
  let bestColor = 'unknown';
  let bestScore = 0;
  
  for (const [color, score] of colorScores.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestColor = color;
    }
  }
  
  const totalObservations = observations.length;
  const confidence = Math.min(bestScore / totalObservations, 1.0);
  
  return {
    color: bestColor as VehicleColor,
    confidence,
  };
}
