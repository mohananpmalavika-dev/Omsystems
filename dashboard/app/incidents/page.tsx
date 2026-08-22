"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";
import { Plus, Siren } from "lucide-react";

type Incident = {
  id: string;
  incidentNumber: string;
  title: string;
  description?: string;
  incidentType?: string;
  severity: string;
  status: string;
  branchId?: string;
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

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<IncidentFilters>({});
  const [stats, setStats] = useState<any>(null);
  const [view, setView] = useState<'all' | 'critical' | 'open' | 'sla-breach'>('all');
  const [error, setError] = useState<string | null>(null);

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
      
      const res = await fetch(`/api/control/v1/incidents?${params.toString()}`);
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
      const res = await fetch('/api/control/v1/incidents/dashboard');
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
    if (view === 'open' && ['closed', 'resolved', 'false-positive'].includes(inc.status)) return false;
    if (view === 'sla-breach') {
      // Would check SLA status - simplified for now
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
        <div className="incident-view-tabs" style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '16px',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '8px',
        }}>
          {(['all', 'critical', 'open', 'sla-breach'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={view === v ? "active" : ""}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: view === v ? '#2563eb' : 'transparent',
                color: view === v ? 'white' : '#4b5563',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
                textTransform: 'capitalize',
              }}
            >
              {v.replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="incident-filter-panel" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
        }}>
          <select
            value={filters.severity || ''}
            onChange={e => setFilters({ ...filters, severity: e.target.value || undefined })}
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
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
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
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
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
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
            style={{
              padding: '8px 16px',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Clear Filters
          </button>
        </div>

        {/* Incidents Table */}
        {error && (
          <div className="incident-table-panel" style={{
            padding: '12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#dc2626',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            Loading incidents...
          </div>
        ) : (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb' }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#374151' }}>
                    Incident #
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#374151' }}>
                    Title
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#374151' }}>
                    Type
                  </th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600, color: '#374151' }}>
                    Severity
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#374151' }}>
                    Status
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#374151' }}>
                    Source
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#374151' }}>
                    Occurred
                  </th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600, color: '#374151' }}>
                    AI
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                      No incidents found
                    </td>
                  </tr>
                ) : (
                  filteredIncidents.map((inc) => (
                    <tr
                      key={inc.id}
                      style={{
                        borderTop: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <Link
                          href={`/incidents/${inc.id}`}
                          style={{
                            color: '#2563eb',
                            textDecoration: 'none',
                            fontWeight: 600,
                            fontSize: '14px',
                          }}
                        >
                          {inc.incidentNumber}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>
                        <Link
                          href={`/incidents/${inc.id}`}
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {inc.title}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>
                        {inc.incidentType || 'Unknown'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: getSeverityColor(inc.severity),
                          color: 'white',
                        }}>
                          {inc.severity}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {getStatusBadge(inc.status)}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>
                        {inc.detectionSource === 'ai-analytics' ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: '#10b981',
                            }} />
                            AI Detection
                          </span>
                        ) : (
                          'Manual'
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>
                        {inc.occurredAt
                          ? new Date(inc.occurredAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'N/A'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px 16px', fontSize: '13px' }}>
                        {inc.aiConfidence ? (
                          <span style={{ color: inc.aiConfidence >= 0.85 ? '#10b981' : '#f59e0b' }}>
                            {Math.round(inc.aiConfidence * 100)}%
                          </span>
                        ) : (
                          '—'
                        )}
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
      </div>
    </AppLayout>
  );
}

function StatCard({ title, value, color }: { title: string; value: string | number; color: string }) {
  return (
    <div className="incident-stat-card" style={{
      padding: '20px',
      backgroundColor: 'white',
      borderRadius: '8px',
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    }}>
      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', fontWeight: 500 }}>
        {title}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color }}>
        {value}
      </div>
    </div>
  );
}
