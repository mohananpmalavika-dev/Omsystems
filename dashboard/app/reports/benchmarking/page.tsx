"use client";

import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/app-layout';
import { PageHero } from '@/components/page-hero';
import { 
  BarChart3, TrendingUp, TrendingDown, Target, Award, AlertTriangle,
  CheckCircle2, RefreshCw, ArrowRight, Shield, Activity, DollarSign
} from 'lucide-react';
import Link from 'next/link';

interface BranchData {
  branch: string;
  rank: number;
  scores: {
    overall: number;
    security: number;
    operations: number;
    cost: number;
  };
  metrics: {
    incidents: number;
    criticalIncidents: number;
    cameras: number;
    uptime: number;
    responseTime: number;
    cost: number;
  };
  status: string;
  percentile: number;
}

interface ReportData {
  period: string;
  metric: string;
  dateRange: { start: string; end: string };
  summary: {
    totalBranches: number;
    avgScore: number;
    topPerformer: {
      branch: string;
      score: number;
      highlights: string[];
    };
    needsImprovement: Array<{
      branch: string;
      score: number;
      issues: string[];
    }>;
  };
  branches: BranchData[];
  comparison: {
    security: { highest: number; lowest: number; average: number; median: number };
    operations: { highest: number; lowest: number; average: number; median: number };
    cost: { highest: number; lowest: number; average: number; median: number };
  };
  insights: Array<{
    type: string;
    title: string;
    message: string;
    action: string;
  }>;
  recommendations: Array<{
    priority: string;
    title: string;
    description: string;
    action: string;
    expectedImpact: string;
    branches?: string[];
  }>;
}

