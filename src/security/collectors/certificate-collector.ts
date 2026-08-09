/**
 * Certificate Evidence Collector
 * Collects real certificate status evidence from the certificate management service
 */

import { BaseEvidenceCollector } from './base-evidence-collector.js';
import { SecurityEvidence, EvidenceCollectorConfig } from '../types.js';
import { getDatabase } from '../../config/database.js';

export class CertificateCollector extends BaseEvidenceCollector {
  constructor(config: EvidenceCollectorConfig) {
    super('Certificate Collector', 'certificate_scan', config);
  }

  async collect(): Promise<SecurityEvidence[]> {
    const db = getDatabase();
    const evidence: SecurityEvidence[] = [];

    try {
      // Collect certificate counts
      const totalCerts = await db.collection('certificates').countDocuments();
      const expiredCerts = await db.collection('certificates').countDocuments({
        status: 'expired'
      });
      const expiringSoonCerts = await db.collection('certificates').countDocuments({
        status: 'expiring_soon'
      });
      const validCerts = await db.collection('certificates').countDocuments({
        status: 'valid'
      });

      // Get certificate details for evidence
      const certificates = await db.collection('certificates')
        .find({})
        .project({
          id: 1,
          name: 1,
          status: 1,
          notAfter: 1,
          commonName: 1,
          usedBy: 1,
        })
        .toArray();

      // Evidence: Total certificate count
      evidence.push(
        this.createEvidence(
          {
            total: totalCerts,
            valid: validCerts,
            expired: expiredCerts,
            expiringSoon: expiringSoonCerts,
            certificates: certificates.map(c => ({
              id: c.id,
              name: c.name,
              status: c.status,
              expiresAt: c.notAfter,
            })),
          },
          100, // High confidence - directly from database
          {
            query: 'certificate_counts',
            collectionSize: totalCerts,
          }
        )
      );

      // Evidence: Expired certificates (critical finding)
      if (expiredCerts > 0) {
        const expiredList = await db.collection('certificates')
          .find({ status: 'expired' })
          .toArray();

        evidence.push(
          this.createEvidence(
            {
              count: expiredCerts,
              certificates: expiredList,
            },
            100,
            {
              severity: 'critical',
              impact: 'Services using these certificates may fail',
            }
          )
        );
      }

      // Evidence: Expiring soon certificates (warning)
      if (expiringSoonCerts > 0) {
        const expiringSoonList = await db.collection('certificates')
          .find({ status: 'expiring_soon' })
          .toArray();

        evidence.push(
          this.createEvidence(
            {
              count: expiringSoonCerts,
              certificates: expiringSoonList,
            },
            100,
            {
              severity: 'warning',
              impact: 'Certificates require renewal',
            }
          )
        );
      }

      // Evidence: Certificate usage analysis
      const usageStats = certificates.reduce((acc, cert) => {
        const usageCount = cert.usedBy?.length || 0;
        if (usageCount === 0) acc.unused++;
        else if (usageCount > 5) acc.highlyUsed++;
        acc.total++;
        return acc;
      }, { total: 0, unused: 0, highlyUsed: 0 });

      evidence.push(
        this.createEvidence(
          usageStats,
          90, // Slightly lower confidence as usage tracking may be incomplete
          {
            metric: 'certificate_usage',
          }
        )
      );

      return evidence;
    } catch (error) {
      // Create failed evidence
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
      // Quick health check - can we query the database?
      await db.collection('certificates').countDocuments({}, { limit: 1 });
      return true;
    } catch (error) {
      return false;
    }
  }
}
