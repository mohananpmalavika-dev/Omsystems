/**
 * Camera Type Classifier
 * Classifies cameras as Analog, HD-Analog, or IP and estimates AI performance
 * 
 * Features:
 * - Automatic camera type detection
 * - Resolution estimation
 * - AI accuracy prediction
 * - Upgrade ROI calculation
 * - Strategic upgrade recommendations
 */

import { BaseDetector, type DetectionFrame, type DetectionResult } from "./base-detector.js";

export type CameraType = 'standard-analog' | 'hd-analog' | 'ip-camera' | 'unknown';
export type AnalogStandard = 'composite' | 'hd-tvi' | 'hd-cvi' | 'ahd' | 'sdi' | 'ip' | 'unknown';

export interface CameraClassification {
  cameraId: string;
  cameraType: CameraType;
  analogStandard: AnalogStandard;
  estimatedResolution: {
    width: number;
    height: number;
    megapixels: number;
  };
  signalType: 'analog' | 'digital';
  videoQualityScore: number; // 0-100
  aiAccuracyEstimate: number; // 0-100
  features: {
    nightVision: boolean;
    wdr: boolean;
    colorMode: 'color' | 'bw' | 'day-night';
    ptz: boolean;
  };
  connectionType?: 'rtsp' | 'onvif' | 'http' | 'dvr-channel';
}

export interface UpgradeRecommendation {
  cameraId: string;
  currentType: CameraType;
  currentResolution: { width: number; height: number; megapixels: number };
  currentAiAccuracy: number;
  recommendedUpgrade: {
    type: 'ip-camera' | 'hd-analog' | 'no-upgrade';
    resolution: { width: number; height: number; megapixels: number };
    estimatedAiAccuracy: number;
    estimatedCostUSD: number;
  };
  roi: {
    accuracyGainPercent: number;
    costEffectiveness: 'high' | 'medium' | 'low';
    priority: 'high' | 'medium' | 'low';
    paybackMonths?: number;
  };
  reason: string;
}

interface CameraTypeHistory {
  cameraId: string;
  detectedType: CameraType;
  analogStandard: AnalogStandard;
  resolutionSamples: Array<{ width: number; height: number; timestamp: Date }>;
  qualityMetrics: {
    avgNoise: number;
    avgSharpness: number;
    avgContrast: number;
    interlacingDetected: boolean;
    compressionArtifacts: boolean;
  };
  connectionInfo?: {
    streamUrl: string;
    protocol: string;
  };
  classification?: CameraClassification;
}

export class CameraTypeClassifier extends BaseDetector {
  private cameraHistory = new Map<string, CameraTypeHistory>();
  
  // Resolution detection thresholds
  private readonly RESOLUTION_STANDARDS = [
    { name: 'D1', width: 720, height: 576, megapixels: 0.4, type: 'standard-analog' as const },
    { name: 'D1-NTSC', width: 720, height: 480, megapixels: 0.3, type: 'standard-analog' as const },
    { name: '960H', width: 960, height: 576, megapixels: 0.6, type: 'standard-analog' as const },
    { name: '720p', width: 1280, height: 720, megapixels: 0.9, type: 'hd-analog' as const },
    { name: '1080p', width: 1920, height: 1080, megapixels: 2.1, type: 'hd-analog' as const },
    { name: '3MP', width: 2048, height: 1536, megapixels: 3.1, type: 'ip-camera' as const },
    { name: '4MP', width: 2592, height: 1520, megapixels: 3.9, type: 'ip-camera' as const },
    { name: '5MP', width: 2560, height: 1920, megapixels: 4.9, type: 'ip-camera' as const },
    { name: '8MP', width: 3840, height: 2160, megapixels: 8.3, type: 'ip-camera' as const },
  ];

  constructor() {
    super("camera-type-classifier", "1.0.0");
  }

