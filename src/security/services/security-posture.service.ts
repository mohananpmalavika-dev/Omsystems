/**
 * Security Posture Service
 * Overall security scoring and risk assessment
 */

import { ISecurityPostureService, IssueFilters } from '../interfaces.js';
import { SecurityPosture, SecurityCategory, SecurityIssue, SecurityMetricWithEvidence, ComplianceStatus, ComplianceFramework } from '../types.js';
import { getDatabase } from '../../config/database.js';
import { EventEmitter } from 'events';

export class SecurityPostureService extends EventEmitter implements ISecurityPostureService {
  
  /**
   * Calculate overall security posture
   */
  async calculatePosture(): Promise<SecurityPosture> {
    const categories = await Promise.all([
      this.scoreCertificates(),
      this.scoreAuthentication(),
      this.scoreEncryption(),
      this.scoreAccessControl(),
      this.scoreThreatDetection(),
      this.scoreCompliance(),
      this.scoreSecrets()
    ]);

    const overallScore = this.calculateWeightedScore(categories);
    const issues = await this.listIssues({ resolved: false });
    const provenance = this.determineProvenance(categories);

    const posture: SecurityPosture = {
      overallScore,
      timestamp: new Date(),
      categories,
      criticalIssues: issues.filter(i => i.severity === 'critical').length,
      highIssues: issues.filter(i => i.severity === 'high').length,
      mediumIssues: issues.filter(i => i.severity === 'medium').length,
      lowIssues: issues.filter(i => i.severity === 'low').length,
      trends: await this.calculateTrends(),
      recommendations: await this.getRecommendations(),
      provenance
    };

    const db = getDatabase();
    await db.collection('security_posture_history').insertOne(posture);

    this.emit('posture:calculated', { score: overallScore });

    return posture;
  }

  /**
   * Get current posture
   */
  async getPosture(): Promise<SecurityPosture> {
    const db = getDatabase();
    
    const posture = await db.collection('security_posture_history')
      .findOne({}, { sort: { timestamp: -1 } });
    
    if (!posture) {
      return await this.calculatePosture();
    }
    
    return posture;
  }

  /**
   * Get posture history
   */
  async getPostureHistory(days: number): Promise<SecurityPosture[]> {
    const db = getDatabase();
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return await db.collection('security_posture_history')
      .find({ timestamp: { $gte: startDate } })
      .sort({ timestamp: 1 })
      .toArray();
  }

  /**
   * Score certificates category
   */
  async scoreCertificates(): Promise<SecurityCategory> {
    const db = getDatabase();
    
    const total = await db.collection('certificates').countDocuments();
    const expired = await db.collection('certificates').countDocuments({ status: 'expired' });
    const expiringSoon = await db.collection('certificates').countDocuments({ status: 'expiring_soon' });
    
    const score = total > 0 ? Math.max(0, 100 - (expired * 20) - (expiringSoon * 5)) : 0;
    const provenance = total > 0 ? 'LIVE' : 'UNAVAILABLE';

    return {
      name: 'Certificate Management',
      score,
      weight: 15,
      metrics: [
        this.createMetric('Total Certificates', total, 0, 'count', total > 0 ? 'good' : 'unavailable', provenance),
        this.createMetric('Expired', expired, 0, 'count', expired > 0 ? 'critical' : total > 0 ? 'good' : 'unavailable', provenance),
        this.createMetric('Expiring Soon', expiringSoon, 0, 'count', expiringSoon > 3 ? 'warning' : total > 0 ? 'good' : 'unavailable', provenance)
      ],
      issues: []
    };
  }

  /**
   * Score authentication category
   */
  async scoreAuthentication(): Promise<SecurityCategory> {
    const db = getDatabase();
    
    const totalUsers = await db.collection('users').countDocuments();
    const mfaEnabled = await db.collection('users').countDocuments({ mfaEnabled: true });
    
    const score = totalUsers > 0 ? (mfaEnabled / totalUsers) * 100 : 0;
    const provenance = totalUsers > 0 ? 'LIVE' : 'UNAVAILABLE';

    return {
      name: 'Authentication & Access Control',
      score,
      weight: 20,
      metrics: [
        this.createMetric('Users with MFA', mfaEnabled, totalUsers, 'users', totalUsers > 0 ? (score > 80 ? 'good' : 'warning') : 'unavailable', provenance),
        this.createMetric('MFA Coverage', Math.round(score), 100, '%', totalUsers > 0 ? (score > 80 ? 'good' : 'warning') : 'unavailable', provenance)
      ],
      issues: []
    };
  }

