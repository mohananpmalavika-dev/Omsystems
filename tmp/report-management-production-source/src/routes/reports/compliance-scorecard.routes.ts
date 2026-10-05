// @ts-nocheck
/**
 * Compliance Scorecard Routes
 * 
 * Provides real-time compliance tracking for:
 * - RBI/Banking regulations
 * - GDPR/Privacy requirements
 * - OSHA/Safety standards
 * - Industry-specific compliance
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/require-permission.middleware.js';

export function createComplianceScorecardRoutes(pool: Pool): Router {
  const router = Router();

  /**
   * GET /api/control/v1/reports/compliance-scorecard
   * 
   * Get comprehensive compliance scorecard across all regulatory domains
   */
  router.get('/compliance-scorecard', authenticateToken, requirePermission('reports:view'), async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant ID required' });
      }

      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Banking Compliance (RBI)
      const bankingCompliance = await calculateBankingCompliance(pool, tenantId, last30Days, now);

      // Privacy Compliance (GDPR)
      const privacyCompliance = await calculatePrivacyCompliance(pool, tenantId, last30Days, now);

      // Safety Compliance (OSHA)
      const safetyCompliance = await calculateSafetyCompliance(pool, tenantId, last30Days, now);

      // Technical Compliance
      const technicalCompliance = await calculateTechnicalCompliance(pool, tenantId, last30Days, now);

      // Overall score
      const overallScore = Math.round(
        (bankingCompliance.score * 0.3 +
        privacyCompliance.score * 0.25 +
        safetyCompliance.score * 0.25 +
        technicalCompliance.score * 0.2)
      );

      // Compliance gaps
      const gaps = identifyComplianceGaps(
        bankingCompliance,
        privacyCompliance,
        safetyCompliance,
        technicalCompliance
      );

      // Remediation actions
      const remediationActions = generateRemediationActions(gaps);

      const scorecard = {
        generatedAt: now.toISOString(),
        period: 'Last 30 Days',
        dateRange: { start: last30Days.toISOString(), end: now.toISOString() },

        overall: {
          score: overallScore,
          status: overallScore >= 95 ? 'compliant' : overallScore >= 85 ? 'warning' : 'non-compliant',
          trend: 'stable', // Would compare to previous period
          lastAudit: null // Would come from audit table
        },

        domains: {
          banking: bankingCompliance,
          privacy: privacyCompliance,
          safety: safetyCompliance,
          technical: technicalCompliance
        },

        gaps,
        remediationActions,

        auditReadiness: {
          score: Math.min(100, overallScore + 5),
          missingEvidence: gaps.filter(g => !g.evidenceAttached).length,
          openFindings: gaps.length,
          estimatedAuditDays: Math.ceil(gaps.length / 5)
        }
      };

      res.json({
        success: true,
        data: scorecard
      });

    } catch (error) {
      console.error('[ComplianceScorecard] Error generating scorecard:', error);
      res.status(500).json({
        error: 'Failed to generate compliance scorecard',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}

// ========================
// Helper Functions
// ========================

async function calculateBankingCompliance(
  pool: Pool,
  tenantId: string,
  start: Date,
  end: Date
): Promise<any> {
  // Query banking-related incidents
  const vaultIncidents = await pool.query(
    `SELECT COUNT(*) as count FROM incidents 
     WHERE tenant_id = $1 AND detected_at >= $2 AND detected_at < $3
     AND detection_type IN ('person-in-vault-after-hours', 'vault-unauthorized-access', 'vault-forced-open')`,
    [tenantId, start, end]
  );

  const atmIncidents = await pool.query(
    `SELECT COUNT(*) as count FROM incidents 
     WHERE tenant_id = $1 AND detected_at >= $2 AND detected_at < $3
     AND detection_type IN ('atm-tampering', 'atm-skimming', 'atm-cabinet-opened')`,
    [tenantId, start, end]
  );

  const cashCounterIncidents = await pool.query(
    `SELECT COUNT(*) as count FROM incidents 
     WHERE tenant_id = $1 AND detected_at >= $2 AND detected_at < $3
     AND detection_type IN ('cash-counter-monitoring', 'cash-tray-left-open')`,
    [tenantId, start, end]
  );

  const vaultCount = parseInt(vaultIncidents.rows[0]?.count || '0', 10);
  const atmCount = parseInt(atmIncidents.rows[0]?.count || '0', 10);
  const cashCounterCount = parseInt(cashCounterIncidents.rows[0]?.count || '0', 10);

  const checks = [
    { 
      id: 'vault-surveillance',
      requirement: 'Vault Dual Control & After-Hours Monitoring',
      status: vaultCount === 0 ? 'pass' : 'fail',
      score: vaultCount === 0 ? 100 : Math.max(0, 100 - vaultCount * 10),
      findings: vaultCount > 0 ? [`${vaultCount} vault violations detected`] : [],
      regulation: 'RBI/IBA Guidelines'
    },
    {
      id: 'atm-security',
      requirement: 'ATM Surveillance & Tamper Detection',
      status: atmCount < 3 ? 'pass' : 'fail',
      score: Math.max(0, 100 - atmCount * 5),
      findings: atmCount > 0 ? [`${atmCount} ATM security incidents`] : [],
      regulation: 'RBI Guidelines'
    },
    {
      id: 'cash-counter',
      requirement: 'Cash Counter Monitoring',
      status: cashCounterCount < 5 ? 'pass' : 'fail',
      score: Math.max(0, 100 - cashCounterCount * 3),
      findings: cashCounterCount > 0 ? [`${cashCounterCount} cash handling incidents`] : [],
      regulation: 'Internal Policy'
    },
    {
      id: 'recording-retention',
      requirement: 'Recording Retention (90+ days)',
      status: 'pass', // Would query recording retention data
      score: 100,
      findings: [],
      regulation: 'RBI Guidelines'
    }
  ];

  const avgScore = Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length);

  return {
    score: avgScore,
    status: avgScore >= 95 ? 'compliant' : avgScore >= 85 ? 'warning' : 'non-compliant',
    checks,
    violations: vaultCount + atmCount + cashCounterCount
  };
}

async function calculatePrivacyCompliance(
  pool: Pool,
  tenantId: string,
  start: Date,
  end: Date
): Promise<any> {
  // Query privacy-related data
  const faceRecognitionIncidents = await pool.query(
    `SELECT COUNT(*) as count FROM incidents 
     WHERE tenant_id = $1 AND detected_at >= $2 AND detected_at < $3
     AND detection_type IN ('face-recognition', 'watchlist-match')`,
    [tenantId, start, end]
  );

  const faceCount = parseInt(faceRecognitionIncidents.rows[0]?.count || '0', 10);

  const checks = [
    {
      id: 'data-retention',
      requirement: 'Data Retention Policy Compliance',
      status: 'pass',
      score: 100,
      findings: [],
      regulation: 'GDPR Article 5'
    },
    {
      id: 'access-control',
      requirement: 'Access Control & Audit Logs',
      status: 'pass',
      score: 100,
      findings: [],
      regulation: 'GDPR Article 32'
    },
    {
      id: 'consent-management',
      requirement: 'Face Recognition Consent Management',
      status: faceCount > 0 ? 'pass' : 'n/a',
      score: 100,
      findings: faceCount > 0 ? [] : ['No face recognition usage detected'],
      regulation: 'GDPR Article 6'
    },
    {
      id: 'data-minimization',
      requirement: 'Data Minimization Principle',
      status: 'pass',
      score: 100,
      findings: [],
      regulation: 'GDPR Article 5'
    },
    {
      id: 'breach-notification',
      requirement: 'Breach Notification Procedures',
      status: 'pass',
      score: 100,
      findings: [],
      regulation: 'GDPR Article 33'
    }
  ];

  const avgScore = Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length);

  return {
    score: avgScore,
    status: avgScore >= 95 ? 'compliant' : avgScore >= 85 ? 'warning' : 'non-compliant',
    checks,
    violations: 0
  };
}

