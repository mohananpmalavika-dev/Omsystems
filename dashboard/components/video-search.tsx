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
import { useEffect, useMemo, useState, useRef } from "react";
import { videoSearchApi } from "@/lib/api-client";
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
  startedAt: string;
  endedAt: string;
  storagePath?: string;
  sizeBytes?: number;
  status?: string;
  codec?: string;
}

interface SearchResult {
  segments: RecordingSegment[];
  events: Array<{ id: string; timestamp: string; type: string; title: string; severity?: string }>;
  gaps: Array<{ startTime: string; endTime: string; reason?: string }>;
  timeline: Array<{ startTime: string; endTime: string; type: "recording" | "gap"; status?: string; segmentId?: string }>;
  total: number;
  recordedSeconds: number;
  requestedSeconds: number;
  coveragePercent: number;
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
  const [results, setResults] = useState<SearchResult | null>(null);
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<RecordingSegment | null>(null);
  const [timeRange, setTimeRange] = useState<{ from: string; to: string } | null>(null);
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

      const query = {
        cameraId: filters.cameraId ?? "",
        from,
        to,
        eventType: filters.eventType,
        minConfidence:
          filters.confidence !== undefined && filters.confidence !== null
            ? filters.confidence / 100
            : undefined,
      };

      const searchData = await videoSearchApi.searchRecordings(query);
      setResults(searchData);
      setTimeRange({ from, to });

      const thumbData = await videoSearchApi.getThumbnails({
        cameraId: filters.cameraId ?? "",
        from,
        to,
      });
      setThumbnails(thumbData.data || []);
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
        {!results && !searching ? (
          <div className="empty-state">
            <Camera size={48} />
            <h3>No recordings found</h3>
            <p>Adjust your search filters and try again</p>
          </div>
        ) : results ? (
          <>
            {filters.viewMode === "grid" && (
              <div className="thumbnail-grid">
                {thumbnails.map((thumb) => (
                  <div
                    key={thumb.id}
                    className="thumbnail-card"
                    onClick={() => {
                      const segment = results.segments.find((r) =>
                        thumb.timestamp >= r.startedAt && thumb.timestamp <= r.endedAt,
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
                {results.segments.map((segment) => (
                  <div
                    key={segment.id}
                    className="result-item"
                    onClick={() => setSelectedSegment(segment)}
                  >
                    <div className="item-time">
                      {new Date(segment.startedAt).toLocaleTimeString()} -
                      {new Date(segment.endedAt).toLocaleTimeString()}
                    </div>
                    <div className="item-details">
                      <span>{camera?.name}</span>
                      <span className="duration">
                        {Math.round(
                          (new Date(segment.endedAt).getTime() - new Date(segment.startedAt).getTime()) /
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

            {filters.viewMode === "timeline" && (
              <div className="timeline-view">
                <div className="timeline-summary">
                  <div>
                    <strong>Coverage</strong>
                    <span>{results.coveragePercent}%</span>
                  </div>
                  <div>
                    <strong>Recorded</strong>
                    <span>{results.recordedSeconds}s</span>
                  </div>
                  <div>
                    <strong>Requested</strong>
                    <span>{results.requestedSeconds}s</span>
                  </div>
                  <div>
                    <strong>Segments</strong>
                    <span>{results.segments.length}</span>
                  </div>
                </div>

                <div className="timeline-track">
                  {results.timeline.map((item) => {
                    const start = new Date(item.startTime).getTime();
                    const end = new Date(item.endTime).getTime();
                    const width = timeRange
                      ? Math.max(0, ((end - start) / (new Date(timeRange.to).getTime() - new Date(timeRange.from).getTime())) * 100)
                      : 0;
                    const left = timeRange
                      ? Math.max(0, ((start - new Date(timeRange.from).getTime()) / (new Date(timeRange.to).getTime() - new Date(timeRange.from).getTime())) * 100)
                      : 0;

                    return (
                      <div
                        key={`${item.type}-${item.startTime}-${item.endTime}`}
                        className={`timeline-segment ${item.type}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${item.type === "recording" ? "Recording" : "Gap"}: ${new Date(item.startTime).toLocaleTimeString()} - ${new Date(item.endTime).toLocaleTimeString()}`}
                      />
                    );
                  })}
                </div>

                <div className="timeline-events">
                  {results.events.map((event) => (
                    <div key={event.id} className="timeline-event">
                      <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                      <strong>{event.title}</strong>
                      <small>{event.type}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}

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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = speed;
    if (playing) {
      void video.play().catch(() => {
        setPlaying(false);
      });
    } else {
      video.pause();
    }
  }, [playing, speed]);

  const handlePlayToggle = () => {
    setPlaying((current) => !current);
  };

  const handleSnapshot = async () => {
    const video = videoRef.current;
    if (!video || !camera) return;
    const timestamp = new Date(
      new Date(segment.startedAt).getTime() + video.currentTime * 1000,
    ).toISOString();

    try {
      const response = await fetch("/api/control/v1/recordings/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          segmentId: segment.id,
          cameraId: camera.id,
          timestamp,
          snapshotType: "manual",
          reason: "Playback review snapshot",
          notes: "Captured from playback UI",
        }),
      });

      if (!response.ok) {
        throw new Error("Snapshot request failed");
      }
      setMessage("Snapshot captured successfully.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Snapshot failed.");
    }
  };

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
            ref={videoRef}
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
            {new Date(segment.startedAt).toLocaleString()} - {new Date(segment.endedAt).toLocaleString()}
          </div>

          <div className="control-buttons">
            <button onClick={handlePlayToggle}>{playing ? "Pause" : "Play"}</button>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={0.25}>0.25×</option>
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
            <button onClick={handleSnapshot}>
              <Plus size={16} />
              Snapshot
            </button>
            <a
              className="download-button"
              href={`/api/recordings/play?segmentId=${encodeURIComponent(segment.id)}`}
              download
            >
              <Download size={16} />
              Download
            </a>
          </div>
          {message && <div className="message-banner">{message}</div>}
        </div>
      </div>
    </div>
  );
}