  /**
   * Score encryption category
   */
  async scoreEncryption(): Promise<SecurityCategory> {
    const db = getDatabase();
    
    const totalVideos = await db.collection('videos').countDocuments();
    const encryptedVideos = await db.collection('encrypted_videos').countDocuments();
    
    const score = totalVideos > 0 ? (encryptedVideos / totalVideos) * 100 : 0;
    const provenance = totalVideos > 0 ? 'LIVE' : 'UNAVAILABLE';

    return {
      name: 'Data Encryption',
      score,
      weight: 20,
      metrics: [
        this.createMetric('Encrypted Videos', encryptedVideos, totalVideos, 'videos', totalVideos > 0 ? (score > 90 ? 'good' : 'warning') : 'unavailable', provenance),
        this.createMetric('Encryption Coverage', Math.round(score), 100, '%', totalVideos > 0 ? (score > 90 ? 'good' : 'warning') : 'unavailable', provenance)
      ],
      issues: []
    };
  }

  /**
   * Score access control category
   */
  async scoreAccessControl(): Promise<SecurityCategory> {
    const db = getDatabase();
    
    const policies = await db.collection('zero_trust_policies').countDocuments({ enabled: true });
    const score = Math.min(100, policies * 10);
    const provenance = policies > 0 ? 'LIVE' : 'UNAVAILABLE';

    return {
      name: 'Access Control',
      score,
      weight: 15,
      metrics: [
        this.createMetric('Active Policies', policies, 10, 'policies', policies > 0 ? (policies >= 5 ? 'good' : 'warning') : 'unavailable', provenance)
      ],
      issues: []
    };
  }

  /**
   * Score threat detection category
   */
  async scoreThreatDetection(): Promise<SecurityCategory> {
    const db = getDatabase();
    
    const activeThreats = await db.collection('ransomware_threats').countDocuments({ resolved: false });
    const totalThreatRecords = await db.collection('ransomware_threats').countDocuments();
    const score = totalThreatRecords > 0 ? Math.max(0, 100 - (activeThreats * 10)) : 0;
    const provenance = totalThreatRecords > 0 ? 'LIVE' : 'UNAVAILABLE';

    return {
      name: 'Threat Detection',
      score,
      weight: 20,
      metrics: [
        this.createMetric(
          'Active Threats',
          activeThreats,
          0,
          'threats',
          totalThreatRecords > 0 ? (activeThreats === 0 ? 'good' : 'critical') : 'unavailable',
          provenance
        )
      ],
      issues: []
    };
  }

  /**
   * Score compliance category
   */
  async scoreCompliance(): Promise<SecurityCategory> {
    const db = getDatabase();
    const controls = await db.collection('compliance_controls').find().toArray();
    const totalControls = controls.length;
    const compliantControls = controls.filter(c => c.compliant).length;
    const score = totalControls > 0 ? Math.round((compliantControls / totalControls) * 100) : 0;
    const provenance = totalControls > 0 ? 'LIVE' : 'UNAVAILABLE';

    return {
      name: 'Compliance',
      score,
      weight: 10,
      metrics: [
        this.createMetric('Compliance Score', score, 100, '%', totalControls > 0 ? (score >= 80 ? 'good' : 'warning') : 'unavailable', provenance)
      ],
      issues: []
    };
  }

