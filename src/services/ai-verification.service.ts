import type { ControlPlaneStore } from '../control-plane-store.js';
import type { DetectionEvent } from '../events/detection-event.js';

/**
 * AI Event Verification Service
 * 
 * Determines whether AI detection events should create incidents automatically,
 * require operator verification, or be logged as informational alerts.
 */

export type VerificationMode = 'automatic' | 'operator-required' | 'informational';

export interface VerificationDecision {
  mode: VerificationMode;
  confidence: number;
  score: number;
  reason: string;
  factors: {
    detectionConfidence: number;
    ruleSeverity: number;
    cameraCriticality: number;
    scheduleMatch: number;
    zoneType: number;
    repeatDetections: number;
    supportingEvents: number;
    deviceHealth: number;
  };
  recommendedSeverity: string;
  requiresImmediate: boolean;
}

export interface VerificationRule {
  detectionType: string;
  baseMode: VerificationMode;
  confidenceThresholds: {
    automatic: number;
    operator: number;
    informational: number;
  };
  severityMap: {
    high: string;
    medium: string;
    low: string;
  };
  criticalCameraTypes?: string[];
  criticalZones?: string[];
  businessHoursOnly?: boolean;
}

const VERIFICATION_RULES: Record<string, VerificationRule> = {
  // High-risk events - create incidents automatically with high confidence
  'fire': {
    detectionType: 'fire',
    baseMode: 'automatic',
    confidenceThresholds: { automatic: 0.75, operator: 0.50, informational: 0 },
    severityMap: { high: 'P1', medium: 'P1', low: 'P2' },
    criticalCameraTypes: ['fire-safety', 'electrical-room'],
  },
  'smoke': {
    detectionType: 'smoke',
    baseMode: 'automatic',
    confidenceThresholds: { automatic: 0.80, operator: 0.60, informational: 0 },
    severityMap: { high: 'P1', medium: 'P2', low: 'P3' },
    criticalCameraTypes: ['fire-safety', 'server-room'],
  },
  'weapon': {
    detectionType: 'weapon',
    baseMode: 'operator-required',
    confidenceThresholds: { automatic: 0.90, operator: 0.70, informational: 0 },
    severityMap: { high: 'P1', medium: 'P1', low: 'P2' },
  },
  'intrusion': {
    detectionType: 'intrusion',
    baseMode: 'automatic',
    confidenceThresholds: { automatic: 0.85, operator: 0.70, informational: 0 },
    severityMap: { high: 'P1', medium: 'P2', low: 'P3' },
    criticalZones: ['vault', 'server-room', 'cash-area'],
  },
  'restricted-area': {
    detectionType: 'restricted-area',
    baseMode: 'automatic',
    confidenceThresholds: { automatic: 0.85, operator: 0.70, informational: 0 },
    severityMap: { high: 'P1', medium: 'P2', low: 'P3' },
    criticalZones: ['vault', 'atm-back'],
    businessHoursOnly: false,
  },
  'panic-alarm': {
    detectionType: 'panic-alarm',
    baseMode: 'automatic',
    confidenceThresholds: { automatic: 0.90, operator: 0, informational: 0 },
    severityMap: { high: 'P1', medium: 'P1', low: 'P1' },
  },
  'atm-tampering': {
    detectionType: 'atm-tampering',
    baseMode: 'automatic',
    confidenceThresholds: { automatic: 0.80, operator: 0.65, informational: 0 },
    severityMap: { high: 'P1', medium: 'P2', low: 'P3' },
    criticalCameraTypes: ['atm'],
  },
  
  // Medium-risk events - require operator verification
  'loitering': {
    detectionType: 'loitering',
    baseMode: 'operator-required',
    confidenceThresholds: { automatic: 0.90, operator: 0.70, informational: 0.50 },
    severityMap: { high: 'P2', medium: 'P3', low: 'P4' },
    businessHoursOnly: false,
  },
  'crowd-density': {
    detectionType: 'crowd-density',
    baseMode: 'operator-required',
    confidenceThresholds: { automatic: 0.85, operator: 0.70, informational: 0.60 },
    severityMap: { high: 'P2', medium: 'P3', low: 'P4' },
    criticalZones: ['entrance', 'exit', 'lobby'],
  },
  'tailgating': {
    detectionType: 'tailgating',
    baseMode: 'operator-required',
    confidenceThresholds: { automatic: 0.90, operator: 0.75, informational: 0.60 },
    severityMap: { high: 'P2', medium: 'P3', low: 'P4' },
    criticalZones: ['secure-entrance', 'vault-entrance'],
  },
  'fall-detection': {
    detectionType: 'fall-detection',
    baseMode: 'automatic',
    confidenceThresholds: { automatic: 0.85, operator: 0.70, informational: 0 },
    severityMap: { high: 'P2', medium: 'P3', low: 'P4' },
  },
  'unattended-object': {
    detectionType: 'unattended-object',
    baseMode: 'operator-required',
    confidenceThresholds: { automatic: 0.90, operator: 0.75, informational: 0.60 },
    severityMap: { high: 'P2', medium: 'P3', low: 'P4' },
    criticalZones: ['entrance', 'atm-area', 'lobby'],
  },
  'suspicious-behavior': {
    detectionType: 'suspicious-behavior',
    baseMode: 'operator-required',
    confidenceThresholds: { automatic: 0.95, operator: 0.80, informational: 0.65 },
    severityMap: { high: 'P2', medium: 'P3', low: 'P4' },
  },
  
  // Low-risk informational events
  'motion': {
    detectionType: 'motion',
    baseMode: 'informational',
    confidenceThresholds: { automatic: 0.99, operator: 0.95, informational: 0 },
    severityMap: { high: 'P4', medium: 'P5', low: 'P5' },
  },
  'person-count': {
    detectionType: 'person-count',
    baseMode: 'informational',
    confidenceThresholds: { automatic: 0.95, operator: 0.90, informational: 0 },
    severityMap: { high: 'P4', medium: 'P5', low: 'P5' },
  },
  'queue-length': {
    detectionType: 'queue-length',
    baseMode: 'informational',
    confidenceThresholds: { automatic: 0.95, operator: 0.85, informational: 0 },
    severityMap: { high: 'P3', medium: 'P4', low: 'P5' },
    businessHoursOnly: true,
  },
};

