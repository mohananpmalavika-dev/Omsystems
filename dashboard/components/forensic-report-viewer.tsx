"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  FileText,
  Hash,
  Info,
  Shield,
  XCircle,
} from "lucide-react";
import { useState } from "react";

interface VerificationResult {
  passed: boolean;
  message: string;
  details?: string;
  severity?: "info" | "warning" | "error";
}

interface ForensicReport {
  id: string;
  generatedAt: string;
  generatedBy: string;
  segments: Array<{
    id: string;
    cameraId: string;
    cameraName: string;
    startTime: string;
    endTime: string;
    originalHash: string;
    verifiedHash: string;
    hashMatch: boolean;
    gapsBefore: number;
    gapsAfter: number;
  }>;
  chainOfCustody: Array<{
    timestamp: string;
    action: string;
    actor: string;
    details?: string;
  }>;
  verificationChecks: {
    hashIntegrity: VerificationResult;
    timestampContinuity: VerificationResult;
    chainOfCustody: VerificationResult;
    metadataIntegrity: VerificationResult;
  };
  summary: {
    totalSegments: number;
    verifiedSegments: number;
    failedSegments: number;
    overallStatus: "passed" | "warning" | "failed";
    coveragePercent: number;
    totalDurationSeconds: number;
  };
  caseId?: string;
  notes?: string;
}

interface ForensicReportViewerProps {
  report: ForensicReport;
  onDownload?: () => void;
  onClose?: () => void;
}

