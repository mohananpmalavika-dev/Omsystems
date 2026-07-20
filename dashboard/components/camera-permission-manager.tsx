"use client";

import {
  Camera,
  CheckCircle,
  Clock,
  Lock,
  Shield,
  Unlock,
  X,
  XCircle,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  cameraInventoryApi,
  cameraPermissionApi,
} from "@/lib/api-client";

interface CameraPermissionManagerProps {
  userId: string;
  userName: string;
  onClose: () => void;
}

interface CameraGrant {
  id: string;
  cameraId: string;
  cameraName: string;
  effect: "allow" | "deny";
  reason?: string;
  validFrom?: string;
  validUntil?: string;
  grantedBy?: string;
}

interface AccessRequest {
  id: string;
  cameraId: string;
  cameraName: string;
  justification: string;
  status: string;
  requestedFrom: string;
  requestedUntil: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

interface CameraOption {
  id: string;
  name: string;
  branchName: string;
}

export function CameraPermissionManager({
  userId,
  userName,
  onClose,
}: CameraPermissionManagerProps) {
  const [grants, setGrants] = useState<CameraGrant[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [activeTab, setActiveTab] = useState<"grants" | "requests">("grants");
  const [loading, setLoading] = useState(true);
  const [savingGrant, setSavingGrant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOptions, setCameraOptions] = useState<CameraOption[]>([]);
  const [grantForm, setGrantForm] = useState({
    cameraId: "",
    effect: "deny" as "allow" | "deny",
    reason: "",
  });

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [grantsResponse, requestsResponse, branchResponse] = await Promise.all([
        cameraPermissionApi.listUserGrants(userId),
        cameraPermissionApi.listAccessRequests({ userId }),
        cameraInventoryApi.listBranches(),
      ]);

      setGrants(grantsResponse.data);
      setRequests(requestsResponse.data);
      const branchCameras = await Promise.all(
        branchResponse.data.map(async (branch: any) => ({
          branch,
          cameras: (await cameraInventoryApi.listByBranch(branch.id)).data,
        })),
      );
      setCameraOptions(
        branchCameras.flatMap(({ branch, cameras }) =>
          cameras.map((camera: any) => ({
            id: camera.id,
            name: camera.name || camera.model,
            branchName: branch.name,
          })),
        ),
      );
    } catch (err: any) {
      setError(err.message || "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeGrant = async (grantId: string) => {
    if (!confirm("Are you sure you want to revoke this permission?")) return;

    try {
      await cameraPermissionApi.deleteGrant(grantId);
      loadData();
    } catch (err: any) {
      alert(`Failed to revoke grant: ${err.message}`);
    }
  };

  const handleCreateGrant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!grantForm.cameraId) return;
    setSavingGrant(true);
    try {
      await cameraPermissionApi.createGrant({
        userId,
        cameraId: grantForm.cameraId,
        effect: grantForm.effect,
        reason: grantForm.reason || undefined,
      });
      setGrantForm({ cameraId: "", effect: "deny", reason: "" });
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to save camera permission");
    } finally {
      setSavingGrant(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; color: string; icon: any }> = {
      pending: { label: "Pending", color: "blue", icon: Clock },
      approved: { label: "Approved", color: "green", icon: CheckCircle },
      rejected: { label: "Rejected", color: "red", icon: XCircle },
      expired: { label: "Expired", color: "gray", icon: Clock },
      revoked: { label: "Revoked", color: "orange", icon: XCircle },
    };

    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;

    return (
      <span className={`status-badge status-${badge.color}`}>
        <Icon size={12} />
        {badge.label}
      </span>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container modal-large">
        <div className="modal-header">
          <h2>
            Camera Permissions for {userName}
          </h2>
          <button className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="permission-tabs">
          <button
            className={`tab-button ${activeTab === "grants" ? "active" : ""}`}
            onClick={() => setActiveTab("grants")}
          >
            <Shield size={16} />
            Specific Grants ({grants.length})
          </button>
          <button
            className={`tab-button ${activeTab === "requests" ? "active" : ""}`}
            onClick={() => setActiveTab("requests")}
          >
            <Clock size={16} />
            Access Requests ({requests.length})
          </button>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="loading-state">
              <div className="spinner" />
              <p>Loading permissions...</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <p>{error}</p>
              <button onClick={loadData} className="retry-button">
                Retry
              </button>
            </div>
          )}

          {!loading && !error && activeTab === "grants" && (
            <div className="grants-list">
              <form className="grant-form" onSubmit={handleCreateGrant}>
                <div>
                  <label htmlFor="grant-camera">Camera exception</label>
                  <select
                    id="grant-camera"
                    value={grantForm.cameraId}
                    onChange={(event) => setGrantForm((current) => ({
                      ...current,
                      cameraId: event.target.value,
                    }))}
                    required
                  >
                    <option value="">Select a camera…</option>
                    {cameraOptions.map((camera) => (
                      <option key={camera.id} value={camera.id}>
                        {camera.branchName} — {camera.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="grant-effect">Decision</label>
                  <select
                    id="grant-effect"
                    value={grantForm.effect}
                    onChange={(event) => setGrantForm((current) => ({
                      ...current,
                      effect: event.target.value as "allow" | "deny",
                    }))}
                  >
                    <option value="deny">Deny</option>
                    <option value="allow">Allow</option>
                  </select>
                </div>
                <div className="grant-reason">
                  <label htmlFor="grant-reason">Reason</label>
                  <input
                    id="grant-reason"
                    value={grantForm.reason}
                    onChange={(event) => setGrantForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))}
                    placeholder="Example: Locker camera restricted"
                    maxLength={500}
                  />
                </div>
                <button className="primary-button" disabled={savingGrant}>
                  {savingGrant ? "Saving…" : "Apply"}
                </button>
              </form>
              {grants.length === 0 ? (
                <div className="empty-state">
                  <Shield size={48} className="empty-icon" />
                  <p>No specific camera permissions assigned</p>
                  <small>
                    This user has access based on their role and organizational
                    assignment
                  </small>
                </div>
              ) : (
                <table className="permission-table">
                  <thead>
                    <tr>
                      <th>Camera</th>
                      <th>Permission</th>
                      <th>Valid Period</th>
                      <th>Reason</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grants.map((grant) => (
                      <tr key={grant.id}>
                        <td>
                          <div className="camera-cell">
                            <Camera size={16} />
                            {grant.cameraName}
                          </div>
                        </td>
                        <td>
                          {grant.effect === "allow" ? (
                            <span className="permission-badge allow">
                              <Unlock size={12} />
                              Allow
                            </span>
                          ) : (
                            <span className="permission-badge deny">
                              <Lock size={12} />
                              Deny
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="date-cell">
                            {grant.validFrom
                              ? formatDate(grant.validFrom)
                              : "—"}
                            <br />
                            <small>
                              to{" "}
                              {grant.validUntil
                                ? formatDate(grant.validUntil)
                                : "Permanent"}
                            </small>
                          </div>
                        </td>
                        <td>
                          <div className="reason-cell">
                            {grant.reason || "—"}
                          </div>
                        </td>
                        <td>
                          <button
                            className="icon-button text-red-600"
                            onClick={() => handleRevokeGrant(grant.id)}
                            title="Revoke permission"
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {!loading && !error && activeTab === "requests" && (
            <div className="requests-list">
              {requests.length === 0 ? (
                <div className="empty-state">
                  <Clock size={48} className="empty-icon" />
                  <p>No access requests</p>
                  <small>
                    User has not requested temporary access to any cameras
                  </small>
                </div>
              ) : (
                <div className="request-cards">
                  {requests.map((request) => (
                    <div key={request.id} className="request-card">
                      <div className="request-header">
                        <div className="request-camera">
                          <Camera size={16} />
                          {request.cameraName}
                        </div>
                        {getStatusBadge(request.status)}
                      </div>

                      <div className="request-body">
                        <div className="request-field">
                          <strong>Justification:</strong>
                          <p>{request.justification}</p>
                        </div>

                        <div className="request-dates">
                          <div className="request-field">
                            <strong>Requested From:</strong>
                            <p>{formatDate(request.requestedFrom)}</p>
                          </div>
                          <div className="request-field">
                            <strong>Until:</strong>
                            <p>{formatDate(request.requestedUntil)}</p>
                          </div>
                        </div>

                        {request.reviewedAt && (
                          <div className="request-review">
                            <div className="request-field">
                              <strong>Reviewed:</strong>
                              <p>
                                {formatDate(request.reviewedAt)}
                                {request.reviewedBy &&
                                  ` by ${request.reviewedBy}`}
                              </p>
                            </div>
                            {request.reviewNotes && (
                              <div className="request-field">
                                <strong>Notes:</strong>
                                <p>{request.reviewNotes}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
