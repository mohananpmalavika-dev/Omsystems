/**
 * License Plate Detection
 * Detects license plates within vehicle crops with quality scoring
 */

import type { BoundingBox, ImageMatrix } from '../color/vehicle-color-classifier.js';

export interface PlateDetection {
  boundingBox: BoundingBox;
  confidence: number;
  plateType?: 'single-line' | 'double-line';
  quality: number;
}

export interface PlateQualityMetrics {
  width: number;
  height: number;
  aspectRatio: number;
  blurScore: number;
  brightnessScore: number;
  overallQuality: number;
}

export interface LicensePlateDetector {
  detect(image: ImageMatrix): Promise<PlateDetection[]>;
}

/**
 * YOLO-based License Plate Detector
 */
export class YoloPlateDetector implements LicensePlateDetector {
  constructor(
    private readonly minConfidence: number = 0.45,
    private readonly minWidth: number = 40,
    private readonly minHeight: number = 12
  ) {}
  
  async detect(vehicleCrop: ImageMatrix): Promise<PlateDetection[]> {
    // In production, this would run YOLO/ONNX inference
    // For now, return structure showing expected behavior
    
    // Simulate detection results
    const candidates: PlateDetection[] = [];
    
    // Check if we can detect plates via external inference
    try {
      const detections = await this.runInference(vehicleCrop);
      
      for (const det of detections) {
        if (det.confidence < this.minConfidence) continue;
        if (!this.isPlausiblePlate(det.boundingBox)) continue;
        
        const quality = this.assessPlateQuality(vehicleCrop, det.boundingBox);
        
        candidates.push({
          ...det,
          quality: quality.overallQuality,
        });
      }
    } catch (error) {
      // Fallback: heuristic detection in lower portion of vehicle
      const heuristicPlate = this.heuristicPlateDetection(vehicleCrop);
      if (heuristicPlate) {
        candidates.push(heuristicPlate);
      }
    }
    
    // Sort by confidence and quality
    return candidates
      .filter(c => c.quality >= 0.3)
      .sort((a, b) => {
        const scoreA = a.confidence * 0.6 + a.quality * 0.4;
        const scoreB = b.confidence * 0.6 + b.quality * 0.4;
        return scoreB - scoreA;
      });
  }
  
  /**
   * Run YOLO inference for plate detection
   */
  private async runInference(image: ImageMatrix): Promise<Array<{
    boundingBox: BoundingBox;
    confidence: number;
  }>> {
    // Placeholder for actual ONNX/YOLO inference
    // Would preprocess image, run model, postprocess results
    return [];
  }
  
  /**
   * Heuristic plate detection (fallback)
   */
  private heuristicPlateDetection(vehicleCrop: ImageMatrix): PlateDetection | null {
    // Plates are typically in lower 30% of vehicle
    const plateRegionY = Math.floor(vehicleCrop.height * 0.7);
    const plateRegionHeight = Math.floor(vehicleCrop.height * 0.25);
    
    // Typical plate aspect ratios: 2:1 to 6:1
    const plateWidth = Math.floor(vehicleCrop.width * 0.6);
    const plateHeight = Math.floor(plateWidth / 4); // Assume 4:1 ratio
    
    const plateX = Math.floor((vehicleCrop.width - plateWidth) / 2);
    const plateY = plateRegionY + Math.floor((plateRegionHeight - plateHeight) / 2);
    
    const boundingBox: BoundingBox = {
      x: Math.max(0, plateX),
      y: Math.max(0, plateY),
      width: Math.min(plateWidth, vehicleCrop.width - plateX),
      height: Math.min(plateHeight, vehicleCrop.height - plateY),
    };
    
    if (!this.isPlausiblePlate(boundingBox)) {
      return null;
    }
    
    const quality = this.assessPlateQuality(vehicleCrop, boundingBox);
    
    return {
      boundingBox,
      confidence: 0.5, // Heuristic confidence
      quality: quality.overallQuality,
    };
  }
  
  /**
   * Validate plate geometry
   */
  private isPlausiblePlate(box: BoundingBox): boolean {
    if (box.width < this.minWidth || box.height < this.minHeight) {
      return false;
    }
    
    const ratio = box.width / box.height;
    
    // Valid plate aspect ratios: 1.2:1 to 6.5:1
    return ratio >= 1.2 && ratio <= 6.5;
  }
  