  /**
   * Score secrets / secret-vault category
   */
  async scoreSecrets(): Promise<SecurityCategory> {
    // Import factory lazily to avoid circular initialization issues
    const { SecurityServicesFactory } = await import('./index.js');
    const factory = SecurityServicesFactory.getInstance();

    // If secret vault is not configured, return a placeholder indicating unavailability
    if (!factory.secretVault) {
      return {
        name: 'Secret Vault',
        score: 0,
        weight: 10,
        metrics: [
          this.createMetric('Rotation Compliance', null, 100, '%', 'unavailable', 'UNAVAILABLE'),
          this.createMetric('Secrets Expiring Soon', null, 0, 'count', 'unavailable', 'UNAVAILABLE')
        ],
        issues: []
      };
    }

    try {
      const all = await factory.secretVault.listSecrets();
      const expiring = await factory.secretVault.listSecrets({ expiringSoon: true });
      const needsRotation = await factory.secretVault.listSecrets({ needsRotation: true });

      const total = all.length;
      const expiringCount = expiring.length;
      const needsRotationCount = needsRotation.length;

      // Compute rotation compliance: percent of secrets that have rotationPolicy.enabled and have been rotated recently
      const rotationCandidates = all.filter(s => s.rotationPolicy && s.rotationPolicy.enabled);
      let compliantCount = 0;
      for (const s of rotationCandidates) {
        if (!s.lastRotatedAt) continue;
        // If lastRotatedAt within intervalDays consider compliant
        const intervalDays = (s.rotationPolicy?.intervalDays) ?? 90;
        const last = new Date(s.lastRotatedAt);
        const ageMs = Date.now() - last.getTime();
        if (ageMs <= intervalDays * 24 * 60 * 60 * 1000) compliantCount++;
      }

      const rotationCompliance = rotationCandidates.length > 0 ? Math.round((compliantCount / rotationCandidates.length) * 100) : 100;

      const score = Math.round(rotationCompliance * 0.8 + (total > 0 ? Math.max(0, 100 - (expiringCount * 5)) * 0.2 : 100 * 0.2));
      const provenance = total > 0 ? 'LIVE' : 'UNAVAILABLE';

      return {
        name: 'Secret Vault',
        score,
        weight: 10,
        metrics: [
          this.createMetric('Rotation Compliance', rotationCompliance, 100, '%', rotationCompliance >= 80 ? 'good' : 'warning', provenance),
          this.createMetric('Secrets Expiring Soon', expiringCount, 0, 'count', expiringCount > 0 ? 'warning' : 'good', provenance)
        ],
        issues: []
      };
    } catch (error) {
      return {
        name: 'Secret Vault',
        score: 0,
        weight: 10,
        metrics: [
          this.createMetric('Rotation Compliance', null, 100, '%', 'unavailable', 'UNAVAILABLE'),
          this.createMetric('Secrets Expiring Soon', null, 0, 'count', 'unavailable', 'UNAVAILABLE')
        ],
        issues: []
      };
    }
  }

  /**
   * List security issues
   */
  async listIssues(filters: IssueFilters = {}): Promise<SecurityIssue[]> {
    const db = getDatabase();
    
    const query: any = {};
    
    if (filters.category) {
      query.category = filters.category;
    }
    
    if (filters.severity) {
      query.severity = filters.severity;
    }
    
    if (filters.resolved !== undefined) {
      query.resolvedAt = filters.resolved ? { $exists: true } : { $exists: false };
    }
    
    return await db.collection('security_issues')
      .find(query)
      .sort({ severity: 1, detectedAt: -1 })
      .toArray();
  }

  /**
   * Resolve issue
   */
  async resolveIssue(issueId: string, userId: string): Promise<void> {
    const db = getDatabase();
    
    await db.collection('security_issues').updateOne(
      { id: issueId },
      {
        $set: {
          resolvedAt: new Date(),
          resolvedBy: userId
        }
      }
    );

    this.emit('issue:resolved', { issueId });
  }

  /**
   * Mark issue as false positive
   */
  async markFalsePositive(issueId: string, userId: string): Promise<void> {
    const db = getDatabase();
    
    await db.collection('security_issues').updateOne(
      { id: issueId },
      {
        $set: {
          falsePositive: true,
          resolvedAt: new Date(),
          resolvedBy: userId
        }
      }
    );

    this.emit('issue:false-positive', { issueId });
  }

