"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Server, Camera, Building2, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
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

export default function SystemManagementPage() {
  const [tab, setTab] = useState<"gateways" | "cameras" | "branches">("gateways");
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
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
        const nestedDetails = typeof body?.details === 'string' ? (() => {
          try {
            return JSON.parse(body.details) as { error?: string; message?: string };
          } catch {
            return null;
          }
        })() : body?.details;

        const message = nestedDetails?.message || body?.message || body?.error || 'Failed to delete. Please try again.';
        alert(message);
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('An error occurred. Please try again.');
    }
  };

  const handleDeleteAll = async (type: 'gateways' | 'cameras' | 'branches') => {
    const confirmText = prompt(
      `⚠️ DELETE ALL ${type.toUpperCase()}?\n\nThis action cannot be undone!\n\nType "DELETE ALL" to confirm:`
    );

    if (confirmText !== 'DELETE ALL') {
      return;
    }

    try {
      const response = await fetch(`/api/admin/system/${type}/all`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadStats();
        await loadData();
      } else {
        const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
        alert(body?.message || body?.error || 'Failed to delete. Please try again.');
      }
    } catch (error) {
      console.error('Delete all failed:', error);
      alert('An error occurred. Please try again.');
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
            background: '#f8f9fa',
            borderRadius: '8px',
            margin: '1rem'
          }}>
            <div style={{ padding: '1rem', background: 'white', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.875rem', color: '#6c757d', marginBottom: '0.5rem' }}>Gateways</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.gateways}</div>
            </div>
            <div style={{ padding: '1rem', background: 'white', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.875rem', color: '#6c757d', marginBottom: '0.5rem' }}>Cameras</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.cameras}</div>
            </div>
            <div style={{ padding: '1rem', background: 'white', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.875rem', color: '#6c757d', marginBottom: '0.5rem' }}>Branches</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.branches}</div>
            </div>
            <div style={{ padding: '1rem', background: 'white', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.875rem', color: '#6c757d', marginBottom: '0.5rem' }}>Live Sessions</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.live_sessions}</div>
            </div>
            <div style={{ padding: '1rem', background: 'white', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.875rem', color: '#6c757d', marginBottom: '0.5rem' }}>Telemetry Records</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats.telemetry_records}</div>
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
              <button
                onClick={() => handleDeleteAll(tab)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <Trash2 size={16} /> Delete All
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
                        <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>Name</th>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>ID</th>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>Status</th>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>Last Seen</th>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>Created</th>
                          <th style={{ padding: '1rem', textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gateways.map((gateway) => (
                          <tr key={gateway.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                            <td style={{ padding: '1rem' }}>{gateway.name}</td>
                            <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                              {gateway.id}
                            </td>
                            <td style={{ padding: '1rem' }}>
                              <span style={{
                                padding: '0.25rem 0.75rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                background: gateway.status === 'online' ? '#d4edda' : '#f8d7da',
                                color: gateway.status === 'online' ? '#155724' : '#721c24'
                              }}>
                                {gateway.status}
                              </span>
                            </td>
                            <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                              {gateway.last_seen_at ? new Date(gateway.last_seen_at).toLocaleString() : 'Never'}
                            </td>
                            <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
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
                        <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>Model</th>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>IP Address</th>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>Gateway</th>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>Status</th>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>ID</th>
                          <th style={{ padding: '1rem', textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cameras.map((camera) => (
                          <tr key={camera.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                            <td style={{ padding: '1rem' }}>{camera.model}</td>
                            <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{camera.ip_address}</td>
                            <td style={{ padding: '1rem' }}>{camera.gateway_name || 'None'}</td>
                            <td style={{ padding: '1rem' }}>
                              <span style={{
                                padding: '0.25rem 0.75rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                background: camera.status === 'online' ? '#d4edda' : '#f8d7da',
                                color: camera.status === 'online' ? '#155724' : '#721c24'
                              }}>
                                {camera.status}
                              </span>
                            </td>
                            <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
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
                        <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>Name</th>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>Address</th>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>Gateways</th>
                          <th style={{ padding: '1rem', textAlign: 'left' }}>ID</th>
                          <th style={{ padding: '1rem', textAlign: 'center' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branches.map((branch) => (
                          <tr key={branch.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                            <td style={{ padding: '1rem', fontWeight: '600' }}>{branch.name}</td>
                            <td style={{ padding: '1rem' }}>{branch.address || 'N/A'}</td>
                            <td style={{ padding: '1rem' }}>{branch.gateway_count}</td>
                            <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                              {branch.id}
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'center' }}>
                              <button
                                onClick={() => setDeleteConfirm({ type: 'branch', id: branch.id, name: branch.name })}
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
              background: 'white',
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
                  This will also delete all cameras, telemetry, and sessions associated with this gateway.
                </p>
              )}
              {deleteConfirm.type === 'branch' && (
                <p style={{ color: '#dc3545', fontSize: '0.875rem' }}>
                  This will delete the branch and ALL its gateways and cameras.
                </p>
              )}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button
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
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
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
