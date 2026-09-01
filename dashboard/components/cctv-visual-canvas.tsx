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
  className = "w-full h-full",
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
    const baseColorShift = (hash % 40) - 20;

    // Simulated bounding box animation
    let boxX = 80 + (hash % 120);
    let boxY = 60 + ((hash * 7) % 60);
    let boxSpeedX = ((hash % 3) + 1) * 0.4;
    let boxSpeedY = (((hash * 3) % 3) + 1) * 0.3;

    const render = () => {
      frameCount++;
      const width = canvas.width;
      const height = canvas.height;

      // 1. Background gradient (realistic CCTV interior lighting)
      const grad = ctx.createLinearGradient(0, 0, width, height);
      const r = Math.max(10, 22 + baseColorShift);
      const g = Math.max(15, 30 + baseColorShift);
      const b = Math.max(20, 38 + baseColorShift);
      grad.addColorStop(0, `rgb(${r}, ${g}, ${b})`);
      grad.addColorStop(0.5, `rgb(${Math.max(8, r - 8)}, ${Math.max(10, g - 8)}, ${Math.max(12, b - 8)})`);
      grad.addColorStop(1, `rgb(${Math.max(5, r - 14)}, ${Math.max(6, g - 14)}, ${Math.max(8, b - 14)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // 2. Interior architectural perspective grid / walls
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;

      // Floor grid lines
      const floorY = height * 0.65;
      for (let i = 0; i < width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, height);
        ctx.lineTo(width * 0.5 + (i - width * 0.5) * 0.3, floorY);
        ctx.stroke();
      }

      // Ceiling line
      ctx.beginPath();
      ctx.moveTo(0, height * 0.25);
      ctx.lineTo(width, height * 0.25);
      ctx.stroke();

      // Horizon line
      ctx.beginPath();
      ctx.moveTo(0, floorY);
      ctx.lineTo(width, floorY);
      ctx.stroke();

      // 3. Subtle animated CCTV noise & scanlines
      ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
      for (let i = 0; i < 40; i++) {
        const nx = Math.random() * width;
        const ny = Math.random() * height;
        ctx.fillRect(nx, ny, 2, 2);
      }

      // Scanline sweep
      const scanlineY = (frameCount * 1.5) % height;
      ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
      ctx.fillRect(0, scanlineY, width, 4);

      // 4. Simulated AI detection bounding box (moving person/target)
      boxX += boxSpeedX;
      boxY += boxSpeedY;
      if (boxX < 40 || boxX > width - 120) boxSpeedX *= -1;
      if (boxY < 40 || boxY > height - 120) boxSpeedY *= -1;

      if (status === "online") {
        // AI detection box
        ctx.strokeStyle = "rgba(16, 185, 129, 0.75)"; // Emerald
        ctx.lineWidth = 1.5;
        const bw = 55;
        const bh = 90;
        ctx.strokeRect(boxX, boxY, bw, bh);

        // Corner accents
        ctx.fillStyle = "rgba(52, 211, 153, 0.9)";
        const cornerSize = 5;
        // Top-left
        ctx.fillRect(boxX - 1, boxY - 1, cornerSize, 2);
        ctx.fillRect(boxX - 1, boxY - 1, 2, cornerSize);
        // Top-right
        ctx.fillRect(boxX + bw - cornerSize + 1, boxY - 1, cornerSize, 2);
        ctx.fillRect(boxX + bw - 1, boxY - 1, 2, cornerSize);

        // AI Tag label
        ctx.fillStyle = "rgba(16, 185, 129, 0.9)";
        ctx.fillRect(boxX, boxY - 16, 75, 14);
        ctx.fillStyle = "#000000";
        ctx.font = "bold 9px monospace";
        ctx.fillText("PERSON: 94%", boxX + 4, boxY - 5);
      }

      // 5. CCTV HUD Overlays (Professional Security Stamp)
      // Top Left: Camera Name + Zone
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px monospace";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
      ctx.fillText(cameraName.toUpperCase(), 12, 20);

      ctx.fillStyle = "rgba(203, 213, 225, 0.85)";
      ctx.font = "9px monospace";
      ctx.fillText(`${branchName.toUpperCase()} • ${zone.toUpperCase()}`, 12, 34);

      // Top Right: Live Rec Indicator + FPS
      ctx.fillStyle = status === "online" ? "#22c55e" : "#ef4444";
      ctx.beginPath();
      ctx.arc(width - 70, 16, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px monospace";
      ctx.fillText("LIVE • 25 FPS", width - 60, 20);

      // Bottom Left: Technical parameters
      ctx.fillStyle = "rgba(148, 163, 184, 0.85)";
      ctx.font = "9px monospace";
      ctx.fillText("1080P • H.264 • 2048 KBPS", 12, height - 12);

      // Bottom Right: Live Timestamp (IST)
      const now = new Date();
      const timeStr = now.toISOString().replace("T", " ").substring(0, 19) + " IST";
      ctx.fillStyle = "#facc15"; // Security yellow timestamp
      ctx.font = "bold 11px monospace";
      ctx.fillText(timeStr, width - 190, height - 12);

      ctx.shadowBlur = 0; // reset

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
      className={`object-cover bg-slate-950 ${className}`}
    />
  );
}
