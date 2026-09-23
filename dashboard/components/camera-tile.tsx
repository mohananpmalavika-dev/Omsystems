"use client";

import Link from "next/link";
import {
  BookmarkPlus,
  BrainCircuit,
  Camera as CameraIcon,
  Expand,
  LoaderCircle,
  Maximize2,
  Move3D,
  Radio,
  Siren,
  CircleStop,
  Camera as SnapshotIcon,
  ZoomIn,
  ZoomOut,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  AlertTriangle,
  Trash2,
  Tv,
  Move,
  ExternalLink,
  Headphones,
  ShieldAlert,
} from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalyticsAlert,
  AnalyticsRule,
  Camera,
  LiveSessionResponse,
  RecordingJob,
  RecordingMode,
} from "@/lib/types";
import type { CameraPlaybackMode, DegradationReason } from "@/lib/video/types";
import { HlsPlayer } from "./hls-player";
import { PtzControl } from "./ptz-control";
import { HoldToTalkButton } from "./hold-to-talk-button";
import { FisheyeDewarpCanvas } from "./fisheye-dewarp-canvas";
import { VideoWallDispatchModal } from "./video-wall-dispatch-modal";
import { AudioDiagnostic } from "./audio-diagnostic";

function formatLiveError(reason: string) {
  const labels: Record<string, string> = {
    invalid_live_session: "Live authorization expired",
    media_gateway_failure: "The media gateway rejected the stream",
    media_gateway_unavailable: "The media gateway is unavailable",
    stream_secret_unavailable: "The camera stream source is not configured",
    forbidden: "You do not have live camera access",
    approval_required: "Live camera access requires approval",
    camera_not_found: "Camera is no longer registered",
    resource_not_found: "The camera resource was not found",
    control_plane_unavailable: "The control plane is unreachable",
    edge_agent_not_found: "The camera edge agent is unavailable",
    edge_agent_offline: "The branch edge gateway is offline",
    invalid_bridge_identity: "The media bridge identity is invalid",
    internal_error: "The control plane failed to create a live session",
    local_media_gateway_requires_https: "The camera gateway needs an HTTPS tunnel",
    local_media_gateway_unavailable: "The local camera gateway is unreachable",
    live_session_unavailable: "Live authorization is unavailable",
    live_session_timeout: "Live authorization timed out",
    "Failed to fetch": "The live gateway could not be reached",
    "TypeError: Failed to fetch": "The live gateway could not be reached",
    "HLS playback failed": "The stream could not be played",
    "Live session timed out": "Live authorization timed out",
  };
  return labels[reason] ?? "Unable to start the live feed";
}

function isFatalLiveError(reason?: string) {
  if (!reason) return false;
  const nonFatal = ["playback_stalled", "HLS playback failed", "reconnect_failed", "media_error", "hls_error"];
  return !nonFatal.includes(reason);
}

function shouldOfferCredentialUpdate(reason?: string) {
  if (!reason) return false;
  const normalized = reason.toLowerCase();
  return normalized === "stream_secret_unavailable" ||
    normalized.includes("credential") ||
    normalized.includes("authentication failed") ||
    normalized.includes("unauthorized camera");
}

