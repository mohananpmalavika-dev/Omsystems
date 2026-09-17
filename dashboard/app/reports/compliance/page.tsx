"use client";

import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/app-layout';
import { PageHero } from '@/components/page-hero';
import { 
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock,
  RefreshCw, FileText, Target, TrendingUp, ArrowRight, Zap
} from 'lucide-react';
import Link from 'next/link';

interface ComplianceCheck {
  id: string;
  requirement: string;
  status: 'pass' | 'fail' | 'n/a';
  score: number;
  findings: string[];
  regulation: string;
}

interface ComplianceDomain {
  score: number;
  status: 'compliant' | 'warning' | 'non-compliant';
  checks: ComplianceCheck[];
  violations: number;
}

interface ComplianceGap {
  id: string;
  domain: string;
  requirement: string;
  regulation: string;
  findings: string[];
  severity: 'high' | 'medium' | 'low';
  evidenceAttached: boolean;
  remediation: null | any;
}

interface RemediationAction {
  gapId: string;
  priority: 'immediate' | 'planned';
  actions: string[];
  assignedTo: string | null;
  dueDate: string;
  status: 'open' | 'in-progress' | 'completed';
}

interface ScorecardData {
  generatedAt: string;
  period: string;
  dateRange: { start: string; end: string };
  overall: {
    score: number;
    status: 'compliant' | 'warning' | 'non-compliant';
    trend: string;
    lastAudit: string | null;
  };
  domains: {
    banking: ComplianceDomain;
    privacy: ComplianceDomain;
    safety: ComplianceDomain;
    technical: ComplianceDomain;
  };
  gaps: ComplianceGap[];
  remediationActions: RemediationAction[];
  auditReadiness: {
    score: number;
    missingEvidence: number;
    openFindings: number;
    estimatedAuditDays: number;
  };
}

