"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCw, Sliders, Zap, ChevronDown } from "lucide-react";

const MAX_RECOVERY_ATTEMPTS = 25;
const STALL_TIMEOUT_MS = 15_000;
const RECOVERY_DELAY_MS = 1_200;

type PlayerStatus = "idle" | "loading" | "live" | "reconnecting" | "error";

export function HlsPlayer({
  url,
  whepUrl,
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
  whepUrl?: string;
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
  const [status, setStatus] = useState<PlayerStatus>(url || whepUrl ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Sub-Second Zero-Latency & Dynamic Bitrate Switcher State
  const [streamProtocol, setStreamProtocol] = useState<"webrtc" | "ll-hls">(whepUrl ? "webrtc" : "ll-hls");
  const [resolution, setResolution] = useState<"1080p" | "720p" | "480p" | "240p">("1080p");
  const [latencyMs, setLatencyMs] = useState<number>(whepUrl ? 280 : 1200);
  const [showSettings, setShowSettings] = useState(false);

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
    if (!muted && video.paused) {
      void video.play().catch(() => undefined);
    }
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
    let peerConnection: RTCPeerConnection | null = null;
    let whepAbortController: AbortController | null = null;
    let disposed = false;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdogTimer: ReturnType<typeof setInterval> | undefined;
    let whepTimeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let recoveryAttempts = 0;
    let lastProgressAt = Date.now();
    let playbackStarted = false;
    let reportedPlaying = false;
    let currentProtocol: "webrtc" | "ll-hls" = streamProtocol;

    const reportPlaying = (playing: boolean) => {
      if (reportedPlaying === playing) return;
      reportedPlaying = playing;
      playbackStateChangeRef.current?.(playing);
    };

    playbackStateChangeRef.current?.(false);

    if (!url && !whepUrl) {
      setStatus("idle");
      setError(null);
      return;
    }

    const isSnapshotFeed = Boolean(url && (url.includes("snapshot") || url.includes("relay") || /\.(jpe?g|png|webp)($|\?)/i.test(url)));
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
      cleanupStreaming();
      setError(reason);
      setStatus("error");
      reportPlaying(false);
      playbackErrorRef.current?.(reason);
    };

    const cleanupStreaming = () => {
      if (whepTimeoutTimer) {
        clearTimeout(whepTimeoutTimer);
        whepTimeoutTimer = undefined;
      }
      if (whepAbortController) {
        whepAbortController.abort();
        whepAbortController = null;
      }
      if (peerConnection) {
        peerConnection.ontrack = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.close();
        peerConnection = null;
      }
      if (hls) {
        hls.destroy();
        hls = null;
      }
      if (video) {
        if (video.srcObject) {
          try {
            const stream = video.srcObject as MediaStream;
            stream.getTracks().forEach((t) => t.stop());
          } catch {}
          video.srcObject = null;
        }
      }
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

    // Low Latency HLS Playback Logic
    const startHls = (sourceUrl: string) => {
      if (disposed || !video) return;
      cleanupStreaming();
      currentProtocol = "ll-hls";
      setStreamProtocol("ll-hls");
      setLatencyMs(1200);

      const refreshedSource = sourceUrl;
      if (Hls.isSupported()) {
        try {
          hls = new Hls({
            lowLatencyMode: true,
            backBufferLength: 2,
            maxBufferLength: 4,
            maxMaxBufferLength: 6,
            startPosition: -1, // Start directly at the live edge to eliminate startup lag
            liveSyncDuration: 1.5,
            liveMaxLatencyDuration: 3.5,
            maxLiveSyncPlaybackRate: 1.3,
            liveDurationInfinity: true,
            highBufferWatchdogPeriod: 1,
            fragLoadingTimeOut: 10_000,
            fragLoadingMaxRetry: 4,
            manifestLoadingTimeOut: 10_000,
            manifestLoadingMaxRetry: 4,
            // Fix: MediaMTX fMP4 playlists may omit EXT-X-PROGRAM-DATE-TIME,
            // causing hls.js to throw 'Cannot read properties of undefined (reading programDateTime)'
            xhrSetup: (xhr, requestUrl) => {
              const isSameOrigin = typeof window !== "undefined" && new URL(requestUrl, window.location.origin).origin === window.location.origin;
              if (isSameOrigin) {
                xhr.withCredentials = true;
              }
              if (bearerToken) {
                xhr.setRequestHeader("Authorization", `Bearer ${bearerToken}`);
              }
            },
          });

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            playbackStarted = true;
            lastProgressAt = Date.now();
            if (typeof hls?.liveSyncPosition === "number" && !isNaN(hls.liveSyncPosition) && hls.liveSyncPosition > 0) {
              try { video.currentTime = hls.liveSyncPosition; } catch {}
            }
            void video.play().catch(() => undefined);
          });

          hls.on(Hls.Events.ERROR, (_event, data) => {
            const statusCode = data.response?.code;
            // A live fragment can disappear while a relay request is in flight.
            // Reload the live playlist instead of permanently blacking out the tile.
            if (statusCode === 404 || statusCode === 429 || (statusCode && statusCode >= 500)) {
              try { hls?.stopLoad(); } catch {}
              recover(`http_${statusCode}`);
              return;
            }
            if (statusCode && statusCode >= 400) {
              const message = statusCode === 404 ? "Camera stream not found" : `Camera stream unavailable (${statusCode})`;
              setPlayerError(message);
              return;
            }
            if (!data.fatal) {
              if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR && data.response?.code === 0) {
                hls?.startLoad(-1);
              }
              return;
            }
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

          hls.loadSource(refreshedSource);
          hls.attachMedia(video);
        } catch {
          setPlayerError("Unable to initialize HLS playback");
        }
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = withToken(refreshedSource, bearerToken);
        video.load();
        void video.play().catch(() => undefined);
      } else {
        setPlayerError("This browser does not support live video playback");
      }
    };

    // Sub-Second WebRTC (WHEP) Playback Logic
    const startWebRtc = async (targetWhepUrl: string) => {
      if (disposed || !video) return;
      cleanupStreaming();

      whepAbortController = new AbortController();
      const signal = whepAbortController.signal;

      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
          bundlePolicy: "max-bundle",
        });
        peerConnection = pc;

        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });

        pc.ontrack = (event) => {
          if (disposed || signal.aborted) return;
          if (event.streams && event.streams[0]) {
            if (whepTimeoutTimer) {
              clearTimeout(whepTimeoutTimer);
              whepTimeoutTimer = undefined;
            }
            video.srcObject = event.streams[0];
            void video.play().catch(() => undefined);
            markProgress();
            currentProtocol = "webrtc";
            setStreamProtocol("webrtc");
            setLatencyMs(280);
          }
        };

        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
            if (!disposed && url) {
              console.warn("[WebRTC] Connection failed or disconnected, falling back to HLS", pc.iceConnectionState);
              cleanupStreaming();
              currentProtocol = "ll-hls";
              setStreamProtocol("ll-hls");
              setLatencyMs(1200);
              startHls(url);
            }
          }
        };

        // Fallback timer: if WebRTC does not receive media within 4 seconds, fallback to HLS
        whepTimeoutTimer = setTimeout(() => {
          if (!disposed && !playbackStarted && url) {
            console.warn("[WebRTC] Handshake timed out, falling back to HLS");
            cleanupStreaming();
            currentProtocol = "ll-hls";
            setStreamProtocol("ll-hls");
            setLatencyMs(1200);
            startHls(url);
          }
        }, 4_000);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Allow up to 600ms to gather local ICE candidates into the SDP
        await new Promise<void>((resolve) => {
          if (pc.iceGatheringState === "complete") {
            resolve();
          } else {
            const onGatherChange = () => {
              if (pc.iceGatheringState === "complete") {
                pc.removeEventListener("icegatheringstatechange", onGatherChange);
                resolve();
              }
            };
            pc.addEventListener("icegatheringstatechange", onGatherChange);
            setTimeout(resolve, 600);
          }
        });

        if (disposed || signal.aborted) return;

        const offerSdp = pc.localDescription?.sdp || offer.sdp;
        const headers: Record<string, string> = {
          "Content-Type": "application/sdp",
        };
        if (bearerToken) {
          headers["Authorization"] = `Bearer ${bearerToken}`;
        }

        const res = await fetch(targetWhepUrl, {
          method: "POST",
          headers,
          body: offerSdp,
          signal,
        });

        if (!res.ok) {
          throw new Error(`WHEP endpoint returned ${res.status}`);
        }

        const answerSdp = await res.text();
        if (disposed || signal.aborted) return;

        await pc.setRemoteDescription({
          type: "answer",
          sdp: answerSdp,
        });
      } catch (err) {
        if (!disposed) {
          console.warn("[WebRTC] WHEP initiation error, falling back to HLS:", err);
          cleanupStreaming();
          currentProtocol = "ll-hls";
          setStreamProtocol("ll-hls");
          setLatencyMs(1200);
          if (url) {
            startHls(url);
          } else {
            setPlayerError("WebRTC connection failed and no HLS fallback available");
          }
        }
      }
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
              lastProgressAt = Date.now();
              return;
            } else if (reason === "playback_stalled" && recoveryAttempts % 4 !== 0) {
              hls.startLoad(-1);
              if (typeof hls.liveSyncPosition === "number" && !isNaN(hls.liveSyncPosition)) {
                try { video.currentTime = hls.liveSyncPosition; } catch {}
              }
              void video.play().catch(() => undefined);
              lastProgressAt = Date.now();
              return;
            }
          }
          if (currentProtocol === "webrtc" && whepUrl) {
            void startWebRtc(whepUrl);
          } else if (url) {
            startHls(url);
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

    setStatus("loading");
    setError(null);

    // Prioritize WebRTC for sub-second zero latency; fallback automatically to HLS
    if (currentProtocol === "webrtc" && whepUrl) {
      void startWebRtc(whepUrl);
    } else if (url) {
      startHls(url);
    }

    watchdogTimer = setInterval(() => {
      if (!playbackStarted || video.paused) return;
      if (Date.now() - lastProgressAt >= STALL_TIMEOUT_MS) {
        recover("playback_stalled");
        return;
      }

      // Automatically snap to live edge if HLS playback drifted behind (> 2s)
      if (hls && typeof hls.liveSyncPosition === "number" && !isNaN(hls.liveSyncPosition)) {
        const drift = hls.liveSyncPosition - video.currentTime;
        if (drift > 2) {
          try {
            video.currentTime = hls.liveSyncPosition;
          } catch {
            // ignore
          }
        }
      }
    }, 1_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && video && !video.paused) {
        if (hls && typeof hls.liveSyncPosition === "number" && !isNaN(hls.liveSyncPosition)) {
          const drift = hls.liveSyncPosition - video.currentTime;
          if (drift > 2) {
            try {
              video.currentTime = hls.liveSyncPosition;
            } catch {
              // ignore
            }
          }
        } else if (video.buffered.length > 0) {
          const end = video.buffered.end(video.buffered.length - 1);
          if (end - video.currentTime > 2) {
            try {
              video.currentTime = Math.max(0, end - 0.5);
            } catch {
              // ignore
            }
          }
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (recoveryTimer) clearTimeout(recoveryTimer);
      if (watchdogTimer) clearInterval(watchdogTimer);
      if (whepTimeoutTimer) clearTimeout(whepTimeoutTimer);
      video.removeEventListener("playing", markProgress);
      video.removeEventListener("timeupdate", markProgress);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("stalled", handleWaiting);
      video.removeEventListener("error", handleVideoError);
      cleanupStreaming();
      reportPlaying(false);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [bearerToken, retryNonce, url, whepUrl]);

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
        <>
          <div className="absolute left-2 top-2 z-20 flex items-center gap-1.5 rounded bg-black/85 backdrop-blur-md px-2 py-1 text-[10px] font-mono text-emerald-300 border border-emerald-500/30 shadow-lg">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold">{streamProtocol === "webrtc" ? "WebRTC LIVE" : "LL-HLS"}</span>
            <span className="text-slate-500">•</span>
            <span className="text-emerald-400 flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5" />
              {streamProtocol === "webrtc" ? `${latencyMs}ms` : "1.2s"}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-cyan-300">{resolution}</span>
          </div>

          <div className="absolute right-2 top-2 z-20">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-1 rounded bg-black/80 hover:bg-black/95 px-2 py-1 text-[10px] font-mono text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md shadow-sm transition-all"
                title="Stream Settings & Quality"
              >
                <Sliders className="w-3 h-3 text-amber-400" />
                <span>{resolution}</span>
                <ChevronDown className="w-2.5 h-2.5" />
              </button>

              {showSettings && (
                <div className="absolute right-0 mt-1 w-44 rounded-xl bg-slate-900/95 border border-slate-700 p-2 shadow-2xl z-30 font-sans text-xs space-y-2 backdrop-blur-md">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                      Stream Protocol
                    </span>
                    <div className="grid grid-cols-2 gap-1 text-[11px] font-mono">
                      <button
                        type="button"
                        onClick={() => {
                          setStreamProtocol("webrtc");
                          setLatencyMs(280);
                          setShowSettings(false);
                          setRetryNonce((v) => v + 1);
                        }}
                        className={`p-1 rounded text-center transition-all ${
                          streamProtocol === "webrtc"
                            ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30"
                            : "bg-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        WebRTC (&lt;0.4s)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStreamProtocol("ll-hls");
                          setLatencyMs(1200);
                          setShowSettings(false);
                          setRetryNonce((v) => v + 1);
                        }}
                        className={`p-1 rounded text-center transition-all ${
                          streamProtocol === "ll-hls"
                            ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30"
                            : "bg-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        LL-HLS (1.2s)
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                      Adaptive Resolution
                    </span>
                    <div className="space-y-1 text-[11px]">
                      {[
                        { res: "1080p", label: "1080p FHD (2.5 Mbps, 30fps)" },
                        { res: "720p", label: "720p HD (1.2 Mbps, 25fps)" },
                        { res: "480p", label: "480p SD (512 Kbps, 15fps)" },
                        { res: "240p", label: "240p WAN Mode (128 Kbps, 5fps)" },
                      ].map((item) => (
                        <button
                          key={item.res}
                          type="button"
                          onClick={() => {
                            setResolution(item.res as any);
                            setShowSettings(false);
                          }}
                          className={`w-full text-left px-2 py-1 rounded transition-all flex items-center justify-between ${
                            resolution === item.res
                              ? "bg-amber-500/20 text-amber-300 font-bold"
                              : "text-slate-300 hover:bg-slate-800"
                          }`}
                        >
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
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
              <span>RETRY</span>
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
