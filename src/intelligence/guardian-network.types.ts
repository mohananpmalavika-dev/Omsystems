/**
 * Guardian Network - Cross-Location Intelligence System
 * 
 * Privacy-preserved threat pattern sharing across deployments with:
 * - Anonymous pattern aggregation
 * - Global threat database
 * - Benchmark scoring
 * - Industry intelligence
 */

export type ThreatCategory = 
  | 'theft' 
  | 'fraud' 
  | 'intrusion' 
  | 'violence' 
  | 'vandalism'
  | 'unauthorized-access'
  | 'social-engineering'
  | 'cyber-physical'
  | 'insider-threat'
  | 'organized-crime';

export type IndustryVertical = 
  | 'banking' 
  | 'retail' 
  | 'industrial' 
  | 'healthcare'
  | 'education'
  | 'government'
  | 'transportation'
  | 'hospitality'
  | 'corporate'
  | 'residential';

export type ThreatSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ThreatConfidence = 'confirmed' | 'probable' | 'possible' | 'suspected';

/**
 * Privacy-Preserved Threat Pattern
 * All personally identifiable information is stripped before sharing
 */
export interface ThreatPattern {
  id: string;
  category: ThreatCategory;
  severity: ThreatSeverity;
  confidence: ThreatConfidence;
  
  // Anonymized temporal data
  occurredAt: Date;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: string;
  
  // Anonymized location data (NO exact addresses)
  industryVertical: IndustryVertical;
  locationCategory: 'branch' | 'headquarters' | 'warehouse' | 'store' | 'facility';
  geographicRegion?: string; // e.g., "North America", "APAC"
  urbanDensity?: 'urban' | 'suburban' | 'rural';
  
  // Behavioral signature (NO biometric or identity data)
  behavioralSignature: {
    approachPattern?: string; // e.g., "loitered-30s-then-acted"
    toolsUsed?: string[]; // e.g., ["crowbar", "electronic-device"]
    targetType?: string; // e.g., "ATM", "vault", "cash-counter"
    entryMethod?: string; // e.g., "forced-door", "tailgating"
    duration?: number; // seconds
    actorCount?: number;
    vehicleInvolved?: boolean;
    coordinatedAttack?: boolean;
  };
  
  // Detection metadata
  detectionMethods: string[]; // e.g., ["motion-detection", "object-detection", "AI-behavior-analysis"]
  aiCapabilitiesInvolved: string[]; // capability IDs from catalog
  
  // Outcome (NO financial amounts or victim details)
  outcome: 'prevented' | 'detected-during' | 'detected-after' | 'unknown';
  responseTime?: number; // seconds
  
  // Cross-pattern correlation
  relatedPatternIds?: string[];
  tacticSimilarityScore?: number; // 0-1
  
  // Provenance (privacy-preserved)
  contributingDeploymentId: string; // anonymized deployment ID
  sharedAt: Date;
  verificationStatus: 'verified' | 'unverified' | 'disputed';
  
  // Usage tracking
  matchCount: number; // how many times this pattern has matched globally
  lastMatchedAt?: Date;
}

/**
 * Real-time Threat Intelligence Update
 * Distributed to all connected deployments
 */
export interface ThreatIntelligenceUpdate {
  id: string;
  type: 'new-pattern' | 'pattern-update' | 'emerging-threat' | 'tactical-alert';
  priority: 'urgent' | 'high' | 'normal';
  
  title: string;
  summary: string;
  
  // Associated pattern(s)
  patternIds: string[];
  patterns?: ThreatPattern[];
  
  // Geographic scope
  affectedRegions?: string[];
  affectedVerticals?: IndustryVertical[];
  
  // Tactical information
  indicators: string[]; // Observable indicators
  recommendations: string[]; // Mitigation actions
  
  // Timing
  publishedAt: Date;
  expiresAt?: Date;
  
  // Tracking
  affectedDeployments?: number;
  acknowledgmentCount?: number;
}

/**
 * Industry Benchmark Metrics
 * Compare your security effectiveness against peers
 */
