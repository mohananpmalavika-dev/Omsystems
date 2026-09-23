"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Search, RotateCcw, Crosshair, AlertCircle, CheckCircle } from "lucide-react";

export interface RoiCoordinates {
  x1: number; // 0.0 - 1.0
  y1: number; // 0.0 - 1.0
  x2: number; // 0.0 - 1.0
  y2: number; // 0.0 - 1.0
}

export interface MotionHit {
  id: string;
  segmentId: string;
  timestampStart: string;
  timestampEnd: string;
  intensityScore: number;
}

interface RoiMotionCanvasProps {
  cameraId: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  onHitsFound?: (hits: MotionHit[]) => void;
  onSelectTimestamp?: (timestamp: string) => void;
  className?: string;
}

export function RoiMotionCanvas({
  cameraId,
  startTime,
  endTime,
  onHitsFound,
  onSelectTimestamp,
  className = "",
}: RoiMotionCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<RoiCoordinates | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hits, setHits] = useState<MotionHit[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Redraw selection box on canvas
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentBox) {
      const x = Math.min(currentBox.x1, currentBox.x2) * canvas.width;
      const y = Math.min(currentBox.y1, currentBox.y2) * canvas.height;
      const w = Math.abs(currentBox.x2 - currentBox.x1) * canvas.width;
      const h = Math.abs(currentBox.y2 - currentBox.y1) * canvas.height;

      // Darken outside ROI
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(x, y, w, h);

      // ROI bounding box border
      ctx.strokeStyle = "#38bdf8"; // Sky blue
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);

      // Corner handles
      ctx.fillStyle = "#0284c7";
      const handleSize = 6;
      ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(x + w - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(x - handleSize / 2, y + h - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(x + w - handleSize / 2, y + h - handleSize / 2, handleSize, handleSize);
    }
  }, [currentBox]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setStartPoint({ x, y });
    setIsDrawing(true);
    setCurrentBox({ x1: x, y1: y, x2: x, y2: y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    setCurrentBox({
      x1: Math.min(startPoint.x, x),
      y1: Math.min(startPoint.y, y),
      x2: Math.max(startPoint.x, x),
      y2: Math.max(startPoint.y, y),
    });
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleSearch = async () => {
    if (!currentBox) return;
    setIsSearching(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({
        cameraId,
        from: startTime,
        to: endTime,
        x1: currentBox.x1.toFixed(3),
        y1: currentBox.y1.toFixed(3),
        x2: currentBox.x2.toFixed(3),
        y2: currentBox.y2.toFixed(3),
      });

      const res = await fetch(`/api/v1/recordings/smart-motion-search?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Motion search failed (${res.status})`);
      }

      const data = await res.json();
      const results: MotionHit[] = data.hits || [];
      setHits(results);
      if (onHitsFound) {
        onHitsFound(results);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to query motion grid");
    } finally {
      setIsSearching(false);
    }
  };

  const handleReset = () => {
    setCurrentBox(null);
    setHits([]);
    setErrorMessage(null);
    if (onHitsFound) onHitsFound([]);
  };

  return (
    <div ref={containerRef} className={`relative group ${className}`}>
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        className="absolute inset-0 w-full h-full cursor-crosshair z-10"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />

      {/* Control Ribbon */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 bg-neutral-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-neutral-700 shadow-xl text-xs text-neutral-200">
        <Crosshair className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
        <span className="font-semibold text-neutral-300">ROI Motion Search</span>

        {currentBox && (
          <>
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="ml-2 flex items-center gap-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-2 py-0.5 rounded font-medium transition"
            >
              <Search className="w-3 h-3" />
              {isSearching ? "Searching..." : "Search"}
            </button>
            <button
              onClick={handleReset}
              className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition"
              title="Reset Selection"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </>
        )}
      </div>

      {/* Motion Hit Results Drawer */}
      {hits.length > 0 && (
        <div className="absolute bottom-2 left-2 right-2 z-20 bg-neutral-900/95 backdrop-blur-md p-2.5 rounded-lg border border-neutral-700 shadow-2xl max-h-36 overflow-y-auto">
          <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-neutral-800 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <CheckCircle className="w-3.5 h-3.5" />
              Found {hits.length} Motion Event{hits.length > 1 ? "s" : ""} in Selected Area
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {hits.map((hit, idx) => (
              <button
                key={hit.id || idx}
                onClick={() => onSelectTimestamp && onSelectTimestamp(hit.timestampStart)}
                className="text-left px-2 py-1 bg-neutral-800 hover:bg-sky-950/60 border border-neutral-700/60 hover:border-sky-500/50 rounded text-[11px] text-neutral-300 transition flex items-center justify-between"
              >
                <span>{new Date(hit.timestampStart).toLocaleTimeString()}</span>
                <span className="text-[10px] text-sky-400 font-mono">
                  {(hit.intensityScore * 100).toFixed(0)}%
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1.5 bg-red-950/90 text-red-300 border border-red-800 px-2.5 py-1 rounded text-xs">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{typeof errorMessage === "string" ? errorMessage : JSON.stringify(errorMessage)}</span>
        </div>
      )}
    </div>
  );
}