  /**
   * Assess plate crop quality
   */
  private assessPlateQuality(
    image: ImageMatrix,
    bbox: BoundingBox
  ): PlateQualityMetrics {
    const crop = this.extractCrop(image, bbox);
    
    // Width and height scores
    const widthScore = Math.min(bbox.width / 150, 1.0); // Prefer >150px width
    const heightScore = Math.min(bbox.height / 40, 1.0); // Prefer >40px height
    
    // Aspect ratio score
    const ratio = bbox.width / bbox.height;
    const idealRatio = 4.0;
    const ratioScore = 1 - Math.min(Math.abs(ratio - idealRatio) / idealRatio, 1.0);
    
    // Blur score (variance of Laplacian)
    const blurScore = this.calculateBlurScore(crop);
    
    // Brightness score
    const brightnessScore = this.calculateBrightnessScore(crop);
    
    // Overall quality (weighted average)
    const overallQuality =
      widthScore * 0.25 +
      heightScore * 0.15 +
      ratioScore * 0.15 +
      blurScore * 0.30 +
      brightnessScore * 0.15;
    
    return {
      width: bbox.width,
      height: bbox.height,
      aspectRatio: ratio,
      blurScore,
      brightnessScore,
      overallQuality,
    };
  }
  
  /**
   * Extract crop from image
   */
  private extractCrop(image: ImageMatrix, bbox: BoundingBox): ImageMatrix {
    const x = Math.max(0, Math.floor(bbox.x));
    const y = Math.max(0, Math.floor(bbox.y));
    const width = Math.min(Math.floor(bbox.width), image.width - x);
    const height = Math.min(Math.floor(bbox.height), image.height - y);
    
    const cropData = new Uint8Array(width * height * image.channels);
    
    for (let cy = 0; cy < height; cy++) {
      for (let cx = 0; cx < width; cx++) {
        const srcOffset = ((y + cy) * image.width + (x + cx)) * image.channels;
        const dstOffset = (cy * width + cx) * image.channels;
        
        for (let c = 0; c < image.channels; c++) {
          cropData[dstOffset + c] = image.data[srcOffset + c];
        }
      }
    }
    
    return {
      data: cropData,
      width,
      height,
      channels: image.channels,
    };
  }
  
  /**
   * Calculate blur score using Laplacian variance
   */
  private calculateBlurScore(crop: ImageMatrix): number {
    // Convert to grayscale
    const gray = this.toGrayscale(crop);
    
    // Apply Laplacian kernel
    const laplacian = this.applyLaplacian(gray);
    
    // Calculate variance
    const mean = laplacian.reduce((sum, val) => sum + val, 0) / laplacian.length;
    const variance = laplacian.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / laplacian.length;
    
    // Higher variance = less blur
    // Normalize to 0-1 range (empirical threshold: 100)
    return Math.min(variance / 100, 1.0);
  }
  
  /**
   * Calculate brightness score
   */
  private calculateBrightnessScore(crop: ImageMatrix): number {
    const gray = this.toGrayscale(crop);
    const mean = gray.reduce((sum, val) => sum + val, 0) / gray.length;
    
    // Ideal brightness: 0.4-0.7 range
    if (mean >= 0.4 && mean <= 0.7) {
      return 1.0;
    } else if (mean < 0.2 || mean > 0.9) {
      return 0.3;
    } else {
      return 0.7;
    }
  }
  
  /**
   * Convert to grayscale
   */
  private toGrayscale(image: ImageMatrix): number[] {
    const gray: number[] = [];
    
    for (let i = 0; i < image.data.length; i += image.channels) {
      const r = image.data[i] / 255;
      const g = image.data[i + 1] / 255;
      const b = image.data[i + 2] / 255;
      gray.push(0.299 * r + 0.587 * g + 0.114 * b);
    }
    
    return gray;
  }
  
  /**
   * Apply Laplacian operator
   */
  private applyLaplacian(gray: number[]): number[] {
    // Simplified 1D Laplacian for variance calculation
    const result: number[] = [];
    
    for (let i = 1; i < gray.length - 1; i++) {
      const lap = Math.abs(gray[i - 1] - 2 * gray[i] + gray[i + 1]);
      result.push(lap);
    }
    
    return result;
  }
}

/**
 * Translate plate coordinates from vehicle crop to original frame
 */
export function translateBoundingBox(
  plateBox: BoundingBox,
  vehicleBox: BoundingBox
): BoundingBox {
  return {
    x: vehicleBox.x + plateBox.x,
    y: vehicleBox.y + plateBox.y,
    width: plateBox.width,
    height: plateBox.height,
  };
}

/**
 * Calculate overall plate quality score
 */
export function calculatePlateQuality(
  detection: PlateDetection
): number {
  return detection.confidence * 0.5 + detection.quality * 0.5;
}
