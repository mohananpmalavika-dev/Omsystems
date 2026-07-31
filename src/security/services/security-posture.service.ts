/**
 * Security Posture Service
 * Overall security scoring and risk assessment
 */

import { ISecurityPostureService, IssueFilters } from '../interfaces.js';
import { SecurityPosture, SecurityCategory, SecurityIssue, ComplianceStatus, ComplianceFramework } from '../types.js';
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
      this.scoreCompliance()
    ]);

    const overallScore = this.calculateWeightedScore(categories);
    const issues = await this.listIssues({ resolved: false });

    const posture: SecurityPosture = {
      overallScore,
      timestamp: new Date(),
      categories,
      criticalIssues: issues.filter(i => i.severity === 'critical').length,
      highIssues: issues.filter(i => i.severity === 'high').length,
      mediumIssues: issues.filter(i => i.severity === 'medium').length,
      lowIssues: issues.filter(i => i.severity === 'low').length,
      trends: await this.calculateTrends(),
      recommendations: await this.getRecommendations()
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
    
    const score = total > 0 ? Math.max(0, 100 - (expired * 20) - (expiringSoon * 5)) : 100;

    return {
      name: 'Certificate Management',
      score,
      weight: 15,
      metrics: [
        { name: 'Total Certificates', value: total, target: 0, unit: 'count', status: 'good' },
        { name: 'Expired', value: expired, target: 0, unit: 'count', status: expired > 0 ? 'critical' : 'good' },
        { name: 'Expiring Soon', value: expiringSoon, target: 0, unit: 'count', status: expiringSoon > 3 ? 'warning' : 'good' }
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
    
    const score = totalUsers > 0 ? (mfaEnabled / totalUsers) * 100 : 100;

    return {
      name: 'Authentication & Access Control',
      score,
      weight: 20,
      metrics: [
        { name: 'Users with MFA', value: mfaEnabled, target: totalUsers, unit: 'users', status: score > 80 ? 'good' : 'warning' },
        { name: 'MFA Coverage', value: Math.round(score), target: 100, unit: '%', status: score > 80 ? 'good' : 'warning' }
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
    
    const score = totalVideos > 0 ? (encryptedVideos / totalVideos) * 100 : 100;

    return {
      name: 'Data Encryption',
      score,
      weight: 20,
      metrics: [
        { name: 'Encrypted Videos', value: encryptedVideos, target: totalVideos, unit: 'videos', status: score > 90 ? 'good' : 'warning' },
        { name: 'Encryption Coverage', value: Math.round(score), target: 100, unit: '%', status: score > 90 ? 'good' : 'warning' }
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

    return {
      name: 'Access Control',
      score,
      weight: 15,
      metrics: [
        { name: 'Active Policies', value: policies, target: 10, unit: 'policies', status: policies >= 5 ? 'good' : 'warning' }
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
    const score = Math.max(0, 100 - (activeThreats * 10));

    return {
      name: 'Threat Detection',
      score,
      weight: 20,
      metrics: [
        { name: 'Active Threats', value: activeThreats, target: 0, unit: 'threats', status: activeThreats === 0 ? 'good' : 'critical' }
      ],
      issues: []
    };
  }

  /**
   * Score compliance category
   */
  async scoreCompliance(): Promise<SecurityCategory> {
    return {
      name: 'Compliance',
      score: 85,
      weight: 10,
      metrics: [
        { name: 'Compliance Score', value: 85, target: 100, unit: '%', status: 'good' }
      ],
      issues: []
    };
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
    const totalWeight = categories.reduce((sum, cat) => sum + cat.weight, 0);
    const weightedSum = categories.reduce((sum, cat) => sum + (cat.score * cat.weight), 0);
    return Math.round(weightedSum / totalWeight);
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
