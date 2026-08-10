/**
 * Face Alignment Service
 * Aligns detected faces to canonical geometry for consistent embeddings
 */

import type { FaceDetection, FaceLandmarks, AlignedFace, Point } from './face.types.js';
import sharp from 'sharp';

export interface FaceAlignmentConfig {
  outputSize: number;
  landmarks5Points: boolean;
  paddingRatio: number;
}

/**
 * Canonical landmark positions for 112x112 ArcFace alignment
 * These are the standard positions used in ArcFace training
 */
const ARCFACE_DST_LANDMARKS_112 = [
  [38.2946, 51.6963], // Left eye
  [73.5318, 51.5014], // Right eye
  [56.0252, 71.7366], // Nose
  [41.5493, 92.3655], // Left mouth
  [70.7299, 92.2041], // Right mouth
];

export class FaceAlignmentService {
  private config: FaceAlignmentConfig;

  constructor(config?: Partial<FaceAlignmentConfig>) {
    this.config = {
      outputSize: 112,
      landmarks5Points: true,
      paddingRatio: 0.0,
      ...config,
    };
  }

  /**
   * Align face to canonical geometry
   */
  async align(
    imageData: Buffer,
    detection: FaceDetection,
    frameWidth: number,
    frameHeight: number,
  ): Promise<Float32Array> {
    // Scale landmarks to pixel coordinates
    const srcLandmarks = this.landmarksToPixels(
      detection.landmarks,
      frameWidth,
      frameHeight,
    );

    // Get destination landmarks (canonical positions)
    const dstLandmarks = this.getCanonicalLandmarks();

    // Estimate similarity transform
    const transform = this.estimateSimilarityTransform(
      srcLandmarks,
      dstLandmarks,
    );

    // Apply transform to align face
    const alignedImage = await this.applyTransform(
      imageData,
      transform,
      frameWidth,
      frameHeight,
    );

    // Convert to normalized float32 array for model input
    return this.preprocessForModel(alignedImage);
  }

  /**
   * Convert normalized landmarks to pixel coordinates
   */
  private landmarksToPixels(
    landmarks: FaceLandmarks,
    width: number,
    height: number,
  ): number[][] {
    return [
      [landmarks.leftEye.x * width, landmarks.leftEye.y * height],
      [landmarks.rightEye.x * width, landmarks.rightEye.y * height],
      [landmarks.nose.x * width, landmarks.nose.y * height],
      [landmarks.leftMouth.x * width, landmarks.leftMouth.y * height],
      [landmarks.rightMouth.x * width, landmarks.rightMouth.y * height],
    ];
  }

  /**
   * Get canonical landmark positions
   */
  private getCanonicalLandmarks(): number[][] {
    const size = this.config.outputSize;
    if (size === 112) {
      return ARCFACE_DST_LANDMARKS_112;
    }

    // Scale to different output size
    const scale = size / 112;
    return ARCFACE_DST_LANDMARKS_112.map(([x, y]) => [x * scale, y * scale]);
  }

  /**
   * Estimate similarity transform from source to destination landmarks
   * Uses least squares to find optimal scale, rotation, and translation
   */
  private estimateSimilarityTransform(
    src: number[][],
    dst: number[][],
  ): {
    scale: number;
    rotation: number;
    tx: number;
    ty: number;
    matrix: number[][];
  } {
    // Calculate centroids
    const srcCentroid = this.calculateCentroid(src);
    const dstCentroid = this.calculateCentroid(dst);

    // Center the points
    const srcCentered = src.map(([x, y]) => [
      x - srcCentroid[0],
      y - srcCentroid[1],
    ]);
    const dstCentered = dst.map(([x, y]) => [
      x - dstCentroid[0],
      y - dstCentroid[1],
    ]);

    // Calculate scale
    const srcNorm = Math.sqrt(
      srcCentered.reduce((sum, [x, y]) => sum + x * x + y * y, 0),
    );
    const dstNorm = Math.sqrt(
      dstCentered.reduce((sum, [x, y]) => sum + x * x + y * y, 0),
    );
    const scale = dstNorm / srcNorm;

    // Calculate rotation
    let num = 0;
    let den = 0;
    for (let i = 0; i < srcCentered.length; i++) {
      const [sx, sy] = srcCentered[i];
      const [dx, dy] = dstCentered[i];
      num += sx * dy - sy * dx;
      den += sx * dx + sy * dy;
    }
    const rotation = Math.atan2(num, den);

    // Calculate translation
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const tx = dstCentroid[0] - scale * (cos * srcCentroid[0] - sin * srcCentroid[1]);
    const ty = dstCentroid[1] - scale * (sin * srcCentroid[0] + cos * srcCentroid[1]);

    // Build transformation matrix [a, b, tx; -b, a, ty]
    const a = scale * cos;
    const b = scale * sin;
    const matrix = [
      [a, -b, tx],
      [b, a, ty],
      [0, 0, 1],
    ];

    return { scale, rotation, tx, ty, matrix };
  }

