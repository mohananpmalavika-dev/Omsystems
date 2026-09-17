"use client";

import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/app-layout';
import { PageHero } from '@/components/page-hero';
import { 
  LayoutDashboard, TrendingUp, TrendingDown, AlertTriangle, 
  CheckCircle2, Clock, Shield, Activity, DollarSign, Target,
  Camera, AlertCircle, RefreshCw, ArrowRight, Zap
} from 'lucide-react';
import Link from 'next/link';

interface KPI {
  score: number;
  change: number;
  trend: 'up' | 'down' | 'stable';
  status: 'good' | 'warning' | 'critical';
  components?: any;
}

interface DashboardData {
  lastUpdated: string;
  kpis: {
    securityPosture: KPI;
    operationalEfficiency: any;
    financialHealth: any;
    riskIndicators: any;
  };
  quickStats: {
    totalCameras: number;
    activeCameras: number;
    camerasWithIssues: number;
    totalIncidents24h: number;
    criticalIncidents: number;
    unresolvedIncidents: number;
    systemHealth: number;
  };
  attentionRequired: Array<{
    id: string;
    type: string;
    severity: string;
    location: string;
    timestamp: string;
    resolved: boolean;
  }>;
  trends: {
    incidents: Array<{ date: string; count: number }>;
    responseTime: { trend: Array<{ date: string; seconds: number }> };
  };
  branches: {
    topPerformers: Array<{ branch: string; incidentCount: number; criticalCount: number }>;
    needsAttention: Array<{ branch: string; incidentCount: number; criticalCount: number }>;
  };
  insights: Array<{
    type: 'success' | 'warning' | 'critical' | 'info';
    category: string;
    title: string;
    message: string;
    action: string;
  }>;
}

