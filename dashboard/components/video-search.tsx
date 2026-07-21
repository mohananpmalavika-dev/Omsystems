"use client";

import {
  AlertTriangle,
  Calendar,
  Camera,
  ChevronDown,
  Clock,
  Download,
  Filter,
  Grid,
  List,
  MoreVertical,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { liveOperationsApi } from "@/lib/api-client";
import type { Camera as CameraType, Branch } from "@/lib/types";

interface SearchFilters {
  cameraId?: string;
  branchId?: string;
  fromDate: string;
  toDate: string;
  fromTime: string;
  toTime: string;
  eventType?: string;
  confidence?: number;
  viewMode: "grid" | "list" | "timeline";
}

const defaultFilters: SearchFilters = {
  fromDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  toDate: new Date().toISOString().split("T")[0],
  fromTime: "00:00",
  toTime: "23:59",
  viewMode: "grid",
};

interface RecordingSegment {
  id: string;
  cameraId: string;
  startTime: string;
  endTime: string;
  storageLocation?: string;
}

interface Thumbnail {
  id: string;
  timestamp: string;
  dataUrl: string;
  eventType?: string;
  confidence?: number;
}

export function VideoSearch() {
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<RecordingSegment[]>([]);
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<RecordingSegment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadCameras();
  }, []);

  async function loadCameras() {
    setLoading(true);
    try {
      const response = await fetch("/api/control/v1/cameras");
      if (!response.ok) throw new Error("Failed to load cameras");
      const data = await response.json();
      setCameras(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cameras");
    } finally {
      setLoading(false);
    }
  }

  async function performSearch() {
    if (!filters.cameraId) {
      setError("Please select a camera");
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const from = `${filters.fromDate}T${filters.fromTime}:00Z`;
      const to = `${filters.toDate}T${filters.toTime}:00Z`;

      const searchResponse = await fetch(
        `/api/control/v1/recordings/search?cameraId=${filters.cameraId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` +
        (filters.eventType ? `&eventType=${filters.eventType}` : "") +
        (filters.confidence ? `&confidence=${filters.confidence}` : "")
      );

      if (!searchResponse.ok) throw new Error("Search failed");
      const searchData = await searchResponse.json();
      setResults(searchData.data || []);

      // Load thumbnails
      const thumbResponse = await fetch(
        `/api/control/v1/recordings/thumbnails?cameraId=${filters.cameraId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (thumbResponse.ok) {
        const thumbData = await thumbResponse.json();
        setThumbnails(thumbData.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  const camera = useMemo(
    () => cameras.find((c) => c.id === filters.cameraId),
    [cameras, filters.cameraId],
  );

  const eventTypeOptions = [
    "motion",
    "person",
    "vehicle",
    "intrusion",
    "line-crossing",
    "loitering",
    "crowd",
    "fire",
    "unattended-object",
    "removed-object",
    "anpr",
    "face-match",
    "camera-tampering",
    "offline",
    "bookmark",
    "incident",
  ];

  return (
    <div className="video-search-container">
      <div className="search-panel">
        <div className="search-header">
          <h2>Video Search & Retrieval</h2>
          <p>Find recordings by date, time, camera, and event type</p>
        </div>

        {error && (
          <div className="error-banner">
            <AlertTriangle size={16} />
            {error}
            <button onClick={() => setError(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="search-filters">
          <div className="filter-section">
            <label>Camera</label>
            <select
              value={filters.cameraId || ""}
              onChange={(e) => setFilters((f) => ({ ...f, cameraId: e.target.value }))}
            >
              <option value="">Select a camera…</option>
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.name} ({cam.vendor})
                </option>
              ))}
            </select>
          </div>

          <div className="filter-row">
            <div className="filter-section">
              <label>From Date</label>
              <input
                type="date"
                value={filters.fromDate}
                onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))}
              />
            </div>
            <div className="filter-section">
              <label>From Time</label>
              <input
                type="time"
                value={filters.fromTime}
                onChange={(e) => setFilters((f) => ({ ...f, fromTime: e.target.value }))}
              />
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-section">
              <label>To Date</label>
              <input
                type="date"
                value={filters.toDate}
                onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))}
              />
            </div>
            <div className="filter-section">
              <label>To Time</label>
              <input
                type="time"
                value={filters.toTime}
                onChange={(e) => setFilters((f) => ({ ...f, toTime: e.target.value }))}
              />
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-section">
              <label>Event Type</label>
              <select
                value={filters.eventType || ""}
                onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value || undefined }))}
              >
                <option value="">All events</option>
                {eventTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type.replace("-", " ").toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-section">
              <label>Confidence (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={filters.confidence || ""}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, confidence: e.target.value ? Number(e.target.value) : undefined }))
                }
              />
            </div>
          </div>

          <button
            className="search-button"
            onClick={() => void performSearch()}
            disabled={searching || !filters.cameraId}
          >
            <Search size={16} />
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="view-mode-picker">
          <button
            className={filters.viewMode === "grid" ? "active" : ""}
            onClick={() => setFilters((f) => ({ ...f, viewMode: "grid" }))}
          >
            <Grid size={16} />
          </button>
          <button
            className={filters.viewMode === "list" ? "active" : ""}
            onClick={() => setFilters((f) => ({ ...f, viewMode: "list" }))}
          >
            <List size={16} />
          </button>
          <button
            className={filters.viewMode === "timeline" ? "active" : ""}
            onClick={() => setFilters((f) => ({ ...f, viewMode: "timeline" }))}
          >
            <Clock size={16} />
          </button>
        </div>
      </div>

      <div className="results-panel">
        {results.length === 0 && !searching ? (
          <div className="empty-state">
            <Camera size={48} />
            <h3>No recordings found</h3>
            <p>Adjust your search filters and try again</p>
          </div>
        ) : (
          <>
            {filters.viewMode === "grid" && (
              <div className="thumbnail-grid">
                {thumbnails.map((thumb) => (
                  <div
                    key={thumb.id}
                    className="thumbnail-card"
                    onClick={() => {
                      const segment = results.find((r) =>
                        thumb.timestamp >= r.startTime && thumb.timestamp <= r.endTime,
                      );
                      if (segment) setSelectedSegment(segment);
                    }}
                  >
                    <img src={thumb.dataUrl} alt="Thumbnail" />
                    <div className="thumbnail-info">
                      <span className="time">{new Date(thumb.timestamp).toLocaleTimeString()}</span>
                      {thumb.eventType && <span className="event">{thumb.eventType}</span>}
                      {thumb.confidence && <span className="confidence">{thumb.confidence}%</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filters.viewMode === "list" && (
              <div className="results-list">
                {results.map((segment) => (
                  <div
                    key={segment.id}
                    className="result-item"
                    onClick={() => setSelectedSegment(segment)}
                  >
                    <div className="item-time">
                      {new Date(segment.startTime).toLocaleTimeString()} -
                      {new Date(segment.endTime).toLocaleTimeString()}
                    </div>
                    <div className="item-details">
                      <span>{camera?.name}</span>
                      <span className="duration">
                        {Math.round(
                          (new Date(segment.endTime).getTime() - new Date(segment.startTime).getTime()) /
                            1000,
                        )}
                        s
                      </span>
                    </div>
                    <MoreVertical size={16} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {selectedSegment && (
          <VideoPlayerModal
            segment={selectedSegment}
            camera={camera}
            onClose={() => setSelectedSegment(null)}
          />
        )}
      </div>
    </div>
  );
}

function VideoPlayerModal({
  segment,
  camera,
  onClose,
}: {
  segment: RecordingSegment;
  camera?: CameraType;
  onClose: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="player-modal" onClick={(e) => e.stopPropagation()}>
        <div className="player-header">
          <h3>{camera?.name}</h3>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="player-container">
          <video
            controls
            style={{
              width: "100%",
              height: "auto",
              maxHeight: "600px",
              backgroundColor: "#000",
            }}
          >
            <source src={`/api/recordings/play?segmentId=${segment.id}`} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>

        <div className="player-controls">
          <div className="time-display">
            {new Date(segment.startTime).toLocaleString()} - {new Date(segment.endTime).toLocaleString()}
          </div>

          <div className="control-buttons">
            <button onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={0.25}>0.25×</option>
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
            <button>
              <Download size={16} />
              Export
            </button>
            <button>
              <Plus size={16} />
              Snapshot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
