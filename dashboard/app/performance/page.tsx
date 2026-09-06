import { Metadata } from 'next';
import { PerformanceObservabilityDashboard } from '@/components/performance-observability-dashboard';
import { AppLayout } from '@/components/app-layout';

export const metadata: Metadata = {
  title: 'Performance Observability - Sentinel Grid',
  description: 'Real-time performance metrics, latency percentiles, and system health monitoring',
};

export default function PerformancePage() {
  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-950 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-100">Performance Observability</h1>
            <p className="mt-2 text-sm text-slate-400">
              Real-time performance metrics, API latency percentiles, database query analysis, and system health
            </p>
          </div>

          <PerformanceObservabilityDashboard />
        </div>
      </div>
    </AppLayout>
  );
}
