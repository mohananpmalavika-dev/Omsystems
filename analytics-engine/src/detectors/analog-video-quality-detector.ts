/**
 * Analog Video Quality Detector
 * Detects analog camera video artifacts and quality issues
 * 
 * Detects:
 * - Snow/Noise
 * - Rolling lines
 * - Signal loss
 * - Ghosting
 * - Color distortion
 * - Weak signal
 * - Blur/Defocus
 * - Dirty lens
 * - Water drops
 * - Cobwebs
 * - Interlacing artifacts
 */

import { BaseDetector, type DetectionFrame, type DetectionResult } from "./base-detector.js";

export interface VideoQualityMetrics {
  brightness: number;
  contrast: number;
  sharpness: number;
  noise: number;
  colorSaturation: number;
  blockiness: number;
  interlacing: number;
}

export interface QualityIssue {
  type: 'snow' | 'rolling-lines' | 'signal-loss' | 'ghosting' | 'color-distortion' | 
        'weak-signal' | 'blur' | 'defocus' | 'dirty-lens' | 'water-drops' | 
        'cobweb' | 'interlacing' | 'frozen' | 'blank';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  affectedArea?: number; // Percentage of frame
  description: string;
}

interface CameraQualityHistory {
  cameraId: string;
  metricsHistory: Array<{ timestamp: Date; metrics: VideoQualityMetrics }>;
  issuesHistory: Array<{ timestamp: Date; issues: QualityIssue[] }>;
  consecutiveIssueFrames: number;
  qualityScore: number; // 0-100
  degradationTrend: 'improving' | 'stable' | 'degrading' | 'critical';
  lastFrameHash?: string;
  frozenFrameCount: number;
}

export class AnalogVideoQualityDetector extends BaseDetector {
  private cameraHistory = new Map<string, CameraQualityHistory>();
  
  // Configuration thresholds
  private readonly NOISE_THRESHOLD_LOW = 15;
  private readonly NOISE_THRESHOLD_HIGH = 30;
  private readonly SHARPNESS_THRESHOLD_LOW = 20;
  private readonly CONTRAST_THRESHOLD_LOW = 15;
  private readonly HISTORY_SIZE = 50;
  private readonly FROZEN_FRAME_THRESHOLD = 5;
  private readonly CONSECUTIVE_ISSUE_THRESHOLD = 3;

  constructor() {
    super("analog-video-quality", "1.0.0");
  }

  async initialize(): Promise<void> {
    console.log("Initializing analog video quality detector...");
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    
    // Get or create camera history
    let history = this.cameraHistory.get(frame.cameraId);
    if (!history) {
      history = {
        cameraId: frame.cameraId,
        metricsHistory: [],
        issuesHistory: [],
        consecutiveIssueFrames: 0,
        qualityScore: 100,
        degradationTrend: 'stable',
        frozenFrameCount: 0,
      };
      this.cameraHistory.set(frame.cameraId, history);
    }

    // Calculate video quality metrics
    const metrics = this.calculateQualityMetrics(frame.imageData, frame.width, frame.height);
    
    // Store metrics in history
    history.metricsHistory.push({
      timestamp: frame.timestamp,
      metrics,
    });
    if (history.metricsHistory.length > this.HISTORY_SIZE) {
      history.metricsHistory.shift();
    }

    // Detect quality issues
    const issues = this.detectQualityIssues(frame, metrics, history);
    
    // Store issues in history
    history.issuesHistory.push({
      timestamp: frame.timestamp,
      issues,
    });
    if (history.issuesHistory.length > this.HISTORY_SIZE) {
      history.issuesHistory.shift();
    }

    // Update consecutive issue counter
    if (issues.length > 0) {
      history.consecutiveIssueFrames++;
    } else {
      history.consecutiveIssueFrames = 0;
    }

    // Calculate overall quality score
    history.qualityScore = this.calculateQualityScore(metrics, issues);
    
    // Determine degradation trend
    history.degradationTrend = this.calculateDegradationTrend(history);

    // Generate detection results for significant issues
    if (issues.length > 0 && history.consecutiveIssueFrames >= this.CONSECUTIVE_ISSUE_THRESHOLD) {
      const criticalIssues = issues.filter(i => i.severity === 'critical' || i.severity === 'high');
      
      if (criticalIssues.length > 0) {
        results.push({
          detectionType: "analog-video-quality-issue",
          confidence: this.calculateAverageConfidence(criticalIssues),
          objects: [],
          metadata: {
            issues: issues.map(i => ({
              type: i.type,
              severity: i.severity,
              description: i.description,
              affectedArea: i.affectedArea,
            })),
            metrics,
            qualityScore: history.qualityScore,
            degradationTrend: history.degradationTrend,
            consecutiveFrames: history.consecutiveIssueFrames,
          },
          requiresAlert: criticalIssues.some(i => i.severity === 'critical'),
        });
      }
    }

    // Check for frozen frame
    const currentHash = this.calculateFrameHash(frame.imageData);
    if (history.lastFrameHash === currentHash) {
      history.frozenFrameCount++;
      
      if (history.frozenFrameCount >= this.FROZEN_FRAME_THRESHOLD) {
        results.push({
          detectionType: "frozen-video-feed",
          confidence: 0.95,
          objects: [],
          metadata: {
            frozenFrames: history.frozenFrameCount,
            description: "Video feed appears to be frozen",
          },
          requiresAlert: true,
        });
      }
    } else {
      history.frozenFrameCount = 0;
    }
    history.lastFrameHash = currentHash;

    return results;
  }