export interface BenchmarkMetrics {
  deploymentId: string; // your anonymized ID
  industryVertical: IndustryVertical;
  benchmarkPeriod: {
    startDate: Date;
    endDate: Date;
  };
  
  // Your metrics
  your: {
    incidentCount: number;
    preventionRate: number; // 0-1
    detectionRate: number; // 0-1
    averageResponseTime: number; // seconds
    falsePositiveRate: number; // 0-1
    
    // By category
    byCategory: Record<ThreatCategory, {
      count: number;
      preventionRate: number;
      responseTime: number;
    }>;
  };
  
  // Industry averages
  industry: {
    incidentCount: number;
    preventionRate: number;
    detectionRate: number;
    averageResponseTime: number;
    falsePositiveRate: number;
    
    byCategory: Record<ThreatCategory, {
      count: number;
      preventionRate: number;
      responseTime: number;
    }>;
  };
  
  // Percentile rankings (0-100)
  rankings: {
    overall: number;
    prevention: number;
    detection: number;
    responseTime: number;
    aiEffectiveness: number;
  };
  
  // Peer comparison
  peerGroup: {
    totalDeployments: number;
    averageIncidents: number;
    topPerformers: number; // count in top 10%
    bottomPerformers: number; // count in bottom 10%
  };
  
  // Recommendations
  recommendations: {
    priority: 'critical' | 'high' | 'medium';
    area: string;
    currentScore: number;
    industryAverage: number;
    suggestion: string;
  }[];
}

/**
 * Global Threat Database Query
 */
export interface ThreatDatabaseQuery {
  // Filter criteria
  categories?: ThreatCategory[];
  industries?: IndustryVertical[];
  severities?: ThreatSeverity[];
  
  // Time range
  from?: Date;
  to?: Date;
  
  // Behavioral matching
  behavioralSignature?: Partial<ThreatPattern['behavioralSignature']>;
  
  // Similarity search
  similarToPatternId?: string;
  minSimilarityScore?: number; // 0-1
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Sorting
  sortBy?: 'relevance' | 'recency' | 'frequency' | 'severity';
}

/**
 * Pattern Match Result
 * When a local incident matches a known global pattern
 */
export interface PatternMatchResult {
  localIncidentId: string;
  matchedPatterns: {
    patternId: string;
    pattern: ThreatPattern;
    similarityScore: number; // 0-1
    matchedAttributes: string[];
    confidence: ThreatConfidence;
  }[];
  
  // Intelligence summary
  intelligence: {
    knownTactic: boolean;
    previousOccurrences: number;
    lastSeenGlobally: Date;
    affectedVerticals: IndustryVertical[];
    successRate: number; // % of times this tactic succeeded
    averageResponseTime: number;
  };
  
  // Recommendations
  recommendedActions: {
    action: string;
    priority: 'immediate' | 'high' | 'normal';
    rationale: string;
    basedOnPatternIds: string[];
  }[];
  
  // Related incidents
  relatedLocalIncidents?: string[]; // IDs of similar local incidents
}

/**
 * Network Participation Configuration
 */
export interface GuardianNetworkConfig {
  enabled: boolean;
  deploymentId: string; // anonymized
  
  // Privacy controls
  privacySettings: {
    shareIncidentPatterns: boolean;
    shareDetectionMethods: boolean;
    shareResponseMetrics: boolean;
    shareBenchmarkData: boolean;
    
    // Data retention
    retainPatternsDays: number;
    retainBenchmarksDays: number;
  };
  
  // Contribution settings
  contributionSettings: {
    autoShareVerifiedIncidents: boolean;
    requireManualReview: boolean;
    minimumConfidenceLevel: ThreatConfidence;
    excludedCategories?: ThreatCategory[];
  };
  
  // Intelligence consumption
  consumptionSettings: {
    autoApplyIntelligence: boolean;
    enableRealTimeUpdates: boolean;
    enablePatternMatching: boolean;
    enableBenchmarking: boolean;
    
    // Filtering
    relevantIndustries: IndustryVertical[];
    relevantCategories: ThreatCategory[];
    minimumThreatSeverity: ThreatSeverity;
  };
  
