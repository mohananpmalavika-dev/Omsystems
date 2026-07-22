"use client";

import {
  AlertTriangle,
  Calendar,
  Camera,
  Clock,
  Download,
  Filter,
  Grid,
  List,
  Loader2,
  MoreVertical,
  Play,
  Search,
  SlidersHorizontal,
  Video,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";

interface SearchFilters {
  cameraId?: string;
  branchId?: string;
  from: string;
  to: string;
  eventType?: string;
  objectClass?: string;
  hasMotion?: boolean;
  hasAIEvents?: boolean;
  minDuration?: number;
  recordingType?: "continuous" | "motion" | "scheduled" | "event" | "manual";
}

interface RecordingSegment {
  id: string;
  cameraId: string;
  startedAt: string;
  endedAt: string;
  sizeBytes: number;
  status: string;
  codec?: string;
  checksumSha256?: string;
}

interface SearchResult {
  segments: RecordingSegment[];
  gaps: Array<{ startTime: string; endTime: string; reason?: string }>;
  timeline: Array<{
    startTime: string;
    endTime: string;
    type: "recording" | "gap";
    hasMotion?: boolean;
    hasEvents?: boolean;
  }>;
  events: Array<{
    id: string;
    timestamp: string;
    type: string;
    title: string;
    severity?: string;
  }>;
  total: number;
  recordedSeconds: number;
  requestedSeconds: number;
  coveragePercent: number;
}

interface Branch {
  id: string;
  name: string;
}

interface Camera {
  id: string;
  name: string;
  branchId: string;
}

export function VideoSearchInterface() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({
    from: getDefaultFromTime(),
    to: getDefaultToTime(),
  });
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "timeline">("list");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Load branches on mount
  useEffect(() => {
    void loadBranches();
  }, []);

  // Load cameras when branch changes
  useEffect(() => {
    if (filters.branchId) {
      void loadCameras(filters.branchId);
    }
  }, [filters.branchId]);

  async function loadBranches() {
    try {
      const response = await fetch("/api/branches");
      if (response.ok) {
        const data = await response.json();
        setBranches(data.data || []);
      }
    } catch (err) {
      console.error("Failed to load branches:", err);
    }
  }

  async function loadCameras(branchId: string) {
    try {
      const response = await fetch(
        `/api/branches/${encodeURIComponent(branchId)}/cameras`,
      );
      if (response.ok) {
        const data = await response.json();
        setCameras(data.data || []);
      }
    } catch (err) {
      console.error("Failed to load cameras:", err);
    }
  }

  async function handleSearch() {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      queryParams.append("from", filters.from);
      queryParams.append("to", filters.to);

      if (filters.cameraId) queryParams.append("cameraId", filters.cameraId);
      if (filters.branchId) queryParams.append("branchId", filters.branchId);
      if (filters.eventType) queryParams.append("eventType", filters.eventType);
      if (filters.objectClass)
        queryParams.append("objectClass", filters.objectClass);
      if (filters.hasMotion !== undefined)
        queryParams.append("hasMotion", String(filters.hasMotion));
      if (filters.hasAIEvents !== undefined)
        queryParams.append("hasAIEvents", String(filters.hasAIEvents));
      if (filters.minDuration)
        queryParams.append("minDuration", String(filters.minDuration));
      if (filters.recordingType)
        queryParams.append("recordingType", filters.recordingType);

      const response = await fetch(
        `/api/control/v1/recordings/search?${queryParams.toString()}`,
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Search failed");
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(field: keyof SearchFilters, value: any) {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  return (
    <div className="video-search-container">
      {/* Header */}
      <div className="search-header">
        <div>
          <h1>
            <Video className="inline" size={24} />
            Video Search & Investigation
          </h1>
          <p>
            Search recordings by date, camera, events, motion, and detected
            objects
          </p>
        </div>
      </div>

      {/* Search Filters */}
      <div className="search-filters-panel">
        <div className="filters-row">
          {/* Branch Selection */}
          <div className="filter-field">
            <label>
              <SlidersHorizontal size={16} />
              Branch
            </label>
            <select
              value={filters.branchId || ""}
              onChange={(e) => handleFilterChange("branchId", e.target.value)}
            >
              <option value="">All Branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          {/* Camera Selection */}
          <div className="filter-field">
            <label>
              <Camera size={16} />
              Camera
            </label>
            <select
              value={filters.cameraId || ""}
              onChange={(e) => handleFilterChange("cameraId", e.target.value)}
              disabled={!filters.branchId}
            >
              <option value="">All Cameras</option>
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.name}
                </option>
              ))}
            </select>
          </div>

          {/* From Date/Time */}
          <div className="filter-field">
            <label>
              <Calendar size={16} />
              From
            </label>
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(e) => handleFilterChange("from", e.target.value)}
            />
          </div>

          {/* To Date/Time */}
          <div className="filter-field">
            <label>
              <Clock size={16} />
              To
            </label>
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(e) => handleFilterChange("to", e.target.value)}
            />
          </div>
        </div>

        {/* Advanced Filters Toggle */}
        <button
          className="toggle-advanced-button"
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
        >
          <Filter size={16} />
          {showAdvancedFilters ? "Hide" : "Show"} Advanced Filters
        </button>

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div className="advanced-filters">
            <div className="filters-row">
              <div className="filter-field">
                <label>Event Type</label>
                <select
                  value={filters.eventType || ""}
                  onChange={(e) =>
                    handleFilterChange("eventType", e.target.value)
                  }
                >
                  <option value="">All Events</option>
                  <option value="motion">Motion</option>
                  <option value="person">Person Detected</option>
                  <option value="vehicle">Vehicle Detected</option>
                  <option value="intrusion">Intrusion</option>
                  <option value="loitering">Loitering</option>
                </select>
              </div>

              <div className="filter-field">
                <label>Recording Type</label>
                <select
                  value={filters.recordingType || ""}
                  onChange={(e) =>
                    handleFilterChange(
                      "recordingType",
                      e.target.value as any,
                    )
                  }
                >
                  <option value="">All Types</option>
                  <option value="continuous">Continuous</option>
                  <option value="motion">Motion</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="event">Event</option>
                </select>
              </div>

              <div className="filter-field">
                <label>Min Duration (seconds)</label>
                <input
                  type="number"
                  min="1"
                  value={filters.minDuration || ""}
                  onChange={(e) =>
                    handleFilterChange(
                      "minDuration",
                      e.target.value ? parseInt(e.target.value) : undefined,
                    )
                  }
                  placeholder="Any duration"
                />
              </div>

              <div className="filter-field">
                <label style={{ display: "flex", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={filters.hasMotion || false}
                    onChange={(e) =>
                      handleFilterChange("hasMotion", e.target.checked)
                    }
                    style={{ marginRight: "8px" }}
                  />
                  Has Motion
                </label>
              </div>

              <div className="filter-field">
                <label style={{ display: "flex", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={filters.hasAIEvents || false}
                    onChange={(e) =>
                      handleFilterChange("hasAIEvents", e.target.checked)
                    }
                    style={{ marginRight: "8px" }}
                  />
                  Has AI Events
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Search Button */}
        <div className="search-actions">
          <button
            className="primary-button"
            onClick={() => void handleSearch()}
            disabled={loading || !filters.from || !filters.to}
          >
            {loading ? (
              <>
                <Loader2 className="spin" size={16} />
                Searching...
              </>
            ) : (
              <>
                <Search size={16} />
                Search Recordings
              </>
            )}
          </button>

          {results && (
            <button
              className="secondary-button"
              onClick={() => setResults(null)}
            >
              <X size={16} />
              Clear Results
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-banner">
          <AlertTriangle size={20} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Results Summary */}
      {results && (
        <div className="results-summary">
          <div className="summary-stats">
            <div className="stat-card">
              <span className="stat-label">Total Segments</span>
              <span className="stat-value">{results.total}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Coverage</span>
              <span className="stat-value">{results.coveragePercent}%</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Recorded</span>
              <span className="stat-value">
                {formatDuration(results.recordedSeconds)}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Gaps</span>
              <span className="stat-value">{results.gaps.length}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Events</span>
              <span className="stat-value">{results.events.length}</span>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="view-mode-toggle">
            <button
              className={viewMode === "list" ? "active" : ""}
              onClick={() => setViewMode("list")}
            >
              <List size={16} />
              List
            </button>
            <button
              className={viewMode === "grid" ? "active" : ""}
              onClick={() => setViewMode("grid")}
            >
              <Grid size={16} />
              Grid
            </button>
            <button
              className={viewMode === "timeline" ? "active" : ""}
              onClick={() => setViewMode("timeline")}
            >
              <Video size={16} />
              Timeline
            </button>
          </div>
        </div>
      )}

      {/* Results Display */}
      {results && (
        <div className="results-container">
          {viewMode === "list" && (
            <div className="results-list">
              {results.segments.length === 0 ? (
                <div className="empty-state">
                  <Video size={48} />
                  <h3>No recordings found</h3>
                  <p>Try adjusting your search filters</p>
                </div>
              ) : (
                results.segments.map((segment) => (
                  <div key={segment.id} className="segment-item">
                    <div className="segment-info">
                      <div className="segment-header">
                        <Play size={16} />
                        <span className="segment-time">
                          {formatTime(segment.startedAt)} -{" "}
                          {formatTime(segment.endedAt)}
                        </span>
                        <span className={`status-badge ${segment.status}`}>
                          {segment.status}
                        </span>
                      </div>
                      <div className="segment-details">
                        <span>{segment.codec?.toUpperCase() || "MP4"}</span>
                        <span>{formatBytes(segment.sizeBytes)}</span>
                        <span>
                          {Math.round(
                            (new Date(segment.endedAt).getTime() -
                              new Date(segment.startedAt).getTime()) /
                              1000,
                          )}
                          s
                        </span>
                        {segment.checksumSha256 && (
                          <span title="Verified">✓ SHA-256</span>
                        )}
                      </div>
                    </div>
                    <div className="segment-actions">
                      <button className="icon-button" title="Play">
                        <Play size={16} />
                      </button>
                      <button className="icon-button" title="Download">
                        <Download size={16} />
                      </button>
                      <button className="icon-button" title="More">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {viewMode === "timeline" && (
            <div className="timeline-view">
              <div className="timeline-visualization">
                {/* Timeline bars would go here */}
                <p style={{ textAlign: "center", padding: "40px", color: "#666" }}>
                  Timeline visualization coming soon
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .video-search-container {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .search-header h1 {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 28px;
          margin: 0 0 8px 0;
        }

        .search-header p {
          color: #666;
          margin: 0;
        }

        .search-filters-panel {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
          margin: 24px 0;
        }

        .filters-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }

        .filter-field label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 6px;
          color: #374151;
        }

        .filter-field select,
        .filter-field input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .filter-field select:disabled {
          background: #f3f4f6;
          cursor: not-allowed;
        }

        .toggle-advanced-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .toggle-advanced-button:hover {
          background: #f3f4f6;
        }

        .advanced-filters {
          padding: 16px;
          background: #f9fafb;
          border-radius: 6px;
          margin-bottom: 16px;
        }

        .search-actions {
          display: flex;
          gap: 12px;
        }

        .primary-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
        }

        .primary-button:hover:not(:disabled) {
          background: #2563eb;
        }

        .primary-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .secondary-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          cursor: pointer;
        }

        .error-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          color: #991b1b;
          margin-bottom: 20px;
        }

        .results-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .summary-stats {
          display: flex;
          gap: 16px;
        }

        .stat-card {
          display: flex;
          flex-direction: column;
          padding: 12px 20px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }

        .stat-label {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 4px;
        }

        .stat-value {
          font-size: 20px;
          font-weight: 600;
          color: #111827;
        }

        .view-mode-toggle {
          display: flex;
          gap: 4px;
        }

        .view-mode-toggle button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }

        .view-mode-toggle button.active {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .results-container {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
        }

        .results-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .segment-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }

        .segment-item:hover {
          background: #f9fafb;
        }

        .segment-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }

        .segment-time {
          font-weight: 500;
        }

        .status-badge {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-badge.ready {
          background: #d1fae5;
          color: #065f46;
        }

        .segment-details {
          display: flex;
          gap: 16px;
          font-size: 13px;
          color: #6b7280;
        }

        .segment-actions {
          display: flex;
          gap: 8px;
        }

        .icon-button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: #f3f4f6;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }

        .icon-button:hover {
          background: #e5e7eb;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #6b7280;
        }

        .empty-state h3 {
          margin: 16px 0 8px 0;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

// Helper functions
function getDefaultFromTime(): string {
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
  return date.toISOString().slice(0, 16);
}

function getDefaultToTime(): string {
  const date = new Date();
  return date.toISOString().slice(0, 16);
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1_000)} KB`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}
