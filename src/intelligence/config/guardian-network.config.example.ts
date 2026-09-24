/**
 * Guardian Network Configuration Template
 * 
 * Copy this file to guardian-network.config.ts and customize for your deployment.
 */

import type { GuardianNetworkConfig } from '../guardian-network.types';

/**
 * Production Configuration
 */
export const productionConfig: GuardianNetworkConfig = {
  enabled: true,
  deploymentId: process.env.GUARDIAN_NETWORK_DEPLOYMENT_ID || 'auto-generated',
  
  // Privacy Settings
  privacySettings: {
    // Share anonymized incident patterns with the network
    shareIncidentPatterns: true,
    
    // Share detection methods used (helps others improve)
    shareDetectionMethods: true,
    
    // Share response metrics (response time, prevention success)
    shareResponseMetrics: true,
    
    // Share benchmark data for peer comparison
    shareBenchmarkData: true,
    
    // Data retention (days)
    retainPatternsDays: 365,
    retainBenchmarksDays: 90,
  },
  
  // Contribution Settings
  contributionSettings: {
    // Automatically share verified incidents
    autoShareVerifiedIncidents: true,
    
    // Require manual review before sharing (set to true for extra caution)
    requireManualReview: false,
    
    // Only share high-confidence incidents
    minimumConfidenceLevel: 'probable', // confirmed, probable, possible, suspected
    
    // Optionally exclude certain threat categories from sharing
    excludedCategories: [],
    // Example: ['insider-threat', 'social-engineering']
  },
  
  // Consumption Settings
  consumptionSettings: {
    // Automatically apply intelligence to local system
    autoApplyIntelligence: true,
    
    // Enable real-time threat alerts via WebSocket
    enableRealTimeUpdates: true,
    
    // Enable automatic pattern matching for new incidents
    enablePatternMatching: true,
    
    // Enable benchmark comparison
    enableBenchmarking: true,
    
    // Industries relevant to your deployment
    relevantIndustries: ['banking', 'retail'],
    
    // Threat categories you want to monitor
    relevantCategories: [
      'theft',
      'fraud',
      'intrusion',
      'violence',
      'vandalism',
      'unauthorized-access',
    ],
    
    // Minimum threat severity to receive (filters low-priority alerts)
    minimumThreatSeverity: 'medium', // critical, high, medium, low
  },
  
  // Network Endpoints
  networkEndpoints: {
    threatIntelligenceHub: process.env.GUARDIAN_NETWORK_INTELLIGENCE_HUB || 
      'https://guardian-network.omsystems.ai/intelligence',
    
    patternDatabase: process.env.GUARDIAN_NETWORK_PATTERN_DB || 
      'https://guardian-network.omsystems.ai/patterns',
    
    benchmarkService: process.env.GUARDIAN_NETWORK_BENCHMARKS || 
      'https://guardian-network.omsystems.ai/benchmarks',
    
    realtimeUpdates: process.env.GUARDIAN_NETWORK_WEBSOCKET || 
      'wss://guardian-network.omsystems.ai/realtime',
  },
  
  // Authentication
  authentication: {
    apiKey: process.env.GUARDIAN_NETWORK_API_KEY!,
    certificatePath: process.env.GUARDIAN_NETWORK_CERT_PATH,
  },
};

/**
 * Development Configuration
 * Uses local/staging endpoints for testing
 */
export const developmentConfig: GuardianNetworkConfig = {
  ...productionConfig,
  
  // Use staging endpoints
  networkEndpoints: {
    threatIntelligenceHub: 'https://guardian-network-staging.omsystems.ai/intelligence',
    patternDatabase: 'https://guardian-network-staging.omsystems.ai/patterns',
    benchmarkService: 'https://guardian-network-staging.omsystems.ai/benchmarks',
    realtimeUpdates: 'wss://guardian-network-staging.omsystems.ai/realtime',
  },
  
  // More conservative sharing in development
  contributionSettings: {
    ...productionConfig.contributionSettings,
    requireManualReview: true,
    minimumConfidenceLevel: 'confirmed',
  },
};

/**
 * Banking-Specific Configuration
 * Optimized for banking/financial institutions
 */
export const bankingConfig: GuardianNetworkConfig = {
  ...productionConfig,
  
  consumptionSettings: {
    ...productionConfig.consumptionSettings,
    relevantIndustries: ['banking'],
    relevantCategories: [
      'fraud',
      'theft',
      'intrusion',
      'unauthorized-access',
      'cyber-physical',
    ],
    minimumThreatSeverity: 'medium',
  },
  
  contributionSettings: {
    ...productionConfig.contributionSettings,
    // Banks may want manual review for compliance
    requireManualReview: true,
    minimumConfidenceLevel: 'confirmed',
  },
};

/**
 * Retail-Specific Configuration
 * Optimized for retail/commercial environments
 */