  /**
   * Calculate video quality metrics
   */
  private calculateQualityMetrics(
    imageData: Buffer,
    width: number,
    height: number
  ): VideoQualityMetrics {
    const pixelCount = width * height;
    
    // Calculate brightness
    let totalBrightness = 0;
    let totalSaturation = 0;
    const brightnesses: number[] = [];
    
    for (let i = 0; i < imageData.length; i += 3) {
      const r = imageData[i] ?? 0;
      const g = imageData[i + 1] ?? 0;
      const b = imageData[i + 2] ?? 0;
      
      // Perceived brightness
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      totalBrightness += brightness;
      brightnesses.push(brightness);
      
      // Color saturation
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      totalSaturation += saturation;
    }
    
    const avgBrightness = totalBrightness / pixelCount;
    const avgSaturation = totalSaturation / pixelCount;
    
    // Calculate contrast (standard deviation of brightness)
    let varianceSum = 0;
    for (const brightness of brightnesses) {
      varianceSum += Math.pow(brightness - avgBrightness, 2);
    }
    const contrast = Math.sqrt(varianceSum / pixelCount);
    
    // Calculate noise (high-frequency variation)
    const noise = this.calculateNoise(imageData, width, height);
    
    // Calculate sharpness (edge detection strength)
    const sharpness = this.calculateSharpness(imageData, width, height);
    
    // Calculate blockiness (compression artifacts)
    const blockiness = this.calculateBlockiness(imageData, width, height);
    
    // Calculate interlacing artifacts
    const interlacing = this.calculateInterlacing(imageData, width, height);
    
    return {
      brightness: avgBrightness,
      contrast,
      sharpness,
      noise,
      colorSaturation: avgSaturation * 100,
      blockiness,
      interlacing,
    };
  }