function CameraTileComponent({
  camera,
  session,
  loading,
  onStart,
  index,
  recording,
  recordingLoading,
  onToggleRecording,
  onChangeRecordingMode,
  onUpdateRecording,
  onBookmark,
  onCreateIncident,
  playbackMode,
  desiredPlaybackMode,
  degradationReason,
  snapshotUrl,
  liveError,
  onVideoElementChange,
  onPlaybackError,
  aiOverlay,
  showAiOverlay = true,
  onOpenAi,
  onDeleteCamera,
  onSoloAudio,
  isSoloAudio,
}: {
  camera: Camera;
  session?: LiveSessionResponse;
  loading: boolean;
  onStart: () => void;
  index: number;
  recording?: RecordingJob;
  recordingLoading?: boolean;
  onToggleRecording?: () => void;
  onChangeRecordingMode?: (mode: RecordingMode) => void;
  onUpdateRecording?: (cameraId: string, update: Partial<Omit<RecordingJob, "id" | "cameraId" | "status">>) => void;
  onBookmark?: () => void;
  onCreateIncident?: () => void;
  playbackMode?: CameraPlaybackMode;
  desiredPlaybackMode?: CameraPlaybackMode;
  degradationReason?: DegradationReason;
  snapshotUrl?: string;
  liveError?: string;
  onVideoElementChange?: (videoElement: HTMLVideoElement | null) => void;
  onPlaybackError?: (reason?: string) => void;
  aiOverlay?: { rules: AnalyticsRule[]; alerts: AnalyticsAlert[] };
  showAiOverlay?: boolean;
  onOpenAi?: () => void;
  onDeleteCamera?: (cameraId: string) => Promise<void> | void;
  onSoloAudio?: (cameraId: string) => void;
  isSoloAudio?: boolean;
}) {
  const tileRef = useRef<HTMLElement>(null);
  const isActive = camera.status !== "offline";
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);
  const [isMuted, setIsMuted] = useState(false); // Audio unmuted by default for live camera wall
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isTalking, setIsTalking] = useState(false);
  const [hasLiveFrame, setHasLiveFrame] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPtzControl, setShowPtzControl] = useState(false);
  const [showRecordingSettings, setShowRecordingSettings] = useState(false);
  const [settingsPreRollSeconds, setSettingsPreRollSeconds] = useState(recording?.preRollSeconds ?? 30);
  const [settingsPostRollSeconds, setSettingsPostRollSeconds] = useState(recording?.postRollSeconds ?? 120);
  const [settingsMinMotionDuration, setSettingsMinMotionDuration] = useState(recording?.minMotionDurationSeconds ?? 5);
  const [settingsMotionConfidence, setSettingsMotionConfidence] = useState(recording?.motionConfidenceThreshold != null ? String(Math.round(recording.motionConfidenceThreshold * 100)) : "40");
  const [settingsCooldownSeconds, setSettingsCooldownSeconds] = useState(recording?.cooldownSeconds ?? 30);
  const [settingsMaxEventDurationSeconds, setSettingsMaxEventDurationSeconds] = useState(recording?.maxEventDurationSeconds ?? 600);
  const [settingsTriggerEventTypes, setSettingsTriggerEventTypes] = useState((recording?.triggerEventTypes ?? ["motion", "tamper"]).join(", "));
  const [settingsScheduleDays, setSettingsScheduleDays] = useState<number[]>(recording?.schedule?.windows?.[0]?.days ?? [1, 2, 3, 4, 5]);
  const [settingsScheduleStart, setSettingsScheduleStart] = useState(recording?.schedule?.windows?.[0]?.start ?? "09:00");
  const [settingsScheduleEnd, setSettingsScheduleEnd] = useState(recording?.schedule?.windows?.[0]?.end ?? "18:00");
  const [showFisheyeDewarp, setShowFisheyeDewarp] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showAudioDiagnostic, setShowAudioDiagnostic] = useState(false);
  const [internalVideoElement, setInternalVideoElement] = useState<HTMLVideoElement | null>(null);

  const handleVideoElementChange = useCallback((videoElement: HTMLVideoElement | null) => {
    setInternalVideoElement(videoElement);
    onVideoElementChange?.(videoElement);
  }, [onVideoElementChange]);
  const handlePlaybackStateChange = useCallback((playing: boolean) => {
    setHasLiveFrame(playing);
  }, []);
  useEffect(() => {
    setHasLiveFrame(false);
  }, [session?.sessionId, session?.hls?.url]);
  const deferredDescription = degradationReason
    ? degradationReason.replaceAll("_", " ").toLowerCase()
    : desiredPlaybackMode === "SNAPSHOT"
      ? "snapshot refresh"
      : desiredPlaybackMode === "ROTATING"
        ? "rotation queue"
      : null;
  const canPlayLive = isActive && hasLiveFrame;

  // Two-way audio talkback is enabled for all live cameras unless explicitly unsupported (supported === false)
  const isTalkbackSupported = camera.capabilities?.talkback?.supported !== false;
  const talkbackUnsupportedReason = !isTalkbackSupported
    ? camera.capabilities?.talkback?.reason ?? "two-way audio is not supported on this camera"
    : undefined;

  const handleTalkChange = useCallback((talking: boolean) => {
    setIsTalking(talking);
    if (talking) {
      // Temporarily mute incoming playback while holding talk to avoid acoustic mic feedback
      setIsMuted(true);
    } else {
      // Automatically unmute when done talking so operator hears the other person's reply
      setIsMuted(false);
    }
  }, []);

  const effectiveMuted = isSoloAudio === true ? false : isSoloAudio === false ? true : isMuted;

  // Real-time Web Audio API VU decibel meter
  useEffect(() => {
    if (!internalVideoElement || effectiveMuted || !hasLiveFrame) {
      setAudioLevel(0);
      return;
    }

    let animId: number;
    let isCancelled = false;

    const setupAudioMeter = () => {
      try {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtxClass) return;

        let ctx = (internalVideoElement as unknown as { __audioCtx?: AudioContext }).__audioCtx;
        let analyser = (internalVideoElement as unknown as { __audioAnalyser?: AnalyserNode }).__audioAnalyser;

        if (!ctx) {
          ctx = new AudioCtxClass();
          (internalVideoElement as unknown as { __audioCtx: AudioContext }).__audioCtx = ctx;
          analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.4;
          (internalVideoElement as unknown as { __audioAnalyser: AnalyserNode }).__audioAnalyser = analyser;

          const source = ctx.createMediaElementSource(internalVideoElement);
          source.connect(analyser);
          analyser.connect(ctx.destination);
        }

        if (ctx.state === "suspended") {
          void ctx.resume();
        }

        const dataArray = new Uint8Array(analyser!.frequencyBinCount);
        const updateMeter = () => {
          if (isCancelled) return;
          analyser!.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / (dataArray.length || 1);
          setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
          animId = requestAnimationFrame(updateMeter);
        };
        updateMeter();
      } catch {
        // Fallback for CORS or browser autoplay policy without errors
      }
    };

    setupAudioMeter();

    return () => {
      isCancelled = true;
      cancelAnimationFrame(animId);
      setAudioLevel(0);
    };
  }, [internalVideoElement, effectiveMuted, hasLiveFrame]);

  const showCredentialUpdate = shouldOfferCredentialUpdate(liveError);
  const activeAiRules = aiOverlay?.rules.filter((rule) => rule.enabled) ?? [];
  const activeAiAlerts = aiOverlay?.alerts.filter((alert) =>
    !["resolved", "false_alarm", "suppressed"].includes(alert.status)
  ) ?? [];
  const latestAiAlert = activeAiAlerts[0];

  const scheduleDayOptions = [
    { label: "Sun", value: 0 },
    { label: "Mon", value: 1 },
    { label: "Tue", value: 2 },
    { label: "Wed", value: 3 },
    { label: "Thu", value: 4 },
    { label: "Fri", value: 5 },
    { label: "Sat", value: 6 },
  ];

  const openRecordingSettings = () => {
    setSettingsPreRollSeconds(recording?.preRollSeconds ?? 30);
    setSettingsPostRollSeconds(recording?.postRollSeconds ?? 120);
    setSettingsMinMotionDuration(recording?.minMotionDurationSeconds ?? 5);
    setSettingsMotionConfidence(recording?.motionConfidenceThreshold != null ? String(Math.round(recording.motionConfidenceThreshold * 100)) : "40");
    setSettingsCooldownSeconds(recording?.cooldownSeconds ?? 30);
    setSettingsMaxEventDurationSeconds(recording?.maxEventDurationSeconds ?? 600);
    setSettingsTriggerEventTypes((recording?.triggerEventTypes ?? ["motion", "tamper"]).join(", "));
    setSettingsScheduleDays(recording?.schedule?.windows?.[0]?.days ?? [1, 2, 3, 4, 5]);
    setSettingsScheduleStart(recording?.schedule?.windows?.[0]?.start ?? "09:00");
    setSettingsScheduleEnd(recording?.schedule?.windows?.[0]?.end ?? "18:00");
    setShowRecordingSettings(true);
  };

  const closeRecordingSettings = () => {
    setShowRecordingSettings(false);
  };

  const toggleScheduleDay = (day: number) => {
    setSettingsScheduleDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b),
    );
  };

  const saveRecordingSettings = async () => {
    if (!onUpdateRecording) return;
    const update: Partial<Omit<RecordingJob, "id" | "cameraId" | "status">> = {
      mode: recording?.mode ?? "continuous",
      enabled: recording?.enabled ?? false,
      preRollSeconds: settingsPreRollSeconds,
      postRollSeconds: settingsPostRollSeconds,
    };

    if (recording?.mode === "motion") {
      update.minMotionDurationSeconds = settingsMinMotionDuration;
      update.motionConfidenceThreshold = Number(settingsMotionConfidence) / 100;
      update.cooldownSeconds = settingsCooldownSeconds;
    }

    if (recording?.mode === "scheduled") {
      update.schedule = {
        timezone: "UTC",
        windows: [{
          days: settingsScheduleDays,
          start: settingsScheduleStart,
          end: settingsScheduleEnd,
          enabled: true,
        }],
      };
    }

    if (recording?.mode === "event") {
      update.maxEventDurationSeconds = settingsMaxEventDurationSeconds;
      update.triggerEventTypes = settingsTriggerEventTypes
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }

    await onUpdateRecording(recording?.cameraId ?? camera.id, update);
    setShowRecordingSettings(false);
  };

  const takeSnapshot = () => {
    const video = tileRef.current?.querySelector("video");
    if (!video || !video.videoWidth) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw high-resolution frame
    ctx.drawImage(video, 0, 0, width, height);

    // Forensic audit banner background
    const bannerHeight = Math.max(44, Math.round(height * 0.055));
    ctx.fillStyle = "rgba(10, 15, 29, 0.88)";
    ctx.fillRect(0, height - bannerHeight, width, bannerHeight);

    // Accent line above metadata footer
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(0, height - bannerHeight, width, Math.max(2, Math.round(height * 0.003)));

    // Forensic audit texts
    const fontSize = Math.max(11, Math.round(bannerHeight * 0.36));
    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = "middle";

    // Left: System identifier & camera name
    ctx.fillStyle = "#ffffff";
    const leftText = `● SENTINEL GRID FORENSIC RECORD | ${camera.name.toUpperCase()} [${camera.id.slice(0, 8)}]`;
    ctx.fillText(leftText, 16, height - bannerHeight / 2);

    // Right: Exact timestamp and frame dimensions
    const now = new Date();
    const utcStr = now.toISOString();
    const localStr = now.toLocaleString();
    const rightText = `${localStr} (${utcStr}) | ${width}×${height}`;
    ctx.fillStyle = "#94a3b8";
    const rightWidth = ctx.measureText(rightText).width;
    ctx.fillText(rightText, width - rightWidth - 16, height - bannerHeight / 2);

    // Top watermark seal
    ctx.font = `700 ${Math.max(10, Math.round(fontSize * 0.8))}px sans-serif`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillText("PROPRIETARY & CONFIDENTIAL EVIDENCE CAPTURE", 16, Math.max(18, Math.round(height * 0.035)));

    // Direct download
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/jpeg", 0.95);
    const safeName = camera.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    link.download = `EVIDENCE_${safeName}_${now.toISOString().replace(/[:.]/g, "-")}.jpg`;
    link.click();
  };

  const hasCriticalAlert = Boolean(latestAiAlert && (latestAiAlert.severity === "P1" || latestAiAlert.severity === "P2"));
  const hasWarningAlert = Boolean(latestAiAlert && latestAiAlert.severity === "P3");
  const alertRingClass = hasCriticalAlert
    ? "ring-2 ring-red-500 shadow-[0_0_24px_rgba(239,68,68,0.55)] animate-pulse"
    : hasWarningAlert
      ? "ring-2 ring-amber-500 shadow-[0_0_16px_rgba(245,158,11,0.4)]"
      : "";

  return (
    <article className={`camera-tile ${alertRingClass}`} ref={tileRef} data-camera-id={camera.id}>
      <div
        className="feed-stage"
        style={{ cursor: zoom > 1 ? "grab" : undefined }}
        onMouseDown={(event) => {
          if (zoom <= 1 || event.button !== 0) return;
          if ((event.target as HTMLElement).closest("button, a, input, select")) return;
          isDraggingRef.current = true;
          dragStartRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
          if (event.currentTarget) {
            event.currentTarget.style.cursor = "grabbing";
          }
        }}
        onMouseMove={(event) => {
          if (!isDraggingRef.current || zoom <= 1) return;
          const dx = event.clientX - dragStartRef.current.x;
          const dy = event.clientY - dragStartRef.current.y;
          setPan({
            x: dragStartRef.current.panX + dx,
            y: dragStartRef.current.panY + dy,
          });
        }}
        onMouseUp={(event) => {
          isDraggingRef.current = false;
          if (event.currentTarget) {
            event.currentTarget.style.cursor = zoom > 1 ? "grab" : "";
          }
        }}
        onMouseLeave={(event) => {
          isDraggingRef.current = false;
          if (event.currentTarget) {
            event.currentTarget.style.cursor = zoom > 1 ? "grab" : "";
          }
        }}
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          setZoom((value) => {
            const next = Math.max(1, Math.min(3, Number((value + (event.deltaY < 0 ? 0.25 : -0.25)).toFixed(2))));
            if (next === 1) setPan({ x: 0, y: 0 });
            return next;
          });
        }}
      >
        <div className="zoom-stage" style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }}>
          {(session?.hls || session?.webRtc) && (!liveError || !isFatalLiveError(liveError)) ? (
            <>
              <HlsPlayer
                url={session.hls?.url ?? ""}
                whepUrl={session.webRtc?.whepUrl}
                bearerToken={session.hls?.bearerToken ?? session.webRtc?.bearerToken ?? ""}
                cameraName={camera.name}
                cameraId={camera.id}
                muted={effectiveMuted}
                onPlaybackError={onPlaybackError}
                onPlaybackStateChange={handlePlaybackStateChange}
                onVideoElementChange={handleVideoElementChange}
              />
              {showFisheyeDewarp && internalVideoElement && (
                <FisheyeDewarpCanvas
                  videoElement={internalVideoElement}
                  className="absolute inset-0 z-20"
                  onClose={() => setShowFisheyeDewarp(false)}
                />
              )}
            </>
          ) : snapshotUrl ? (
            <img
              src={snapshotUrl}
              alt={`Latest snapshot from ${camera.name}`}
              className="live-video"
            />
          ) : (
            <div className={`camera-feed-placeholder ${liveError ? "has-error" : ""}`}>
              <CameraIcon size={26} />
              <span>{camera.status === "offline" ? "Camera offline" : "No live video"}</span>
              <small>{camera.status === "offline" ? "Waiting for the edge camera to reconnect" : "Connect the edge stream to start viewing"}</small>
            </div>
          )}
        </div>

        {hasCriticalAlert && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600/90 text-white text-[11px] font-bold tracking-wide shadow-lg border border-red-400/50 backdrop-blur animate-bounce pointer-events-none">
            <ShieldAlert size={13} className="text-white" />
            <span>ALARM: {latestAiAlert.title.toUpperCase()}</span>
            <span className="text-[9px] bg-red-800/90 px-1.5 py-0.5 rounded ml-1 font-mono">
              {Math.round(latestAiAlert.confidence * 100)}%
            </span>
          </div>
        )}

        <div className="tile-topline">
          <div className="flex items-center gap-1.5">
            {typeof index === "number" && (
              <span className="slot-index-badge" title={`Video Wall Slot ${index + 1}`}>
                #{String(index + 1).padStart(2, "0")}
              </span>
            )}
            <span className={`status-pill ${hasLiveFrame ? "online" : (liveError && isFatalLiveError(liveError)) ? "offline" : camera.status}`}>
              <i />
              {hasLiveFrame ? "Live HLS" : (liveError && isFatalLiveError(liveError)) ? "Snapshot fallback" : session?.hls ? "Connecting" : camera.status === "online" ? "Ready" : camera.status}
            </span>
            {!effectiveMuted && (
              <span className="status-pill text-emerald-400 border-emerald-500/40 bg-emerald-950/70 flex items-center gap-1.5" title={`Live Audio: ${audioLevel}%`}>
                <Volume2 size={11} className={audioLevel > 5 ? "animate-pulse text-emerald-400" : "text-emerald-400/70"} />
                <span>Audio ON</span>
                <span className="inline-flex items-center gap-0.5 w-6 h-1.5 bg-emerald-950 rounded-sm overflow-hidden p-[1px]">
                  <span
                    className={`h-full rounded-[0.5px] transition-all duration-100 ${
                      audioLevel > 70 ? "bg-rose-500" : audioLevel > 35 ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                    style={{ width: `${Math.max(5, audioLevel)}%` }}
                  />
                </span>
              </span>
            )}
            {isSoloAudio && (
              <span className="status-pill text-amber-300 border-amber-500/60 bg-amber-950/80 font-bold" title="Solo Audio is isolated to this camera">
                SOLO AUDIO
              </span>
            )}
          </div>
          {onToggleRecording && (
            <button type="button" className={`recording-pill ${recording?.enabled ? "active" : ""}`} onClick={onToggleRecording} disabled={recordingLoading} title={recording?.enabled ? "Stop recording" : "Start continuous recording"}>
              {recording?.enabled ? <CircleStop size={12} /> : <Radio size={12} />}
              {recordingLoading ? "…" : recording?.enabled ? "REC" : "REC OFF"}
            </button>
          )}
        </div>

        {showAiOverlay && activeAiRules.length > 0 && (
          <button
            type="button"
            className={`camera-ai-overlay ${latestAiAlert ? `alert ${latestAiAlert.severity.toLowerCase()}` : ""}`}
            onClick={onOpenAi}
            title={latestAiAlert ? `Open ${latestAiAlert.title}` : "Open live AI details"}
          >
            <span className="camera-ai-status">
              <BrainCircuit size={12} />
              AI · {activeAiRules.length} rule{activeAiRules.length === 1 ? "" : "s"}
            </span>
            {latestAiAlert && (
              <span className="camera-ai-detection">
                <b>{latestAiAlert.severity}</b>
                <em>{latestAiAlert.title}</em>
                <strong>{Math.round(latestAiAlert.confidence * 100)}%</strong>
              </span>
            )}
          </button>
        )}

        {!session?.hls && !session?.webRtc && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 opacity-0 transition-opacity hover:opacity-100">
            <button type="button" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg backdrop-blur" onClick={onStart} disabled={loading || !isActive}>
              {loading ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Radio size={15} />
              )}
              {loading ? "Connecting Live Stream…" : !isActive ? "Camera offline" : "Connect Live Stream"}
            </button>
          </div>
        )}

        {liveError && !loading && isFatalLiveError(liveError) && (
          <div className="camera-live-error" role="status">
            <AlertTriangle size={13} />
            <span>{formatLiveError(liveError)}</span>
            {showCredentialUpdate && (
              <Link href={`/maintenance/device-management?cameraId=${encodeURIComponent(camera.id)}`}>
                Update credentials
              </Link>
            )}
          </div>
        )}

        {!session?.hls && !liveError && deferredDescription && (
          <span className="viewer-playback-status">{deferredDescription}</span>
        )}


        <div className="tile-actions">
          {onBookmark && (
            <button type="button" aria-label="Bookmark live video" title="Bookmark live video" onClick={onBookmark} disabled={!canPlayLive}>
              <BookmarkPlus size={15} />
            </button>
          )}
          {onCreateIncident && (
            <button type="button" aria-label="Create incident" title="Create incident and protect recording" onClick={onCreateIncident} disabled={!canPlayLive}>
              <Siren size={15} />
            </button>
          )}
          <button
            type="button"
            aria-label={effectiveMuted ? "Unmute audio (Listen to camera)" : "Mute camera audio (Listening)"}
            title={effectiveMuted ? "Click to hear live audio from camera" : "Camera audio listening is active. Click to mute."}
            className={!effectiveMuted ? "audio-listening-active text-emerald-400 border-emerald-500/60 shadow-[0_0_8px_rgba(16,185,129,0.35)]" : ""}
            onClick={() => setIsMuted(!effectiveMuted)}
            disabled={!canPlayLive}
            onDoubleClick={() => setShowAudioDiagnostic(true)}
          >
            {effectiveMuted ? <VolumeX size={15} /> : <Volume2 size={15} className="text-emerald-400" />}
          </button>
          {onSoloAudio && (
            <button
              type="button"
              aria-label="Solo Audio"
              title={isSoloAudio ? "Solo Audio is Active (Click to unmute all)" : "Solo Audio: Mute all other cameras and isolate this stream"}
              className={isSoloAudio ? "text-amber-400 border-amber-500/80 bg-amber-950/80 shadow-[0_0_10px_rgba(245,158,11,0.5)]" : ""}
              onClick={() => onSoloAudio(camera.id)}
              disabled={!canPlayLive}
            >
              <Headphones size={15} />
            </button>
          )}
          <HoldToTalkButton
            cameraId={camera.id}
            disabled={!canPlayLive}
            unsupportedReason={talkbackUnsupportedReason}
            onTalkingChange={handleTalkChange}
          />
          {camera.capabilities.ptz && (
            <button type="button" aria-label="PTZ controls" title="PTZ controls" onClick={() => setShowPtzControl(!showPtzControl)} disabled={!canPlayLive}>
              <Move3D size={15} />
            </button>
          )}
          {onUpdateRecording && (
            <button type="button" aria-label="Recording settings" title="Recording settings" onClick={openRecordingSettings}>
              <SlidersHorizontal size={15} />
            </button>
          )}
          <button
            type="button"
            aria-label="360 Dewarp"
            title={showFisheyeDewarp ? "Exit 360 Dewarp" : "Enter 360 Dewarp (Virtual PTZ & Quad Split)"}
            className={showFisheyeDewarp ? "text-sky-400 border-sky-500/60 bg-sky-950/70" : ""}
            onClick={() => setShowFisheyeDewarp(!showFisheyeDewarp)}
            disabled={!canPlayLive}
          >
            <Move size={15} />
          </button>
          <button
            type="button"
            aria-label="Dispatch to Wall"
            title="Dispatch camera to physical SOC Video Wall"
            onClick={() => setShowDispatchModal(true)}
            disabled={!canPlayLive}
          >
            <Tv size={15} />
          </button>
          <button
            type="button"
            aria-label="Pop-out camera stream"
            title="Pop-out stream into a detached window for multi-monitor display"
            onClick={() => {
              const popoutUrl = `/control-room?detached=true&cameraId=${encodeURIComponent(camera.id)}`;
              window.open(popoutUrl, `camera_detached_${camera.id}`, "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no");
            }}
          >
            <ExternalLink size={15} />
          </button>
          <button
            type="button"
            aria-label="Open fullscreen"
            title="Open fullscreen"
            onClick={() => void tileRef.current?.requestFullscreen()}
          >
            <Maximize2 size={15} />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out (-25% · Shift+Click for 100%)"
            onClick={(e) => {
              if (e.shiftKey) {
                resetZoom();
              } else {
                setZoom((value) => {
                  const next = Math.max(1, Number((value - 0.25).toFixed(2)));
                  if (next === 1) setPan({ x: 0, y: 0 });
                  return next;
                });
              }
            }}
            disabled={zoom <= 1}
          >
            <ZoomOut size={15} />
          </button>
          {zoom > 1 && (
            <button
              type="button"
              className="zoom-pill"
              title={`Zoom: ${Math.round(zoom * 100)}% (Click to reset to 100%)`}
              onClick={resetZoom}
            >
              {Math.round(zoom * 100)}% · Reset
            </button>
          )}
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in (+25%, max 300% · Shift+Click for 300%)"
            onClick={(e) => {
              if (e.shiftKey) {
                setZoom(3);
              } else {
                setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))));
              }
            }}
            disabled={zoom >= 3}
          >
            <ZoomIn size={15} />
          </button>
          <button type="button" aria-label="Take snapshot" title="Take snapshot" onClick={takeSnapshot} disabled={!hasLiveFrame}><SnapshotIcon size={15} /></button>
          {onDeleteCamera && (
            <button
              type="button"
              aria-label="Remove camera from this wall"
              title="Remove camera from this wall"
              onClick={() => setShowDeleteModal(true)}
              style={{ color: "#f87171" }}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
        {showPtzControl && isActive && session?.sessionId && (
          <div className="ptz-overlay">
            <PtzControl
              cameraId={camera.id}
              sessionId={session.sessionId}
              onClose={() => setShowPtzControl(false)}
            />
          </div>
        )}
      </div>
      {showRecordingSettings && (
        <div className="modal-overlay">
          <div className="modal-container recording-settings-modal">
            <div className="modal-header">
              <h2>Recording settings</h2>
              <button type="button" className="icon-button" onClick={closeRecordingSettings} aria-label="Close recording settings">×</button>
            </div>
            <div className="modal-form">
              <div className="form-group">
                <label htmlFor="preRollSeconds">Pre-roll (seconds)</label>
                <input
                  id="preRollSeconds"
                  type="number"
                  min={0}
                  max={3600}
                  value={settingsPreRollSeconds}
                  onChange={(event) => setSettingsPreRollSeconds(Number(event.target.value))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="postRollSeconds">Post-roll (seconds)</label>
                <input
                  id="postRollSeconds"
                  type="number"
                  min={0}
                  max={3600}
                  value={settingsPostRollSeconds}
                  onChange={(event) => setSettingsPostRollSeconds(Number(event.target.value))}
                />
              </div>
              {recording?.mode === "motion" && (
                <>
                  <div className="form-group">
                    <label htmlFor="minMotionDuration">Minimum motion duration</label>
                    <input
                      id="minMotionDuration"
                      type="number"
                      min={0}
                      max={86400}
                      value={settingsMinMotionDuration}
                      onChange={(event) => setSettingsMinMotionDuration(Number(event.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="motionConfidence">Motion confidence (%)</label>
                    <input
                      id="motionConfidence"
                      type="number"
                      min={0}
                      max={100}
                      value={settingsMotionConfidence}
                      onChange={(event) => setSettingsMotionConfidence(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="cooldownSeconds">Cooldown (seconds)</label>
                    <input
                      id="cooldownSeconds"
                      type="number"
                      min={0}
                      max={86400}
                      value={settingsCooldownSeconds}
                      onChange={(event) => setSettingsCooldownSeconds(Number(event.target.value))}
                    />
                  </div>
                </>
              )}
              {recording?.mode === "scheduled" && (
                <>
                  <div className="form-group">
                    <label>Schedule days</label>
                    <div className="checkbox-grid">
                      {scheduleDayOptions.map((option) => (
                        <label key={option.value}>
                          <input
                            type="checkbox"
                            checked={settingsScheduleDays.includes(option.value)}
                            onChange={() => toggleScheduleDay(option.value)}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="scheduleStart">Starts at</label>
                      <input
                        id="scheduleStart"
                        type="time"
                        value={settingsScheduleStart}
                        onChange={(event) => setSettingsScheduleStart(event.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="scheduleEnd">Ends at</label>
                      <input
                        id="scheduleEnd"
                        type="time"
                        value={settingsScheduleEnd}
                        onChange={(event) => setSettingsScheduleEnd(event.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}
              {recording?.mode === "event" && (
                <>
                  <div className="form-group">
                    <label htmlFor="maxEventDurationSeconds">Max event duration (seconds)</label>
                    <input
                      id="maxEventDurationSeconds"
                      type="number"
                      min={0}
                      max={86400}
                      value={settingsMaxEventDurationSeconds}
                      onChange={(event) => setSettingsMaxEventDurationSeconds(Number(event.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="triggerEventTypes">Trigger event types</label>
                    <input
                      id="triggerEventTypes"
                      type="text"
                      value={settingsTriggerEventTypes}
                      onChange={(event) => setSettingsTriggerEventTypes(event.target.value)}
                      placeholder="motion, tamper"
                    />
                  </div>
                </>
              )}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeRecordingSettings}>Cancel</button>
                <button type="button" className="primary-button" onClick={saveRecordingSettings}>Save settings</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-container" role="dialog" aria-modal="true" aria-labelledby="tile-delete-camera-title">
            <div className="modal-header">
              <h2 id="tile-delete-camera-title" style={{ color: "#ef4444" }}>Remove from video wall</h2>
              <button type="button" className="icon-button" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>×</button>
            </div>
            <div className="modal-body" style={{ padding: "16px 20px" }}>
              <div className="form-info-banner" style={{ background: "rgba(239, 68, 68, 0.1)", borderColor: "rgba(239, 68, 68, 0.3)", color: "#f87171" }}>
                <AlertTriangle size={18} />
                <div>
                  <strong>Remove &quot;{camera.name}&quot; from this wall?</strong>
                  <p style={{ margin: "4px 0 0", fontSize: "0.85rem", opacity: 0.9 }}>
                    This removes only this operator&apos;s wall tile and stops its live session. The camera remains registered, recording, and available to other operators.
                  </p>
                </div>
              </div>
              <div style={{ marginTop: "12px", padding: "10px", borderRadius: "6px", background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.2)", color: "#a5b4fc", fontSize: "0.85rem" }}>
                <b>Need it back?</b> Add it to any empty slot on this wall, or load a saved layout.
              </div>
              <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                <button type="button" className="secondary-button" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={async () => {
                    if (!onDeleteCamera) return;
                    setIsDeleting(true);
                    try {
                      await onDeleteCamera(camera.id);
                      setShowDeleteModal(false);
                    } catch (err) {
                      console.error("Failed to remove camera from video wall", err);
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  disabled={isDeleting}
                  style={{ background: "#dc2626", borderColor: "#ef4444", color: "#ffffff" }}
                >
                  {isDeleting ? "Removing…" : "Remove from wall"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <footer className="camera-meta">
        <div>
          <strong>{camera.name}</strong>
          <span>{camera.branchName}</span>
        </div>
        <div className="camera-channel">
          <Expand size={13} />
          {camera.channel == null ? "Channel unavailable" : `CH ${String(camera.channel).padStart(2, "0")}`}
        </div>
        {onChangeRecordingMode && (
          <select className="recording-mode" aria-label={`${camera.name} recording mode`} value={recording?.mode ?? "continuous"} onChange={(event) => onChangeRecordingMode(event.target.value as RecordingMode)} disabled={recordingLoading}>
            <option value="continuous">24/7</option><option value="motion">Motion</option><option value="scheduled">Schedule</option><option value="event">Event</option><option value="manual">Manual</option>
          </select>
        )}
      </footer>
      {showDispatchModal && (
        <VideoWallDispatchModal
          cameraId={camera.id}
          cameraName={camera.name}
          isOpen={showDispatchModal}
          onClose={() => setShowDispatchModal(false)}
        />
      )}
    </article>
  );
}

export const CameraTile = memo(CameraTileComponent);