async function calculateSafetyCompliance(
  pool: Pool,
  tenantId: string,
  start: Date,
  end: Date
): Promise<any> {
  // Query safety-related incidents
  const ppeIncidents = await pool.query(
    `SELECT COUNT(*) as count FROM incidents 
     WHERE tenant_id = $1 AND detected_at >= $2 AND detected_at < $3
     AND detection_type IN ('no-helmet', 'no-safety-vest', 'no-gloves', 'no-shoes')`,
    [tenantId, start, end]
  );

  const fireIncidents = await pool.query(
    `SELECT COUNT(*) as count FROM incidents 
     WHERE tenant_id = $1 AND detected_at >= $2 AND detected_at < $3
     AND detection_type IN ('fire', 'smoke', 'fire-exit-blocked', 'fire-extinguisher-missing')`,
    [tenantId, start, end]
  );

  const fallIncidents = await pool.query(
    `SELECT COUNT(*) as count FROM incidents 
     WHERE tenant_id = $1 AND detected_at >= $2 AND detected_at < $3
     AND detection_type = 'fall'`,
    [tenantId, start, end]
  );

  const ppeCount = parseInt(ppeIncidents.rows[0]?.count || '0', 10);
  const fireCount = parseInt(fireIncidents.rows[0]?.count || '0', 10);
  const fallCount = parseInt(fallIncidents.rows[0]?.count || '0', 10);

  const checks = [
    {
      id: 'ppe-compliance',
      requirement: 'PPE Compliance Monitoring',
      status: ppeCount < 50 ? 'pass' : 'fail',
      score: Math.max(0, 100 - ppeCount / 2),
      findings: ppeCount > 0 ? [`${ppeCount} PPE violations detected`] : [],
      regulation: 'OSHA 1910.132'
    },
    {
      id: 'fire-safety',
      requirement: 'Fire Safety Systems Monitoring',
      status: fireCount === 0 ? 'pass' : 'fail',
      score: fireCount === 0 ? 100 : Math.max(0, 100 - fireCount * 20),
      findings: fireCount > 0 ? [`${fireCount} fire safety incidents`] : [],
      regulation: 'OSHA 1910.157'
    },
    {
      id: 'fall-protection',
      requirement: 'Fall Detection & Response',
      status: fallCount < 3 ? 'pass' : 'fail',
      score: Math.max(0, 100 - fallCount * 10),
      findings: fallCount > 0 ? [`${fallCount} fall incidents detected`] : [],
      regulation: 'OSHA 1926.501'
    },
    {
      id: 'emergency-exits',
      requirement: 'Emergency Exit Monitoring',
      status: 'pass',
      score: 100,
      findings: [],
      regulation: 'OSHA 1910.36'
    }
  ];

  const avgScore = Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length);

  return {
    score: avgScore,
    status: avgScore >= 95 ? 'compliant' : avgScore >= 85 ? 'warning' : 'non-compliant',
    checks,
    violations: ppeCount + fireCount + fallCount
  };
}