export function ForensicReportViewer({
  report,
  onDownload,
  onClose,
}: ForensicReportViewerProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "segments" | "custody" | "checks">("summary");

  const getStatusIcon = (status: "passed" | "warning" | "failed") => {
    switch (status) {
      case "passed":
        return <CheckCircle size={24} className="status-icon success" />;
      case "warning":
        return <AlertTriangle size={24} className="status-icon warning" />;
      case "failed":
        return <XCircle size={24} className="status-icon error" />;
    }
  };

  const getVerificationIcon = (severity?: "info" | "warning" | "error") => {
    switch (severity) {
      case "error":
        return <XCircle size={16} className="verification-icon error" />;
      case "warning":
        return <AlertTriangle size={16} className="verification-icon warning" />;
      default:
        return <CheckCircle size={16} className="verification-icon success" />;
    }
  };

  const formatTime = (isoString: string): string => {
    return new Date(isoString).toLocaleString();
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const truncateHash = (hash: string): string => {
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  return (
    <div className="forensic-report-viewer">
      {/* Header */}
      <div className="report-header">
        <div className="header-content">
          <div className="header-title">
            <Shield size={28} />
            <div>
              <h2>Forensic Verification Report</h2>
              <p className="report-id">Report ID: {report.id}</p>
            </div>
          </div>

          <div className="header-status">
            {getStatusIcon(report.summary.overallStatus)}
            <div className="status-text">
              <span className="status-label">Overall Status</span>
              <span className={`status-value ${report.summary.overallStatus}`}>
                {report.summary.overallStatus.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <div className="header-meta">
          <div className="meta-item">
            <Clock size={14} />
            <span>Generated: {formatTime(report.generatedAt)}</span>
          </div>
          <div className="meta-item">
            <FileText size={14} />
            <span>By: {report.generatedBy}</span>
          </div>
          {report.caseId && (
            <div className="meta-item">
              <Hash size={14} />
              <span>Case: {report.caseId}</span>
            </div>
          )}
        </div>

        <div className="header-actions">
          {onDownload && (
            <button className="action-button primary" onClick={onDownload}>
              <Download size={16} />
              Download Report
            </button>
          )}
          {onClose && (
            <button className="action-button secondary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="report-tabs">
        <button
          className={`tab ${activeTab === "summary" ? "active" : ""}`}
          onClick={() => setActiveTab("summary")}
        >
          <Info size={16} />
          Summary
        </button>
        <button
          className={`tab ${activeTab === "segments" ? "active" : ""}`}
          onClick={() => setActiveTab("segments")}
        >
          <FileText size={16} />
          Segments ({report.segments.length})
        </button>
        <button
          className={`tab ${activeTab === "custody" ? "active" : ""}`}
          onClick={() => setActiveTab("custody")}
        >
          <Shield size={16} />
          Chain of Custody ({report.chainOfCustody.length})
        </button>
        <button
          className={`tab ${activeTab === "checks" ? "active" : ""}`}
          onClick={() => setActiveTab("checks")}
        >
          <CheckCircle size={16} />
          Verification Checks
        </button>
      </div>

      {/* Content */}
      <div className="report-content">
        {/* Summary Tab */}
        {activeTab === "summary" && (
          <div className="tab-content">
            <div className="summary-grid">
              <div className="summary-card">
                <div className="card-header">
                  <FileText size={20} />
                  <h3>Recording Coverage</h3>
                </div>
                <div className="card-stats">
                  <div className="stat">
                    <span className="stat-label">Total Segments</span>
                    <span className="stat-value">{report.summary.totalSegments}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Coverage</span>
                    <span className="stat-value">{report.summary.coveragePercent}%</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Duration</span>
                    <span className="stat-value">
                      {formatDuration(report.summary.totalDurationSeconds)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="summary-card">
                <div className="card-header">
                  <Shield size={20} />
                  <h3>Verification Status</h3>
                </div>
                <div className="card-stats">
                  <div className="stat success">
                    <span className="stat-label">Verified</span>
                    <span className="stat-value">{report.summary.verifiedSegments}</span>
                  </div>
                  <div className="stat error">
                    <span className="stat-label">Failed</span>
                    <span className="stat-value">{report.summary.failedSegments}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Success Rate</span>
                    <span className="stat-value">
                      {report.summary.totalSegments > 0
                        ? Math.round(
                            (report.summary.verifiedSegments / report.summary.totalSegments) * 100
                          )
                        : 0}
                      %
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {report.notes && (
              <div className="notes-section">
                <h3>Report Notes</h3>
                <p>{report.notes}</p>
              </div>
            )}

            <div className="quick-checks">
              <h3>Quick Verification Status</h3>
              <div className="checks-list">
                {Object.entries(report.verificationChecks).map(([key, check]) => (
                  <div key={key} className="check-item">
                    {getVerificationIcon(check.severity)}
                    <div className="check-info">
                      <span className="check-name">
                        {key
                          .replace(/([A-Z])/g, " $1")
                          .trim()
                          .replace(/^./, (str) => str.toUpperCase())}
                      </span>
                      <span className="check-message">{check.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Segments Tab */}
        {activeTab === "segments" && (
          <div className="tab-content">
            <div className="segments-table">
              <table>
                <thead>
                  <tr>
                    <th>Camera</th>
                    <th>Time Range</th>
                    <th>Hash Verification</th>
                    <th>Gaps</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.segments.map((segment) => (
                    <tr key={segment.id}>
                      <td>
                        <div className="camera-cell">
                          <strong>{segment.cameraName}</strong>
                          <span className="segment-id">{segment.id.slice(0, 8)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="time-cell">
                          <div>{formatTime(segment.startTime)}</div>
                          <div className="time-to">{formatTime(segment.endTime)}</div>
                        </div>
                      </td>
                      <td>
                        <div className="hash-cell">
                          <div className="hash-row">
                            <span className="hash-label">Original:</span>
                            <code>{truncateHash(segment.originalHash)}</code>
                          </div>
                          <div className="hash-row">
                            <span className="hash-label">Verified:</span>
                            <code>{truncateHash(segment.verifiedHash)}</code>
                          </div>
                        </div>
                      </td>
                      <td>
                        {segment.gapsBefore > 0 || segment.gapsAfter > 0 ? (
                          <div className="gaps-cell">
                            Before: {segment.gapsBefore}, After: {segment.gapsAfter}
                          </div>
                        ) : (
                          <span className="no-gaps">No gaps</span>
                        )}
                      </td>
                      <td>
                        {segment.hashMatch ? (
                          <span className="status-badge success">
                            <CheckCircle size={14} />
                            Verified
                          </span>
                        ) : (
                          <span className="status-badge error">
                            <XCircle size={14} />
                            Failed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Chain of Custody Tab */}
        {activeTab === "custody" && (
          <div className="tab-content">
            <div className="custody-timeline">
              {report.chainOfCustody.map((event, index) => (
                <div key={index} className="custody-event">
                  <div className="event-marker" />
                  <div className="event-content">
                    <div className="event-header">
                      <span className="event-action">{event.action}</span>
                      <span className="event-time">{formatTime(event.timestamp)}</span>
                    </div>
                    <div className="event-actor">
                      <strong>Actor:</strong> {event.actor}
                    </div>
                    {event.details && (
                      <div className="event-details">{event.details}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verification Checks Tab */}
        {activeTab === "checks" && (
          <div className="tab-content">
            <div className="verification-checks">
              {Object.entries(report.verificationChecks).map(([key, check]) => (
                <div key={key} className="verification-card">
                  <div className="verification-header">
                    {getVerificationIcon(check.severity)}
                    <h3>
                      {key
                        .replace(/([A-Z])/g, " $1")
                        .trim()
                        .replace(/^./, (str) => str.toUpperCase())}
                    </h3>
                    <span className={`verification-status ${check.passed ? "passed" : "failed"}`}>
                      {check.passed ? "PASSED" : "FAILED"}
                    </span>
                  </div>
                  <div className="verification-body">
                    <p className="verification-message">{check.message}</p>
                    {check.details && (
                      <p className="verification-details">{check.details}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .forensic-report-viewer {
          display: flex;
          flex-direction: column;
          max-width: 1200px;
          margin: 0 auto;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .report-header {
          padding: 24px;
          background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
          color: white;
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .header-title {
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }

        .header-title h2 {
          margin: 0 0 4px 0;
          font-size: 24px;
        }

        .report-id {
          margin: 0;
          opacity: 0.9;
          font-size: 14px;
        }

        .header-status {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .status-text {
          display: flex;
          flex-direction: column;
        }

        .status-label {
          font-size: 12px;
          opacity: 0.9;
        }

        .status-value {
          font-size: 18px;
          font-weight: 600;
        }

        .status-value.passed {
          color: #d1fae5;
        }

        .status-value.warning {
          color: #fef3c7;
        }

        .status-value.failed {
          color: #fecaca;
        }

        .status-icon {
          flex-shrink: 0;
        }

        .status-icon.success {
          color: #10b981;
        }

        .status-icon.warning {
          color: #f59e0b;
        }

        .status-icon.error {
          color: #ef4444;
        }

        .header-meta {
          display: flex;
          gap: 20px;
          margin-bottom: 16px;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          opacity: 0.9;
        }

        .header-actions {
          display: flex;
          gap: 12px;
        }

        .action-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .action-button.primary {
          background: white;
          color: #7c3aed;
        }

        .action-button.primary:hover {
          background: #f5f3ff;
        }

        .action-button.secondary {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .action-button.secondary:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .report-tabs {
          display: flex;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
        }

        .tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 20px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          font-weight: 500;
          color: #6b7280;
          transition: all 0.2s;
        }

        .tab:hover {
          color: #111827;
          background: #f3f4f6;
        }

        .tab.active {
          color: #7c3aed;
          border-bottom-color: #7c3aed;
          background: white;
        }

        .report-content {
          padding: 24px;
          max-height: 600px;
          overflow-y: auto;
        }

        .tab-content {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
        }

        .summary-card {
          padding: 20px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          color: #7c3aed;
        }

        .card-header h3 {
          margin: 0;
          font-size: 16px;
        }

        .card-stats {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .stat {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          background: white;
          border-radius: 6px;
        }

        .stat.success .stat-value {
          color: #10b981;
          font-weight: 600;
        }

        .stat.error .stat-value {
          color: #ef4444;
          font-weight: 600;
        }

        .stat-label {
          color: #6b7280;
          font-size: 14px;
        }

        .stat-value {
          font-weight: 600;
          font-size: 18px;
        }

        .notes-section {
          padding: 20px;
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 8px;
        }

        .notes-section h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
        }

        .notes-section p {
          margin: 0;
          color: #374151;
        }

        .quick-checks {
          padding: 20px;
          background: #f9fafb;
          border-radius: 8px;
        }

        .quick-checks h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
        }

        .checks-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .check-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px;
          background: white;
          border-radius: 6px;
        }

        .verification-icon {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .verification-icon.success {
          color: #10b981;
        }

        .verification-icon.warning {
          color: #f59e0b;
        }

        .verification-icon.error {
          color: #ef4444;
        }

        .check-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        .check-name {
          font-weight: 600;
          font-size: 14px;
        }

        .check-message {
          font-size: 13px;
          color: #6b7280;
        }

        .segments-table {
          overflow-x: auto;
        }

        .segments-table table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .segments-table th {
          text-align: left;
          padding: 12px;
          background: #f9fafb;
          border-bottom: 2px solid #e5e7eb;
          font-weight: 600;
          color: #374151;
        }

        .segments-table td {
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
        }

        .camera-cell {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .segment-id {
          font-size: 12px;
          color: #6b7280;
        }

        .time-cell {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 13px;
        }

        .time-to {
          color: #6b7280;
        }

        .hash-cell {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
        }

        .hash-row {
          display: flex;
          gap: 6px;
        }

        .hash-label {
          color: #6b7280;
          min-width: 60px;
        }

        code {
          font-family: monospace;
          background: #f3f4f6;
          padding: 2px 4px;
          border-radius: 3px;
        }

        .gaps-cell {
          font-size: 13px;
          color: #ef4444;
        }

        .no-gaps {
          color: #6b7280;
          font-style: italic;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-badge.success {
          background: #d1fae5;
          color: #065f46;
        }

        .status-badge.error {
          background: #fecaca;
          color: #991b1b;
        }

        .custody-timeline {
          position: relative;
          padding-left: 32px;
        }

        .custody-event {
          position: relative;
          padding-bottom: 24px;
        }

        .custody-event:last-child {
          padding-bottom: 0;
        }

        .event-marker {
          position: absolute;
          left: -26px;
          top: 4px;
          width: 12px;
          height: 12px;
          background: #7c3aed;
          border: 3px solid #f5f3ff;
          border-radius: 50%;
        }

        .custody-event::before {
          content: "";
          position: absolute;
          left: -20px;
          top: 16px;
          width: 2px;
          height: calc(100% + 8px);
          background: #e5e7eb;
        }

        .custody-event:last-child::before {
          display: none;
        }

        .event-content {
          padding: 16px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }

        .event-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .event-action {
          font-weight: 600;
          color: #111827;
        }

        .event-time {
          font-size: 13px;
          color: #6b7280;
        }

        .event-actor {
          font-size: 14px;
          margin-bottom: 8px;
        }

        .event-details {
          font-size: 13px;
          color: #6b7280;
          padding: 8px;
          background: white;
          border-radius: 4px;
        }

        .verification-checks {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .verification-card {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
        }

        .verification-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }

        .verification-header h3 {
          flex: 1;
          margin: 0;
          font-size: 16px;
        }

        .verification-status {
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }

        .verification-status.passed {
          background: #d1fae5;
          color: #065f46;
        }

        .verification-status.failed {
          background: #fecaca;
          color: #991b1b;
        }

        .verification-body {
          padding: 16px;
        }

        .verification-message {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: #111827;
        }

        .verification-details {
          margin: 0;
          padding: 12px;
          background: #f9fafb;
          border-radius: 6px;
          font-size: 13px;
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}
