/**
 * Analog Video Quality Detector
 * 
 * Detects various video quality issues specific to analog cameras:
 * - Snow/static noise
 * - Rolling lines (vertical/horizontal)
 * - Signal loss/weak signal
 * - Ghosting/double images
 * - Color distortion
 * - Blur/defocus
 * - Dirty lens
 * - Water drops
 * - Cobwebs
 * - Interlacing artifacts
 * - Jitter/sync issues
 */

import { BaseDetector } from './base-detector';
import { DetectionResult } from '../types';
import Jimp from 'jimp';

export interface VideoQualityIssue {
  type: 'snow' | 'rolling_lines' | 'signal_loss' | 'ghosting' | 'color_distortion' |
        'blur' | 'defocus' | 'dirty_lens' | 'water_drops' | 'cobwebs' |
        'interlacing' | 'jitter' | 'weak_signal' | 'frozen';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  description: string;
  recommendation: string;
}

export interface VideoQualityAnalysis {
  overall_score: number; // 0-100, 100 = perfect quality
  issues: VideoQualityIssue[];
  degradation_trend?: 'improving' | 'stable' | 'degrading';
  camera_health_impact: 'none' | 'low' | 'medium' | 'high' | 'critical';
  action_required: boolean;
  timestamp: string;
}

export class AnalogVideoQualityDetector extends BaseDetector {
  private historyBuffer: Map<string, number[]> = new Map(); // Track quality scores over time
  private readonly HISTORY_SIZE = 100; // Keep last 100 measurements

  constructor() {
    super('analog_video_quality', {
      enabled: true,
      sensitivity: 0.7,
      minConfidence: 0.6
    });
  }

  async detect(frame: Buffer, metadata?: any): Promise<DetectionResult> {
    try {
      const image = await Jimp.read(frame);
      const cameraId = metadata?.cameraId || 'unknown';
      
      const analysis: VideoQualityAnalysis = {
        overall_score: 100,
        issues: [],
        camera_health_impact: 'none',
        action_required: false,
        timestamp: new Date().toISOString()
      };

      // Run all quality checks
      await this.detectSnow(image, analysis);
      await this.detectRollingLines(image, analysis);
      await this.detectSignalLoss(image, analysis);
      await this.detectGhosting(image, analysis);
      await this.detectColorDistortion(image, analysis);
      await this.detectBlur(image, analysis);
      await this.detectDirtyLens(image, analysis);
      await this.detectWaterDrops(image, analysis);
      await this.detectCobwebs(image, analysis);
      await this.detectInterlacing(image, analysis);
      await this.detectFrozenFrame(image, analysis, cameraId);

      // Calculate overall score based on issues
      analysis.overall_score = this.calculateOverallScore(analysis.issues);
      
      // Update history and detect trends
      this.updateHistory(cameraId, analysis.overall_score);
      analysis.degradation_trend = this.analyzeTrend(cameraId);

      // Determine camera health impact
      analysis.camera_health_impact = this.assessHealthImpact(analysis.issues);
      analysis.action_required = analysis.camera_health_impact === 'high' || 
                                  analysis.camera_health_impact === 'critical';

      return {
        detected: analysis.issues.length > 0,
        confidence: this.calculateAverageConfidence(analysis.issues),
        objects: analysis.issues.map(issue => ({
          class: issue.type,
          confidence: issue.confidence,
          bbox: { x: 0, y: 0, width: image.bitmap.width, height: image.bitmap.height }
        })),
        metadata: {
          analysis,
          processing_time_ms: 0
        }
      };

    } catch (error) {
      this.logger.error('Video quality detection failed', error);
      throw error;
    }
  }