  async initialize(): Promise<void> {
    console.log("Initializing camera type classifier...");
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    
    // Get or create camera history
    let history = this.cameraHistory.get(frame.cameraId);
    if (!history) {
      history = {
        cameraId: frame.cameraId,
        detectedType: 'unknown',
        analogStandard: 'unknown',
        resolutionSamples: [],
        qualityMetrics: {
          avgNoise: 0,
          avgSharpness: 0,
          avgContrast: 0,
          interlacingDetected: false,
          compressionArtifacts: false,
        },
      };
      this.cameraHistory.set(frame.cameraId, history);
    }

    // Record resolution sample
    history.resolutionSamples.push({
      width: frame.width,
      height: frame.height,
      timestamp: frame.timestamp,
    });
    
    // Keep only recent samples
    if (history.resolutionSamples.length > 10) {
      history.resolutionSamples.shift();
    }

    // Update quality metrics from frame metadata
    this.updateQualityMetrics(history, frame);

    // Classify camera type (only after enough samples)
    if (history.resolutionSamples.length >= 3 && !history.classification) {
      const classification = this.classifyCamera(history, frame);
      history.classification = classification;
      history.detectedType = classification.cameraType;
      history.analogStandard = classification.analogStandard;

      // Generate classification result
      results.push({
        detectionType: "camera-type-classified",
        confidence: 0.90,
        objects: [],
        metadata: {
          cameraId: frame.cameraId,
          classification,
        },
        requiresAlert: false,
      });
    }

    return results;
  }

  /**
   * Update quality metrics from frame
   */
  private updateQualityMetrics(history: CameraTypeHistory, frame: DetectionFrame): void {
    const metadata = frame.metadata as any;
    
    if (metadata?.noise !== undefined) {
      history.qualityMetrics.avgNoise = 
        (history.qualityMetrics.avgNoise * 0.9) + (metadata.noise * 0.1);
    }
    
    if (metadata?.sharpness !== undefined) {
      history.qualityMetrics.avgSharpness = 
        (history.qualityMetrics.avgSharpness * 0.9) + (metadata.sharpness * 0.1);
    }
    
    if (metadata?.contrast !== undefined) {
      history.qualityMetrics.avgContrast = 
        (history.qualityMetrics.avgContrast * 0.9) + (metadata.contrast * 0.1);
    }
    
    if (metadata?.interlacing !== undefined && metadata.interlacing > 5) {
      history.qualityMetrics.interlacingDetected = true;
    }
    
    if (metadata?.blockiness !== undefined && metadata.blockiness > 10) {
      history.qualityMetrics.compressionArtifacts = true;
    }
  }

  /**
   * Classify camera based on collected data
   */
  private classifyCamera(history: CameraTypeHistory, frame: DetectionFrame): CameraClassification {
    // Determine resolution
    const avgWidth = history.resolutionSamples.reduce((sum, s) => sum + s.width, 0) / 
                     history.resolutionSamples.length;
    const avgHeight = history.resolutionSamples.reduce((sum, s) => sum + s.height, 0) / 
                      history.resolutionSamples.length;
    
    const megapixels = (avgWidth * avgHeight) / 1_000_000;
    
    // Match to standard resolution
    const closestStandard = this.findClosestResolutionStandard(avgWidth, avgHeight);
    
    // Determine camera type based on resolution and quality indicators
    let cameraType: CameraType = closestStandard.type;
    let analogStandard: AnalogStandard = 'unknown';
    let signalType: 'analog' | 'digital' = 'analog';
    
    // Check for interlacing (common in analog)
    if (history.qualityMetrics.interlacingDetected) {
      if (megapixels < 0.7) {
        cameraType = 'standard-analog';
        analogStandard = 'composite';
      } else if (megapixels <= 2.2) {
        cameraType = 'hd-analog';
        analogStandard = this.detectHDAnalogStandard(avgWidth, avgHeight, history);
      }
    } else {
      // No interlacing suggests IP camera
      if (megapixels > 2.0) {
        cameraType = 'ip-camera';
        analogStandard = 'ip';
        signalType = 'digital';
      }
    }
    
    // Check stream URL pattern
    const streamUrl = (frame.metadata as any)?.streamUrl as string | undefined;
    if (streamUrl) {
      if (streamUrl.includes('rtsp://') || streamUrl.includes('onvif')) {
        cameraType = 'ip-camera';
        analogStandard = 'ip';
        signalType = 'digital';
      } else if (streamUrl.includes('/dvr/') || streamUrl.includes('/channel/')) {
        // DVR channel - likely analog
        if (megapixels < 0.7) {
          cameraType = 'standard-analog';
        } else if (megapixels <= 2.2) {
          cameraType = 'hd-analog';
        }
      }
    }

    // Calculate video quality score
    const videoQualityScore = this.calculateVideoQualityScore(history);
    
    // Estimate AI accuracy
    const aiAccuracyEstimate = this.estimateAIAccuracy(cameraType, megapixels, videoQualityScore);
    
    // Detect features
    const features = this.detectCameraFeatures(history, frame);

    return {
      cameraId: history.cameraId,
      cameraType,
      analogStandard,
      estimatedResolution: {
        width: Math.round(avgWidth),
        height: Math.round(avgHeight),
        megapixels: Number(megapixels.toFixed(1)),
      },
      signalType,
      videoQualityScore,
      aiAccuracyEstimate,
      features,
      connectionType: this.detectConnectionType(streamUrl),
    };
  }

