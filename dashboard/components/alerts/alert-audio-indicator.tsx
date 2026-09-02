"use client";

import React, { useState, useEffect } from "react";
import {
  Volume2,
  VolumeX,
  AlertTriangle,
  HelpCircle,
  Speaker,
  Play,
  CheckCircle2,
  Clock,
  Radio,
} from "lucide-react";
import { alertAudioService } from "../../services/alert-audio/alert-audio.service";
import type { AlertAudioStatus, AlertSeverity } from "../../services/alert-audio/alert-audio.types";

export function AlertAudioIndicator() {
  const [status, setStatus] = useState<AlertAudioStatus>(alertAudioService.getAudioStatus());
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    return alertAudioService.onStatusChange(setStatus);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const handleTest = async (sev: AlertSeverity) => {
    setTesting(sev);
    try {
      await alertAudioService.testSeverity(sev);
    } finally {
      setTimeout(() => setTesting(null), 500);
    }
  };

  const isReady = status.state === "READY" && !status.muted;
  const isMuted = status.muted;
  const isLocked = status.state === "LOCKED";
  const isFailed = status.state === "FAILED";

  return (
    <div className="relative font-sans" ref={dropdownRef}>
      {/* Permanent Header Pill Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-all ${
          isReady
            ? "bg-emerald-950/70 border-emerald-600 text-emerald-300 hover:bg-emerald-900/80"
            : isMuted
            ? "bg-amber-950/70 border-amber-600 text-amber-300 hover:bg-amber-900/80"
            : isLocked
            ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            : "bg-rose-950/70 border-rose-600 text-rose-300 hover:bg-rose-900/80 animate-pulse"
        }`}
        title="Control Room Alert Audio Status & Controls"
      >
        {isReady ? (
          <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
        ) : isMuted ? (
          <VolumeX className="h-3.5 w-3.5 text-amber-400" />
        ) : isLocked ? (
          <VolumeX className="h-3.5 w-3.5 text-slate-400" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
        )}
        <span>AUDIO: {status.state}</span>
        {status.activeP1Count > 0 && (
          <span className="px-1 py-0.2 rounded bg-rose-600 text-white text-[10px] font-black">
            P1 × {status.activeP1Count}
          </span>
        )}
      </button>

      {/* Popover Settings Drawer */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-4 z-50 space-y-4 text-xs">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Speaker className="h-4 w-4 text-sky-400" />
              <span>Surveillance Audio Subsystem</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                isReady
                  ? "bg-emerald-500/20 text-emerald-400"
                  : isMuted
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-rose-500/20 text-rose-400"
              }`}
            >
              {status.state}
            </span>
          </div>

          {/* Volume Control */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Master Volume</span>
              <span className="font-mono text-slate-200">{(status.volume * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={status.volume}
              onChange={(e) => alertAudioService.setVolume(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
          </div>

          {/* Speaker / Routing Details */}
          <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1 text-[11px]">
            <div className="flex justify-between text-slate-400">
              <span>Output Device:</span>
              <span className="text-slate-200 font-mono">Control Room Speakers</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>AudioContext:</span>
              <span className="text-emerald-400 font-mono">{status.audioContextState ?? "suspended"}</span>
            </div>
          </div>

          {/* Severity Tone Self-Tests */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Audio Self-Test Tones
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleTest("P1")}
                disabled={testing !== null}
                className="px-2 py-1.5 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-700 text-rose-200 font-mono font-bold transition-colors text-center"
              >
                {testing === "P1" ? "Playing..." : "Test P1"}
              </button>
              <button
                onClick={() => handleTest("P2")}
                disabled={testing !== null}
                className="px-2 py-1.5 rounded bg-amber-950/60 hover:bg-amber-900 border border-amber-700 text-amber-200 font-mono font-bold transition-colors text-center"
              >
                {testing === "P2" ? "Playing..." : "Test P2"}
              </button>
              <button
                onClick={() => handleTest("P3")}
                disabled={testing !== null}
                className="px-2 py-1.5 rounded bg-sky-950/60 hover:bg-sky-900 border border-sky-700 text-sky-200 font-mono font-bold transition-colors text-center"
              >
                {testing === "P3" ? "Playing..." : "Test P3"}
              </button>
            </div>
          </div>

          {/* Actions: Enable / Temporary Silence */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            {isLocked || isFailed ? (
              <button
                onClick={() => alertAudioService.enable()}
                className="w-full py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold transition-colors text-center"
              >
                Enable Alert Audio
              </button>
            ) : (
              <div className="flex items-center gap-2 w-full">
                <button
                  onClick={() => alertAudioService.silenceTemporarily(30)}
                  className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] transition-colors"
                >
                  Silence 30s
                </button>
                <button
                  onClick={() => alertAudioService.stopAll()}
                  className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px] transition-colors"
                >
                  Stop All Audio
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
