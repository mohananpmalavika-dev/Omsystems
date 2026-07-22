"use client";

import { useState, useEffect } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  HardDrive,
  Wrench,
  XCircle,
  ChevronDown,
  ChevronUp,
  User,
  Calendar,
} from "lucide-react";

interface HandoverItem {
  id: string;
  itemType: string;
  priority?: string;
  description: string;
  status: "pending" | "acknowledged" | "resolved" | "transferred";
  itemId?: string;
}

interface ShiftHandover {
  id: string;
  outgoingOperatorName: string;
  incomingOperatorName: string;
  shiftStart: string;
  shiftEnd: string;
  handoverNotes?: string;
  acknowledgedAt?: string;
  items: HandoverItem[];
}

export function ShiftHandoverPanel() {
  const [handover, setHandover] = useState<ShiftHandover | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadPendingHandover();
  }, []);

  const loadPendingHandover = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/control/v1/shifts/handovers/pending", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setHandover(data);
      } else if (response.status === 404) {
        setHandover(null);
      }
    } catch (error) {
      console.error("Failed to load handover:", error);
    } finally {
      setLoading(false);
    }
  };

  const acknowledgeHandover = async () => {
    if (!handover) return;

    try {
      const response = await fetch(
        `/api/control/v1/shifts/handovers/${handover.id}/acknowledge`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      if (response.ok) {
        await loadPendingHandover();
      }
    } catch (error) {
      console.error("Failed to acknowledge handover:", error);
    }
  };

  const updateItemStatus = async (itemId: string, status: string) => {
    try {
      const response = await fetch(
        `/api/control/v1/shifts/handover-items/${itemId}/status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status }),
        }
      );

      if (response.ok) {
        await loadPendingHandover();
      }
    } catch (error) {
      console.error("Failed to update item status:", error);
    }
  };

  const toggleItemExpand = (itemId: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const getItemIcon = (itemType: string) => {
    switch (itemType) {
      case "open_incident":
        return <AlertCircle size={18} className="text-red-500" />;
      case "alert":
        return <AlertTriangle size={18} className="text-yellow-500" />;
      case "offline_camera":
        return <Camera size={18} className="text-gray-500" />;
      case "storage_warning":
        return <HardDrive size={18} className="text-orange-500" />;
      case "maintenance":
        return <Wrench size={18} className="text-blue-500" />;
      default:
        return <AlertCircle size={18} className="text-gray-500" />;
    }
  };

  const getPriorityClass = (priority?: string) => {
    switch (priority) {
      case "critical":
        return "priority-critical";
      case "high":
        return "priority-high";
      case "medium":
        return "priority-medium";
      case "low":
        return "priority-low";
      default:
        return "";
    }
  };

  if (loading) {
    return (
      <div className="handover-panel loading">
        <div className="spinner" />
        <p>Loading shift handover...</p>
      </div>
    );
  }

  if (!handover) {
    return (
      <div className="handover-panel empty">
        <CheckCircle2 size={48} className="text-green-500" />
        <h3>No Pending Handover</h3>
        <p>All caught up! No handover items require your attention.</p>
      </div>
    );
  }

  const isAcknowledged = Boolean(handover.acknowledgedAt);
  const pendingItems = handover.items.filter((item) => item.status === "pending");
  const completedItems = handover.items.filter((item) => item.status !== "pending");

  return (
    <div className="handover-panel">
      <div className="handover-header">
        <div className="handover-title">
          <h2>Shift Handover</h2>
          {isAcknowledged ? (
            <span className="badge-success">Acknowledged</span>
          ) : (
            <span className="badge-warning">Pending Review</span>
          )}
        </div>

        <div className="handover-meta">
          <div className="meta-item">
            <User size={16} />
            <span>
              From: <strong>{handover.outgoingOperatorName}</strong>
            </span>
          </div>
          <div className="meta-item">
            <User size={16} />
            <span>
              To: <strong>{handover.incomingOperatorName}</strong>
            </span>
          </div>
          <div className="meta-item">
            <Calendar size={16} />
            <span>
              {new Date(handover.shiftStart).toLocaleString()} →{" "}
              {new Date(handover.shiftEnd).toLocaleTimeString()}
            </span>
          </div>
        </div>

        {handover.handoverNotes && (
          <div className="handover-notes">
            <h4>Handover Notes</h4>
            <p>{handover.handoverNotes}</p>
          </div>
        )}
      </div>

      <div className="handover-items">
        <div className="items-section">
          <h3>
            Pending Items ({pendingItems.length})
            {pendingItems.length > 0 && <span className="count-badge">{pendingItems.length}</span>}
          </h3>

          {pendingItems.length === 0 ? (
            <div className="empty-state">
              <CheckCircle2 size={24} />
              <p>No pending items</p>
            </div>
          ) : (
            <div className="items-list">
              {pendingItems.map((item) => (
                <div key={item.id} className={`handover-item ${getPriorityClass(item.priority)}`}>
                  <div className="item-header">
                    <div className="item-icon">{getItemIcon(item.itemType)}</div>
                    <div className="item-content">
                      <div className="item-title">
                        <span className="item-type">{item.itemType.replace(/_/g, " ")}</span>
                        {item.priority && (
                          <span className={`priority-badge ${item.priority}`}>
                            {item.priority}
                          </span>
                        )}
                      </div>
                      <p className="item-description">{item.description}</p>
                    </div>
                    <button
                      className="expand-button"
                      onClick={() => toggleItemExpand(item.id)}
                    >
                      {expandedItems.has(item.id) ? (
                        <ChevronUp size={18} />
                      ) : (
                        <ChevronDown size={18} />
                      )}
                    </button>
                  </div>

                  {expandedItems.has(item.id) && (
                    <div className="item-actions">
                      <button
                        className="action-btn acknowledge"
                        onClick={() => updateItemStatus(item.id, "acknowledged")}
                      >
                        <CheckCircle2 size={16} />
                        Acknowledge
                      </button>
                      <button
                        className="action-btn resolve"
                        onClick={() => updateItemStatus(item.id, "resolved")}
                      >
                        <CheckCircle2 size={16} />
                        Resolve
                      </button>
                      <button
                        className="action-btn transfer"
                        onClick={() => updateItemStatus(item.id, "transferred")}
                      >
                        <User size={16} />
                        Transfer
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {completedItems.length > 0 && (
          <div className="items-section completed">
            <h3>Completed Items ({completedItems.length})</h3>
            <div className="items-list">
              {completedItems.map((item) => (
                <div key={item.id} className="handover-item completed">
                  <div className="item-header">
                    <div className="item-icon">{getItemIcon(item.itemType)}</div>
                    <div className="item-content">
                      <div className="item-title">
                        <span className="item-type">{item.itemType.replace(/_/g, " ")}</span>
                        <span className={`status-badge ${item.status}`}>{item.status}</span>
                      </div>
                      <p className="item-description">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {!isAcknowledged && (
        <div className="handover-footer">
          <button className="btn-primary" onClick={acknowledgeHandover}>
            <CheckCircle2 size={18} />
            Acknowledge Handover
          </button>
        </div>
      )}

      <style jsx>{`
        .handover-panel {
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          max-width: 900px;
          margin: 0 auto;
        }

        .handover-panel.loading,
        .handover-panel.empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          text-align: center;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e5e7eb;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .handover-header {
          padding: 24px;
          border-bottom: 1px solid #e5e7eb;
        }

        .handover-title {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .handover-title h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }

        .badge-success,
        .badge-warning {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .badge-success {
          background: #d1fae5;
          color: #065f46;
        }

        .badge-warning {
          background: #fef3c7;
          color: #92400e;
        }

        .handover-meta {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 16px;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #6b7280;
        }

        .handover-notes {
          margin-top: 16px;
          padding: 16px;
          background: #f9fafb;
          border-radius: 8px;
        }

        .handover-notes h4 {
          margin: 0 0 8px 0;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }

        .handover-notes p {
          margin: 0;
          font-size: 14px;
          line-height: 1.6;
          color: #6b7280;
        }

        .handover-items {
          padding: 24px;
        }

        .items-section {
          margin-bottom: 32px;
        }

        .items-section h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .count-badge {
          background: #ef4444;
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 32px;
          color: #9ca3af;
        }

        .items-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .handover-item {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
          transition: all 0.2s;
        }

        .handover-item.priority-critical {
          border-left: 4px solid #dc2626;
        }

        .handover-item.priority-high {
          border-left: 4px solid #ea580c;
        }

        .handover-item.priority-medium {
          border-left: 4px solid #eab308;
        }

        .handover-item.priority-low {
          border-left: 4px solid #3b82f6;
        }

        .handover-item.completed {
          opacity: 0.7;
          background: #f9fafb;
        }

        .item-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .item-icon {
          flex-shrink: 0;
        }

        .item-content {
          flex: 1;
        }

        .item-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .item-type {
          font-weight: 600;
          font-size: 14px;
          text-transform: capitalize;
        }

        .priority-badge {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .priority-badge.critical {
          background: #fee2e2;
          color: #991b1b;
        }

        .priority-badge.high {
          background: #ffedd5;
          color: #9a3412;
        }

        .priority-badge.medium {
          background: #fef3c7;
          color: #92400e;
        }

        .priority-badge.low {
          background: #dbeafe;
          color: #1e40af;
        }

        .status-badge {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: capitalize;
        }

        .status-badge.acknowledged {
          background: #dbeafe;
          color: #1e40af;
        }

        .status-badge.resolved {
          background: #d1fae5;
          color: #065f46;
        }

        .status-badge.transferred {
          background: #e0e7ff;
          color: #3730a3;
        }

        .item-description {
          margin: 0;
          font-size: 14px;
          color: #6b7280;
          line-height: 1.5;
        }

        .expand-button {
          background: none;
          border: none;
          cursor: pointer;
          color: #6b7280;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .expand-button:hover {
          background: #f3f4f6;
          color: #374151;
        }

        .item-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
        }

        .action-btn {
          padding: 6px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .action-btn.acknowledge:hover {
          background: #dbeafe;
          border-color: #3b82f6;
          color: #1e40af;
        }

        .action-btn.resolve:hover {
          background: #d1fae5;
          border-color: #10b981;
          color: #065f46;
        }

        .action-btn.transfer:hover {
          background: #e0e7ff;
          border-color: #6366f1;
          color: #3730a3;
        }

        .handover-footer {
          padding: 24px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: flex-end;
        }

        .btn-primary {
          padding: 12px 24px;
          border-radius: 8px;
          border: none;
          background: #3b82f6;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .btn-primary:hover {
          background: #2563eb;
        }

        .text-red-500 {
          color: #ef4444;
        }

        .text-yellow-500 {
          color: #eab308;
        }

        .text-gray-500 {
          color: #6b7280;
        }

        .text-orange-500 {
          color: #f97316;
        }

        .text-blue-500 {
          color: #3b82f6;
        }

        .text-green-500 {
          color: #10b981;
        }
      `}</style>
    </div>
  );
}
