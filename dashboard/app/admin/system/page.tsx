"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Server, Camera, Building2, RefreshCw, AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/app-layout";

type Gateway = {
  id: string;
  name: string;
  status: string;
  last_seen_at: string | null;
  created_at: string;
};

type CameraType = {
  id: string;
  model: string;
  ip_address: string;
  status: string;
  edge_agent_id: string | null;
  gateway_name?: string;
};

type Branch = {
  id: string;
  name: string;
  address: string | null;
  gateway_count: number;
};

type Stats = {
  gateways: number;
  cameras: number;
  branches: number;
  live_sessions: number;
  telemetry_records: number;
};

function getDeleteErrorMessage(body: { error?: string; message?: string; details?: string | { error?: string; message?: string } } | null, fallback = 'Failed to delete. Please try again.') {
  const nestedDetails = typeof body?.details === 'string'
    ? (() => {
        try {
          return JSON.parse(body.details) as { error?: string; message?: string };
        } catch {
          return null;
        }
      })()
    : body?.details;

  if (body?.error === 'camera_not_found' || nestedDetails?.error === 'camera_not_found') {
    return 'The camera was already removed or is no longer available.';
  }

  if (body?.error === 'deletion_constrained' || nestedDetails?.error === 'deletion_constrained') {
    return 'This camera is still referenced by other records and cannot be deleted.';
  }

  if (body?.error === 'camera_deletion_failed' || nestedDetails?.error === 'camera_deletion_failed') {
    return 'The camera could not be deleted at this time. Please try again.';
  }

  if (body?.message) {
    return body.message;
  }

  if (nestedDetails?.message) {
    return nestedDetails.message;
  }

  return body?.error || fallback;
}

