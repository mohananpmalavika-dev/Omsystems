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
  Plus,
  Search,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { evidenceApi } from "@/lib/api-client";
import { PageHero } from "@/components/page-hero";

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
  const searchParams = useSearchParams();
  const branchId = searchParams?.get("branchId");
  const [cases, setCases] = useState<EvidenceCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<EvidenceCase | null>(null);
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [exports, setExports] = useState<any[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [verification, setVerification] = useState<{ allVerified: boolean; verifiedItemCount: number; unverifiableItemCount: number } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [custodyLog, setCustodyLog] = useState<ChainOfCustodyEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [caseQuery, setCaseQuery] = useState("");
  const [caseStatus, setCaseStatus] = useState<"all" | EvidenceCase["status"]>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCustodyModal, setShowCustodyModal] = useState(false);
  const [showRedactModal, setShowRedactModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [selectedAuditData, setSelectedAuditData] = useState<any | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const statusColors: Record<EvidenceCase["status"], string> = {
    open: "#3B82F6",
    investigating: "#F59E0B",
    closed: "#10B981",
    archived: "#6B7280",
  };

  const filteredCases = useMemo(() => {
    const query = caseQuery.trim().toLowerCase();
    return cases.filter((evCase) => {
      const matchesQuery = !query || [evCase.caseNumber, evCase.title, evCase.description]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
      return matchesQuery && (caseStatus === "all" || evCase.status === caseStatus);
    });
  }, [caseQuery, caseStatus, cases]);

  useEffect(() => {
    void loadCases();
  }, []);

  return (
    <div className="evidence-manager-container">
      <PageHero
        eyebrow="Forensics & chain of custody"
        title="Evidence management vault"
        description="Preserve recordings, snapshots and case artifacts with verified integrity, legal holds and an auditable custody trail."
        icon={Shield}
        actions={<button className="btn-primary" onClick={() => setShowCreateModal(true)}><Plus size={16} />New evidence case</button>}
      />

      {branchId && (
        <div className="workflow-context-banner" role="status">
          <Shield size={14} />
          <span>Branch context carried from Command Center</span>
          <strong>{branchId}</strong>
        </div>
      )}

      {loadError && (
        <div className="evidence-load-error" role="alert">
          <AlertTriangle size={16} />
          <span>{loadError}</span>
          <button type="button" onClick={() => void loadCases()}>Try again</button>
        </div>
      )}

      <div className="evidence-layout" aria-busy={loading}>
        {/* Cases List */}
        <div className="cases-panel">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">Case register</span>
              <h3>Evidence Cases <span>{cases.length}</span></h3>
            </div>
            <button className="primary-button" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              New Case
            </button>
          </div>

          <div className="case-toolbar">
            <label className="case-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                value={caseQuery}
                onChange={(event) => setCaseQuery(event.target.value)}
                placeholder="Find a case or reference"
                aria-label="Search evidence cases"
              />
            </label>
            <select value={caseStatus} onChange={(event) => setCaseStatus(event.target.value as typeof caseStatus)} aria-label="Filter evidence cases by status">
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
              <option value="closed">Closed</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="cases-list">
            {loading && cases.length === 0 ? (
              <div className="empty-state" role="status"><Clock size={32} /><p>Loading evidence cases…</p></div>
            ) : filteredCases.length === 0 ? (
              <div className="empty-state">
                <FileText size={32} />
                <p>{cases.length === 0 ? "No evidence cases found" : "No cases match this view"}</p>
                {cases.length === 0 ? <button onClick={() => setShowCreateModal(true)}>Create your first case</button> : <button onClick={() => { setCaseQuery(""); setCaseStatus("all"); }}>Clear filters</button>}
              </div>
            ) : (
              filteredCases.map((evCase) => (
                <button
                  type="button"
                  key={evCase.id}
                  className={`case-item ${selectedCase?.id === evCase.id ? "active" : ""}`}
                  aria-pressed={selectedCase?.id === evCase.id}
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
                </button>
              ))
            )}
          </div>
        </div>

        {/* Case Details */}
        {selectedCase ? (
          <div className="details-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">Case details</span>
                <h3>{selectedCase.title}</h3>
              </div>
              <span className={`integrity-status ${verification ? (verification.allVerified ? "" : "integrity-status-warning") : ""}`}>
                {verification?.allVerified ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                {verification ? (verification.allVerified ? "Integrity verified" : `${verification.unverifiableItemCount} item(s) unverified`) : "Integrity not checked"}
              </span>
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
                        {(job.options?.redaction?.enabled || job.redaction_enabled || job.complianceStandard) && (
                          <span
                            className="badge-redaction-compliance"
                            style={{
                              marginLeft: "8px",
                              padding: "2px 8px",
                              fontSize: "11px",
                              fontWeight: 600,
                              borderRadius: "4px",
                              backgroundColor: "rgba(16, 185, 129, 0.15)",
                              color: "#10B981",
                              border: "1px solid rgba(16, 185, 129, 0.3)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Shield size={11} />
                            {job.complianceStandard || job.options?.redaction?.complianceStandard || "GDPR"} Redacted
                          </span>
                        )}
                        <span className="export-reason">{job.reason}</span>
                      </div>
                      <div className="export-meta">
                        <span>{job.status}</span>
                        <span>{job.progress ?? 0}%</span>
                        {(job.options?.redaction?.enabled || job.redaction_enabled || job.complianceStandard) && (
                          <button
                            type="button"
                            className="audit-cert-link"
                            style={{
                              marginLeft: "8px",
                              background: "none",
                              border: "none",
                              color: "#3B82F6",
                              cursor: "pointer",
                              textDecoration: "underline",
                              fontSize: "12px",
                              padding: 0,
                            }}
                            onClick={() => void handleViewRedactionAudit(job.id)}
                          >
                            Compliance Cert
                          </button>
                        )}
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
                className="action-button primary"
                onClick={() => setShowRedactModal(true)}
                disabled={exporting}
                title="GDPR/DPDP automated privacy redaction and bounding box blurring"
                style={{
                  backgroundColor: "#059669",
                  borderColor: "#10B981",
                }}
              >
                <Shield size={16} />
                Export Redacted (GDPR/DPDP)
              </button>
              <button
                className="action-button secondary"
                onClick={() => void handleExportRequest()}
                disabled={exporting}
              >
                <Download size={16} />
                {exporting ? "Requesting export…" : "Export Evidence"}
              </button>
              <button className="action-button secondary" onClick={() => void handleVerifyIntegrity()} disabled={verifying}>
                <Shield size={16} />
                {verifying ? "Verifying…" : "Verify Integrity"}
              </button>
              <button className="action-button secondary danger" disabled title="Evidence case deletion is managed by retention policy">
                <Trash2 size={16} />
                Delete Case
              </button>
            </div>
          </div>
        ) : (
          <div className="details-panel evidence-empty-details">
            <div className="empty-state">
              <span className="empty-vault-mark"><Shield size={27} /></span>
              <h2>Open an evidence case</h2>
              <p>Select a case to inspect its artifacts, integrity checks, custody history and export activity.</p>
              <button className="primary-button" onClick={() => setShowCreateModal(true)}><Plus size={16} />New evidence case</button>
            </div>
          </div>
        )}
      </div>

      {/* Create Case Modal */}
      {showCreateModal && (
        <CreateCaseModal
          onClose={() => setShowCreateModal(false)}
          onCreated={async () => {
            setShowCreateModal(false);
            await loadCases();
          }}
        />
      )}

      {/* Custody Log Modal */}
      {showCustodyModal && (
        <CustodyLogModal log={custodyLog} onClose={() => setShowCustodyModal(false)} />
      )}

      {/* Redacted Export Modal */}
      {showRedactModal && selectedCase && (
        <RedactedExportModal
          caseId={selectedCase.id}
          caseNumber={selectedCase.caseNumber}
          onClose={() => setShowRedactModal(false)}
          onSubmitted={async () => {
            setShowRedactModal(false);
            await loadCaseDetails(selectedCase.id);
          }}
        />
      )}

      {/* Redaction Compliance Audit Modal */}
      {showAuditModal && (
        <RedactionAuditModal
          data={selectedAuditData}
          loading={auditLoading}
          onClose={() => setShowAuditModal(false)}
        />
      )}
    </div>
  );

  async function loadCases() {
    setLoading(true);
    setLoadError(null);
    try {
      const caseResponse = await evidenceApi.listCases();
      const nextCases = caseResponse.data || [];
      setCases(nextCases);
      if (!selectedCase && nextCases.length > 0) {
        setSelectedCase(nextCases[0]);
        void loadCaseDetails(nextCases[0].id);
      }
    } catch (error) {
      console.error("Failed to load evidence cases:", error);
      setLoadError("The evidence register could not be loaded. Check the connection and try again.");
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
      setVerification(null);
    } catch (error) {
      console.error("Failed to load case details:", error);
      setLoadError("The selected case could not be fully loaded. You can retry from the case register.");
    } finally {
      setLoading(false);
    }
  }

  async function handleViewRedactionAudit(exportId: string) {
    setAuditLoading(true);
    setShowAuditModal(true);
    try {
      const data = await evidenceApi.getRedactionAudit(exportId);
      setSelectedAuditData(data);
    } catch (err) {
      console.error("Failed to load redaction audit:", err);
      setSelectedAuditData(null);
    } finally {
      setAuditLoading(false);
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

  async function handleVerifyIntegrity() {
    if (!selectedCase) return;
    setVerifying(true);
    setExportError(null);
    try {
      const result = await evidenceApi.verifyEvidence(selectedCase.id);
      await loadCaseDetails(selectedCase.id);
      setVerification(result);
      if (!result.allVerified) {
        setExportError(`${result.unverifiableItemCount ?? 0} evidence item(s) could not be verified. Review the recording vault and custody log.`);
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Evidence integrity verification failed");
    } finally {
      setVerifying(false);
    }
  }
}

function CreateCaseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
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
      await evidenceApi.createCase(formData);
      await onCreated();
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

function RedactedExportModal({
  caseId,
  caseNumber,
  onClose,
  onSubmitted,
}: {
  caseId: string;
  caseNumber: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [format, setFormat] = useState<"mp4" | "tar" | "zip">("mp4");
  const [standard, setStandard] = useState<"GDPR" | "DPDP" | "HIPAA" | "CUSTOM">("GDPR");
  const [faceBlur, setFaceBlur] = useState(true);
  const [plateBlur, setPlateBlur] = useState(true);
  const [staticZones, setStaticZones] = useState(true);
  const [mode, setMode] = useState<"blur" | "pixelate" | "solid">("blur");
  const [blurStrength, setBlurStrength] = useState(24);
  const [audioAction, setAudioAction] = useState<"PASS_THROUGH" | "MUTE" | "REMOVE_TRACK">("REMOVE_TRACK");
  const [watermark, setWatermark] = useState("REDACTED EVIDENCE // SECURE EXPORT");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Reason for redacted evidence export is required for compliance logging.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await evidenceApi.requestRedactedExport(caseId, {
        format,
        reason: reason.trim(),
        redaction: {
          complianceStandard: standard,
          faceBlur,
          plateBlur,
          applyStaticZones: staticZones,
          mode,
          blurStrength,
          audioAction,
          watermarkText: watermark.trim() || undefined,
        },
      });
      onSubmitted();
    } catch (err: any) {
      setError(err?.message || "Failed to submit redacted export request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content medium" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Shield size={20} color="#10B981" />
            <h3 style={{ margin: 0 }}>Privacy-Preserving Redacted Export ({caseNumber})</h3>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px" }}>
          {error && (
            <div style={{ padding: "10px", background: "rgba(239, 68, 68, 0.1)", color: "#EF4444", borderRadius: "6px", fontSize: "13px" }}>
              {error}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>Compliance Framework</label>
              <select
                value={standard}
                onChange={(e) => setStandard(e.target.value as any)}
                style={{ width: "100%", padding: "8px", borderRadius: "6px", background: "var(--color-bg-secondary, #1F2937)", color: "inherit", border: "1px solid var(--color-border, #374151)" }}
              >
                <option value="GDPR">GDPR (EU 2016/679 Art 32)</option>
                <option value="DPDP">DPDP (India 2023 Sec 8)</option>
                <option value="HIPAA">HIPAA Privacy Rule</option>
                <option value="CUSTOM">Custom Forensic Privacy</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>Archive Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
                style={{ width: "100%", padding: "8px", borderRadius: "6px", background: "var(--color-bg-secondary, #1F2937)", color: "inherit", border: "1px solid var(--color-border, #374151)" }}
              >
                <option value="mp4">Standalone MP4 (Fast Playback)</option>
                <option value="tar">TAR Forensic Bundle</option>
                <option value="zip">ZIP Forensic Bundle</option>
              </select>
            </div>
          </div>

          <div style={{ border: "1px solid var(--color-border, #374151)", borderRadius: "8px", padding: "12px", background: "var(--color-bg-subtle, rgba(255,255,255,0.02))" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "10px" }}>Redaction Filters & AI Corridor Blurring</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                <input type="checkbox" checked={faceBlur} onChange={(e) => setFaceBlur(e.target.checked)} />
                <span>Automated Face Detection Corridor Blurring</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                <input type="checkbox" checked={plateBlur} onChange={(e) => setPlateBlur(e.target.checked)} />
                <span>License Plate / Vehicle Anonymization</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                <input type="checkbox" checked={staticZones} onChange={(e) => setStaticZones(e.target.checked)} />
                <span>Apply Camera Static Privacy Masking Zones</span>
              </label>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>Redaction Mask Style</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                style={{ width: "100%", padding: "8px", borderRadius: "6px", background: "var(--color-bg-secondary, #1F2937)", color: "inherit", border: "1px solid var(--color-border, #374151)" }}
              >
                <option value="blur">Gaussian Boxblur (Forensic Grade)</option>
                <option value="pixelate">Mosaic Pixelation</option>
                <option value="solid">Solid Blackout Box</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>Blur Strength ({blurStrength}px)</label>
              <input
                type="range"
                min={8}
                max={48}
                value={blurStrength}
                onChange={(e) => setBlurStrength(Number(e.target.value))}
                style={{ width: "100%", marginTop: "8px" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>Audio Track Protection</label>
              <select
                value={audioAction}
                onChange={(e) => setAudioAction(e.target.value as any)}
                style={{ width: "100%", padding: "8px", borderRadius: "6px", background: "var(--color-bg-secondary, #1F2937)", color: "inherit", border: "1px solid var(--color-border, #374151)" }}
              >
                <option value="REMOVE_TRACK">Strip Entire Audio Track (Highest Privacy)</option>
                <option value="MUTE">Mute Audio Stream</option>
                <option value="PASS_THROUGH">Preserve Original Audio</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>Security Watermark</label>
              <input
                type="text"
                value={watermark}
                onChange={(e) => setWatermark(e.target.value)}
                placeholder="Watermark text overlay"
                style={{ width: "100%", padding: "8px", borderRadius: "6px", background: "var(--color-bg-secondary, #1F2937)", color: "inherit", border: "1px solid var(--color-border, #374151)" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>Legal Reason / Chain of Custody Justification *</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., GDPR Subject Access Request disclosure to outside counsel"
              style={{ width: "100%", padding: "8px", borderRadius: "6px", background: "var(--color-bg-secondary, #1F2937)", color: "inherit", border: "1px solid var(--color-border, #374151)" }}
            />
          </div>

          <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
            <button type="button" className="button secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={loading}
              style={{ backgroundColor: "#059669", borderColor: "#10B981", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <Shield size={16} />
              {loading ? "Queueing Redaction..." : "Dispatch Redacted Export"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RedactionAuditModal({
  data,
  loading,
  onClose,
}: {
  data: any | null;
  loading: boolean;
  onClose: () => void;
}) {
  const downloadCertJson = () => {
    if (!data?.complianceCertificate) return;
    const blob = new Blob([JSON.stringify(data.complianceCertificate, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `redaction-certificate-${data.exportJobId || "export"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content medium" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px" }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Shield size={20} color="#10B981" />
            <h3 style={{ margin: 0 }}>Privacy Redaction Compliance Audit</h3>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={{ marginTop: "16px" }}>
          {loading ? (
            <p style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-secondary, #9CA3AF)" }}>
              Loading compliance audit certificate...
            </p>
          ) : !data ? (
            <p style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-secondary, #9CA3AF)" }}>
              No redaction audit data recorded for this export.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                }}
              >
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#10B981" }}>
                    Verified {data.complianceCertificate?.complianceStandard || "Forensic"} Redaction
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-secondary, #9CA3AF)" }}>
                    Job ID: {data.exportJobId}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#10B981", fontSize: "12px", fontWeight: 600 }}>
                  <CheckCircle size={16} /> Cryptographically Signed
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "13px" }}>
                <div style={{ padding: "8px 12px", background: "var(--color-bg-secondary, #1F2937)", borderRadius: "6px" }}>
                  <span style={{ color: "var(--color-text-secondary, #9CA3AF)", fontSize: "11px", display: "block" }}>Total Bounding Boxes Applied</span>
                  <strong style={{ fontSize: "16px" }}>{data.totalBoundingBoxesApplied ?? 0}</strong>
                </div>
                <div style={{ padding: "8px 12px", background: "var(--color-bg-secondary, #1F2937)", borderRadius: "6px" }}>
                  <span style={{ color: "var(--color-text-secondary, #9CA3AF)", fontSize: "11px", display: "block" }}>Static Privacy Zones Applied</span>
                  <strong style={{ fontSize: "16px" }}>{data.staticZonesApplied ?? 0}</strong>
                </div>
                <div style={{ padding: "8px 12px", background: "var(--color-bg-secondary, #1F2937)", borderRadius: "6px" }}>
                  <span style={{ color: "var(--color-text-secondary, #9CA3AF)", fontSize: "11px", display: "block" }}>Audio Stream Action</span>
                  <strong style={{ fontSize: "14px" }}>{data.redactionConfig?.audioAction || "STRIPPED"}</strong>
                </div>
                <div style={{ padding: "8px 12px", background: "var(--color-bg-secondary, #1F2937)", borderRadius: "6px" }}>
                  <span style={{ color: "var(--color-text-secondary, #9CA3AF)", fontSize: "11px", display: "block" }}>Watermark Text</span>
                  <strong style={{ fontSize: "12px" }}>{data.redactionConfig?.watermarkText || "—"}</strong>
                </div>
              </div>

              {data.complianceCertificate?.signature && (
                <div style={{ padding: "10px", background: "rgba(0,0,0,0.3)", borderRadius: "6px", fontSize: "11px", fontFamily: "monospace" }}>
                  <span style={{ color: "#9CA3AF", display: "block", marginBottom: "4px" }}>Forensic Digital Signature:</span>
                  <span style={{ wordBreak: "break-all", color: "#34D399" }}>{data.complianceCertificate.signature}</span>
                </div>
              )}

              {data.auditRecords && data.auditRecords.length > 0 && (
                <div>
                  <span style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Redaction Audit Logs:</span>
                  <div style={{ maxHeight: "140px", overflowY: "auto", fontSize: "12px", border: "1px solid var(--color-border, #374151)", borderRadius: "6px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--color-bg-secondary, #1F2937)", textAlign: "left" }}>
                          <th style={{ padding: "6px 8px" }}>Time</th>
                          <th style={{ padding: "6px 8px" }}>Boxes</th>
                          <th style={{ padding: "6px 8px" }}>Watermark</th>
                          <th style={{ padding: "6px 8px" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.auditRecords.map((r: any) => (
                          <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            <td style={{ padding: "6px 8px" }}>{new Date(r.created_at || r.timestamp).toLocaleTimeString()}</td>
                            <td style={{ padding: "6px 8px" }}>{r.bounding_boxes_applied}</td>
                            <td style={{ padding: "6px 8px" }}>{r.watermark_applied ? "Yes" : "No"}</td>
                            <td style={{ padding: "6px 8px", color: r.redaction_status === "SUCCESS" ? "#10B981" : "#EF4444" }}>{r.redaction_status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ display: "flex", justifyContent: "space-between", marginTop: "16px" }}>
          <div>
            {data?.complianceCertificate && (
              <button
                type="button"
                className="button secondary"
                onClick={downloadCertJson}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px" }}
              >
                <Download size={14} />
                Download Certificate (.json)
              </button>
            )}
          </div>
          <button className="button primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

