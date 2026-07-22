"use client";

/**
 * Executive Dashboard
 * Role-based operational dashboard with real-time metrics
 */

import React, { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

interface DashboardSummary {
  systemStatus: string;
  systemHealthScore: number;
  criticalAlerts: number;
  activeIncidents: number;
  lastUpdated: string;
}

interface CameraMetrics {
  totalRegistered: number;
  operational: number;
  online: number;
  offline: number;
  degraded: number;
  underMaintenance: number;
  availabilityPercentage: number;
}

interface RecordingMetrics {
  recordingNormally: number;
  recordingWithGaps: number;
  recordingStopped: number;
  verificationPending: number;
  availabilityPercentage: number;
}

interface StorageMetrics {
  totalCapacityBytes: string;
  usedCapacityBytes: string;
  availableCapacityBytes: string;
  utilizationPercentage: number;
  forecastFullDays: number;
  criticalNodes: number;
}

interface AlertMetrics {
  totalActive: number;
  unacknowledged: number;
  critical: number;
  escalated: number;
  slaBreached: number;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [cameraMetrics, setCameraMetrics] = useState<CameraMetrics | null>(null);
  const [recordingMetrics, setRecordingMetrics] = useState<RecordingMetrics | null>(null);
  const [storageMetrics, setStorageMetrics] = useState<StorageMetrics | null>(null);
  const [alertMetrics, setAlertMetrics] = useState<AlertMetrics | null>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api/control';
      
      const [summaryRes, cameraRes, recordingRes, storageRes, alertRes, incidentsRes] = await Promise.all([
        fetch(`${API_BASE}/v1/dashboard/summary`),
        fetch(`${API_BASE}/v1/dashboard/camera-health`),
        fetch(`${API_BASE}/v1/dashboard/recording-status`),
        fetch(`${API_BASE}/v1/dashboard/storage`),
        fetch(`${API_BASE}/v1/dashboard/alerts`),
        fetch(`${API_BASE}/v1/dashboard/incidents?limit=5`)
      ]);

      if (!summaryRes.ok) throw new Error('Failed to fetch dashboard data');

      const [summaryData, cameraData, recordingData, storageData, alertData, incidentsData] = await Promise.all([
        summaryRes.json(),
        cameraRes.json(),
        recordingRes.json(),
        storageRes.json(),
        alertRes.json(),
        incidentsRes.json()
      ]);

      setSummary(summaryData.data);
      setCameraMetrics(cameraData.data);
      setRecordingMetrics(recordingData.data);
      setStorageMetrics(storageData.data);
      setAlertMetrics(alertData.data);
      setIncidents(incidentsData.data || []);
      setError(null);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !summary) {
    return (
      <AppLayout>
        <div className="content" style={{ padding: 40, textAlign: 'center' }}>
          <p>Loading dashboard...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="content">
        <div style={{ padding: 20, maxWidth: 1600, margin: "0 auto" }}>
          {/* Dashboard Header */}
          <header style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontSize: 32, margin: 0, fontWeight: 700 }}>Security Operations Dashboard</h1>
                <p style={{ color: "#666", marginTop: 8, fontSize: 14 }}>
                  Real-time CCTV system monitoring and operational metrics
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: 12,
                  padding: '12px 20px',
                  background: summary?.systemStatus === 'operational' ? '#ecfdf5' : '#fef2f2',
                  border: `2px solid ${summary?.systemStatus === 'operational' ? '#10b981' : '#ef4444'}`,
                  borderRadius: 12,
                  marginBottom: 8
                }}>
                  <div style={{ 
                    width: 12, 
                    height: 12, 
                    borderRadius: '50%', 
                    background: summary?.systemStatus === 'operational' ? '#10b981' : '#ef4444',
                    animation: 'pulse 2s ease-in-out infinite'
                  }} />
                  <div>
                    <div style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>System Status</div>
                    <div style={{ fontSize: 16, fontWeight: 700, textTransform: 'capitalize' }}>
                      {summary?.systemStatus || 'Unknown'}
                    </div>
                  </div>
                </div>
                <p style={{ color: "#666", fontSize: 12, margin: '8px 0 0' }}>
                  Last updated: {summary?.lastUpdated ? new Date(summary.lastUpdated).toLocaleString() : '—'}
                </p>
              </div>
            </div>
          </header>

          {error && (
            <div style={{ marginBottom: 24, padding: 16, background: "#fee", border: "1px solid #fbb", borderRadius: 12, color: "#900" }}>
              {error}
            </div>
          )}

          {/* Key Metrics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <MetricCard 
              label="System Health Score" 
              value={summary?.systemHealthScore ? `${summary.systemHealthScore.toFixed(1)}%` : '—'}
              trend="stable"
              status={getHealthStatus(summary?.systemHealthScore)}
            />
            <MetricCard 
              label="Critical Alerts" 
              value={alertMetrics?.critical || 0}
              detail={`${alertMetrics?.unacknowledged || 0} unacknowledged`}
              status={alertMetrics && alertMetrics.critical > 0 ? 'critical' : 'good'}
            />
            <MetricCard 
              label="Active Incidents" 
              value={summary?.activeIncidents || 0}
              status={summary && summary.activeIncidents > 5 ? 'warning' : 'good'}
            />
            <MetricCard 
              label="Camera Availability" 
              value={cameraMetrics?.availabilityPercentage ? `${cameraMetrics.availabilityPercentage.toFixed(2)}%` : '—'}
              detail={`${cameraMetrics?.offline || 0} offline`}
              status={getAvailabilityStatus(cameraMetrics?.availabilityPercentage)}
            />
            <MetricCard 
              label="Storage Utilization" 
              value={storageMetrics?.utilizationPercentage ? `${storageMetrics.utilizationPercentage.toFixed(1)}%` : '—'}
              detail={`${storageMetrics?.forecastFullDays || 0} days remaining`}
              status={getStorageStatus(storageMetrics?.utilizationPercentage)}
            />
          </div>

          {/* Main Widgets Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginBottom: 24 }}>
            {/* Camera Status */}
            <DashboardPanel title="Camera Status" icon="📹">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                <StatBox label="Total Cameras" value={cameraMetrics?.totalRegistered || 0} />
                <StatBox label="Operational" value={cameraMetrics?.operational || 0} />
                <StatBox label="Online" value={cameraMetrics?.online || 0} color="#10b981" />
                <StatBox label="Offline" value={cameraMetrics?.offline || 0} color="#ef4444" />
                <StatBox label="Degraded" value={cameraMetrics?.degraded || 0} color="#f59e0b" />
                <StatBox label="Maintenance" value={cameraMetrics?.underMaintenance || 0} color="#8b5cf6" />
              </div>
            </DashboardPanel>

            {/* Recording Status */}
            <DashboardPanel title="Recording Status" icon="🔴">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                <StatBox label="Recording Normally" value={recordingMetrics?.recordingNormally || 0} color="#10b981" />
                <StatBox label="With Gaps" value={recordingMetrics?.recordingWithGaps || 0} color="#f59e0b" />
                <StatBox label="Recording Stopped" value={recordingMetrics?.recordingStopped || 0} color="#ef4444" />
                <StatBox label="Verification Pending" value={recordingMetrics?.verificationPending || 0} color="#6366f1" />
              </div>
              <div style={{ marginTop: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, color: '#666' }}>Average Availability</span>
                  <strong>{recordingMetrics?.availabilityPercentage ? `${recordingMetrics.availabilityPercentage.toFixed(2)}%` : '—'}</strong>
                </div>
              </div>
            </DashboardPanel>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginBottom: 24 }}>
            {/* Storage Capacity */}
            <DashboardPanel title="Storage Capacity" icon="💾">
              {storageMetrics && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 14, color: '#666' }}>Utilization</span>
                      <strong>{storageMetrics.utilizationPercentage.toFixed(1)}%</strong>
                    </div>
                    <div style={{ height: 24, background: '#e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          height: '100%', 
                          background: storageMetrics.utilizationPercentage > 90 ? '#ef4444' : 
                                     storageMetrics.utilizationPercentage > 80 ? '#f59e0b' : '#10b981',
                          width: `${Math.min(storageMetrics.utilizationPercentage, 100)}%`,
                          transition: 'width 0.5s ease'
                        }} 
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <StatBox label="Total" value={formatBytes(storageMetrics.totalCapacityBytes)} />
                    <StatBox label="Used" value={formatBytes(storageMetrics.usedCapacityBytes)} />
                    <StatBox label="Available" value={formatBytes(storageMetrics.availableCapacityBytes)} />
                    <StatBox label="Forecast Full" value={`${storageMetrics.forecastFullDays} days`} />
                  </div>
                  {storageMetrics.criticalNodes > 0 && (
                    <div style={{ marginTop: 12, padding: 12, background: '#fee', border: '1px solid #fca', borderRadius: 8, color: '#dc2626' }}>
                      ⚠️ {storageMetrics.criticalNodes} storage node(s) in critical state
                    </div>
                  )}
                </>
              )}
            </DashboardPanel>

            {/* Alert Status */}
            <DashboardPanel title="Active Alerts" icon="🚨">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                <StatBox label="Total Active" value={alertMetrics?.totalActive || 0} />
                <StatBox label="Unacknowledged" value={alertMetrics?.unacknowledged || 0} color="#f59e0b" />
                <StatBox label="Critical" value={alertMetrics?.critical || 0} color="#ef4444" />
                <StatBox label="Escalated" value={alertMetrics?.escalated || 0} color="#8b5cf6" />
                <StatBox label="SLA Breached" value={alertMetrics?.slaBreached || 0} color="#dc2626" />
              </div>
            </DashboardPanel>
          </div>

          {/* Recent Incidents */}
          <DashboardPanel title="Recent Critical Incidents" icon="⚡">
            {incidents.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {incidents.map((incident, idx) => (
                  <div 
                    key={incident.id || idx} 
                    style={{ 
                      padding: 16, 
                      background: '#f9fafb', 
                      borderRadius: 8,
                      borderLeft: `4px solid ${getSeverityColor(incident.severity)}`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                          <strong>{incident.incidentNumber}</strong>
                          <span style={{ 
                            padding: '2px 8px', 
                            background: getSeverityColor(incident.severity),
                            color: 'white',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600
                          }}>
                            {incident.severity}
                          </span>
                          <span style={{ fontSize: 14, color: '#666' }}>{incident.branchName}</span>
                        </div>
                        <p style={{ margin: '4px 0', color: '#374151' }}>{incident.incidentType}</p>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                          {new Date(incident.occurredAt).toLocaleString()}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ 
                          padding: '4px 12px', 
                          background: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600
                        }}>
                          {incident.status}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#6b7280', textAlign: 'center', padding: 24 }}>No recent critical incidents</p>
            )}
          </DashboardPanel>
        </div>
      </div>
    </AppLayout>
  );
}

