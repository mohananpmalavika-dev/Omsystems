/**
 * Pattern Anonymizer Service
 * 
 * Ensures all personally identifiable information is stripped from threat patterns
 * before sharing with the Guardian Network.
 * 
 * Privacy Principles:
 * 1. NO biometric data (faces, fingerprints, voice prints)
 * 2. NO identity information (names, IDs, credentials)
 * 3. NO exact locations (addresses, GPS coordinates)
 * 4. NO financial amounts or account numbers
 * 5. NO camera footage or images
 * 6. YES behavioral patterns, tactics, timing
 * 7. YES anonymized location categories
 * 8. YES detection methods and outcomes
 */

import type { ThreatPattern, ThreatCategory, IndustryVertical } from '../guardian-network.types';
import crypto from 'crypto';

export interface LocalIncident {
  id: string;
  tenantId: string;
  branchId: string;
  
  // Alert data
  detectionType: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  category: string;
  
  // Timing
  occurredAt: Date;
  detectedAt: Date;
  resolvedAt?: Date;
  
  // Location (specific)
  cameraId: string;
  cameraName: string;
  zone?: string;
  
  // Behavioral data
  metadata?: {
    objectType?: string;
    approachDirection?: string;
    dwellTime?: number;
    actorCount?: number;
    toolsDetected?: string[];
    entryMethod?: string;
    vehiclePresent?: boolean;
    coordinatedActivity?: boolean;
  };
  
  // Detection
  aiCapabilities: string[];
  confidence: number;
  
  // Response
  responseTime?: number;
  outcome: 'prevented' | 'detected-during' | 'detected-after' | 'unknown';
  
  // Context
  industryVertical: IndustryVertical;
  facilityType: string;
}

export class PatternAnonymizerService {
  private readonly deploymentSalt: string;
  
  constructor(deploymentSalt?: string) {
    // Use consistent salt for this deployment to generate same anonymized IDs
    this.deploymentSalt = deploymentSalt || process.env.GUARDIAN_NETWORK_SALT || 'default-salt-change-me';
  }
  
  /**
   * Convert a local incident to a privacy-preserved threat pattern
   */
  anonymizeIncident(incident: LocalIncident): ThreatPattern {
    return {
      id: this.generatePatternId(incident),
      category: this.mapToThreatCategory(incident.category),
      severity: this.mapSeverity(incident.severity),
      confidence: this.mapConfidence(incident.confidence),
      
      // Temporal (anonymized to time buckets)
      occurredAt: this.anonymizeTimestamp(incident.occurredAt),
      timeOfDay: this.getTimeOfDay(incident.occurredAt),
      dayOfWeek: this.getDayOfWeek(incident.occurredAt),
      
      // Location (fully anonymized)
      industryVertical: incident.industryVertical,
      locationCategory: this.anonymizeLocationCategory(incident.facilityType),
      geographicRegion: this.anonymizeRegion(), // From deployment config
      urbanDensity: this.getUrbanDensity(), // From deployment config
      
      // Behavioral signature (NO PII)
      behavioralSignature: {
        approachPattern: incident.metadata?.dwellTime 
          ? this.describeApproachPattern(incident.metadata.dwellTime) 
          : undefined,
        toolsUsed: incident.metadata?.toolsDetected,
        targetType: this.anonymizeTargetType(incident.detectionType),
        entryMethod: incident.metadata?.entryMethod,
        duration: incident.responseTime,
        actorCount: incident.metadata?.actorCount,
        vehicleInvolved: incident.metadata?.vehiclePresent,
        coordinatedAttack: incident.metadata?.coordinatedActivity,
      },
      
      // Detection metadata (safe to share)
      detectionMethods: this.extractDetectionMethods(incident),
      aiCapabilitiesInvolved: incident.aiCapabilities,
      
      // Outcome (NO financial data)
      outcome: incident.outcome,
      responseTime: incident.responseTime,
      
      // Provenance (anonymized)
      contributingDeploymentId: this.anonymizeDeploymentId(),
      sharedAt: new Date(),
      verificationStatus: 'unverified', // Will be verified by network
      
      matchCount: 0,
    };
  }
  