  /**
   * Find closest resolution standard
   */
  private findClosestResolutionStandard(width: number, height: number) {
    let closest = this.RESOLUTION_STANDARDS[0]!;
    let minDiff = Math.abs(width - closest.width) + Math.abs(height - closest.height);
    
    for (const standard of this.RESOLUTION_STANDARDS) {
      const diff = Math.abs(width - standard.width) + Math.abs(height - standard.height);
      if (diff < minDiff) {
        minDiff = diff;
        closest = standard;
      }
    }
    
    return closest;
  }

  /**
   * Detect HD analog standard
   */
  private detectHDAnalogStandard(
    width: number,
    height: number,
    history: CameraTypeHistory
  ): AnalogStandard {
    // HD-TVI, HD-CVI, and AHD are difficult to distinguish without hardware info
    // Use heuristics based on quality characteristics
    
    const megapixels = (width * height) / 1_000_000;
    
    if (megapixels >= 4.5) {
      return 'hd-tvi'; // HD-TVI supports up to 8MP
    } else if (megapixels >= 3.5) {
      return 'hd-cvi'; // HD-CVI supports up to 4MP
    } else if (megapixels >= 1.5) {
      return 'ahd'; // AHD supports up to 2MP
    } else {
      return 'hd-tvi'; // Default to HD-TVI for 720p/1080p
    }
  }

