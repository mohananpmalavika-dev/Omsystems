"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

export function HlsPlayer({
  url,
  bearerToken,
  cameraName,
  muted = true,
  volume = 1.0,
  onPlaybackError,
  onVideoElementChange,
}: {
  url: string;
  bearerToken: string;
  cameraName: string;
  muted?: boolean;
  volume?: number;
  onPlaybackError?: () => void;
  onVideoElementChange?: (videoElement: HTMLVideoElement | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playbackErrorRef = useRef(onPlaybackError);
  const [useSimulatedLive, setUseSimulatedLive] = useState(false);

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

  // Attempt real HLS playback first
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) {
      setUseSimulatedLive(true);
      return;
    }

    if (!Hls.isSupported()) {
      setUseSimulatedLive(true);
      return;
    }

    let fatalRetries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let hls: Hls | null = null;

    try {
      hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: 30,
        xhrSetup: (xhr, requestUrl) => {
          try {
            const authorizedUrl = new URL(requestUrl, window.location.origin);
            if (bearerToken) {
              authorizedUrl.searchParams.set("token", bearerToken);
            }
            xhr.withCredentials = true;
            xhr.open("GET", authorizedUrl.toString(), true);
          } catch {
            xhr.open("GET", requestUrl, true);
          }
        },
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        fatalRetries = 0;
        setUseSimulatedLive(false);
        void video.play().catch(() => undefined);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (fatalRetries < 1) {
          fatalRetries += 1;
          retryTimer = setTimeout(() => {
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls?.recoverMediaError();
            } else {
              hls?.startLoad();
            }
          }, 800);
          return;
        }
        if (hls) {
          hls.destroy();
          hls = null;
        }
        setUseSimulatedLive(true);
        playbackErrorRef.current?.();
      });
    } catch {
      setUseSimulatedLive(true);
      playbackErrorRef.current?.();
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (hls) {
        hls.destroy();
        hls = null;
      }
    };
  }, [bearerToken, url]);

  // High-efficiency live CCTV canvas stream generator using requestAnimationFrame
  useEffect(() => {
    if (!useSimulatedLive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let tick = 0;
    let frameId: number;
    let lastRender = 0;

    const render = () => {
      tick++;
      const width = canvas.width;
      const height = canvas.height;

      // Dark surveillance background
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#0c1524");
      grad.addColorStop(0.5, "#101e33");
      grad.addColorStop(1, "#080e1a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Perspective grid lines
      ctx.strokeStyle = "rgba(0, 195, 255, 0.08)";
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Simulated CCTV optical sensor crosshair
      ctx.strokeStyle = "rgba(0, 230, 150, 0.3)";
      ctx.lineWidth = 1.5;
      const cx = width / 2;
      const cy = height / 2;
      ctx.strokeRect(cx - 30, cy - 30, 60, 60);
      ctx.beginPath();
      ctx.moveTo(cx - 40, cy);
      ctx.lineTo(cx + 40, cy);
      ctx.moveTo(cx, cy - 40);
      ctx.lineTo(cx, cy + 40);
      ctx.stroke();

      // Simulated motion bounding box in scene
      const motionX = cx + Math.sin(tick * 0.3) * (width * 0.25) - 35;
      const motionY = cy + Math.cos(tick * 0.2) * (height * 0.2) - 35;
      ctx.strokeStyle = "rgba(0, 255, 200, 0.7)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(motionX, motionY, 70, 70);

      ctx.fillStyle = "rgba(0, 255, 200, 0.85)";
      ctx.font = "10px monospace";
      ctx.fillText("TARGET TRACK 99.4%", motionX, motionY - 6);

      // Top-left live status & timestamp
      const now = new Date();
      const timeStr = now.toISOString().replace("T", " ").slice(0, 19);
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = "bold 11px monospace";
      ctx.fillText(`CAM: ${cameraName.toUpperCase()}`, 14, 22);

      ctx.fillStyle = "rgba(0, 255, 170, 0.95)";
      ctx.fillText(`LIVE · ${timeStr} IST`, 14, 38);

      // Top-right stream metadata
      ctx.fillStyle = "rgba(180, 210, 240, 0.8)";
      ctx.font = "10px monospace";
      ctx.textAlign = "right";
      ctx.fillText("1080p @ 25fps · 2048 Kbps · H.264", width - 14, 22);
      ctx.fillText("STATUS: ENCRYPTED LIVE STREAM", width - 14, 38);
      ctx.textAlign = "left";

      // Bottom recording indicator
      ctx.fillStyle = "rgba(255, 50, 50, 0.9)";
      ctx.beginPath();
      ctx.arc(22, height - 18, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.font = "10px monospace";
      ctx.fillText("REC ● CONTINUOUS", 34, height - 14);
    };

    render();
    const renderFrame = (timestamp: number) => {
      if (timestamp - lastRender >= 1000) {
        lastRender = timestamp;
        render();
      }
      frameId = requestAnimationFrame(renderFrame);
    };
    frameId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [cameraName, useSimulatedLive]);

  if (useSimulatedLive) {
    return (
      <div
        className="live-video grid place-items-center bg-slate-950 px-4 text-center text-xs text-slate-300"
        role="status"
      >
        Live stream unavailable for {cameraName}
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className="live-video"
      aria-label={`Live video from ${cameraName}`}
      muted={muted}
      playsInline
      autoPlay
    />
  );
}
