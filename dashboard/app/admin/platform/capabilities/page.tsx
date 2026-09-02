'use client';

import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FlaskConical,
  Sparkles,
  Layers,
  Database,
  Cpu,
  Boxes,
  ExternalLink,
  ChevronRight,
  X,
  FileCheck2,
  Wrench,
  Info,
} from 'lucide-react';
import { useCapabilities } from '@/hooks/useCapabilities';
import {
  CapabilityMaturity,
  CapabilityRuntimeState,
  type CapabilityCategory,
  type PlatformCapability,
} from '@/types/platform-capabilities';
import { CapabilityBadge } from '@/components/capability/CapabilityBadge';

export default function PlatformCapabilitiesPage() {
  const { capabilityList, summary, loading, error, refresh } = useCapabilities();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedMaturity, setSelectedMaturity] = useState<string>('ALL');
  const [selectedRuntime, setSelectedRuntime] = useState<string>('ALL');
  const [activeCapability, setActiveCapability] = useState<PlatformCapability | null>(null);

  // Filter capabilities
  const filteredCapabilities = useMemo(() => {
    return capabilityList.filter((cap) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesQuery =
          cap.name.toLowerCase().includes(q) ||
          cap.id.toLowerCase().includes(q) ||
          cap.description.toLowerCase().includes(q) ||
          (cap.owner && cap.owner.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }

      // Category filter
      if (selectedCategory !== 'ALL' && cap.category !== selectedCategory) {
        return false;
      }

      // Maturity filter
      if (selectedMaturity !== 'ALL' && cap.maturity !== selectedMaturity) {
        return false;
      }

      // Runtime filter
      if (selectedRuntime !== 'ALL' && cap.runtime.state !== selectedRuntime) {
        return false;
      }

      return true;
    });
  }, [capabilityList, searchQuery, selectedCategory, selectedMaturity, selectedRuntime]);

  const categories: CapabilityCategory[] = [
    'VIDEO',
    'RECORDING',
    'EVIDENCE',
    'ANALYTICS',
    'HA',
    'SECURITY',
    'OPERATIONS',
    'EDGE',
    'STORAGE',
    'INTEGRATION',
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Platform Capability Truth Matrix
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Authoritative P0
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Real-time release maturity, evidence verification, and operational health diagnostics.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refresh()}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Truth
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mt-6 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-6">
        <MetricCard
          title="Total Capabilities"
          value={summary?.total ?? capabilityList.length}
          subtitle="Registered"
          color="slate"
        />
        <MetricCard
          title="Production"
          value={summary?.byMaturity.production ?? capabilityList.filter((c) => c.maturity === CapabilityMaturity.PRODUCTION).length}
          subtitle="Verified Ready"
          color="emerald"
        />
        <MetricCard
          title="Beta"
          value={summary?.byMaturity.beta ?? capabilityList.filter((c) => c.maturity === CapabilityMaturity.BETA).length}
          subtitle="Active Hardening"
          color="blue"
        />
        <MetricCard
          title="Experimental"
          value={summary?.byMaturity.experimental ?? capabilityList.filter((c) => c.maturity === CapabilityMaturity.EXPERIMENTAL).length}
          subtitle="Controlled Testing"
          color="purple"
        />
        <MetricCard
          title="Not Implemented"
          value={summary?.byMaturity.notImplemented ?? capabilityList.filter((c) => c.maturity === CapabilityMaturity.NOT_IMPLEMENTED).length}
          subtitle="Gated / Missing"
          color="rose"
        />
        <MetricCard
          title="Runtime Healthy"
          value={summary?.byRuntimeState.healthy ?? capabilityList.filter((c) => c.runtime.state === CapabilityRuntimeState.HEALTHY).length}
          subtitle="Operational"
          color="emerald"
        />
        <MetricCard
          title="Runtime Degraded"
          value={summary?.byRuntimeState.degraded ?? capabilityList.filter((c) => c.runtime.state === CapabilityRuntimeState.DEGRADED).length}
          subtitle="Performance Impaired"
          color="amber"
        />
        <MetricCard
          title="Runtime Down"
          value={summary?.byRuntimeState.down ?? capabilityList.filter((c) => c.runtime.state === CapabilityRuntimeState.DOWN).length}
          subtitle="Service Alert"
          color="rose"
        />
      </div>

      {/* Filters & Search */}
      <div className="mt-8 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search capability name, ID, description, owner..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Category */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-xs font-medium text-slate-300 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="ALL">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Maturity */}
          <select
            value={selectedMaturity}
            onChange={(e) => setSelectedMaturity(e.target.value)}
            className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-xs font-medium text-slate-300 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="ALL">All Maturities</option>
            <option value={CapabilityMaturity.PRODUCTION}>Production</option>
            <option value={CapabilityMaturity.BETA}>Beta</option>
            <option value={CapabilityMaturity.EXPERIMENTAL}>Experimental</option>
            <option value={CapabilityMaturity.NOT_IMPLEMENTED}>Not Implemented</option>
          </select>

          {/* Runtime State */}
          <select
            value={selectedRuntime}
            onChange={(e) => setSelectedRuntime(e.target.value)}
            className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-lg text-xs font-medium text-slate-300 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="ALL">All Runtime States</option>
            <option value={CapabilityRuntimeState.HEALTHY}>Healthy</option>
            <option value={CapabilityRuntimeState.DEGRADED}>Degraded</option>
            <option value={CapabilityRuntimeState.DOWN}>Down</option>
            <option value={CapabilityRuntimeState.NOT_CONFIGURED}>Not Configured</option>
            <option value={CapabilityRuntimeState.DISABLED}>Disabled</option>
          </select>
        </div>
      </div>

      {/* Capabilities Table */}
      <div className="mt-4 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/90 text-xs font-semibold uppercase text-slate-400 border-b border-slate-800 tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Capability</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Product Maturity</th>
                <th className="py-3.5 px-4">Runtime Health</th>
                <th className="py-3.5 px-4">Implementation</th>
                <th className="py-3.5 px-4">Verification</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredCapabilities.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No capabilities matched the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredCapabilities.map((cap) => (
                  <tr
                    key={cap.id}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    onClick={() => setActiveCapability(cap)}
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-white group-hover:text-emerald-400 transition-colors">
                        {cap.name}
                      </div>
                      <div className="text-xs font-mono text-slate-500 mt-0.5">{cap.id}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                        {cap.category}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <CapabilityBadge maturity={cap.maturity} size="sm" />
                    </td>

                    <td className="py-3.5 px-4">
                      <CapabilityBadge runtimeState={cap.runtime.state} size="sm" />
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Pill label="BE" active={cap.implementation.backend} />
                        <Pill label="FE" active={cap.implementation.frontend} />
                        <Pill label="API" active={cap.implementation.api} />
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Pill label="Unit" active={cap.verification.unitTests} />
                        <Pill label="Int" active={cap.verification.integrationTests} />
                        <Pill label="E2E" active={cap.verification.e2eTests} />
                        <Pill label="Dep" active={cap.verification.productionDependencyVerified} />
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveCapability(cap);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        title="View Full Diagnostics"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Slide-Over Drawer */}
      {activeCapability && (
        <CapabilityDetailsDrawer
          capability={activeCapability}
          onClose={() => setActiveCapability(null)}
        />
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: number;
  subtitle: string;
  color: 'slate' | 'emerald' | 'blue' | 'purple' | 'rose' | 'amber';
}) {
  const colorMap = {
    slate: 'border-slate-800 bg-slate-900/40 text-slate-100',
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
    blue: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
    purple: 'border-purple-500/20 bg-purple-500/5 text-purple-400',
    rose: 'border-rose-500/20 bg-rose-500/5 text-rose-400',
    amber: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
  };

  return (
    <div className={`p-3.5 rounded-xl border ${colorMap[color]} flex flex-col justify-between`}>
      <div className="text-[11px] font-medium text-slate-400 truncate">{title}</div>
      <div className="text-xl font-bold my-1">{value}</div>
      <div className="text-[10px] text-slate-500 truncate">{subtitle}</div>
    </div>
  );
}

function Pill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
        active
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          : 'bg-slate-800/40 text-slate-600 border-slate-800'
      }`}
    >
      {label}
    </span>
  );
}

function CapabilityDetailsDrawer({
  capability,
  onClose,
}: {
  capability: PlatformCapability;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto p-6 flex flex-col justify-between shadow-2xl">
        <div>
          {/* Drawer Header */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                  {capability.category}
                </span>
                <CapabilityBadge maturity={capability.maturity} size="sm" />
                <CapabilityBadge runtimeState={capability.runtime.state} size="sm" />
              </div>
              <h2 className="text-xl font-bold text-white">{capability.name}</h2>
              <p className="text-xs font-mono text-slate-500 mt-1">{capability.id}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Description */}
          <div className="mt-5">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Description
            </h3>
            <p className="text-sm text-slate-200 leading-relaxed bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/60">
              {capability.description}
            </p>
          </div>

          {/* Runtime Details */}
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Runtime Diagnostics
            </h3>
            <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/60 text-xs">
              <div>
                <span className="text-slate-500">Current Status:</span>{' '}
                <span className="text-white font-medium">{capability.runtime.state}</span>
              </div>
              <div>
                <span className="text-slate-500">Last Checked:</span>{' '}
                <span className="text-slate-300 font-mono">
                  {capability.runtime.checkedAt ? new Date(capability.runtime.checkedAt).toLocaleString() : 'N/A'}
                </span>
              </div>
              {capability.runtime.reason && (
                <div className="col-span-2 pt-2 border-t border-slate-800 text-amber-300">
                  <span className="text-slate-500">Operational Reason:</span> {capability.runtime.reason}
                </div>
              )}
            </div>
          </div>

          {/* Implementation Presence */}
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Implementation Artifacts
            </h3>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <ArtifactCheck label="Backend Code" active={capability.implementation.backend} />
              <ArtifactCheck label="Frontend UI" active={capability.implementation.frontend} />
              <ArtifactCheck label="API Route" active={capability.implementation.api} />
              <ArtifactCheck label="Persistence Req" active={capability.implementation.persistenceRequired} />
              <ArtifactCheck label="Persistence Done" active={capability.implementation.persistenceImplemented} />
              <ArtifactCheck label="Verified In Prod" active={capability.verification.productionDependencyVerified} />
            </div>
          </div>

          {/* Test Verification Truth */}
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Verification & Automated Tests
            </h3>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <ArtifactCheck label="Unit Tests" active={capability.verification.unitTests} />
              <ArtifactCheck label="Integration Tests" active={capability.verification.integrationTests} />
              <ArtifactCheck label="E2E Scale Tests" active={capability.verification.e2eTests} />
            </div>
          </div>

          {/* Dependencies */}
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              System Dependencies
            </h3>
            <div className="space-y-2 text-xs bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/60">
              {capability.dependencies.services && capability.dependencies.services.length > 0 && (
                <div>
                  <span className="text-slate-500 font-medium">Services:</span>{' '}
                  <span className="text-slate-300">{capability.dependencies.services.join(', ')}</span>
                </div>
              )}
              {capability.dependencies.models && capability.dependencies.models.length > 0 && (
                <div>
                  <span className="text-slate-500 font-medium">AI Models:</span>{' '}
                  <span className="text-slate-300 font-mono">{capability.dependencies.models.join(', ')}</span>
                </div>
              )}
              {capability.dependencies.infrastructure && capability.dependencies.infrastructure.length > 0 && (
                <div>
                  <span className="text-slate-500 font-medium">Infrastructure:</span>{' '}
                  <span className="text-slate-300">{capability.dependencies.infrastructure.join(', ')}</span>
                </div>
              )}
              {capability.dependencies.hardware && capability.dependencies.hardware.length > 0 && (
                <div>
                  <span className="text-slate-500 font-medium">Hardware:</span>{' '}
                  <span className="text-slate-300 font-mono">{capability.dependencies.hardware.join(', ')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Limitations & Blockers */}
          {capability.limitations && capability.limitations.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
                Operational Limitations
              </h3>
              <ul className="list-disc list-inside space-y-1 text-xs text-amber-300/90 bg-amber-500/5 p-3.5 rounded-lg border border-amber-500/20">
                {capability.limitations.map((lim, i) => (
                  <li key={i}>{lim}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="pt-6 mt-6 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div>Owner: <span className="text-slate-300 font-medium">{capability.owner || 'core-platform'}</span></div>
          <div>Introduced: <span className="text-slate-300 font-mono">v{capability.introducedVersion || '0.1.0'}</span></div>
        </div>
      </div>
    </div>
  );
}

function ArtifactCheck({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 p-2.5 rounded-lg border ${
        active
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          : 'bg-slate-950/60 border-slate-800/80 text-slate-500'
      }`}
    >
      {active ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0 opacity-50" />}
      <span className="font-medium truncate">{label}</span>
    </div>
  );
}
