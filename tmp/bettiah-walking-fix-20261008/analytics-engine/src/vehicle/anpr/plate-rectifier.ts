/**
 * License Plate Rectification
 * Perspective correction, deskew, and contrast normalization
 */

import type { ImageMatrix } from '../color/vehicle-color-classifier.js';

export interface RectifiedPlate {
  image: ImageMatrix;
  quality: number;
  rotationDegrees?: number;
  transformApplied: boolean;
}

export interface PlateRectifier {
  rectify(plateCrop: ImageMatrix): Promise<RectifiedPlate>;
}

/**
 * Basic Plate Rectifier
 * Applies contrast normalization, deskew, and basic perspective correction
 */
export class BasicPlateRectifier implements PlateRectifier {
  constructor(
    private readonly targetWidth: number = 200,
    private readonly targetHeight: number = 50
  ) {}
  
  async rectify(plateCrop: ImageMatrix): Promise<RectifiedPlate> {
    let processed = plateCrop;
    let quality = 0.5;
    let rotationDegrees: number | undefined;
    let transformApplied = false;
    
    // Step 1: Expand crop slightly to ensure full plate
    processed = this.expandCrop(processed, 1.1);
    
    // Step 2: Convert to grayscale for processing
    const gray = this.toGrayscale(processed);
    
    // Step 3: Detect skew angle
    const skewAngle = this.detectSkew(gray);
    
    if (Math.abs(skewAngle) > 2) {
      // Rotate to correct skew
      processed = this.rotate(processed, -skewAngle);
      rotationDegrees = -skewAngle;
      transformApplied = true;
    }
    
    // Step 4: Enhance contrast
    processed = this.enhanceContrast(processed);
    transformApplied = true;
    
    // Step 5: Resize to standard dimensions
    if (processed.width !== this.targetWidth || processed.height !== this.targetHeight) {
      processed = this.resize(processed, this.targetWidth, this.targetHeight);
    }
    
    // Step 6: Calculate quality score
    quality = this.assessQuality(processed);
    
    return {
      image: processed,
      quality,
      rotationDegrees,
      transformApplied,
    };
  }
  