  /**
   * Calculate noise level
   */
  private calculateNoise(imageData: Buffer, width: number, height: number): number {
    let noiseSum = 0;
    let count = 0;
    
    // Sample every 10th pixel for performance
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x += 10) {
        const idx = (y * width + x) * 3;
        const centerR = imageData[idx] ?? 0;
        
        // Compare with neighbors
        const leftIdx = (y * width + (x - 1)) * 3;
        const rightIdx = (y * width + (x + 1)) * 3;
        const topIdx = ((y - 1) * width + x) * 3;
        const bottomIdx = ((y + 1) * width + x) * 3;
        
        const leftR = imageData[leftIdx] ?? 0;
        const rightR = imageData[rightIdx] ?? 0;
        const topR = imageData[topIdx] ?? 0;
        const bottomR = imageData[bottomIdx] ?? 0;
        
        const avgNeighbor = (leftR + rightR + topR + bottomR) / 4;
        const diff = Math.abs(centerR - avgNeighbor);
        
        noiseSum += diff;
        count++;
      }
    }
    
    return count > 0 ? noiseSum / count : 0;
  }

  /**
   * Calculate sharpness (edge strength)
   */
  private calculateSharpness(imageData: Buffer, width: number, height: number): number {
    let edgeSum = 0;
    let count = 0;
    
    // Sobel operator for edge detection
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x += 10) {
        const idx = (y * width + x) * 3;
        
        // Get 3x3 neighborhood
        const pixels: number[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = ((y + dy) * width + (x + dx)) * 3;
            pixels.push(imageData[nIdx] ?? 0);
          }
        }
        
        // Sobel X and Y
        const gx = -pixels[0]! + pixels[2]! - 2 * pixels[3]! + 2 * pixels[5]! - pixels[6]! + pixels[8]!;
        const gy = -pixels[0]! - 2 * pixels[1]! - pixels[2]! + pixels[6]! + 2 * pixels[7]! + pixels[8]!;
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edgeSum += magnitude;
        count++;
      }
    }
    
    return count > 0 ? edgeSum / count : 0;
  }

  /**
   * Calculate blockiness (compression artifacts)
   */
  private calculateBlockiness(imageData: Buffer, width: number, height: number): number {
    let blockiness = 0;
    let count = 0;
    
    // Check for 8x8 block boundaries (common in analog and digital compression)
    for (let y = 8; y < height; y += 8) {
      for (let x = 0; x < width; x += 10) {
        const topIdx = ((y - 1) * width + x) * 3;
        const bottomIdx = (y * width + x) * 3;
        
        const topR = imageData[topIdx] ?? 0;
        const bottomR = imageData[bottomIdx] ?? 0;
        
        blockiness += Math.abs(topR - bottomR);
        count++;
      }
    }
    
    return count > 0 ? blockiness / count : 0;
  }

  /**
   * Calculate interlacing artifacts
   */
  private calculateInterlacing(imageData: Buffer, width: number, height: number): number {
    let interlacing = 0;
    let count = 0;
    
    // Check alternating line differences (interlacing pattern)
    for (let y = 2; y < height - 2; y += 2) {
      for (let x = 0; x < width; x += 10) {
        const evenIdx = (y * width + x) * 3;
        const oddIdx = ((y + 1) * width + x) * 3;
        const nextEvenIdx = ((y + 2) * width + x) * 3;
        
        const evenR = imageData[evenIdx] ?? 0;
        const oddR = imageData[oddIdx] ?? 0;
        const nextEvenR = imageData[nextEvenIdx] ?? 0;
        
        // Interlacing shows high difference between odd/even lines
        const evenDiff = Math.abs(evenR - nextEvenR);
        const oddDiff = Math.abs(oddR - evenR);
        
        if (oddDiff > evenDiff * 2) {
          interlacing += oddDiff - evenDiff;
          count++;
        }
      }
    }
    
    return count > 0 ? interlacing / count : 0;
  }

  /**
   * Detect specific quality issues
   */
  private detectQualityIssues(
    frame: DetectionFrame,
    metrics: VideoQualityMetrics,
    history: CameraQualityHistory
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Snow/Noise detection
    if (metrics.noise > this.NOISE_THRESHOLD_HIGH) {
      issues.push({
        type: 'snow',
        severity: metrics.noise > 40 ? 'critical' : 'high',
        confidence: 0.85,
        description: 'High noise/snow detected in video signal',
      });
    } else if (metrics.noise > this.NOISE_THRESHOLD_LOW) {
      issues.push({
        type: 'weak-signal',
        severity: 'medium',
        confidence: 0.75,
        description: 'Weak analog signal with visible noise',
      });
    }

    // Blur/Defocus detection
    if (metrics.sharpness < this.SHARPNESS_THRESHOLD_LOW) {
      const isBlur = metrics.noise < this.NOISE_THRESHOLD_LOW;
      issues.push({
        type: isBlur ? 'blur' : 'defocus',
        severity: metrics.sharpness < 10 ? 'high' : 'medium',
        confidence: 0.80,
        description: isBlur ? 'Image appears blurred' : 'Camera appears defocused',
      });
    }

    // Low contrast (dirty lens, fog, spray)
    if (metrics.contrast < this.CONTRAST_THRESHOLD_LOW) {
      issues.push({
        type: 'dirty-lens',
        severity: metrics.contrast < 5 ? 'high' : 'medium',
        confidence: 0.70,
        description: 'Low contrast - possible dirty lens or obstruction',
      });
    }

    // Color distortion
    if (metrics.colorSaturation < 10) {
      issues.push({
        type: 'color-distortion',
        severity: 'medium',
        confidence: 0.75,
        description: 'Color saturation loss - possible cable or camera issue',
      });
    }

    // Interlacing artifacts
    if (metrics.interlacing > 8) {
      issues.push({
        type: 'interlacing',
        severity: 'low',
        confidence: 0.65,
        description: 'Interlacing artifacts detected',
      });
    }

    // Blockiness (compression or signal issues)
    if (metrics.blockiness > 15) {
      issues.push({
        type: 'signal-loss',
        severity: metrics.blockiness > 25 ? 'high' : 'medium',
        confidence: 0.80,
        description: 'Block artifacts - possible signal degradation',
      });
    }

    // Rolling lines detection (analyze history)
    if (history.metricsHistory.length >= 5) {
      const rollingLines = this.detectRollingLines(history.metricsHistory);
      if (rollingLines) {
        issues.push({
          type: 'rolling-lines',
          severity: 'high',
          confidence: 0.90,
          description: 'Rolling lines detected - power or sync issue',
        });
      }
    }

    // Ghosting detection (double images)
    const ghosting = this.detectGhosting(frame.imageData, frame.width, frame.height);
    if (ghosting > 0.7) {
      issues.push({
        type: 'ghosting',
        severity: 'medium',
        confidence: ghosting,
        description: 'Ghosting/double image detected - cable reflection issue',
      });
    }

    return issues;
  }

  /**
   * Detect rolling lines pattern
   */
  private detectRollingLines(
    metricsHistory: Array<{ timestamp: Date; metrics: VideoQualityMetrics }>
  ): boolean {
    // Check for periodic brightness fluctuations
    const recentMetrics = metricsHistory.slice(-10);
    const brightnesses = recentMetrics.map(m => m.metrics.brightness);
    
    if (brightnesses.length < 5) return false;
    
    let fluctuations = 0;
    for (let i = 1; i < brightnesses.length; i++) {
      const diff = Math.abs(brightnesses[i]! - brightnesses[i - 1]!);
      if (diff > 20) fluctuations++;
    }
    
    return fluctuations >= 3;
  }

  /**
   * Detect ghosting (double images from cable reflections)
   */
  private detectGhosting(imageData: Buffer, width: number, height: number): number {
    let ghostingScore = 0;
    let sampleCount = 0;
    
    // Sample horizontal edges for duplicate patterns
    for (let y = height / 4; y < (3 * height) / 4; y += 10) {
      for (let x = 10; x < width - 20; x += 20) {
        const idx = (y * width + x) * 3;
        const rightIdx = (y * width + (x + 10)) * 3;
        
        const currentR = imageData[idx] ?? 0;
        const rightR = imageData[rightIdx] ?? 0;
        
        const edge = Math.abs(currentR - rightR);
        
        // Check for similar edge pattern offset by several pixels (ghosting)
        if (edge > 30) {
          for (let offset = 5; offset < 15; offset++) {
            const offsetIdx = (y * width + (x + offset)) * 3;
            const offsetR = imageData[offsetIdx] ?? 0;
            const offsetEdge = Math.abs(offsetR - (imageData[offsetIdx + 3 * 3] ?? 0));
            
            if (Math.abs(edge - offsetEdge) < 10) {
              ghostingScore += 1;
            }
          }
        }
        sampleCount++;
      }
    }
    
    return sampleCount > 0 ? Math.min(1.0, ghostingScore / (sampleCount * 0.1)) : 0;
  }

  /**
   * Calculate overall quality score (0-100)
   */
  private calculateQualityScore(
    metrics: VideoQualityMetrics,
    issues: QualityIssue[]
  ): number {
    let score = 100;
    
    // Deduct points for issues
    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical':
          score -= 30;
          break;
        case 'high':
          score -= 20;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    }
    
    // Deduct points for poor metrics
    if (metrics.noise > this.NOISE_THRESHOLD_LOW) {
      score -= (metrics.noise - this.NOISE_THRESHOLD_LOW) * 0.5;
    }
    
    if (metrics.sharpness < this.SHARPNESS_THRESHOLD_LOW) {
      score -= (this.SHARPNESS_THRESHOLD_LOW - metrics.sharpness) * 0.3;
    }
    
    if (metrics.contrast < this.CONTRAST_THRESHOLD_LOW) {
      score -= (this.CONTRAST_THRESHOLD_LOW - metrics.contrast) * 0.5;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate degradation trend
   */
  private calculateDegradationTrend(
    history: CameraQualityHistory
  ): 'improving' | 'stable' | 'degrading' | 'critical' {
    if (history.metricsHistory.length < 10) return 'stable';
    
    const recent = history.metricsHistory.slice(-5);
    const older = history.metricsHistory.slice(-10, -5);
    
    const recentAvgNoise = recent.reduce((sum, m) => sum + m.metrics.noise, 0) / recent.length;
    const olderAvgNoise = older.reduce((sum, m) => sum + m.metrics.noise, 0) / older.length;
    
    const recentAvgSharpness = recent.reduce((sum, m) => sum + m.metrics.sharpness, 0) / recent.length;
    const olderAvgSharpness = older.reduce((sum, m) => sum + m.metrics.sharpness, 0) / older.length;
    
    const noiseTrend = recentAvgNoise - olderAvgNoise;
    const sharpnessTrend = recentAvgSharpness - olderAvgSharpness;
    
    // Critical if recent quality score is very low
    if (history.qualityScore < 30) return 'critical';
    
    // Degrading if noise increasing or sharpness decreasing significantly
    if (noiseTrend > 5 || sharpnessTrend < -5) return 'degrading';
    
    // Improving if noise decreasing and sharpness increasing
    if (noiseTrend < -3 && sharpnessTrend > 3) return 'improving';
    
    return 'stable';
  }

  /**
   * Calculate frame hash for frozen detection
   */
  private calculateFrameHash(imageData: Buffer): string {
    // Sample hash - take every 1000th byte
    const samples: number[] = [];
    for (let i = 0; i < imageData.length; i += 1000) {
      samples.push(imageData[i] ?? 0);
    }
    return samples.join(',');
  }

  /**
   * Calculate average confidence
   */
  private calculateAverageConfidence(issues: QualityIssue[]): number {
    if (issues.length === 0) return 0;
    return issues.reduce((sum, i) => sum + i.confidence, 0) / issues.length;
  }

  /**
   * Get camera quality status
   */
  getCameraQualityStatus(cameraId: string) {
    const history = this.cameraHistory.get(cameraId);
    if (!history) return null;
    
    const recentMetrics = history.metricsHistory.slice(-1)[0];
    const recentIssues = history.issuesHistory.slice(-1)[0];
    
    return {
      cameraId,
      qualityScore: history.qualityScore,
      degradationTrend: history.degradationTrend,
      currentMetrics: recentMetrics?.metrics,
      currentIssues: recentIssues?.issues,
      consecutiveIssueFrames: history.consecutiveIssueFrames,
      frozenFrameCount: history.frozenFrameCount,
    };
  }

  /**
   * Get all cameras with quality issues
   */
  getCamerasWithIssues(): Array<{ cameraId: string; qualityScore: number; issues: QualityIssue[] }> {
    const camerasWithIssues: Array<{ cameraId: string; qualityScore: number; issues: QualityIssue[] }> = [];
    
    for (const [cameraId, history] of this.cameraHistory.entries()) {
      const recentIssues = history.issuesHistory.slice(-1)[0];
      if (recentIssues && recentIssues.issues.length > 0) {
        camerasWithIssues.push({
          cameraId,
          qualityScore: history.qualityScore,
          issues: recentIssues.issues,
        });
      }
    }
    
    return camerasWithIssues.sort((a, b) => a.qualityScore - b.qualityScore);
  }

  async cleanup(): Promise<void> {
    this.cameraHistory.clear();
    console.log("Analog video quality detector cleaned up");
  }

  getHealth() {
    return {
      status: "healthy" as const,
      details: `Monitoring ${this.cameraHistory.size} analog cameras for quality issues`,
    };
  }
}
