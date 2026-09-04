"use client";

import React, { useEffect, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, Download, Camera, Clock, MapPin, ShieldAlert } from "lucide-react";

export interface IncidentImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string | null;
  title: string;
  cameraName?: string | null;
  branchName?: string | null;
  timestamp?: string | null;
  severity?: string | null;
  confidence?: number | null;
}

export function IncidentImageModal({
  isOpen,
  onClose,
  imageUrl,
  title,
  cameraName,
  branchName,
  timestamp,
  severity,
  confidence,
}: IncidentImageModalProps) {
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setLoading(true);
      setError(false);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, imageUrl, onClose]);

  if (!isOpen) return null;

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 3));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));
  const handleResetZoom = () => setScale(1);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/90">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-2 rounded-xl border flex-shrink-0 ${
                severity === "P1"
                  ? "bg-rose-500/20 border-rose-500/30 text-rose-400"
                  : severity === "P2"
                  ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                  : "bg-sky-500/20 border-sky-500/30 text-sky-400"
              }`}
            >
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-100 truncate flex items-center gap-2">
                <span>{title}</span>
                {severity && (
                  <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-slate-800 border border-slate-700 text-slate-300">
                    {severity}
                  </span>
                )}
                {typeof confidence === "number" && (
                  <span className="text-xs px-2 py-0.5 rounded font-mono bg-emerald-950/60 border border-emerald-700/40 text-emerald-400">
                    {Math.round(confidence > 1 ? confidence : confidence * 100)}% Match
                  </span>
                )}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-0.5">
                {(cameraName || branchName) && (
                  <span className="flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5 text-slate-500" />
                    <span>{[branchName, cameraName].filter(Boolean).join(" • ")}</span>
                  </span>
                )}
                {timestamp && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    <span>{new Date(timestamp).toLocaleString()}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {imageUrl && !error && (
              <a
                href={imageUrl}
                download={`incident-snapshot-${Date.now()}.jpg`}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors border border-slate-800"
                title="Download Snapshot"
              >
                <Download className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors border border-slate-800"
              title="Close (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Image Container with Zoom and Pan */}
        <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center p-4 min-h-[360px] max-h-[70vh]">
          {loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-500"></div>
            </div>
          )}

          {error || !imageUrl ? (
            <div className="text-center p-8 space-y-3">
              <Camera className="h-12 w-12 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-400">Snapshot image is being processed or unavailable for this event.</p>
            </div>
          ) : (
            <div
              className="transition-transform duration-100 ease-out max-h-full max-w-full flex items-center justify-center"
              style={{ transform: `scale(${scale})` }}
            >
              <img
                src={imageUrl}
                alt={title}
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  setError(true);
                }}
                className="max-h-[66vh] max-w-full object-contain rounded-lg shadow-2xl border border-slate-800/80"
              />
            </div>
          )}

          {/* Floating Zoom Control Bar */}
          {imageUrl && !error && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-700/80 text-xs shadow-xl">
              <button
                onClick={handleZoomOut}
                className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="px-2 font-mono font-semibold text-slate-300 min-w-[3rem] text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                onClick={handleResetZoom}
                className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors border-l border-slate-800 ml-1 pl-2"
                title="Reset Zoom"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Footer info banner */}
        <div className="flex items-center justify-between border-t border-slate-800/90 px-6 py-3 bg-slate-950/80 text-xs text-slate-400">
          <span>AI Preserved Visual Evidence</span>
          <span className="font-mono text-slate-500">Press ESC or click outside to close</span>
        </div>
      </div>
    </div>
  );
}