  /**
   * Calculate centroid of points
   */
  private calculateCentroid(points: number[][]): [number, number] {
    const n = points.length;
    const sumX = points.reduce((sum, [x]) => sum + x, 0);
    const sumY = points.reduce((sum, [, y]) => sum + y, 0);
    return [sumX / n, sumY / n];
  }

  /**
   * Apply similarity transform to image
   */
  private async applyTransform(
    imageData: Buffer,
    transform: { matrix: number[][] },
    sourceWidth: number,
    sourceHeight: number,
  ): Promise<Buffer> {
    const outputSize = this.config.outputSize;

    // Use sharp for efficient image transformation
    // Note: Sharp's affine transform uses a different convention
    // We need to convert our matrix to Sharp's format
    const [a, b, tx] = transform.matrix[0];
    const [c, d, ty] = transform.matrix[1];

    try {
      const aligned = await sharp(imageData)
        .resize(sourceWidth, sourceHeight, { fit: 'fill' })
        .affine(
          [a, b, c, d],
          {
            background: { r: 0, g: 0, b: 0, alpha: 1 },
            interpolator: sharp.interpolators.bicubic,
          },
        )
        .extract({
          left: Math.max(0, Math.floor(tx)),
          top: Math.max(0, Math.floor(ty)),
          width: outputSize,
          height: outputSize,
        })
        .resize(outputSize, outputSize, { fit: 'fill' })
        .raw()
        .toBuffer();

      return aligned;
    } catch (error) {
      console.error('Face alignment transform failed:', error);
      
      // Fallback: simple crop and resize
      const bbox = this.estimateCropFromLandmarks(transform, sourceWidth, sourceHeight);
      return this.simpleCropAndResize(imageData, bbox, sourceWidth, sourceHeight);
    }
  }

  /**
   * Fallback: simple crop and resize without full affine transform
   */
  private async simpleCropAndResize(
    imageData: Buffer,
    bbox: { left: number; top: number; width: number; height: number },
    sourceWidth: number,
    sourceHeight: number,
  ): Promise<Buffer> {
    const outputSize = this.config.outputSize;

    return sharp(imageData)
      .resize(sourceWidth, sourceHeight, { fit: 'fill' })
      .extract({
        left: Math.max(0, Math.floor(bbox.left)),
        top: Math.max(0, Math.floor(bbox.top)),
        width: Math.min(sourceWidth - bbox.left, Math.floor(bbox.width)),
        height: Math.min(sourceHeight - bbox.top, Math.floor(bbox.height)),
      })
      .resize(outputSize, outputSize, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
      })
      .raw()
      .toBuffer();
  }

  /**
   * Estimate crop region from transform
   */
  private estimateCropFromLandmarks(
    transform: { matrix: number[][] },
    width: number,
    height: number,
  ): { left: number; top: number; width: number; height: number } {
    // Use transform to estimate where the aligned face should be cropped from
    // This is a simplified fallback
    return {
      left: Math.max(0, transform.matrix[0][2]),
      top: Math.max(0, transform.matrix[1][2]),
      width: this.config.outputSize,
      height: this.config.outputSize,
    };
  }

  /**
   * Preprocess aligned image for model input
   * Converts RGB to normalized float32 array
   */
  private preprocessForModel(imageBuffer: Buffer): Float32Array {
    const size = this.config.outputSize;
    const pixels = size * size;
    const tensor = new Float32Array(pixels * 3);

    // Convert RGB interleaved to CHW (channel-first) format
    // Normalize to [-1, 1] range (standard for ArcFace)
    for (let i = 0; i < pixels; i++) {
      const r = imageBuffer[i * 3] / 255.0;
      const g = imageBuffer[i * 3 + 1] / 255.0;
      const b = imageBuffer[i * 3 + 2] / 255.0;

      // Normalize to [-1, 1] and arrange as CHW
      tensor[i] = (r - 0.5) / 0.5; // R channel
      tensor[pixels + i] = (g - 0.5) / 0.5; // G channel
      tensor[pixels * 2 + i] = (b - 0.5) / 0.5; // B channel
    }

    return tensor;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FaceAlignmentConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FaceAlignmentConfig {
    return { ...this.config };
  }
}