  /**
   * Get security recommendations
   */
  async getRecommendations(): Promise<any[]> {
    return [
      {
        priority: 1,
        category: 'Certificates',
        title: 'Renew expiring certificates',
        description: 'Several certificates will expire within 30 days',
        impact: 'Service disruption, security warnings',
        effort: 'low',
        resourceLinks: ['/docs/certificate-renewal']
      },
      {
        priority: 2,
        category: 'Authentication',
        title: 'Enable MFA for all users',
        description: 'Multi-factor authentication is not enabled for all users',
        impact: 'Increased account security',
        effort: 'medium',
        resourceLinks: ['/docs/mfa-setup']
      }
    ];
  }

  /**
   * Assess compliance against framework
   */
  async assessCompliance(framework: ComplianceFramework): Promise<ComplianceStatus> {
    const controls = await this.getFrameworkControls(framework);
    
    const implemented = controls.filter(c => c.implemented).length;
    const compliant = controls.filter(c => c.compliant).length;
    const overallCompliance = controls.length > 0 ? (compliant / controls.length) * 100 : 0;

    return {
      framework,
      overallCompliance,
      controls,
      lastAssessment: new Date(),
      nextAssessment: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
    };
  }

  /**
   * List compliance frameworks
   */
  async listComplianceFrameworks(): Promise<ComplianceStatus[]> {
    const frameworks = [
      ComplianceFramework.ISO_27001,
      ComplianceFramework.NIST_CSF,
      ComplianceFramework.SOC_2
    ];

    return await Promise.all(
      frameworks.map(f => this.assessCompliance(f))
    );
  }

  // Private helpers

  private calculateWeightedScore(categories: SecurityCategory[]): number {
    const availableCategories = categories.filter(cat => this.isCategoryAvailable(cat));
    if (availableCategories.length === 0) {
      return 0;
    }

    const totalWeight = availableCategories.reduce((sum, cat) => sum + cat.weight, 0);
    const weightedSum = availableCategories.reduce((sum, cat) => sum + (cat.score * cat.weight), 0);
    return Math.round(weightedSum / totalWeight);
  }

  private isCategoryAvailable(category: SecurityCategory): boolean {
    return category.metrics.some(metric => metric.status !== 'unavailable' && metric.value !== null && metric.value !== undefined);
  }

  private determineProvenance(categories: SecurityCategory[]): 'LIVE' | 'PARTIAL' | 'UNAVAILABLE' {
    const availableCount = categories.filter(cat => this.isCategoryAvailable(cat)).length;
    if (availableCount === 0) {
      return 'UNAVAILABLE';
    }
    if (availableCount < categories.length) {
      return 'PARTIAL';
    }
    return 'LIVE';
  }

  private createMetric(
    name: string,
    value: number | null,
    target: number,
    unit: string,
    status: 'good' | 'warning' | 'critical' | 'unavailable',
    provenance: 'LIVE' | 'SIMULATED' | 'UNAVAILABLE',
    evidence: any[] = [],
    confidence: number = status === 'unavailable' ? 0 : status === 'good' ? 100 : status === 'warning' ? 60 : 25
  ): SecurityMetricWithEvidence {
    return {
      name,
      value,
      target,
      unit,
      status,
      evidence,
      lastUpdated: new Date(),
      confidence,
      provenance
    };
  }

  private async calculateTrends(): Promise<any[]> {
    const history = await this.getPostureHistory(30);
    
    if (history.length < 2) {
      return [];
    }

    const latest = history[history.length - 1];
    const previous = history[history.length - 2];
    const changePercent = ((latest.overallScore - previous.overallScore) / previous.overallScore) * 100;

    return [{
      metric: 'Overall Security Score',
      dataPoints: history.map(h => ({
        timestamp: h.timestamp,
        value: h.overallScore
      })),
      direction: changePercent > 1 ? 'improving' : changePercent < -1 ? 'degrading' : 'stable',
      changePercent
    }];
  }

  private async getFrameworkControls(framework: ComplianceFramework): Promise<any[]> {
    // Placeholder - would map to actual framework controls
    return [
      {
        id: 'C1',
        name: 'Access Control',
        description: 'Implement proper access controls',
        category: 'Access',
        required: true,
        implemented: true,
        compliant: true,
        evidence: [],
        lastVerified: new Date()
      }
    ];
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const posture = await this.getPosture();
      
      return {
        status: 'healthy',
        details: {
          overallScore: posture.overallScore,
          criticalIssues: posture.criticalIssues
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }
}