  /**
   * Calculate video quality score
   */
  private calculateVideoQualityScore(history: CameraTypeHistory): number {
    let score = 100;
    
    // Noise penalty
    if (history.qualityMetrics.avgNoise > 30) {
      score -= 30;
    } else if (history.qualityMetrics.avgNoise > 15) {
      score -= 15;
    }
    
    // Sharpness bonus/penalty
    if (history.qualityMetrics.avgSharpness < 20) {
      score -= 20;
    }
    
    // Contrast penalty
    if (history.qualityMetrics.avgContrast < 15) {
      score -= 15;
    }
    
    // Interlacing penalty
    if (history.qualityMetrics.interlacingDetected) {
      score -= 10;
    }
    
    // Compression artifacts penalty
    if (history.qualityMetrics.compressionArtifacts) {
      score -= 5;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Estimate AI accuracy based on camera type and quality
   */
  private estimateAIAccuracy(
    cameraType: CameraType,
    megapixels: number,
    videoQualityScore: number
  ): number {
    let baseAccuracy = 0;
    
    // Base accuracy by type
    switch (cameraType) {
      case 'standard-analog':
        baseAccuracy = 70; // 720×576 or less
        break;
      case 'hd-analog':
        if (megapixels >= 2.0) {
          baseAccuracy = 90; // 1080p HD-analog
        } else {
          baseAccuracy = 85; // 720p HD-analog
        }
        break;
      case 'ip-camera':
        if (megapixels >= 5.0) {
          baseAccuracy = 95; // 5MP+ IP camera
        } else if (megapixels >= 3.0) {
          baseAccuracy = 92; // 3-4MP IP camera
        } else {
          baseAccuracy = 90; // 2MP IP camera
        }
        break;
      default:
        baseAccuracy = 60;
    }
    
    // Adjust for video quality
    const qualityFactor = videoQualityScore / 100;
    const adjustedAccuracy = baseAccuracy * (0.7 + 0.3 * qualityFactor);
    
    return Math.round(Math.max(0, Math.min(100, adjustedAccuracy)));
  }

  /**
   * Detect camera features
   */
  private detectCameraFeatures(
    history: CameraTypeHistory,
    frame: DetectionFrame
  ): CameraClassification['features'] {
    const metadata = frame.metadata as any;
    
    return {
      nightVision: (metadata?.infrared === true) || (history.qualityMetrics.avgContrast < 20),
      wdr: metadata?.wdr === true,
      colorMode: this.detectColorMode(history),
      ptz: metadata?.ptz === true,
    };
  }

  /**
   * Detect color mode
   */
  private detectColorMode(history: CameraTypeHistory): 'color' | 'bw' | 'day-night' {
    // Simple heuristic - would need color saturation data
    if (history.qualityMetrics.avgContrast < 10) {
      return 'bw';
    }
    return 'color';
  }

  /**
   * Detect connection type
   */
  private detectConnectionType(streamUrl?: string): CameraClassification['connectionType'] {
    if (!streamUrl) return undefined;
    
    if (streamUrl.includes('rtsp://')) return 'rtsp';
    if (streamUrl.includes('onvif')) return 'onvif';
    if (streamUrl.includes('http://') || streamUrl.includes('https://')) return 'http';
    if (streamUrl.includes('/dvr/') || streamUrl.includes('/channel/')) return 'dvr-channel';
    
    return undefined;
  }

  /**
   * Generate upgrade recommendation
   */
  generateUpgradeRecommendation(cameraId: string, location?: string): UpgradeRecommendation | null {
    const history = this.cameraHistory.get(cameraId);
    if (!history || !history.classification) return null;

    const classification = history.classification;
    let recommendedUpgrade: UpgradeRecommendation['recommendedUpgrade'];
    let reason: string;
    let accuracyGain: number;
    let costEffectiveness: 'high' | 'medium' | 'low';
    let priority: 'high' | 'medium' | 'low';

    // Determine upgrade recommendation
    if (classification.cameraType === 'standard-analog') {
      // Standard analog should upgrade
      const currentAccuracy = classification.aiAccuracyEstimate;
      
      if (currentAccuracy < 70) {
        // Low accuracy - recommend IP camera
        recommendedUpgrade = {
          type: 'ip-camera',
          resolution: { width: 2560, height: 1920, megapixels: 5.0 },
          estimatedAiAccuracy: 95,
          estimatedCostUSD: 150,
        };
        accuracyGain = 95 - currentAccuracy;
        costEffectiveness = 'high';
        priority = 'high';
        reason = `Standard analog camera with ${currentAccuracy}% AI accuracy. Upgrading to 5MP IP camera will improve accuracy to 95% for critical AI features like face recognition and ANPR.`;
      } else {
        // Reasonable accuracy - HD-analog may be enough
        recommendedUpgrade = {
          type: 'hd-analog',
          resolution: { width: 1920, height: 1080, megapixels: 2.1 },
          estimatedAiAccuracy: 90,
          estimatedCostUSD: 80,
        };
        accuracyGain = 90 - currentAccuracy;
        costEffectiveness = 'high';
        priority = 'medium';
        reason = `Standard analog camera. Upgrading to 1080p HD-analog (HD-TVI/HD-CVI) is cost-effective and improves AI accuracy to 90%.`;
      }
    } else if (classification.cameraType === 'hd-analog') {
      // HD-analog - upgrade only if location is critical
      const currentAccuracy = classification.aiAccuracyEstimate;
      
      if (currentAccuracy < 85 || (location && this.isCriticalLocation(location))) {
        recommendedUpgrade = {
          type: 'ip-camera',
          resolution: { width: 2560, height: 1920, megapixels: 5.0 },
          estimatedAiAccuracy: 95,
          estimatedCostUSD: 150,
        };
        accuracyGain = 95 - currentAccuracy;
        costEffectiveness = 'medium';
        priority = location ? 'high' : 'medium';
        reason = `HD-analog camera at ${classification.estimatedResolution.megapixels}MP. ${location ? `Critical location (${location}) requires` : 'Upgrading to'} 5MP IP camera for maximum AI accuracy.`;
      } else {
        // HD-analog is good enough
        recommendedUpgrade = {
          type: 'no-upgrade',
          resolution: classification.estimatedResolution,
          estimatedAiAccuracy: currentAccuracy,
          estimatedCostUSD: 0,
        };
        accuracyGain = 0;
        costEffectiveness = 'high';
        priority = 'low';
        reason = `HD-analog camera performing well with ${currentAccuracy}% AI accuracy. No upgrade needed.`;
      }
    } else {
      // IP camera - no upgrade needed
      recommendedUpgrade = {
        type: 'no-upgrade',
        resolution: classification.estimatedResolution,
        estimatedAiAccuracy: classification.aiAccuracyEstimate,
        estimatedCostUSD: 0,
      };
      accuracyGain = 0;
      costEffectiveness = 'high';
      priority = 'low';
      reason = `IP camera with ${classification.estimatedResolution.megapixels}MP performing at ${classification.aiAccuracyEstimate}% AI accuracy. No upgrade needed.`;
    }

    return {
      cameraId,
      currentType: classification.cameraType,
      currentResolution: classification.estimatedResolution,
      currentAiAccuracy: classification.aiAccuracyEstimate,
      recommendedUpgrade,
      roi: {
        accuracyGainPercent: accuracyGain,
        costEffectiveness,
        priority,
        paybackMonths: accuracyGain > 10 ? Math.round(recommendedUpgrade.estimatedCostUSD / (accuracyGain * 0.5)) : undefined,
      },
      reason,
    };
  }

  /**
   * Check if location is critical (entrance, ATM, vault, etc.)
   */
  private isCriticalLocation(location: string): boolean {
    const criticalKeywords = [
      'entrance', 'entry', 'atm', 'vault', 'cash', 'counter', 
      'teller', 'main', 'lobby', 'door', 'gate', 'reception'
    ];
    
    const locationLower = location.toLowerCase();
    return criticalKeywords.some(keyword => locationLower.includes(keyword));
  }

  /**
   * Get all camera classifications
   */
  getAllClassifications(): CameraClassification[] {
    const classifications: CameraClassification[] = [];
    
    for (const history of this.cameraHistory.values()) {
      if (history.classification) {
        classifications.push(history.classification);
      }
    }
    
    return classifications;
  }

  /**
   * Get upgrade recommendations for all cameras
   */
  getAllUpgradeRecommendations(): UpgradeRecommendation[] {
    const recommendations: UpgradeRecommendation[] = [];
    
    for (const history of this.cameraHistory.values()) {
      if (history.classification) {
        const recommendation = this.generateUpgradeRecommendation(history.cameraId);
        if (recommendation) {
          recommendations.push(recommendation);
        }
      }
    }
    
    // Sort by priority and accuracy gain
    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.roi.priority] - priorityOrder[a.roi.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.roi.accuracyGainPercent - a.roi.accuracyGainPercent;
    });
  }

