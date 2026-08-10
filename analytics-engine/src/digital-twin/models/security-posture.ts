/**
 * Digital Twin Security Posture Models
 * 
 * Aggregate security state and vulnerability analysis.
 */

import { AssetType } from './asset';

/**
 * Security posture for a scope (enterprise, region, branch, or asset)
 */
export interface SecurityPosture {
  scopeId: string;
  scopeName: string;
  scopeType: 'enterprise' | 'region' | 'branch' | 'asset';
  
  // Overall security score (0-100)
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  
  // Vulnerability counts
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  
  // Issue categories
  issues: {
    outdatedFirmware: number;
    defaultCredentials: number;
    exposedDevices: number;
    insecureProtocols: number;
    unreachableDevices: number;
    misconfigurations: number;
    expiredCertificates: number;
  };
  
  // Compliance status
  compliance: {
    compliant: boolean;
    requirementsMet: number;
    totalRequirements: number;
    failedChecks: string[];
  };
  
  // Weakest assets
  weakestAssets: Array<{
    assetId: string;
    assetName: string;
    assetType: AssetType;
    score: number;
    criticalVulnerabilities: number;
  }>;
  
  // Recent changes
  recentChanges: Array<{
    timestamp: Date;
    type: 'improvement' | 'degradation';
    description: string;
    scoreImpact: number;
  }>;
  
  // Recommendations
  recommendations: SecurityRecommendation[];
  
  // Timestamp
  lastAssessed: Date;
}

/**
 * Security recommendation
 */
export interface SecurityRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  affectedAssets: number;
  estimatedImpact: number; // Score improvement
  effort: 'low' | 'medium' | 'high';
  actionItems: string[];
}

/**
 * Security vulnerability
 */
export interface SecurityVulnerability {
  id: string;
  assetId: string;
  
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  
  title: string;
  description: string;
  
  cvssScore?: number;
  cveId?: string;
  
  detectedAt: Date;
  resolvedAt?: Date;
  
  remediation?: string;
  estimatedEffort?: string;
}

/**
 * Security trend data
 */
export interface SecurityTrend {
  scopeId: string;
  dataPoints: Array<{
    timestamp: Date;
    score: number;
    vulnerabilities: number;
    issues: number;
  }>;
}

/**
 * Calculate security grade from score
 */
export function calculateSecurityGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Calculate aggregate security score from child assets
 */
export function calculateAggregateSecurityScore(
  assetScores: Array<{ score: number; weight: number }>
): number {
  if (assetScores.length === 0) return 100;
  
  const totalWeight = assetScores.reduce((sum, a) => sum + a.weight, 0);
  if (totalWeight === 0) return 100;
  
  const weightedSum = assetScores.reduce(
    (sum, a) => sum + a.score * a.weight,
    0
  );
  
  return Math.round(weightedSum / totalWeight);
}

/**
 * Get asset importance weight for security calculations
 */
export function getAssetSecurityWeight(assetType: AssetType): number {
  const weights: Record<AssetType, number> = {
    camera: 1,
    nvr: 3,
    dvr: 3,
    recorder: 3,
    storage: 4,
    switch: 3,
    gateway: 5,
    network: 2,
    vlan: 1,
    server: 4,
    branch: 1,
    region: 1,
    enterprise: 1
  };
  
  return weights[assetType] || 1;
}

/**
 * Generate security recommendations based on posture
 */
