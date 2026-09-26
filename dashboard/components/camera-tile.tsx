"use client";

import Link from "next/link";
import {
  BookmarkPlus,
  BrainCircuit,
  Camera as CameraIcon,
  Expand,
  LoaderCircle,
  Maximize2,
  MessageSquarePlus,
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
  Film,
  History,
  Rewind,
  Play,
  Tag,
  Crosshair,
  Target,
  Lightbulb,
  Lock,
  Unlock,
  Zap,
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
import { LiveAiOverlay } from "./live-ai-overlay";
import {
  useCameraOperatorFlags,
  PREDEFINED_OPERATOR_FLAGS,
} from "@/lib/camera-operator-flags";
import { OperatorCameraFlagModal } from "./operator-camera-flag-modal";
import { CameraAnnotationPanel } from "./camera-annotation-panel";
import { useLiveAnnotations } from "@/hooks/useLiveAnnotations";
import { useCameraInterventions } from "@/hooks/useCameraInterventions";
import { CameraInterventionModal } from "./camera-intervention-modal";

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
  activeStream,
  onStreamQualityChange,
  showVectors = true,
  handoverTarget,
  handoverIncoming,
  onAcceptHandover,
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
  activeStream?: "main" | "sub";
  onStreamQualityChange?: (cameraId: string, quality: "main" | "sub") => void;
  showVectors?: boolean;
  handoverTarget?: { cameraId: string; cameraName: string; direction: "left" | "right" | "top" | "bottom" };
  handoverIncoming?: { originCameraId: string; originCameraName: string };
  onAcceptHandover?: (targetCameraId: string) => void;
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
  const [audioWaveform, setAudioWaveform] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [loudNoiseAlert, setLoudNoiseAlert] = useState<{ active: boolean; decibels: number; timestamp: number } | null>(null);
  const loudNoiseThresholdRef = useRef<{ consecutiveHighFrames: number; lastAlertTime: number }>({ consecutiveHighFrames: 0, lastAlertTime: 0 });
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
  const [dvrOffset, setDvrOffset] = useState<number>(0);
  const [isTileHovered, setIsTileHovered] = useState<boolean>(false);
  const [flashbackDismissedAlertId, setFlashbackDismissedAlertId] = useState<string | null>(null);
  const [flashbackLoopTime, setFlashbackLoopTime] = useState<number>(0);
  const [flashbackFrameUrl, setFlashbackFrameUrl] = useState<string | null>(null);
  const [showDvrScrubber, setShowDvrScrubber] = useState<boolean>(false);
  const [showFlagModal, setShowFlagModal] = useState<boolean>(false);
  const [showAnnotationPanel, setShowAnnotationPanel] = useState<boolean>(false);
  const [showInterventionModal, setShowInterventionModal] = useState<boolean>(false);
  const { annotations: liveAnnotations } = useLiveAnnotations(camera.id);
  const activeAnnotationCount = liveAnnotations.filter((a) => !a.resolvedAt).length;
  const { isSirenActive, isStrobeActive, isDoorUnlocked } = useCameraInterventions(camera.id);
  const { cameraFlags } = useCameraOperatorFlags(camera.id);
  const [isRecordingClip, setIsRecordingClip] = useState<boolean>(false);
  const [clipCountdown, setClipCountdown] = useState<number>(15);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const clipTimerRef = useRef<NodeJS.Timeout | null>(null);

  // PTZ Wall Targeting (Click-to-Center & Drag-to-Zoom)
  const [isPtzTargetMode, setIsPtzTargetMode] = useState<boolean>(false);
  const [isPtzBoxDragging, setIsPtzBoxDragging] = useState<boolean>(false);
  const [ptzBoxStart, setPtzBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [ptzBoxCurrent, setPtzBoxCurrent] = useState<{ x: number; y: number } | null>(null);
  const [ptzReticle, setPtzReticle] = useState<{ x: number; y: number; time: number } | null>(null);
  const [ptzStatusMsg, setPtzStatusMsg] = useState<string | null>(null);
  const ptzStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showPtzFeedback = useCallback((msg: string) => {
    setPtzStatusMsg(msg);
    if (ptzStatusTimeoutRef.current) clearTimeout(ptzStatusTimeoutRef.current);
    ptzStatusTimeoutRef.current = setTimeout(() => setPtzStatusMsg(null), 3500);
  }, []);

  const dispatchPtzMove = useCallback(
    async (x: number, y: number, z: number = 0, type: "relative" | "continuous" = "relative") => {
      try {
        const res = await fetch(`/api/v1/cameras/${encodeURIComponent(camera.id)}/ptz/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, x, y, z }),
        });
        const data = await res.json().catch(() => null);
        return data;
      } catch (err) {
        console.warn("[PTZ Wall] Move dispatch error:", err);
        return null;
      }
    },
    [camera.id]
  );

  const dispatchPtzHome = useCallback(async () => {
    try {
      await fetch(`/api/v1/cameras/${encodeURIComponent(camera.id)}/ptz/home`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      resetZoom();
      showPtzFeedback("PTZ View Reset to Home (0,0,1x)");
    } catch (err) {
      console.warn("[PTZ Wall] Home dispatch error:", err);
    }
  }, [camera.id, resetZoom, showPtzFeedback]);

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
        let frameCount = 0;
        const updateMeter = () => {
          if (isCancelled) return;
          analyser!.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / (dataArray.length || 1);
          const currentLevel = Math.min(100, Math.round((avg / 128) * 100));
          setAudioLevel(currentLevel);

          // Update multi-band equalizer waveform
          frameCount++;
          if (frameCount % 2 === 0) {
            setAudioWaveform([
              Math.min(100, Math.round((dataArray[1] / 240) * 100)),
              Math.min(100, Math.round((dataArray[3] / 240) * 100)),
              Math.min(100, Math.round((dataArray[5] / 240) * 100)),
              Math.min(100, Math.round((dataArray[8] / 240) * 100)),
              Math.min(100, Math.round((dataArray[12] / 240) * 100)),
              Math.min(100, Math.round((dataArray[18] / 240) * 100)),
              Math.min(100, Math.round((dataArray[25] / 240) * 100)),
            ]);
          }

          // Automated Loud Noise / Panic Sound Detection (>76% / ~82dB threshold)
          if (currentLevel > 76) {
            loudNoiseThresholdRef.current.consecutiveHighFrames += 1;
            if (loudNoiseThresholdRef.current.consecutiveHighFrames >= 10 || currentLevel > 90) {
              const now = Date.now();
              if (now - loudNoiseThresholdRef.current.lastAlertTime > 6000) {
                loudNoiseThresholdRef.current.lastAlertTime = now;
                const estimatedDb = Math.round(50 + (currentLevel * 0.45));
                setLoudNoiseAlert({ active: true, decibels: estimatedDb, timestamp: now });
              }
            }
          } else {
            loudNoiseThresholdRef.current.consecutiveHighFrames = Math.max(0, loudNoiseThresholdRef.current.consecutiveHighFrames - 1);
          }

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
      setAudioWaveform([0, 0, 0, 0, 0, 0, 0]);
    };
  }, [internalVideoElement, effectiveMuted, hasLiveFrame]);

  // Auto-dismiss Loud Noise alert after 6 seconds of silence
  useEffect(() => {
    if (!loudNoiseAlert?.active) return;
    const timer = setTimeout(() => {
      setLoudNoiseAlert(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [loudNoiseAlert]);

  // Adaptive Dual-Stream switching on fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isTileFullscreen = document.fullscreenElement === tileRef.current;
      if (isTileFullscreen) {
        // Automatically promote to high-definition main stream (1080p/4K)
        onStreamQualityChange?.(camera.id, "main");
      } else {
        // Drop back to bandwidth-conserving sub-stream when leaving fullscreen
        onStreamQualityChange?.(camera.id, "sub");
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [camera.id, onStreamQualityChange]);

  const showCredentialUpdate = shouldOfferCredentialUpdate(liveError);
  const activeAiRules = aiOverlay?.rules.filter((rule) => rule.enabled) ?? [];
  const activeAiAlerts = hasLiveFrame ? aiOverlay?.alerts.filter((alert) =>
    !["resolved", "false_alarm", "suppressed"].includes(alert.status)
  ) ?? [] : [];
  const latestAiAlert = activeAiAlerts[0];

  // Synchronized Event Flashback: Capture keyframe when alert triggers
  useEffect(() => {
    if (!latestAiAlert) return;
    if (flashbackDismissedAlertId === latestAiAlert.id) return;

    const video = internalVideoElement || tileRef.current?.querySelector("video");
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      try {
        const offCanvas = document.createElement("canvas");
        offCanvas.width = video.videoWidth;
        offCanvas.height = video.videoHeight;
        const ctx = offCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height);
          setFlashbackFrameUrl(offCanvas.toDataURL("image/jpeg", 0.8));
        }
      } catch (err) {
        if (snapshotUrl) setFlashbackFrameUrl(snapshotUrl);
      }
    } else if (snapshotUrl) {
      setFlashbackFrameUrl(snapshotUrl);
    }
  }, [latestAiAlert, internalVideoElement, snapshotUrl, flashbackDismissedAlertId]);

  // Synchronized Event Flashback: 5-second cycling loop timer
  useEffect(() => {
    if (!latestAiAlert || flashbackDismissedAlertId === latestAiAlert.id) return;
    const interval = setInterval(() => {
      setFlashbackLoopTime((t) => (t >= 5 ? 0 : Number((t + 0.25).toFixed(2))));
    }, 250);
    return () => clearInterval(interval);
  }, [latestAiAlert, flashbackDismissedAlertId]);

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

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const handleSetPlaybackSpeed = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    const video = internalVideoElement || tileRef.current?.querySelector("video");
    if (video) {
      video.playbackRate = speed;
    }
  }, [internalVideoElement]);

  const handleDvrScrub = useCallback((secondsAgo: number) => {
    const video = internalVideoElement || tileRef.current?.querySelector("video");
    if (!video) return;

    if (secondsAgo <= 0) {
      setDvrOffset(0);
      setPlaybackSpeed(1);
      video.playbackRate = 1;
      if (video.seekable && video.seekable.length > 0) {
        video.currentTime = video.seekable.end(video.seekable.length - 1);
      }
      void video.play().catch(() => {});
      return;
    }

    setDvrOffset(secondsAgo);
    if (video.seekable && video.seekable.length > 0) {
      const liveEdge = video.seekable.end(video.seekable.length - 1);
      const earliest = video.seekable.start(0);
      const targetTime = Math.max(earliest, liveEdge - secondsAgo);
      video.currentTime = targetTime;
      void video.play().catch(() => {});
    } else if (video.currentTime) {
      video.currentTime = Math.max(0, video.currentTime - secondsAgo);
    }
  }, [internalVideoElement]);

  const handleExportIncidentClip = useCallback(() => {
    const video = internalVideoElement || tileRef.current?.querySelector("video");
    if (!video) return;

    if (isRecordingClip) {
      if (clipTimerRef.current) clearInterval(clipTimerRef.current);
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      type VideoWithCapture = HTMLVideoElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      };
      const v = video as VideoWithCapture;
      let stream: MediaStream | null = null;
      if (typeof v.captureStream === "function") {
        stream = v.captureStream();
      } else if (typeof v.mozCaptureStream === "function") {
        stream = v.mozCaptureStream();
      }

      if (!stream || stream.getVideoTracks().length === 0) {
        takeSnapshot();
        return;
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : MediaRecorder.isTypeSupported("video/mp4")
        ? "video/mp4"
        : "";

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        setIsRecordingClip(false);
        setClipCountdown(15);
        if (recordedChunksRef.current.length === 0) return;

        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const ext = (recorder.mimeType || "").includes("mp4") ? "mp4" : "webm";
        const safeName = camera.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
        const now = new Date();
        link.download = `INCIDENT_CLIP_${safeName}_${now.toISOString().replace(/[:.]/g, "-")}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      };

      recorder.start(1000);
      setIsRecordingClip(true);
      setClipCountdown(15);

      let remaining = 15;
      clipTimerRef.current = setInterval(() => {
        remaining -= 1;
        setClipCountdown(remaining);
        if (remaining <= 0) {
          if (clipTimerRef.current) clearInterval(clipTimerRef.current);
          recorder.stop();
        }
      }, 1000);
    } catch (err) {
      console.error("Failed to start incident clip recording, falling back to snapshot:", err);
      takeSnapshot();
    }
  }, [internalVideoElement, isRecordingClip, camera.name, takeSnapshot]);

  useEffect(() => {
    return () => {
      if (clipTimerRef.current) clearInterval(clipTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const hasCriticalAlert = Boolean(latestAiAlert && (latestAiAlert.severity === "P1" || latestAiAlert.severity === "P2"));
  const hasWarningAlert = Boolean(latestAiAlert && latestAiAlert.severity === "P3");
  const hasAudioPanic = Boolean(loudNoiseAlert?.active);
  const alertRingClass = (hasCriticalAlert || hasAudioPanic)
    ? "ring-2 ring-red-500 shadow-[0_0_24px_rgba(239,68,68,0.7)] animate-pulse"
    : hasWarningAlert
      ? "ring-2 ring-amber-500 shadow-[0_0_16px_rgba(245,158,11,0.4)]"
      : "";

  return (
    <article
      className={`camera-tile ${alertRingClass}`}
      ref={tileRef}
      data-camera-id={camera.id}
      onMouseEnter={() => setIsTileHovered(true)}
      onMouseLeave={() => setIsTileHovered(false)}
    >
      <div className="tile-topline">
        <div className="tile-status-badges flex items-center gap-1.5">
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
            <span
              className={`status-pill flex items-center gap-1.5 transition-all duration-200 ${
                loudNoiseAlert?.active
                  ? "text-rose-300 border-rose-500/80 bg-rose-950/90 shadow-[0_0_12px_rgba(244,63,94,0.5)] animate-pulse font-bold"
                  : "text-emerald-400 border-emerald-500/40 bg-emerald-950/70"
              }`}
              title={`Live Audio: ${audioLevel}% (~${Math.round(45 + audioLevel * 0.45)} dB)`}
            >
              <Volume2
                size={12}
                className={loudNoiseAlert?.active ? "text-rose-400 animate-bounce" : audioLevel > 5 ? "animate-pulse text-emerald-400" : "text-emerald-400/70"}
              />
              <span className="text-[10px] font-mono font-bold tracking-tight">
                {loudNoiseAlert?.active ? "LOUD NOISE!" : "AUDIO"}
              </span>

              {/* Live 7-Band Equalizer Waveform */}
              <span className="inline-flex items-end gap-[1.5px] h-3 px-1 py-[1px] bg-slate-950/80 rounded border border-emerald-500/30 overflow-hidden">
                {audioWaveform.map((band, idx) => (
                  <span
                    key={idx}
                    className={`w-[2.5px] rounded-[0.5px] transition-all duration-75 ${
                      band > 75 ? "bg-rose-500" : band > 35 ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                    style={{ height: `${Math.max(15, band)}%` }}
                  />
                ))}
              </span>
              <span className="text-[9px] font-mono opacity-85">
                {Math.round(45 + audioLevel * 0.45)}dB
              </span>
            </span>
          )}
          {isSoloAudio && (
            <span className="status-pill text-amber-300 border-amber-500/60 bg-amber-950/80 font-bold" title="Solo Audio is isolated to this camera">
              SOLO AUDIO
            </span>
          )}
          {activeStream && (
            <button
              type="button"
              onClick={() => onStreamQualityChange?.(camera.id, activeStream === "main" ? "sub" : "main")}
              className={`status-pill font-mono font-bold text-[9px] cursor-pointer transition-all ${
                activeStream === "main"
                  ? "text-sky-300 border-sky-500/70 bg-sky-950/80 shadow-[0_0_8px_rgba(14,165,233,0.35)]"
                  : "text-zinc-400 border-zinc-700 bg-zinc-900/80 hover:text-zinc-200"
              }`}
              title={
                activeStream === "main"
                  ? "Adaptive Dual-Stream: Main-stream HD (1080p / 4K) active. Click to switch to Sub-stream."
                  : "Adaptive Dual-Stream: Sub-stream SD (D1 / 720p) active to conserve bandwidth. Fullscreen auto-elevates to Main-stream HD. Click to switch manually."
              }
            >
              {activeStream === "main" ? "HD MAIN" : "SD SUB"}
            </button>
          )}
          {dvrOffset > 0 && (
            <button
              type="button"
              onClick={() => handleDvrScrub(0)}
              className="status-pill flex items-center gap-1 bg-amber-950/90 border-amber-500/80 text-amber-300 font-bold animate-pulse hover:bg-emerald-950 hover:text-emerald-300 hover:border-emerald-500 cursor-pointer"
              title="DVR Rewind is active. Click to jump back to live broadcast."
            >
              <Rewind size={11} />
              DVR: -{dvrOffset}s ({playbackSpeed}x) · ▶ LIVE
            </button>
          )}
        </div>
        {onToggleRecording && (
          <button type="button" className={`recording-pill ${recording?.enabled ? "active" : ""}`} onClick={onToggleRecording} disabled={recordingLoading} title={recording?.enabled ? "Stop recording" : "Start continuous recording"}>
            {recording?.enabled ? <CircleStop size={12} /> : <Radio size={12} />}
            {recordingLoading ? "…" : recording?.enabled ? "REC" : "REC OFF"}
          </button>
        )}
      </div>

      <div
        className="feed-stage"
        style={{ cursor: isPtzTargetMode ? "crosshair" : zoom > 1 ? "grab" : undefined }}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest("button, a, input, select")) return;
          if (isPtzTargetMode) {
            void dispatchPtzHome();
          } else if (zoom > 1) {
            resetZoom();
          }
        }}
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          if ((event.target as HTMLElement).closest("button, a, input, select")) return;

          const rect = event.currentTarget.getBoundingClientRect();
          const relX = event.clientX - rect.left;
          const relY = event.clientY - rect.top;

          if (isPtzTargetMode) {
            setIsPtzBoxDragging(true);
            setPtzBoxStart({ x: relX, y: relY });
            setPtzBoxCurrent({ x: relX, y: relY });
            return;
          }

          if (zoom <= 1) return;
          isDraggingRef.current = true;
          dragStartRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
          if (event.currentTarget) {
            event.currentTarget.style.cursor = "grabbing";
          }
        }}
        onMouseMove={(event) => {
          if (isPtzTargetMode && isPtzBoxDragging && ptzBoxStart) {
            const rect = event.currentTarget.getBoundingClientRect();
            setPtzBoxCurrent({
              x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
              y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
            });
            return;
          }

          if (!isDraggingRef.current || zoom <= 1) return;
          const dx = event.clientX - dragStartRef.current.x;
          const dy = event.clientY - dragStartRef.current.y;
          setPan({
            x: dragStartRef.current.panX + dx,
            y: dragStartRef.current.panY + dy,
          });
        }}
        onMouseUp={(event) => {
          if (isPtzTargetMode && isPtzBoxDragging && ptzBoxStart) {
            const rect = event.currentTarget.getBoundingClientRect();
            const endX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
            const endY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));

            const boxWidth = Math.abs(endX - ptzBoxStart.x);
            const boxHeight = Math.abs(endY - ptzBoxStart.y);

            if (boxWidth >= 20 && boxHeight >= 20) {
              // Bounding Box Drag-to-Zoom (Optical & Digital Zoom Sync)
              const boxLeft = Math.min(ptzBoxStart.x, endX);
              const boxTop = Math.min(ptzBoxStart.y, endY);
              const boxCenterX = boxLeft + boxWidth / 2;
              const boxCenterY = boxTop + boxHeight / 2;

              const normX = (boxCenterX - rect.width / 2) / (rect.width / 2);
              const normY = (boxCenterY - rect.height / 2) / (rect.height / 2);

              const zoomRatio = Math.min(4, Math.max(1.2, rect.width / boxWidth));
              const zVector = Math.min(1.0, (zoomRatio - 1) / 2);

              void dispatchPtzMove(Number(normX.toFixed(2)), Number((-normY).toFixed(2)), Number(zVector.toFixed(2)));

              // Synchronize digital pan and zoom for instantaneous optical/digital fusion
              setZoom(Number(zoomRatio.toFixed(2)));
              setPan({
                x: -(boxCenterX - rect.width / 2),
                y: -(boxCenterY - rect.height / 2),
              });

              showPtzFeedback(`🎯 Box Zoom: ${zoomRatio.toFixed(1)}x (Optical/Digital Sync)`);
            } else {
              // Click-to-Center from Wall
              const clickX = ptzBoxStart.x;
              const clickY = ptzBoxStart.y;
              const normX = (clickX - rect.width / 2) / (rect.width / 2);
              const normY = (clickY - rect.height / 2) / (rect.height / 2);

              setPtzReticle({ x: clickX, y: clickY, time: Date.now() });

              void dispatchPtzMove(Number(normX.toFixed(2)), Number((-normY).toFixed(2)), 0);

              // Smooth responsive digital nudge
              setPan((prev) => ({
                x: prev.x - (clickX - rect.width / 2),
                y: prev.y - (clickY - rect.height / 2),
              }));

              showPtzFeedback(
                `⌖ Click-to-Center: ${normX >= 0 ? "+" : ""}${(normX * 100).toFixed(0)}% X, ${
                  normY >= 0 ? "+" : ""
                }${(normY * 100).toFixed(0)}% Y`
              );
            }

            setIsPtzBoxDragging(false);
            setPtzBoxStart(null);
            setPtzBoxCurrent(null);
            return;
          }

          isDraggingRef.current = false;
          if (event.currentTarget) {
            event.currentTarget.style.cursor = isPtzTargetMode ? "crosshair" : zoom > 1 ? "grab" : "";
          }
        }}
        onMouseLeave={(event) => {
          if (isPtzTargetMode && isPtzBoxDragging) {
            setIsPtzBoxDragging(false);
            setPtzBoxStart(null);
            setPtzBoxCurrent(null);
          }
          isDraggingRef.current = false;
          if (event.currentTarget) {
            event.currentTarget.style.cursor = isPtzTargetMode ? "crosshair" : zoom > 1 ? "grab" : "";
          }
        }}
        onWheel={(event) => {
          event.preventDefault();
          const delta = event.deltaY < 0 ? 0.35 : -0.35;
          setZoom((value) => {
            const next = Math.max(1, Math.min(4, Number((value + delta).toFixed(2))));
            if (next === 1) setPan({ x: 0, y: 0 });
            return next;
          });
        }}
      >
        {/* Reticle for Click-to-Center */}
        {ptzReticle && (
          <div
            key={ptzReticle.time}
            className="absolute pointer-events-none z-30 flex items-center justify-center -translate-x-1/2 -translate-y-1/2 animate-ping"
            style={{ left: ptzReticle.x, top: ptzReticle.y }}
          >
            <div className="w-10 h-10 rounded-full border-2 border-cyan-400 bg-cyan-500/20 flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.9)]">
              <div className="w-2 h-2 rounded-full bg-cyan-300" />
            </div>
          </div>
        )}

        {/* Bounding Box for Box-Zoom */}
        {isPtzBoxDragging && ptzBoxStart && ptzBoxCurrent && (
          <div
            className="absolute pointer-events-none z-30 border-2 border-dashed border-cyan-400 bg-cyan-500/20 backdrop-blur-[1px] shadow-[0_0_15px_rgba(6,182,212,0.7)]"
            style={{
              left: Math.min(ptzBoxStart.x, ptzBoxCurrent.x),
              top: Math.min(ptzBoxStart.y, ptzBoxCurrent.y),
              width: Math.abs(ptzBoxCurrent.x - ptzBoxStart.x),
              height: Math.abs(ptzBoxCurrent.y - ptzBoxStart.y),
            }}
          >
            <div className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-black/90 text-[10px] font-mono text-cyan-300 border border-cyan-500/60 flex items-center gap-1 shadow">
              <span>🔍 Box Zoom</span>
              <span>
                {Math.round(Math.abs(ptzBoxCurrent.x - ptzBoxStart.x))}×
                {Math.round(Math.abs(ptzBoxCurrent.y - ptzBoxStart.y))}
              </span>
            </div>
          </div>
        )}

        {/* Live feedback toast */}
        {ptzStatusMsg && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full bg-black/95 border border-cyan-500/80 text-cyan-300 text-xs font-semibold shadow-2xl backdrop-blur flex items-center gap-1.5 pointer-events-none">
            <Crosshair size={13} className="text-cyan-400 animate-spin" />
            <span>{ptzStatusMsg}</span>
          </div>
        )}

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
              {showAiOverlay && hasLiveFrame && (
                <LiveAiOverlay
                  rules={aiOverlay?.rules}
                  alerts={aiOverlay?.alerts}
                  cameraName={camera.name}
                  showHeatmap={true}
                  showVectors={showVectors}
                  handoverInfo={handoverTarget ? { direction: handoverTarget.direction, targetCameraName: handoverTarget.cameraName } : undefined}
                />
              )}
            </>
          ) : snapshotUrl ? (
            <>
              <img
                src={snapshotUrl}
                alt={`Latest snapshot from ${camera.name}`}
                className="live-video"
              />
              {showAiOverlay && hasLiveFrame && (
                <LiveAiOverlay
                  rules={aiOverlay?.rules}
                  alerts={aiOverlay?.alerts}
                  cameraName={camera.name}
                  showHeatmap={true}
                  showVectors={showVectors}
                  handoverInfo={handoverTarget ? { direction: handoverTarget.direction, targetCameraName: handoverTarget.cameraName } : undefined}
                />
              )}
            </>
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

        {handoverTarget && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAcceptHandover?.(handoverTarget.cameraId);
            }}
            className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/95 hover:bg-amber-400 text-black font-extrabold text-[11px] shadow-2xl animate-pulse border border-amber-300 backdrop-blur cursor-pointer transition-transform hover:scale-105"
            title={`Cross-Camera Suspect Handover: Suspect heading ${handoverTarget.direction} toward ${handoverTarget.cameraName}. Click to spotlight companion camera.`}
          >
            <span>🎯 HANDOVER: {handoverTarget.direction.toUpperCase()} → {handoverTarget.cameraName}</span>
          </button>
        )}

        {handoverIncoming && (
          <div
            className="absolute top-2.5 left-2.5 z-30 flex items-center gap-1.5 px-2 py-0.5 rounded bg-sky-500/95 text-white font-bold text-[10px] shadow border border-sky-300 backdrop-blur pointer-events-none"
          >
            <span>👁️ INCOMING FROM {handoverIncoming.originCameraName}</span>
          </div>
        )}

        {hasAudioPanic && (
          <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-600/95 text-white text-[11px] font-black tracking-wide shadow-2xl border border-rose-300/80 backdrop-blur animate-bounce pointer-events-none">
            <Volume2 size={13} className="text-white animate-pulse" />
            <span>PANIC AUDIO: LOUD NOISE DETECTED ({loudNoiseAlert?.decibels} dB)</span>
          </div>
        )}

        {zoom > 1 && (
          <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/85 border border-sky-500/60 text-[11px] font-mono text-sky-300 backdrop-blur shadow-lg">
            <span>{Math.round(zoom * 100)}% PTZ</span>
            <button
              type="button"
              onClick={resetZoom}
              className="ml-1 text-[10px] text-zinc-400 hover:text-white underline cursor-pointer"
              title="Reset digital zoom to 100%"
            >
              Reset
            </button>
          </div>
        )}

        {isRecordingClip && (
          <button
            type="button"
            onClick={handleExportIncidentClip}
            className="absolute top-2.5 left-2.5 z-20 flex items-center gap-2 px-2.5 py-1 rounded bg-red-950/95 border border-red-500 text-xs font-bold text-red-200 shadow-2xl animate-pulse cursor-pointer hover:bg-red-900"
            title="Recording 15s incident evidence clip. Click to finish and save immediately."
          >
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span>REC CLIP: {clipCountdown}s (Click to save)</span>
          </button>
        )}

        {/* Synchronized Event Flashback (Instant Mini Picture-in-Picture 5-second Loop) */}
        {hasLiveFrame && Boolean(flashbackFrameUrl) && latestAiAlert && flashbackDismissedAlertId !== latestAiAlert.id && (
          <div
            className={`absolute ${(showDvrScrubber || isTileHovered || dvrOffset > 0) ? "bottom-28" : "bottom-12"} right-2.5 z-30 w-44 sm:w-48 rounded-lg overflow-hidden border-2 border-red-500/90 bg-zinc-950/95 shadow-[0_0_20px_rgba(239,68,68,0.5)] backdrop-blur text-xs animate-in fade-in slide-in-from-bottom-2 duration-300`}
            onClick={(e) => {
              e.stopPropagation();
              handleDvrScrub(15);
            }}
            title="Synchronized Event Flashback (5s loop). Click to rewind main video 15s to this event."
          >
            {/* PiP Header */}
            <div className="flex items-center justify-between px-2 py-1 bg-red-950/90 border-b border-red-800/60">
              <span className="flex items-center gap-1 text-[10px] font-black text-red-200 tracking-wider">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                FLASHBACK: 5s LOOP
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFlashbackDismissedAlertId(latestAiAlert.id);
                }}
                className="text-zinc-400 hover:text-white text-xs px-1 rounded cursor-pointer"
                title="Dismiss flashback PiP"
              >
                ✕
              </button>
            </div>

            {/* PiP Visual Content (5s Looping Preview) */}
            <div className="relative aspect-video w-full bg-black overflow-hidden cursor-pointer group">
              {flashbackFrameUrl ? (
                <img
                  src={flashbackFrameUrl}
                  alt={`Flashback ${latestAiAlert.title}`}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-zinc-500 text-[10px]">
                  <span>Loading Flashback...</span>
                </div>
              )}

              {/* Tactical alert reticle overlay */}
              <div className="absolute inset-0 border border-red-500/40 pointer-events-none flex flex-col justify-between p-1">
                <div className="flex justify-between items-start">
                  <span className="bg-red-600/90 text-white text-[9px] font-mono font-bold px-1 rounded truncate max-w-[70%]">
                    {latestAiAlert.title.toUpperCase()}
                  </span>
                  <span className="bg-black/80 text-amber-300 text-[9px] font-mono px-1 rounded">
                    {Math.round(latestAiAlert.confidence * 100)}%
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="bg-black/85 text-emerald-400 text-[9px] font-mono font-bold px-1 rounded">
                    ▶ REWIND
                  </span>
                  <span className="bg-red-900/90 text-white text-[9px] font-mono px-1 rounded font-bold">
                    00:0{Math.floor(flashbackLoopTime)}s
                  </span>
                </div>
              </div>

              {/* 5-second looping progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
                <div
                  className="h-full bg-red-500 transition-all duration-200"
                  style={{ width: `${(flashbackLoopTime / 5) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Instant Hover Mini Timeline & Time Scrubbing Bar */}
        {(showDvrScrubber || isTileHovered || dvrOffset > 0) && (
          <div
            className="absolute bottom-11 left-2 right-2 z-20 flex flex-col gap-1.5 p-2 rounded-lg bg-zinc-950/95 border border-zinc-700/80 backdrop-blur shadow-2xl text-xs transition-opacity duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
              <span className="flex items-center gap-1.5 text-sky-400">
                <History size={13} />
                <span>Hover Timeline Scrub</span>
                {dvrOffset > 0 ? (
                  <span className="text-amber-400 font-mono font-bold">(-{dvrOffset}s)</span>
                ) : (
                  <span className="text-emerald-400 font-mono font-bold">● LIVE</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => handleDvrScrub(0)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                  dvrOffset > 0
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                ▶ RETURN TO LIVE
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 font-mono">-60s</span>
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                value={dvrOffset}
                onChange={(e) => handleDvrScrub(Number(e.target.value))}
                className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-sky-400"
                title="Drag to scrub back up to 60s"
              />
              <span className="text-[10px] text-emerald-400 font-mono">0s (LIVE)</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80 gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleDvrScrub(10)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                    dvrOffset === 10 ? "border-amber-400 text-amber-300 bg-amber-950/60" : "border-zinc-700 hover:border-zinc-500 text-zinc-300"
                  }`}
                  title="Instant 10-second rewind"
                >
                  ⚡ -10s REWIND
                </button>
                <button
                  type="button"
                  onClick={() => handleDvrScrub(30)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                    dvrOffset === 30 ? "border-amber-400 text-amber-300 bg-amber-950/60" : "border-zinc-700 hover:border-zinc-500 text-zinc-300"
                  }`}
                  title="Instant 30-second rewind"
                >
                  ⚡ -30s REWIND
                </button>
                <button
                  type="button"
                  onClick={() => handleDvrScrub(60)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors cursor-pointer ${
                    dvrOffset === 60 ? "border-amber-400 text-amber-300 bg-amber-950/60" : "border-zinc-700 hover:border-zinc-500 text-zinc-300"
                  }`}
                >
                  -60s
                </button>
              </div>

              {/* Speed Controls: 0.5x, 1x, 2x */}
              <div className="flex items-center gap-1 border-l border-zinc-700/80 pl-2">
                <span className="text-[9px] text-zinc-400 font-mono">SPEED:</span>
                {[0.5, 1, 2].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => handleSetPlaybackSpeed(spd)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                      playbackSpeed === spd
                        ? "border-sky-400 text-sky-300 bg-sky-950/80 shadow-[0_0_6px_rgba(56,189,248,0.4)]"
                        : "border-zinc-700 hover:border-zinc-500 text-zinc-400"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowDvrScrubber(false);
                  if (dvrOffset > 0) handleDvrScrub(0);
                }}
                className="text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer ml-auto"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {cameraFlags.length > 0 && (
          <div className="absolute top-11 left-2.5 z-20 flex flex-wrap items-center gap-1.5 pointer-events-auto">
            {cameraFlags.map((flag, idx) => {
              const def = PREDEFINED_OPERATOR_FLAGS.find((f) => f.type === flag.type);
              const colorClass = def
                ? def.colorClass
                : "bg-indigo-500/20 text-indigo-300 border-indigo-500/60";
              return (
                <button
                  key={`${flag.type}-${idx}`}
                  type="button"
                  onClick={() => setShowFlagModal(true)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold shadow-lg backdrop-blur-md cursor-pointer transition-transform hover:scale-105 ${colorClass}`}
                  title={`${flag.label}${flag.note ? `: ${flag.note}` : ""} · Click to edit flag`}
                >
                  <span className="text-[11px]">{def ? def.icon : "🏷️"}</span>
                  <span>{flag.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {(isSirenActive || isDoorUnlocked || isStrobeActive) && (
          <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5 flex-wrap pointer-events-auto">
            {isSirenActive && (
              <button
                type="button"
                onClick={() => setShowInterventionModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-600/95 text-white font-mono text-[10px] font-bold shadow-lg border border-rose-400 animate-pulse cursor-pointer hover:bg-rose-500"
                title="🚨 Acoustic Siren / Strobe Deterrence Active! Click to manage or stop"
              >
                <Siren size={12} className="animate-spin" />
                <span>SIREN ACTIVE</span>
              </button>
            )}
            {isDoorUnlocked && (
              <button
                type="button"
                onClick={() => setShowInterventionModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600/95 text-white font-mono text-[10px] font-bold shadow-lg border border-emerald-400 animate-pulse cursor-pointer hover:bg-emerald-500"
                title="🔓 Access Control Door Released! Click to manage"
              >
                <Unlock size={12} />
                <span>DOOR UNLOCKED</span>
              </button>
            )}
            {isStrobeActive && !isSirenActive && (
              <button
                type="button"
                onClick={() => setShowInterventionModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/95 text-black font-mono text-[10px] font-bold shadow-lg border border-amber-300 cursor-pointer hover:bg-amber-400"
                title="💡 White Floodlight Deterrence Active! Click to manage"
              >
                <Lightbulb size={12} />
                <span>FLOODLIGHT ON</span>
              </button>
            )}
          </div>
        )}

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
          <button
            type="button"
            aria-label="Direct Interventions (Siren, Strobe & Door Release)"
            title={
              isSirenActive
                ? "🚨 Siren/Strobe Active! Click to manage or stop"
                : isDoorUnlocked
                ? "🔓 Door Unlocked! Click to manage"
                : "⚡ Direct Operator Interventions: 110dB Edge Siren, Strobe, Floodlight & Door Release"
            }
            className={
              isSirenActive
                ? "text-rose-400 border-rose-500/80 bg-rose-950/90 shadow-[0_0_12px_rgba(244,63,94,0.6)] animate-pulse"
                : isDoorUnlocked
                ? "text-emerald-400 border-emerald-500/80 bg-emerald-950/80 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                : showInterventionModal
                ? "text-rose-300 border-rose-500/60 bg-rose-950/60"
                : ""
            }
            onClick={() => setShowInterventionModal((prev) => !prev)}
            disabled={!canPlayLive}
          >
            <Zap size={15} />
          </button>
          <button
            type="button"
            aria-label="PTZ Click-to-Center & Box Zoom"
            title={
              isPtzTargetMode
                ? "🎯 PTZ Wall Active: Click view to Center, Drag box to Zoom, Double-click to Home (Click to disable)"
                : "🎯 PTZ Wall Control: Click-to-Center & Box Zoom (Optical/Digital Sync)"
            }
            className={
              isPtzTargetMode
                ? "text-cyan-400 border-cyan-500/80 bg-cyan-950/80 shadow-[0_0_10px_rgba(6,182,212,0.5)] animate-pulse"
                : ""
            }
            onClick={() => {
              setIsPtzTargetMode((prev) => !prev);
              if (!isPtzTargetMode) {
                showPtzFeedback("🎯 PTZ Wall Mode: Click to Center, Drag box to Zoom");
              }
            }}
            disabled={!canPlayLive}
          >
            <Crosshair size={15} />
          </button>
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
            aria-label="Operator Status Flags"
            title={
              cameraFlags.length > 0
                ? `Operator Flags (${cameraFlags.map((f) => f.label).join(", ")}): Click to manage`
                : "Add Operator Status Flags (Maintenance Needed, Lens Dirty, VIP, etc.)"
            }
            className={
              cameraFlags.length > 0
                ? "text-amber-400 border-amber-500/70 bg-amber-950/80 shadow-[0_0_8px_rgba(245,158,11,0.35)]"
                : ""
            }
            onClick={() => setShowFlagModal(true)}
          >
            <Tag size={15} />
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
            aria-label="Operator Live Notes"
            title={
              activeAnnotationCount > 0
                ? `Live Operator Notes (${activeAnnotationCount} active pin${activeAnnotationCount === 1 ? "" : "s"}) – synced to all operators in real-time. Click to view/add.`
                : "Pin a live operator note on this camera tile (shift-aware, shift-persistent log)"
            }
            className={
              activeAnnotationCount > 0
                ? "text-indigo-400 border-indigo-500/80 bg-indigo-950/80 shadow-[0_0_8px_rgba(99,102,241,0.4)] relative"
                : showAnnotationPanel
                ? "text-indigo-300 border-indigo-500/60 bg-indigo-950/60"
                : ""
            }
            onClick={() => setShowAnnotationPanel((p) => !p)}
          >
            <MessageSquarePlus size={15} />
            {activeAnnotationCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-indigo-500 text-[9px] font-black text-white flex items-center justify-center border border-zinc-900 pointer-events-none"
              >
                {activeAnnotationCount}
              </span>
            )}
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
          <button
            type="button"
            aria-label="Instant Rewind & DVR Scrub"
            title={showDvrScrubber ? "Close DVR Quick Scrub" : "Instant Rewind: Quick scrub past 10s–60s without leaving live view"}
            className={showDvrScrubber || dvrOffset > 0 ? "text-amber-400 border-amber-500/80 bg-amber-950/80 shadow-[0_0_8px_rgba(245,158,11,0.4)]" : ""}
            onClick={() => setShowDvrScrubber(!showDvrScrubber)}
            disabled={!canPlayLive}
          >
            <History size={15} />
          </button>
          <button
            type="button"
            aria-label={isRecordingClip ? "Stop recording clip" : "Record 15-second incident evidence clip"}
            title={isRecordingClip ? `Recording incident clip (${clipCountdown}s left). Click to stop and download now.` : "One-Click Incident Clip: Record and download 15s evidence video with audio"}
            className={isRecordingClip ? "text-red-400 border-red-500 bg-red-950/90 shadow-[0_0_12px_rgba(239,68,68,0.7)] animate-pulse" : ""}
            onClick={handleExportIncidentClip}
            disabled={!canPlayLive}
          >
            <Film size={15} />
          </button>
          <button type="button" aria-label="Take forensic snapshot" title="Take forensic watermarked snapshot" onClick={takeSnapshot} disabled={!hasLiveFrame}><SnapshotIcon size={15} /></button>
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
      {showFlagModal && (
        <OperatorCameraFlagModal
          cameraId={camera.id}
          cameraName={camera.name}
          isOpen={showFlagModal}
          onClose={() => setShowFlagModal(false)}
        />
      )}
      {showAnnotationPanel && (
        <CameraAnnotationPanel
          cameraId={camera.id}
          cameraName={camera.name}
          operatorName={undefined /* will default to "Operator" – pass from auth context if available */}
          isOpen={showAnnotationPanel}
          onClose={() => setShowAnnotationPanel(false)}
        />
      )}
      {showInterventionModal && (
        <CameraInterventionModal
          cameraId={camera.id}
          cameraName={camera.name}
          isOpen={showInterventionModal}
          onClose={() => setShowInterventionModal(false)}
        />
      )}
    </article>
  );
}

export const CameraTile = memo(CameraTileComponent);
