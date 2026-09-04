"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { Camera } from "lucide-react";
import { IncidentImageModal } from "@/components/incident-image-modal";

type Workspace = {
  incident: any;
  participants: any[];
  cameras: any[];
  videoRanges: any[];
  clips: any[];
  snapshots: any[];
  evidenceItems: any[];
  evidencePackages: any[];
  tasks: any[];
  notes: any[];
  timeline: any[];
  policeIntimations: any[];
  insuranceClaims: any[];
  reports: any[];
  slaStatus: any;
  availableTransitions: string[];
};

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'video' | 'evidence' | 'tasks' | 'timeline' | 'report'>('overview');
  const [error, setError] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);

  const incidentId = typeof params?.id === 'string' ? params.id : '';

  async function loadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/workspace`);
      if (!res.ok) throw new Error('Failed to load workspace');
      const data = await res.json();
      setWorkspace(data);
    } catch (e: any) {
      setError(e.message || 'Error loading workspace');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspace();
  }, [incidentId]);

  async function transitionStatus(toStatus: string) {
    if (!confirm(`Transition to ${toStatus}?`)) return;
    
    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStatus }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.errors?.join(', ') || 'Transition failed');
      }
      
      await loadWorkspace();
      alert('Status updated successfully');
    } catch (e: any) {
      alert(e.message || 'Failed to transition status');
    }
  }

  async function markFalsePositive() {
    const reason = prompt('Reason for false positive:');
    if (!reason) return;
    
    const category = prompt('Category (shadow/animal/reflection/weather/other):') || 'other';
    
    try {
      const res = await fetch(`/api/control/v1/incidents/${incidentId}/mark-false-positive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, category }),
      });
      
      if (!res.ok) throw new Error('Failed to mark false positive');
      
      await loadWorkspace();
      alert('Marked as false positive');
    } catch (e: any) {
      alert(e.message || 'Failed to mark false positive');
    }
  }

  async function completeTask(taskId: string) {
    try {
      const res = await fetch(`/api/control/v1/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      if (!res.ok) throw new Error('Failed to complete task');
      
      await loadWorkspace();
    } catch (e: any) {
      alert(e.message || 'Failed to complete task');
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
          Loading investigation workspace...
        </div>
      </AppLayout>
    );
  }

  if (error || !workspace) {
    return (
      <AppLayout>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ color: '#dc2626', marginBottom: '16px' }}>{error || 'Incident not found'}</div>
          <button
            onClick={() => router.push('/incidents')}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Back to Incidents
          </button>
        </div>
      </AppLayout>
    );
  }

  const { incident, tasks, timeline, evidenceItems, slaStatus, availableTransitions } = workspace;

  return (
    <AppLayout>
      <div className="content" style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => router.push('/incidents')}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f3f4f6',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              marginBottom: '16px',
            }}
          >
            ← Back to Incidents
          </button>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0, marginBottom: '8px' }}>
                {incident.incidentNumber}
              </h1>
              <p style={{ fontSize: '18px', color: '#374151', margin: 0 }}>
                {incident.title}
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <StatusBadge status={incident.status} />
              <SeverityBadge severity={incident.severity} />
            </div>
          </div>
        </div>

        {/* Key Info Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}>
          <InfoCard label="Detection Source" value={incident.detectionSource || 'Manual'} />
          <InfoCard label="Occurred At" value={new Date(incident.occurredAt).toLocaleString()} />
          <InfoCard
            label="AI Confidence"
            value={incident.aiConfidence ? `${Math.round(incident.aiConfidence * 100)}%` : 'N/A'}
          />
          <InfoCard label="Assigned To" value={incident.assignedTo || 'Unassigned'} />
        </div>

        {/* SLA Alert */}
        {slaStatus?.nextDeadline && slaStatus.nextDeadline.minutesRemaining < 30 && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <div>
              <strong>SLA Warning:</strong> {slaStatus.nextDeadline.type} deadline in{' '}
              {slaStatus.nextDeadline.minutesRemaining} minutes
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
        }}>
          <h3 style={{ width: '100%', margin: 0, marginBottom: '8px', fontSize: '14px', color: '#6b7280' }}>
            Available Actions
          </h3>
          
          {availableTransitions.map(status => (
            <button
              key={status}
              onClick={() => transitionStatus(status)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              → {status.replace(/-/g, ' ')}
            </button>
          ))}
          
          {incident.status !== 'false-positive' && (
            <button
              onClick={markFalsePositive}
              style={{
                padding: '8px 16px',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              Mark False Positive
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '16px',
          borderBottom: '2px solid #e5e7eb',
        }}>
          {(['overview', 'video', 'evidence', 'tasks', 'timeline', 'report'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: 'transparent',
                borderBottom: activeTab === tab ? '2px solid #2563eb' : 'none',
                color: activeTab === tab ? '#2563eb' : '#6b7280',
                cursor: 'pointer',
                fontWeight: activeTab === tab ? 600 : 400,
                textTransform: 'capitalize',
                marginBottom: '-2px',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          padding: '24px',
        }}>
          {activeTab === 'overview' && (
            <div>
              <h2 style={{ marginTop: 0 }}>Incident Overview</h2>
              <div style={{ marginBottom: '24px' }}>
                <strong>Description:</strong>
                <p style={{ color: '#6b7280', whiteSpace: 'pre-wrap' }}>
                  {incident.description || 'No description provided'}
                </p>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <div>
                  <strong>Incident Type:</strong> {incident.incidentType || 'Unknown'}
                </div>
                <div>
                  <strong>Branch:</strong> {incident.branchId || 'N/A'}
                </div>
                <div>
                  <strong>Detection Count:</strong> {incident.detectionCount || 1}
                </div>
                <div>
                  <strong>Created:</strong> {new Date(incident.createdAt).toLocaleString()}
                </div>
              </div>

              <div style={{ marginTop: '24px', borderTop: '1px solid #f3f4f6', paddingTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Camera size={16} />
                    Incident Detection Snapshot
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowImageModal(true)}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      border: '1px solid #bfdbfe',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    Enlarge Image
                  </button>
                </div>
                <div
                  onClick={() => setShowImageModal(true)}
                  style={{
                    position: 'relative',
                    maxWidth: '480px',
                    height: '270px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#0f172a',
                    cursor: 'pointer',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/control/v1/alerts/${incident.id}/evidence/snapshot`}
                    alt={incident.title || 'Incident snapshot'}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '8px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    color: '#e2e8f0',
                    fontSize: '11px',
                  }}>
                    Click to inspect full resolution
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'video' && (
            <div>
              <h2 style={{ marginTop: 0 }}>Video Evidence</h2>
              <p style={{ color: '#6b7280' }}>
                {workspace.videoRanges.length} video range(s) preserved
              </p>
              
              {workspace.videoRanges.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  {workspace.videoRanges.map((range: any) => (
                    <div
                      key={range.id}
                      style={{
                        padding: '12px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '6px',
                        marginBottom: '8px',
                      }}
                    >
                      <div><strong>Camera:</strong> {range.cameraId}</div>
                      <div><strong>From:</strong> {new Date(range.fromAt).toLocaleString()}</div>
                      <div><strong>To:</strong> {new Date(range.toAt).toLocaleString()}</div>
                      <div><strong>Legal Hold:</strong> {range.legalHoldApplied ? 'Yes' : 'No'}</div>
                    </div>
                  ))}
                </div>
              )}
              
              <h3 style={{ marginTop: '24px' }}>Clips ({workspace.clips.length})</h3>
              <h3 style={{ marginTop: '16px' }}>Snapshots ({workspace.snapshots.length})</h3>
            </div>
          )}

          {activeTab === 'evidence' && (
            <div>
              <h2 style={{ marginTop: 0 }}>Evidence Items</h2>
              <p style={{ color: '#6b7280' }}>
                {evidenceItems.length} evidence item(s) collected
              </p>
              
              {evidenceItems.map((item: any) => (
                <div
                  key={item.id}
                  style={{
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '8px' }}>{item.title}</div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>
                    Type: {item.itemType}
                  </div>
                  {item.description && (
                    <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
                      {item.description}
                    </div>
                  )}
                </div>
              ))}
              
              <h3 style={{ marginTop: '24px' }}>Evidence Packages ({workspace.evidencePackages.length})</h3>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div>
              <h2 style={{ marginTop: 0 }}>Investigation Tasks</h2>
              
              {tasks.length === 0 ? (
                <p style={{ color: '#6b7280' }}>No tasks assigned</p>
              ) : (
                <div>
                  {tasks.map((task: any) => (
                    <div
                      key={task.id}
                      style={{
                        padding: '16px',
                        backgroundColor: task.status === 'completed' ? '#f0fdf4' : '#f9fafb',
                        borderRadius: '6px',
                        marginBottom: '12px',
                        borderLeft: task.isMandatory ? '4px solid #dc2626' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                            {task.taskName}
                            {task.isMandatory && (
                              <span style={{ color: '#dc2626', marginLeft: '8px', fontSize: '12px' }}>
                                * MANDATORY
                              </span>
                            )}
                          </div>
                          {task.description && (
                            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
                              {task.description}
                            </div>
                          )}
                          <div style={{ fontSize: '13px', color: '#6b7280' }}>
                            Priority: {task.priority} | Status: {task.status}
                          </div>
                        </div>
                        
                        {task.status !== 'completed' && (
                          <button
                            onClick={() => completeTask(task.id)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '13px',
                            }}
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <div>
              <h2 style={{ marginTop: 0 }}>Incident Timeline</h2>
              
              <div style={{ borderLeft: '2px solid #e5e7eb', paddingLeft: '24px', marginLeft: '8px' }}>
                {timeline.map((event: any, idx: number) => (
                  <div
                    key={event.id || idx}
                    style={{
                      marginBottom: '20px',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: '-28px',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#2563eb',
                        border: '2px solid white',
                      }}
                    />
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
                      {new Date(event.createdAt).toLocaleString()} • {event.createdBy || 'System'}
                    </div>
                    <div style={{ fontWeight: 500 }}>{event.description}</div>
                    {event.eventType && (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        Type: {event.eventType}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'report' && (
            <div>
              <h2 style={{ marginTop: 0 }}>Investigation Reports</h2>
              
              {workspace.reports.length === 0 ? (
                <div>
                  <p style={{ color: '#6b7280' }}>No reports generated yet</p>
                  <button
                    onClick={() => alert('Report generation would be implemented here')}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      marginTop: '16px',
                    }}
                  >
                    Generate Report
                  </button>
                </div>
              ) : (
                <div>
                  {workspace.reports.map((report: any) => (
                    <div
                      key={report.id}
                      style={{
                        padding: '16px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '6px',
                        marginBottom: '12px',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '8px' }}>
                        {report.reportNumber} - {report.reportType}
                      </div>
                      <div style={{ fontSize: '14px', color: '#6b7280' }}>
                        Status: {report.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <IncidentImageModal
          isOpen={showImageModal}
          onClose={() => setShowImageModal(false)}
          imageUrl={`/api/control/v1/alerts/${incident.id}/evidence/snapshot`}
          title={incident.title || "Incident Details"}
          cameraName={incident.branchId || "Incident Camera"}
          branchName={incident.branchId}
          timestamp={incident.occurredAt || incident.createdAt}
          severity={incident.severity}
          confidence={incident.aiConfidence}
        />
      </div>
    </AppLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    'new': '#3b82f6',
    'assigned': '#6366f1',
    'under-investigation': '#ec4899',
    'resolved': '#059669',
    'closed': '#6b7280',
  };
  
  return (
    <span style={{
      padding: '6px 12px',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: 600,
      backgroundColor: colors[status] || '#6b7280',
      color: 'white',
    }}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    'P1': '#dc2626',
    'P2': '#ea580c',
    'P3': '#ca8a04',
    'P4': '#2563eb',
    'P5': '#64748b',
  };
  
  return (
    <span style={{
      padding: '6px 12px',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: 700,
      backgroundColor: colors[severity] || '#64748b',
      color: 'white',
    }}>
      {severity}
    </span>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '16px',
      backgroundColor: '#f9fafb',
      borderRadius: '8px',
      border: '1px solid #e5e7eb',
    }}>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>
        {value}
      </div>
    </div>
  );
}
