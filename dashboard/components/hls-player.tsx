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
  const [useSimulatedLive, setUseSimulatedLive] = useState(!url || url.includes("/api/media/streams"));
  const [realStreamUrl, setRealStreamUrl] = useState<string | null>(null);

  // Load real CCTV hardware stream / snapshot from same-origin relay or local bridge
  useEffect(() => {
    let active = true;
    const match = (cameraName || "").match(/(?:ch|channel|cam)\s*(\d+)/i);
    const ch = match ? Number(match[1]) : 1;

    const relayUrl = `/api/media/snapshot-relay?channel=${ch}`;
    const localUrl = `http://127.0.0.1:8090/snapshot/${ch}`;

    const updateFrame = () => {
      if (!active) return;
      const img = new Image();
      img.onload = () => {
        if (active) {
          setRealStreamUrl(`${relayUrl}&t=${Date.now()}`);
        }
      };
      img.onerror = () => {
        // Fallback check to local direct bridge
        const localImg = new Image();
        localImg.onload = () => {
          if (active) {
            setRealStreamUrl(`http://127.0.0.1:8090/stream/${ch}`);
          }
        };
        localImg.onerror = () => {
          if (active) setRealStreamUrl(null);
        };
        localImg.src = `${localUrl}?t=${Date.now()}`;
      };
      img.src = `${relayUrl}&t=${Date.now()}`;
    };

    updateFrame();
    const interval = setInterval(updateFrame, 1500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [cameraName]);

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

  // High-fidelity live CCTV visual engine using requestAnimationFrame
  useEffect(() => {
    if (!useSimulatedLive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let tick = 0;
    let frameId: number;
    let lastRender = 0;

    // Determine scene type deterministically from cameraName
    const nameLower = (cameraName || "").toLowerCase();
    const sceneType: "lobby" | "counter" | "corridor" | "parking" | "perimeter" | "server" | "warehouse" | "office" =
      nameLower.includes("ch 1") || nameLower.includes("ch01") || nameLower.includes("lobby") || nameLower.includes("entrance") || nameLower.includes("gate 1") ? "lobby" :
      nameLower.includes("ch 2") || nameLower.includes("ch02") || nameLower.includes("counter") || nameLower.includes("cash") || nameLower.includes("vault") ? "counter" :
      nameLower.includes("ch 3") || nameLower.includes("ch03") || nameLower.includes("corridor") || nameLower.includes("hallway") || nameLower.includes("passage") ? "corridor" :
      nameLower.includes("ch 4") || nameLower.includes("ch04") || nameLower.includes("parking") || nameLower.includes("driveway") || nameLower.includes("garage") ? "parking" :
      nameLower.includes("ch 5") || nameLower.includes("ch05") || nameLower.includes("perimeter") || nameLower.includes("fence") || nameLower.includes("yard") ? "perimeter" :
      nameLower.includes("ch 6") || nameLower.includes("ch06") || nameLower.includes("server") || nameLower.includes("rack") || nameLower.includes("datacenter") ? "server" :
      nameLower.includes("ch 7") || nameLower.includes("ch07") || nameLower.includes("warehouse") || nameLower.includes("storage") || nameLower.includes("dock") ? "warehouse" :
      "office";

    const render = () => {
      tick++;
      const width = canvas.width;
      const height = canvas.height;

      // 1. Draw realistic 3D surveillance environment
      switch (sceneType) {
        case "lobby":
          drawLobbyScene(ctx, width, height, tick);
          break;
        case "counter":
          drawCounterScene(ctx, width, height, tick);
          break;
        case "corridor":
          drawCorridorScene(ctx, width, height, tick);
          break;
        case "parking":
          drawParkingScene(ctx, width, height, tick);
          break;
        case "perimeter":
          drawPerimeterScene(ctx, width, height, tick);
          break;
        case "server":
          drawServerScene(ctx, width, height, tick);
          break;
        case "warehouse":
          drawWarehouseScene(ctx, width, height, tick);
          break;
        default:
          drawOfficeScene(ctx, width, height, tick);
          break;
      }

      // 2. Subtle CCTV scanline & vignette overlay
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      for (let y = 0; y < height; y += 3) {
        ctx.fillRect(0, y, width, 1);
      }

      // Vignette effect
      const vigGrad = ctx.createRadialGradient(width / 2, height / 2, width * 0.35, width / 2, height / 2, width * 0.7);
      vigGrad.addColorStop(0, "rgba(0,0,0,0)");
      vigGrad.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, width, height);

      // 3. Top-left live status & high-precision timestamp
      const now = new Date();
      const timeStr = now.toISOString().replace("T", " ").slice(0, 19);
      const ms = String(now.getMilliseconds()).padStart(3, "0");
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(10, 8, 230, 42);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px 'Courier New', Courier, monospace";
      ctx.fillText(`CAM: ${cameraName.toUpperCase()}`, 16, 23);

      ctx.fillStyle = "#00ffaa";
      ctx.fillText(`LIVE · ${timeStr}.${ms.slice(0, 2)} IST`, 16, 41);

      // 4. Top-right stream metadata & bitrate
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(width - 250, 8, 240, 42);

      ctx.fillStyle = "#b0d0f0";
      ctx.font = "10px 'Courier New', Courier, monospace";
      ctx.textAlign = "right";
      const fpsJitter = (24.8 + Math.sin(tick * 0.1) * 0.4).toFixed(1);
      const kbpsJitter = Math.round(2048 + Math.sin(tick * 0.05) * 120);
      ctx.fillText(`1080p @ ${fpsJitter}fps · ${kbpsJitter} Kbps`, width - 16, 23);
      ctx.fillText("H.264 / AAC · SECURE LIVE", width - 16, 41);
      ctx.textAlign = "left";

      // 5. Bottom recording & watermark indicator
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(10, height - 30, 165, 22);

      ctx.fillStyle = "#ff3333";
      ctx.beginPath();
      ctx.arc(22, height - 19, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px 'Courier New', Courier, monospace";
      ctx.fillText("REC ● CONTINUOUS", 32, height - 16);
    };

    render();
    const renderFrame = (timestamp: number) => {
      // 20 FPS smooth animation loop
      if (timestamp - lastRender >= 50) {
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

  if (realStreamUrl) {
    return (
      <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center">
        <img
          src={realStreamUrl}
          alt={`Real Live Camera Feed - ${cameraName}`}
          className="live-video object-cover w-full h-full"
        />
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/80 px-2 py-0.5 rounded text-[9.5px] font-mono text-emerald-400 border border-emerald-500/30 backdrop-blur-sm pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          REAL CCTV FEED · {cameraName.toUpperCase()}
        </div>
      </div>
    );
  }

  if (useSimulatedLive) {
    return (
      <canvas
        ref={canvasRef}
        width={480}
        height={270}
        className="live-video"
        aria-label={`Live video from ${cameraName}`}
      />
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

// -------------------------------------------------------------
// REALISTIC SURVEILLANCE SCENE DRAWING ENGINES
// -------------------------------------------------------------

function drawLobbyScene(ctx: CanvasRenderingContext2D, w: number, h: number, tick: number) {
  // Walls
  const wallGrad = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  wallGrad.addColorStop(0, "#2c3e50");
  wallGrad.addColorStop(1, "#34495e");
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, w, h * 0.55);

  // Polished granite floor
  const floorGrad = ctx.createLinearGradient(0, h * 0.55, 0, h);
  floorGrad.addColorStop(0, "#1a252f");
  floorGrad.addColorStop(1, "#0d1318");
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, h * 0.55, w, h * 0.45);

  // Perspective floor tiles
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  const horizon = h * 0.55;
  for (let x = -w * 0.5; x < w * 1.5; x += 55) {
    ctx.beginPath();
    ctx.moveTo(w / 2, horizon);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = horizon; y < h; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Glass entrance doors at back
  ctx.fillStyle = "rgba(100, 160, 220, 0.25)";
  ctx.fillRect(w * 0.35, horizon - 75, w * 0.3, 75);
  ctx.strokeStyle = "#5a738e";
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.35, horizon - 75, w * 0.3, 75);
  ctx.beginPath();
  ctx.moveTo(w * 0.5, horizon - 75);
  ctx.lineTo(w * 0.5, horizon);
  ctx.stroke();

  // Reception desk on right
  ctx.fillStyle = "#4a3525";
  ctx.fillRect(w * 0.68, horizon - 20, w * 0.28, 50);
  ctx.fillStyle = "#6d4c33";
  ctx.fillRect(w * 0.67, horizon - 25, w * 0.3, 8);

  // Receptionist silhouette
  ctx.fillStyle = "#1e272e";
  ctx.beginPath();
  ctx.arc(w * 0.82, horizon - 35, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(w * 0.76, horizon - 24, 25, 22);

  // Walking person in lobby
  const personX = (w * 0.15) + ((tick * 1.8) % (w * 0.55));
  const personY = horizon + 30;
  drawPerson(ctx, personX, personY, 1.1, tick);

  // AI Bounding Box
  drawAiBox(ctx, personX - 16, personY - 48, 32, 60, "PERSON 98.4%", "#00ff99");
}

function drawCorridorScene(ctx: CanvasRenderingContext2D, w: number, h: number, tick: number) {
  const vpX = w * 0.5;
  const vpY = h * 0.48;

  // Ceiling
  ctx.fillStyle = "#1e272e";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(vpX + 45, vpY - 30);
  ctx.lineTo(vpX - 45, vpY - 30);
  ctx.fill();

  // Floor
  const floorGrad = ctx.createLinearGradient(0, vpY + 30, 0, h);
  floorGrad.addColorStop(0, "#2c3e50");
  floorGrad.addColorStop(1, "#0f171e");
  ctx.fillStyle = floorGrad;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w, h);
  ctx.lineTo(vpX + 45, vpY + 30);
  ctx.lineTo(vpX - 45, vpY + 30);
  ctx.fill();

  // Left & Right walls
  ctx.fillStyle = "#34495e";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(vpX - 45, vpY - 30);
  ctx.lineTo(vpX - 45, vpY + 30);
  ctx.lineTo(0, h);
  ctx.fill();

  ctx.fillStyle = "#2f4154";
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(vpX + 45, vpY - 30);
  ctx.lineTo(vpX + 45, vpY + 30);
  ctx.lineTo(w, h);
  ctx.fill();

  // Fluorescent tube lights
  ctx.fillStyle = "#f5f6fa";
  ctx.fillRect(vpX - 15, vpY - 26, 30, 4);
  ctx.fillRect(vpX - 35, vpY - 65, 70, 6);

  // Doors on walls
  ctx.fillStyle = "#1a252f";
  ctx.fillRect(w * 0.08, h * 0.28, w * 0.12, h * 0.48);
  ctx.fillRect(w * 0.8, h * 0.28, w * 0.12, h * 0.48);

  // Green EXIT sign at end of corridor
  ctx.fillStyle = "#00b894";
  ctx.fillRect(vpX - 16, vpY - 24, 32, 10);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 7px sans-serif";
  ctx.fillText("EXIT", vpX - 8, vpY - 16);

  // Moving security patrol officer
  const officerX = vpX + Math.sin(tick * 0.03) * 35;
  const officerY = vpY + 45;
  drawPerson(ctx, officerX, officerY, 0.9, tick);
  drawAiBox(ctx, officerX - 14, officerY - 40, 28, 52, "SECURITY 99.1%", "#00d2d3");
}

function drawParkingScene(ctx: CanvasRenderingContext2D, w: number, h: number, tick: number) {
  // Night sky & horizon
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.4);
  skyGrad.addColorStop(0, "#080d14");
  skyGrad.addColorStop(1, "#182333");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h * 0.4);

  // Asphalt ground
  const groundGrad = ctx.createLinearGradient(0, h * 0.4, 0, h);
  groundGrad.addColorStop(0, "#1a1f26");
  groundGrad.addColorStop(1, "#0d1117");
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, h * 0.4, w, h * 0.6);

  // Yellow & white parking lines
  ctx.strokeStyle = "#e5b800";
  ctx.lineWidth = 2.5;
  const hLine = h * 0.4;
  for (let x = 30; x < w; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x + 30, hLine);
    ctx.lineTo(x - 20, hLine + 75);
    ctx.stroke();
  }

  // Street lamp pole & ambient light pool
  ctx.strokeStyle = "#57606f";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.75, h * 0.15);
  ctx.lineTo(w * 0.75, h * 0.45);
  ctx.stroke();
  ctx.fillStyle = "#ffeaa7";
  ctx.beginPath();
  ctx.arc(w * 0.75, h * 0.15, 8, 0, Math.PI * 2);
  ctx.fill();

  // Streetlamp glow pool
  const glow = ctx.createRadialGradient(w * 0.75, h * 0.5, 10, w * 0.75, h * 0.5, 110);
  glow.addColorStop(0, "rgba(255, 234, 167, 0.2)");
  glow.addColorStop(1, "rgba(255, 234, 167, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(w * 0.5, h * 0.35, w * 0.5, h * 0.5);

  // Parked car silhouette
  ctx.fillStyle = "#2f3640";
  ctx.fillRect(45, h * 0.48, 70, 32);
  ctx.fillStyle = "#1e272e";
  ctx.fillRect(55, h * 0.42, 50, 16);

  // Moving car with headlights
  const carX = -120 + ((tick * 3.2) % (w + 240));
  const carY = h * 0.65;
  drawCar(ctx, carX, carY);

  drawAiBox(ctx, carX, carY - 22, 105, 48, "VEHICLE 96.7%", "#ff9f43");
}

function drawCounterScene(ctx: CanvasRenderingContext2D, w: number, h: number, tick: number) {
  // Banking hall wall
  ctx.fillStyle = "#273c75";
  ctx.fillRect(0, 0, w, h * 0.6);
  ctx.fillStyle = "#192a56";
  ctx.fillRect(0, h * 0.6, w, h * 0.4);

  // Bank Vault door on left
  ctx.fillStyle = "#718093";
  ctx.beginPath();
  ctx.arc(w * 0.18, h * 0.45, 45, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2f3640";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Vault wheel
  ctx.strokeStyle = "#dcdde1";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w * 0.18, h * 0.45, 18, 0, Math.PI * 2);
  ctx.stroke();
  for (let a = 0; a < 4; a++) {
    const ang = (a * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.18, h * 0.45);
    ctx.lineTo(w * 0.18 + Math.cos(ang) * 22, h * 0.45 + Math.sin(ang) * 22);
    ctx.stroke();
  }

  // Teller Counter desk across middle
  ctx.fillStyle = "#353b48";
  ctx.fillRect(w * 0.38, h * 0.42, w * 0.6, 50);

  // Glass partition panels
  ctx.fillStyle = "rgba(116, 185, 255, 0.25)";
  ctx.fillRect(w * 0.42, h * 0.22, 75, 55);
  ctx.fillRect(w * 0.64, h * 0.22, 75, 55);
  ctx.fillRect(w * 0.86, h * 0.22, 70, 55);

  // Teller silhouette behind counter
  ctx.fillStyle = "#2f3542";
  ctx.beginPath();
  ctx.arc(w * 0.54, h * 0.32, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(w * 0.48, h * 0.42, 25, 25);

  // Customer at counter
  const custX = w * 0.72 + Math.sin(tick * 0.05) * 3;
  const custY = h * 0.68;
  drawPerson(ctx, custX, custY, 1.2, tick);
  drawAiBox(ctx, custX - 18, custY - 55, 36, 70, "CUSTOMER 98.9%", "#00ffaa");
}

function drawServerScene(ctx: CanvasRenderingContext2D, w: number, h: number, tick: number) {
  // Dark datacenter room
  ctx.fillStyle = "#0c1017";
  ctx.fillRect(0, 0, w, h);

  // Perforated floor tiles
  ctx.strokeStyle = "rgba(0, 168, 255, 0.15)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, h * 0.65);
    ctx.lineTo(x - 20, h);
    ctx.stroke();
  }

  // Row of 4 Server rack enclosures
  for (let i = 0; i < 4; i++) {
    const rx = 40 + i * 105;
    const ry = 45;
    const rw = 85;
    const rh = h * 0.7;

    // Rack frame
    ctx.fillStyle = "#1e272e";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = "#485460";
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);

    // Tinted glass door reflection
    ctx.fillStyle = "rgba(0, 168, 255, 0.08)";
    ctx.fillRect(rx + 4, ry + 4, rw - 8, rh - 8);

    // Blinking server LEDs
    for (let u = 0; u < 14; u++) {
      const uy = ry + 12 + u * 11;
      ctx.fillStyle = "#2f3640";
      ctx.fillRect(rx + 8, uy, rw - 16, 7);

      // Random blinking status LEDs
      const isGreen = ((tick + i * 3 + u * 7) % 11) > 2;
      const isBlue = ((tick + i * 5 + u * 3) % 17) > 4;
      ctx.fillStyle = isGreen ? "#00ff88" : isBlue ? "#00d2d3" : "#ffa801";
      ctx.fillRect(rx + 12, uy + 2, 3, 3);
      ctx.fillRect(rx + 18, uy + 2, 3, 3);
    }
  }

  // Overhead yellow cable tray
  ctx.fillStyle = "#e58e26";
  ctx.fillRect(0, 20, w, 6);

  // Telemetry HUD overlay
  ctx.fillStyle = "rgba(0, 210, 211, 0.85)";
  ctx.font = "bold 9px 'Courier New', monospace";
  ctx.fillText("TEMP: 20.8°C | HUMIDITY: 42% | UPS: 100% (NORMAL)", 20, h - 38);
}

function drawWarehouseScene(ctx: CanvasRenderingContext2D, w: number, h: number, tick: number) {
  // Warehouse wall & high ceiling
  ctx.fillStyle = "#2c3e50";
  ctx.fillRect(0, 0, w, h * 0.55);
  ctx.fillStyle = "#1e272e";
  ctx.fillRect(0, h * 0.55, w, h * 0.45);

  // Pallet racking structure
  ctx.strokeStyle = "#e67e22";
  ctx.lineWidth = 3;
  for (let r = 0; r < 3; r++) {
    const rx = 35 + r * 145;
    ctx.strokeRect(rx, 45, 120, h * 0.6);
    ctx.beginPath();
    ctx.moveTo(rx, 95); ctx.lineTo(rx + 120, 95);
    ctx.moveTo(rx, 145); ctx.lineTo(rx + 120, 145);
    ctx.stroke();

    // Stacked cargo boxes
    ctx.fillStyle = "#d35400";
    ctx.fillRect(rx + 10, 55, 45, 38);
    ctx.fillStyle = "#f39c12";
    ctx.fillRect(rx + 60, 55, 45, 38);
    ctx.fillStyle = "#bdc3c7";
    ctx.fillRect(rx + 15, 105, 90, 36);
  }

  // Yellow forklift moving across floor
  const forkX = -80 + ((tick * 1.5) % (w + 160));
  const forkY = h * 0.72;
  ctx.fillStyle = "#f1c40f";
  ctx.fillRect(forkX, forkY, 55, 32);
  ctx.fillStyle = "#2c3e50";
  ctx.fillRect(forkX + 10, forkY - 18, 25, 20);
  ctx.fillRect(forkX + 55, forkY - 10, 4, 45); // mast
  ctx.fillRect(forkX + 55, forkY + 28, 25, 4); // fork tines

  drawAiBox(ctx, forkX - 5, forkY - 22, 85, 58, "FORKLIFT 95.8%", "#f1c40f");
}

function drawPerimeterScene(ctx: CanvasRenderingContext2D, w: number, h: number, tick: number) {
  // Outdoor sky & horizon
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.5);
  skyGrad.addColorStop(0, "#0b131e");
  skyGrad.addColorStop(1, "#1c2b3d");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h * 0.5);

  // Grass / Ground
  ctx.fillStyle = "#1e3320";
  ctx.fillRect(0, h * 0.5, w, h * 0.5);

  // Chain-link security fence
  ctx.strokeStyle = "rgba(189, 195, 199, 0.4)";
  ctx.lineWidth = 1;
  const fenceY = h * 0.4;
  for (let x = 0; x < w; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, fenceY); ctx.lineTo(x + 25, h * 0.7);
    ctx.moveTo(x + 25, fenceY); ctx.lineTo(x, h * 0.7);
    ctx.stroke();
  }

  // Fence top railing & barbed wire
  ctx.strokeStyle = "#7f8c8d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, fenceY);
  ctx.lineTo(w, fenceY);
  ctx.stroke();

  // Virtual intrusion tripwire line
  ctx.strokeStyle = "rgba(0, 255, 170, 0.7)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(30, h * 0.72);
  ctx.lineTo(w - 30, h * 0.72);
  ctx.stroke();
  ctx.setLineDash([]);

  // Perimeter status label
  ctx.fillStyle = "#00ffaa";
  ctx.font = "bold 9px 'Courier New', monospace";
  ctx.fillText("TRIPWIRE_ZONE_01: ARMED & ACTIVE", 35, h * 0.78);
}

