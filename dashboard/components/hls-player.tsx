"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";

const MAX_RECOVERY_ATTEMPTS = 3;
const STALL_TIMEOUT_MS = 12_000;
const RECOVERY_DELAY_MS = 750;

type PlayerStatus = "idle" | "loading" | "live" | "reconnecting" | "error" | "demo";

export function HlsPlayer({
  url,
  bearerToken,
  cameraName,
  cameraId,
  muted = true,
  volume = 1,
  allowDemoFallback = false,
  onPlaybackError,
  onVideoElementChange,
}: {
  url: string;
  bearerToken: string;
  cameraName: string;
  cameraId?: string;
  muted?: boolean;
  volume?: number;
  allowDemoFallback?: boolean;
  onPlaybackError?: (reason?: string) => void;
  onVideoElementChange?: (videoElement: HTMLVideoElement | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackErrorRef = useRef(onPlaybackError);
  const [status, setStatus] = useState<PlayerStatus>(url ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    playbackErrorRef.current = onPlaybackError;
  }, [onPlaybackError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = volume;
  }, [muted, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    onVideoElementChange?.(video);
    return () => onVideoElementChange?.(null);
  }, [onVideoElementChange]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let disposed = false;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdogTimer: ReturnType<typeof setInterval> | undefined;
    let recoveryAttempts = 0;
    let lastProgressAt = Date.now();
    let playbackStarted = false;

    const setPlayerError = (reason: string) => {
      if (disposed) return;
      if (hls) {
        hls.destroy();
        hls = null;
      }
      setError(reason);
      setStatus(allowDemoFallback ? "demo" : "error");
      if (!allowDemoFallback) playbackErrorRef.current?.(reason);
    };

    const markProgress = () => {
      if (disposed) return;
      playbackStarted = true;
      lastProgressAt = Date.now();
      recoveryAttempts = 0;
      setError(null);
      setStatus("live");
    };

    const recover = (reason: string) => {
      if (disposed || recoveryTimer) return;
      if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
        setPlayerError(reason);
        return;
      }

      recoveryAttempts += 1;
      setStatus("reconnecting");
      setError(`Stream stalled, reconnecting (${recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS})`);
      recoveryTimer = setTimeout(() => {
        recoveryTimer = undefined;
        if (disposed) return;

        try {
          if (hls) {
            if (reason === "media_error") {
              hls.recoverMediaError();
            } else {
              hls.stopLoad();
              hls.startLoad(-1);
            }
          } else {
            video.load();
            void video.play().catch(() => undefined);
          }
          lastProgressAt = Date.now();
        } catch {
          recover("reconnect_failed");
        }
      }, RECOVERY_DELAY_MS);
    };

    const handleVideoError = () => recover("video_error");
    const handleWaiting = () => {
      if (playbackStarted && Date.now() - lastProgressAt >= STALL_TIMEOUT_MS) {
        recover("playback_stalled");
      }
    };
    const handleProgress = () => { lastProgressAt = Date.now(); };
    const handleCanPlay = () => { void video.play().catch(() => undefined); };

    video.addEventListener("playing", markProgress);
    video.addEventListener("timeupdate", markProgress);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("stalled", handleWaiting);
    video.addEventListener("error", handleVideoError);

    if (!url) {
      setStatus(allowDemoFallback ? "demo" : "idle");
      return () => {
        disposed = true;
        video.removeEventListener("playing", markProgress);
        video.removeEventListener("timeupdate", markProgress);
        video.removeEventListener("progress", handleProgress);
        video.removeEventListener("canplay", handleCanPlay);
        video.removeEventListener("waiting", handleWaiting);
        video.removeEventListener("stalled", handleWaiting);
        video.removeEventListener("error", handleVideoError);
      };
    }

    const streamUrl = withToken(url, bearerToken);
    setStatus("loading");
    setError(null);

    const startNativePlayback = () => {
      video.src = streamUrl;
      video.load();
      void video.play().catch(() => undefined);
    };

    if (Hls.isSupported()) {
      try {
        hls = new Hls({
          lowLatencyMode: true,
          backBufferLength: 10,
          maxBufferLength: 12,
          liveSyncDurationCount: 3,
          xhrSetup: (xhr, requestUrl) => {
            xhr.withCredentials = true;
            if (bearerToken) {
              const authorizedUrl = withToken(requestUrl, bearerToken);
              if (authorizedUrl !== requestUrl) xhr.open("GET", authorizedUrl, true);
            }
          },
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          playbackStarted = true;
          lastProgressAt = Date.now();
          void video.play().catch(() => undefined);
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveryAttempts < MAX_RECOVERY_ATTEMPTS) {
            recover("media_error");
            return;
          }
          recover("hls_error");
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
      } catch {
        setPlayerError("Unable to initialize HLS playback");
      }
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      startNativePlayback();
    } else {
      setPlayerError("This browser does not support HLS playback");
    }

    watchdogTimer = setInterval(() => {
      if (!playbackStarted || video.paused) return;
      if (Date.now() - lastProgressAt >= STALL_TIMEOUT_MS) recover("playback_stalled");
    }, 3_000);

    return () => {
      disposed = true;
      if (recoveryTimer) clearTimeout(recoveryTimer);
      if (watchdogTimer) clearInterval(watchdogTimer);
      video.removeEventListener("playing", markProgress);
      video.removeEventListener("timeupdate", markProgress);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("stalled", handleWaiting);
      video.removeEventListener("error", handleVideoError);
      if (hls) {
        hls.destroy();
        hls = null;
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [allowDemoFallback, bearerToken, retryNonce, url]);

  const retry = () => {
    setError(null);
    setStatus("loading");
    setRetryNonce((value) => value + 1);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      <video
        ref={videoRef}
        className={`live-video h-full w-full object-cover ${status === "live" ? "opacity-100" : "opacity-40"}`}
        aria-label={`Live video from ${cameraName}`}
        muted={muted}
        playsInline
        autoPlay
      />

      {status === "live" && (
        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-black/75 px-2 py-1 text-[10px] font-mono text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> LIVE
        </div>
      )}

      {status !== "live" && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75 p-3 text-center">
          <div className="flex max-w-[220px] flex-col items-center gap-2">
            {status === "loading" && <Loader2 className="animate-spin text-cyan-300" size={22} />}
            {status === "reconnecting" && <RotateCw className="animate-spin text-amber-300" size={22} />}
            {status === "error" && <AlertTriangle className="text-rose-300" size={22} />}
            {status === "demo" ? (
              <span className="text-xs font-medium text-amber-200">Demo preview, not a live camera feed</span>
            ) : status === "idle" ? (
              <span className="text-xs text-slate-400">Live feed not started</span>
            ) : (
              <span className="text-xs text-slate-300">{error ?? "Connecting to live feed..."}</span>
            )}
            {(status === "error" || status === "reconnecting") && (
              <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20">
                <RotateCw size={12} /> Retry
              </button>
            )}
          </div>
        </div>
      )}

      <span className="sr-only">{cameraId ?? cameraName}</span>
    </div>
  );
}

function withToken(value: string, bearerToken: string) {
  if (!bearerToken) return value;
  try {
    const url = new URL(value, typeof window === "undefined" ? "http://localhost" : window.location.origin);
    url.searchParams.set("token", bearerToken);
    return url.toString();
  } catch {
    return value;
  }
}