// Helper Components
function MetricCard({ label, value, detail, trend, status }: any) {
  const statusColors = {
    good: { bg: '#ecfdf5', border: '#10b981', text: '#047857' },
    warning: { bg: '#fef3c7', border: '#f59e0b', text: '#b45309' },
    critical: { bg: '#fee2e2', border: '#ef4444', text: '#dc2626' }
  };

  const colors = status ? statusColors[status as keyof typeof statusColors] : statusColors.good;

  return (
    <div style={{ 
      padding: 20, 
      borderRadius: 16, 
      background: colors.bg,
      border: `2px solid ${colors.border}`,
      minHeight: 120
    }}>
      <p style={{ margin: 0, color: '#6b7280', fontSize: 13, fontWeight: 600 }}>{label}</p>
      <p style={{ margin: '12px 0 0', fontSize: 36, fontWeight: 700, color: colors.text }}>
        {value}
      </p>
      {detail && <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 13 }}>{detail}</p>}
    </div>
  );
}

function DashboardPanel({ title, icon, children }: any) {
  return (
    <div style={{ 
      padding: 24, 
      borderRadius: 16, 
      background: '#fff', 
      border: '2px solid #e5e7eb',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

function StatBox({ label, value, color }: any) {
  return (
    <div style={{ 
      padding: 16, 
      background: '#f9fafb',
      borderRadius: 8,
      border: '1px solid #e5e7eb'
    }}>
      <p style={{ margin: 0, color: '#6b7280', fontSize: 12, fontWeight: 600 }}>{label}</p>
      <p style={{ margin: '8px 0 0', fontSize: 24, fontWeight: 700, color: color || '#111827' }}>
        {value}
      </p>
    </div>
  );
}

// Helper Functions
function getHealthStatus(score?: number): 'good' | 'warning' | 'critical' {
  if (!score) return 'warning';
  if (score >= 85) return 'good';
  if (score >= 70) return 'warning';
  return 'critical';
}

function getAvailabilityStatus(percentage?: number): 'good' | 'warning' | 'critical' {
  if (!percentage) return 'warning';
  if (percentage >= 98) return 'good';
  if (percentage >= 95) return 'warning';
  return 'critical';
}

function getStorageStatus(percentage?: number): 'good' | 'warning' | 'critical' {
  if (!percentage) return 'good';
  if (percentage < 80) return 'good';
  if (percentage < 90) return 'warning';
  return 'critical';
}

function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    critical: '#dc2626',
    high: '#f59e0b',
    medium: '#3b82f6',
    low: '#10b981'
  };
  return colors[severity?.toLowerCase()] || '#6b7280';
}

function formatBytes(bytes: string | number): string {
  const num = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (isNaN(num)) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = num;
  let unitIndex = 0;
  
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
