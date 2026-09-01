"use client";

import React, { useEffect, useRef } from "react";

interface CctvVisualCanvasProps {
  cameraName: string;
  branchName?: string;
  zone?: string;
  status?: string;
  className?: string;
}

export function CctvVisualCanvas({
  cameraName,
  branchName = "Branch Main",
  zone = "MAIN AREA",
  status = "online",
  className = "",
}: CctvVisualCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let frameCount = 0;

    // Fixed deterministic pseudo-random seed based on cameraName
    const hash = cameraName.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const sceneVariant = hash % 3; // 0: Hallway/Counter, 1: Office/Branch Lobby, 2: Entrance/Road

    // Simulated moving targets (person 1, person 2)
    let p1X = 60 + (hash % 150);
    let p1Y = 110 + ((hash * 5) % 40);
    let p1SpeedX = ((hash % 3) + 1.2) * 0.4;
    let p1SpeedY = (((hash * 7) % 3) + 0.5) * 0.15;

    let p2X = 260 + ((hash * 11) % 120);
    let p2Y = 100 + ((hash * 3) % 45);
    let p2SpeedX = -(((hash % 2) + 0.8) * 0.35);

    const render = () => {
      frameCount++;
      const width = canvas.width;
      const height = canvas.height;

      // 1. CLEAR & BACKGROUND (Realistic illuminated indoor/outdoor CCTV tone)
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      if (sceneVariant === 0) {
        // Banking Hallway & Counter
        bgGrad.addColorStop(0, "#1a2c3d");
        bgGrad.addColorStop(0.45, "#253b4e");
        bgGrad.addColorStop(0.46, "#15222e");
        bgGrad.addColorStop(1, "#2a3d4f");
      } else if (sceneVariant === 1) {
        // Vault / Cash Area
        bgGrad.addColorStop(0, "#192836");
        bgGrad.addColorStop(0.48, "#203548");
        bgGrad.addColorStop(0.49, "#162533");
        bgGrad.addColorStop(1, "#2b4257");
      } else {
        // Entrance / Road View
        bgGrad.addColorStop(0, "#1c2e3d");
        bgGrad.addColorStop(0.5, "#294052");
        bgGrad.addColorStop(0.51, "#182632");
        bgGrad.addColorStop(1, "#314b60");
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. ARCHITECTURAL PERSPECTIVE (Walls, Floor Tiles, Ceiling fixtures)
      const horizonY = height * 0.48;

      // Ceiling Light Fixtures
      ctx.fillStyle = "rgba(235, 245, 255, 0.18)";
      ctx.fillRect(width * 0.2, 8, width * 0.6, 6);
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(width * 0.15, 14);
      ctx.lineTo(width * 0.85, 14);
      ctx.lineTo(width * 0.95, horizonY);
      ctx.lineTo(width * 0.05, horizonY);
      ctx.closePath();
      ctx.fill();

      // Side Walls Perspective Lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.lineWidth = 1.5;

      // Left Wall
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(width * 0.18, horizonY);
      ctx.lineTo(0, height);
      ctx.stroke();

      // Right Wall
      ctx.beginPath();
      ctx.moveTo(width, 0);
      ctx.lineTo(width * 0.82, horizonY);
      ctx.lineTo(width, height);
      ctx.stroke();

      // Counter / Entrance Door structure
      ctx.fillStyle = "rgba(20, 35, 48, 0.75)";
      ctx.fillRect(width * 0.28, horizonY * 0.45, width * 0.44, horizonY * 0.55);
      ctx.strokeStyle = "rgba(100, 160, 210, 0.35)";
      ctx.strokeRect(width * 0.28, horizonY * 0.45, width * 0.44, horizonY * 0.55);

      // Floor Grid Lines (Perspective Tiles)
      ctx.strokeStyle = "rgba(180, 220, 255, 0.15)";
      ctx.lineWidth = 1;
      for (let x = -80; x <= width + 80; x += 45) {
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(width * 0.5 + (x - width * 0.5) * 0.18, horizonY);
        ctx.stroke();
      }

      // Horizontal Floor Lines
      for (let y = horizonY + 12; y < height; y += (height - y) * 0.38 + 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 3. ANIMATED PEOPLE & DETECTIONS
      // Update Target 1 Position
      p1X += p1SpeedX;
      p1Y += p1SpeedY;
      if (p1X < 40 || p1X > width - 110) p1SpeedX *= -1;
      if (p1Y < horizonY + 10 || p1Y > height - 100) p1SpeedY *= -1;

      // Draw Target 1 (Person Silhouette)
      const p1H = 80;
      const p1W = 34;
      ctx.fillStyle = "rgba(15, 25, 35, 0.85)";
      // Head
      ctx.beginPath();
      ctx.arc(p1X + p1W / 2, p1Y - 8, 9, 0, Math.PI * 2);
      ctx.fill();
      // Body
      ctx.beginPath();
      ctx.roundRect(p1X, p1Y, p1W, p1H - 12, 6);
      ctx.fill();

      // AI Bounding Box for Person 1
      ctx.strokeStyle = "#10b981"; // Vibrant Emerald
      ctx.lineWidth = 2;
      ctx.strokeRect(p1X - 6, p1Y - 20, p1W + 12, p1H + 18);

      // Corner Accents (Target 1)
      ctx.fillStyle = "#34d399";
      const cSize = 6;
      ctx.fillRect(p1X - 7, p1Y - 21, cSize, 2.5);
      ctx.fillRect(p1X - 7, p1Y - 21, 2.5, cSize);
      ctx.fillRect(p1X + p1W + 6 - cSize, p1Y - 21, cSize, 2.5);
      ctx.fillRect(p1X + p1W + 6, p1Y - 21, 2.5, cSize);

      // AI Label (Target 1)
      ctx.fillStyle = "#10b981";
      ctx.fillRect(p1X - 6, p1Y - 34, 110, 14);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 9px monospace";
      ctx.fillText("PERSON 98% • HELMET", p1X - 3, p1Y - 23);

      // Update Target 2 Position
      p2X += p2SpeedX;
      if (p2X < 60 || p2X > width - 80) p2SpeedX *= -1;

      // Draw Target 2
      const p2H = 70;
      const p2W = 30;
      ctx.fillStyle = "rgba(18, 28, 38, 0.78)";
      ctx.beginPath();
      ctx.arc(p2X + p2W / 2, p2Y - 6, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(p2X, p2Y, p2W, p2H - 10, 5);
      ctx.fill();

      // AI Bounding Box for Person 2
      ctx.strokeStyle = "#06b6d4"; // Vibrant Cyan
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p2X - 4, p2Y - 16, p2W + 8, p2H + 14);

      ctx.fillStyle = "#06b6d4";
      ctx.fillRect(p2X - 4, p2Y - 28, 85, 12);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 8px monospace";
      ctx.fillText("PERSON 94%", p2X - 1, p2Y - 19);

      // 4. SUBTLE CCTV SCANLINE & NOISE
      const scanY = (frameCount * 2) % height;
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      ctx.fillRect(0, scanY, width, 3);

      // 5. PROFESSIONAL CCTV OSD (On-Screen Display HUD)
      // Top Left Header
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(8, 8, 220, 36);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.strokeRect(8, 8, 220, 36);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px monospace";
      ctx.fillText(cameraName.toUpperCase(), 14, 22);

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 9px monospace";
      ctx.fillText(`${branchName.toUpperCase()} • ${zone.toUpperCase()}`, 14, 36);

      // Top Right Status Header (Blinking REC & FPS)
      const blink = Math.floor(frameCount / 30) % 2 === 0;
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(width - 125, 8, 117, 24);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.strokeRect(width - 125, 8, 117, 24);

      ctx.fillStyle = blink ? "#22c55e" : "#15803d";
      ctx.beginPath();
      ctx.arc(width - 114, 20, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px monospace";
      ctx.fillText("LIVE • 25.0 FPS", width - 104, 24);

      // Bottom Bar (Security Parameters & Live IST Clock)
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(0, height - 22, width, 22);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.beginPath();
      ctx.moveTo(0, height - 22);
      ctx.lineTo(width, height - 22);
      ctx.stroke();

      ctx.fillStyle = "rgba(203, 213, 225, 0.9)";
      ctx.font = "bold 9px monospace";
      ctx.fillText("1080P HD • H.264 • 2048 KBPS • AI: ACTIVE", 10, height - 8);

      // Live IST Clock
      const now = new Date();
      const timeStr = now.toISOString().replace("T", " ").substring(0, 19) + " IST";
      ctx.fillStyle = "#facc15"; // Security Yellow
      ctx.font = "bold 10px monospace";
      ctx.fillText(timeStr, width - 180, height - 8);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [cameraName, branchName, zone, status]);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={270}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "cover",
      }}
      className={`cctv-visual-canvas ${className}`}
    />
  );
}
