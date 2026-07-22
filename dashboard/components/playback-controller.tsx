"use client";

import {
  Bookmark,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  FastForward,
  Maximize,
  Pause,
  Play,
  Rewind,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface PlaybackControllerProps {
  segmentId: string;
  cameraId: string;
  cameraName: string;
  startTime: string;
  endTime: string;
  onSnapshot?: () => void;
  onBookmark?: () => void;
  onExport?: () => void;
  evidenceCaseId?: string;
}

type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 4 | 8 | 16;

export function PlaybackController({
  segmentId,
  cameraId,
  cameraName,
  startTime,
  endTime,
  onSnapshot,
  onBookmark,
  onExport,
  evidenceCaseId,
}: PlaybackControllerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCenter, setZoomCenter] = useState({ x: 0.5, y: 0.5 });
  const [frameStepMode, setFrameStepMode] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  // Video source URL
  const videoUrl = `/api/recordings/play?segmentId=${encodeURIComponent(segmentId)}`;

  // Initialize video metadata
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, []);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Auto-hide controls in fullscreen
  useEffect(() => {
    if (!isFullscreen) return;

    const resetTimeout = () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      setShowControls(true);
      controlsTimeoutRef.current = setTimeout(() => {
        if (isPlaying) setShowControls(false);
      }, 3000);
    };

    resetTimeout();
    const handleMouseMove = resetTimeout;

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isFullscreen, isPlaying]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const handleSeek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(time, duration));
  };

  const jumpBackward = () => handleSeek(currentTime - 10);
  const jumpForward = () => handleSeek(currentTime + 10);

  const stepFrame = (direction: "forward" | "backward") => {
    const video = videoRef.current;
    if (!video) return;

    const frameTime = 1 / 30; // Assume 30 fps
    const newTime =
      direction === "forward"
        ? currentTime + frameTime
        : currentTime - frameTime;

    video.pause();
    handleSeek(newTime);
    setFrameStepMode(true);
  };

  const changePlaybackSpeed = (speed: PlaybackSpeed) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newVolume;
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      video.muted = false;
      setIsMuted(false);
    }
  };

  const toggleFullscreen = async () => {
    const container = videoRef.current?.parentElement;
    if (!container) return;

    if (!isFullscreen) {
      await container.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 1));
  };

  const handleVideoClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const rect = video.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setZoomCenter({ x, y });

    if (zoom === 1) {
      handleZoomIn();
    }
  };

  const handleSnapshotClick = () => {
    const video = videoRef.current;
    if (!video || !onSnapshot) return;

    // Pause video
    video.pause();

    // Call snapshot handler
    onSnapshot();
  };

  const handleBookmarkClick = () => {
    if (!onBookmark) return;

    // Call bookmark handler with current timestamp
    onBookmark();
  };

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      : `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatTimestamp = (isoString: string): string => {
    return new Date(isoString).toLocaleString();
  };

  const getActualTimestamp = (): string => {
    const startMs = new Date(startTime).getTime();
    const offsetMs = currentTime * 1000;
    return new Date(startMs + offsetMs).toISOString();
  };

  return (
    <div className="playback-controller">
      <div className="player-container">
        {/* Video Info Bar */}
        <div className="video-info-bar">
          <div className="info-left">
            <Camera size={16} />
            <span className="camera-name">{cameraName}</span>
            <span className="timestamp">{formatTimestamp(startTime)}</span>
          </div>
          <div className="info-right">
            {evidenceCaseId && (
              <span className="evidence-badge">Evidence Case</span>
            )}
            <span className="segment-id">Segment: {segmentId.slice(0, 8)}</span>
          </div>
        </div>

        {/* Video Player */}
        <div
          className="video-wrapper"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: `${zoomCenter.x * 100}% ${zoomCenter.y * 100}%`,
          }}
        >
          <video
            ref={videoRef}
            className="video-element"
            src={videoUrl}
            onClick={handleVideoClick}
            onDoubleClick={toggleFullscreen}
          >
            Your browser does not support video playback.
          </video>
        </div>

        {/* Controls Overlay */}
        {showControls && (
          <div className="controls-overlay">
            {/* Timeline */}
            <div className="timeline-container">
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="timeline-slider"
              />
              <div className="time-display">
                <span>{formatTime(currentTime)}</span>
                <span className="separator">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Main Controls */}
            <div className="main-controls">
              {/* Left Controls */}
              <div className="controls-group">
                <button
                  onClick={togglePlayPause}
                  className="control-button large"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>

                <button
                  onClick={jumpBackward}
                  className="control-button"
                  title="Jump backward 10s"
                >
                  <SkipBack size={20} />
                </button>

                <button
                  onClick={jumpForward}
                  className="control-button"
                  title="Jump forward 10s"
                >
                  <SkipForward size={20} />
                </button>

                {/* Frame Step Controls */}
                <div className="frame-controls">
                  <button
                    onClick={() => stepFrame("backward")}
                    className="control-button small"
                    title="Previous frame"
                  >
                    <ChevronLeft size={16} />│
                  </button>
                  <button
                    onClick={() => stepFrame("forward")}
                    className="control-button small"
                    title="Next frame"
                  >
                    │<ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {/* Center Info */}
              <div className="center-info">
                <span className="actual-timestamp">
                  {formatTimestamp(getActualTimestamp())}
                </span>
              </div>

              {/* Right Controls */}
              <div className="controls-group">
                {/* Volume */}
                <div className="volume-control">
                  <button
                    onClick={toggleMute}
                    className="control-button"
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={(e) =>
                      handleVolumeChange(parseFloat(e.target.value))
                    }
                    className="volume-slider"
                  />
                </div>

                {/* Playback Speed */}
                <select
                  value={playbackSpeed}
                  onChange={(e) =>
                    changePlaybackSpeed(parseFloat(e.target.value) as PlaybackSpeed)
                  }
                  className="speed-select"
                  title="Playback speed"
                >
                  <option value={0.25}>0.25×</option>
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                  <option value={4}>4×</option>
                  <option value={8}>8×</option>
                  <option value={16}>16×</option>
                </select>

                {/* Zoom */}
                <button
                  onClick={handleZoomOut}
                  className="control-button"
                  disabled={zoom <= 1}
                  title="Zoom out"
                >
                  <ZoomOut size={20} />
                </button>
                <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={handleZoomIn}
                  className="control-button"
                  disabled={zoom >= 3}
                  title="Zoom in"
                >
                  <ZoomIn size={20} />
                </button>

                {/* Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  className="control-button"
                  title="Fullscreen"
                >
                  <Maximize size={20} />
                </button>
              </div>
            </div>

            {/* Action Bar */}
            <div className="action-bar">
              <button
                onClick={handleSnapshotClick}
                className="action-button"
                title="Capture snapshot"
              >
                <Camera size={16} />
                Snapshot
              </button>

              <button
                onClick={handleBookmarkClick}
                className="action-button"
                title="Create bookmark"
              >
                <Bookmark size={16} />
                Bookmark
              </button>

              {onExport && (
                <button
                  onClick={onExport}
                  className="action-button"
                  title="Export evidence"
                >
                  <Download size={16} />
                  Export
                </button>
              )}
            </div>
          </div>
        )}

        {/* Frame Step Mode Indicator */}
        {frameStepMode && (
          <div className="frame-mode-indicator">
            Frame-by-Frame Mode Active
          </div>
        )}
      </div>

      <style jsx>{`
        .playback-controller {
          width: 100%;
          background: #000;
          border-radius: 8px;
          overflow: hidden;
        }

        .player-container {
          position: relative;
          width: 100%;
        }

        .video-info-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: #1a1a1a;
          color: white;
          font-size: 14px;
        }

        .info-left,
        .info-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .camera-name {
          font-weight: 600;
        }

        .timestamp {
          color: #999;
        }

        .evidence-badge {
          padding: 2px 8px;
          background: #ef4444;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .segment-id {
          color: #999;
          font-size: 12px;
        }

        .video-wrapper {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000;
          overflow: hidden;
          transition: transform 0.2s ease;
        }

        .video-element {
          width: 100%;
          height: 100%;
          cursor: crosshair;
        }

        .controls-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
          padding: 20px;
          color: white;
        }

        .timeline-container {
          margin-bottom: 16px;
        }

        .timeline-slider {
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 3px;
          cursor: pointer;
          appearance: none;
        }

        .timeline-slider::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          background: #3b82f6;
          border-radius: 50%;
          cursor: pointer;
        }

        .time-display {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-top: 8px;
          font-size: 14px;
          font-weight: 500;
        }

        .separator {
          color: #666;
        }

        .main-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .controls-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .control-button {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          transition: background 0.2s;
        }

        .control-button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2);
        }

        .control-button:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .control-button.large {
          padding: 12px;
        }

        .control-button.small {
          padding: 6px;
          font-size: 12px;
        }

        .frame-controls {
          display: flex;
          gap: 4px;
          margin-left: 8px;
          padding-left: 8px;
          border-left: 1px solid rgba(255, 255, 255, 0.2);
        }

        .center-info {
          flex: 1;
          text-align: center;
        }

        .actual-timestamp {
          font-size: 13px;
          color: #3b82f6;
          font-weight: 500;
        }

        .volume-control {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .volume-slider {
          width: 80px;
          height: 4px;
          appearance: none;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 2px;
        }

        .volume-slider::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
        }

        .speed-select {
          padding: 6px 8px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 4px;
          color: white;
          cursor: pointer;
          font-size: 13px;
        }

        .zoom-level {
          font-size: 13px;
          min-width: 45px;
          text-align: center;
        }

        .action-bar {
          display: flex;
          gap: 8px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .action-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: rgba(59, 130, 246, 0.2);
          border: 1px solid rgba(59, 130, 246, 0.4);
          border-radius: 6px;
          color: white;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .action-button:hover {
          background: rgba(59, 130, 246, 0.3);
          border-color: rgba(59, 130, 246, 0.6);
        }

        .frame-mode-indicator {
          position: absolute;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          padding: 8px 16px;
          background: rgba(59, 130, 246, 0.9);
          color: white;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          z-index: 10;
        }
      `}</style>
    </div>
  );
}