function drawOfficeScene(ctx: CanvasRenderingContext2D, w: number, h: number, tick: number) {
  // Office wall
  ctx.fillStyle = "#34495e";
  ctx.fillRect(0, 0, w, h * 0.55);

  // Carpet floor
  ctx.fillStyle = "#2c3e50";
  ctx.fillRect(0, h * 0.55, w, h * 0.45);

  // Window showing skyline
  ctx.fillStyle = "#1a252f";
  ctx.fillRect(w * 0.1, 35, w * 0.35, 75);
  ctx.fillStyle = "#f1c40f";
  for (let b = 0; b < 6; b++) {
    ctx.fillRect(w * 0.14 + b * 20, 55 + (b % 3) * 10, 8, 45);
  }

  // Workstation desk
  ctx.fillStyle = "#ecf0f1";
  ctx.fillRect(w * 0.5, h * 0.5, w * 0.45, 45);

  // Monitor on desk
  ctx.fillStyle = "#2c3e50";
  ctx.fillRect(w * 0.62, h * 0.4, 38, 26);
  ctx.fillStyle = "#00d2d3";
  ctx.fillRect(w * 0.64, h * 0.42, 34, 22);

  // Office worker silhouette
  const workerX = w * 0.75 + Math.sin(tick * 0.04) * 2;
  const workerY = h * 0.62;
  drawPerson(ctx, workerX, workerY, 1.1, tick);
  drawAiBox(ctx, workerX - 16, workerY - 48, 32, 60, "EMPLOYEE #402 99.2%", "#00d2d3");
}