export function generateSecurityRecommendations(
  posture: SecurityPosture
): SecurityRecommendation[] {
  const recommendations: SecurityRecommendation[] = [];
  
  const { issues, vulnerabilities } = posture;
  
  // Critical vulnerabilities
  if (vulnerabilities.critical > 0) {
    recommendations.push({
      priority: 'critical',
      category: 'Vulnerabilities',
      title: 'Address Critical Security Vulnerabilities',
      description: `${vulnerabilities.critical} critical vulnerabilities detected that require immediate attention.`,
      affectedAssets: vulnerabilities.critical,
      estimatedImpact: 15,
      effort: 'high',
      actionItems: [
        'Review and prioritize critical vulnerabilities',
        'Apply security patches immediately',
        'Isolate affected systems if patches unavailable',
        'Verify fixes and re-scan'
      ]
    });
  }
  
  // Outdated firmware
  if (issues.outdatedFirmware > 5) {
    recommendations.push({
      priority: 'high',
      category: 'Firmware',
      title: 'Update Outdated Firmware',
      description: `${issues.outdatedFirmware} devices running outdated firmware versions.`,
      affectedAssets: issues.outdatedFirmware,
      estimatedImpact: 10,
      effort: 'medium',
      actionItems: [
        'Inventory all devices with outdated firmware',
        'Test firmware updates in staging environment',
        'Schedule maintenance window for updates',
        'Update firmware on all affected devices'
      ]
    });
  }
  
  // Default credentials
  if (issues.defaultCredentials > 0) {
    recommendations.push({
      priority: 'critical',
      category: 'Authentication',
      title: 'Change Default Credentials',
      description: `${issues.defaultCredentials} devices still using default credentials.`,
      affectedAssets: issues.defaultCredentials,
      estimatedImpact: 20,
      effort: 'low',
      actionItems: [
        'Identify all devices with default credentials',
        'Generate strong unique passwords',
        'Update credentials on all affected devices',
        'Implement password rotation policy'
      ]
    });
  }
  
  // Exposed devices
  if (issues.exposedDevices > 0) {
    recommendations.push({
      priority: 'high',
      category: 'Network Security',
      title: 'Secure Exposed Devices',
      description: `${issues.exposedDevices} devices exposed to untrusted networks.`,
      affectedAssets: issues.exposedDevices,
      estimatedImpact: 12,
      effort: 'medium',
      actionItems: [
        'Review network segmentation',
        'Move devices to secure VLANs',
        'Configure firewall rules',
        'Enable network access control'
      ]
    });
  }
  
  // Insecure protocols
  if (issues.insecureProtocols > 0) {
    recommendations.push({
      priority: 'medium',
      category: 'Encryption',
      title: 'Enable Secure Protocols',
      description: `${issues.insecureProtocols} devices using insecure communication protocols.`,
      affectedAssets: issues.insecureProtocols,
      estimatedImpact: 8,
      effort: 'medium',
      actionItems: [
        'Disable HTTP, enable HTTPS',
        'Enable TLS for RTSP streams',
        'Configure ONVIF with authentication',
        'Disable legacy protocols (Telnet, FTP)'
      ]
    });
  }
  
  // Unreachable devices
  if (issues.unreachableDevices > 3) {
    recommendations.push({
      priority: 'medium',
      category: 'Monitoring',
      title: 'Investigate Unreachable Devices',
      description: `${issues.unreachableDevices} devices unreachable for security assessment.`,
      affectedAssets: issues.unreachableDevices,
      estimatedImpact: 5,
      effort: 'low',
      actionItems: [
        'Check network connectivity',
        'Verify device power and status',
        'Review firewall rules blocking access',
        'Update device inventory'
      ]
    });
  }
  
  // Expired certificates
  if (issues.expiredCertificates > 0) {
    recommendations.push({
      priority: 'high',
      category: 'Certificates',
      title: 'Renew Expired Certificates',
      description: `${issues.expiredCertificates} devices with expired SSL/TLS certificates.`,
      affectedAssets: issues.expiredCertificates,
      estimatedImpact: 7,
      effort: 'low',
      actionItems: [
        'Identify devices with expired certificates',
        'Generate or obtain new certificates',
        'Install renewed certificates',
        'Configure automatic renewal'
      ]
    });
  }
  
  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return recommendations;
}

/**
 * Calculate compliance percentage
 */
export function calculateCompliancePercentage(
  requirementsMet: number,
  totalRequirements: number
): number {
  if (totalRequirements === 0) return 100;
  return Math.round((requirementsMet / totalRequirements) * 100);
}

/**
 * Assess security posture trend
 */
export function assessSecurityTrend(
  trend: SecurityTrend
): 'improving' | 'stable' | 'degrading' {
  if (trend.dataPoints.length < 2) return 'stable';
  
  const recent = trend.dataPoints.slice(-5);
  const scores = recent.map(d => d.score);
  
  // Calculate trend using linear regression
  const n = scores.length;
  const xSum = (n * (n - 1)) / 2;
  const ySum = scores.reduce((sum, score) => sum + score, 0);
  const xySum = scores.reduce((sum, score, i) => sum + i * score, 0);
  const xSquareSum = (n * (n - 1) * (2 * n - 1)) / 6;
  
  const slope = (n * xySum - xSum * ySum) / (n * xSquareSum - xSum * xSum);
  
  if (slope > 1) return 'improving';
  if (slope < -1) return 'degrading';
  return 'stable';
}
