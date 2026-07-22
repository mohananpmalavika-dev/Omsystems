"use client";

import {
  Camera,
  Grid,
  Grid3x3,
  Link,
  Maximize,
  Pause,
  Play,
  Square,
  Unlink,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { PlaybackController } from "./playback-controller";

interface CameraStream {
  cameraId: string;
  cameraName: string;
  segmentId: string;
  startTime: string;
  endTime: string;
  branchId?: string;
  location?: string;
}

interface SyncedPlaybackViewProps {
  streams: CameraStream[];
  syncEnabled?: boolean;
  onSyncToggle?: (enabled: boolean) => void;
  evidenceCaseId?: string;
  masterCameraId?: string;
  onMasterChange?: (cameraId: string) => void;
}

type GridLayout = "1x1" | "2x2" | "3x3" | "2x3" | "4x4";

export function SyncedPlaybackView({
  streams,
  syncEnabled = true,
  onSyncToggle,
  evidenceCaseId,
  masterCameraId,
  onMasterChange,
}: SyncedPlaybackViewProps) {
  const [isSynced, setIsSynced] = useState(syncEnabled);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gridLayout, setGridLayout] = useState<GridLayout>("2x2");
  const [masterCamera, setMasterCamera] = useState<string>(
    masterCameraId || streams[0]?.cameraId || "",
  );
  const [focusedCamera, setFocusedCamera] = useState<string | null>(null);
  const [currentTimes, setCurrentTimes] = useState<Record<string, number>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const syncTimerRef = useRef<NodeJS.Timeout>();

  // Get grid dimensions from layout
  const getGridDimensions = (layout: GridLayout): { rows: number; cols: number } => {
    switch (layout) {
      case "1x1":
        return { rows: 1, cols: 1 };
      case "2x2":
        return { rows: 2, cols: 2 };
      case "3x3":
        return { rows: 3, cols: 3 };
      case "2x3":
        return { rows: 2, cols: 3 };
      case "4x4":
        return { rows: 4, cols: 4 };
      default:
        return { rows: 2, cols: 2 };
    }
  };

  // Auto-select best grid layout
  useEffect(() => {
    const count = streams.length;
    if (count === 1) setGridLayout("1x1");
    else if (count <= 4) setGridLayout("2x2");
    else if (count <= 6) setGridLayout("2x3");
    else if (count <= 9) setGridLayout("3x3");
    else setGridLayout("4x4");
  }, [streams.length]);

  // Sync timer for synchronized playback
  useEffect(() => {
    if (!isSynced || !isPlaying) {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
      return;
    }

    syncTimerRef.current = setInterval(() => {
      const masterVideo = videoRefs.current[masterCamera];
      if (!masterVideo) return;

      const masterTime = masterVideo.currentTime;

      // Sync all other videos to master
      Object.entries(videoRefs.current).forEach(([cameraId, video]) => {
        if (cameraId === masterCamera || !video) return;

        const timeDiff = Math.abs(video.currentTime - masterTime);
        if (timeDiff > 0.3) {
          // More than 300ms drift
          video.currentTime = masterTime;
        }
      });
    }, 500); // Check sync every 500ms

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
    };
  }, [isSynced, isPlaying, masterCamera]);

  // Handle sync toggle
  const handleSyncToggle = () => {
    const newSyncState = !isSynced;
    setIsSynced(newSyncState);
    onSyncToggle?.(newSyncState);

    if (newSyncState && isPlaying) {
      // Immediately sync all videos to master
      const masterVideo = videoRefs.current[masterCamera];
      if (masterVideo) {
        const masterTime = masterVideo.currentTime;
        Object.entries(videoRefs.current).forEach(([cameraId, video]) => {
          if (cameraId !== masterCamera && video) {
            video.currentTime = masterTime;
          }
        });
      }
    }
  };

  // Handle global play/pause
  const handleGlobalPlayPause = () => {
    const newPlayState = !isPlaying;
    setIsPlaying(newPlayState);

    Object.values(videoRefs.current).forEach((video) => {
      if (video) {
        if (newPlayState) {
          video.play();
        } else {
          video.pause();
        }
      }
    });
  };

  // Handle master camera change
  const handleMasterChange = (cameraId: string) => {
    setMasterCamera(cameraId);
    onMasterChange?.(cameraId);

    // If synced and playing, sync all to new master
    if (isSynced && isPlaying) {
      const newMasterVideo = videoRefs.current[cameraId];
      if (newMasterVideo) {
        const masterTime = newMasterVideo.currentTime;
        Object.entries(videoRefs.current).forEach(([id, video]) => {
          if (id !== cameraId && video) {
            video.currentTime = masterTime;
          }
        });
      }
    }
  };

  // Handle camera focus (maximize single camera)
  const handleCameraFocus = (cameraId: string) => {
    setFocusedCamera(focusedCamera === cameraId ? null : cameraId);
  };

  // Video ref setter
  const setVideoRef = (cameraId: string, ref: HTMLVideoElement | null) => {
    videoRefs.current[cameraId] = ref;
  };

  // Update current times
  const handleTimeUpdate = (cameraId: string, time: number) => {
    setCurrentTimes((prev) => ({ ...prev, [cameraId]: time }));
  };

  const { rows, cols } = getGridDimensions(gridLayout);
  const visibleStreams = focusedCamera
    ? streams.filter((s) => s.cameraId === focusedCamera)
    : streams.slice(0, rows * cols);

  return (
    <div className="synced-playback-view">
      {/* Control Bar */}
      <div className="control-bar">
        <div className="control-group">
          <h3>
            <Camera size={20} />
            Multi-Camera Playback
          </h3>
          <span className="camera-count">
            {streams.length} camera{streams.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="control-actions">
          {/* Master Camera Selection */}
          <div className="master-select">
            <label>Master Camera:</label>
            <select
              value={masterCamera}
              onChange={(e) => handleMasterChange(e.target.value)}
              disabled={!isSynced}
            >
              {streams.map((stream) => (
                <option key={stream.cameraId} value={stream.cameraId}>
                  {stream.cameraName}
                </option>
              ))}
            </select>
          </div>

          {/* Sync Toggle */}
          <button
            className={`sync-button ${isSynced ? "active" : ""}`}
            onClick={handleSyncToggle}
            title={isSynced ? "Disable sync" : "Enable sync"}
          >
            {isSynced ? (
              <>
                <Link size={16} />
                Synced
              </>
            ) : (
              <>
                <Unlink size={16} />
                Independent
              </>
            )}
          </button>

          {/* Global Play/Pause */}
          <button
            className="play-button"
            onClick={handleGlobalPlayPause}
            title={isPlaying ? "Pause all" : "Play all"}
          >
            {isPlaying ? (
              <>
                <Pause size={18} />
                Pause All
              </>
            ) : (
              <>
                <Play size={18} />
                Play All
              </>
            )}
          </button>

          {/* Layout Selector */}
          <div className="layout-selector">
            <button
              className={gridLayout === "1x1" ? "active" : ""}
              onClick={() => setGridLayout("1x1")}
              title="1x1 Grid"
            >
              <Square size={16} />
            </button>
            <button
              className={gridLayout === "2x2" ? "active" : ""}
              onClick={() => setGridLayout("2x2")}
              title="2x2 Grid"
            >
              <Grid size={16} />
            </button>
            <button
              className={gridLayout === "3x3" ? "active" : ""}
              onClick={() => setGridLayout("3x3")}
              title="3x3 Grid"
            >
              <Grid3x3 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Video Grid */}
      <div
        className="video-grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {visibleStreams.map((stream) => (
          <div
            key={stream.cameraId}
            className={`video-cell ${masterCamera === stream.cameraId ? "master" : ""} ${focusedCamera === stream.cameraId ? "focused" : ""}`}
          >
            {/* Camera Header */}
            <div className="camera-header">
              <div className="camera-info">
                <Camera size={14} />
                <span className="camera-name">{stream.cameraName}</span>
                {stream.location && (
                  <span className="camera-location">{stream.location}</span>
                )}
              </div>
              <div className="camera-actions">
                {masterCamera === stream.cameraId && (
                  <span className="master-badge">MASTER</span>
                )}
                <button
                  className="focus-button"
                  onClick={() => handleCameraFocus(stream.cameraId)}
                  title={
                    focusedCamera === stream.cameraId
                      ? "Exit fullscreen"
                      : "Fullscreen"
                  }
                >
                  <Maximize size={14} />
                </button>
              </div>
            </div>

            {/* Video Element */}
            <div className="video-wrapper">
              <video
                ref={(ref) => setVideoRef(stream.cameraId, ref)}
                className="video-element"
                src={`/api/recordings/play?segmentId=${encodeURIComponent(stream.segmentId)}`}
                onTimeUpdate={(e) =>
                  handleTimeUpdate(
                    stream.cameraId,
                    e.currentTarget.currentTime,
                  )
                }
              >
                Your browser does not support video playback.
              </video>

              {/* Time Display */}
              <div className="time-overlay">
                {formatTime(currentTimes[stream.cameraId] || 0)}
              </div>

              {/* Sync Status Indicator */}
              {isSynced && masterCamera !== stream.cameraId && (
                <div className="sync-indicator">
                  <Link size={12} />
                </div>
              )}
            </div>

            {/* Mini Controls */}
            <div className="mini-controls">
              <input
                type="range"
                min="0"
                max={
                  videoRefs.current[stream.cameraId]?.duration || 100
                }
                value={currentTimes[stream.cameraId] || 0}
                onChange={(e) => {
                  const video = videoRefs.current[stream.cameraId];
                  if (video) {
                    video.currentTime = parseFloat(e.target.value);
                  }
                }}
                className="timeline-slider"
                disabled={isSynced && masterCamera !== stream.cameraId}
              />
            </div>
          </div>
        ))}

        {/* Empty Cells */}
        {Array.from({
          length: Math.max(0, rows * cols - visibleStreams.length),
        }).map((_, i) => (
          <div key={`empty-${i}`} className="video-cell empty">
            <div className="empty-state">
              <Camera size={32} />
              <span>No camera</span>
            </div>
          </div>
        ))}
      </div>

      {/* Sync Status Footer */}
      {isSynced && (
        <div className="sync-status">
          <Link size={14} />
          <span>
            All cameras synchronized to <strong>{streams.find((s) => s.cameraId === masterCamera)?.cameraName || "master"}</strong>
          </span>
        </div>
      )}

      {/* Evidence Case Badge */}
      {evidenceCaseId && (
        <div className="evidence-badge-footer">
          Evidence Case ID: {evidenceCaseId}
        </div>
      )}

      <style jsx>{`
        .synced-playback-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #0f0f0f;
          border-radius: 8px;
          overflow: hidden;
        }

        .control-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: #1a1a1a;
          border-bottom: 1px solid #2a2a2a;
        }

        .control-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .control-group h3 {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          font-size: 18px;
          color: white;
        }

        .camera-count {
          padding: 4px 10px;
          background: #2a2a2a;
          border-radius: 4px;
          font-size: 13px;
          color: #9ca3af;
        }

        .control-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .master-select {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: white;
        }

        .master-select label {
          color: #9ca3af;
        }

        .master-select select {
          padding: 6px 12px;
          background: #2a2a2a;
          border: 1px solid #3a3a3a;
          border-radius: 6px;
          color: white;
          font-size: 14px;
          cursor: pointer;
        }

        .master-select select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .sync-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: #2a2a2a;
          border: 1px solid #3a3a3a;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .sync-button.active {
          background: #3b82f6;
          border-color: #3b82f6;
        }

        .sync-button:hover {
          background: #3a3a3a;
        }

        .sync-button.active:hover {
          background: #2563eb;
        }

        .play-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: #10b981;
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.2s;
        }

        .play-button:hover {
          background: #059669;
        }

        .layout-selector {
          display: flex;
          gap: 4px;
          padding: 4px;
          background: #2a2a2a;
          border-radius: 6px;
        }

        .layout-selector button {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: #9ca3af;
          cursor: pointer;
          transition: all 0.2s;
        }

        .layout-selector button:hover {
          background: #3a3a3a;
          color: white;
        }

        .layout-selector button.active {
          background: #3b82f6;
          color: white;
        }

        .video-grid {
          display: grid;
          flex: 1;
          gap: 2px;
          padding: 2px;
          background: #0a0a0a;
          overflow: auto;
        }

        .video-cell {
          position: relative;
          display: flex;
          flex-direction: column;
          background: #1a1a1a;
          border-radius: 4px;
          overflow: hidden;
          min-height: 200px;
        }

        .video-cell.master {
          outline: 2px solid #3b82f6;
          outline-offset: -2px;
        }

        .video-cell.focused {
          grid-column: 1 / -1;
          grid-row: 1 / -1;
        }

        .video-cell.empty {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: #4b5563;
        }

        .camera-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #2a2a2a;
          border-bottom: 1px solid #3a3a3a;
        }

        .camera-info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: white;
        }

        .camera-name {
          font-weight: 500;
        }

        .camera-location {
          color: #9ca3af;
          font-size: 12px;
        }

        .camera-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .master-badge {
          padding: 2px 6px;
          background: #3b82f6;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 600;
          color: white;
        }

        .focus-button {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          background: transparent;
          border: none;
          border-radius: 4px;
          color: #9ca3af;
          cursor: pointer;
        }

        .focus-button:hover {
          background: #3a3a3a;
          color: white;
        }

        .video-wrapper {
          position: relative;
          flex: 1;
          background: #000;
        }

        .video-element {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .time-overlay {
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 4px 8px;
          background: rgba(0, 0, 0, 0.7);
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          color: white;
          font-family: monospace;
        }

        .sync-indicator {
          position: absolute;
          top: 8px;
          left: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: rgba(59, 130, 246, 0.8);
          border-radius: 50%;
          color: white;
        }

        .mini-controls {
          padding: 8px 12px;
          background: #2a2a2a;
        }

        .timeline-slider {
          width: 100%;
          height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          cursor: pointer;
          appearance: none;
        }

        .timeline-slider:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .timeline-slider::-webkit-slider-thumb {
          appearance: none;
          width: 10px;
          height: 10px;
          background: #3b82f6;
          border-radius: 50%;
          cursor: pointer;
        }

        .sync-status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: #1a1a1a;
          border-top: 1px solid #2a2a2a;
          color: #9ca3af;
          font-size: 14px;
        }

        .sync-status strong {
          color: #3b82f6;
        }

        .evidence-badge-footer {
          padding: 8px 20px;
          background: #7c2d12;
          border-top: 1px solid #991b1b;
          color: #fecaca;
          font-size: 13px;
          text-align: center;
        }
      `}</style>
    </div>
  );
}

// Helper function
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}
