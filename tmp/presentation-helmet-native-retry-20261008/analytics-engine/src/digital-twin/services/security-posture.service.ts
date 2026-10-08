/**
 * Security Posture Service
 * 
 * Calculates aggregate security scores and generates security recommendations.
 */

import { Pool } from 'pg';
import { AssetRepository } from '../repositories.js';
import {
  SecurityPosture,
  SecurityRecommendation,
  SecurityTrend,
  calculateSecurityGrade,
  calculateAggregateSecurityScore,
  getAssetSecurityWeight,
  generateSecurityRecommendations,
  calculateCompliancePercentage,
  assessSecurityTrend,
  AssetType
} from '../models.js';

export class SecurityPostureService {
  private assetRepo: AssetRepository;

  constructor(private readonly pool: Pool) {
    this.assetRepo = new AssetRepository(pool);
  }

  /**
   * Get security posture for a scope (enterprise, region, branch, or specific asset)
   */
  async getSecurityPosture(scopeId: string): Promise<SecurityPosture> {
    const scopeAsset = await this.assetRepo.findById(scopeId);
    if (!scopeAsset) {
      throw new Error(`Asset ${scopeId} not found`);
    }

    // Get all descendant assets
    const descendants = scopeAsset.type === 'camera'
      ? [scopeAsset]
      : await this.assetRepo.findDescendants(scopeId);
    
    const allAssets = [scopeAsset, ...descendants];

    // Calculate aggregate security score
    const assetScores = allAssets.map(asset => ({
      score: asset.security.score,
      weight: getAssetSecurityWeight(asset.type)
    }));
    
    const aggregateScore = calculateAggregateSecurityScore(assetScores);
    const grade = calculateSecurityGrade(aggregateScore);

    // Count vulnerabilities by severity
    const vulnerabilities = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      total: 0
    };

    for (const asset of allAssets) {
      vulnerabilities.total += asset.security.vulnerabilities;
      
      // Infer severity based on security score
      if (asset.security.score < 40) {
        vulnerabilities.critical += asset.security.vulnerabilities;
      } else if (asset.security.score < 60) {
        vulnerabilities.high += asset.security.vulnerabilities;
      } else if (asset.security.score < 80) {
        vulnerabilities.medium += asset.security.vulnerabilities;
      } else {
        vulnerabilities.low += asset.security.vulnerabilities;
      }
    }

    // Categorize issues
    const issues = this.categorizeIssues(allAssets);

    // Check compliance
    const compliance = await this.checkCompliance(allAssets);

    // Find weakest assets
    const weakestAssets = allAssets
      .filter(a => a.security.score < 70)
      .sort((a, b) => a.security.score - b.security.score)
      .slice(0, 10)
      .map(asset => ({
        assetId: asset.id,
        assetName: asset.name,
        assetType: asset.type,
        score: asset.security.score,
        criticalVulnerabilities: asset.security.vulnerabilities
      }));

    // Get recent changes
    const recentChanges = await this.getRecentSecurityChanges(scopeId);

    // Build posture
    const posture: SecurityPosture = {
      scopeId,
      scopeName: scopeAsset.name,
      scopeType: this.mapScopeType(scopeAsset.type),
      score: aggregateScore,
      grade,
      vulnerabilities,
      issues,
      compliance,
      weakestAssets,
      recentChanges,
      recommendations: [],
      lastAssessed: new Date()
    };

    // Generate recommendations
    posture.recommendations = generateSecurityRecommendations(posture);