  /**
   * Detect snow/static noise in the image
   */
  private async detectSnow(image: Jimp, analysis: VideoQualityAnalysis): Promise<void> {
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    // Sample pixels and calculate variance
    let variance = 0;
    let mean = 0;
    const sampleSize = Math.min(1000, width * height);
    
    for (let i = 0; i < sampleSize; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
      const gray = (pixel.r + pixel.g + pixel.b) / 3;
      mean += gray;
    }
    mean /= sampleSize;

    for (let i = 0; i < sampleSize; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
      const gray = (pixel.r + pixel.g + pixel.b) / 3;
      variance += Math.pow(gray - mean, 2);
    }
    variance /= sampleSize;

    // High variance with random distribution indicates snow
    if (variance > 2000) {
      const severity = variance > 5000 ? 'critical' : variance > 3500 ? 'high' : 'medium';
      const confidence = Math.min(0.95, variance / 6000);
      
      analysis.issues.push({
        type: 'snow',
        severity,
        confidence,
        description: 'Video noise/snow detected - weak analog signal',
        recommendation: 'Check cable connections, cable quality, and signal strength'
      });
    }
  }

  /**
   * Detect rolling lines (horizontal or vertical)
   */
  private async detectRollingLines(image: Jimp, analysis: VideoQualityAnalysis): Promise<void> {
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    // Check for horizontal line patterns
    const rowVariances: number[] = [];
    for (let y = 0; y < height; y += 5) {
      let rowSum = 0;
      for (let x = 0; x < width; x += 5) {
        const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
        rowSum += (pixel.r + pixel.g + pixel.b) / 3;
      }
      rowVariances.push(rowSum / (width / 5));
    }

    // Detect periodic patterns indicating rolling
    const periodicScore = this.detectPeriodicPattern(rowVariances);
    
    if (periodicScore > 0.6) {
      const severity = periodicScore > 0.85 ? 'critical' : periodicScore > 0.75 ? 'high' : 'medium';
      
      analysis.issues.push({
        type: 'rolling_lines',
        severity,
        confidence: periodicScore,
        description: 'Rolling lines detected - sync issues',
        recommendation: 'Check power supply, grounding, and video signal timing'
      });
    }
  }

  /**
   * Detect signal loss (black screen, very dark image)
   */
  private async detectSignalLoss(image: Jimp, analysis: VideoQualityAnalysis): Promise<void> {
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    let totalBrightness = 0;
    const sampleSize = Math.min(500, width * height);
    
    for (let i = 0; i < sampleSize; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
      totalBrightness += (pixel.r + pixel.g + pixel.b) / 3;
    }
    
    const avgBrightness = totalBrightness / sampleSize;
    
    if (avgBrightness < 15) {
      analysis.issues.push({
        type: 'signal_loss',
        severity: 'critical',
        confidence: 0.95,
        description: 'No video signal detected',
        recommendation: 'Check camera power, cable connection, and DVR input'
      });
    } else if (avgBrightness < 30) {
      analysis.issues.push({
        type: 'weak_signal',
        severity: 'high',
        confidence: 0.85,
        description: 'Weak video signal - very dark image',
        recommendation: 'Check cable length, signal amplification, and termination'
      });
    }
  }

  /**
   * Detect ghosting (double images)
   */
  private async detectGhosting(image: Jimp, analysis: VideoQualityAnalysis): Promise<void> {
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    // Look for edge duplications with slight offset
    let ghostingScore = 0;
    const samples = 50;
    
    for (let i = 0; i < samples; i++) {
      const x = Math.floor(Math.random() * (width - 20)) + 10;
      const y = Math.floor(Math.random() * height);
      
      const pixel1 = Jimp.intToRGBA(image.getPixelColor(x, y));
      const pixel2 = Jimp.intToRGBA(image.getPixelColor(x + 5, y));
      const pixel3 = Jimp.intToRGBA(image.getPixelColor(x + 10, y));
      
      const grad1 = Math.abs((pixel1.r + pixel1.g + pixel1.b) - (pixel2.r + pixel2.g + pixel2.b));
      const grad2 = Math.abs((pixel2.r + pixel2.g + pixel2.b) - (pixel3.r + pixel3.g + pixel3.b));
      
      if (grad1 > 50 && grad2 > 50 && Math.abs(grad1 - grad2) < 20) {
        ghostingScore++;
      }
    }
    
    const ghostingRatio = ghostingScore / samples;
    
    if (ghostingRatio > 0.3) {
      const severity = ghostingRatio > 0.6 ? 'high' : 'medium';
      
      analysis.issues.push({
        type: 'ghosting',
        severity,
        confidence: Math.min(0.9, ghostingRatio * 1.5),
        description: 'Ghosting/double image detected',
        recommendation: 'Check for signal reflections, use proper impedance, check cable termination'
      });
    }
  }