export class AIVerificationService {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly logger?: Console
  ) {}
  
  /**
   * Verify AI detection and determine action
   */
  async verifyDetection(event: DetectionEvent): Promise<VerificationDecision> {
    const detectionType = event.detectionType || event.eventType || 'unknown';
    const rule = VERIFICATION_RULES[detectionType] || this.getDefaultRule(detectionType);
    
    // Calculate verification score
    const factors = await this.calculateFactors(event);
    const score = this.calculateScore(factors);
    
    // Determine mode based on confidence and factors
    const mode = this.determineMode(event, rule, score, factors);
    
    // Determine severity
    const severity = this.determineSeverity(event, rule, score);
    
    // Check if requires immediate action
    const requiresImmediate = this.requiresImmediateAction(event, mode, score);
    
    const decision: VerificationDecision = {
      mode,
      confidence: event.confidence,
      score,
      reason: this.generateReason(event, mode, factors),
      factors,
      recommendedSeverity: severity,
      requiresImmediate,
    };
    
    this.logger?.log(
      `Verification decision for ${detectionType}: ${mode} (score: ${score.toFixed(2)}, confidence: ${Math.round(event.confidence * 100)}%)`
    );
    
    return decision;
  }
  
  /**
   * Calculate verification factors
   */
  private async calculateFactors(event: DetectionEvent): Promise<VerificationDecision['factors']> {
    // Detection confidence (base factor)
    const detectionConfidence = event.confidence;
    
    // Rule severity (how critical this detection type is)
    const detectionType = event.detectionType || event.eventType || 'unknown';
    const rule = VERIFICATION_RULES[detectionType];
    const ruleSeverity = rule ? this.getSeverityScore(rule.severityMap.high) : 0.5;
    
    // Camera criticality
    const cameraCriticality = await this.getCameraCriticality(event.cameraId, detectionType);
    
    // Schedule match (is this during expected business hours?)
    const detectionTime = event.detectionTime || event.timestamp || new Date().toISOString();
    const scheduleMatch = this.getScheduleMatch(detectionTime, rule?.businessHoursOnly);
    
    // Zone type criticality
    const zoneType = this.getZoneCriticality(event.zone, rule?.criticalZones);
    
    // Repeat detections (has this been detected multiple times recently?)
    const repeatDetections = 0.5; // Would query recent detections
    
    // Supporting events (are there corroborating detections?)
    const supportingEvents = 0.5; // Would check for related detections
    
    // Device health (is the camera functioning properly?)
    const deviceHealth = await this.getDeviceHealth(event.cameraId);
    
    return {
      detectionConfidence,
      ruleSeverity,
      cameraCriticality,
      scheduleMatch,
      zoneType,
      repeatDetections,
      supportingEvents,
      deviceHealth,
    };
  }
  
  /**
   * Calculate overall verification score
   */
  private calculateScore(factors: VerificationDecision['factors']): number {
    const weights = {
      detectionConfidence: 0.35,
      ruleSeverity: 0.20,
      cameraCriticality: 0.15,
      scheduleMatch: 0.10,
      zoneType: 0.10,
      repeatDetections: 0.05,
      supportingEvents: 0.03,
      deviceHealth: 0.02,
    };
    
    let score = 0;
    for (const [key, weight] of Object.entries(weights)) {
      score += factors[key as keyof typeof factors] * weight;
    }
    
    return Math.min(Math.max(score, 0), 1);
  }
  
  /**
   * Determine verification mode
   */
  private determineMode(
    event: DetectionEvent,
    rule: VerificationRule,
    score: number,
    factors: VerificationDecision['factors']
  ): VerificationMode {
    // Check confidence thresholds
    if (event.confidence >= rule.confidenceThresholds.automatic && score >= 0.80) {
      return 'automatic';
    }
    
    if (event.confidence >= rule.confidenceThresholds.operator && score >= 0.60) {
      return 'operator-required';
    }
    
    // Check for override conditions
    if (factors.cameraCriticality >= 0.90 && event.confidence >= 0.75) {
      return 'automatic';
    }
    
    if (factors.zoneType >= 0.90 && event.confidence >= 0.80) {
      return 'automatic';
    }
    
    // Fall back to base mode
    if (event.confidence >= rule.confidenceThresholds.operator) {
      return rule.baseMode === 'informational' ? 'operator-required' : rule.baseMode;
    }
    
    return 'informational';
  }
  
  /**
   * Determine severity
   */
  private determineSeverity(
    event: DetectionEvent,
    rule: VerificationRule,
    score: number
  ): string {
    if (score >= 0.85 || event.confidence >= 0.90) {
      return rule.severityMap.high;
    }
    
    if (score >= 0.70 || event.confidence >= 0.75) {
      return rule.severityMap.medium;
    }
    
    return rule.severityMap.low;
  }
  
  /**
   * Check if requires immediate action
   */
  private requiresImmediateAction(
    event: DetectionEvent,
    mode: VerificationMode,
    score: number
  ): boolean {
    if (mode === 'automatic' && score >= 0.85) {
      return true;
    }
    
    const detectionType = event.detectionType || event.eventType || 'unknown';
    const criticalTypes = ['fire', 'weapon', 'panic-alarm', 'intrusion'];
    if (criticalTypes.includes(detectionType)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Generate decision reason
   */
  private generateReason(
    event: DetectionEvent,
    mode: VerificationMode,
    factors: VerificationDecision['factors']
  ): string {
    const confidence = Math.round(event.confidence * 100);
    const score = Math.round(factors.detectionConfidence * 100);
    
    switch (mode) {
      case 'automatic':
        if (factors.cameraCriticality >= 0.90) {
          return `High-confidence detection (${confidence}%) on critical camera`;
        }
        if (factors.zoneType >= 0.90) {
          return `High-confidence detection (${confidence}%) in critical zone`;
        }
        return `High confidence (${confidence}%) and verification score (${score})`;
        
      case 'operator-required':
        return `Moderate confidence (${confidence}%), operator verification recommended`;
        
      case 'informational':
        return `Low confidence (${confidence}%), logged as informational alert`;
        
      default:
        return 'Unknown verification mode';
    }
  }
  
  /**
   * Get camera criticality score
   */
  private async getCameraCriticality(cameraId: string, detectionType: string): Promise<number> {
    try {
      const camera = await this.store.getCamera(cameraId);
      if (!camera) return 0.5;
      
      // Check if camera type matches critical types for this detection
      const rule = VERIFICATION_RULES[detectionType];
      if (rule?.criticalCameraTypes && camera.locationType) {
        const locationType = String(camera.locationType);
        if (rule.criticalCameraTypes.includes(locationType)) {
          return 1.0;
        }
      }
      
      // Base criticality on location type
      const criticalTypes = ['vault', 'atm', 'cash-counter', 'server-room', 'entrance'];
      if (camera.locationType) {
        const locationType = String(camera.locationType);
        if (criticalTypes.includes(locationType)) {
          return 0.8;
        }
      }
      
      return 0.5;
    } catch (error) {
      return 0.5;
    }
  }
  
  /**
   * Get schedule match score
   */
  private getScheduleMatch(detectionTime: string, businessHoursOnly?: boolean): number {
    const date = new Date(detectionTime);
    const hour = date.getHours();
    const day = date.getDay();
    
    // Weekend
    if (day === 0 || day === 6) {
      return businessHoursOnly ? 0.3 : 1.0;
    }
    
    // Business hours (9 AM - 6 PM)
    if (hour >= 9 && hour < 18) {
      return businessHoursOnly ? 1.0 : 0.7;
    }
    
    // After hours
    return businessHoursOnly ? 0.3 : 1.0;
  }
  
  /**
   * Get zone criticality score
   */
  private getZoneCriticality(zone?: string, criticalZones?: string[]): number {
    if (!zone) return 0.5;
    
    if (criticalZones && criticalZones.includes(zone)) {
      return 1.0;
    }
    
    // Check for critical keywords
    const criticalKeywords = ['vault', 'secure', 'restricted', 'atm', 'cash'];
    for (const keyword of criticalKeywords) {
      if (zone.toLowerCase().includes(keyword)) {
        return 0.8;
      }
    }
    
    return 0.5;
  }
  
  /**
   * Get device health score
   */
  private async getDeviceHealth(cameraId: string): Promise<number> {
    try {
      const events = await this.store.listRecordingHealthEvents(cameraId, 10);
      
      if (events.length === 0) {
        return 0.8; // Assume healthy if no recent events
      }
      
      // Check for recent health issues
      const recentIssues = events.filter(e => 
        e.eventType === 'error' || e.eventType === 'warning'
      ).length;
      
      return Math.max(0.3, 1 - (recentIssues / events.length));
    } catch (error) {
      return 0.8;
    }
  }
  
  /**
   * Get severity score for mapping
   */
  private getSeverityScore(severity: string): number {
    const scores: Record<string, number> = {
      'P1': 1.0,
      'P2': 0.8,
      'P3': 0.6,
      'P4': 0.4,
      'P5': 0.2,
    };
    return scores[severity] || 0.5;
  }
  
  /**
   * Get default rule for unknown detection type
   */
  private getDefaultRule(detectionType: string): VerificationRule {
    return {
      detectionType,
      baseMode: 'operator-required',
      confidenceThresholds: { automatic: 0.90, operator: 0.75, informational: 0.60 },
      severityMap: { high: 'P3', medium: 'P4', low: 'P5' },
    };
  }
  
  /**
   * Add custom verification rule
   */
  addVerificationRule(rule: VerificationRule): void {
    VERIFICATION_RULES[rule.detectionType] = rule;
  }
  
  /**
   * Get all verification rules
   */
  getVerificationRules(): Record<string, VerificationRule> {
    return { ...VERIFICATION_RULES };
  }
}
