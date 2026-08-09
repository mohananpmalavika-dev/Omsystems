/**
 * Enterprise Security Dashboard Component
 * Real-time security posture monitoring and alerts
 */

'use client';

import { useEffect, useState } from 'react';
import {
  Shield,
  Lock,
  Key,
  FileText,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Activity,
  Database,
  Wifi,
  HardDrive
} from 'lucide-react';
import { PageHero } from '@/components/page-hero';

interface SecurityPosture {
  available?: boolean;
  provenance?: 'REAL' | 'DEGRADED' | 'UNAVAILABLE';
  reason?: string;
  overallScore: number;
  timestamp: string;
  metrics: {
    zeroTrust: {
      score: number;
      devicesCompliant: number;
      devicesTotal: number;
      highRiskSessions: number;
    };
    encryption: {
      score: number;
      videosEncrypted: number;
      videosTotal: number;
      tlsCompliance: number;
    };
    certificates: {
      score: number;
      healthy: number;
      expiringSoon: number;
      expired: number;
      revoked: number;
    };
    secrets: {
      status: string;
      rotationCompliance: number;
      expiring: number;
    };
    ransomware: {
      activeThreats: number;
      eventsToday: number;
      riskLevel: string;
      available?: boolean;
    };
    tamper: {
      activeEvents: number;
      criticalEvents: number;
      resolvedToday: number;
      available?: boolean;
    };
    secureBoot: {
      score: number;
      compliantDevices: number;
      totalDevices: number;
    };
    tpm: {
      score: number;
      attestedDevices: number;
      totalDevices: number;
      failedAttestations: number;
    };
  };
  alerts: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    timestamp: string;
    acknowledged: boolean;
  }>;
  trends?: Array<{
    metric: string;
    current: number;
    previous: number;
    change: number;
    changePercent: number;
    direction: 'UP' | 'DOWN' | 'STABLE';
  }>;
}