export default function BranchBenchmarkingPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('30d');
  const [metric, setMetric] = useState('overall');

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      const response = await fetch(
        `/api/control/v1/reports/branch-benchmarking?period=${period}&metric=${metric}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-sentinel-session': token || '',
          },
          credentials: 'include',
        }
      );

      if (!response.ok) throw new Error('Failed to load benchmarking data');
      const result = await response.json();
      setData(result.data);
      setError('');
    } catch (err) {
      console.error('[BranchBenchmarking] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load benchmarking data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period, metric]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
            <p className="text-lg">Loading Branch Benchmarking...</p>
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

  return (
    <AppLayout>
      <main className="p-6 space-y-6 max-w-[1800px] mx-auto">
        <PageHero
          eyebrow="Operational MIS"
          title="Branch Performance Benchmarking"
          description="Comparative analysis across all branches to identify top performers and improvement opportunities"
          icon={BarChart3}
          actions={
            <div className="flex gap-3">
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="input">
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
                <option value="12m">Last 12 Months</option>
              </select>
              <select value={metric} onChange={(e) => setMetric(e.target.value)} className="input">
                <option value="overall">Overall Score</option>
                <option value="security">Security</option>
                <option value="operations">Operations</option>
                <option value="cost">Cost Efficiency</option>
              </select>
              <button onClick={loadData} className="btn-primary">
                <RefreshCw size={16} /> Refresh
              </button>
            </div>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="card border-blue-500/50 bg-blue-950/30">
            <div className="text-sm text-gray-400 mb-2">Total Branches</div>
            <div className="text-3xl font-bold text-blue-400">{data.summary.totalBranches}</div>
          </div>
          <div className="card border-green-500/50 bg-green-950/30">
            <div className="text-sm text-gray-400 mb-2">Average Score</div>
            <div className="text-3xl font-bold text-green-400">{data.summary.avgScore}</div>
          </div>
          <div className="card border-purple-500/50 bg-purple-950/30">
            <div className="text-sm text-gray-400 mb-2">Top Performer</div>
            <div className="text-xl font-bold text-purple-400 truncate">{data.summary.topPerformer.branch}</div>
            <div className="text-sm text-gray-400">Score: {data.summary.topPerformer.score}</div>
          </div>
          <div className="card border-red-500/50 bg-red-950/30">
            <div className="text-sm text-gray-400 mb-2">Needs Improvement</div>
            <div className="text-3xl font-bold text-red-400">{data.summary.needsImprovement.length}</div>
          </div>
        </div>

        {/* Top Performer Highlight */}
        {data.summary.topPerformer && (
          <div className="card bg-gradient-to-r from-green-950/40 to-emerald-950/40 border-green-500/50">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-500/20 rounded-lg">
                <Award size={32} className="text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-green-400 mb-2">
                  🏆 Top Performer: {data.summary.topPerformer.branch}
                </h3>
                <div className="flex items-center gap-6 mb-3">
                  <div>
                    <div className="text-sm text-gray-400">Overall Score</div>
                    <div className="text-2xl font-bold text-green-400">{data.summary.topPerformer.score}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.summary.topPerformer.highlights.map((highlight, idx) => (
                    <span key={idx} className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-sm">
                      ✓ {highlight}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Performance Distribution */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Performance Distribution</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <ScoreCard
              title="Security Score"
              data={data.comparison.security}
              icon={Shield}
              color="blue"
            />
            <ScoreCard
              title="Operations Score"
              data={data.comparison.operations}
              icon={Activity}
              color="green"
            />
            <ScoreCard
              title="Cost Efficiency"
              data={data.comparison.cost}
              icon={DollarSign}
              color="purple"
            />
          </div>
        </div>

        {/* Branch Ranking Table */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Branch Performance Rankings</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-2">Rank</th>
                  <th className="text-left py-3 px-2">Branch</th>
                  <th className="text-left py-3 px-2">Overall</th>
                  <th className="text-left py-3 px-2">Security</th>
                  <th className="text-left py-3 px-2">Operations</th>
                  <th className="text-left py-3 px-2">Cost</th>
                  <th className="text-left py-3 px-2">Status</th>
                  <th className="text-left py-3 px-2">Percentile</th>
                </tr>
              </thead>
              <tbody>
                {data.branches.map((branch) => (
                  <tr key={branch.branch} className="border-b border-gray-800 hover:bg-gray-800/30">
                    <td className="py-3 px-2">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                        branch.rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                        branch.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                        branch.rank === 3 ? 'bg-orange-500/20 text-orange-400' :
                        'bg-gray-700 text-gray-400'
                      }`}>
                        {branch.rank}
                      </span>
                    </td>
                    <td className="py-3 px-2 font-medium">{branch.branch}</td>
                    <td className="py-3 px-2">
                      <ScoreBadge score={branch.scores.overall} />
                    </td>
                    <td className="py-3 px-2">
                      <ScoreBadge score={branch.scores.security} />
                    </td>
                    <td className="py-3 px-2">
                      <ScoreBadge score={branch.scores.operations} />
                    </td>
                    <td className="py-3 px-2">
                      <ScoreBadge score={branch.scores.cost} />
                    </td>
                    <td className="py-3 px-2">
                      <StatusBadge status={branch.status} />
                    </td>
                    <td className="py-3 px-2 text-gray-400">
                      {branch.percentile}th
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Needs Improvement Section */}
        {data.summary.needsImprovement.length > 0 && (
          <div className="card border-yellow-500/50 bg-yellow-950/20">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-yellow-400">
              <AlertTriangle size={20} />
              Branches Requiring Attention
            </h3>
            <div className="space-y-3">
              {data.summary.needsImprovement.map((branch, idx) => (
                <div key={idx} className="p-4 bg-yellow-900/20 rounded-lg border border-yellow-500/30">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold">{branch.branch}</h4>
                    <span className="text-lg font-bold text-yellow-400">Score: {branch.score}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {branch.issues.map((issue, i) => (
                      <span key={i} className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-sm">
                        ⚠ {issue}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Insights */}
        {data.insights.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Key Insights</h3>
            <div className="space-y-3">
              {data.insights.map((insight, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${
                    insight.type === 'success'
                      ? 'bg-green-900/20 border-green-500/50'
                      : insight.type === 'warning'
                      ? 'bg-yellow-900/20 border-yellow-500/50'
                      : 'bg-blue-900/20 border-blue-500/50'
                  }`}
                >
                  <h4 className="font-semibold mb-1">{insight.title}</h4>
                  <p className="text-sm text-gray-300 mb-2">{insight.message}</p>
                  <p className="text-xs text-gray-400">
                    <strong>Recommended Action:</strong> {insight.action}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {data.recommendations.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Target size={20} className="text-purple-400" />
              Improvement Recommendations
            </h3>
            <div className="space-y-3">
              {data.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${
                    rec.priority === 'high'
                      ? 'bg-red-900/20 border-red-500/50'
                      : rec.priority === 'medium'
                      ? 'bg-yellow-900/20 border-yellow-500/50'
                      : 'bg-blue-900/20 border-blue-500/50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-xs uppercase tracking-wide text-gray-400">
                        {rec.priority} priority
                      </span>
                      <h4 className="font-semibold">{rec.title}</h4>
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 mb-2">{rec.description}</p>
                  <p className="text-sm text-blue-300 mb-2">
                    <strong>Action:</strong> {rec.action}
                  </p>
                  <p className="text-xs text-green-400">
                    <strong>Expected Impact:</strong> {rec.expectedImpact}
                  </p>
                  {rec.branches && rec.branches.length > 0 && (
                    <div className="mt-2 text-xs text-gray-400">
                      Affected: {rec.branches.join(', ')}
                    </div>
                  )}
                </div>
              ))}
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
            <Link href="/reports/compliance" className="flex items-center justify-between p-3 bg-purple-900/20 hover:bg-purple-900/30 rounded-lg border border-purple-500/30 transition">
              <span className="font-medium">Compliance Scorecard</span>
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

function ScoreCard({
  title,
  data,
  icon: Icon,
  color
}: {
  title: string;
  data: { highest: number; lowest: number; average: number; median: number };
  icon: any;
  color: 'blue' | 'green' | 'purple';
}) {
  const colorClasses = {
    blue: 'border-blue-500/30 bg-blue-950/20',
    green: 'border-green-500/30 bg-green-950/20',
    purple: 'border-purple-500/30 bg-purple-950/20'
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className="text-gray-400" />
        <span className="text-sm font-medium text-gray-300">{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-xs text-gray-400">Highest</div>
          <div className="font-semibold">{data.highest}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Lowest</div>
          <div className="font-semibold">{data.lowest}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Average</div>
          <div className="font-semibold">{data.average}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Median</div>
          <div className="font-semibold">{data.median}</div>
        </div>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 90 ? 'text-green-400' : score >= 70 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`font-semibold ${color}`}>{score}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig = {
    'excellent': { label: 'Excellent', class: 'bg-green-500/20 text-green-400 border-green-500/50' },
    'good': { label: 'Good', class: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
    'fair': { label: 'Fair', class: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' },
    'needs-improvement': { label: 'Needs Improvement', class: 'bg-red-500/20 text-red-400 border-red-500/50' }
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['fair'];

  return (
    <span className={`px-2 py-1 rounded text-xs border ${config.class}`}>
      {config.label}
    </span>
  );
}
