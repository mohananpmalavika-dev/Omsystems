"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Server, Camera, Building2, RefreshCw, AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { AdminStreamPreferenceCard } from "@/components/admin/AdminStreamPreferenceCard";


type Gateway = {
  id: string;
  name: string;
  status: string;
  last_seen_at: string | null;
  branch_name?: string;
};

type CameraType = {
  id: string;
  name: string;
  model: string;
  vendor: string | null;
  ip_address: string | null;
  status: string;
  edge_agent_id: string | null;
  gateway_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
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
  live_sessions: number | null;
  telemetry_records: number | null;
};

type ManagedResource = "gateway" | "camera";

const CAMERA_PAGE_SIZE = 100;

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
  const [cameraTotal, setCameraTotal] = useState(0);
  const [cameraOffset, setCameraOffset] = useState(0);
  const [cameraSearchInput, setCameraSearchInput] = useState("");
  const [cameraSearch, setCameraSearch] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: ManagedResource; id: string; name: string } | null>(null);

  useEffect(() => {
    void loadStats();
  }, []);

  useEffect(() => {
    void loadData();
  }, [tab, cameraOffset, cameraSearch]);

  const loadStats = async () => {
    try {
      const response = await fetch('/api/admin/system/stats');
      if (!response.ok) throw new Error(await responseError(response, 'System statistics are unavailable'));
      setStats(await response.json());
      setStatsError(null);
    } catch (error) {
      console.error('Failed to load stats:', error);
      setStats(null);
      setStatsError(error instanceof Error ? error.message : 'System statistics are unavailable');
    }
  };

  const loadData = async () => {
    setLoading(true);
    setDataError(null);
    try {
      let response: Response;
      if (tab === 'gateways') {
        response = await fetch('/api/admin/system/gateways');
      } else if (tab === 'cameras') {
        const query = new URLSearchParams({
          limit: String(CAMERA_PAGE_SIZE),
          offset: String(cameraOffset),
        });
        if (cameraSearch) query.set('search', cameraSearch);
        response = await fetch(`/api/admin/system/cameras?${query}`);
      } else if (tab === 'branches') {
        response = await fetch('/api/admin/system/branches');
      } else {
        return;
      }
      if (!response.ok) throw new Error(await responseError(response, `Unable to load ${tab}`));
      const data = await response.json();
      if (tab === 'cameras') {
        if (!Array.isArray(data?.data) || !Number.isSafeInteger(data?.total)) {
          throw new Error('Invalid cameras response');
        }
        setCameras(data.data);
        setCameraTotal(data.total);
      } else {
        if (!Array.isArray(data)) throw new Error(`Invalid ${tab} response`);
        if (tab === 'gateways') setGateways(data);
        else setBranches(data);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setDataError(error instanceof Error ? error.message : `Unable to load ${tab}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (type: ManagedResource, id: string) => {
    if (deleting) return;
    setDeleting(true);
    try {
      // Pluralize the type for the API endpoint
      const pluralType = type === 'gateway' ? 'gateways' : 'cameras';
      
      const response = await fetch(`/api/admin/system/${pluralType}/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setDeleteConfirm(null);
        await loadStats();
        if (type === 'camera' && cameras.length === 1 && cameraOffset > 0) {
          setCameraOffset(Math.max(0, cameraOffset - CAMERA_PAGE_SIZE));
        } else {
          await loadData();
        }
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
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--ink)' }}>{formatMetric(stats.live_sessions)}</div>
            </div>
            <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px', color: 'var(--ink)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>Telemetry Records</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--ink)' }}>{formatMetric(stats.telemetry_records)}</div>
            </div>
          </div>
        )}

        <div style={{ margin: '1rem' }}>
          <AdminStreamPreferenceCard />
        </div>


        {statsError && (
          <div className="admin-panel" role="alert" style={{ margin: '1rem', color: 'var(--red)' }}>
            {statsError}. <button type="button" onClick={loadStats}>Retry statistics</button>
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
            onClick={() => {
              setCameraOffset(0);
              setTab("cameras");
            }}
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
              {tab === 'cameras' && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setCameraOffset(0);
                    setCameraSearch(cameraSearchInput.trim());
                  }}
                  style={{ display: 'flex', gap: '0.5rem' }}
                >
                  <input
                    aria-label="Search cameras"
                    value={cameraSearchInput}
                    onChange={(event) => setCameraSearchInput(event.target.value)}
                    placeholder="Search name or model"
                    maxLength={120}
                    style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--surface)', color: 'var(--ink)' }}
                  />
                  <button type="submit" style={{ padding: '0.5rem 0.75rem' }}>Search</button>
                  {cameraSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setCameraSearchInput('');
                        setCameraSearch('');
                        setCameraOffset(0);
                      }}
                      style={{ padding: '0.5rem 0.75rem' }}
                    >
                      Clear
                    </button>
                  )}
                </form>
              )}
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
          ) : dataError ? (
            <div role="alert" style={{ padding: '2rem', textAlign: 'center', color: 'var(--red)' }}>
              <p>{dataError}</p>
              <button type="button" onClick={loadData}>Retry</button>
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
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Branch</th>
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
                            <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--ink)' }}>{gateway.branch_name || 'Unknown'}</td>
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
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Camera</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Model</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>IP Address</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Gateway</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Branch</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>Status</th>
                          <th style={{ padding: '1rem', textAlign: 'left', color: 'var(--muted)' }}>ID</th>
                          <th style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted)' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cameras.map((camera) => (
                          <tr key={camera.id} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td style={{ padding: '1rem', color: 'var(--ink)', fontWeight: 600 }}>{camera.name}</td>
                            <td style={{ padding: '1rem', color: 'var(--ink)' }}>{camera.model}</td>
                            <td style={{ padding: '1rem', fontFamily: 'monospace', color: 'var(--ink)' }}>{camera.ip_address || 'Not reported'}</td>
                            <td style={{ padding: '1rem', color: 'var(--ink)' }}>{camera.gateway_name || 'Unassigned'}</td>
                            <td style={{ padding: '1rem', color: 'var(--ink)' }}>{camera.branch_name || 'Unknown'}</td>
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
                                onClick={() => setDeleteConfirm({ type: 'camera', id: camera.id, name: camera.name })}
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
                  {cameraTotal > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--line)' }}>
                      <span style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
                        Showing {cameraOffset + 1}–{Math.min(cameraOffset + cameras.length, cameraTotal)} of {cameraTotal.toLocaleString()}
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          disabled={cameraOffset === 0 || loading}
                          onClick={() => setCameraOffset(Math.max(0, cameraOffset - CAMERA_PAGE_SIZE))}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={cameraOffset + cameras.length >= cameraTotal || loading}
                          onClick={() => setCameraOffset(cameraOffset + CAMERA_PAGE_SIZE)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
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
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button
                  disabled={deleting}
                  onClick={() => {
                    handleDelete(deleteConfirm.type, deleteConfirm.id);
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

function formatMetric(value: number | null) {
  return value === null ? '—' : value.toLocaleString();
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return body?.message || body?.error || fallback;
}
