"use client";

import {
  AlertTriangle,
  Archive,
  CheckCircle,
  Clock,
  Download,
  Eye,
  FileText,
  Lock,
  MoreVertical,
  Plus,
  Search,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { evidenceApi } from "@/lib/api-client";

interface EvidenceCase {
  id: string;
  caseNumber: string;
  title: string;
  description?: string;
  status: "open" | "investigating" | "closed" | "archived";
  createdAt: string;
  itemCount: number;
  relatedIncidents: number;
  legalHoldCount: number;
}

interface EvidenceItem {
  id: string;
  type: "recording" | "snapshot" | "exported-video" | "manifest" | "document";
  description: string;
  timestamp: string;
  hash?: string;
  fileSize?: number;
  verificationStatus?: "verified" | "mismatch" | "pending";
}

interface ChainOfCustodyEvent {
  id: string;
  action: string;
  performedBy: string;
  performedAt: string;
  reason?: string;
  signature?: string;
}

export function EvidenceManager() {
  const [cases, setCases] = useState<EvidenceCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<EvidenceCase | null>(null);
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [exports, setExports] = useState<any[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [custodyLog, setCustodyLog] = useState<ChainOfCustodyEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCustodyModal, setShowCustodyModal] = useState(false);

  const statusColors: Record<EvidenceCase["status"], string> = {
    open: "#3B82F6",
    investigating: "#F59E0B",
    closed: "#10B981",
    archived: "#6B7280",
  };

  return (
    <div className="evidence-manager-container">
      <div className="evidence-header">
        <h2>Evidence Management & Forensic Vault</h2>
        <p>Manage recorded evidence with chain of custody and legal holds</p>
      </div>

      <div className="evidence-layout">
        {/* Cases List */}
        <div className="cases-panel">
          <div className="panel-header">
            <h3>Evidence Cases</h3>
            <button className="primary-button" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              New Case
            </button>
          </div>

          <div className="cases-list">
            {cases.length === 0 ? (
              <div className="empty-state">
                <FileText size={32} />
                <p>No evidence cases found</p>
                <button onClick={() => setShowCreateModal(true)}>Create your first case</button>
              </div>
            ) : (
              cases.map((evCase) => (
                <div
                  key={evCase.id}
                  className={`case-item ${selectedCase?.id === evCase.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedCase(evCase);
                    void loadCaseDetails(evCase.id);
                  }}
                >
                  <div className="case-header">
                    <div className="case-title">
                      <span className="case-number">{evCase.caseNumber}</span>
                      <span className="case-name">{evCase.title}</span>
                    </div>
                    <span
                      className="status-badge"
                      style={{ backgroundColor: statusColors[evCase.status] }}
                    >
                      {evCase.status}
                    </span>
                  </div>
                  <div className="case-stats">
                    <span>{evCase.itemCount} items</span>
                    {evCase.legalHoldCount > 0 && (
                      <span className="hold-indicator">
                        <Lock size={12} />
                        {evCase.legalHoldCount} holds
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Case Details */}
        {selectedCase && (
          <div className="details-panel">
            <div className="panel-header">
              <h3>{selectedCase.title}</h3>
              <MoreVertical size={16} />
            </div>

            <div className="case-details">
              <div className="detail-section">
                <label>Case Number</label>
                <p>{selectedCase.caseNumber}</p>
              </div>

              <div className="detail-section">
                <label>Status</label>
                <span
                  className="status-badge"
                  style={{ backgroundColor: statusColors[selectedCase.status] }}
                >
                  {selectedCase.status}
                </span>
              </div>

              <div className="detail-section">
                <label>Description</label>
                <p>{selectedCase.description || "—"}</p>
              </div>

              <div className="detail-section">
                <label>Created</label>
                <p>{new Date(selectedCase.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Evidence Items */}
            <div className="items-section">
              <h4>Evidence Items ({items.length})</h4>
              <div className="items-list">
                {items.length === 0 ? (
                  <div className="empty-state-small">
                    <p>No items added to this case</p>
                  </div>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="item-row">
                      <div className="item-icon">
                        {item.type === "recording" && <FileText size={16} />}
                        {item.type === "snapshot" && <Eye size={16} />}
                        {item.type === "exported-video" && <Download size={16} />}
                        {item.type === "manifest" && <Archive size={16} />}
                      </div>
                      <div className="item-info">
                        <span className="item-type">{item.type}</span>
                        <span className="item-description">{item.description}</span>
                        <span className="item-time">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="item-verification">
                        {item.verificationStatus === "verified" && (
                          <span className="verified">
                            <CheckCircle size={14} />
                          </span>
                        )}
                        {item.verificationStatus === "mismatch" && (
                          <span className="mismatch">
                            <AlertTriangle size={14} />
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Chain of Custody */}
            <div className="custody-section">
              <div className="section-header">
                <h4>Chain of Custody</h4>
                <button onClick={() => setShowCustodyModal(true)}>View Log</button>
              </div>
              <div className="custody-timeline">
                {custodyLog.slice(0, 5).map((event, idx) => (
                  <div key={event.id} className="custody-event">
                    <div className="event-marker" />
                    <div className="event-content">
                      <span className="event-action">{event.action}</span>
                      <span className="event-actor">by {event.performedBy}</span>
                      <span className="event-time">
                        {new Date(event.performedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
                {custodyLog.length > 5 && (
                  <button className="view-all-button" onClick={() => setShowCustodyModal(true)}>
                    View all {custodyLog.length} events
                  </button>
                )}
              </div>
            </div>

            {/* Export Jobs */}
            <div className="exports-section">
              <div className="section-header">
                <h4>Recent Exports</h4>
              </div>
              {exports.length === 0 ? (
                <div className="empty-state-small">
                  <p>No exports have been requested for this case yet.</p>
                </div>
              ) : (
                <div className="exports-list">
                  {exports.map((job) => (
                    <div key={job.id} className="export-row">
                      <div>
                        <span className="export-label">{job.format.toUpperCase()}</span>
                        <span className="export-reason">{job.reason}</span>
                      </div>
                      <div className="export-meta">
                        <span>{job.status}</span>
                        <span>{job.progress ?? 0}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {exportError && (
              <div className="error-banner">
                <AlertTriangle size={16} />
                {exportError}
              </div>
            )}

            {/* Actions */}
            <div className="actions-section">
              <button
                className="action-button secondary"
                onClick={() => void handleExportRequest()}
                disabled={exporting}
              >
                <Download size={16} />
                {exporting ? "Requesting export…" : "Export Evidence"}
              </button>
              <button className="action-button secondary">
                <Shield size={16} />
                Verify Integrity
              </button>
              <button className="action-button secondary danger">
                <Trash2 size={16} />
                Delete Case
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Case Modal */}
      {showCreateModal && <CreateCaseModal onClose={() => setShowCreateModal(false)} />}

      {/* Custody Log Modal */}
      {showCustodyModal && (
        <CustodyLogModal log={custodyLog} onClose={() => setShowCustodyModal(false)} />
      )}
    </div>
  );

  useEffect(() => {
    void loadCases();
  }, []);

  async function loadCases() {
    setLoading(true);
    try {
      const caseResponse = await evidenceApi.listCases();
      setCases(caseResponse.data || []);
    } catch (error) {
      console.error("Failed to load evidence cases:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCaseDetails(caseId: string) {
    setLoading(true);
    try {
      const [itemsResponse, custodyResponse, exportsResponse] = await Promise.all([
        evidenceApi.listItems(caseId),
        evidenceApi.getChainOfCustody(caseId),
        evidenceApi.listExports(caseId),
      ]);

      setItems(itemsResponse.data || []);
      setCustodyLog(custodyResponse.data || []);
      setExports(exportsResponse.data || []);
    } catch (error) {
      console.error("Failed to load case details:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleExportRequest() {
    if (!selectedCase) return;

    setExporting(true);
    setExportError(null);

    try {
      await evidenceApi.requestExport(selectedCase.id, {
        format: "original",
        reason: "Evidence export requested from dashboard",
      });
      await loadCaseDetails(selectedCase.id);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Failed to request export");
    } finally {
      setExporting(false);
    }
  }
}

function CreateCaseModal({ onClose }: { onClose: () => void }) {
  const [formData, setFormData] = useState({
    caseNumber: "",
    title: "",
    description: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/control/v1/evidence/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error("Failed to create case");

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create case");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Evidence Case</h3>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          {error && (
            <div className="error-banner">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          <div className="form-group">
            <label>Case Number *</label>
            <input
              type="text"
              placeholder="e.g., CASE-2024-001"
              value={formData.caseNumber}
              onChange={(e) => setFormData((f) => ({ ...f, caseNumber: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              placeholder="Brief title for the case"
              value={formData.title}
              onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              placeholder="Detailed description of the case"
              value={formData.description}
              onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
              rows={4}
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={submitting}>
              {submitting ? "Creating…" : "Create Case"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CustodyLogModal({
  log,
  onClose,
}: {
  log: ChainOfCustodyEvent[];
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Chain of Custody Log</h3>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="custody-log">
          {log.length === 0 ? (
            <p className="empty">No custody events recorded</p>
          ) : (
            <table className="log-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Performed By</th>
                  <th>Reason</th>
                  <th>Signature</th>
                </tr>
              </thead>
              <tbody>
                {log.map((event) => (
                  <tr key={event.id}>
                    <td>{new Date(event.performedAt).toLocaleString()}</td>
                    <td className="action">{event.action}</td>
                    <td>{event.performedBy}</td>
                    <td>{event.reason || "—"}</td>
                    <td className="signature">
                      {event.signature ? (
                        <span className="verified">
                          <CheckCircle size={14} />
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-footer">
          <button className="button primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