  // Network endpoints
  networkEndpoints: {
    threatIntelligenceHub: string;
    patternDatabase: string;
    benchmarkService: string;
    realtimeUpdates: string; // WebSocket
  };
  
  // Authentication
  authentication: {
    apiKey: string;
    certificatePath?: string;
  };
}

/**
 * Network Statistics
 */
export interface NetworkStatistics {
  // Your contribution
  contribution: {
    patternsShared: number;
    lastSharedAt?: Date;
    verifiedPatterns: number;
    usefulnessScore: number; // 0-1, based on how often your patterns match elsewhere
  };
  
  // Your benefit
  benefit: {
    patternsReceived: number;
    lastReceivedAt?: Date;
    localMatchCount: number; // how many times global patterns matched your incidents
    preventedIncidents: number; // estimated
    improvedResponseTime: number; // average seconds saved
  };
  
  // Network health
  network: {
    totalDeployments: number;
    activeDeployments: number;
    totalPatterns: number;
    recentPatterns: number; // last 30 days
    totalIndustries: number;
    globalIncidentCount: number;
  };
  
  // Sync status
  sync: {
    lastSyncAt: Date;
    syncStatus: 'healthy' | 'degraded' | 'offline';
    pendingUploads: number;
    pendingDownloads: number;
  };
}

/**
 * Industry Intelligence Report
 */
export interface IndustryIntelligenceReport {
  id: string;
  reportType: 'monthly' | 'quarterly' | 'tactical' | 'strategic';
  industryVertical: IndustryVertical;
  period: {
    startDate: Date;
    endDate: Date;
  };
  
  // Threat landscape
  threatLandscape: {
    emergingThreats: {
      category: ThreatCategory;
      count: number;
      trend: 'increasing' | 'stable' | 'decreasing';
      percentChange: number;
    }[];
    
    topTactics: {
      patternId: string;
      description: string;
      occurrences: number;
      successRate: number;
      averageImpact: 'critical' | 'high' | 'medium' | 'low';
    }[];
    
    geographicHotspots: {
      region: string;
      incidentCount: number;
      dominantCategories: ThreatCategory[];
    }[];
  };
  
  // Detection effectiveness
  effectiveness: {
    overallDetectionRate: number;
    averageResponseTime: number;
    preventionSuccessRate: number;
    
    byTechnology: {
      technology: string; // AI capability
      detectionRate: number;
      falsePositiveRate: number;
      adoptionRate: number; // % of deployments using it
    }[];
  };
  
  // Strategic insights
  insights: {
    keyFindings: string[];
    recommendations: string[];
    predictedTrends: string[];
  };
  
  // Case studies (anonymized)
  caseStudies: {
    title: string;
    category: ThreatCategory;
    description: string;
    outcome: string;
    lessonsLearned: string[];
  }[];
  
  generatedAt: Date;
}

/**
 * Real-time Threat Alert
 * Distributed when a new significant threat is detected
 */
export interface RealtimeThreatAlert {
  id: string;
  alertLevel: 'critical' | 'high' | 'medium';
  
  title: string;
  description: string;
  
  // Threat details
  threat: {
    category: ThreatCategory;
    patternId: string;
    firstSeenAt: Date;
    occurrenceCount: number;
    affectedDeployments: number;
    successRate: number;
  };
  
  // Geographic/industry scope
  scope: {
    industries: IndustryVertical[];
    regions: string[];
    locationTypes: string[];
  };
  
  // Indicators of compromise
  indicators: {
    behavioral: string[];
    technical: string[];
    temporal: string[];
  };
  
  // Recommended actions
  actions: {
    immediate: string[];
    shortTerm: string[];
    monitoring: string[];
  };
  
  // Detection guidance
  detectionGuidance: {
    capabilities: string[]; // AI capability IDs
    configurations: string[];
    alertRules: string[];
  };
  
  issuedAt: Date;
  expiresAt?: Date;
  
  // Acknowledgment tracking
  acknowledgmentRequired: boolean;
  acknowledgedBy?: string[];
}