export default function MISDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadDashboard = async () => {
    try {
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      const response = await fetch('/api/control/v1/reports/executive-kpi', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-sentinel-session': token || '',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load dashboard data');
      }

      const result = await response.json();
      setData(result.data);
      setError('');
    } catch (err) {
      console.error('[MISDashboard] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      loadDashboard();
    }, 60000); // Refresh every minute

    return () => clearInterval(interval);
  }, [autoRefresh]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
            <p className="text-lg">Loading Executive Dashboard...</p>
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
            <button onClick={loadDashboard} className="mt-3 btn-primary">
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
          eyebrow="Management Information System"
          title="Executive Dashboard"
          description="Real-time security operations and business intelligence for C-suite visibility"
          icon={LayoutDashboard}
          actions={
            <div className="flex gap-3 items-center">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                Auto-refresh
              </label>
              <button onClick={loadDashboard} className="btn-secondary">
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          }
        />

        {/* Last Updated */}
        <div className="text-sm text-gray-400">
          Last updated: {new Date(data.lastUpdated).toLocaleString()}
        </div>

        {/* Top-Level KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Security Posture */}
          <KPICard
            title="Security Posture"
            value={data.kpis.securityPosture.score}
            unit="%"
            change={data.kpis.securityPosture.change}
            trend={data.kpis.securityPosture.trend}
            status={data.kpis.securityPosture.status}
            icon={Shield}
            subtitle="Incident trend, coverage, response time"
          />

          {/* Operational Efficiency */}
          <KPICard
            title="Operational Efficiency"
            value={data.kpis.operationalEfficiency.score}
            unit="%"
            change={data.kpis.operationalEfficiency.change}
            trend={data.kpis.operationalEfficiency.trend}
            status={data.kpis.operationalEfficiency.score > 90 ? 'good' : 'warning'}
            icon={Activity}
            subtitle={`${data.kpis.operationalEfficiency.uptime}% uptime • ${data.kpis.operationalEfficiency.avgResponseTime}s avg response`}
          />

          {/* System Health */}
          <KPICard
            title="System Health"
            value={data.quickStats.systemHealth}
            unit="%"
            change={0}
            trend="stable"
            status={data.quickStats.systemHealth > 95 ? 'good' : data.quickStats.systemHealth > 90 ? 'warning' : 'critical'}
            icon={Target}
            subtitle={`${data.quickStats.activeCameras}/${data.quickStats.totalCameras} cameras active`}
          />

          {/* Active Incidents */}
          <KPICard
            title="Active Incidents"
            value={data.quickStats.unresolvedIncidents}
            change={0}
            trend={data.quickStats.criticalIncidents > 0 ? 'up' : 'stable'}
            status={data.quickStats.criticalIncidents > 0 ? 'critical' : data.quickStats.unresolvedIncidents > 10 ? 'warning' : 'good'}
            icon={AlertTriangle}
            subtitle={`${data.quickStats.criticalIncidents} critical • ${data.quickStats.totalIncidents24h} in 24h`}
            highlight={data.quickStats.criticalIncidents > 0}
          />
        </div>

        {/* Quick Stats Bar */}
        <div className="card bg-gradient-to-r from-blue-950/40 to-indigo-950/40 border-blue-500/30">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <QuickStat label="Total Cameras" value={data.quickStats.totalCameras} icon={Camera} />
            <QuickStat label="Active" value={data.quickStats.activeCameras} icon={CheckCircle2} status="good" />
            <QuickStat label="With Issues" value={data.quickStats.camerasWithIssues} icon={AlertCircle} status={data.quickStats.camerasWithIssues > 0 ? 'warning' : 'good'} />
            <QuickStat label="24h Incidents" value={data.quickStats.totalIncidents24h} icon={Zap} />
            <QuickStat label="Critical" value={data.quickStats.criticalIncidents} icon={AlertTriangle} status={data.quickStats.criticalIncidents > 0 ? 'critical' : 'good'} />
            <QuickStat label="Unresolved" value={data.quickStats.unresolvedIncidents} icon={Clock} status={data.quickStats.unresolvedIncidents > 10 ? 'warning' : 'good'} />
            <QuickStat label="System Health" value={`${data.quickStats.systemHealth}%`} icon={Activity} status={data.quickStats.systemHealth > 95 ? 'good' : 'warning'} />
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Left Column: Charts & Trends */}
          <div className="lg:col-span-2 space-y-5">
            {/* Incident Trend Chart */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp size={20} />
                Incident Trend (7 Days)
              </h3>
              {data.trends.incidents.length > 0 ? (
                <div className="space-y-2">
                  {data.trends.incidents.map((day) => (
                    <div key={day.date} className="flex items-center gap-3">
                      <span className="text-sm w-24 text-gray-400">{new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-8 relative overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-blue-600 to-blue-400 h-full rounded-full flex items-center px-3"
                          style={{ width: `${Math.min(100, (day.count / Math.max(...data.trends.incidents.map(d => d.count))) * 100)}%` }}
                        >
                          <span className="text-sm font-semibold">{day.count}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400">No incident data available</p>
              )}
            </div>

            {/* Branch Performance */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Branch Performance</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-green-400 mb-2">✓ Top Performers (Low Incidents)</h4>
                  <div className="space-y-2">
                    {data.branches.topPerformers.map((branch, idx) => (
                      <div key={idx} className="flex justify-between text-sm p-2 bg-green-900/20 rounded border border-green-500/30">
                        <span className="font-medium">{branch.branch}</span>
                        <span className="text-green-400">{branch.incidentCount} incidents</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-red-400 mb-2">⚠ Needs Attention (High Incidents)</h4>
                  <div className="space-y-2">
                    {data.branches.needsAttention.map((branch, idx) => (
                      <div key={idx} className="flex justify-between text-sm p-2 bg-red-900/20 rounded border border-red-500/30">
                        <span className="font-medium">{branch.branch}</span>
                        <span className="text-red-400">{branch.incidentCount} incidents</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Insights & Recommendations */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Zap size={20} className="text-yellow-400" />
                AI Insights & Recommendations
              </h3>
              <div className="space-y-3">
                {data.insights.map((insight, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border ${
                      insight.type === 'critical' ? 'bg-red-900/20 border-red-500/50' :
                      insight.type === 'warning' ? 'bg-yellow-900/20 border-yellow-500/50' :
                      insight.type === 'success' ? 'bg-green-900/20 border-green-500/50' :
                      'bg-blue-900/20 border-blue-500/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl mt-1">
                        {insight.type === 'critical' ? '🔴' : insight.type === 'warning' ? '⚠️' : insight.type === 'success' ? '✅' : 'ℹ️'}
                      </span>
                      <div className="flex-1">
                        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{insight.category}</div>
                        <h4 className="font-semibold mb-1">{insight.title}</h4>
                        <p className="text-sm text-gray-300 mb-2">{insight.message}</p>
                        <p className="text-xs text-gray-400">
                          <strong>Action:</strong> {insight.action}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {data.insights.length === 0 && (
                  <div className="text-center py-6 text-gray-400">
                    <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
                    <p>All systems operating normally. No immediate actions required.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Alerts & Actions */}
          <div className="space-y-5">
            {/* Attention Required */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle size={20} className="text-red-400" />
                Attention Required ({data.attentionRequired.length})
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {data.attentionRequired.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border text-sm ${
                      alert.severity === 'critical' 
                        ? 'bg-red-900/30 border-red-500/50' 
                        : 'bg-yellow-900/30 border-yellow-500/50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className={`font-semibold ${alert.severity === 'critical' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {alert.type}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-gray-300">{alert.location}</p>
                    <Link href={`/incidents/${alert.id}`} className="text-blue-400 hover:underline text-xs flex items-center gap-1 mt-2">
                      View Details <ArrowRight size={12} />
                    </Link>
                  </div>
                ))}
                {data.attentionRequired.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
                    <p>No critical alerts</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <Link href="/reports" className="block p-3 bg-blue-900/30 hover:bg-blue-900/50 rounded-lg border border-blue-500/30 transition">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Generate Report</span>
                    <ArrowRight size={16} />
                  </div>
                </Link>
                <Link href="/operations/alerts" className="block p-3 bg-blue-900/30 hover:bg-blue-900/50 rounded-lg border border-blue-500/30 transition">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">View All Alerts</span>
                    <ArrowRight size={16} />
                  </div>
                </Link>
                <Link href="/operations/cameras" className="block p-3 bg-blue-900/30 hover:bg-blue-900/50 rounded-lg border border-blue-500/30 transition">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Camera Status</span>
                    <ArrowRight size={16} />
                  </div>
                </Link>
                <Link href="/maintenance" className="block p-3 bg-blue-900/30 hover:bg-blue-900/50 rounded-lg border border-blue-500/30 transition">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Maintenance Dashboard</span>
                    <ArrowRight size={16} />
                  </div>
                </Link>
              </div>
            </div>

            {/* Additional MIS Reports */}
            <div className="card bg-gradient-to-br from-purple-950/30 to-pink-950/30 border-purple-500/30">
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <DollarSign size={20} />
                Advanced MIS Reports
              </h3>
              <p className="text-sm text-gray-300 mb-3">
                Explore detailed analytics, financial reports, and compliance tracking
              </p>
              <div className="space-y-2">
                <Link href="/reports/mis/financial" className="block text-sm text-purple-400 hover:underline">
                  → Financial TCO Report
                </Link>
                <Link href="/reports/mis/compliance" className="block text-sm text-purple-400 hover:underline">
                  → Compliance Scorecard
                </Link>
                <Link href="/reports/mis/ai-analytics" className="block text-sm text-purple-400 hover:underline">
                  → AI Analytics Performance
                </Link>
                <Link href="/reports/mis/benchmarking" className="block text-sm text-purple-400 hover:underline">
                  → Branch Benchmarking
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}

// ========================
// Sub-components
// ========================

function KPICard({
  title,
  value,
  unit = '',
  change,
  trend,
  status,
  icon: Icon,
  subtitle,
  highlight = false
}: {
  title: string;
  value: number;
  unit?: string;
  change: number;
  trend: 'up' | 'down' | 'stable';
  status: 'good' | 'warning' | 'critical';
  icon: any;
  subtitle?: string;
  highlight?: boolean;
}) {
  const statusColors = {
    good: 'border-green-500/50 bg-green-950/30',
    warning: 'border-yellow-500/50 bg-yellow-950/30',
    critical: 'border-red-500/50 bg-red-950/30'
  };

  const statusTextColors = {
    good: 'text-green-400',
    warning: 'text-yellow-400',
    critical: 'text-red-400'
  };

  return (
    <div className={`card ${statusColors[status]} ${highlight ? 'ring-2 ring-red-500 animate-pulse' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${status === 'good' ? 'bg-green-500/20' : status === 'warning' ? 'bg-yellow-500/20' : 'bg-red-500/20'}`}>
            <Icon size={20} className={statusTextColors[status]} />
          </div>
          <span className="text-sm text-gray-400">{title}</span>
        </div>
        {change !== 0 && (
          <div className={`flex items-center gap-1 text-xs ${change > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {trend === 'up' ? <TrendingUp size={14} /> : trend === 'down' ? <TrendingDown size={14} /> : null}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
      <div className={`text-3xl font-bold ${statusTextColors[status]} mb-1`}>
        {value}{unit}
      </div>
      {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}

function QuickStat({
  label,
  value,
  icon: Icon,
  status
}: {
  label: string;
  value: number | string;
  icon: any;
  status?: 'good' | 'warning' | 'critical';
}) {
  const statusColors = {
    good: 'text-green-400',
    warning: 'text-yellow-400',
    critical: 'text-red-400'
  };

  return (
    <div className="flex flex-col items-center text-center">
      <Icon size={20} className={status ? statusColors[status] : 'text-gray-400'} />
      <div className={`text-xl font-bold mt-1 ${status ? statusColors[status] : ''}`}>{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
