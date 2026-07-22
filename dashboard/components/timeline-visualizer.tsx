"use client";

import {
  AlertCircle,
  Camera,
  CheckCircle,
  Clock,
  Info,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface TimelineSegment {
  startTime: string;
  endTime: string;
  type: "recording" | "gap";
  hasMotion?: boolean;
  hasEvents?: boolean;
  gapReason?: string;
}

interface TimelineEvent {
  id: string;
  timestamp: string;
  type: string;
  title: string;
  severity?: "info" | "warning" | "critical";
  cameraId?: string;
}

interface TimelineVisualizerProps {
  segments: TimelineSegment[];
  events: TimelineEvent[];
  startTime: string;
  endTime: string;
  currentTime?: string;
  onTimeSelect?: (time: string) => void;
  onSegmentClick?: (segment: TimelineSegment) => void;
  highlightGaps?: boolean;
}

export function TimelineVisualizer({
  segments,
  events,
  startTime,
  endTime,
  currentTime,
  onTimeSelect,
  onSegmentClick,
  highlightGaps = true,
}: TimelineVisualizerProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [hoveredSegment, setHoveredSegment] = useState<TimelineSegment | null>(
    null,
  );
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  const totalDurationMs = endMs - startMs;

  // Calculate position percentage for a given time
  const getPositionPercent = (time: string): number => {
    const timeMs = new Date(time).getTime();
    return ((timeMs - startMs) / totalDurationMs) * 100;
  };

  // Calculate width percentage for a duration
  const getWidthPercent = (start: string, end: string): number => {
    const startTimeMs = new Date(start).getTime();
    const endTimeMs = new Date(end).getTime();
    return ((endTimeMs - startTimeMs) / totalDurationMs) * 100;
  };

  // Handle timeline click
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onTimeSelect) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentClicked = (clickX / rect.width) * 100;
    const clickedMs = startMs + (percentClicked / 100) * totalDurationMs;
    const clickedTime = new Date(clickedMs).toISOString();

    onTimeSelect(clickedTime);
  };

  // Handle mouse move for tooltip
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    setTooltipPosition({ x: e.clientX, y: e.clientY });
  };

  // Zoom controls
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev * 1.5, 10));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev / 1.5, 1));
  };

  // Format time for display
  const formatTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleTimeString();
  };

  const formatDateTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const formatDuration = (start: string, end: string): string => {
    const durationMs = new Date(end).getTime() - new Date(start).getTime();
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  // Get severity icon
  const getSeverityIcon = (severity?: string) => {
    switch (severity) {
      case "critical":
        return <AlertCircle size={14} color="#ef4444" />;
      case "warning":
        return <AlertCircle size={14} color="#f59e0b" />;
      default:
        return <Info size={14} color="#3b82f6" />;
    }
  };

  // Calculate statistics
  const recordingSegments = segments.filter((s) => s.type === "recording");
  const gapSegments = segments.filter((s) => s.type === "gap");
  const totalRecordedMs = recordingSegments.reduce((sum, seg) => {
    return (
      sum + (new Date(seg.endTime).getTime() - new Date(seg.startTime).getTime())
    );
  }, 0);
  const coveragePercent = (totalRecordedMs / totalDurationMs) * 100;

  return (
    <div className="timeline-visualizer">
      {/* Header */}
      <div className="timeline-header">
        <div className="header-info">
          <h3>Recording Timeline</h3>
          <div className="time-range">
            {formatDateTime(startTime)} → {formatDateTime(endTime)}
          </div>
        </div>

        <div className="header-controls">
          <div className="zoom-controls">
            <button onClick={handleZoomOut} disabled={zoom <= 1} title="Zoom out">
              <ZoomOut size={16} />
            </button>
            <span className="zoom-level">{Math.round(zoom * 100)}%</span>
            <button onClick={handleZoomIn} disabled={zoom >= 10} title="Zoom in">
              <ZoomIn size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="timeline-stats">
        <div className="stat-item">
          <CheckCircle size={16} className="stat-icon success" />
          <span>
            {recordingSegments.length} Recording
            {recordingSegments.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="stat-item">
          <AlertCircle size={16} className="stat-icon warning" />
          <span>
            {gapSegments.length} Gap{gapSegments.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="stat-item">
          <Clock size={16} className="stat-icon info" />
          <span>Coverage: {coveragePercent.toFixed(1)}%</span>
        </div>
        <div className="stat-item">
          <Camera size={16} className="stat-icon info" />
          <span>{events.length} Events</span>
        </div>
      </div>

      {/* Timeline Container */}
      <div className="timeline-container" ref={timelineRef}>
        <div
          className="timeline-track"
          style={{ width: `${zoom * 100}%` }}
          onClick={handleTimelineClick}
          onMouseMove={handleMouseMove}
        >
          {/* Time markers */}
          <div className="time-markers">
            {Array.from({ length: 13 }).map((_, i) => {
              const markerPercent = (i / 12) * 100;
              const markerMs = startMs + (markerPercent / 100) * totalDurationMs;
              const markerTime = new Date(markerMs).toISOString();
              return (
                <div
                  key={i}
                  className="time-marker"
                  style={{ left: `${markerPercent}%` }}
                >
                  <div className="marker-line" />
                  <div className="marker-label">{formatTime(markerTime)}</div>
                </div>
              );
            })}
          </div>

          {/* Segments */}
          <div className="segments-layer">
            {segments.map((segment, index) => {
              const left = getPositionPercent(segment.startTime);
              const width = getWidthPercent(segment.startTime, segment.endTime);

              return (
                <div
                  key={index}
                  className={`timeline-segment ${segment.type} ${
                    segment.hasMotion ? "has-motion" : ""
                  } ${segment.hasEvents ? "has-events" : ""} ${
                    hoveredSegment === segment ? "hovered" : ""
                  }`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSegmentClick?.(segment);
                  }}
                  onMouseEnter={() => setHoveredSegment(segment)}
                  onMouseLeave={() => setHoveredSegment(null)}
                >
                  {/* Visual indicators */}
                  {segment.type === "gap" && highlightGaps && (
                    <div className="gap-pattern" />
                  )}
                  {segment.hasMotion && (
                    <div className="motion-indicator" title="Motion detected" />
                  )}
                  {segment.hasEvents && (
                    <div className="events-indicator" title="AI events detected" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Events */}
          <div className="events-layer">
            {events.map((event) => {
              const position = getPositionPercent(event.timestamp);
              return (
                <div
                  key={event.id}
                  className={`timeline-event ${event.severity || "info"}`}
                  style={{ left: `${position}%` }}
                  onMouseEnter={() => setHoveredEvent(event)}
                  onMouseLeave={() => setHoveredEvent(null)}
                  title={event.title}
                >
                  <div className="event-marker" />
                </div>
              );
            })}
          </div>

          {/* Current time indicator */}
          {currentTime && (
            <div
              className="current-time-indicator"
              style={{ left: `${getPositionPercent(currentTime)}%` }}
            >
              <div className="current-time-line" />
              <div className="current-time-handle" />
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="timeline-legend">
        <div className="legend-item">
          <div className="legend-box recording" />
          <span>Recording</span>
        </div>
        <div className="legend-item">
          <div className="legend-box gap" />
          <span>Gap</span>
        </div>
        <div className="legend-item">
          <div className="legend-box has-motion" />
          <span>Motion</span>
        </div>
        <div className="legend-item">
          <div className="legend-box has-events" />
          <span>AI Events</span>
        </div>
      </div>

      {/* Tooltips */}
      {hoveredSegment && (
        <div
          className="timeline-tooltip"
          style={{
            left: tooltipPosition.x + 10,
            top: tooltipPosition.y + 10,
          }}
        >
          <div className="tooltip-header">
            {hoveredSegment.type === "recording" ? "Recording" : "Gap"}
          </div>
          <div className="tooltip-content">
            <div className="tooltip-row">
              <strong>Start:</strong> {formatDateTime(hoveredSegment.startTime)}
            </div>
            <div className="tooltip-row">
              <strong>End:</strong> {formatDateTime(hoveredSegment.endTime)}
            </div>
            <div className="tooltip-row">
              <strong>Duration:</strong>{" "}
              {formatDuration(hoveredSegment.startTime, hoveredSegment.endTime)}
            </div>
            {hoveredSegment.type === "gap" && hoveredSegment.gapReason && (
              <div className="tooltip-row">
                <strong>Reason:</strong> {hoveredSegment.gapReason}
              </div>
            )}
            {hoveredSegment.hasMotion && (
              <div className="tooltip-row">
                <strong>Motion:</strong> Detected
              </div>
            )}
            {hoveredSegment.hasEvents && (
              <div className="tooltip-row">
                <strong>AI Events:</strong> Present
              </div>
            )}
          </div>
        </div>
      )}

      {hoveredEvent && (
        <div
          className="timeline-tooltip"
          style={{
            left: tooltipPosition.x + 10,
            top: tooltipPosition.y + 10,
          }}
        >
          <div className="tooltip-header">
            {getSeverityIcon(hoveredEvent.severity)}
            <span>{hoveredEvent.type}</span>
          </div>
          <div className="tooltip-content">
            <div className="tooltip-row">
              <strong>Time:</strong> {formatDateTime(hoveredEvent.timestamp)}
            </div>
            <div className="tooltip-row">{hoveredEvent.title}</div>
          </div>
        </div>
      )}

      <style jsx>{`
        .timeline-visualizer {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
        }

        .timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .timeline-header h3 {
          margin: 0 0 4px 0;
          font-size: 18px;
        }

        .time-range {
          font-size: 13px;
          color: #6b7280;
        }

        .header-controls {
          display: flex;
          gap: 12px;
        }

        .zoom-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }

        .zoom-controls button {
          display: flex;
          align-items: center;
          padding: 4px;
          background: transparent;
          border: none;
          cursor: pointer;
          border-radius: 4px;
        }

        .zoom-controls button:hover:not(:disabled) {
          background: #e5e7eb;
        }

        .zoom-controls button:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .zoom-level {
          font-size: 13px;
          min-width: 45px;
          text-align: center;
        }

        .timeline-stats {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
          padding: 12px;
          background: #f9fafb;
          border-radius: 6px;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .stat-icon {
          flex-shrink: 0;
        }

        .stat-icon.success {
          color: #10b981;
        }

        .stat-icon.warning {
          color: #f59e0b;
        }

        .stat-icon.info {
          color: #3b82f6;
        }

        .timeline-container {
          position: relative;
          height: 120px;
          overflow-x: auto;
          overflow-y: hidden;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          margin-bottom: 16px;
        }

        .timeline-track {
          position: relative;
          height: 100%;
          min-width: 100%;
          cursor: crosshair;
        }

        .time-markers {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 100%;
          pointer-events: none;
        }

        .time-marker {
          position: absolute;
          top: 0;
          height: 100%;
          transform: translateX(-50%);
        }

        .marker-line {
          width: 1px;
          height: 100%;
          background: #d1d5db;
        }

        .marker-label {
          position: absolute;
          top: 4px;
          left: 4px;
          font-size: 11px;
          color: #6b7280;
          white-space: nowrap;
        }

        .segments-layer {
          position: absolute;
          top: 30px;
          left: 0;
          right: 0;
          height: 40px;
        }

        .timeline-segment {
          position: absolute;
          height: 100%;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid transparent;
        }

        .timeline-segment.recording {
          background: #3b82f6;
          border-color: #2563eb;
        }

        .timeline-segment.gap {
          background: #ef4444;
          border-color: #dc2626;
          opacity: 0.6;
        }

        .timeline-segment.has-motion {
          box-shadow: inset 0 -3px 0 #10b981;
        }

        .timeline-segment.has-events {
          box-shadow: inset 0 3px 0 #f59e0b;
        }

        .timeline-segment.hovered {
          transform: scaleY(1.1);
          z-index: 10;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .gap-pattern {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 5px,
            rgba(255, 255, 255, 0.2) 5px,
            rgba(255, 255, 255, 0.2) 10px
          );
        }

        .motion-indicator,
        .events-indicator {
          position: absolute;
          bottom: 2px;
          left: 50%;
          transform: translateX(-50%);
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .motion-indicator {
          background: #10b981;
        }

        .events-indicator {
          background: #f59e0b;
        }

        .events-layer {
          position: absolute;
          top: 75px;
          left: 0;
          right: 0;
          height: 30px;
        }

        .timeline-event {
          position: absolute;
          transform: translateX(-50%);
          cursor: pointer;
        }

        .event-marker {
          width: 3px;
          height: 30px;
          background: currentColor;
          position: relative;
        }

        .event-marker::before {
          content: "";
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
        }

        .timeline-event.info {
          color: #3b82f6;
        }

        .timeline-event.warning {
          color: #f59e0b;
        }

        .timeline-event.critical {
          color: #ef4444;
        }

        .current-time-indicator {
          position: absolute;
          top: 0;
          height: 100%;
          transform: translateX(-50%);
          z-index: 20;
          pointer-events: none;
        }

        .current-time-line {
          width: 2px;
          height: 100%;
          background: #ef4444;
          box-shadow: 0 0 4px rgba(239, 68, 68, 0.5);
        }

        .current-time-handle {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 12px;
          height: 12px;
          background: #ef4444;
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .timeline-legend {
          display: flex;
          gap: 20px;
          justify-content: center;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }

        .legend-box {
          width: 20px;
          height: 14px;
          border-radius: 3px;
          border: 1px solid #d1d5db;
        }

        .legend-box.recording {
          background: #3b82f6;
        }

        .legend-box.gap {
          background: #ef4444;
          opacity: 0.6;
        }

        .legend-box.has-motion {
          background: #3b82f6;
          box-shadow: inset 0 -3px 0 #10b981;
        }

        .legend-box.has-events {
          background: #3b82f6;
          box-shadow: inset 0 3px 0 #f59e0b;
        }

        .timeline-tooltip {
          position: fixed;
          z-index: 1000;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          min-width: 200px;
          pointer-events: none;
        }

        .tooltip-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          font-weight: 600;
          font-size: 14px;
        }

        .tooltip-content {
          padding: 8px 12px;
          font-size: 13px;
        }

        .tooltip-row {
          padding: 4px 0;
        }

        .tooltip-row strong {
          color: #6b7280;
          margin-right: 6px;
        }
      `}</style>
    </div>
  );
}