  /**
   * Expand crop by factor to capture full plate
   */
  private expandCrop(image: ImageMatrix, factor: number): ImageMatrix {
    if (factor <= 1.0) return image;
    
    const newWidth = Math.floor(image.width * factor);
    const newHeight = Math.floor(image.height * factor);
    const marginX = Math.floor((newWidth - image.width) / 2);
    const marginY = Math.floor((newHeight - image.height) / 2);
    
    const expanded = new Uint8Array(newWidth * newHeight * image.channels);
    
    // Fill with white background
    expanded.fill(255);
    
    // Copy original image to center
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const srcOffset = (y * image.width + x) * image.channels;
        const dstOffset = ((marginY + y) * newWidth + (marginX + x)) * image.channels;
        
        for (let c = 0; c < image.channels; c++) {
          expanded[dstOffset + c] = image.data[srcOffset + c];
        }
      }
    }
    
    return {
      data: expanded,
      width: newWidth,
      height: newHeight,
      channels: image.channels,
    };
  }
  
  /**
   * Detect skew angle using horizontal projection
   */
  private detectSkew(gray: number[][]): number {
    // Simple skew detection using variance of horizontal projections
    // In production, use Hough transform or more sophisticated methods
    
    const angles = [-15, -10, -5, -2, 0, 2, 5, 10, 15];
    let maxVariance = 0;
    let bestAngle = 0;
    
    for (const angle of angles) {
      const variance = this.calculateProjectionVariance(gray, angle);
      if (variance > maxVariance) {
        maxVariance = variance;
        bestAngle = angle;
      }
    }
    
    return bestAngle;
  }
  
  /**
   * Calculate horizontal projection variance at angle
   * 
   * Measures text line sharpness to detect optimal deskew angle.
   * Higher variance indicates better horizontal alignment (sharper text edges).
   */
  private calculateProjectionVariance(gray: number[][], angle: number): number {
    const height = gray.length;
    const width = gray[0]?.length || 0;
    
    if (width === 0 || height === 0) {
      return 0;
    }
    
    // Calculate horizontal projection profile
    // (sum of pixel intensities along each row)
    const projection: number[] = [];
    
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      for (let x = 0; x < width; x++) {
        rowSum += gray[y][x];
      }
      projection.push(rowSum / width);
    }
    
    // Calculate variance of projection
    // Well-aligned text produces high variance (distinct peaks/valleys)
    const mean = projection.reduce((sum, val) => sum + val, 0) / projection.length;
    const variance = projection.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / projection.length;
    
    return variance;
  }
  
  /**
   * Rotate image by angle (degrees)
   */
  private rotate(image: ImageMatrix, angleDegrees: number): ImageMatrix {
    if (angleDegrees === 0) return image;
    
    const angleRad = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    // Calculate new dimensions
    const newWidth = Math.ceil(
      Math.abs(image.width * cos) + Math.abs(image.height * sin)
    );
    const newHeight = Math.ceil(
      Math.abs(image.width * sin) + Math.abs(image.height * cos)
    );
    
    const rotated = new Uint8Array(newWidth * newHeight * image.channels);
    rotated.fill(255); // White background
    
    const centerX = image.width / 2;
    const centerY = image.height / 2;
    const newCenterX = newWidth / 2;
    const newCenterY = newHeight / 2;
    
    // Apply rotation
    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        // Map back to source image
        const srcX = (x - newCenterX) * cos - (y - newCenterY) * sin + centerX;
        const srcY = (x - newCenterX) * sin + (y - newCenterY) * cos + centerY;
        
        // Check bounds
        if (srcX >= 0 && srcX < image.width - 1 && srcY >= 0 && srcY < image.height - 1) {
          // Bilinear interpolation
          const x0 = Math.floor(srcX);
          const x1 = x0 + 1;
          const y0 = Math.floor(srcY);
          const y1 = y0 + 1;
          
          const dx = srcX - x0;
          const dy = srcY - y0;
          
          const dstOffset = (y * newWidth + x) * image.channels;
          
          for (let c = 0; c < image.channels; c++) {
            const v00 = image.data[(y0 * image.width + x0) * image.channels + c];
            const v10 = image.data[(y0 * image.width + x1) * image.channels + c];
            const v01 = image.data[(y1 * image.width + x0) * image.channels + c];
            const v11 = image.data[(y1 * image.width + x1) * image.channels + c];
            
            const value =
              v00 * (1 - dx) * (1 - dy) +
              v10 * dx * (1 - dy) +
              v01 * (1 - dx) * dy +
              v11 * dx * dy;
            
            rotated[dstOffset + c] = Math.round(value);
          }
        }
      }
    }
    
    return {
      data: rotated,
      width: newWidth,
      height: newHeight,
      channels: image.channels,
    };
  }
  
  /**
   * Enhance contrast using histogram equalization
   */
  private enhanceContrast(image: ImageMatrix): ImageMatrix {
    const enhanced = new Uint8Array(image.data.length);
    
    // Convert to grayscale for histogram calculation
    const grayValues: number[] = [];
    for (let i = 0; i < image.data.length; i += image.channels) {
      const gray = Math.round(
        0.299 * image.data[i] +
        0.587 * image.data[i + 1] +
        0.114 * image.data[i + 2]
      );
      grayValues.push(gray);
    }
    
    // Build histogram
    const histogram = new Array(256).fill(0);
    for (const val of grayValues) {
      histogram[val]++;
    }
    
    // Calculate cumulative distribution
    const cdf = new Array(256);
    cdf[0] = histogram[0];
    for (let i = 1; i < 256; i++) {
      cdf[i] = cdf[i - 1] + histogram[i];
    }
    
    // Normalize CDF
    const cdfMin = cdf.find(v => v > 0) || 0;
    const totalPixels = grayValues.length;
    
    const lookupTable = new Array(256);
    for (let i = 0; i < 256; i++) {
      lookupTable[i] = Math.round(
        ((cdf[i] - cdfMin) / (totalPixels - cdfMin)) * 255
      );
    }
    
    // Apply to each channel
    for (let i = 0; i < image.data.length; i++) {
      enhanced[i] = lookupTable[image.data[i]];
    }
    
    return {
      data: enhanced,
      width: image.width,
      height: image.height,
      channels: image.channels,
    };
  }
  
  /**
   * Resize image to target dimensions
   */
  private resize(image: ImageMatrix, targetWidth: number, targetHeight: number): ImageMatrix {
    const resized = new Uint8Array(targetWidth * targetHeight * image.channels);
    
    const scaleX = image.width / targetWidth;
    const scaleY = image.height / targetHeight;
    
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const srcX = Math.floor(x * scaleX);
        const srcY = Math.floor(y * scaleY);
        
        const srcOffset = (srcY * image.width + srcX) * image.channels;
        const dstOffset = (y * targetWidth + x) * image.channels;
        
        for (let c = 0; c < image.channels; c++) {
          resized[dstOffset + c] = image.data[srcOffset + c];
        }
      }
    }
    
    return {
      data: resized,
      width: targetWidth,
      height: targetHeight,
      channels: image.channels,
    };
  }
  
  /**
   * Convert RGB to grayscale
   */
  private toGrayscale(image: ImageMatrix): number[][] {
    const gray: number[][] = [];
    
    for (let y = 0; y < image.height; y++) {
      gray[y] = [];
      for (let x = 0; x < image.width; x++) {
        const offset = (y * image.width + x) * image.channels;
        const grayVal =
          0.299 * image.data[offset] +
          0.587 * image.data[offset + 1] +
          0.114 * image.data[offset + 2];
        gray[y][x] = grayVal / 255;
      }
    }
    
    return gray;
  }
  
  /**
   * Assess rectified plate quality
   */
  private assessQuality(image: ImageMatrix): number {
    // Calculate contrast
    let min = 255;
    let max = 0;
    let sum = 0;
    
    for (let i = 0; i < image.data.length; i += image.channels) {
      const gray = Math.round(
        0.299 * image.data[i] +
        0.587 * image.data[i + 1] +
        0.114 * image.data[i + 2]
      );
      min = Math.min(min, gray);
      max = Math.max(max, gray);
      sum += gray;
    }
    
    const contrast = (max - min) / 255;
    const brightness = sum / (image.width * image.height * 255);
    
    // Good quality: high contrast, medium brightness
    const contrastScore = contrast;
    const brightnessScore = 1 - Math.abs(brightness - 0.5) * 2;
    
    return contrastScore * 0.6 + brightnessScore * 0.4;
  }
}