  /**
   * Detect color distortion
   */
  private async detectColorDistortion(image: Jimp, analysis: VideoQualityAnalysis): Promise<void> {
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    let redBias = 0;
    let greenBias = 0;
    let blueBias = 0;
    const sampleSize = Math.min(500, width * height);
    
    for (let i = 0; i < sampleSize; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
      
      const avg = (pixel.r + pixel.g + pixel.b) / 3;
      redBias += pixel.r - avg;
      greenBias += pixel.g - avg;
      blueBias += pixel.b - avg;
    }
    
    redBias /= sampleSize;
    greenBias /= sampleSize;
    blueBias /= sampleSize;
    
    const maxBias = Math.max(Math.abs(redBias), Math.abs(greenBias), Math.abs(blueBias));
    
    if (maxBias > 30) {
      const severity = maxBias > 60 ? 'high' : 'medium';
      const dominantColor = Math.abs(redBias) === maxBias ? 'red' :
                           Math.abs(greenBias) === maxBias ? 'green' : 'blue';
      
      analysis.issues.push({
        type: 'color_distortion',
        severity,
        confidence: Math.min(0.9, maxBias / 70),
        description: `Color distortion detected - ${dominantColor} bias`,
        recommendation: 'Check white balance, color settings, and video cable quality'
      });
    }
  }

  /**
   * Detect blur/defocus
   */
  private async detectBlur(image: Jimp, analysis: VideoQualityAnalysis): Promise<void> {
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    // Calculate edge sharpness
    let edgeStrength = 0;
    const samples = 100;
    
    for (let i = 0; i < samples; i++) {
      const x = Math.floor(Math.random() * (width - 2)) + 1;
      const y = Math.floor(Math.random() * (height - 2)) + 1;
      
      const center = Jimp.intToRGBA(image.getPixelColor(x, y));
      const right = Jimp.intToRGBA(image.getPixelColor(x + 1, y));
      const bottom = Jimp.intToRGBA(image.getPixelColor(x, y + 1));
      
      const centerGray = (center.r + center.g + center.b) / 3;
      const rightGray = (right.r + right.g + right.b) / 3;
      const bottomGray = (bottom.r + bottom.g + bottom.b) / 3;
      
      edgeStrength += Math.abs(centerGray - rightGray) + Math.abs(centerGray - bottomGray);
    }
    
    const avgEdgeStrength = edgeStrength / samples;
    
    if (avgEdgeStrength < 10) {
      analysis.issues.push({
        type: 'blur',
        severity: avgEdgeStrength < 5 ? 'high' : 'medium',
        confidence: 0.75,
        description: 'Image blur detected - out of focus',
        recommendation: 'Adjust camera focus, clean lens, check if lens is damaged'
      });
    }
  }

