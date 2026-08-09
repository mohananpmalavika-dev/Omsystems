/**
 * MFA Compliance Evidence Collector
 * Collects real MFA adoption and compliance evidence
 */

import { BaseEvidenceCollector } from './base-evidence-collector.js';
import { SecurityEvidence, EvidenceCollectorConfig } from '../types.js';
import { getDatabase } from '../../config/database.js';

export class MFAComplianceCollector extends BaseEvidenceCollector {
  constructor(config: EvidenceCollectorConfig) {
    super('MFA Compliance Collector', 'user_mfa_status', config);
  }

  async collect(): Promise<SecurityEvidence[]> {
    const db = getDatabase();
    const evidence: SecurityEvidence[] = [];

    try {
      // Collect user MFA statistics
      const totalUsers = await db.collection('users').countDocuments({ deleted: { $ne: true } });
      const mfaEnabledUsers = await db.collection('users').countDocuments({
        mfaEnabled: true,
        deleted: { $ne: true }
      });

      // Get users by role
      const adminUsers = await db.collection('users').countDocuments({
        role: { $in: ['admin', 'super_admin'] },
        deleted: { $ne: true }
      });
      const adminMFAEnabled = await db.collection('users').countDocuments({
        role: { $in: ['admin', 'super_admin'] },
        mfaEnabled: true,
        deleted: { $ne: true }
      });

      // Get recent login attempts without MFA
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentLogins = await db.collection('auth_logs')
        .find({
          timestamp: { $gte: thirtyDaysAgo },
          success: true
        })
        .toArray();

      const mfaVerifiedLogins = recentLogins.filter(log => log.mfaVerified).length;
      const totalLogins = recentLogins.length;

      // Calculate compliance metrics
      const overallMFARate = totalUsers > 0 ? (mfaEnabledUsers / totalUsers) * 100 : 100;
      const adminMFARate = adminUsers > 0 ? (adminMFAEnabled / adminUsers) * 100 : 100;
      const loginMFARate = totalLogins > 0 ? (mfaVerifiedLogins / totalLogins) * 100 : 0;

      // Evidence: Overall MFA enrollment
      evidence.push(
        this.createEvidence(
          {
            totalUsers,
            mfaEnabledUsers,
            mfaDisabledUsers: totalUsers - mfaEnabledUsers,
            enrollmentRate: overallMFARate,
          },
          100, // High confidence - direct from user database
          {
            metric: 'mfa_enrollment',
            severity: overallMFARate < 80 ? 'warning' : 'good',
            target: 100,
          }
        )
      );

      // Evidence: Admin MFA compliance (critical)
      evidence.push(
        this.createEvidence(
          {
            adminUsers,
            adminMFAEnabled,
            adminMFADisabled: adminUsers - adminMFAEnabled,
            adminMFARate,
          },
          100,
          {
            metric: 'admin_mfa_compliance',
            severity: adminMFARate < 100 ? 'critical' : 'good',
            target: 100,
            impact: 'All administrative accounts should have MFA enabled',
          }
        )
      );

      // Evidence: Login MFA usage (behavioral)
      if (totalLogins > 0) {
        evidence.push(
          this.createEvidence(
            {
              period: 'last_30_days',
              totalLogins,
              mfaVerifiedLogins,
              nonMFALogins: totalLogins - mfaVerifiedLogins,
              mfaUsageRate: loginMFARate,
            },
            90, // Slightly lower confidence - behavioral data
            {
              metric: 'mfa_usage_rate',
              severity: loginMFARate < 80 ? 'warning' : 'good',
            }
          )
        );
      }

      // Evidence: Users without MFA (list for remediation)
      if (totalUsers - mfaEnabledUsers > 0) {
        const usersWithoutMFA = await db.collection('users')
          .find({
            mfaEnabled: { $ne: true },
            deleted: { $ne: true }
          })
          .project({ id: 1, email: 1, name: 1, role: 1, lastLoginAt: 1 })
          .limit(50) // Limit to prevent huge payloads
          .toArray();

        evidence.push(
          this.createEvidence(
            {
              count: totalUsers - mfaEnabledUsers,
              users: usersWithoutMFA.map(u => ({
                id: u.id,
                email: u.email,
                name: u.name,
                role: u.role,
                lastLogin: u.lastLoginAt,
              })),
              truncated: (totalUsers - mfaEnabledUsers) > 50,
            },
            100,
            {
              severity: 'warning',
              actionRequired: 'Enable MFA for all users',
            }
          )
        );
      }

      return evidence;
    } catch (error) {
      return [
        {
          ...this.createEvidence(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            0
          ),
          status: 'failed',
        },
      ];
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const db = getDatabase();
      await db.collection('users').countDocuments({}, { limit: 1 });
      return true;
    } catch (error) {
      return false;
    }
  }
}
