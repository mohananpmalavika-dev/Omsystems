'use client';

import { useState, useEffect } from 'react';
import { Activity, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, RefreshCw, Database, Gauge, Zap } from 'lucide-react';

interface EndpointMetrics {
  path: string;
  method: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  latencyPercentiles: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
    mean: number;
  };
  errorRate: number;
}

interface QueryMetrics {
  query: string;
  totalExecutions: number;
  totalDurationMs: number;
  latencyPercentiles: {
    p95: number;
    p99: number;
    mean: number;
  };
  errorCount: number;
}

export function PerformanceObservabilityDashboard() {
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'degraded' | 'critical' | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointMetrics[]>([]);
  const [queries, setQueries] = useState<QueryMetrics[]>([]);
  const [slowEndpoints, setSlowEndpoints] = useState<EndpointMetrics[]>([]);
  const [slowQueries, setSlowQueries] = useState<QueryMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(5000);

  const fetchMetrics = async () => {
    try {
      setError(null);
      
      const [healthRes, endpointsRes, queriesRes, slowEndpointsRes, slowQueriesRes] = await Promise.all([
        fetch('/api/observability/performance/health', { credentials: 'include' }),
        fetch('/api/observability/performance/endpoints', { credentials: 'include' }),
        fetch('/api/observability/performance/queries', { credentials: 'include' }),
        fetch('/api/observability/performance/top-slow-endpoints?limit=10', { credentials: 'include' }),
        fetch('/api/observability/performance/top-slow-queries?limit=10', { credentials: 'include' }),
      ]);

      if (!healthRes.ok) throw new Error('Failed to fetch health metrics');
      const health = await healthRes.json();
      setHealthScore(health.data?.healthScore ?? null);
      setHealthStatus(health.data?.status ?? null);

      if (endpointsRes.ok) {
        const ep = await endpointsRes.json();
        setEndpoints(ep.data?.endpoints ?? []);
      }

      if (queriesRes.ok) {
        const q = await queriesRes.json();
        setQueries(q.data?.queries ?? []);
      }

      if (slowEndpointsRes.ok) {
        const se = await slowEndpointsRes.json();
        setSlowEndpoints(se.data?.endpoints ?? []);
      }

      if (slowQueriesRes.ok) {
        const sq = await slowQueriesRes.json();
        setSlowQueries(sq.data?.queries ?? []);
      }

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch performance metrics');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const statusColor = {
    healthy: 'bg-emerald-950/30 border-emerald-500/30',
    degraded: 'bg-amber-950/30 border-amber-500/30',
    critical: 'bg-rose-950/30 border-rose-500/30',
  };

  const statusIcon = {
    healthy: <CheckCircle2 className="text-emerald-400" size={20} />,
    degraded: <AlertTriangle className="text-amber-400" size={20} />,
    critical: <AlertTriangle className="text-rose-400" size={20} />,
  };

  if (loading && !healthScore) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400">
        <RefreshCw className="mr-2 animate-spin" size={22} /> Loading performance metrics…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Operational Trust Banner */}
      <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">Real-time observability</p>
            <h2 className="mt-1 text-base font-bold text-slate-100">Performance metrics collected live</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/30 px-3 py-1 text-[11px] font-medium text-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Streaming from {endpoints.length} endpoints
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-300">
          Tracks Core Web Vitals, backend latency percentiles (P50/P95/P99), database query performance, and system health in real-time.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-sm text-rose-200">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {/* Health Score Card */}
      <div className={`rounded-xl border p-6 ${healthStatus ? statusColor[healthStatus] : 'border-slate-800 bg-slate-900/90'}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              {healthStatus && statusIcon[healthStatus]}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">System health</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-100 capitalize">{healthStatus || 'unknown'}</h3>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-slate-100">{healthScore ?? '—'}</div>
            <p className="text-xs text-slate-400">health score</p>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Gauge size={16} /> API Endpoints
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-100">{endpoints.length}</div>
          <p className="mt-1 text-xs text-slate-500">tracked</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Database size={16} /> Database Queries
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-100">{queries.length}</div>
          <p className="mt-1 text-xs text-slate-500">monitored</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Zap size={16} /> Avg Error Rate
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-100">
            {endpoints.length > 0 
              ? (endpoints.reduce((sum, e) => sum + e.errorRate, 0) / endpoints.length).toFixed(2)
              : '—'}
            %
          </div>
          <p className="mt-1 text-xs text-slate-500">across endpoints</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Activity size={16} /> Refresh
          </div>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
            className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
          >
            <option value={1000}>Every 1s</option>
            <option value={5000}>Every 5s</option>
            <option value={10000}>Every 10s</option>
            <option value={30000}>Every 30s</option>
          </select>
        </div>
      </div>

      {/* Top Slow Endpoints */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <TrendingDown size={16} className="text-amber-400" />
            Slowest Endpoints (P95 Latency)
          </h3>
          <button
            onClick={fetchMetrics}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {slowEndpoints.length === 0 ? (
          <p className="text-xs text-slate-500">No endpoints tracked yet</p>
        ) : (
          <div className="space-y-3">
            {slowEndpoints.map((endpoint) => (
              <div key={`${endpoint.method}-${endpoint.path}`} className="rounded-lg border border-slate-800 p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-mono text-xs text-slate-300">
                      <span className={`inline-block w-12 font-semibold ${
                        endpoint.method === 'GET' ? 'text-blue-400' :
                        endpoint.method === 'POST' ? 'text-emerald-400' :
                        endpoint.method === 'PUT' ? 'text-amber-400' : 'text-rose-400'
                      }`}>
                        {endpoint.method}
                      </span>{' '}
                      {endpoint.path.substring(0, 50)}
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500">P50:</span>
                        <span className="ml-1 text-slate-300">{endpoint.latencyPercentiles.p50}ms</span>
                      </div>
                      <div>
                        <span className="text-slate-500">P95:</span>
                        <span className="ml-1 text-amber-400">{endpoint.latencyPercentiles.p95}ms</span>
                      </div>
                      <div>
                        <span className="text-slate-500">P99:</span>
                        <span className="ml-1 text-rose-400">{endpoint.latencyPercentiles.p99}ms</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-slate-300">{endpoint.totalRequests} reqs</div>
                    <div className={endpoint.errorRate > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                      {endpoint.errorRate.toFixed(2)}% errors
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Slow Queries */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Database size={16} className="text-blue-400" />
            Slowest Queries (P95 Latency)
          </h3>
          <button
            onClick={fetchMetrics}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {slowQueries.length === 0 ? (
          <p className="text-xs text-slate-500">No queries tracked yet</p>
        ) : (
          <div className="space-y-3">
            {slowQueries.map((query, idx) => (
              <div key={idx} className="rounded-lg border border-slate-800 p-3">
                <p className="font-mono text-[11px] text-slate-400 break-all">{query.query}</p>
                <div className="mt-2 grid grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500">Executions:</span>
                    <span className="ml-1 text-slate-300">{query.totalExecutions}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">P95:</span>
                    <span className="ml-1 text-amber-400">{query.latencyPercentiles.p95}ms</span>
                  </div>
                  <div>
                    <span className="text-slate-500">P99:</span>
                    <span className="ml-1 text-rose-400">{query.latencyPercentiles.p99}ms</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Errors:</span>
                    <span className={`ml-1 ${query.errorCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {query.errorCount}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Understanding the metrics</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="text-xs text-slate-400">
            <span className="font-semibold text-slate-300">P50 / P95 / P99:</span> Latency percentiles. P95 means 95% of requests complete within this time.
          </div>
          <div className="text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Error Rate:</span> Percentage of failed requests (4xx/5xx status codes).
          </div>
          <div className="text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Health Score:</span> 0-100 composite score based on error rate and latency. 80+ is healthy.
          </div>
        </div>
      </div>
    </div>
  );
}