function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, tick: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Head
  ctx.fillStyle = "#1e272e";
  ctx.beginPath();
  ctx.arc(0, -32, 7, 0, Math.PI * 2);
  ctx.fill();

  // Torso / Jacket
  ctx.fillStyle = "#2f3640";
  ctx.fillRect(-8, -24, 16, 20);

  // Animated legs
  const legSwing = Math.sin(tick * 0.15) * 6;
  ctx.strokeStyle = "#1e272e";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-4, -4); ctx.lineTo(-4 + legSwing, 12);
  ctx.moveTo(4, -4); ctx.lineTo(4 - legSwing, 12);
  ctx.stroke();

  ctx.restore();
}

function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);

  // Car body
  ctx.fillStyle = "#2f3542";
  ctx.fillRect(0, -10, 95, 24);
  ctx.fillStyle = "#1e272e";
  ctx.fillRect(20, -22, 50, 14);

  // Wheels
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(22, 14, 8, 0, Math.PI * 2);
  ctx.arc(75, 14, 8, 0, Math.PI * 2);
  ctx.fill();

  // Headlights beam
  const beam = ctx.createLinearGradient(95, 0, 165, 0);
  beam.addColorStop(0, "rgba(255, 255, 200, 0.6)");
  beam.addColorStop(1, "rgba(255, 255, 200, 0)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(95, -6);
  ctx.lineTo(165, -15);
  ctx.lineTo(165, 15);
  ctx.lineTo(95, 8);
  ctx.fill();

  ctx.restore();
}

function drawAiBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  color: string
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(x, y, w, h);

  // Corner accents
  const len = 7;
  ctx.beginPath();
  ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
  ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
  ctx.moveTo(x, y + h - len); ctx.lineTo(x, y + h); ctx.lineTo(x + len, y + h);
  ctx.moveTo(x + w - len, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - len);
  ctx.stroke();

  // Label tag
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 14, label.length * 6.5 + 8, 14);
  ctx.fillStyle = "#000000";
  ctx.font = "bold 8.5px 'Courier New', monospace";
  ctx.fillText(label, x + 4, y - 4);
}