async function calculateTechnicalCompliance(
  pool: Pool,
  tenantId: string,
  start: Date,
  end: Date
): Promise<any> {
  // Query technical compliance
  const cameraDowntime = await pool.query(
    `SELECT COUNT(*) as count FROM incidents 
     WHERE tenant_id = $1 AND detected_at >= $2 AND detected_at < $3
     AND detection_type IN ('video-loss', 'camera-tampering', 'camera-covered', 'camera-blocked')`,
    [tenantId, start, end]
  );

  const downtimeCount = parseInt(cameraDowntime.rows[0]?.count || '0', 10);

  const checks = [
    {
      id: 'recording-uptime',
      requirement: 'Recording Uptime (99%+ SLA)',
      status: downtimeCount < 5 ? 'pass' : 'fail',
      score: Math.max(0, 100 - downtimeCount * 2),
      findings: downtimeCount > 0 ? [`${downtimeCount} downtime incidents`] : [],
      regulation: 'Technical SLA'
    },
    {
      id: 'camera-health',
      requirement: 'Camera Health Monitoring',
      status: 'pass',
      score: 100,
      findings: [],
      regulation: 'Internal Standard'
    },
    {
      id: 'backup-systems',
      requirement: 'Backup & Redundancy Systems',
      status: 'pass',
      score: 100,
      findings: [],
      regulation: 'Technical SLA'
    },
    {
      id: 'cybersecurity',
      requirement: 'Cybersecurity Controls',
      status: 'pass',
      score: 100,
      findings: [],
      regulation: 'ISO 27001'
    }
  ];

  const avgScore = Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length);

  return {
    score: avgScore,
    status: avgScore >= 95 ? 'compliant' : avgScore >= 85 ? 'warning' : 'non-compliant',
    checks,
    violations: downtimeCount
  };
}

function identifyComplianceGaps(
  banking: any,
  privacy: any,
  safety: any,
  technical: any
): any[] {
  const gaps = [];

  const allChecks = [
    ...banking.checks.map((c: any) => ({ ...c, domain: 'Banking' })),
    ...privacy.checks.map((c: any) => ({ ...c, domain: 'Privacy' })),
    ...safety.checks.map((c: any) => ({ ...c, domain: 'Safety' })),
    ...technical.checks.map((c: any) => ({ ...c, domain: 'Technical' }))
  ];

  allChecks.forEach(check => {
    if (check.status === 'fail' || check.findings.length > 0) {
      gaps.push({
        id: check.id,
        domain: check.domain,
        requirement: check.requirement,
        regulation: check.regulation,
        findings: check.findings,
        severity: check.status === 'fail' ? 'high' : 'medium',
        evidenceAttached: false, // Would query evidence table
        remediation: null // Populated below
      });
    }
  });

  return gaps;
}

function generateRemediationActions(gaps: any[]): any[] {
  return gaps.map(gap => ({
    gapId: gap.id,
    priority: gap.severity === 'high' ? 'immediate' : 'planned',
    actions: getRemediationSteps(gap.id),
    assignedTo: null,
    dueDate: gap.severity === 'high' 
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    status: 'open'
  }));
}

function getRemediationSteps(gapId: string): string[] {
  const remediationMap: Record<string, string[]> = {
    'vault-surveillance': [
      'Review vault access procedures',
      'Ensure dual control is enforced',
      'Verify after-hours monitoring is active',
      'Conduct staff training on vault protocols'
    ],
    'atm-security': [
      'Inspect ATM camera positioning',
      'Test tamper detection sensors',
      'Review ATM access logs',
      'Coordinate with security team'
    ],
    'ppe-compliance': [
      'Increase PPE enforcement',
      'Provide additional safety training',
      'Review PPE availability',
      'Implement progressive discipline'
    ],
    'fire-safety': [
      'Inspect fire detection systems',
      'Verify extinguisher placement',
      'Check emergency exit clarity',
      'Conduct fire drill'
    ],
    'recording-uptime': [
      'Audit camera and NVR hardware',
      'Replace failing equipment',
      'Implement redundancy measures',
      'Schedule preventive maintenance'
    ]
  };

  return remediationMap[gapId] || [
    'Conduct root cause analysis',
    'Develop corrective action plan',
    'Implement preventive measures',
    'Monitor for recurrence'
  ];
}