export default function SystemManagementPage() {
  const [tab, setTab] = useState<"gateways" | "cameras" | "branches">("gateways");
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: string; name: string } | null>(null);

  useEffect(() => {
    loadStats();
    loadData();
  }, [tab]);

  const loadStats = async () => {
    try {
      const response = await fetch('/api/admin/system/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'gateways') {
        const response = await fetch('/api/admin/system/gateways');
        if (response.ok) {
          const data = await response.json();
          setGateways(data);
        }
      } else if (tab === 'cameras') {
        const response = await fetch('/api/admin/system/cameras');
        if (response.ok) {
          const data = await response.json();
          setCameras(data);
        }
      } else if (tab === 'branches') {
        const response = await fetch('/api/admin/system/branches');
        if (response.ok) {
          const data = await response.json();
          setBranches(data);
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (type: 'gateway' | 'camera' | 'branch', id: string) => {
    if (deleting) return;
    setDeleting(true);
    try {
      // Pluralize the type for the API endpoint
      const pluralType = type === 'gateway' ? 'gateways' 
        : type === 'camera' ? 'cameras' 
        : 'branches';
      
      const response = await fetch(`/api/admin/system/${pluralType}/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setDeleteConfirm(null);
        await loadStats();
        await loadData();
      } else {
        const body = await response.json().catch(() => null) as { error?: string; message?: string; details?: string | { error?: string; message?: string } } | null;
        alert(getDeleteErrorMessage(body));
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppLayout>
      <div className="admin-shell">
        <header className="admin-header">
          <div>
            <a href="/admin" className="admin-back">
              <ArrowLeft size={15} /> Back to Admin
            </a>
            <div className="admin-title">
              <span><Server size={22} /></span>
              <div>
                <h1>System Management</h1>
                <p>Manage gateways, cameras, and branches</p>
              </div>
            </div>
          </div>
        </header>

        {stats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            padding: '1rem',
            background: 'var(--canvas)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            margin: '1rem'
          }}>
            <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px', color: 'var(--ink)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>Gateways</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--ink)' }}>{stats.gateways}</div>
            </div>
            <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px', color: 'var(--ink)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>Cameras</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--ink)' }}>{stats.cameras}</div>
            </div>
            <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px', color: 'var(--ink)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>Branches</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--ink)' }}>{stats.branches}</div>
            </div>
            <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px', color: 'var(--ink)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>Live Sessions</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--ink)' }}>{stats.live_sessions}</div>
            </div>
            <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px', color: 'var(--ink)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>Telemetry Records</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--ink)' }}>{stats.telemetry_records}</div>
            </div>
          </div>
        )}

        <nav className="admin-tabs" aria-label="System sections">
          <button
            className={tab === "gateways" ? "active" : ""}
            onClick={() => setTab("gateways")}
          >
            <Server size={16} /> Gateways
          </button>
          <button
            className={tab === "cameras" ? "active" : ""}
            onClick={() => setTab("cameras")}
          >
            <Camera size={16} /> Cameras
          </button>
          <button
            className={tab === "branches" ? "active" : ""}
            onClick={() => setTab("branches")}
          >
            <Building2 size={16} /> Branches
          </button>
        </nav>

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>
                {tab === 'gateways' && 'Edge Gateways'}
                {tab === 'cameras' && 'Cameras'}
                {tab === 'branches' && 'Branches'}
              </h2>
              <p>
                {tab === 'gateways' && 'Manage edge agent gateways and their connections'}
                {tab === 'cameras' && 'Manage cameras connected to gateways'}
                {tab === 'branches' && 'Manage branch locations and their gateways'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={loadData}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <RefreshCw size={16} /> Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <p>Loading...</p>
            </div>
          ) : (
            <>
              {tab === 'gateways' && (
                <div style={{ overflowX: 'auto' }}>
                  {gateways.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#6c757d' }}>
                      No gateways found
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--canvas)', borderBottom: '2px solid var(--line)' }}>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Name</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>ID</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Status</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Last Seen</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Created</th>
                          <th style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gateways.map((gateway) => (
                          <tr key={gateway.id} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td style={{ padding: '1rem', color: 'var(--ink)' }}>{gateway.name}</td>
                            <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.875rem', color: 'var(--ink)' }}>
                              {gateway.id}
                            </td>
                            <td style={{ padding: '1rem' }}>
                              <span style={{
                                padding: '0.25rem 0.75rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                background: gateway.status === 'online' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: gateway.status === 'online' ? 'var(--green)' : 'var(--red)',
                                border: '1px solid rgba(148, 163, 184, 0.2)'
                              }}>
                                {gateway.status}
                              </span>
                            </td>
                            <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--ink)' }}>
                              {gateway.last_seen_at ? new Date(gateway.last_seen_at).toLocaleString() : 'Never'}
                            </td>
                            <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--ink)' }}>
                              {new Date(gateway.created_at).toLocaleDateString()}
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'center' }}>
                              <button
                                onClick={() => setDeleteConfirm({ type: 'gateway', id: gateway.id, name: gateway.name })}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  background: '#dc3545',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.875rem'
                                }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {tab === 'cameras' && (
                <div style={{ overflowX: 'auto' }}>
                  {cameras.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#6c757d' }}>
                      No cameras found
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--canvas)', borderBottom: '2px solid var(--line)' }}>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Model</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>IP Address</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Gateway</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Status</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>ID</th>
                          <th style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cameras.map((camera) => (
                          <tr key={camera.id} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td style={{ padding: '1rem', color: 'var(--ink)' }}>{camera.model}</td>
                            <td style={{ padding: '1rem', fontFamily: 'monospace', color: 'var(--ink)' }}>{camera.ip_address}</td>
                            <td style={{ padding: '1rem', color: 'var(--ink)' }}>{camera.gateway_name || 'None'}</td>
                            <td style={{ padding: '1rem' }}>
                              <span style={{
                                padding: '0.25rem 0.75rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                background: camera.status === 'online' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: camera.status === 'online' ? 'var(--green)' : 'var(--red)',
                                border: '1px solid rgba(148, 163, 184, 0.2)'
                              }}>
                                {camera.status}
                              </span>
                            </td>
                            <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--ink)' }}>
                              {camera.id.substring(0, 8)}...
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'center' }}>
                              <button
                                onClick={() => setDeleteConfirm({ type: 'camera', id: camera.id, name: camera.model })}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  background: '#dc3545',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.875rem'
                                }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {tab === 'branches' && (
                <div style={{ overflowX: 'auto' }}>
                  {branches.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#6c757d' }}>
                      No branches found
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--canvas)', borderBottom: '2px solid var(--line)' }}>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Name</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Address</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Gateways</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>ID</th>
                          <th style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branches.map((branch) => (
                          <tr key={branch.id} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td style={{ padding: '1rem', fontWeight: '600', color: 'var(--ink)' }}>{branch.name}</td>
                            <td style={{ padding: '1rem', color: 'var(--ink)' }}>{branch.address || 'N/A'}</td>
                            <td style={{ padding: '1rem', color: 'var(--ink)' }}>{branch.gateway_count}</td>
                            <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.875rem', color: 'var(--ink)' }}>
                              {branch.id}
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'center' }}>
                              <a href="/admin/organization" style={{ color: 'var(--accent)', fontSize: '0.875rem' }}>
                                Manage lifecycle
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {deleteConfirm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'var(--surface)',
              color: 'var(--ink)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <AlertTriangle size={24} color="#dc3545" />
                <h3 style={{ margin: 0 }}>Confirm Deletion</h3>
              </div>
              <p>
                Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
              </p>
              {deleteConfirm.type === 'gateway' && (
                <p style={{ color: '#dc3545', fontSize: '0.875rem' }}>
                  This disconnects the gateway and removes it from management. Historical camera and telemetry records are retained.
                </p>
              )}
              {deleteConfirm.type === 'branch' && (
                <p style={{ color: '#dc3545', fontSize: '0.875rem' }}>
                  This will delete the branch and ALL its gateways and cameras.
                </p>
              )}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button
                  disabled={deleting}
                  onClick={() => {
                    handleDelete(deleteConfirm.type as any, deleteConfirm.id);
                  }}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.7 : 1,
                    fontWeight: '600'
                  }}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  disabled={deleting}
                  onClick={() => setDeleteConfirm(null)}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.7 : 1,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
