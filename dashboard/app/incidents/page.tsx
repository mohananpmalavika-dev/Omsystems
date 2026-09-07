"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";
import { Plus, Siren, Camera, FileVideo, MapPin, Building2, Eye } from "lucide-react";
import { IncidentMediaModal } from "@/components/incident-media-modal";
import { useSearchParams } from "next/navigation";

type Incident = {
  id: string;
  incidentNumber: string;
  title: string;
  description?: string;
  incidentType?: string;
  severity: string;
  status: string;
  branchId?: string;
  branchName?: string;
  cameraId?: string;
  cameraName?: string;
  zoneName?: string;
  snapshotUrl?: string;
  videoClipUrl?: string;
  assignedTo?: string;
  detectionSource?: string;
  aiConfidence?: number;
  detectionCount?: number;
  occurredAt?: string;
  createdAt: string;
  updatedAt?: string;
};

type IncidentFilters = {
  status?: string;
  severity?: string;
  incidentType?: string;
  branchId?: string;
  from?: string;
  to?: string;
};

function IncidentsPageContent() {
  const searchParams = useSearchParams();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<IncidentFilters>(() => ({
    branchId: typeof window !== "undefined" ? searchParams?.get("branchId") || undefined : undefined,
  }));
  const [stats, setStats] = useState<any>(null);
  const [view, setView] = useState<'all' | 'critical' | 'open' | 'resolved' | 'closed' | 'sla-breach'>('all');
  const [error, setError] = useState<string | null>(null);
  const [selectedIncidentForMedia, setSelectedIncidentForMedia] = useState<Incident | null>(null);
  const [mediaModalTab, setMediaModalTab] = useState<'image' | 'video'>('image');

  async function loadIncidents() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.incidentType) params.set('incidentType', filters.incidentType);
      if (filters.branchId) params.set('branchId', filters.branchId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      
      const res = await fetch(`/v1/incidents?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load incidents');
      const data = await res.json();
      setIncidents(data.data ?? []);
    } catch (e: any) {
      setError(e.message || 'Error loading incidents');
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard() {
    try {
      const res = await fetch('/v1/incidents/dashboard');
      if (!res.ok) throw new Error('Failed to load dashboard');
      const data = await res.json();
      setStats(data);
    } catch (e: any) {
      console.error('Failed to load dashboard:', e);
    }
  }

  useEffect(() => {
    loadIncidents();
    loadDashboard();
  }, []);

  useEffect(() => {
    loadIncidents();
  }, [filters]);

  function getSeverityColor(severity: string): string {
    switch (severity) {
      case 'P1': return '#dc2626'; // red-600
      case 'P2': return '#ea580c'; // orange-600
      case 'P3': return '#ca8a04'; // yellow-600
      case 'P4': return '#2563eb'; // blue-600
      case 'P5': return '#64748b'; // slate-500
      default: return '#64748b';
    }
  }

  function getStatusBadge(status: string): React.ReactNode {
    const colors: Record<string, string> = {
      'new': '#3b82f6',
      'awaiting-verification': '#f59e0b',
      'verified': '#10b981',
      'assigned': '#6366f1',
      'acknowledged': '#8b5cf6',
      'under-investigation': '#ec4899',
      'escalated': '#dc2626',
      'resolved': '#059669',
      'closed': '#6b7280',
      'false-positive': '#94a3b8',
    };
    
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        backgroundColor: colors[status] || '#6b7280',
        color: 'white',
        fontWeight: 500,
      }}>
        {status}
      </span>
    );
  }

  const filteredIncidents = incidents.filter(inc => {
    if (view === 'critical' && !['P1', 'P2'].includes(inc.severity)) return false;
    if (view === 'open' && ['closed', 'false-positive', 'cancelled'].includes(inc.status)) return false;
    if (view === 'resolved' && inc.status !== 'resolved') return false;
    if (view === 'closed' && !['closed', 'false-positive', 'cancelled'].includes(inc.status)) return false;
    if (view === 'sla-breach') {
      return ['P1', 'P2'].includes(inc.severity) && inc.status !== 'closed';
    }
    return true;
  });

  return (
    <AppLayout>
      <div className="content incident-management-page" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        <PageHero
          eyebrow="Response operations"
          title="Incident management"
          description="Triage, investigate and resolve security incidents with consistent priority, ownership and evidence handling."
          icon={Siren}
          actions={<Link href="/incidents/create" className="btn-primary"><Plus size={15} />Create incident</Link>}
        />

        {/* Dashboard Stats */}
        {stats && (
          <div className="incident-metrics-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}>
            <StatCard
              title="Total Incidents"
              value={stats.totalIncidents || 0}
              color="#2563eb"
            />
            <StatCard
              title="Open Incidents"
              value={stats.openIncidents || 0}
              color="#f59e0b"
            />
            <StatCard
              title="Critical (P1/P2)"
              value={stats.criticalIncidents || 0}
              color="#dc2626"
            />
            <StatCard
              title="Avg Resolution (hrs)"
              value={stats.averageResolutionHours?.toFixed(1) || '0.0'}
              color="#10b981"
            />
          </div>
        )}

        {/* View Tabs */}
        <div className="incident-view-tabs flex gap-2 mb-4 pb-2 border-b border-slate-800">
          {(['all', 'open', 'critical', 'resolved', 'closed', 'sla-breach'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${
                view === v
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              {v.replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="incident-filter-panel grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl border border-slate-800 bg-slate-900/80 shadow-sm mb-6">
          <select
            value={filters.severity || ''}
            onChange={e => setFilters({ ...filters, severity: e.target.value || undefined })}
            className="p-2 rounded-lg border border-slate-700 bg-slate-800/90 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Severities</option>
            <option value="P1">P1 - Critical</option>
            <option value="P2">P2 - High</option>
            <option value="P3">P3 - Medium</option>
            <option value="P4">P4 - Low</option>
            <option value="P5">P5 - Info</option>
          </select>

          <select
            value={filters.status || ''}
            onChange={e => setFilters({ ...filters, status: e.target.value || undefined })}
            className="p-2 rounded-lg border border-slate-700 bg-slate-800/90 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="assigned">Assigned</option>
            <option value="under-investigation">Under Investigation</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          <select
            value={filters.incidentType || ''}
            onChange={e => setFilters({ ...filters, incidentType: e.target.value || undefined })}
            className="p-2 rounded-lg border border-slate-700 bg-slate-800/90 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Types</option>
            <option value="fire">Fire</option>
            <option value="intrusion">Intrusion</option>
            <option value="atm-tampering">ATM Tampering</option>
            <option value="tailgating">Tailgating</option>
            <option value="fall-detection">Fall Detection</option>
          </select>

          <button
            onClick={() => setFilters({})}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg border border-slate-700 transition-colors"
          >
            Clear Filters
          </button>
        </div>

        {/* Incidents Table */}
        {error && (
          <div className="incident-table-panel p-3 bg-rose-950/30 border border-rose-800/60 rounded-lg text-rose-300 text-sm mb-4" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            Loading incidents...
          </div>
        ) : (
          <div className="incident-table-panel rounded-xl border border-slate-800 overflow-hidden bg-slate-900/80 shadow-sm">
            <table className="w-full border-collapse">
              <thead className="bg-slate-800/60 border-b border-slate-700/50">
                <tr>
                  <th className="text-left px-3.5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Incident #
                  </th>
                  <th className="text-left px-3.5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Title & Type
                  </th>
                  <th className="text-left px-3.5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Zone
                  </th>
                  <th className="text-left px-3.5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Branch
                  </th>
                  <th className="text-left px-3.5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Camera
                  </th>
                  <th className="text-center px-3.5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Severity
                  </th>
                  <th className="text-left px-3.5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left px-3.5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Occurred
                  </th>
                  <th className="text-center px-3.5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Visual Evidence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredIncidents.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-400 text-sm">
                      No incidents found
                    </td>
                  </tr>
                ) : (
                  filteredIncidents.map((inc) => (
                    <tr
                      key={inc.id}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="px-3.5 py-3">
                        <Link
                          href={`/incidents/${inc.id}`}
                          className="font-mono text-sm font-bold text-blue-400 hover:text-blue-300"
                        >
                          {inc.incidentNumber}
                        </Link>
                      </td>
                      <td className="px-3.5 py-3">
                        <Link
                          href={`/incidents/${inc.id}`}
                          className="text-sm font-semibold block hover:underline text-slate-100"
                        >
                          {inc.title}
                        </Link>
                        <span className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">
                          {inc.incidentType || 'Security Incident'}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-sm text-slate-300">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-950/50 text-purple-300 border border-purple-800/40">
                          <MapPin size={12} />
                          {inc.zoneName || "Main Facility"}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-sm text-slate-300">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Building2 size={13} className="text-slate-400" />
                          {inc.branchName || inc.branchId || "Headquarters"}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-sm text-slate-300">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Camera size={13} className="text-sky-400" />
                          {inc.cameraName || inc.cameraId || "Camera"}
                        </span>
                      </td>
                      <td className="text-center px-3.5 py-3">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-bold text-white shadow-sm"
                          style={{ backgroundColor: getSeverityColor(inc.severity) }}
                        >
                          {inc.severity}
                        </span>
                      </td>
                      <td className="px-3.5 py-3">
                        {getStatusBadge(inc.status)}
                      </td>
                      <td className="px-3.5 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {inc.occurredAt
                          ? new Date(inc.occurredAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'N/A'}
                      </td>
                      <td className="text-center px-3.5 py-3">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIncidentForMedia(inc);
                              setMediaModalTab('image');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-950/40 text-emerald-300 border border-emerald-800/50 rounded-md hover:bg-emerald-900/40 transition-colors"
                            title="View high-resolution snapshot"
                          >
                            <Camera size={12} />
                            Image
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIncidentForMedia(inc);
                              setMediaModalTab('video');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-blue-950/40 text-blue-300 border border-blue-800/50 rounded-md hover:bg-blue-900/40 transition-colors"
                            title="Watch incident video clip"
                          >
                            <FileVideo size={12} />
                            Video
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination info */}
        <div style={{
          marginTop: '16px',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '14px',
        }}>
          Showing {filteredIncidents.length} incident{filteredIncidents.length !== 1 ? 's' : ''}
        </div>

        {selectedIncidentForMedia && (
          <IncidentMediaModal
            isOpen={!!selectedIncidentForMedia}
            onClose={() => setSelectedIncidentForMedia(null)}
            initialTab={mediaModalTab}
            snapshotUrl={selectedIncidentForMedia.snapshotUrl || `/v1/incidents/${selectedIncidentForMedia.id}/snapshot`}
            videoClipUrl={selectedIncidentForMedia.videoClipUrl || `/v1/incidents/${selectedIncidentForMedia.id}/clip`}
            title={`${selectedIncidentForMedia.incidentNumber}: ${selectedIncidentForMedia.title}`}
            cameraName={selectedIncidentForMedia.cameraName || "Incident Camera"}
            branchName={selectedIncidentForMedia.branchName || selectedIncidentForMedia.branchId || "Facility"}
            zoneName={selectedIncidentForMedia.zoneName}
            timestamp={selectedIncidentForMedia.occurredAt || selectedIncidentForMedia.createdAt}
            severity={selectedIncidentForMedia.severity}
            confidence={selectedIncidentForMedia.aiConfidence}
          />
        )}
      </div>
    </AppLayout>
  );
}

export default function IncidentsPage() {
  return (
    <Suspense fallback={<div className="route-loading" aria-busy="true">Loading incident workspace...</div>}>
      <IncidentsPageContent />
    </Suspense>
  );
}

function StatCard({ title, value, color }: { title: string; value: string | number; color: string }) {
  return (
    <div className="incident-stat-card p-5 rounded-xl border border-slate-800 bg-slate-900/80 shadow-sm space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </div>
      <div className="text-2xl font-black" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
