"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";

const MAX_RECOVERY_ATTEMPTS = 5;
const STALL_TIMEOUT_MS = 15_000;
const RECOVERY_DELAY_MS = 1_500;

type PlayerStatus = "idle" | "loading" | "live" | "reconnecting" | "error";

export function HlsPlayer({
  url,
  bearerToken,
  cameraName,
  cameraId,
  muted = true,
  volume = 1,
  onPlaybackError,
  onPlaybackStateChange,
  onVideoElementChange,
}: {
  url: string;
  bearerToken: string;
  cameraName: string;
  cameraId?: string;
  muted?: boolean;
  volume?: number;
  onPlaybackError?: (reason?: string) => void;
  onPlaybackStateChange?: (playing: boolean) => void;
  onVideoElementChange?: (videoElement: HTMLVideoElement | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackErrorRef = useRef(onPlaybackError);
  const playbackStateChangeRef = useRef(onPlaybackStateChange);
  const [status, setStatus] = useState<PlayerStatus>(url ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    playbackErrorRef.current = onPlaybackError;
  }, [onPlaybackError]);

  useEffect(() => {
    playbackStateChangeRef.current = onPlaybackStateChange;
  }, [onPlaybackStateChange]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = volume;
  }, [muted, volume]);

  const onVideoElementChangeRef = useRef(onVideoElementChange);
  useEffect(() => {
    onVideoElementChangeRef.current = onVideoElementChange;
  }, [onVideoElementChange]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    onVideoElementChangeRef.current?.(video);
    return () => onVideoElementChangeRef.current?.(null);
  }, []);

  useEffect(() => {
    let hls: Hls | null = null;
    let disposed = false;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdogTimer: ReturnType<typeof setInterval> | undefined;
    let recoveryAttempts = 0;
    let lastProgressAt = Date.now();
    let playbackStarted = false;
    let reportedPlaying = false;

    const reportPlaying = (playing: boolean) => {
      if (reportedPlaying === playing) return;
      reportedPlaying = playing;
      playbackStateChangeRef.current?.(playing);
    };

    playbackStateChangeRef.current?.(false);

    if (!url) {
      setStatus("idle");
      setError(null);
      return;
    }

    const isSnapshotFeed = url.includes("snapshot") || url.includes("relay") || /\.(jpe?g|png|webp)($|\?)/i.test(url);
    if (isSnapshotFeed) {
      setStatus("loading");
      setError(null);
      const refreshTimer = setInterval(() => {
        if (!disposed) setRetryNonce((value) => value + 1);
      }, 2_500);
      return () => {
        disposed = true;
        clearInterval(refreshTimer);
        playbackStateChangeRef.current?.(false);
      };
    }

    const video = videoRef.current;
    if (!video) return;

    const setPlayerError = (reason: string) => {
      if (disposed) return;
      if (hls) {
        hls.destroy();
        hls = null;
      }
      setError(reason);
      setStatus("error");
      reportPlaying(false);
      playbackErrorRef.current?.(reason);
    };

    const markProgress = () => {
      if (disposed) return;
      playbackStarted = true;
      lastProgressAt = Date.now();
      recoveryAttempts = 0;
      setError(null);
      setStatus("live");
      reportPlaying(true);
    };

    const recover = (reason: string) => {
      if (disposed || recoveryTimer) return;
      if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
        setPlayerError(reason);
        return;
      }

      recoveryAttempts += 1;
      setStatus("reconnecting");
      reportPlaying(false);
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
          // The public feed crosses a tunnel; a normal buffered HLS window
          // avoids LL-HLS partial-playlist stalls on that path.
          lowLatencyMode: false,
          backBufferLength: 10,
          maxBufferLength: 20,
          maxMaxBufferLength: 30,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 8,
          maxLiveSyncPlaybackRate: 1.25,
          fragLoadingTimeOut: 10_000,
          fragLoadingMaxRetry: 2,
          manifestLoadingTimeOut: 10_000,
          manifestLoadingMaxRetry: 3,
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
          if (!data.fatal) {
            // Non-fatal error: If a segment 404s/slid past buffer, catch up to live edge
            if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR && (data.response?.code === 404 || data.response?.code === 0)) {
              hls?.startLoad(-1);
            }
            return;
          }

          // Fatal network error (e.g. fragment 404 after max retries):
          // Official Hls.js pattern: call startLoad(-1) to refresh playlist and skip past the missing segment to live edge
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR || data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR) {
              if (recoveryAttempts < MAX_RECOVERY_ATTEMPTS) {
                recoveryAttempts += 1;
                lastProgressAt = Date.now();
                hls?.startLoad(-1);
                return;
              }
            }
          }

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
      reportPlaying(false);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [bearerToken, retryNonce, url]);

  const retry = () => {
    setError(null);
    setStatus("loading");
    setRetryNonce((value) => value + 1);
  };

  const isSnapshotFeed = Boolean(url && (url.includes("snapshot") || url.includes("relay") || /\.(jpe?g|png|webp)($|\?)/i.test(url)));

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      {isSnapshotFeed ? (
        <img
          src={snapshotSource(url, bearerToken, retryNonce)}
          alt={`Live video from ${cameraName}`}
          className={`live-video absolute inset-0 z-10 h-full w-full object-cover transition-opacity duration-300 ${status === "live" ? "opacity-100" : "opacity-0"}`}
          onLoad={() => {
            setStatus("live");
            setError(null);
            playbackStateChangeRef.current?.(true);
          }}
          onError={() => {
            const reason = "Camera frame is unavailable";
            setStatus("error");
            setError(reason);
            playbackStateChangeRef.current?.(false);
            playbackErrorRef.current?.(reason);
          }}
        />
      ) : (
        <video
          ref={videoRef}
          className={`live-video absolute inset-0 z-10 h-full w-full object-cover transition-opacity duration-300 ${status === "live" ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          aria-label={`Live video from ${cameraName}`}
          muted={muted}
          playsInline
          autoPlay
        />
      )}

      {status === "live" ? (
        <div className="absolute left-2 top-2 z-20 flex items-center gap-1.5 rounded bg-black/80 backdrop-blur-sm px-2 py-1 text-[10px] font-mono text-emerald-300 border border-emerald-500/30 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE HLS
        </div>
      ) : (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
          {status === "loading" && (
            <div className="flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 text-[9px] font-mono text-cyan-300 border border-cyan-500/30 backdrop-blur">
              <Loader2 className="animate-spin text-cyan-400" size={11} />
              <span>CONNECTING STREAM…</span>
            </div>
          )}
          {(status === "error" || status === "reconnecting") && (
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-1 rounded bg-black/70 hover:bg-black/90 px-2 py-1 text-[9px] font-mono text-slate-300 hover:text-white border border-slate-700 backdrop-blur transition-colors"
              title="Click to retry edge stream"
            >
              <RotateCw size={10} className={status === "reconnecting" ? "animate-spin" : ""} />
              <span>RETRY HLS</span>
            </button>
          )}
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

function snapshotSource(value: string, bearerToken: string, retryNonce: number) {
  try {
    const base = typeof window === "undefined" ? "http://localhost" : window.location.origin;
    const url = new URL(value, base);
    url.searchParams.set("_t", String(retryNonce));
    if (bearerToken && url.origin !== new URL(base).origin) {
      url.searchParams.set("token", bearerToken);
    }
    return url.toString();
  } catch {
    return value;
  }
}