export default function SecurityDashboard() {
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSecurityPosture();
    const interval = setInterval(fetchSecurityPosture, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const fetchSecurityPosture = async () => {
    try {
      const response = await fetch('/api/security/posture');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setPosture(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch security posture:', error);
      setLoading(false);
      // Set fallback data so component doesn't crash
      setPosture({
        available: false,
        provenance: 'UNAVAILABLE',
        reason: 'security_posture_api_unavailable',
        overallScore: 0,
        timestamp: new Date().toISOString(),
        metrics: {
          zeroTrust: {
            score: 0,
            devicesCompliant: 0,
            devicesTotal: 0,
            highRiskSessions: 0,
          },
          encryption: {
            score: 0,
            videosEncrypted: 0,
            videosTotal: 0,
            tlsCompliance: 0,
          },
          certificates: {
            score: 0,
            healthy: 0,
            expiringSoon: 0,
            expired: 0,
            revoked: 0,
          },
          secrets: {
            status: 'Unknown',
            rotationCompliance: 0,
            expiring: 0,
          },
          ransomware: {
            activeThreats: 0,
            eventsToday: 0,
            riskLevel: 'Unknown',
          },
          tamper: {
            activeEvents: 0,
            criticalEvents: 0,
            resolvedToday: 0,
          },
          secureBoot: {
            score: 0,
            compliantDevices: 0,
            totalDevices: 0,
          },
          tpm: {
            score: 0,
            attestedDevices: 0,
            totalDevices: 0,
            failedAttestations: 0,
          },
        },
        alerts: [],
        trends: []
      });
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 95) return 'tone-positive';
    if (score >= 90) return 'tone-brand';
    if (score >= 80) return 'tone-caution';
    return 'tone-negative';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'severity-critical';
      case 'HIGH': return 'severity-high';
      case 'MEDIUM': return 'severity-medium';
      case 'LOW': return 'severity-low';
      default: return 'severity-neutral';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!posture) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 mx-auto text-yellow-500 mb-4" />
        <p className="text-gray-600">Failed to load security posture</p>
      </div>
    );
  }

  if (posture.available === false) {
    return (
      <div className="security-posture-dashboard space-y-6">
        <PageHero
          eyebrow="Security posture"
          title="Security operations center"
          description="Control assurance is shown only when it is backed by connected security collectors."
          icon={Shield}
          actions={<button onClick={fetchSecurityPosture} className="btn-secondary"><RefreshCw className="w-4 h-4" /> Refresh posture</button>}
        />
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm" role="status">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-amber-700 shadow-sm"><AlertTriangle size={22} /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-amber-700">Measurement unavailable</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">No security score has been calculated</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Certificate, secret-vault, secure-boot, TPM, ransomware, and tamper collectors are not connected. Sentinel Grid will not replace missing evidence with sample scores or alerts.</p>
              <p className="mt-3 text-xs font-medium text-slate-500">Reason: {posture.reason ?? 'security_posture_collectors_not_configured'}</p>
            </div>
          </div>
        </section>
        <div className="security-quick-actions rounded-xl bg-white p-6 shadow-lg">
          <h3 className="mb-4 text-xl font-bold text-gray-900">Available operational controls</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <ActionButton icon={<Shield />} label="Access Controls" href="/compliance/controls" />
            <ActionButton icon={<AlertTriangle />} label="Operational Alerts" href="/operations/alerts" />
            <ActionButton icon={<Database />} label="Storage Health" href="/operations/storage" />
            <ActionButton icon={<Activity />} label="Fleet Health" href="/operations/health" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="security-posture-dashboard space-y-6">
      <PageHero
        eyebrow="Security posture"
        title="Security operations center"
        description="Real-time enterprise security posture, active threats, and control assurance in one operational view."
        icon={Shield}
        actions={<button onClick={fetchSecurityPosture} className="btn-secondary"><RefreshCw className="w-4 h-4" /> Refresh posture</button>}
      />
      {posture.provenance === 'DEGRADED' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm">
          <p className="text-sm font-semibold">Security posture is degraded because some evidence collectors are not fully available.</p>
          <p className="mt-1 text-sm text-amber-700">The score is based on partial evidence and may improve as more telemetry becomes available.</p>
        </div>
      )}

      {/* Overall Score */}
      <div className="security-score-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="security-score-label">Overall security score</p>
            <div className="flex items-baseline gap-4">
              <h2 className={`security-score-value ${getScoreColor(posture.overallScore)}`}>
                {posture.overallScore}
              </h2>
              <span className="security-score-scale">/100</span>
            </div>
            <p className={`security-score-status ${getScoreColor(posture.overallScore)}`}>
              {posture.overallScore >= 95 && 'Excellent · Enterprise-grade security'}
              {posture.overallScore >= 90 && posture.overallScore < 95 && 'Good · Minor improvements needed'}
              {posture.overallScore >= 80 && posture.overallScore < 90 && 'Fair · Several areas need attention'}
              {posture.overallScore < 80 && 'Critical · Immediate action required'}
            </p>
          </div>
          <div className="security-score-icon"><Shield size={72} /></div>
        </div>
      </div>

      {/* Active Alerts */}
      {posture.alerts.length > 0 && (
        <div className="security-alert-panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900">Active Security Alerts</h3>
            <span className="security-active-count">
              {posture.alerts.length} Active
            </span>
          </div>
          <div className="space-y-3">
            {posture.alerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                className={`security-alert-row ${getSeverityColor(alert.severity)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase">{alert.severity}</span>
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-xs text-gray-500">{alert.type}</span>
                    </div>
                    <p className="font-medium">{alert.title}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {new Date(alert.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    Acknowledge
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security Metrics Grid */}
      <div className="security-metrics-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Zero Trust */}
        <MetricCard
          icon={<Shield className="w-8 h-8" />}
          title="Zero Trust"
          score={posture.metrics.zeroTrust.score}
          status={`${posture.metrics.zeroTrust.devicesCompliant}/${posture.metrics.zeroTrust.devicesTotal} Compliant`}
          warning={posture.metrics.zeroTrust.highRiskSessions > 0 ? `${posture.metrics.zeroTrust.highRiskSessions} High Risk` : undefined}
        />

        {/* Encryption */}
        <MetricCard
          icon={<Lock className="w-8 h-8" />}
          title="Encryption"
          score={posture.metrics.encryption.score}
          status={`${posture.metrics.encryption.videosEncrypted}/${posture.metrics.encryption.videosTotal} Videos`}
        />

        {/* Certificates */}
        <MetricCard
          icon={<FileText className="w-8 h-8" />}
          title="Certificates"
          score={posture.metrics.certificates.score}
          status={`${posture.metrics.certificates.healthy} Healthy`}
          warning={posture.metrics.certificates.expired > 0 ? `${posture.metrics.certificates.expired} Expired` : undefined}
        />

        {/* Ransomware */}
        <MetricCard
          icon={<AlertTriangle className="w-8 h-8" />}
          title="Ransomware"
          score={posture.metrics.ransomware.available === false ? 0 : posture.metrics.ransomware.activeThreats === 0 ? 100 : 0}
          status={posture.metrics.ransomware.riskLevel}
          warning={posture.metrics.ransomware.available === false ? 'Ransomware evidence unavailable' : posture.metrics.ransomware.activeThreats > 0 ? `${posture.metrics.ransomware.activeThreats} Active Threats` : undefined}
        />

        {/* Tamper Detection */}
        <MetricCard
          icon={<Activity className="w-8 h-8" />}
          title="Tamper Detection"
          score={posture.metrics.tamper.available === false ? 0 : posture.metrics.tamper.criticalEvents === 0 ? 100 : 50}
          status={`${posture.metrics.tamper.activeEvents} Active Events`}
          warning={posture.metrics.tamper.available === false ? 'Tamper evidence unavailable' : posture.metrics.tamper.criticalEvents > 0 ? `${posture.metrics.tamper.criticalEvents} Critical` : undefined}
        />

        {/* Secrets */}
        <MetricCard
          icon={<Key className="w-8 h-8" />}
          title="Secret Vault"
          score={posture.metrics.secrets.status === 'UNAVAILABLE' ? 0 : 100}
          status={posture.metrics.secrets.status}
          warning={posture.metrics.secrets.status === 'UNAVAILABLE' ? 'Secret evidence unavailable' : undefined}
        />

        {/* Secure Boot */}
        <MetricCard
          icon={<HardDrive className="w-8 h-8" />}
          title="Secure Boot"
          score={posture.metrics.secureBoot.score}
          status={`${posture.metrics.secureBoot.compliantDevices}/${posture.metrics.secureBoot.totalDevices} Valid`}
        />

        {/* TPM */}
        <MetricCard
          icon={<Database className="w-8 h-8" />}
          title="TPM Attestation"
          score={posture.metrics.tpm.score}
          status={`${posture.metrics.tpm.attestedDevices}/${posture.metrics.tpm.totalDevices} Attested`}
          warning={posture.metrics.tpm.failedAttestations > 0 ? `${posture.metrics.tpm.failedAttestations} Failed` : undefined}
        />
      </div>

      {/* Quick Actions */}
      <div className="security-quick-actions bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ActionButton icon={<Shield />} label="Zero Trust" href="/compliance/controls" />
          <ActionButton icon={<FileText />} label="Certificates" href="/compliance/certificates" />
          <ActionButton icon={<RefreshCw />} label="Session Security" href="/account/security" />
          <ActionButton icon={<AlertTriangle />} label="Tamper Events" href="/operations/alerts" />
          <ActionButton icon={<Lock />} label="Video Encryption" href="/maintenance/privacy/controls" />
          <ActionButton icon={<Database />} label="Storage Health" href="/operations/storage" />
          <ActionButton icon={<Activity />} label="Threat Alerts" href="/operations/alert-command-center" />
          <ActionButton icon={<Key />} label="Integrations" href="/integrations" />
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  icon: React.ReactNode;
  title: string;
  score: number;
  status: string;
  warning?: string;
}

function MetricCard({ icon, title, score, status, warning }: MetricCardProps) {
  const scoreColor = score >= 95 ? 'tone-positive' : score >= 80 ? 'tone-caution' : 'tone-negative';

  return (
    <div className="security-metric-card bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-gray-600">{icon}</div>
        <span className={`text-2xl font-bold ${scoreColor}`}>{Math.round(score)}</span>
      </div>
      <h4 className="font-semibold text-gray-900 mb-2">{title}</h4>
      <p className="text-sm text-gray-600">{status}</p>
      {warning && (
        <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
          <AlertTriangle className="w-4 h-4" />
          {warning}
        </p>
      )}
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  href: string;
}

function ActionButton({ icon, label, href }: ActionButtonProps) {
  return (
    <a
      href={href}
      className="security-action-link flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <div className="text-blue-600 mb-2">{icon}</div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </a>
  );
}