  /**
   * Batch anonymization with privacy checks
   */
  anonymizeIncidentBatch(
    incidents: LocalIncident[],
    options: { skipIfLowConfidence?: boolean; minConfidence?: number } = {}
  ): { patterns: ThreatPattern[]; skipped: number; reasons: string[] } {
    const patterns: ThreatPattern[] = [];
    const reasons: string[] = [];
    let skipped = 0;
    
    for (const incident of incidents) {
      // Privacy check: skip if contains PII
      if (this.containsPII(incident)) {
        skipped++;
        reasons.push(`Incident ${incident.id}: Contains PII, cannot anonymize`);
        continue;
      }
      
      // Confidence check
      if (options.skipIfLowConfidence && incident.confidence < (options.minConfidence || 0.7)) {
        skipped++;
        reasons.push(`Incident ${incident.id}: Confidence too low (${incident.confidence})`);
        continue;
      }
      
      try {
        const pattern = this.anonymizeIncident(incident);
        patterns.push(pattern);
      } catch (error) {
        skipped++;
        reasons.push(`Incident ${incident.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return { patterns, skipped, reasons };
  }
  
  /**
   * Verify a pattern has no PII before sharing
   */
  verifyNoPII(pattern: ThreatPattern): { safe: boolean; violations: string[] } {
    const violations: string[] = [];
    
    // Check for exact coordinates
    if ('latitude' in pattern || 'longitude' in pattern) {
      violations.push('Contains GPS coordinates');
    }
    
    // Check for specific addresses
    if ('address' in pattern || 'streetAddress' in pattern) {
      violations.push('Contains street address');
    }
    
    // Check for identity data
    if ('personId' in pattern || 'userId' in pattern || 'identityId' in pattern) {
      violations.push('Contains identity reference');
    }
    
    // Check for biometric data
    if ('faceEmbedding' in pattern || 'biometric' in pattern) {
      violations.push('Contains biometric data');
    }
    
    // Check for financial data
    if ('amount' in pattern || 'accountNumber' in pattern) {
      violations.push('Contains financial information');
    }
    
    // Check for media references
    if ('videoUrl' in pattern || 'imageUrl' in pattern || 'snapshotUrl' in pattern) {
      violations.push('Contains media references');
    }
    
    // Check for tenant/branch IDs
    if ('tenantId' in pattern || 'branchId' in pattern || 'cameraId' in pattern) {
      violations.push('Contains deployment-specific identifiers');
    }
    
    return {
      safe: violations.length === 0,
      violations,
    };
  }
  
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  
  private generatePatternId(incident: LocalIncident): string {
    // Generate consistent but anonymized ID
    const hash = crypto
      .createHash('sha256')
      .update(`${incident.id}:${incident.tenantId}:${this.deploymentSalt}`)
      .digest('hex');
    return `pattern-${hash.substring(0, 16)}`;
  }
  
  private anonymizeDeploymentId(): string {
    // Consistent anonymized deployment ID
    const hash = crypto
      .createHash('sha256')
      .update(`${process.env.TENANT_ID || 'unknown'}:${this.deploymentSalt}`)
      .digest('hex');
    return `deployment-${hash.substring(0, 12)}`;
  }
  
  private anonymizeTimestamp(timestamp: Date): Date {
    // Round to nearest hour to prevent timing correlation
    const rounded = new Date(timestamp);
    rounded.setMinutes(0, 0, 0);
    return rounded;
  }
  
  private getTimeOfDay(timestamp: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = timestamp.getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }
  
  private getDayOfWeek(timestamp: Date): string {
    return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][timestamp.getDay()];
  }
  
  private anonymizeLocationCategory(facilityType: string): 'branch' | 'headquarters' | 'warehouse' | 'store' | 'facility' {
    const lower = facilityType.toLowerCase();
    if (lower.includes('branch') || lower.includes('office')) return 'branch';
    if (lower.includes('hq') || lower.includes('headquarters')) return 'headquarters';
    if (lower.includes('warehouse') || lower.includes('distribution')) return 'warehouse';
    if (lower.includes('store') || lower.includes('retail')) return 'store';
    return 'facility';
  }
  
  private anonymizeRegion(): string {
    // Read from deployment config, returns broad region
    return process.env.GUARDIAN_NETWORK_REGION || 'Unknown';
  }
  
  private getUrbanDensity(): 'urban' | 'suburban' | 'rural' | undefined {
    const density = process.env.GUARDIAN_NETWORK_URBAN_DENSITY;
    if (density === 'urban' || density === 'suburban' || density === 'rural') {
      return density;
    }
    return undefined;
  }
  
  private mapToThreatCategory(category: string): ThreatCategory {
    const lower = category.toLowerCase();
    if (lower.includes('theft') || lower.includes('shoplifting')) return 'theft';
    if (lower.includes('fraud')) return 'fraud';
    if (lower.includes('intrusion') || lower.includes('perimeter')) return 'intrusion';
    if (lower.includes('violence') || lower.includes('fighting') || lower.includes('weapon')) return 'violence';
    if (lower.includes('vandal')) return 'vandalism';
    if (lower.includes('unauthorized') || lower.includes('access')) return 'unauthorized-access';
    if (lower.includes('social')) return 'social-engineering';
    if (lower.includes('cyber')) return 'cyber-physical';
    if (lower.includes('insider')) return 'insider-threat';
    if (lower.includes('organized')) return 'organized-crime';
    return 'intrusion'; // default
  }
  
  private mapSeverity(severity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5'): 'critical' | 'high' | 'medium' | 'low' {
    switch (severity) {
      case 'P1': return 'critical';
      case 'P2': return 'high';
      case 'P3': return 'medium';
      case 'P4': case 'P5': return 'low';
    }
  }
  
  private mapConfidence(confidence: number): 'confirmed' | 'probable' | 'possible' | 'suspected' {
    if (confidence >= 0.9) return 'confirmed';
    if (confidence >= 0.7) return 'probable';
    if (confidence >= 0.5) return 'possible';
    return 'suspected';
  }
  
  private describeApproachPattern(dwellTime: number): string {
    if (dwellTime < 10) return 'direct-approach';
    if (dwellTime < 30) return 'brief-observation';
    if (dwellTime < 60) return 'extended-observation';
    return 'prolonged-loitering';
  }
  
  private anonymizeTargetType(detectionType: string): string {
    // Map specific detection types to generic target categories
    const mapping: Record<string, string> = {
      'atm-tampering': 'ATM',
      'atm-skimming': 'ATM',
      'vault-unauthorized-access': 'vault',
      'vault-forced-open': 'vault',
      'cash-counter-monitoring': 'cash-counter',
      'safe-tampering': 'safe',
      'door-forced-open': 'door',
      'window-break': 'window',
      'fence-climbing': 'perimeter',
    };
    
    return mapping[detectionType] || 'unknown';
  }
  
  private extractDetectionMethods(incident: LocalIncident): string[] {
    const methods: string[] = [];
    
    // Infer from detection type
    if (incident.detectionType.includes('motion')) methods.push('motion-detection');
    if (incident.detectionType.includes('object')) methods.push('object-detection');
    if (incident.detectionType.includes('person')) methods.push('person-detection');
    if (incident.detectionType.includes('vehicle')) methods.push('vehicle-detection');
    if (incident.detectionType.includes('behavior') || incident.detectionType.includes('loitering')) {
      methods.push('behavior-analysis');
    }
    
    // From AI capabilities
    if (incident.aiCapabilities.length > 0) {
      methods.push('AI-analytics');
    }
    
    return methods.length > 0 ? methods : ['unknown'];
  }
  
  private containsPII(incident: LocalIncident): boolean {
    // Check if incident contains any PII that cannot be anonymized
    const piiFields = [
      'personName',
      'identityId', 
      'faceEmbedding',
      'biometricData',
      'accountNumber',
      'cardNumber',
      'ssn',
      'passport',
      'driverLicense',
    ];
    
    const incidentStr = JSON.stringify(incident);
    return piiFields.some(field => incidentStr.includes(field));
  }
}
