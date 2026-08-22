/**
 * Capacity Monitor Component
 * 
 * Displays real-time viewer capacity, decoder usage, and scheduling statistics
 */

"use client";

import { useState } from "react";
import { Activity, Cpu, Gauge, HardDrive, Monitor, Video, ChevronDown, ChevronUp } from "lucide-react";
import type {
  ViewerCapacity,
  ViewerResourceBudget,
  ScheduledCamera,
} from "@/lib/video/types";

export interface CapacityMonitorProps {
  capacity: ViewerCapacity | null;
  budget: ViewerResourceBudget | null;
  schedule: Map<string, ScheduledCamera>;
  activeDecoderCount: number;
  snapshotCount: number;
  compact?: boolean;
}

export function CapacityMonitor({
  capacity,
  budget,
  schedule,
  activeDecoderCount,
  snapshotCount,
  compact = false,
}: CapacityMonitorProps) {
  const [expanded, setExpanded] = useState(!compact);

  if (!capacity || !budget) {
    return (
      <div className="capacity-monitor loading">
        <Activity className="animate-spin" size={16} />
        <span>Detecting viewer capacity...</span>
      </div>
    );
  }

  // Calculate stats
  const liveCount = Array.from(schedule.values()).filter(
    (s) => s.mode === "MAIN_STREAM" || s.mode === "SUB_STREAM"
  ).length;

  const snapshotModeCount = Array.from(schedule.values()).filter(
    (s) => s.mode === "SNAPSHOT"
  ).length;

  const decoderUtilization = budget.decoderBudget > 0
    ? (budget.decoderUsage / budget.decoderBudget) * 100
    : 0;

  const bitrateUtilization = budget.bitrateBudgetMbps > 0
    ? (budget.bitrateUsageMbps / budget.bitrateBudgetMbps) * 100
    : 0;

  const pixelUtilization = budget.pixelsPerSecondBudget > 0
    ? (budget.pixelsPerSecondUsage / budget.pixelsPerSecondBudget) * 100
    : 0;

  // Priority breakdown
  const priorityBreakdown = {
    P0: 0,
    P1: 0,
    P2: 0,
    P3: 0,
    other: 0,
  };

  for (const scheduled of schedule.values()) {
    if (scheduled.mode !== "MAIN_STREAM" && scheduled.mode !== "SUB_STREAM") {
      continue;
    }

    if (scheduled.priority === "P0_OPERATOR_PINNED") {
      priorityBreakdown.P0++;
    } else if (scheduled.priority === "P1_CRITICAL") {
      priorityBreakdown.P1++;
    } else if (scheduled.priority === "P2_HIGH") {
      priorityBreakdown.P2++;
    } else if (scheduled.priority === "P3_INCIDENT") {
      priorityBreakdown.P3++;
    } else {
      priorityBreakdown.other++;
    }
  }

  const getUtilizationColor = (percent: number): string => {
    if (percent < 60) return "#10b981"; // green
    if (percent < 80) return "#f59e0b"; // amber
    return "#ef4444"; // red
  };

  if (compact && !expanded) {
    return (
      <div className="capacity-monitor compact" onClick={() => setExpanded(true)}>
        <div className="monitor-summary">
          <div className="summary-item">
            <Video size={14} />
            <span>{liveCount} / {budget.decoderBudget}</span>
          </div>
          <div className="summary-item">
            <Monitor size={14} />
            <span>{Math.round(decoderUtilization)}%</span>
          </div>
          <div className="summary-item">
            <Activity size={14} />
            <span>{budget.bitrateUsageMbps.toFixed(1)} Mbps</span>
          </div>
          <button className="expand-button" title="Expand capacity details">
            <ChevronDown size={14} />
          </button>
        </div>

        <style jsx>{`
          .capacity-monitor.compact {
            padding: 8px 12px;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .capacity-monitor.compact:hover {
            border-color: #3b82f6;
            background: #f9fafb;
          }

          .monitor-summary {
            display: flex;
            align-items: center;
            gap: 16px;
          }

          .summary-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 600;
            color: #374151;
          }

          .expand-button {
            margin-left: auto;
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            color: #6b7280;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="capacity-monitor expanded">
      <div className="monitor-header">
        <h3>
          <Gauge size={18} />
          Viewer Capacity
        </h3>
        {compact && (
          <button className="collapse-button" onClick={() => setExpanded(false)}>
            <ChevronUp size={16} />
          </button>
        )}
      </div>

      <div className="monitor-grid">
        {/* Decoder Usage */}
        <div className="monitor-card">
          <div className="card-header">
            <Video size={16} />
            <span>Decoders</span>
          </div>
          <div className="card-value">
            {budget.decoderUsage.toFixed(1)} / {budget.decoderBudget}
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${Math.min(100, decoderUtilization)}%`,
                backgroundColor: getUtilizationColor(decoderUtilization),
              }}
            />
          </div>
          <div className="card-detail">
            {Math.round(decoderUtilization)}% utilized • {budget.emergencyReserve} emergency reserve
          </div>
        </div>

        {/* Bitrate Usage */}
        <div className="monitor-card">
          <div className="card-header">
            <Activity size={16} />
            <span>Bandwidth</span>
          </div>
          <div className="card-value">
            {budget.bitrateUsageMbps.toFixed(1)} / {budget.bitrateBudgetMbps.toFixed(0)} Mbps
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${Math.min(100, bitrateUtilization)}%`,
                backgroundColor: getUtilizationColor(bitrateUtilization),
              }}
            />
          </div>
          <div className="card-detail">{Math.round(bitrateUtilization)}% utilized</div>
        </div>

        {/* Pixel Budget */}
        <div className="monitor-card">
          <div className="card-header">
            <Monitor size={16} />
            <span>Decode Load</span>
          </div>
          <div className="card-value">
            {(budget.pixelsPerSecondUsage / 1_000_000).toFixed(0)} / {(budget.pixelsPerSecondBudget / 1_000_000).toFixed(0)} MP/s
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${Math.min(100, pixelUtilization)}%`,
                backgroundColor: getUtilizationColor(pixelUtilization),
              }}
            />
          </div>
          <div className="card-detail">{Math.round(pixelUtilization)}% utilized</div>
        </div>

        {/* Hardware Info */}
        <div className="monitor-card">
          <div className="card-header">
            <Cpu size={16} />
            <span>Hardware</span>
          </div>
          <div className="card-tags">
            <span className={`hw-tag ${capacity.hardwareAcceleration === "AVAILABLE" ? "available" : "unavailable"}`}>
              {capacity.hardwareAcceleration === "AVAILABLE" ? "HW Accel" : "SW Decode"}
            </span>
            <span className="hw-tag codec">{capacity.preferredCodec}</span>
          </div>
          <div className="card-detail">
            {capacity.supportedCodecs.join(", ")}
          </div>
        </div>
      </div>

      {/* Stream Breakdown */}
      <div className="stream-breakdown">
        <div className="breakdown-header">Stream Distribution</div>
        <div className="breakdown-stats">
          <div className="stat-item live">
            <div className="stat-label">Live</div>
            <div className="stat-value">{liveCount}</div>
          </div>
          <div className="stat-item snapshot">
            <div className="stat-label">Snapshot</div>
            <div className="stat-value">{snapshotModeCount}</div>
          </div>
          <div className="stat-item total">
            <div className="stat-label">Total</div>
            <div className="stat-value">{schedule.size}</div>
          </div>
        </div>
      </div>

      {/* Priority Breakdown */}
      {(priorityBreakdown.P0 > 0 || priorityBreakdown.P1 > 0 || priorityBreakdown.P2 > 0) && (
        <div className="priority-breakdown">
          <div className="breakdown-header">Priority Allocation</div>
          <div className="priority-bars">
            {priorityBreakdown.P0 > 0 && (
              <div className="priority-bar p0">
                <span className="priority-label">P0 Operator</span>
                <span className="priority-count">{priorityBreakdown.P0}</span>
              </div>
            )}
            {priorityBreakdown.P1 > 0 && (
              <div className="priority-bar p1">
                <span className="priority-label">P1 Critical</span>
                <span className="priority-count">{priorityBreakdown.P1}</span>
              </div>
            )}
            {priorityBreakdown.P2 > 0 && (
              <div className="priority-bar p2">
                <span className="priority-label">P2 High</span>
                <span className="priority-count">{priorityBreakdown.P2}</span>
              </div>
            )}
            {priorityBreakdown.P3 > 0 && (
              <div className="priority-bar p3">
                <span className="priority-label">P3 Incident</span>
                <span className="priority-count">{priorityBreakdown.P3}</span>
              </div>
            )}
            {priorityBreakdown.other > 0 && (
              <div className="priority-bar normal">
                <span className="priority-label">Normal</span>
                <span className="priority-count">{priorityBreakdown.other}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .capacity-monitor {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 16px;
        }

        .capacity-monitor.loading {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          color: #6b7280;
        }

        .monitor-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .monitor-header h3 {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        .collapse-button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          color: #6b7280;
        }

        .monitor-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }

        .monitor-card {
          padding: 12px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 8px;
        }

        .card-value {
          font-size: 20px;
          font-weight: 700;
          color: #111827;
          margin-bottom: 8px;
        }

        .progress-bar {
          height: 6px;
          background: #e5e7eb;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 6px;
        }

        .progress-fill {
          height: 100%;
          transition: width 0.3s, background-color 0.3s;
        }

        .card-detail {
          font-size: 11px;
          color: #6b7280;
        }

        .card-tags {
          display: flex;
          gap: 6px;
          margin-bottom: 8px;
        }

        .hw-tag {
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }

        .hw-tag.available {
          background: #d1fae5;
          color: #065f46;
        }

        .hw-tag.unavailable {
          background: #fee2e2;
          color: #991b1b;
        }

        .hw-tag.codec {
          background: #dbeafe;
          color: #1e40af;
        }

        .stream-breakdown,
        .priority-breakdown {
          padding: 12px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          margin-bottom: 12px;
        }

        .stream-breakdown:last-child,
        .priority-breakdown:last-child {
          margin-bottom: 0;
        }

        .breakdown-header {
          font-size: 13px;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 10px;
        }

        .breakdown-stats {
          display: flex;
          gap: 16px;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .stat-label {
          font-size: 11px;
          color: #6b7280;
          font-weight: 500;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
        }

        .stat-item.live .stat-value {
          color: #10b981;
        }

        .stat-item.snapshot .stat-value {
          color: #f59e0b;
        }

        .stat-item.total .stat-value {
          color: #3b82f6;
        }

        .priority-bars {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .priority-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 600;
        }

        .priority-bar.p0 {
          background: #fef3c7;
          color: #92400e;
        }

        .priority-bar.p1 {
          background: #fee2e2;
          color: #991b1b;
        }

        .priority-bar.p2 {
          background: #fed7aa;
          color: #9a3412;
        }

        .priority-bar.p3 {
          background: #dbeafe;
          color: #1e40af;
        }

        .priority-bar.normal {
          background: #e5e7eb;
          color: #374151;
        }

        .priority-label {
          font-weight: 500;
        }

        .priority-count {
          font-weight: 700;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