export default function ComplianceScorecardPage() {
  const [data, setData] = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      const response = await fetch('/api/control/v1/reports/compliance-scorecard', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-sentinel-session': token || '',
        },
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to load compliance scorecard');
      const result = await response.json();
      setData(result.data);
      setError('');
    } catch (err) {
      console.error('[ComplianceScorecard] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load compliance scorecard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
            <p className="text-lg">Loading Compliance Scorecard...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-4">
            <p className="text-red-300">❌ {error || 'No data available'}</p>
            <button onClick={loadData} className="mt-3 btn-primary">
              <RefreshCw size={16} /> Retry
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const domainsList = [
    { key: 'banking', name: 'Banking & Financial', icon: ShieldCheck, data: data.domains.banking },
    { key: 'privacy', name: 'Data Privacy (GDPR)', icon: ShieldCheck, data: data.domains.privacy },
    { key: 'safety', name: 'Workplace Safety (OSHA)', icon: ShieldCheck, data: data.domains.safety },
    { key: 'technical', name: 'Technical Standards', icon: ShieldCheck, data: data.domains.technical }
  ];

  return (
    <AppLayout>
      <main className="p-6 space-y-6 max-w-[1800px] mx-auto">
        <PageHero
          eyebrow="Compliance & Audit"
          title="Compliance Scorecard"
          description="Real-time compliance tracking across regulatory domains with audit readiness assessment"
          icon={ShieldCheck}
          actions={
            <div className="flex gap-3">
              <button onClick={loadData} className="btn-primary">
                <RefreshCw size={16} /> Refresh
              </button>
            </div>
          }
        />

        {/* Overall Compliance Score */}
        <div className={`card border-2 ${
          data.overall.status === 'compliant' 
            ? 'border-green-500/50 bg-gradient-to-r from-green-950/40 to-emerald-950/40'
            : data.overall.status === 'warning'
            ? 'border-yellow-500/50 bg-gradient-to-r from-yellow-950/40 to-orange-950/40'
            : 'border-red-500/50 bg-gradient-to-r from-red-950/40 to-pink-950/40'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-400 mb-2">Overall Compliance Score</div>
              <div className={`text-6xl font-bold mb-2 ${
                data.overall.status === 'compliant' ? 'text-green-400' :
                data.overall.status === 'warning' ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {data.overall.score}%
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={data.overall.status} />
                <span className="text-sm text-gray-400">
                  {data.gaps.length} open finding{data.gaps.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-400 mb-2">Audit Readiness</div>
              <div className="text-4xl font-bold text-blue-400 mb-2">
                {data.auditReadiness.score}%
              </div>
              <div className="text-xs text-gray-400">
                Estimated {data.auditReadiness.estimatedAuditDays} days to full compliance
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card bg-blue-950/30 border-blue-500/30">
            <div className="text-sm text-gray-400 mb-1">Compliant Domains</div>
            <div className="text-2xl font-bold text-blue-400">
              {Object.values(data.domains).filter(d => d.status === 'compliant').length}/4
            </div>
          </div>
          <div className="card bg-red-950/30 border-red-500/30">
            <div className="text-sm text-gray-400 mb-1">Total Violations</div>
            <div className="text-2xl font-bold text-red-400">
              {Object.values(data.domains).reduce((sum, d) => sum + d.violations, 0)}
            </div>
          </div>
          <div className="card bg-yellow-950/30 border-yellow-500/30">
            <div className="text-sm text-gray-400 mb-1">Missing Evidence</div>
            <div className="text-2xl font-bold text-yellow-400">
              {data.auditReadiness.missingEvidence}
            </div>
          </div>
          <div className="card bg-purple-950/30 border-purple-500/30">
            <div className="text-sm text-gray-400 mb-1">Remediation Actions</div>
            <div className="text-2xl font-bold text-purple-400">
              {data.remediationActions.length}
            </div>
          </div>
        </div>

        {/* Compliance Domains */}
        <div className="grid lg:grid-cols-2 gap-5">
          {domainsList.map(({ key, name, icon: Icon, data: domainData }) => (
            <div key={key} className={`card border ${
              domainData.status === 'compliant' 
                ? 'border-green-500/50 bg-green-950/20'
                : domainData.status === 'warning'
                ? 'border-yellow-500/50 bg-yellow-950/20'
                : 'border-red-500/50 bg-red-950/20'
            }`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    domainData.status === 'compliant' ? 'bg-green-500/20' :
                    domainData.status === 'warning' ? 'bg-yellow-500/20' : 'bg-red-500/20'
                  }`}>
                    <Icon size={24} className={
                      domainData.status === 'compliant' ? 'text-green-400' :
                      domainData.status === 'warning' ? 'text-yellow-400' : 'text-red-400'
                    } />
                  </div>
                  <div>
                    <h3 className="font-semibold">{name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={domainData.status} />
                      {domainData.violations > 0 && (
                        <span className="text-xs text-red-400">
                          {domainData.violations} violation{domainData.violations !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold" style={{
                    color: domainData.status === 'compliant' ? '#4ade80' :
                           domainData.status === 'warning' ? '#fbbf24' : '#f87171'
                  }}>
                    {domainData.score}%
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {domainData.checks.map((check) => (
                  <div key={check.id} className={`p-3 rounded-lg border text-sm ${
                    check.status === 'pass' 
                      ? 'bg-green-900/20 border-green-500/30'
                      : check.status === 'fail'
                      ? 'bg-red-900/20 border-red-500/30'
                      : 'bg-gray-800/30 border-gray-600/30'
                  }`}>
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-start gap-2 flex-1">
                        {check.status === 'pass' ? (
                          <CheckCircle2 size={16} className="text-green-400 mt-0.5 shrink-0" />
                        ) : check.status === 'fail' ? (
                          <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                        ) : (
                          <Clock size={16} className="text-gray-400 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <div className="font-medium">{check.requirement}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{check.regulation}</div>
                        </div>
                      </div>
                      <div className={`text-sm font-semibold ${
                        check.score >= 95 ? 'text-green-400' :
                        check.score >= 85 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {check.score}%
                      </div>
                    </div>
                    {check.findings.length > 0 && (
                      <div className="mt-2 ml-6 space-y-1">
                        {check.findings.map((finding, idx) => (
                          <div key={idx} className="text-xs text-red-300 flex items-start gap-1">
                            <span className="mt-0.5">•</span>
                            <span>{finding}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Compliance Gaps */}
        {data.gaps.length > 0 && (
          <div className="card border-red-500/50 bg-red-950/20">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-400">
              <AlertTriangle size={20} />
              Compliance Gaps Requiring Attention ({data.gaps.length})
            </h3>
            <div className="space-y-3">
              {data.gaps.map((gap, idx) => (
                <div key={idx} className={`p-4 rounded-lg border ${
                  gap.severity === 'high' 
                    ? 'bg-red-900/30 border-red-500/50'
                    : gap.severity === 'medium'
                    ? 'bg-yellow-900/30 border-yellow-500/50'
                    : 'bg-blue-900/30 border-blue-500/50'
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs uppercase font-semibold ${
                          gap.severity === 'high' ? 'bg-red-500/20 text-red-400' :
                          gap.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {gap.severity} severity
                        </span>
                        <span className="text-xs text-gray-400">{gap.domain}</span>
                      </div>
                      <h4 className="font-semibold">{gap.requirement}</h4>
                      <p className="text-xs text-gray-400 mt-1">{gap.regulation}</p>
                    </div>
                    {!gap.evidenceAttached && (
                      <div className="text-xs text-yellow-400 flex items-center gap-1">
                        <FileText size={14} />
                        Evidence Required
                      </div>
                    )}
                  </div>
                  {gap.findings.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {gap.findings.map((finding, i) => (
                        <div key={i} className="text-sm text-gray-300 flex items-start gap-2">
                          <span className="text-red-400 mt-0.5">→</span>
                          <span>{finding}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Remediation Actions */}
        {data.remediationActions.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Target size={20} className="text-blue-400" />
              Remediation Action Plan
            </h3>
            <div className="space-y-4">
              {data.remediationActions.map((action, idx) => {
                const relatedGap = data.gaps.find(g => g.id === action.gapId);
                return (
                  <div key={idx} className={`p-4 rounded-lg border ${
                    action.priority === 'immediate'
                      ? 'bg-red-900/20 border-red-500/50'
                      : 'bg-blue-900/20 border-blue-500/50'
                  }`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs uppercase font-semibold ${
                            action.priority === 'immediate' 
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {action.priority}
                          </span>
                          <span className="text-xs text-gray-400">
                            Due: {new Date(action.dueDate).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="font-semibold">{relatedGap?.requirement || action.gapId}</h4>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        action.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/50' :
                        action.status === 'in-progress' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' :
                        'bg-gray-500/20 text-gray-400 border border-gray-500/50'
                      }`}>
                        {action.status}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-gray-300">Action Steps:</div>
                      {action.actions.map((step, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-blue-400 mt-0.5">{i + 1}.</span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Success State */}
        {data.gaps.length === 0 && (
          <div className="card bg-gradient-to-r from-green-950/40 to-emerald-950/40 border-green-500/50">
            <div className="text-center py-8">
              <CheckCircle2 size={64} className="mx-auto mb-4 text-green-400" />
              <h3 className="text-2xl font-bold text-green-400 mb-2">
                ✓ Fully Compliant
              </h3>
              <p className="text-gray-300 mb-4">
                All regulatory requirements are currently being met. Continue monitoring to maintain compliance.
              </p>
              <div className="flex justify-center gap-3">
                <button className="btn-secondary">
                  <FileText size={16} /> Generate Compliance Certificate
                </button>
                <button className="btn-primary">
                  <Target size={16} /> Schedule Next Audit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Related Reports */}
        <div className="card bg-gradient-to-br from-purple-950/30 to-pink-950/30 border-purple-500/30">
          <h3 className="text-lg font-semibold mb-3">Related MIS Reports</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <Link href="/reports/financial" className="flex items-center justify-between p-3 bg-purple-900/20 hover:bg-purple-900/30 rounded-lg border border-purple-500/30 transition">
              <span className="font-medium">Financial TCO Report</span>
              <ArrowRight size={16} />
            </Link>
            <Link href="/reports/benchmarking" className="flex items-center justify-between p-3 bg-purple-900/20 hover:bg-purple-900/30 rounded-lg border border-purple-500/30 transition">
              <span className="font-medium">Branch Benchmarking</span>
              <ArrowRight size={16} />
            </Link>
            <Link href="/mis-dashboard" className="flex items-center justify-between p-3 bg-purple-900/20 hover:bg-purple-900/30 rounded-lg border border-purple-500/30 transition">
              <span className="font-medium">Executive Dashboard</span>
              <ArrowRight size={16} />
            </Link>
            <Link href="/reports" className="flex items-center justify-between p-3 bg-purple-900/20 hover:bg-purple-900/30 rounded-lg border border-purple-500/30 transition">
              <span className="font-medium">All Reports</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}

// ========================
// Sub-components
// ========================

function StatusBadge({ status }: { status: 'compliant' | 'warning' | 'non-compliant' }) {
  const config = {
    'compliant': { label: 'Compliant', class: 'bg-green-500/20 text-green-400 border-green-500/50' },
    'warning': { label: 'Warning', class: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' },
    'non-compliant': { label: 'Non-Compliant', class: 'bg-red-500/20 text-red-400 border-red-500/50' }
  };

  const { label, class: className } = config[status];

  return (
    <span className={`px-2 py-1 rounded text-xs font-semibold border ${className}`}>
      {label}
    </span>
  );
}
