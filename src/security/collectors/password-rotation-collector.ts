/**
 * Password Rotation Evidence Collector
 * Collects real password rotation compliance evidence
 */

import { BaseEvidenceCollector } from './base-evidence-collector.js';
import { SecurityEvidence, EvidenceCollectorConfig } from '../types.js';
import { getDatabase } from '../../config/database.js';

export class PasswordRotationCollector extends BaseEvidenceCollector {
  constructor(config: EvidenceCollectorConfig) {
    super('Password Rotation Collector', 'password_rotation_check', config);
  }

  async collect(): Promise<SecurityEvidence[]> {
    const db = getDatabase();
    const evidence: SecurityEvidence[] = [];
    const now = new Date();

    try {
      // Collect rotation target statistics
      const totalTargets = await db.collection('password_rotation_targets').countDocuments();
      const enabledTargets = await db.collection('password_rotation_targets').countDocuments({
        enabled: true
      });
      
      // Find overdue rotations
      const overdueTargets = await db.collection('password_rotation_targets')
        .find({
          enabled: true,
          nextRotation: { $lt: now }
        })
        .toArray();

      // Find recent rotation jobs
      const recentJobs = await db.collection('password_rotation_jobs')
        .find({
          scheduledAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
        })
        .toArray();

      const successfulJobs = recentJobs.filter(j => j.status === 'success').length;
      const failedJobs = recentJobs.filter(j => j.status === 'failed').length;

      // Evidence: Rotation compliance
      const compliance = totalTargets > 0
        ? ((totalTargets - overdueTargets.length) / totalTargets) * 100
        : 100;

      evidence.push(
        this.createEvidence(
          {
            totalTargets,
            enabledTargets,
            overdueCount: overdueTargets.length,
            compliancePercent: compliance,
            overdueTargets: overdueTargets.map(t => ({
              id: t.id,
              name: t.name,
              type: t.type,
              nextRotation: t.nextRotation,
              daysPastDue: Math.floor((now.getTime() - new Date(t.nextRotation).getTime()) / (24 * 60 * 60 * 1000)),
            })),
          },
          100, // High confidence - direct database query
          {
            metric: 'rotation_compliance',
            severity: overdueTargets.length > 0 ? 'warning' : 'good',
          }
        )
      );

      // Evidence: Rotation success rate
      if (recentJobs.length > 0) {
        const successRate = (successfulJobs / recentJobs.length) * 100;
        
        evidence.push(
          this.createEvidence(
            {
              period: 'last_30_days',
              totalJobs: recentJobs.length,
              successful: successfulJobs,
              failed: failedJobs,
              successRate,
            },
            95, // High confidence
            {
              metric: 'rotation_success_rate',
              severity: successRate < 90 ? 'warning' : 'good',
            }
          )
        );
      }

      // Evidence: Failed rotation details (if any)
      const recentFailedJobs = recentJobs
        .filter(j => j.status === 'failed')
        .slice(0, 10); // Last 10 failures

      if (recentFailedJobs.length > 0) {
        evidence.push(
          this.createEvidence(
            {
              failureCount: recentFailedJobs.length,
              failures: recentFailedJobs.map(j => ({
                id: j.id,
                targetId: j.targetId,
                scheduledAt: j.scheduledAt,
                error: j.error,
                attempts: j.attempts,
              })),
            },
            100,
            {
              severity: 'critical',
              impact: 'Failed rotations require manual intervention',
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
      await db.collection('password_rotation_targets').countDocuments({}, { limit: 1 });
      return true;
    } catch (error) {
      return false;
    }
  }
}
