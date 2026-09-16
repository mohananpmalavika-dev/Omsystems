"use client";

import React, { useState, useEffect } from "react";
import { Monitor, Send, CheckCircle2, AlertCircle, X, Tv } from "lucide-react";

export interface VideoWallDisplayItem {
  id: string;
  displayCode: string;
  name: string;
  resolution: string;
  location?: string;
  activeLayout: string;
  isOnline: boolean;
}

interface VideoWallDispatchModalProps {
  cameraId?: string;
  cameraName?: string;
  allCameraIds?: string[];
  isOpen: boolean;
  onClose: () => void;
  onDispatched?: () => void;
}

export function VideoWallDispatchModal({
  cameraId,
  cameraName,
  allCameraIds = [],
  isOpen,
  onClose,
  onDispatched,
}: VideoWallDispatchModalProps) {
  const [displays, setDisplays] = useState<VideoWallDisplayItem[]>([]);
  const [selectedDisplayCode, setSelectedDisplayCode] = useState<string>("");
  const [selectedLayout, setSelectedLayout] = useState<string>("grid-4");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStatusMessage(null);
    setIsLoading(true);

    const fetchDisplays = async () => {
      try {
        const res = await fetch("/api/v1/video-wall/displays");
        if (res.ok) {
          const data = await res.json();
          const list: VideoWallDisplayItem[] = data.displays || [];
          setDisplays(list);
          if (list.length > 0) {
            setSelectedDisplayCode(list[0].displayCode);
          }
        }
      } catch {
        // network error
      } finally {
        setIsLoading(false);
      }
    };

    fetchDisplays();
  }, [isOpen]);

  const handleDispatch = async () => {
    if (!selectedDisplayCode) return;
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const assignedCameras = cameraId ? [cameraId] : allCameraIds.slice(0, 16);
      const res = await fetch("/api/v1/video-wall/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayCode: selectedDisplayCode,
          layout: selectedLayout,
          assignedCameras,
          reason: `Operator dispatch from Control Room: ${cameraName || "Live Grid"}`,
        }),
      });

      if (!res.ok) {
        throw new Error(`Dispatch failed (${res.status})`);
      }

      setStatusMessage({
        type: "success",
        text: `Successfully dispatched to ${selectedDisplayCode}!`,
      });

      setTimeout(() => {
        if (onDispatched) onDispatched();
        onClose();
      }, 1200);
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "Failed to dispatch to video wall",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-750 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Dispatch to Physical Video Wall</h3>
              <p className="text-xs text-neutral-400">Push live feed to SOC monitors or display banks</p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Target Camera info */}
          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 text-xs">
            <span className="text-neutral-400">Source Stream:</span>{" "}
            <span className="font-semibold text-neutral-200">{cameraName || "Active Layout Matrix"}</span>
          </div>

          {/* Display selector */}
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
              Select Target Wall Display:
            </label>
            {isLoading ? (
              <div className="text-xs text-neutral-400 py-2">Loading display nodes...</div>
            ) : displays.length === 0 ? (
              <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-800/40 p-3 rounded-lg">
                No active physical display nodes registered. You can open a display screen at:{" "}
                <span className="font-mono text-[11px] text-white">/control-room/display-node?displayCode=WALL-01</span>
              </div>
            ) : (
              <div className="space-y-2">
                {displays.map((disp) => (
                  <label
                    key={disp.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition text-xs ${
                      selectedDisplayCode === disp.displayCode
                        ? "bg-sky-950/50 border-sky-500 text-white"
                        : "bg-neutral-950/50 border-neutral-800 text-neutral-300 hover:border-neutral-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="wallDisplay"
                        value={disp.displayCode}
                        checked={selectedDisplayCode === disp.displayCode}
                        onChange={() => setSelectedDisplayCode(disp.displayCode)}
                        className="accent-sky-500"
                      />
                      <div>
                        <div className="font-semibold">{disp.name}</div>
                        <div className="text-[11px] text-neutral-400 font-mono">
                          {disp.displayCode} • {disp.resolution}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        disp.isOnline ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50" : "bg-neutral-800 text-neutral-400"
                      }`}
                    >
                      {disp.isOnline ? "Online" : "Standby"}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Layout Target */}
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
              Matrix Layout Mode:
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: "grid-1", label: "1x1 (Spotlight)" },
                { id: "grid-4", label: "2x2 (4-Cam)" },
                { id: "grid-9", label: "3x3 (9-Cam)" },
                { id: "grid-16", label: "4x4 (16-Cam)" },
              ].map((layout) => (
                <button
                  key={layout.id}
                  type="button"
                  onClick={() => setSelectedLayout(layout.id)}
                  className={`p-2 rounded-lg border text-xs font-medium transition ${
                    selectedLayout === layout.id
                      ? "bg-sky-600 text-white border-sky-500"
                      : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                  }`}
                >
                  {layout.label}
                </button>
              ))}
            </div>
          </div>

          {statusMessage && (
            <div
              className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
                statusMessage.type === "success"
                  ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
                  : "bg-red-950/80 text-red-300 border border-red-800"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400" />
              )}
              {statusMessage.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-neutral-800 bg-neutral-950/60">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-neutral-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            onClick={handleDispatch}
            disabled={!selectedDisplayCode || isSubmitting}
            className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-lg shadow-sky-600/20"
          >
            <Send className="w-3.5 h-3.5" />
            {isSubmitting ? "Dispatching..." : "Send to Wall"}
          </button>
        </div>
      </div>
    </div>
  );
}