  /**
   * Detect dirty lens
   */
  private async detectDirtyLens(image: Jimp, analysis: VideoQualityAnalysis): Promise<void> {
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    // Look for localized dark spots or hazy areas
    let spotCount = 0;
    const gridSize = 5;
    const cellWidth = Math.floor(width / gridSize);
    const cellHeight = Math.floor(height / gridSize);
    
    const cellBrightness: number[] = [];
    
    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let brightness = 0;
        let samples = 0;
        
        for (let sy = 0; sy < 10; sy++) {
          for (let sx = 0; sx < 10; sx++) {
            const x = gx * cellWidth + Math.floor(Math.random() * cellWidth);
            const y = gy * cellHeight + Math.floor(Math.random() * cellHeight);
            
            if (x < width && y < height) {
              const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
              brightness += (pixel.r + pixel.g + pixel.b) / 3;
              samples++;
            }
          }
        }
        
        cellBrightness.push(brightness / samples);
      }
    }
    
    const avgBrightness = cellBrightness.reduce((a, b) => a + b, 0) / cellBrightness.length;
    
    // Look for cells that are significantly darker
    for (const brightness of cellBrightness) {
      if (brightness < avgBrightness * 0.7) {
        spotCount++;
      }
    }
    
    if (spotCount > 3 && spotCount < 15) { // Not too few, not all dark
      analysis.issues.push({
        type: 'dirty_lens',
        severity: spotCount > 8 ? 'medium' : 'low',
        confidence: 0.65,
        description: 'Dirty lens detected - localized dark spots',
        recommendation: 'Clean camera lens with proper cleaning solution'
      });
    }
  }

  /**
   * Detect water drops on lens
   */
  private async detectWaterDrops(image: Jimp, analysis: VideoQualityAnalysis): Promise<void> {
    // Water drops create circular bright spots with darker edges
    // This is a simplified detection - real implementation would use blob detection
    
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    let suspiciousPatterns = 0;
    const samples = 20;
    
    for (let i = 0; i < samples; i++) {
      const x = Math.floor(Math.random() * (width - 20)) + 10;
      const y = Math.floor(Math.random() * (height - 20)) + 10;
      
      const center = Jimp.intToRGBA(image.getPixelColor(x, y));
      const centerBright = (center.r + center.g + center.b) / 3;
      
      // Check surrounding pixels
      let brighterCount = 0;
      for (let dy = -5; dy <= 5; dy += 5) {
        for (let dx = -5; dx <= 5; dx += 5) {
          if (dx === 0 && dy === 0) continue;
          
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const neighbor = Jimp.intToRGBA(image.getPixelColor(nx, ny));
            const neighborBright = (neighbor.r + neighbor.g + neighbor.b) / 3;
            
            if (centerBright > neighborBright + 40) {
              brighterCount++;
            }
          }
        }
      }
      
      if (brighterCount >= 6) {
        suspiciousPatterns++;
      }
    }
    
    if (suspiciousPatterns > 3) {
      analysis.issues.push({
        type: 'water_drops',
        severity: 'medium',
        confidence: 0.6,
        description: 'Possible water drops on lens',
        recommendation: 'Clean and dry camera lens, check housing seal'
      });
    }
  }

  /**
   * Detect cobwebs
   */
  private async detectCobwebs(image: Jimp, analysis: VideoQualityAnalysis): Promise<void> {
    // Cobwebs create thin, wispy patterns usually in corners
    // This is a simplified detection
    
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    // Check corners for unusual patterns
    const corners = [
      { x: 0, y: 0 },
      { x: width - 50, y: 0 },
      { x: 0, y: height - 50 },
      { x: width - 50, y: height - 50 }
    ];
    
    let suspiciousCorners = 0;
    
    for (const corner of corners) {
      let variance = 0;
      const samples = 25;
      
      for (let i = 0; i < samples; i++) {
        const x = corner.x + Math.floor(Math.random() * 50);
        const y = corner.y + Math.floor(Math.random() * 50);
        
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
          const gray = (pixel.r + pixel.g + pixel.b) / 3;
          variance += gray;
        }
      }
      
      // Dark corners with some structure might indicate cobwebs
      if (variance / samples < 60) {
        suspiciousCorners++;
      }
    }
    
    if (suspiciousCorners >= 2) {
      analysis.issues.push({
        type: 'cobwebs',
        severity: 'low',
        confidence: 0.5,
        description: 'Possible cobwebs near camera',
        recommendation: 'Inspect and clean camera housing, check for spider webs'
      });
    }
  }

  /**
   * Detect interlacing artifacts
   */
  private async detectInterlacing(image: Jimp, analysis: VideoQualityAnalysis): Promise<void> {
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    // Check for alternating line patterns (interlacing)
    let interlaceScore = 0;
    const samples = 50;
    
    for (let i = 0; i < samples; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * (height - 4)) + 2;
      
      const line1 = Jimp.intToRGBA(image.getPixelColor(x, y - 1));
      const line2 = Jimp.intToRGBA(image.getPixelColor(x, y));
      const line3 = Jimp.intToRGBA(image.getPixelColor(x, y + 1));
      
      const bright1 = (line1.r + line1.g + line1.b) / 3;
      const bright2 = (line2.r + line2.g + line2.b) / 3;
      const bright3 = (line3.r + line3.g + line3.b) / 3;
      
      const diff12 = Math.abs(bright1 - bright2);
      const diff23 = Math.abs(bright2 - bright3);
      
      if (diff12 > 20 && diff23 > 20) {
        interlaceScore++;
      }
    }
    
    const interlaceRatio = interlaceScore / samples;
    
    if (interlaceRatio > 0.4) {
      analysis.issues.push({
        type: 'interlacing',
        severity: 'low',
        confidence: Math.min(0.8, interlaceRatio * 1.5),
        description: 'Interlacing artifacts detected',
        recommendation: 'Enable deinterlacing in DVR settings or use progressive scan'
      });
    }
  }

  /**
   * Detect frozen frame
   */
  private async detectFrozenFrame(image: Jimp, analysis: VideoQualityAnalysis, cameraId: string): Promise<void> {
    // Compare with previous frame (if available)
    // This is a placeholder - real implementation would need frame comparison
    
    // For now, just store frame hash for future comparison
    const frameHash = image.hash();
    
    // In a real implementation, we'd compare with previous frame hash
    // If identical for several frames, it's frozen
  }

  /**
   * Detect periodic patterns in data
   */
  private detectPeriodicPattern(data: number[]): number {
    if (data.length < 10) return 0;
    
    let maxCorrelation = 0;
    
    // Test different periods
    for (let period = 5; period < data.length / 3; period++) {
      let correlation = 0;
      let count = 0;
      
      for (let i = 0; i < data.length - period; i++) {
        const diff = Math.abs(data[i] - data[i + period]);
        correlation += 1 / (1 + diff / 50);
        count++;
      }
      
      correlation /= count;
      maxCorrelation = Math.max(maxCorrelation, correlation);
    }
    
    return maxCorrelation;
  }

  /**
   * Calculate overall quality score
   */
  private calculateOverallScore(issues: VideoQualityIssue[]): number {
    let score = 100;
    
    for (const issue of issues) {
      let deduction = 0;
      
      switch (issue.severity) {
        case 'critical':
          deduction = 40;
          break;
        case 'high':
          deduction = 25;
          break;
        case 'medium':
          deduction = 15;
          break;
        case 'low':
          deduction = 5;
          break;
      }
      
      score -= deduction * issue.confidence;
    }
    
    return Math.max(0, Math.round(score));
  }

  /**
   * Calculate average confidence
   */
  private calculateAverageConfidence(issues: VideoQualityIssue[]): number {
    if (issues.length === 0) return 1.0;
    
    const sum = issues.reduce((acc, issue) => acc + issue.confidence, 0);
    return sum / issues.length;
  }

  /**
   * Update quality history
   */
  private updateHistory(cameraId: string, score: number): void {
    if (!this.historyBuffer.has(cameraId)) {
      this.historyBuffer.set(cameraId, []);
    }
    
    const history = this.historyBuffer.get(cameraId)!;
    history.push(score);
    
    if (history.length > this.HISTORY_SIZE) {
      history.shift();
    }
  }

  /**
   * Analyze quality trend
   */
  private analyzeTrend(cameraId: string): 'improving' | 'stable' | 'degrading' {
    const history = this.historyBuffer.get(cameraId);
    
    if (!history || history.length < 10) {
      return 'stable';
    }
    
    const recentAvg = history.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const olderAvg = history.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    
    const diff = recentAvg - olderAvg;
    
    if (diff > 5) return 'improving';
    if (diff < -5) return 'degrading';
    return 'stable';
  }

  /**
   * Assess camera health impact
   */
  private assessHealthImpact(issues: VideoQualityIssue[]): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    if (issues.length === 0) return 'none';
    
    const hasCritical = issues.some(i => i.severity === 'critical');
    const hasHigh = issues.some(i => i.severity === 'high');
    const mediumCount = issues.filter(i => i.severity === 'medium').length;
    
    if (hasCritical) return 'critical';
    if (hasHigh || mediumCount >= 3) return 'high';
    if (mediumCount >= 2) return 'medium';
    return 'low';
  }
}