    return posture;
  }

  /**
   * Map asset type to scope type
   */
  private mapScopeType(
    assetType: AssetType
  ): 'enterprise' | 'region' | 'branch' | 'asset' {
    if (assetType === 'enterprise') return 'enterprise';
    if (assetType === 'region') return 'region';
    if (assetType === 'branch') return 'branch';
    return 'asset';
  }

  /**
   * Categorize security issues from assets
   */
  private categorizeIssues(assets: any[]): SecurityPosture['issues'] {
    const issues = {
      outdatedFirmware: 0,
      defaultCredentials: 0,
      exposedDevices: 0,
      insecureProtocols: 0,
      unreachableDevices: 0,
      misconfigurations: 0,
      expiredCertificates: 0
    };

    for (const asset of assets) {
      const details = asset.security.details || {};

      // Outdated firmware
      if (details.firmwareStatus === 'outdated' || details.firmwareStatus === 'critical') {
        issues.outdatedFirmware++;
      }

      // Default credentials
      if (details.defaultCredentials === true) {
        issues.defaultCredentials++;
      }

      // Exposed devices (no encryption/TLS)
      if (details.tlsEnabled === false || details.encryptionEnabled === false) {
        issues.exposedDevices++;
      }

      // Insecure protocols
      if (asset.metadata?.protocol === 'http' || asset.metadata?.protocol === 'rtsp') {
        issues.insecureProtocols++;
      }

      // Unreachable devices
      if (asset.status === 'offline' || asset.status === 'unknown') {
        issues.unreachableDevices++;
      }

      // Configuration issues
      issues.misconfigurations += asset.security.configurationIssues || 0;

      // Expired certificates (check last rotation)
      if (details.lastCredentialRotation) {
        const daysSinceRotation =
          (Date.now() - new Date(details.lastCredentialRotation).getTime()) / 
          (1000 * 60 * 60 * 24);
        
        if (daysSinceRotation > 365) {
          issues.expiredCertificates++;
        }
      }
    }

    return issues;
  }

  /**
   * Check compliance status
   */
  private async checkCompliance(assets: any[]): Promise<SecurityPosture['compliance']> {
    const totalRequirements = 10; // Base compliance requirements
    let requirementsMet = 0;
    const failedChecks: string[] = [];

    // Check encryption requirement
    const encryptedCount = assets.filter(a => 
      a.security.details?.encryptionEnabled !== false
    ).length;
    
    if (encryptedCount / assets.length >= 0.9) {
      requirementsMet++;
    } else {
      failedChecks.push('Less than 90% of devices use encryption');
    }

    // Check firmware currency
    const currentFirmwareCount = assets.filter(a =>
      a.security.details?.firmwareStatus === 'current'
    ).length;
    
    if (currentFirmwareCount / assets.length >= 0.8) {
      requirementsMet++;
    } else {
      failedChecks.push('Less than 80% of devices have current firmware');
    }

    // Check credential rotation
    const rotatedCount = assets.filter(a => {
      if (!a.security.details?.lastCredentialRotation) return false;
      const days = (Date.now() - new Date(a.security.details.lastCredentialRotation).getTime()) / (1000 * 60 * 60 * 24);
      return days < 180;
    }).length;
    
    if (rotatedCount / assets.length >= 0.7) {
      requirementsMet++;
    } else {
      failedChecks.push('Less than 70% of credentials rotated in last 6 months');
    }

    // Check TLS/HTTPS usage
    const tlsCount = assets.filter(a =>
      a.security.details?.tlsEnabled === true
    ).length;
    
    if (tlsCount / assets.length >= 0.8) {
      requirementsMet++;
    } else {
      failedChecks.push('Less than 80% of devices use TLS/HTTPS');
    }

    // Check default credentials
    const noDefaultCredsCount = assets.filter(a =>
      a.security.details?.defaultCredentials !== true
    ).length;
    
    if (noDefaultCredsCount === assets.length) {
      requirementsMet++;
    } else {
      failedChecks.push('Some devices still use default credentials');
    }

    // Check device reachability
    const reachableCount = assets.filter(a =>
      a.status !== 'offline' && a.status !== 'unknown'
    ).length;
    
    if (reachableCount / assets.length >= 0.95) {
      requirementsMet++;
    } else {
      failedChecks.push('Less than 95% of devices are reachable');
    }

    // Check vulnerability count
    const totalVulnerabilities = assets.reduce((sum, a) => 
      sum + (a.security.vulnerabilities || 0), 0
    );
    
    if (totalVulnerabilities < assets.length * 0.1) {
      requirementsMet++;
    } else {
      failedChecks.push('Average vulnerability count exceeds threshold');
    }

    // Check configuration issues
    const totalConfigIssues = assets.reduce((sum, a) =>
      sum + (a.security.configurationIssues || 0), 0
    );
    
    if (totalConfigIssues < assets.length * 0.2) {
      requirementsMet++;
    } else {
      failedChecks.push('Configuration issues exceed acceptable threshold');
    }

    // Check critical asset security
    const criticalAssets = assets.filter(a => a.criticality === 'critical');
    const secureCriticalCount = criticalAssets.filter(a =>
      a.security.score >= 80
    ).length;
    
    if (criticalAssets.length === 0 || secureCriticalCount === criticalAssets.length) {
      requirementsMet++;
    } else {
      failedChecks.push('Not all critical assets meet security standards');
    }

    // Check audit trail
    const auditedCount = assets.filter(a =>
      a.security.lastAudit && 
      (Date.now() - new Date(a.security.lastAudit).getTime()) < 90 * 24 * 60 * 60 * 1000
    ).length;
    
    if (auditedCount / assets.length >= 0.5) {
      requirementsMet++;
    } else {
      failedChecks.push('Less than 50% of devices audited in last 90 days');
    }

    return {
      compliant: failedChecks.length === 0,
      requirementsMet,
      totalRequirements,
      failedChecks
    };
  }

  /**
   * Get recent security changes
   */
  private async getRecentSecurityChanges(
    scopeId: string
  ): Promise<SecurityPosture['recentChanges']> {
    const result = await this.pool.query(
      `
      SELECT
        event_type,
        timestamp,
        metadata
      FROM twin_events
      WHERE asset_id = $1
        AND event_type IN ('security_changed', 'asset_updated')
        AND timestamp > NOW() - INTERVAL '30 days'
      ORDER BY timestamp DESC
      LIMIT 10
      `,
      [scopeId]
    );

    return result.rows.map(row => ({
      timestamp: new Date(row.timestamp),
      type: row.metadata?.securityImproved ? 'improvement' : 'degradation',
      description: row.metadata?.description || 'Security status changed',
      scoreImpact: row.metadata?.scoreImpact || 0
    }));
  }

  /**
   * Get security trend over time
   */
  async getSecurityTrend(
    scopeId: string,
    days: number = 30
  ): Promise<SecurityTrend> {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const result = await this.pool.query(
      `
      SELECT
        timestamp,
        security_score,
        metadata
      FROM twin_state_history
      WHERE asset_id = $1
        AND timestamp >= $2
      ORDER BY timestamp ASC
      `,
      [scopeId, from]
    );

    const dataPoints = result.rows.map(row => ({
      timestamp: new Date(row.timestamp),
      score: row.security_score,
      vulnerabilities: row.metadata?.vulnerabilities || 0,
      issues: row.metadata?.issues || 0
    }));

    return {
      scopeId,
      dataPoints
    };
  }
}