export const retailConfig: GuardianNetworkConfig = {
  ...productionConfig,
  
  consumptionSettings: {
    ...productionConfig.consumptionSettings,
    relevantIndustries: ['retail'],
    relevantCategories: [
      'theft',
      'fraud',
      'violence',
      'vandalism',
      'organized-crime',
    ],
    minimumThreatSeverity: 'medium',
  },
  
  contributionSettings: {
    ...productionConfig.contributionSettings,
    autoShareVerifiedIncidents: true,
    requireManualReview: false,
    minimumConfidenceLevel: 'probable',
  },
};

/**
 * Industrial-Specific Configuration
 * Optimized for manufacturing/industrial facilities
 */
export const industrialConfig: GuardianNetworkConfig = {
  ...productionConfig,
  
  consumptionSettings: {
    ...productionConfig.consumptionSettings,
    relevantIndustries: ['industrial'],
    relevantCategories: [
      'intrusion',
      'unauthorized-access',
      'theft',
      'vandalism',
      'cyber-physical',
    ],
    minimumThreatSeverity: 'high',
  },
};

/**
 * Privacy-First Configuration
 * Maximum privacy, minimal sharing
 */
export const privacyFirstConfig: GuardianNetworkConfig = {
  ...productionConfig,
  
  privacySettings: {
    shareIncidentPatterns: false, // Don't share anything
    shareDetectionMethods: false,
    shareResponseMetrics: false,
    shareBenchmarkData: false,
    retainPatternsDays: 90, // Shorter retention
    retainBenchmarksDays: 30,
  },
  
  contributionSettings: {
    autoShareVerifiedIncidents: false,
    requireManualReview: true,
    minimumConfidenceLevel: 'confirmed',
    excludedCategories: [], // Review each category manually
  },
  
  consumptionSettings: {
    ...productionConfig.consumptionSettings,
    // Only consume, don't contribute
    autoApplyIntelligence: false, // Manual review required
    enableRealTimeUpdates: true, // Still receive alerts
    enablePatternMatching: true, // Still match patterns
    enableBenchmarking: false, // Don't share benchmark data
  },
};

/**
 * High-Security Configuration
 * For highly sensitive environments
 */
export const highSecurityConfig: GuardianNetworkConfig = {
  ...productionConfig,
  
  privacySettings: {
    shareIncidentPatterns: true,
    shareDetectionMethods: true,
    shareResponseMetrics: true,
    shareBenchmarkData: true,
    retainPatternsDays: 180, // Shorter retention for compliance
    retainBenchmarksDays: 60,
  },
  
  contributionSettings: {
    autoShareVerifiedIncidents: false, // Always require manual approval
    requireManualReview: true,
    minimumConfidenceLevel: 'confirmed', // Only share confirmed incidents
    excludedCategories: ['insider-threat'], // Don't share internal threats
  },
  
  consumptionSettings: {
    ...productionConfig.consumptionSettings,
    autoApplyIntelligence: false, // Manual review of all intelligence
    enableRealTimeUpdates: true,
    enablePatternMatching: true,
    enableBenchmarking: true,
    minimumThreatSeverity: 'high', // Only critical and high threats
  },
};

/**
 * Get configuration based on environment
 */
export function getGuardianNetworkConfig(): GuardianNetworkConfig {
  const env = process.env.NODE_ENV || 'development';
  const industryVertical = process.env.INDUSTRY_VERTICAL;
  const securityProfile = process.env.GUARDIAN_NETWORK_SECURITY_PROFILE;
  
  // Override based on security profile
  if (securityProfile === 'privacy-first') {
    return privacyFirstConfig;
  }
  
  if (securityProfile === 'high-security') {
    return highSecurityConfig;
  }
  
  // Override based on industry
  if (industryVertical === 'banking') {
    return bankingConfig;
  }
  
  if (industryVertical === 'retail') {
    return retailConfig;
  }
  
  if (industryVertical === 'industrial') {
    return industrialConfig;
  }
  
  // Default based on environment
  if (env === 'production') {
    return productionConfig;
  }
  
  return developmentConfig;
}

/**
 * Validate configuration
 */
export function validateGuardianNetworkConfig(config: GuardianNetworkConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check required fields
  if (!config.deploymentId) {
    errors.push('deploymentId is required');
  }
  
  if (!config.authentication.apiKey) {
    errors.push('authentication.apiKey is required');
  }
  
  // Check endpoint URLs
  const endpoints = [
    config.networkEndpoints.threatIntelligenceHub,
    config.networkEndpoints.patternDatabase,
    config.networkEndpoints.benchmarkService,
    config.networkEndpoints.realtimeUpdates,
  ];
  
  for (const endpoint of endpoints) {
    if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://') && !endpoint.startsWith('wss://')) {
      errors.push(`Invalid endpoint URL: ${endpoint}`);
    }
  }
  
  // Check industries
  if (config.consumptionSettings.relevantIndustries.length === 0) {
    errors.push('At least one relevant industry must be specified');
  }
  
  // Check categories
  if (config.consumptionSettings.relevantCategories.length === 0) {
    errors.push('At least one relevant threat category must be specified');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