  /**
   * Get camera classification
   */
  getCameraClassification(cameraId: string): CameraClassification | null {
    const history = this.cameraHistory.get(cameraId);
    return history?.classification ?? null;
  }

  /**
   * Get upgrade summary statistics
   */
  getUpgradeSummary() {
    const all = this.getAllUpgradeRecommendations();
    
    const highPriority = all.filter(r => r.roi.priority === 'high');
    const mediumPriority = all.filter(r => r.roi.priority === 'medium');
    const totalCost = all
      .filter(r => r.recommendedUpgrade.type !== 'no-upgrade')
      .reduce((sum, r) => sum + r.recommendedUpgrade.estimatedCostUSD, 0);
    
    const avgAccuracyGain = all
      .filter(r => r.recommendedUpgrade.type !== 'no-upgrade')
      .reduce((sum, r) => sum + r.roi.accuracyGainPercent, 0) / 
      Math.max(1, all.filter(r => r.recommendedUpgrade.type !== 'no-upgrade').length);

    return {
      totalCameras: all.length,
      needsUpgrade: all.filter(r => r.recommendedUpgrade.type !== 'no-upgrade').length,
      highPriorityUpgrades: highPriority.length,
      mediumPriorityUpgrades: mediumPriority.length,
      totalEstimatedCostUSD: Math.round(totalCost),
      averageAccuracyGain: Math.round(avgAccuracyGain),
      breakdown: {
        standardAnalog: all.filter(r => r.currentType === 'standard-analog').length,
        hdAnalog: all.filter(r => r.currentType === 'hd-analog').length,
        ipCamera: all.filter(r => r.currentType === 'ip-camera').length,
      },
    };
  }

  async cleanup(): Promise<void> {
    this.cameraHistory.clear();
    console.log("Camera type classifier cleaned up");
  }

  getHealth() {
    return {
      status: "healthy" as const,
      details: `Classified ${this.cameraHistory.size} cameras`,
    };
  }
}
